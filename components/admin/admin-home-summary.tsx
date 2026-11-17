import Link from "next/link";
import type { HomeSummary } from "@/lib/admin/analytics-data";
import { rubles } from "@/lib/admin/analytics-format";

export function AdminHomeSummary({ summary }: { summary: HomeSummary }) {
  const date = new Date(summary.from ?? summary.asOf).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
  return (
    <section className="home-summary">
      <div className="home-summary-head">
        <div>
          <span className="eyebrow">Сводка</span>
          <h2>Сегодня, {date}</h2>
        </div>
        <Link className="admin-record-link" href="/admin/analytics">
          Вся аналитика →
        </Link>
      </div>
      <div className="analytics-tiles home-summary-tiles">
        <article className="analytics-tile">
          <span className="analytics-tile-label">Заявок сегодня</span>
          <strong className="analytics-tile-value">{summary.leadsToday}</strong>
          <span className="analytics-tile-note">созданы за сутки</span>
        </article>
        <article
          className={
            summary.firstContactOverdue > 0
              ? "analytics-tile analytics-tile--alert"
              : "analytics-tile"
          }
        >
          <span className="analytics-tile-label">Просрочен контакт</span>
          <strong className="analytics-tile-value">{summary.firstContactOverdue}</strong>
          <span className="analytics-tile-note">дольше 2 ч без первого контакта</span>
        </article>
        <article
          className={
            summary.followUpDue > 0 ? "analytics-tile analytics-tile--alert" : "analytics-tile"
          }
        >
          <span className="analytics-tile-label">Пора связаться</span>
          <strong className="analytics-tile-value">{summary.followUpDue}</strong>
          <span className="analytics-tile-note">3 дня без касания</span>
        </article>
        <article className="analytics-tile">
          <span className="analytics-tile-label">Оплачено сегодня</span>
          <strong className="analytics-tile-value">{rubles(summary.paidTodayMinor)}</strong>
          <span className="analytics-tile-note">поступления за сутки</span>
        </article>
        <article className="analytics-tile">
          <span className="analytics-tile-label">Остаток</span>
          <strong className="analytics-tile-value">{rubles(summary.outstandingBalanceMinor)}</strong>
          <span className="analytics-tile-note">по всем заказам магазина</span>
        </article>
      </div>
    </section>
  );
}
