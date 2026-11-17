import { z } from "zod";
import { authorizeAdmin, leadVisibilityFilter } from "@/lib/admin/auth";
import { FIRST_CONTACT_SLA_MS, isFirstContactOverdue } from "@/lib/admin/lead-sla";
import { CLOSED_LEAD_STATUSES, isActionOverdue } from "@/lib/admin/lead-actions";
import { FOLLOW_UP_AFTER_MS, needsFollowUp } from "@/lib/admin/lead-followup";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/http/json";
import { LeadStatus } from "@/generated/prisma/client";

const leadStatuses = Object.values(LeadStatus);
const PAGE_SIZE = 30;

const leadSelect = {
  id: true,
  type: true,
  status: true,
  customerName: true,
  phone: true,
  address: true,
  source: true,
  utmSource: true,
  assignedManager: { select: { id: true, email: true } },
  firstContactAt: true,
  nextActionAt: true,
  rejectionReason: true,
  createdAt: true,
  product: { select: { name: true, model: true, slug: true } },
} as const;

export async function GET(request: Request) {
  const authorization = await authorizeAdmin("leads:read");
  if (!authorization.ok) return authorization.response;

  const url = new URL(request.url);
  const search = z.string().trim().max(100).safeParse(url.searchParams.get("q") ?? "");
  const status = z.enum(leadStatuses).or(z.literal("all"))
    .safeParse(url.searchParams.get("status") ?? "all");
  const page = z.coerce.number().int().min(1).max(10_000)
    .safeParse(url.searchParams.get("page") ?? "1");
  const sla = z.enum(["all", "first-contact-overdue", "action-overdue", "follow-up-due"])
    .safeParse(url.searchParams.get("sla") ?? "all");
  if (!search.success || !status.success || !page.success || !sla.success) {
    return jsonResponse({ error: "Invalid lead filters" }, 400);
  }

  const baseWhere = {
    storeId: authorization.actor.storeId,
    ...leadVisibilityFilter(authorization.actor),
    ...(sla.data === "first-contact-overdue"
      ? {
          firstContactAt: null,
          createdAt: { lt: new Date(Date.now() - FIRST_CONTACT_SLA_MS) },
          status: { notIn: [...CLOSED_LEAD_STATUSES] as never },
        }
      : {}),
    ...(sla.data === "action-overdue"
      ? { nextActionAt: { lt: new Date() }, status: { notIn: [...CLOSED_LEAD_STATUSES] as never } }
      : {}),
    ...(sla.data === "follow-up-due"
      ? {
          firstContactAt: { lte: new Date(Date.now() - FOLLOW_UP_AFTER_MS) },
          status: { notIn: [...CLOSED_LEAD_STATUSES] as never },
        }
      : {}),
    ...(status.data === "all" ? {} : { status: status.data }),
    ...(search.data
      ? {
          OR: [
            { customerName: { contains: search.data, mode: "insensitive" as const } },
            { phone: { contains: search.data } },
            { source: { contains: search.data, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const prisma = getPrismaClient();
  const now = new Date();

  // The follow-up rule depends on the last status change, so those rows are
  // filtered in memory; the candidate set is already narrow (3+ days old,
  // open, contacted).
  const rows = await prisma.lead.findMany({
    where: baseWhere,
    orderBy: { createdAt: "desc" },
    ...(sla.data === "follow-up-due" ? {} : { skip: (page.data - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    select: leadSelect,
  });

  const historyRows = rows.length
    ? await prisma.leadStatusHistory.groupBy({
        by: ["leadId"],
        where: { leadId: { in: rows.map((row) => row.id) } },
        _max: { changedAt: true },
      })
    : [];
  const lastChangeByLead = new Map(
    historyRows.map((row) => [row.leadId, row._max.changedAt ?? null]),
  );

  const decorated = rows.map((lead) => {
    const lastStatusChangeAt = lastChangeByLead.get(lead.id) ?? null;
    return {
      ...lead,
      firstContactOverdue: isFirstContactOverdue(lead, now),
      actionOverdue: isActionOverdue(lead, now),
      followUpDue: needsFollowUp({ ...lead, lastStatusChangeAt }, now),
    };
  });

  if (sla.data === "follow-up-due") {
    const due = decorated.filter((lead) => lead.followUpDue);
    const start = (page.data - 1) * PAGE_SIZE;
    return jsonResponse({
      leads: due.slice(start, start + PAGE_SIZE),
      total: due.length,
      page: page.data,
      pageSize: PAGE_SIZE,
    });
  }

  const total = await prisma.lead.count({ where: baseWhere });
  return jsonResponse({ leads: decorated, total, page: page.data, pageSize: PAGE_SIZE });
}
