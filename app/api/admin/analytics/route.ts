import { z } from "zod";
import { authorizeAdmin, leadVisibilityFilter } from "@/lib/admin/auth";
import { CLOSED_LEAD_STATUSES } from "@/lib/admin/lead-actions";
import { needsFollowUp } from "@/lib/admin/lead-followup";
import { FIRST_CONTACT_SLA_MS, isFirstContactOverdue } from "@/lib/admin/lead-sla";
import { REJECTION_REASON_CODES } from "@/lib/admin/rejection-reasons";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/http/json";

const DAY_MS = 86_400_000;
const periodSchema = z.enum(["today", "7d", "30d", "all"]);

function periodStart(period: z.infer<typeof periodSchema>, now: Date): Date | null {
  if (period === "all") return null;
  if (period === "today") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * DAY_MS);
}

type LeadRow = {
  id: string;
  type: string;
  status: string;
  assignedManagerId: string | null;
  firstContactAt: Date | null;
  createdAt: Date;
  nextActionAt: Date | null;
  assignedManager: { id: string; email: string } | null;
  order: { id: string } | null;
};

function contactStats(leads: LeadRow[]) {
  const contacted = leads.filter((lead) => lead.firstContactAt !== null);
  const minutes = contacted.map(
    (lead) => (lead.firstContactAt!.getTime() - lead.createdAt.getTime()) / 60_000,
  );
  const sorted = [...minutes].sort((a, b) => a - b);
  const withinSla = minutes.filter((value) => value <= FIRST_CONTACT_SLA_MS / 60_000).length;
  return {
    withContact: contacted.length,
    avgMinutes: minutes.length
      ? Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length)
      : null,
    medianMinutes: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null,
    withinSla,
    withinSlaPercent: contacted.length ? Math.round((withinSla / contacted.length) * 100) : null,
  };
}

function conversionStats(leads: LeadRow[]) {
  const orderLeads = leads.filter((lead) => lead.type === "ORDER");
  const orderConverted = orderLeads.filter((lead) => lead.order !== null).length;
  const allConverted = leads.filter((lead) => lead.order !== null).length;
  return {
    orderLeads: orderLeads.length,
    orderConverted,
    orderConversionPercent: orderLeads.length
      ? Math.round((orderConverted / orderLeads.length) * 100)
      : null,
    allLeads: leads.length,
    allConverted,
    allConversionPercent: leads.length ? Math.round((allConverted / leads.length) * 100) : null,
  };
}

/**
 * Store analytics for the admin (step 6).
 *
 * Roles: OWNER/ADMIN see the whole store including unassigned leads; MANAGER
 * sees only their own leads and related money. Period filters lead/order dates;
 * the discipline block is a point-in-time snapshot and ignores the period.
 */
