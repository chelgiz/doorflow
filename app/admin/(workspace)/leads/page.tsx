import { AdminLeads } from "@/components/admin/admin-leads";
import { requireAdminPage } from "@/lib/admin/pages";
import { leadVisibilityFilter } from "@/lib/admin/auth";
import { isFirstContactOverdue } from "@/lib/admin/lead-sla";
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
      },
    }),
    prisma.lead.count({ where }),
  ]);
  const decoratedLeads = leads.map((lead) => ({
    ...lead,
    firstContactOverdue: isFirstContactOverdue(lead),
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
        }))}
        initialTotal={total}
      />
    </>
  );
}
