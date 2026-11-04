import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError, serializeOrder } from "@/lib/admin/http";
import { databaseIdSchema } from "@/lib/admin/schemas";
import { isValidStatusTransition, orderTransitions, orderUpdateSchema } from "@/lib/admin/operations-schemas";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await authorizeAdmin("operations:read");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid order id" }, 400);
  const prisma = getPrismaClient();
  const order = await prisma.order.findFirst({
    where: { id: parsedId.data, storeId: authorization.actor.storeId },
    include: {
      lead: { select: { id: true, customerName: true, phone: true, address: true } },
      manager: { select: { id: true, email: true } },
      payments: { orderBy: { createdAt: "asc" }, include: { receivedBy: { select: { email: true } } } },
      installation: { include: { assignedInstaller: { select: { id: true, email: true } } } },
    },
  });
  if (!order) return jsonResponse({ error: "Order not found" }, 404);
  const audit = await prisma.operationAudit.findMany({
    where: { storeId: authorization.actor.storeId, entityType: "ORDER", entityId: order.id },
    orderBy: { createdAt: "asc" },
  });
  return jsonResponse({ order: serializeOrder(order), audit });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("operations:write");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid order id" }, 400);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = orderUpdateSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid order update", issues: z.treeifyError(parsed.error) }, 400);
  }
  const actor = authorization.actor;
  try {
    const result = await getPrismaClient().$transaction(async (transaction) => {
      const current = await transaction.order.findFirst({
        where: { id: parsedId.data, storeId: actor.storeId },
      });
      if (!current) return null;
      if (!isValidStatusTransition(current.status, parsed.data.status, orderTransitions)) {
        return "invalid-transition" as const;
      }
      const changed = await transaction.order.updateMany({
        where: {
          id: current.id,
          storeId: actor.storeId,
          status: current.status,
        },
        data: { status: parsed.data.status },
      });
      if (changed.count !== 1) return "conflict" as const;
      await writeOperationAudit(transaction, actor, "ORDER", current.id, "STATUS_CHANGED", {
        from: current.status,
        to: parsed.data.status,
      });
      return current.id;
    });
    if (!result) return jsonResponse({ error: "Order not found" }, 404);
    if (result === "invalid-transition") return jsonResponse({ error: "Invalid order status transition" }, 409);
    if (result === "conflict") return jsonResponse({ error: "Order changed concurrently; reload and retry" }, 409);
    const updatedOrder = await getPrismaClient().order.findUniqueOrThrow({
      where: { id: result },
      include: {
        lead: { select: { id: true, customerName: true, phone: true } },
        manager: { select: { id: true, email: true } },
        payments: true,
      },
    });
    return jsonResponse({ order: serializeOrder(updatedOrder) });
  } catch (error) {
    return adminDatabaseError(error);
  }
}
