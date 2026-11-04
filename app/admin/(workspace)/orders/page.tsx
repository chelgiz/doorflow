import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/pages";
import { getPrismaClient } from "@/lib/db/prisma";
import { serializeOrder } from "@/lib/admin/http";

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" });

export default async function AdminOrdersPage() {
  const actor = await requireAdminPage("operations:read");
  const orders = await getPrismaClient().order.findMany({
    where: { storeId: actor.storeId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      manager: { select: { email: true } },
      lead: { select: { id: true } },
    },
  });
  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Продажи и финансы</span>
        <h1>Заказы</h1>
        <p>Исторические цены и комплектации зафиксированы в снимке заказа.</p>
      </div>
      <section className="admin-panel">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Клиент</th><th>Сумма</th><th>Предоплата</th><th>Остаток</th><th>Ответственный</th><th>Статус</th><th></th></tr></thead>
            <tbody>{orders.map((rawOrder) => {
              const order = serializeOrder(rawOrder);
              return (
                <tr key={order.id}>
                  <td>{order.customerName}<small>{order.phone}</small></td>
                  <td>{money.format(order.totalMinor / 100)}</td>
                  <td>{money.format(order.prepaymentMinor / 100)}</td>
                  <td>{money.format(order.balanceMinor / 100)}</td>
                  <td>{order.manager.email}</td>
                  <td>{order.status}</td>
                  <td><Link className="admin-record-link" href={`/admin/orders/${order.id}`}>Открыть</Link></td>
                </tr>
              );
            })}</tbody>
          </table>
          {orders.length === 0 && <p className="admin-empty">Заказов пока нет. Создайте заказ из карточки заявки.</p>}
        </div>
      </section>
    </>
  );
}
