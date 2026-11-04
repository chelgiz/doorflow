import Link from "next/link";
import { requireAdminPageOneOf } from "@/lib/admin/pages";
import { roleCan } from "@/lib/admin/auth";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function AdminMeasurementsPage() {
  const actor = await requireAdminPageOneOf("operations:read", "measurements:own");
  const manager = roleCan(actor.role, "operations:read");
  const measurements = await getPrismaClient().measurement.findMany({
    where: {
      storeId: actor.storeId,
      ...(manager ? {} : { assignedMeasurerId: actor.userId }),
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
    include: {
      lead: { select: { customerName: true, phone: true } },
      assignedMeasurer: { select: { email: true } },
    },
  });
  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Выезды и результаты</span>
        <h1>Замеры</h1>
        <p>{manager ? "Расписание и назначение замерщиков." : "Показаны только назначенные вам задачи."}</p>
      </div>
      <section className="admin-panel">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Дата и время</th><th>Клиент</th><th>Адрес</th><th>Замерщик</th><th>Статус</th><th></th></tr></thead>
            <tbody>{measurements.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.scheduledAt).toLocaleString("ru-RU")}</td>
                <td>{item.lead.customerName}<small>{item.lead.phone}</small></td>
                <td>{item.address}</td>
                <td>{item.assignedMeasurer?.email ?? "Не назначен"}</td>
                <td>{item.status}</td>
                <td><Link className="admin-record-link" href={`/admin/measurements/${item.id}`}>Открыть</Link></td>
              </tr>
            ))}</tbody>
          </table>
          {measurements.length === 0 && <p className="admin-empty">Назначенных замеров пока нет.</p>}
        </div>
      </section>
    </>
  );
}
