import Link from "next/link";
import { roleCan } from "@/lib/admin/auth";
import { requireAdminPageOneOf } from "@/lib/admin/pages";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function AdminInstallationsPage() {
  const actor = await requireAdminPageOneOf("operations:read", "installations:own");
  const manager = roleCan(actor.role, "operations:read");
  const installations = await getPrismaClient().installation.findMany({
    where: {
      storeId: actor.storeId,
      ...(manager ? {} : { assignedInstallerId: actor.userId }),
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
    include: {
      order: { select: { customerName: true, phone: true } },
      assignedInstaller: { select: { email: true } },
    },
  });
  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Работы на объекте</span>
        <h1>Установки</h1>
        <p>{manager ? "График установок и назначение исполнителей." : "Показаны только назначенные вам задачи."}</p>
      </div>
      <section className="admin-panel">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Дата и время</th><th>Клиент</th><th>Адрес</th><th>Установщик</th><th>Статус</th><th></th></tr></thead>
            <tbody>{installations.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.scheduledAt).toLocaleString("ru-RU")}</td>
                <td>{item.order.customerName}<small>{item.order.phone}</small></td>
                <td>{item.address}</td>
                <td>{item.assignedInstaller?.email ?? "Не назначен"}</td>
                <td>{item.status}</td>
                <td><Link className="admin-record-link" href={`/admin/installations/${item.id}`}>Открыть</Link></td>
              </tr>
            ))}</tbody>
          </table>
          {installations.length === 0 && <p className="admin-empty">Установок пока нет.</p>}
        </div>
      </section>
    </>
  );
}
