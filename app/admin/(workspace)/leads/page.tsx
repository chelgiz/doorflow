import { AdminLeads } from "@/components/admin/admin-leads";
import { requireAdminPage } from "@/lib/admin/pages";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function AdminLeadsPage() {
  const actor = await requireAdminPage("leads:read");
  const prisma = getPrismaClient();
  const where = { storeId: actor.storeId };
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
      },
    }),
    prisma.lead.count({ where }),
  ]);
  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Клиенты</span>
        <h1>Заявки</h1>
        <p>Данные видны только авторизованным сотрудникам с правом работы с обращениями.</p>
      </div>
      <AdminLeads
        initialLeads={leads.map((lead) => ({ ...lead, createdAt: lead.createdAt.toISOString() }))}
        initialTotal={total}
      />
    </>
  );
}