export async function GET(request: Request) {
  const authorization = await authorizeAdmin("operations:read");
  if (!authorization.ok) return authorization.response;
  const actor = authorization.actor;
  const ownScope = actor.role === "MANAGER";

  const parsedPeriod = periodSchema.safeParse(
    new URL(request.url).searchParams.get("period") ?? "30d",
  );
  if (!parsedPeriod.success) return jsonResponse({ error: "Invalid analytics period" }, 400);

  const prisma = getPrismaClient();
  const now = new Date();
  const from = periodStart(parsedPeriod.data, now);

  const leadWhere = {
    storeId: actor.storeId,
    ...leadVisibilityFilter(actor),
    ...(from ? { createdAt: { gte: from } } : {}),
  };

  const leads = (await prisma.lead.findMany({
    where: leadWhere,
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: {
      id: true,
      type: true,
      status: true,
      assignedManagerId: true,
      firstContactAt: true,
      createdAt: true,
      nextActionAt: true,
      assignedManager: { select: { id: true, email: true } },
      order: { select: { id: true } },
    },
  })) as LeadRow[];

  const byType = { ORDER: 0, MEASUREMENT: 0 };
  for (const lead of leads) {
    if (lead.type === "ORDER") byType.ORDER += 1;
    else if (lead.type === "MEASUREMENT") byType.MEASUREMENT += 1;
  }
  const assigned = leads.filter((lead) => lead.assignedManagerId !== null).length;

  // Point-in-time discipline snapshot (independent of the selected period).
  const openLeads = await prisma.lead.findMany({
    where: {
      storeId: actor.storeId,
      ...leadVisibilityFilter(actor),
      status: { notIn: [...CLOSED_LEAD_STATUSES] as never },
    },
    select: {
      id: true,
      status: true,
      firstContactAt: true,
      createdAt: true,
      nextActionAt: true,
    },
    take: 5000,
  });
  const historyRows = openLeads.length
    ? await prisma.leadStatusHistory.groupBy({
        by: ["leadId"],
        where: { leadId: { in: openLeads.map((lead) => lead.id) } },
        _max: { changedAt: true },
      })
    : [];
  const lastChange = new Map(historyRows.map((row) => [row.leadId, row._max.changedAt ?? null]));

  const discipline = {
    asOf: now.toISOString(),
    firstContactOverdue: openLeads.filter((lead) => isFirstContactOverdue(lead, now)).length,
    actionOverdue: openLeads.filter(
      (lead) => lead.nextActionAt !== null && lead.nextActionAt.getTime() < now.getTime(),
    ).length,
    followUpDue: openLeads.filter((lead) =>
      needsFollowUp({ ...lead, lastStatusChangeAt: lastChange.get(lead.id) ?? null }, now),
    ).length,
  };

  const rejectionRows = await prisma.lead.groupBy({
    by: ["rejectionReason"],
    where: { ...leadWhere, status: "REJECTED" },
    _count: { _all: true },
  });
  const rejectionTotal = rejectionRows.reduce((sum, row) => sum + row._count._all, 0);
  const rejections = {
    total: rejectionTotal,
    byReason: REJECTION_REASON_CODES.map((reason) => {
      const count = rejectionRows.find((row) => row.rejectionReason === reason)?._count._all ?? 0;
      return {
        reason,
        count,
        sharePercent: rejectionTotal ? Math.round((count / rejectionTotal) * 100) : 0,
      };
    }),
  };

  const orderWhere = {
    storeId: actor.storeId,
    ...(from ? { createdAt: { gte: from } } : {}),
    ...(ownScope ? { lead: { assignedManagerId: actor.userId } } : {}),
  };
  const orderAggregate = await prisma.order.aggregate({
    where: orderWhere,
    _count: { _all: true },
    _sum: { totalMinor: true, prepaymentMinor: true, balanceMinor: true },
    _avg: { totalMinor: true },
  });
  const paymentAggregate = await prisma.orderPayment.aggregate({
    where: {
      order: orderWhere,
      ...(from ? { createdAt: { gte: from } } : {}),
    },
    _sum: { amountMinor: true },
  });
  const ordersTotal = orderAggregate._sum.totalMinor ?? BigInt(0);
  const paid = paymentAggregate._sum.amountMinor ?? BigInt(0);
  const finance = {
    orders: orderAggregate._count._all,
    ordersTotalMinor: Number(ordersTotal),
    paidMinor: Number(paid),
    balanceMinor: Number(orderAggregate._sum.balanceMinor ?? BigInt(0)),
    averageCheckMinor: orderAggregate._avg.totalMinor ? Math.round(Number(orderAggregate._avg.totalMinor)) : null,
    collectionPercent: ordersTotal > BigInt(0) ? Math.round((Number(paid) / Number(ordersTotal)) * 100) : null,
  };

  // Manager breakdown is computed in memory: the pilot dataset is small, and
  // the rule needs per-lead history timestamps anyway.
  const groups = new Map<string, { email: string; leads: LeadRow[] }>();
  for (const lead of leads) {
    if (!lead.assignedManager) continue;
    const entry = groups.get(lead.assignedManager.id) ?? {
      email: lead.assignedManager.email,
      leads: [],
    };
    entry.leads.push(lead);
    groups.set(lead.assignedManager.id, entry);
  }
  const managers = [...groups.entries()].map(([managerId, entry]) => {
    const contact = contactStats(entry.leads);
    const conversion = conversionStats(entry.leads);
    return {
      managerId,
      email: entry.email,
      leads: entry.leads.length,
      withContact: contact.withContact,
      avgFirstContactMinutes: contact.avgMinutes,
      withinSlaPercent: contact.withinSlaPercent,
      sales: entry.leads.filter((lead) => lead.status === "SALE").length,
      orderLeads: conversion.orderLeads,
      orderConversionPercent: conversion.orderConversionPercent,
      rejections: entry.leads.filter((lead) => lead.status === "REJECTED").length,
    };
  });

  let unassigned: ReturnType<typeof buildUnassigned> | null = null;
  if (!ownScope) {
    const unassignedLeads = leads.filter((lead) => lead.assignedManagerId === null);
    unassigned = buildUnassigned(unassignedLeads);
  }

  const costFilled = await prisma.order.count({ where: { ...orderWhere, costMinor: { not: null } } });
  const repeatPhones = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count FROM (
      SELECT phone FROM "Lead" WHERE "storeId" = ${actor.storeId}::uuid
      GROUP BY phone HAVING count(*) > 1
    ) repeated
  `;
  const leadsWithSource = await prisma.lead.count({
    where: { ...leadWhere, OR: [{ source: { not: null } }, { utmSource: { not: null } }] },
  });
  const completedDeliveries = await prisma.delivery.count({
    where: { storeId: actor.storeId, status: "DELIVERED" },
  });

  return jsonResponse({
    scope: ownScope ? "own" : "store",
    period: {
      key: parsedPeriod.data,
      from: from ? from.toISOString() : null,
      to: now.toISOString(),
    },
    leads: {
      total: leads.length,
      byType,
      assigned,
      assignmentCoveragePercent: leads.length ? Math.round((assigned / leads.length) * 100) : null,
    },
    conversion: conversionStats(leads),
    firstContact: contactStats(leads),
    discipline,
    rejections,
    finance,
    managers,
    unassigned,
    unavailable: [
      {
        metric: "profit",
        reason: "Себестоимость заполнена не у всех заказов",
        filledOrders: costFilled,
        totalOrders: finance.orders,
      },
      {
        metric: "ltv",
        reason: "Нет клиентов с повторными заказами",
        repeatCustomers: Number(repeatPhones[0]?.count ?? BigInt(0)),
      },
      {
        metric: "sources",
        reason: "UTM/источник не передаются формой",
        leadsWithSource,
        totalLeads: leads.length,
      },
      {
        metric: "delivery_lead_time",
        reason: "Нет завершённых доставок",
        completedDeliveries,
      },
    ],
  });
}

function buildUnassigned(leads: LeadRow[]) {
  const contact = contactStats(leads);
  const conversion = conversionStats(leads);
  return {
    leads: leads.length,
    withContact: contact.withContact,
    avgFirstContactMinutes: contact.avgMinutes,
    withinSlaPercent: contact.withinSlaPercent,
    sales: leads.filter((lead) => lead.status === "SALE").length,
    orderLeads: conversion.orderLeads,
    orderConversionPercent: conversion.orderConversionPercent,
    rejections: leads.filter((lead) => lead.status === "REJECTED").length,
  };
}
