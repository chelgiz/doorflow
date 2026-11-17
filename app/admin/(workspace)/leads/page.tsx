import { AdminLeads } from "@/components/admin/admin-leads";
import { requireAdminPage } from "@/lib/admin/pages";
import { leadVisibilityFilter } from "@/lib/admin/auth";
import { isFirstContactOverdue } from "@/lib/admin/lead-sla";
import { isActionOverdue } from "@/lib/admin/lead-actions";
import { needsFollowUp } from "@/lib/admin/lead-followup";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function AdminLeadsPage() {
  const actor = await requireAdminPage("leads:read");
  const prisma = getPrismaClient();
  const where = { storeId: actor.storeId, ...leadVisibilityFilter(actor) };
  const [leads, total] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        type: true,
        status: true,
        customerName: true,
        phone: true,
        address: true,
        source: true,
        utmSource: true,
        createdAt: true,
        product: { select: { name: true, model: true, slug: true } },
        assignedManager: { select: { id: true, email: true } },
        firstContactAt: true,
        nextActionAt: true,
        rejectionReason: true,
      },
    }),
    prisma.lead.count({ where }),
  ]);
  const leadIds = leads.map((lead) => lead.id);
  const lastChanges = leadIds.length
    ? await prisma.leadStatusHistory.groupBy({
        by: ["leadId"],
        where: { leadId: { in: leadIds } },
        _max: { changedAt: true },
      })
    : [];
  const lastChangeByLead = new Map(
    lastChanges.map((row) => [row.leadId, row._max.changedAt ?? null]),
  );
  const decoratedLeads = leads.map((lead) => ({
    ...lead,
    firstContactOverdue: isFirstContactOverdue(lead),
    actionOverdue: isActionOverdue(lead),
    followUpDue: needsFollowUp({ ...lead, lastStatusChangeAt: lastChangeByLead.get(lead.id) ?? null }),
  }));
  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Клиенты</span>
        <h1>Заявки</h1>
        <p>Данные видны только авторизованным сотрудникам с правом работы с обращениями.</p>
      </div>
      <AdminLeads
        initialLeads={decoratedLeads.map((lead) => ({
          ...lead,
          createdAt: lead.createdAt.toISOString(),
          firstContactAt: lead.firstContactAt ? lead.firstContactAt.toISOString() : null,
          nextActionAt: lead.nextActionAt ? lead.nextActionAt.toISOString() : null,
        }))}
        initialTotal={total}
      />
    </>
  );
}
