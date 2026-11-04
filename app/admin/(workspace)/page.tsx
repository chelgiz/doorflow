import Link from "next/link";
import { ArrowRight, Boxes, ClipboardList, Settings2, Truck, Ruler, Wrench } from "lucide-react";

const sections = [
  { href: "/admin/products", title: "Каталог дверей", text: "Карточки, характеристики, комплектации и публикация.", icon: Boxes },
  { href: "/admin/pricing", title: "Цены и услуги", text: "Правила расчёта, доставка, монтаж и дополнительные услуги.", icon: Truck },
  { href: "/admin/leads", title: "Заявки", text: "Поиск обращений, карточки клиентов и история статусов.", icon: ClipboardList },
  { href: "/admin/measurements", title: "Замеры", text: "Расписание выездов, назначение сотрудников и результаты.", icon: Ruler },
  { href: "/admin/orders", title: "Заказы", text: "Зафиксированная цена, оплаты, остаток и история статусов.", icon: Boxes },
  { href: "/admin/installations", title: "Установки", text: "Планирование работ и фиксация результата.", icon: Wrench },
  { href: "/admin/settings", title: "Магазин и точки", text: "Контактная информация, логотип и торговые адреса.", icon: Settings2 },
];

export default function AdminHomePage() {
  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Управление магазином</span>
        <h1>Рабочее пространство</h1>
        <p>Изменения сохраняются в базе магазина. Публичный каталог показывает только опубликованные товары.</p>
      </div>
      <div className="admin-section-grid">
        {sections.map(({ href, title, text, icon: Icon }) => (
          <Link className="admin-section-card" href={href} key={href}>
            <Icon aria-hidden="true" />
            <h2>{title}</h2>
            <p>{text}</p>
            <span>Открыть <ArrowRight aria-hidden="true" /></span>
          </Link>
        ))}
      </div>
    </>
  );
}
