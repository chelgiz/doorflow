import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError, serializeOrder } from "@/lib/admin/http";
import { orderCreateSchema, orderListStatusSchema } from "@/lib/admin/operations-schemas";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

const quoteSnapshotSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  quantity: z.number().int().min(1).max(10),
  lines: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPriceMinor: z.number().int().safe().nonnegative(),
    totalPriceMinor: z.number().int().safe().nonnegative(),
  }).passthrough()).min(1),
  totalPriceMinor: z.number().int().safe().nonnegative(),
}).passthrough();

const configurationSnapshotSchema = z.object({
  quantity: z.number().int().min(1).max(10),
  selections: z.record(z.string().uuid(), z.array(z.string().uuid())),
  services: z.record(z.string().uuid(), z.number().int().min(0).max(100)),
}).strict();

export async function GET(request: Request) {
  const authorization = await authorizeAdmin("operations:read");
  if (!authorization.ok) return authorization.response;
  const status = orderListStatusSchema.safeParse(new URL(request.url).searchParams.get("status") ?? "all");
  if (!status.success) return jsonResponse({ error: "Invalid order status" }, 400);
  const where = {
    storeId: authorization.actor.storeId,
    ...(status.data === "all" ? {} : { status: status.data }),
  };
  const orders = await getPrismaClient().order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      lead: { select: { id: true, customerName: true, phone: true } },
      manager: { select: { id: true, email: true } },
    },
  });
  return jsonResponse({ orders: orders.map(serializeOrder) });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("operations:write");
  if (!authorization.ok) return authorization.response;
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = orderCreateSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid order", issues: z.treeifyError(parsed.error) }, 400);
  }
  const actor = authorization.actor;
  if (actor.role === "MANAGER" && parsed.data.managerId && parsed.data.managerId !== actor.userId) {
    return jsonResponse({ error: "Managers may only assign orders to themselves" }, 403);
  }
  const prisma = getPrismaClient();
  const lead = await prisma.lead.findFirst({
    where: { id: parsed.data.leadId, storeId: actor.storeId },
    select: {
      id: true,
      type: true,
      customerName: true,
      phone: true,
      address: true,
      status: true,
      selectedConfiguration: true,
      quoteSnapshot: true,
    },
  });
  if (!lead || lead.type !== "ORDER") return jsonResponse({ error: "Order inquiry not found" }, 404);
  if (lead.status === "REJECTED" || lead.status === "COMPLETED") {
    return jsonResponse({ error: "Closed inquiries cannot be converted into an order" }, 409);
  }
  const quoteSnapshot = quoteSnapshotSchema.safeParse(lead.quoteSnapshot);
  const configurationSnapshot = configurationSnapshotSchema.safeParse(lead.selectedConfiguration);
  if (!quoteSnapshot.success || !configurationSnapshot.success) {
    return jsonResponse({ error: "The inquiry has no valid saved quote/configuration snapshot" }, 422);
  }
  const subtotalMinor = quoteSnapshot.data.totalPriceMinor;
  const totalMinor = subtotalMinor - parsed.data.discountMinor;
  if (totalMinor < 0 || parsed.data.prepaymentMinor > totalMinor) {
    return jsonResponse({ error: "Discount or prepayment exceeds the order amount" }, 422);
  }
  const managerId = parsed.data.managerId ?? actor.userId;
  const manager = await prisma.adminUser.findFirst({
    where: {
      id: managerId,
      storeId: actor.storeId,
      isActive: true,
      role: { in: ["OWNER", "ADMIN", "MANAGER"] },
    },
    select: { id: true },
  });
  if (!manager) return jsonResponse({ error: "Active order manager not found" }, 422);
  const savedQuoteSnapshot = {
    currency: quoteSnapshot.data.currency,
    quantity: quoteSnapshot.data.quantity,
    lines: quoteSnapshot.data.lines.map((line) => ({
      id: line.id,
      label: line.label,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      totalPriceMinor: line.totalPriceMinor,
    })),
    totalPriceMinor: quoteSnapshot.data.totalPriceMinor,
  } satisfies Prisma.InputJsonValue;

  try {
    const order = await prisma.$transaction(async (transaction) => {
      const currentLead = await transaction.lead.findFirst({
        where: { id: lead.id, storeId: actor.storeId },
        select: { id: true, type: true, status: true },
      });
      if (!currentLead || currentLead.type !== "ORDER") return null;
      if (currentLead.status === "REJECTED" || currentLead.status === "COMPLETED") {
        return "closed-inquiry" as const;
      }
      if (currentLead.status !== "SALE") {
        const statusUpdate = await transaction.lead.updateMany({
          where: {
            id: currentLead.id,
            storeId: actor.storeId,
            status: currentLead.status,
          },
          data: { status: "SALE" },
        });
        if (statusUpdate.count !== 1) return "lead-changed" as const;
      }
      const created = await transaction.order.create({
        data: {
          storeId: actor.storeId,
          leadId: lead.id,
          managerId: manager.id,
          createdById: actor.userId,
          customerName: lead.customerName,
          phone: lead.phone,
          address: lead.address,
          currency: quoteSnapshot.data.currency,
          configurationSnapshot: configurationSnapshot.data satisfies Prisma.InputJsonValue,
          sourceQuoteSnapshot: savedQuoteSnapshot,
          subtotalMinor: BigInt(subtotalMinor),
          discountMinor: BigInt(parsed.data.discountMinor),
          totalMinor: BigInt(totalMinor),
          costMinor: parsed.data.costMinor === null ? null : BigInt(parsed.data.costMinor),
          prepaymentMinor: BigInt(parsed.data.prepaymentMinor),
          balanceMinor: BigInt(totalMinor - parsed.data.prepaymentMinor),
        },
      });
      if (parsed.data.prepaymentMinor > 0) {
        await transaction.orderPayment.create({
          data: {
            orderId: created.id,
            amountMinor: BigInt(parsed.data.prepaymentMinor),
            note: "Предоплата при создании заказа",
            receivedById: actor.userId,
          },
        });
      }
      await writeOperationAudit(transaction, actor, "ORDER", created.id, "CREATED_FROM_LEAD", {
        leadId: lead.id,
        subtotalMinor,
        discountMinor: parsed.data.discountMinor,
        totalMinor,
        costMinor: parsed.data.costMinor,
        prepaymentMinor: parsed.data.prepaymentMinor,
        managerId: manager.id,
      });
      if (currentLead.status !== "SALE") {
        await transaction.leadStatusHistory.create({
          data: {
            leadId: currentLead.id,
            from: currentLead.status,
            to: "SALE",
            note: `Заказ ${created.id} создан`,
            changedById: actor.userId,
          },
        });
      }
      return created.id;
    });
    if (!order) return jsonResponse({ error: "Order inquiry not found" }, 404);
    if (order === "closed-inquiry") return jsonResponse({ error: "Closed inquiries cannot be converted into an order" }, 409);
    if (order === "lead-changed") return jsonResponse({ error: "Inquiry changed concurrently; reload and retry" }, 409);
    const savedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order },
      include: {
        lead: { select: { id: true, customerName: true, phone: true } },
        manager: { select: { id: true, email: true } },
        payments: { orderBy: { createdAt: "asc" } },
      },
    });
    return jsonResponse({ order: serializeOrder(savedOrder) }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonResponse({ error: "A sale order already exists for this inquiry" }, 409);
    }
    return adminDatabaseError(error);
  }
}
