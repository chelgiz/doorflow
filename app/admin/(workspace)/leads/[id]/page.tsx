import Link from "next/link";
import { AdminLeadDetail } from "@/components/admin/admin-lead-detail";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin/pages";
import { leadVisibilityFilter, roleCan } from "@/lib/admin/auth";
import { isFirstContactOverdue } from "@/lib/admin/lead-sla";
import { isActionOverdue } from "@/lib/admin/lead-actions";
import { getPrismaClient } from "@/lib/db/prisma";
import { toSafeMinorUnits } from "@/lib/admin/http";
import { getCustomerHistory } from "@/lib/admin/customer-history";

export default async function AdminLeadDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage("leads:read");
  const { id } = await params;
  const prisma = getPrismaClient();
  const [lead, measurers, managers] = await Promise.all([
    prisma.lead.findFirst({
    where: { id, storeId: actor.storeId, ...leadVisibilityFilter(actor) },
    include: {
      product: { select: { id: true, name: true, model: true, slug: true } },
      statusHistory: {
        orderBy: { changedAt: "asc" },
        include: { changedBy: { select: { email: true, role: true } } },
      },
      customerActivities: {
        orderBy: { createdAt: "asc" },
        include: { createdBy: { select: { id: true, email: true, role: true } } },
      },
      measurements: {
        orderBy: { scheduledAt: "desc" },
        include: { assignedMeasurer: { select: { id: true, email: true } } },
      },
      order: { select: { id: true, status: true, totalMinor: true, currency: true } },
      assignedManager: { select: { id: true, email: true } },
    },
    }),
    prisma.adminUser.findMany({
      where: { storeId: actor.storeId, role: "MEASURER", isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true },
    }),
    prisma.adminUser.findMany({
      where: { storeId: actor.storeId, role: { in: ["OWNER", "ADMIN", "MANAGER"] }, isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true },
    }),
  ]);
  if (!lead) notFound();
  const rawCustomerHistory = await getCustomerHistory(actor.storeId, lead.phone);
  return (
    <>
      <Link className="admin-back-link" href="/admin/leads">← Все заявки</Link>
      <div className="admin-page-heading">
        <span className="eyebrow">Карточка обращения</span>
        <h1>Заявка</h1>
      </div>
      <AdminLeadDetail
        canAssign={roleCan(actor.role, "leads:assign")}
        canWrite={roleCan(actor.role, "leads:write")}
        firstContactOverdue={isFirstContactOverdue(lead)}
        actionOverdue={isActionOverdue(lead)}
        id={id}
        initialLead={{
          ...lead,
          createdAt: lead.createdAt.toISOString(),
          firstContactAt: lead.firstContactAt ? lead.firstContactAt.toISOString() : null,
          nextActionAt: lead.nextActionAt ? lead.nextActionAt.toISOString() : null,
          personalDataConsentAt: lead.personalDataConsentAt.toISOString(),
          statusHistory: lead.statusHistory.map((entry) => ({
            ...entry,
            changedAt: entry.changedAt.toISOString(),
          })),
          customerActivities: lead.customerActivities.map((activity) => ({
            ...activity,
            createdAt: activity.createdAt.toISOString(),
          })),
          measurements: lead.measurements.map((measurement) => ({
            ...measurement,
            scheduledAt: measurement.scheduledAt.toISOString(),
          })),
          order: lead.order ? {
            ...lead.order,
            totalMinor: toSafeMinorUnits(lead.order.totalMinor, "Order total"),
          } : null,
        }}
        measurers={measurers}
        managers={managers}
        customerHistory={{
          leads: rawCustomerHistory.leads.map((customerLead) => ({
            ...customerLead,
            createdAt: customerLead.createdAt.toISOString(),
            statusHistory: customerLead.statusHistory.map((entry) => ({
              ...entry,
              changedAt: entry.changedAt.toISOString(),
            })),
            measurements: customerLead.measurements.map((measurement) => ({
              ...measurement,
              scheduledAt: measurement.scheduledAt.toISOString(),
            })),
          })),
          activities: rawCustomerHistory.activities.map((activity) => ({
            ...activity,
            createdAt: activity.createdAt.toISOString(),
          })),
        }}
      />
    </>
  );
}
