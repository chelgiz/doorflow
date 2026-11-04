import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest, roleCan } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { databaseIdSchema } from "@/lib/admin/schemas";
import { isValidStatusTransition, measurementTransitions, measurementUpdateSchema } from "@/lib/admin/operations-schemas";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };
const includeMeasurement = {
  lead: { select: { id: true, customerName: true, phone: true, product: { select: { name: true, model: true } } } },
  assignedMeasurer: { select: { id: true, email: true } },
} as const;

async function authorizeMeasurementRead() {
  const manager = await authorizeAdmin("operations:read");
  if (manager.ok) return manager;
  const measurer = await authorizeAdmin("measurements:own");
  return measurer.ok ? measurer : manager;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await authorizeMeasurementRead();
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid measurement id" }, 400);
  const manager = roleCan(authorization.actor.role, "operations:read");
  const measurement = await getPrismaClient().measurement.findFirst({
    where: {
      id: parsedId.data,
      storeId: authorization.actor.storeId,
      ...(manager ? {} : { assignedMeasurerId: authorization.actor.userId }),
    },
    include: includeMeasurement,
  });
  if (!measurement) return jsonResponse({ error: "Measurement not found" }, 404);
  const audit = manager ? await getPrismaClient().operationAudit.findMany({
    where: { storeId: authorization.actor.storeId, entityType: "MEASUREMENT", entityId: measurement.id },
    orderBy: { createdAt: "asc" },
  }) : [];
  return jsonResponse({ measurement, audit });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const managerAuthorization = await authorizeAdmin("operations:write");
  let actor;
  if (managerAuthorization.ok) {
    actor = managerAuthorization.actor;
  } else {
    const ownAuthorization = await authorizeAdmin("measurements:own");
    if (!ownAuthorization.ok) return managerAuthorization.response;
    actor = ownAuthorization.actor;
  }
  const manager = roleCan(actor.role, "operations:write");
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid measurement id" }, 400);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = measurementUpdateSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid measurement update", issues: z.treeifyError(parsed.error) }, 400);
  }
  if (!manager && Object.keys(parsed.data).some((key) => !["status", "results", "comments"].includes(key))) {
    return jsonResponse({ error: "Measurers may only update their assigned task results" }, 403);
  }

  const prisma = getPrismaClient();
  if (manager && parsed.data.assignedMeasurerId) {
    const employee = await prisma.adminUser.findFirst({
      where: {
        id: parsed.data.assignedMeasurerId,
        storeId: actor.storeId,
        role: "MEASURER",
        isActive: true,
      },
      select: { id: true },
    });
    if (!employee) return jsonResponse({ error: "Active measurer not found" }, 422);
  }

  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const current = await transaction.measurement.findFirst({
        where: {
          id: parsedId.data,
          storeId: actor.storeId,
          ...(manager ? {} : { assignedMeasurerId: actor.userId }),
        },
      });
      if (!current) return null;
      if (parsed.data.status && !isValidStatusTransition(current.status, parsed.data.status, measurementTransitions)) {
        return "invalid-transition" as const;
      }
      const updateCount = await transaction.measurement.updateMany({
        where: {
          id: current.id,
          storeId: actor.storeId,
          status: current.status,
          ...(manager ? {} : { assignedMeasurerId: actor.userId }),
        },
        data: {
          ...(parsed.data.assignedMeasurerId !== undefined ? { assignedMeasurerId: parsed.data.assignedMeasurerId } : {}),
          ...(parsed.data.scheduledAt ? { scheduledAt: new Date(parsed.data.scheduledAt) } : {}),
          ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
          ...(parsed.data.status ? {
            status: parsed.data.status,
            ...(parsed.data.status === "COMPLETED" ? { completedAt: new Date() } : {}),
          } : {}),
          ...(parsed.data.results ? { results: parsed.data.results } : {}),
          ...(parsed.data.comments !== undefined ? { comments: parsed.data.comments } : {}),
        },
      });
      if (updateCount.count !== 1) return "conflict" as const;
      const next = await transaction.measurement.findUniqueOrThrow({
        where: { id: current.id },
        include: includeMeasurement,
      });
      const changes = {
        ...(parsed.data.assignedMeasurerId !== undefined ? { assignedMeasurerId: { from: current.assignedMeasurerId, to: next.assignedMeasurerId } } : {}),
        ...(parsed.data.scheduledAt ? { scheduledAt: { from: current.scheduledAt.toISOString(), to: next.scheduledAt.toISOString() } } : {}),
        ...(parsed.data.address !== undefined ? { address: { from: current.address, to: next.address } } : {}),
        ...(parsed.data.status ? { status: { from: current.status, to: next.status } } : {}),
        ...(parsed.data.results ? { results: parsed.data.results } : {}),
        ...(parsed.data.comments !== undefined ? { comments: { from: current.comments, to: next.comments } } : {}),
      };
      await writeOperationAudit(transaction, actor, "MEASUREMENT", current.id, parsed.data.status ? "UPDATED" : "DETAILS_UPDATED", changes);
      if (parsed.data.status === "COMPLETED") {
        const lead = await transaction.lead.findFirst({
          where: { id: current.leadId, storeId: actor.storeId, type: "MEASUREMENT", status: "MEASUREMENT_SCHEDULED" },
          select: { id: true, status: true },
        });
        if (lead) {
          const statusUpdate = await transaction.lead.updateMany({
            where: { id: lead.id, storeId: actor.storeId, status: lead.status },
            data: { status: "MEASURED" },
          });
          if (statusUpdate.count === 1) {
            await transaction.leadStatusHistory.create({
              data: {
                leadId: lead.id,
                from: lead.status,
                to: "MEASURED",
                note: "Результаты замера сохранены",
                changedById: actor.userId,
              },
            });
          }
        }
      }
      return next;
    });
    if (!updated) return jsonResponse({ error: "Measurement not found" }, 404);
    if (updated === "invalid-transition") return jsonResponse({ error: "Invalid measurement status transition" }, 409);
    if (updated === "conflict") return jsonResponse({ error: "Measurement changed concurrently; reload and retry" }, 409);
    return jsonResponse({ measurement: updated });
  } catch (error) {
    return adminDatabaseError(error);
  }
}
