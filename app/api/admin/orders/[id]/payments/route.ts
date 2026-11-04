import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError, serializeOrder, toSafeMinorUnits } from "@/lib/admin/http";
import { databaseIdSchema } from "@/lib/admin/schemas";
import { orderPaymentSchema } from "@/lib/admin/operations-schemas";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("operations:write");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid order id" }, 400);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = orderPaymentSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid payment", issues: z.treeifyError(parsed.error) }, 400);
  }
  const rawIdempotencyKey = request.headers.get("idempotency-key");
  const parsedIdempotencyKey = rawIdempotencyKey
    ? z.uuid().safeParse(rawIdempotencyKey)
    : null;
  if (parsedIdempotencyKey && !parsedIdempotencyKey.success) {
    return jsonResponse({ error: "Invalid idempotency key" }, 400);
  }
  const idempotencyHash = parsedIdempotencyKey
    ? createHash("sha256")
        .update(JSON.stringify({
          orderId: parsedId.data,
          amountMinor: parsed.data.amountMinor,
          note: parsed.data.note ?? null,
        }))
        .digest("hex")
    : null;
  try {
    const prisma = getPrismaClient();
    let result: { paymentId: string; orderId: string } | "invalid-amount" | "idempotency-conflict" | null;
    try {
      result = await prisma.$transaction(async (transaction) => {
      if (parsedIdempotencyKey?.success) {
        const existingPayment = await transaction.orderPayment.findUnique({
          where: { idempotencyKey: parsedIdempotencyKey.data },
          select: { id: true, orderId: true, idempotencyHash: true },
        });
        if (existingPayment) {
          return existingPayment.orderId === parsedId.data &&
              existingPayment.idempotencyHash === idempotencyHash
            ? { paymentId: existingPayment.id, orderId: existingPayment.orderId }
            : "idempotency-conflict" as const;
        }
      }
      const current = await transaction.order.findFirst({
        where: { id: parsedId.data, storeId: authorization.actor.storeId },
        select: { id: true, status: true, balanceMinor: true },
      });
      if (!current) return null;
      if (current.status === "CANCELLED" || current.balanceMinor < BigInt(parsed.data.amountMinor)) {
        return "invalid-amount" as const;
      }
      const changed = await transaction.order.updateMany({
        where: {
          id: current.id,
          storeId: authorization.actor.storeId,
          balanceMinor: { gte: BigInt(parsed.data.amountMinor) },
          status: { not: "CANCELLED" },
        },
        data: {
          prepaymentMinor: { increment: BigInt(parsed.data.amountMinor) },
          balanceMinor: { decrement: BigInt(parsed.data.amountMinor) },
        },
      });
      if (changed.count !== 1) return "invalid-amount" as const;
      const payment = await transaction.orderPayment.create({
        data: {
          orderId: current.id,
          amountMinor: BigInt(parsed.data.amountMinor),
          note: parsed.data.note,
          receivedById: authorization.actor.userId,
          ...(parsedIdempotencyKey?.success
            ? {
                idempotencyKey: parsedIdempotencyKey.data,
                idempotencyHash,
              }
            : {}),
        },
      });
      await writeOperationAudit(transaction, authorization.actor, "ORDER", current.id, "PAYMENT_RECEIVED", {
        amountMinor: parsed.data.amountMinor,
        previousBalanceMinor: toSafeMinorUnits(current.balanceMinor, "Order balance"),
        balanceMinor: toSafeMinorUnits(current.balanceMinor - BigInt(parsed.data.amountMinor), "Order balance"),
        note: parsed.data.note ?? null,
      });
      return { paymentId: payment.id, orderId: current.id };
      });
    } catch (error) {
      if (
        !parsedIdempotencyKey?.success ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }
      const existingPayment = await prisma.orderPayment.findUnique({
        where: { idempotencyKey: parsedIdempotencyKey.data },
        select: { id: true, orderId: true, idempotencyHash: true },
      });
      result = existingPayment &&
          existingPayment.orderId === parsedId.data &&
          existingPayment.idempotencyHash === idempotencyHash
        ? { paymentId: existingPayment.id, orderId: existingPayment.orderId }
        : "idempotency-conflict";
    }
    if (!result) return jsonResponse({ error: "Order not found" }, 404);
    if (result === "invalid-amount") {
      return jsonResponse({ error: "Payment exceeds the outstanding balance or the order is cancelled" }, 422);
    }
    if (result === "idempotency-conflict") {
      return jsonResponse({ error: "Idempotency key was already used for a different payment" }, 409);
    }
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: result.orderId },
      include: {
        lead: { select: { id: true, customerName: true, phone: true } },
        manager: { select: { id: true, email: true } },
        payments: {
          orderBy: { createdAt: "asc" },
          include: { receivedBy: { select: { email: true } } },
        },
      },
    });
    const payment = order.payments.find(({ id }) => id === result.paymentId);
    if (!payment) throw new Error("Committed order payment is missing from its order");
    return jsonResponse({
      payment: {
        ...payment,
        amountMinor: toSafeMinorUnits(payment.amountMinor, "Payment amount"),
      },
      order: serializeOrder(order),
    }, 201);
  } catch (error) {
    return adminDatabaseError(error);
  }
}
