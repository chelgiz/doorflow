import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminTaskDetail } from "@/components/admin/admin-task-detail";
import { roleCan } from "@/lib/admin/auth";
import { requireAdminPageOneOf } from "@/lib/admin/pages";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function InstallationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPageOneOf("operations:read", "installations:own");
  const manager = roleCan(actor.role, "operations:read");
  const { id } = await params;
  const prisma = getPrismaClient();
  const installation = await prisma.installation.findFirst({
    where: {
      id,
      storeId: actor.storeId,
      ...(manager ? {} : { assignedInstallerId: actor.userId }),
    },
    include: {
      order: { select: { id: true, customerName: true, phone: true, address: true, configurationSnapshot: true } },
      assignedInstaller: { select: { id: true, email: true } },
    },
  });
  if (!installation) notFound();
  const [audit, employees] = await Promise.all([
    manager ? prisma.operationAudit.findMany({
      where: { storeId: actor.storeId, entityType: "INSTALLATION", entityId: id },
      orderBy: { createdAt: "asc" },
    }) : [],
    manager ? prisma.adminUser.findMany({
      where: { storeId: actor.storeId, role: "INSTALLER", isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true },
    }) : [],
  ]);
  return (
    <>
      <Link className="admin-back-link" href="/admin/installations">← К графику установок</Link>
      <div className="admin-page-heading"><span className="eyebrow">Рабочая задача</span><h1>Установка</h1></div>
      <AdminTaskDetail
        kind="installation"
        manager={manager}
        employees={employees}
        initialTask={{ ...installation, scheduledAt: installation.scheduledAt.toISOString() }}
        initialAudit={audit.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() }))}
      />
    </>
  );
}
