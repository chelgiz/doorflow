import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest, roleCan } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { databaseIdSchema } from "@/lib/admin/schemas";
import { measurementCreateSchema, measurementListStatusSchema } from "@/lib/admin/operations-schemas";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

export async function GET(request: Request) {
  const requestedStatus = new URL(request.url).searchParams.get("status") ?? "all";
  const status = measurementListStatusSchema.safeParse(requestedStatus);
  if (!status.success) return jsonResponse({ error: "Invalid measurement status" }, 400);
  const authorization = await authorizeAdmin("operations:read");
  let scopedActor;
  if (authorization.ok) {
    scopedActor = authorization.actor;
  } else {
    const ownAuthorization = await authorizeAdmin("measurements:own");
    if (!ownAuthorization.ok) return authorization.response;
    scopedActor = ownAuthorization.actor;
  }
  const isManager = roleCan(scopedActor.role, "operations:read");
  const measurements = await getPrismaClient().measurement.findMany({
    where: {
      storeId: scopedActor.storeId,
      ...(isManager ? {} : { assignedMeasurerId: scopedActor.userId }),
      ...(status.data === "all" ? {} : { status: status.data }),
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
    include: {
      lead: { select: { id: true, customerName: true, phone: true, product: { select: { name: true, model: true } } } },
      assignedMeasurer: { select: { id: true, email: true } },
    },
  });
  return jsonResponse({ measurements });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("operations:write");
  if (!authorization.ok) return authorization.response;
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = measurementCreateSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid measurement", issues: z.treeifyError(parsed.error) }, 400);
  }
  const prisma = getPrismaClient();
  const leadId = databaseIdSchema.parse(parsed.data.leadId);
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, storeId: authorization.actor.storeId },
    select: { id: true, type: true, status: true },
  });
  if (!lead) return jsonResponse({ error: "Lead not found" }, 404);
  if (parsed.data.assignedMeasurerId) {
    const employee = await prisma.adminUser.findFirst({
      where: {
        id: parsed.data.assignedMeasurerId,
        storeId: authorization.actor.storeId,
        role: "MEASURER",
        isActive: true,
      },
      select: { id: true },
    });
    if (!employee) return jsonResponse({ error: "Active measurer not found" }, 422);
  }
  try {
    const measurement = await prisma.$transaction(async (transaction) => {
      const currentLead = await transaction.lead.findFirst({
        where: { id: lead.id, storeId: authorization.actor.storeId },
        select: { id: true, type: true, status: true },
      });
      if (!currentLead) return null;
      if (
        currentLead.type === "MEASUREMENT" &&
        ["NEW", "IN_PROGRESS", "CONTACTED"].includes(currentLead.status)
      ) {
        const statusUpdate = await transaction.lead.updateMany({
          where: {
            id: currentLead.id,
            storeId: authorization.actor.storeId,
            status: currentLead.status,
          },
          data: { status: "MEASUREMENT_SCHEDULED" },
        });
        if (statusUpdate.count !== 1) return "lead-changed" as const;
        await transaction.leadStatusHistory.create({
          data: {
            leadId: currentLead.id,
            from: currentLead.status,
            to: "MEASUREMENT_SCHEDULED",
            note: "Замер запланирован",
            changedById: authorization.actor.userId,
          },
        });
      }
      const created = await transaction.measurement.create({
        data: {
          ...parsed.data,
          scheduledAt: new Date(parsed.data.scheduledAt),
          storeId: authorization.actor.storeId,
          createdById: authorization.actor.userId,
        },
        include: {
          lead: { select: { id: true, customerName: true, phone: true } },
          assignedMeasurer: { select: { id: true, email: true } },
        },
      });
      await writeOperationAudit(transaction, authorization.actor, "MEASUREMENT", created.id, "CREATED", {
        scheduledAt: created.scheduledAt.toISOString(),
        address: created.address,
        assignedMeasurerId: created.assignedMeasurerId,
      });
      return created;
    });
    if (!measurement) return jsonResponse({ error: "Lead not found" }, 404);
    if (measurement === "lead-changed") {
      return jsonResponse({ error: "Inquiry changed concurrently; reload and retry" }, 409);
    }
    return jsonResponse({ measurement }, 201);
  } catch (error) {
    return adminDatabaseError(error);
  }
}
