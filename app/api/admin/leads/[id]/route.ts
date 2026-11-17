import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest, leadVisibilityFilter } from "@/lib/admin/auth";
import { adminDatabaseError, toSafeMinorUnits } from "@/lib/admin/http";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";
import { LeadStatus } from "@/generated/prisma/client";
import { databaseIdSchema } from "@/lib/admin/schemas";
import { getCustomerHistory } from "@/lib/admin/customer-history";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { rejectionReasonLabel } from "@/lib/admin/rejection-reasons";
import { RejectionReason } from "@/generated/prisma/client";

type RouteContext = { params: Promise<{ id: string }> };
const statusSchema = z.object({
  status: z.enum(Object.values(LeadStatus)),
  note: z.string().trim().max(500).optional(),
  rejectionReason: z.enum(Object.values(RejectionReason)).optional(),
}).strict();

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await authorizeAdmin("leads:read");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid lead id" }, 400);
  const lead = await getPrismaClient().lead.findFirst({
    where: {
      id: parsedId.data,
      storeId: authorization.actor.storeId,
      ...leadVisibilityFilter(authorization.actor),
    },
    include: {
      product: { select: { id: true, name: true, model: true, slug: true } },
      statusHistory: {
        orderBy: { changedAt: "asc" },
        include: { changedBy: { select: { id: true, email: true, role: true } } },
      },
      customerActivities: {
        orderBy: { createdAt: "asc" },
        include: { createdBy: { select: { id: true, email: true, role: true } } },
      },
      measurements: {
        orderBy: { scheduledAt: "desc" },
        include: { assignedMeasurer: { select: { id: true, email: true } } },
      },
      order: {
        select: { id: true, status: true, totalMinor: true, currency: true },
      },
    },
  });
  if (!lead) return jsonResponse({ error: "Lead not found" }, 404);
  const customerHistory = await getCustomerHistory(authorization.actor.storeId, lead.phone);
  return jsonResponse({
    lead: {
      ...lead,
      order: lead.order
        ? { ...lead.order, totalMinor: toSafeMinorUnits(lead.order.totalMinor, "Order total") }
        : null,
    },
    customerHistory,
  });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("leads:write");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid lead id" }, 400);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = statusSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid lead status", issues: z.treeifyError(parsed.error) }, 400);
  }
  const rejecting = parsed.data.status === "REJECTED";
  if (rejecting && !parsed.data.rejectionReason) {
    return jsonResponse({ error: "Rejection reason is required for REJECTED status" }, 400);
  }
  if (!rejecting && parsed.data.rejectionReason) {
    return jsonResponse({ error: "Rejection reason is only allowed for REJECTED status" }, 400);
  }

  const prisma = getPrismaClient();
  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const current = await transaction.lead.findFirst({
        where: {
          id: parsedId.data,
          storeId: authorization.actor.storeId,
          ...leadVisibilityFilter(authorization.actor),
        },
        select: { id: true, status: true },
      });
      if (!current) return null;
      if (current.status === parsed.data.status) {
        return transaction.lead.findUniqueOrThrow({ where: { id: current.id } });
      }

      const rejectionReason = rejecting ? parsed.data.rejectionReason ?? null : null;
      const changed = await transaction.lead.updateMany({
        where: { id: current.id, storeId: authorization.actor.storeId, status: current.status },
        data: { status: parsed.data.status, rejectionReason },
      });
      if (changed.count !== 1) return "conflict" as const;
      const historyNote = rejecting
        ? `Причина отказа: ${rejectionReasonLabel(rejectionReason ?? "")}${parsed.data.note ? ` · ${parsed.data.note}` : ""}`
        : parsed.data.note;
      await transaction.leadStatusHistory.create({
        data: {
          leadId: current.id,
          from: current.status,
          to: parsed.data.status,
          note: historyNote,
          changedById: authorization.actor.userId,
        },
      });
      if (rejecting) {
        await writeOperationAudit(transaction, authorization.actor, "LEAD", current.id, "REJECTED", {
          status: { from: current.status, to: parsed.data.status },
          rejectionReason: { from: null, to: rejectionReason },
          note: parsed.data.note ?? null,
        });
      }
      return transaction.lead.findUniqueOrThrow({ where: { id: current.id } });
    });
    if (!updated) return jsonResponse({ error: "Lead not found" }, 404);
    if (updated === "conflict") {
      return jsonResponse({ error: "Inquiry changed concurrently; reload and retry" }, 409);
    }
    return jsonResponse({ lead: updated });
  } catch (error) {
    return adminDatabaseError(error);
  }
}
