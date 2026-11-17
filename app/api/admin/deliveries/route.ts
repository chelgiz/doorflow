import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { deliveryCreateSchema, deliveryListStatusSchema } from "@/lib/admin/operations-schemas";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

const deliveryInclude = {
  order: { select: { id: true, customerName: true, phone: true, address: true, status: true } },
  assignedEmployee: { select: { id: true, email: true } },
} as const;

/** Delivery schedule (step 3.1). Available to roles with operations:read. */
export async function GET(request: Request) {
  const status = deliveryListStatusSchema.safeParse(
    new URL(request.url).searchParams.get("status") ?? "all",
  );
  if (!status.success) return jsonResponse({ error: "Invalid delivery status" }, 400);
  const authorization = await authorizeAdmin("operations:read");
  if (!authorization.ok) return authorization.response;
  const deliveries = await getPrismaClient().delivery.findMany({
    where: {
      storeId: authorization.actor.storeId,
      ...(status.data === "all" ? {} : { status: status.data }),
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
    include: deliveryInclude,
  });
  return jsonResponse({ deliveries });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("operations:write");
  if (!authorization.ok) return authorization.response;
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = deliveryCreateSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid delivery", issues: z.treeifyError(parsed.error) }, 400);
  }

  const prisma = getPrismaClient();
  const order = await prisma.order.findFirst({
    where: {
      id: parsed.data.orderId,
      storeId: authorization.actor.storeId,
      status: { not: "CANCELLED" },
    },
    select: { id: true, customerName: true, phone: true, address: true },
  });
  if (!order) return jsonResponse({ error: "Active order not found" }, 404);

  if (parsed.data.assignedEmployeeId) {
    const employee = await prisma.adminUser.findFirst({
      where: {
        id: parsed.data.assignedEmployeeId,
        storeId: authorization.actor.storeId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!employee) return jsonResponse({ error: "Active employee not found" }, 422);
  }

  try {
    const created = await prisma.$transaction(async (transaction) => {
      const delivery = await transaction.delivery.create({
        data: {
          storeId: authorization.actor.storeId,
          orderId: order.id,
          assignedEmployeeId: parsed.data.assignedEmployeeId,
          createdById: authorization.actor.userId,
          scheduledAt: new Date(parsed.data.scheduledAt),
          address: parsed.data.address,
          comments: parsed.data.comments,
        },
        include: deliveryInclude,
      });
      await writeOperationAudit(
        transaction,
        authorization.actor,
        "DELIVERY",
        delivery.id,
        "CREATED",
        {
          orderId: order.id,
          scheduledAt: delivery.scheduledAt.toISOString(),
          address: delivery.address,
          assignedEmployeeId: delivery.assignedEmployeeId,
        },
      );
      return delivery;
    });
    return jsonResponse({ delivery: created }, 201);
  } catch (error) {
    return adminDatabaseError(error);
  }
}
