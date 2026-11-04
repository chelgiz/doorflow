import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminTaskDetail } from "@/components/admin/admin-task-detail";
import { roleCan } from "@/lib/admin/auth";
import { requireAdminPageOneOf } from "@/lib/admin/pages";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function MeasurementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPageOneOf("operations:read", "measurements:own");
  const manager = roleCan(actor.role, "operations:read");
  const { id } = await params;
  const prisma = getPrismaClient();
  const measurement = await prisma.measurement.findFirst({
    where: {
      id,
      storeId: actor.storeId,
      ...(manager ? {} : { assignedMeasurerId: actor.userId }),
    },
    include: {
      lead: { select: { id: true, customerName: true, phone: true, product: { select: { name: true, model: true } } } },
      assignedMeasurer: { select: { id: true, email: true } },
    },
  });
  if (!measurement) notFound();
  const [audit, employees] = await Promise.all([
    manager ? prisma.operationAudit.findMany({
      where: { storeId: actor.storeId, entityType: "MEASUREMENT", entityId: id },
      orderBy: { createdAt: "asc" },
    }) : [],
    manager ? prisma.adminUser.findMany({
      where: { storeId: actor.storeId, role: "MEASURER", isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true },
    }) : [],
  ]);
  return (
    <>
      <Link className="admin-back-link" href="/admin/measurements">← К расписанию замеров</Link>
      <div className="admin-page-heading"><span className="eyebrow">Рабочая задача</span><h1>Замер</h1></div>
      <AdminTaskDetail
        kind="measurement"
        manager={manager}
        employees={employees}
        initialTask={{ ...measurement, scheduledAt: measurement.scheduledAt.toISOString() }}
        initialAudit={audit.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() }))}
      />
    </>
  );
}
