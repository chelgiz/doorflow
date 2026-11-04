import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest, roleCan } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { installationCreateSchema, installationListStatusSchema } from "@/lib/admin/operations-schemas";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

export async function GET(request: Request) {
  const status = installationListStatusSchema.safeParse(new URL(request.url).searchParams.get("status") ?? "all");
  if (!status.success) return jsonResponse({ error: "Invalid installation status" }, 400);
  const authorization = await authorizeAdmin("operations:read");
  let actor;
  if (authorization.ok) {
    actor = authorization.actor;
  } else {
    const ownAuthorization = await authorizeAdmin("installations:own");
    if (!ownAuthorization.ok) return authorization.response;
    actor = ownAuthorization.actor;
  }
  const manager = roleCan(actor.role, "operations:read");
  const installations = await getPrismaClient().installation.findMany({
    where: {
      storeId: actor.storeId,
      ...(manager ? {} : { assignedInstallerId: actor.userId }),
      ...(status.data === "all" ? {} : { status: status.data }),
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
    include: {
      order: { select: { id: true, customerName: true, phone: true, address: true, configurationSnapshot: true } },
      assignedInstaller: { select: { id: true, email: true } },
    },
  });
  return jsonResponse({ installations });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("operations:write");
  if (!authorization.ok) return authorization.response;
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = installationCreateSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid installation", issues: z.treeifyError(parsed.error) }, 400);
  }
  const prisma = getPrismaClient();
  const order = await prisma.order.findFirst({
    where: { id: parsed.data.orderId, storeId: authorization.actor.storeId, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  if (!order) return jsonResponse({ error: "Active order not found" }, 404);
  if (parsed.data.assignedInstallerId) {
    const employee = await prisma.adminUser.findFirst({
      where: {
        id: parsed.data.assignedInstallerId,
        storeId: authorization.actor.storeId,
        role: "INSTALLER",
        isActive: true,
      },
      select: { id: true },
    });
    if (!employee) return jsonResponse({ error: "Active installer not found" }, 422);
  }
  try {
    const installation = await prisma.$transaction(async (transaction) => {
      const created = await transaction.installation.create({
        data: {
          ...parsed.data,
          scheduledAt: new Date(parsed.data.scheduledAt),
          storeId: authorization.actor.storeId,
          createdById: authorization.actor.userId,
        },
        include: {
          order: { select: { id: true, customerName: true, phone: true, address: true, configurationSnapshot: true } },
          assignedInstaller: { select: { id: true, email: true } },
        },
      });
      await writeOperationAudit(transaction, authorization.actor, "INSTALLATION", created.id, "CREATED", {
        orderId: created.orderId,
        scheduledAt: created.scheduledAt.toISOString(),
        address: created.address,
        assignedInstallerId: created.assignedInstallerId,
      });
      return created;
    });
    return jsonResponse({ installation }, 201);
  } catch (error) {
    return adminDatabaseError(error);
  }
}
