import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminOrderDetail } from "@/components/admin/admin-order-detail";
import { requireAdminPage } from "@/lib/admin/pages";
import { serializeOrder } from "@/lib/admin/http";
import { toSafeMinorUnits } from "@/lib/admin/http";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage("operations:read");
  const { id } = await params;
  const prisma = getPrismaClient();
  const order = await prisma.order.findFirst({
    where: { id, storeId: actor.storeId },
    include: {
      lead: { select: { id: true } },
      manager: { select: { id: true, email: true } },
      payments: { orderBy: { createdAt: "asc" }, include: { receivedBy: { select: { email: true } } } },
      installation: { include: { assignedInstaller: { select: { id: true, email: true } } } },
      delivery: { include: { assignedEmployee: { select: { id: true, email: true } } } },
    },
  });
  if (!order) notFound();
  const [audit, installers, employees] = await Promise.all([
    prisma.operationAudit.findMany({
      where: { storeId: actor.storeId, entityType: "ORDER", entityId: id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.adminUser.findMany({
      where: { storeId: actor.storeId, role: "INSTALLER", isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true },
    }),
    prisma.adminUser.findMany({
      where: { storeId: actor.storeId, isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true, role: true },
    }),
  ]);
  const serializedOrder = serializeOrder(order);
  return (
    <>
      <Link className="admin-back-link" href="/admin/orders">← Все заказы</Link>
      <div className="admin-page-heading"><span className="eyebrow">Заказ и расчёты</span><h1>Заказ</h1></div>
      <AdminOrderDetail
        initialOrder={{
          ...serializedOrder,
          payments: (serializedOrder.payments ?? []).map((payment) => ({
            ...payment,
            amountMinor: toSafeMinorUnits(payment.amountMinor, "Payment amount"),
            createdAt: payment.createdAt.toISOString(),
          })),
          installation: serializedOrder.installation
            ? { ...serializedOrder.installation, scheduledAt: serializedOrder.installation.scheduledAt.toISOString() }
            : null,
          delivery: serializedOrder.delivery
            ? {
                ...serializedOrder.delivery,
                scheduledAt: serializedOrder.delivery.scheduledAt.toISOString(),
                deliveredAt: serializedOrder.delivery.deliveredAt
                  ? serializedOrder.delivery.deliveredAt.toISOString()
                  : null,
              }
            : null,
        }}
        initialAudit={audit.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() }))}
        installers={installers}
        employees={employees}
      />
    </>
  );
}
