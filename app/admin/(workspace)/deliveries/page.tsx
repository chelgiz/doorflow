import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/pages";
import { getPrismaClient } from "@/lib/db/prisma";

const statusLabels: Record<string, string> = {
  SCHEDULED: "Запланирована",
  CONFIRMED: "Подтверждена",
  IN_PROGRESS: "В пути",
  DELIVERED: "Доставлено",
  FAILED: "Не доставлено",
  CANCELLED: "Отменена",
};

export default async function AdminDeliveriesPage() {
  const actor = await requireAdminPage("operations:read");
  const deliveries = await getPrismaClient().delivery.findMany({
    where: { storeId: actor.storeId },
    orderBy: { scheduledAt: "asc" },
    take: 100,
    include: {
      order: { select: { customerName: true, phone: true } },
      assignedEmployee: { select: { email: true } },
    },
  });
  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Логистика</span>
        <h1>Доставки</h1>
        <p>График доставок по заказам и назначение исполнителей.</p>
      </div>
      <section className="admin-panel">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Дата и время</th>
                <th>Клиент</th>
                <th>Адрес</th>
                <th>Исполнитель</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.scheduledAt).toLocaleString("ru-RU")}</td>
                  <td>
                    {item.order.customerName}
                    <small>{item.order.phone}</small>
                  </td>
                  <td>{item.address}</td>
                  <td>{item.assignedEmployee?.email ?? "Не назначен"}</td>
                  <td>{statusLabels[item.status] ?? item.status}</td>
                  <td>
                    <Link className="admin-record-link" href={`/admin/deliveries/${item.id}`}>
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {deliveries.length === 0 && <p className="admin-empty">Доставок пока нет.</p>}
        </div>
      </section>
    </>
  );
}
