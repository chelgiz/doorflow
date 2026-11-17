import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { databaseIdSchema } from "@/lib/admin/schemas";
import {
  deliveryTransitions,
  deliveryUpdateSchema,
  isValidStatusTransition,
} from "@/lib/admin/operations-schemas";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };

const deliveryInclude = {
  order: { select: { id: true, customerName: true, phone: true, address: true, status: true } },
  assignedEmployee: { select: { id: true, email: true } },
} as const;

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await authorizeAdmin("operations:read");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid delivery id" }, 400);

  const prisma = getPrismaClient();
  const delivery = await prisma.delivery.findFirst({
    where: { id: parsedId.data, storeId: authorization.actor.storeId },
    include: deliveryInclude,
  });
  if (!delivery) return jsonResponse({ error: "Delivery not found" }, 404);

  const audit = await prisma.operationAudit.findMany({
    where: {
      storeId: authorization.actor.storeId,
      entityType: "DELIVERY",
      entityId: delivery.id,
    },
    orderBy: { createdAt: "asc" },
  });
  return jsonResponse({ delivery, audit });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("operations:write");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid delivery id" }, 400);

  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = deliveryUpdateSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid delivery update", issues: z.treeifyError(parsed.error) }, 400);
  }

  const prisma = getPrismaClient();
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
    const updated = await prisma.$transaction(async (transaction) => {
      const current = await transaction.delivery.findFirst({
        where: { id: parsedId.data, storeId: authorization.actor.storeId },
      });
      if (!current) return null;
      if (parsed.data.status && !isValidStatusTransition(current.status, parsed.data.status, deliveryTransitions)) {
        return "invalid-transition" as const;
      }

      const delivery = await transaction.delivery.update({
        where: { id: current.id },
        data: {
          ...(parsed.data.assignedEmployeeId !== undefined
            ? { assignedEmployeeId: parsed.data.assignedEmployeeId }
            : {}),
          ...(parsed.data.scheduledAt ? { scheduledAt: new Date(parsed.data.scheduledAt) } : {}),
          ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
          ...(parsed.data.status
            ? {
                status: parsed.data.status,
                ...(parsed.data.status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
                ...(parsed.data.status !== "DELIVERED" ? { deliveredAt: null } : {}),
              }
            : {}),
          ...(parsed.data.result !== undefined ? { result: parsed.data.result } : {}),
          ...(parsed.data.comments !== undefined ? { comments: parsed.data.comments } : {}),
        },
        include: deliveryInclude,
      });

      await writeOperationAudit(
        transaction,
        authorization.actor,
        "DELIVERY",
        current.id,
        parsed.data.status ? "UPDATED" : "DETAILS_UPDATED",
        {
          ...(parsed.data.status ? { status: { from: current.status, to: delivery.status } } : {}),
          ...(parsed.data.assignedEmployeeId !== undefined
            ? { assignedEmployeeId: { from: current.assignedEmployeeId, to: delivery.assignedEmployeeId } }
            : {}),
          ...(parsed.data.scheduledAt
            ? { scheduledAt: { from: current.scheduledAt.toISOString(), to: delivery.scheduledAt.toISOString() } }
            : {}),
          ...(parsed.data.address !== undefined
            ? { address: { from: current.address, to: delivery.address } }
            : {}),
          ...(parsed.data.result !== undefined
            ? { result: { from: current.result, to: delivery.result } }
            : {}),
        },
      );

      return delivery;
    });
    if (!updated) return jsonResponse({ error: "Delivery not found" }, 404);
    if (updated === "invalid-transition") {
      return jsonResponse({ error: "Invalid delivery status transition" }, 409);
    }
    return jsonResponse({ delivery: updated });
  } catch (error) {
    return adminDatabaseError(error);
  }
}
