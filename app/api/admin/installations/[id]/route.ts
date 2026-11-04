import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest, roleCan } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { databaseIdSchema } from "@/lib/admin/schemas";
import { installationTransitions, installationUpdateSchema, isValidStatusTransition } from "@/lib/admin/operations-schemas";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };
const installationInclude = {
  order: { select: { id: true, customerName: true, phone: true, address: true, configurationSnapshot: true } },
  assignedInstaller: { select: { id: true, email: true } },
} as const;

async function authorizeInstallationRead() {
  const manager = await authorizeAdmin("operations:read");
  if (manager.ok) return manager;
  const installer = await authorizeAdmin("installations:own");
  return installer.ok ? installer : manager;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await authorizeInstallationRead();
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid installation id" }, 400);
  const manager = roleCan(authorization.actor.role, "operations:read");
  const installation = await getPrismaClient().installation.findFirst({
    where: {
      id: parsedId.data,
      storeId: authorization.actor.storeId,
      ...(manager ? {} : { assignedInstallerId: authorization.actor.userId }),
    },
    include: installationInclude,
  });
  if (!installation) return jsonResponse({ error: "Installation not found" }, 404);
  const audit = manager ? await getPrismaClient().operationAudit.findMany({
    where: { storeId: authorization.actor.storeId, entityType: "INSTALLATION", entityId: installation.id },
    orderBy: { createdAt: "asc" },
  }) : [];
  return jsonResponse({ installation, audit });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const managerAuthorization = await authorizeAdmin("operations:write");
  let actor;
  if (managerAuthorization.ok) {
    actor = managerAuthorization.actor;
  } else {
    const ownAuthorization = await authorizeAdmin("installations:own");
    if (!ownAuthorization.ok) return managerAuthorization.response;
    actor = ownAuthorization.actor;
  }
  const manager = roleCan(actor.role, "operations:write");
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid installation id" }, 400);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = installationUpdateSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid installation update", issues: z.treeifyError(parsed.error) }, 400);
  }
  if (!manager && Object.keys(parsed.data).some((key) => !["status", "result", "comments"].includes(key))) {
    return jsonResponse({ error: "Installers may only update their assigned job result" }, 403);
  }
  const prisma = getPrismaClient();
  if (manager && parsed.data.assignedInstallerId) {
    const employee = await prisma.adminUser.findFirst({
      where: {
        id: parsed.data.assignedInstallerId,
        storeId: actor.storeId,
        role: "INSTALLER",
        isActive: true,
      },
      select: { id: true },
    });
    if (!employee) return jsonResponse({ error: "Active installer not found" }, 422);
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.installation.findFirst({
        where: {
          id: parsedId.data,
          storeId: actor.storeId,
          ...(manager ? {} : { assignedInstallerId: actor.userId }),
        },
      });
      if (!current) return null;
      if (parsed.data.status && !isValidStatusTransition(current.status, parsed.data.status, installationTransitions)) {
        return "invalid-transition" as const;
      }
      const changed = await transaction.installation.updateMany({
        where: {
          id: current.id,
          storeId: actor.storeId,
          status: current.status,
          ...(manager ? {} : { assignedInstallerId: actor.userId }),
        },
        data: {
          ...(parsed.data.assignedInstallerId !== undefined ? { assignedInstallerId: parsed.data.assignedInstallerId } : {}),
          ...(parsed.data.scheduledAt ? { scheduledAt: new Date(parsed.data.scheduledAt) } : {}),
          ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
          ...(parsed.data.status ? {
            status: parsed.data.status,
            ...(parsed.data.status === "COMPLETED" ? { completedAt: new Date() } : {}),
          } : {}),
          ...(parsed.data.result !== undefined ? { result: parsed.data.result } : {}),
          ...(parsed.data.comments !== undefined ? { comments: parsed.data.comments } : {}),
        },
      });
      if (changed.count !== 1) return "conflict" as const;
      const next = await transaction.installation.findUniqueOrThrow({
        where: { id: current.id },
        include: installationInclude,
      });
      await writeOperationAudit(transaction, actor, "INSTALLATION", current.id, parsed.data.status ? "UPDATED" : "DETAILS_UPDATED", {
        ...(parsed.data.assignedInstallerId !== undefined ? { assignedInstallerId: { from: current.assignedInstallerId, to: next.assignedInstallerId } } : {}),
        ...(parsed.data.scheduledAt ? { scheduledAt: { from: current.scheduledAt.toISOString(), to: next.scheduledAt.toISOString() } } : {}),
        ...(parsed.data.address !== undefined ? { address: { from: current.address, to: next.address } } : {}),
        ...(parsed.data.status ? { status: { from: current.status, to: next.status } } : {}),
        ...(parsed.data.result !== undefined ? { result: { from: current.result, to: next.result } } : {}),
        ...(parsed.data.comments !== undefined ? { comments: { from: current.comments, to: next.comments } } : {}),
      });
      if (parsed.data.status === "COMPLETED") {
        const order = await transaction.order.findFirst({
          where: { id: current.orderId, storeId: actor.storeId },
          select: { leadId: true },
        });
        if (order) {
          const lead = await transaction.lead.findFirst({
            where: { id: order.leadId, storeId: actor.storeId, status: "SALE" },
            select: { id: true, status: true },
          });
          if (lead) {
            const statusUpdate = await transaction.lead.updateMany({
              where: { id: lead.id, storeId: actor.storeId, status: lead.status },
              data: { status: "COMPLETED" },
            });
            if (statusUpdate.count === 1) {
              await transaction.leadStatusHistory.create({
                data: {
                  leadId: lead.id,
                  from: lead.status,
                  to: "COMPLETED",
                  note: "Установка завершена",
                  changedById: actor.userId,
                },
              });
            }
          }
        }
      }
      return next;
    });
    if (!result) return jsonResponse({ error: "Installation not found" }, 404);
    if (result === "invalid-transition") return jsonResponse({ error: "Invalid installation status transition" }, 409);
    if (result === "conflict") return jsonResponse({ error: "Installation changed concurrently; reload and retry" }, 409);
    return jsonResponse({ installation: result });
  } catch (error) {
    return adminDatabaseError(error);
  }
}
