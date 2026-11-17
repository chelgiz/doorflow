import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminDeliveryDetail } from "@/components/admin/admin-delivery-detail";
import { requireAdminPage } from "@/lib/admin/pages";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage("operations:read");
  const { id } = await params;
  const prisma = getPrismaClient();
  const delivery = await prisma.delivery.findFirst({
    where: { id, storeId: actor.storeId },
    include: {
      order: { select: { id: true, customerName: true, phone: true, address: true } },
      assignedEmployee: { select: { id: true, email: true } },
    },
  });
  if (!delivery) notFound();

  const [audit, employees] = await Promise.all([
    prisma.operationAudit.findMany({
      where: { storeId: actor.storeId, entityType: "DELIVERY", entityId: id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.adminUser.findMany({
      where: { storeId: actor.storeId, isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true, role: true },
    }),
  ]);

  return (
    <>
      <Link className="admin-back-link" href="/admin/deliveries">
        ← К графику доставок
      </Link>
      <div className="admin-page-heading">
        <span className="eyebrow">Логистика</span>
        <h1>Доставка</h1>
      </div>
      <AdminDeliveryDetail
        deliveryId={delivery.id}
        initialDelivery={{
          ...delivery,
          scheduledAt: delivery.scheduledAt.toISOString(),
          deliveredAt: delivery.deliveredAt ? delivery.deliveredAt.toISOString() : null,
        }}
        initialAudit={audit.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() }))}
        employees={employees}
      />
    </>
  );
}
