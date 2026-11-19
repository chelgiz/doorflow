"use client";

import { useState } from "react";
import type { AnalyticsPeriod } from "@/lib/admin/analytics-metrics";
import { duration, percent, plural, rubles } from "@/lib/admin/analytics-format";
import type { AnalyticsReport } from "@/lib/admin/analytics-data";
import { rejectionReasonLabel } from "@/lib/admin/rejection-reasons";

const periods: Array<{ key: AnalyticsPeriod; label: string }> = [
  { key: "today", label: "Сегодня" },
  { key: "7d", label: "7 дней" },
  { key: "30d", label: "30 дней" },
  { key: "all", label: "Всё время" },
];

const statusLabels: Array<[string, string]> = [
  ["NEW", "Новая"],
  ["IN_PROGRESS", "В обработке"],
  ["CONTACTED", "Связались"],
  ["MEASUREMENT_SCHEDULED", "Назначен замер"],
  ["MEASURED", "Замер проведён"],
  ["PROPOSAL_PREPARED", "Предложение"],
  ["AWAITING_DECISION", "Ожидает решения"],
  ["SALE", "Продажа"],
  ["REJECTED", "Отказ"],
  ["COMPLETED", "Завершено"],
];

const unavailableTitles: Record<string, string> = {
  profit: "Прибыль и маржа",
  ltv: "Повторные продажи (LTV)",
  sources: "Источники заявок",
  delivery_lead_time: "Срок доставки",
};

function share(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function unavailableDetail(entry: AnalyticsReport["unavailable"][number]) {
  if ("filledOrders" in entry && "totalOrders" in entry) {
    return `заполнено у ${entry.filledOrders} из ${entry.totalOrders}`;
  }
  if ("repeatCustomers" in entry) {
    return `клиентов с повторными заявками: ${entry.repeatCustomers}`;
  }
  if ("leadsWithSource" in entry && "totalLeads" in entry) {
    return `источник у ${entry.leadsWithSource} из ${entry.totalLeads}`;
  }
  if ("completedDeliveries" in entry) {
    return `завершённых доставок: ${entry.completedDeliveries}`;
  }
  return "";
}

export function AdminAnalytics({
  initialReport,
  canSeeUnassigned,
}: {
  initialReport: AnalyticsReport;
  canSeeUnassigned: boolean;
}) {
  const [report, setReport] = useState<AnalyticsReport>(initialReport);
  const [period, setPeriod] = useState<AnalyticsPeriod>(initialReport.period.key);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function changePeriod(next: AnalyticsPeriod) {
    if (next === period) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/analytics?period=${next}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить аналитику");
      setReport(result);
      setPeriod(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить аналитику");
    } finally {
      setLoading(false);
    }
  }

  const { leads, conversion, firstContact, discipline, finance, rejections } = report;
  const totalLeads = leads.total;
  const statusTotal = Object.values(leads.byStatus).reduce((sum, count) => sum + count, 0);

  return (
    <>
      <div className="analytics-toolbar">
        <div className="analytics-periods" role="group" aria-label="Период отчёта">
          {periods.map((item) => (
            <button
              aria-pressed={item.key === period}
              disabled={loading}
              key={item.key}
              onClick={() => void changePeriod(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="analytics-stamp">
          {report.scope === "own" ? "Только ваши заявки · " : "Магазин целиком · "}
          заявки с {report.period.from ? new Date(report.period.from).toLocaleDateString("ru-RU") : "начала работы"}
          {" по "}
          {new Date(report.period.to).toLocaleDateString("ru-RU")}
        </span>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}

      <div className="analytics-tiles">
        <article className="analytics-tile">
          <span className="analytics-tile-label">Заявки</span>
          <strong className="analytics-tile-value">{totalLeads}</strong>
          <span className="analytics-tile-note">
            заказы {leads.byType.ORDER} · замеры {leads.byType.MEASUREMENT}
          </span>
        </article>
        <article className="analytics-tile">
          <span className="analytics-tile-label">Конверсия в заказ</span>
          <strong className="analytics-tile-value">{percent(conversion.orderConversionPercent)}</strong>
          <span className="analytics-tile-note">
            {conversion.orderConverted} из {conversion.orderLeads}{" "}
            {plural(conversion.orderLeads, "заявки", "заявок", "заявок")} на заказ
          </span>
        </article>
        <article className="analytics-tile">
          <span className="analytics-tile-label">Назначено менеджеру</span>
          <strong className="analytics-tile-value">{percent(leads.assignmentCoveragePercent)}</strong>
          <span className="analytics-tile-note">
            {leads.assigned} из {totalLeads} {plural(totalLeads, "заявки", "заявок", "заявок")}
          </span>
        </article>
        <article className="analytics-tile">
          <span className="analytics-tile-label">Оплачено</span>
          <strong className="analytics-tile-value">{rubles(finance.paidMinor)}</strong>
          <span className="analytics-tile-note">
            из {rubles(finance.ordersTotalMinor)} по {finance.orders}{" "}
            {plural(finance.orders, "заказу", "заказам", "заказам")}
          </span>
        </article>
        <article className="analytics-tile">
          <span className="analytics-tile-label">Остаток</span>
          <strong className="analytics-tile-value">{rubles(finance.balanceMinor)}</strong>
          <span className="analytics-tile-note">собираемость {percent(finance.collectionPercent)}</span>
        </article>
        <article className="analytics-tile">
          <span className="analytics-tile-label">Средний чек</span>
          <strong className="analytics-tile-value">
            {finance.averageCheckMinor === null ? "—" : rubles(finance.averageCheckMinor)}
          </strong>
          <span className="analytics-tile-note">
            n = {finance.orders} {plural(finance.orders, "заказ", "заказа", "заказов")}
          </span>
        </article>
      </div>

      <div className="analytics-grid">
        <section className="admin-panel">
          <h2>Заявки по статусам</h2>
          <p className="admin-muted">
            Все заявки периода, включая закрытые. n = {totalLeads}{" "}
            {plural(totalLeads, "заявка", "заявки", "заявок")}.
          </p>
          {statusTotal > 0 ? (
            <div className="analytics-bars">
              {statusLabels.map(([status, label]) => {
                const count = leads.byStatus[status as keyof typeof leads.byStatus] ?? 0;
                return (
                  <div className="analytics-bar-row" key={status}>
                    <span>{label}</span>
                    <span className="analytics-bar-track">
                      <span
                        className={count > 0 ? "analytics-bar-fill" : "analytics-bar-fill analytics-bar-fill--empty"}
                        style={{ width: `${share(count, statusTotal)}%` }}
                      />
                    </span>
                    <span className="analytics-bar-value">
                      {count} · {percent(count === 0 ? 0 : share(count, statusTotal))}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="admin-empty">За выбранный период заявок нет.</p>
          )}
        </section>

        <section className="admin-panel">
          <h2>Конверсия</h2>
          <dl className="analytics-facts">
            <div>
              <dt>Заявка на заказ → заказ</dt>
              <dd>
                {percent(conversion.orderConversionPercent)}
                <small>
                  n = {conversion.orderLeads} {plural(conversion.orderLeads, "заявка", "заявки", "заявок")} на заказ
                </small>
              </dd>
            </div>
            <div>
              <dt>Все заявки → заказ</dt>
              <dd>
                {percent(conversion.allConversionPercent)}
                <small>
                  справочно, n = {conversion.allLeads}{" "}
                  {plural(conversion.allLeads, "заявка", "заявки", "заявок")} всех типов
                </small>
              </dd>
            </div>
            <div>
              <dt>Продажи</dt>
              <dd>
                {leads.byStatus.SALE}
                <small>заявок в статусе «Продажа»</small>
              </dd>
            </div>
          </dl>
          <p className="analytics-note">
            Основной показатель — заявки на заказ: замеры не обязаны заканчиваться заказом, поэтому
            общая доля занижена и приведена только для справки.
          </p>
        </section>

        <section className="admin-panel">
          <h2>Первый контакт</h2>
          <dl className="analytics-facts">
            <div>
              <dt>Среднее время до контакта</dt>
              <dd>
                {duration(firstContact.avgMinutes)}
                <small>
                  n = {firstContact.withContact}{" "}
                  {plural(firstContact.withContact, "заявка", "заявки", "заявок")} с зафиксированным контактом
                </small>
              </dd>
            </div>
            <div>
              <dt>Медиана</dt>
              <dd>
                {duration(firstContact.medianMinutes)}
                <small>устойчива к единичным выбросам</small>
              </dd>
            </div>
            <div>
              <dt>В норме SLA (2 рабочих часа)</dt>
              <dd>
                {percent(firstContact.withinSlaPercent)}
                <small>
                  {firstContact.withinSla} из {firstContact.withContact} контактов
                </small>
              </dd>
            </div>
          </dl>
          <p className="analytics-note">
            Считаются только заявки с записанным первым контактом; заявки без контакта видны в блоке
            дисциплины.
          </p>
        </section>

        <section className="admin-panel">
          <h2>Дисциплина</h2>
          <p className="admin-muted">
            Снимок на {new Date(discipline.asOf).toLocaleString("ru-RU")}. Период на этот блок не влияет.
          </p>
          <div className="analytics-counters">
            <div>
              <strong>{discipline.firstContactOverdue}</strong>
              <span>Просрочен первый контакт</span>
            </div>
            <div>
              <strong>{discipline.actionOverdue}</strong>
              <span>Просрочено действие</span>
            </div>
            <div>
              <strong>{discipline.followUpDue}</strong>
              <span>Пора связаться (3 дня)</span>
            </div>
          </div>
          <p className="analytics-note">
            Первый контакт — дольше 2 рабочих часов без контакта, действие — пропущен срок следующего шага,
            повторное касание — 3 дня без контакта. Закрытые заявки не считаются.
          </p>
        </section>

        <section className="admin-panel">
          <h2>Отказы</h2>
          <p className="admin-muted">
            Причины фиксируются фиксированным списком. n = {rejections.total}.
          </p>
          {rejections.total > 0 ? (
            <div className="analytics-bars">
              {rejections.byReason.map((row) => (
                <div className="analytics-bar-row" key={row.reason}>
                  <span>{rejectionReasonLabel(row.reason)}</span>
                  <span className="analytics-bar-track">
                    <span
                      className={row.count > 0 ? "analytics-bar-fill" : "analytics-bar-fill analytics-bar-fill--empty"}
                      style={{ width: `${row.sharePercent}%` }}
                    />
                  </span>
                  <span className="analytics-bar-value">
                    {row.count} · {percent(row.sharePercent)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="admin-empty">Отказов за период нет.</p>
          )}
        </section>

        <section className="admin-panel">
          <h2>Деньги</h2>
          <dl className="analytics-facts">
            <div>
              <dt>Сумма заказов</dt>
              <dd>
                {rubles(finance.ordersTotalMinor)}
                <small>
                  n = {finance.orders} {plural(finance.orders, "заказ", "заказа", "заказов")}
                </small>
              </dd>
            </div>
            <div>
              <dt>Оплачено</dt>
              <dd>
                {rubles(finance.paidMinor)}
                <small>поступления за период</small>
              </dd>
            </div>
            <div>
              <dt>Остаток по заказам периода</dt>
              <dd>{rubles(finance.balanceMinor)}</dd>
            </div>
            <div>
              <dt>Собираемость</dt>
              <dd>
                {percent(finance.collectionPercent)}
                <small>оплачено / сумма заказов</small>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="admin-panel analytics-managers">
        <h2>Менеджеры</h2>
        <p className="admin-muted">
          Заявки, конверсия и отказы по ответственному менеджеру. Заявки без менеджера
          {canSeeUnassigned ? " вынесены отдельной строкой." : " в вашу выборку не входят."}
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Менеджер</th>
                <th>Заявки</th>
                <th>Контакт</th>
                <th>SLA</th>
                <th>Продажи</th>
                <th>Конверсия ORDER</th>
                <th>Отказы</th>
              </tr>
            </thead>
            <tbody>
              {report.managers.map((manager) => (
                <tr key={manager.managerId}>
                  <td>{manager.email}</td>
                  <td>{manager.leads}</td>
                  <td>
                    {duration(manager.avgFirstContactMinutes)}
                    <small>n = {manager.withContact}</small>
                  </td>
                  <td>{percent(manager.withinSlaPercent)}</td>
                  <td>{manager.sales}</td>
                  <td>
                    {percent(manager.orderConversionPercent)}
                    <small>n = {manager.orderLeads}</small>
                  </td>
                  <td>{manager.rejections}</td>
                </tr>
              ))}
              {canSeeUnassigned && report.unassigned && report.unassigned.leads > 0 && (
                <tr>
                  <td>
                    Не назначено
                    <small>заявки без ответственного</small>
                  </td>
                  <td>{report.unassigned.leads}</td>
                  <td>
                    {duration(report.unassigned.avgFirstContactMinutes)}
                    <small>n = {report.unassigned.withContact}</small>
                  </td>
                  <td>{percent(report.unassigned.withinSlaPercent)}</td>
                  <td>{report.unassigned.sales}</td>
                  <td>
                    {percent(report.unassigned.orderConversionPercent)}
                    <small>n = {report.unassigned.orderLeads}</small>
                  </td>
                  <td>{report.unassigned.rejections}</td>
                </tr>
              )}
            </tbody>
          </table>
          {report.managers.length === 0 && (
            <p className="admin-empty">За период нет заявок с назначенным менеджером.</p>
          )}
        </div>
      </section>

      <section className="admin-panel analytics-unavailable">
        <h2>Чего нет в данных</h2>
        <p className="admin-muted">
          Эти показатели не считаются: для них пока нет исходных данных. Блок исчезнет, когда данные
          появятся.
        </p>
        <ul className="analytics-list">
          {report.unavailable.map((entry) => (
            <li key={entry.metric}>
              <strong>{unavailableTitles[entry.metric] ?? entry.metric}</strong>
              <span className="admin-muted">
                — {entry.reason}
                {unavailableDetail(entry) ? ` (${unavailableDetail(entry)})` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
