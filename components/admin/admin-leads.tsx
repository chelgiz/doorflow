"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { rejectionReasonLabel } from "@/lib/admin/rejection-reasons";

const statuses = [
  ["NEW", "Новая"],
  ["IN_PROGRESS", "В обработке"],
  ["CONTACTED", "Связались"],
  ["MEASUREMENT_SCHEDULED", "Назначен замер"],
  ["MEASURED", "Замер проведён"],
  ["PROPOSAL_PREPARED", "Подготовлено предложение"],
  ["AWAITING_DECISION", "Ожидает решения"],
  ["SALE", "Продажа"],
  ["REJECTED", "Отказ"],
  ["COMPLETED", "Завершено"],
] as const;

export type LeadSummary = {
  id: string;
  type: "ORDER" | "MEASUREMENT";
  status: (typeof statuses)[number][0];
  customerName: string;
  phone: string;
  address: string | null;
  source: string | null;
  utmSource: string | null;
  createdAt: string;
  product: { name: string; model: string; slug: string } | null;
  assignedManager: { id: string; email: string } | null;
  firstContactAt: string | null;
  firstContactOverdue: boolean;
  nextActionAt: string | null;
  actionOverdue: boolean;
  rejectionReason: string | null;
};

function statusLabel(status: string) {
  return statuses.find(([value]) => value === status)?.[1] ?? status;
}

export function AdminLeads({
  initialLeads,
  initialTotal,
}: {
  initialLeads: LeadSummary[];
  initialTotal: number;
}) {
  const [leads, setLeads] = useState<LeadSummary[]>(initialLeads);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sla, setSla] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(initialTotal);
  const [error, setError] = useState("");

  function changeSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    void loadLeads(search, status, sla, 1);
  }

  async function loadLeads(queryText: string, queryStatus: string, querySla: string, queryPage: number) {
    setError("");
    const query = new URLSearchParams({ q: queryText, status: queryStatus, sla: querySla, page: String(queryPage) });
    try {
      const response = await fetch(`/api/admin/leads?${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить заявки");
      setLeads(result.leads);
      setTotal(result.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить заявки");
    }
  }

  return (
    <section className="admin-panel">
      <form className="admin-filter-form" onSubmit={changeSearch}>
        <label>Поиск по имени, телефону или источнику
          <input onChange={(event) => setSearch(event.target.value)} value={search} />
        </label>
        <label>Статус
          <select onChange={(event) => { setStatus(event.target.value); setPage(1); void loadLeads(search, event.target.value, sla, 1); }} value={status}>
            <option value="all">Все статусы</option>
            {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Просрочки
          <select onChange={(event) => { setSla(event.target.value); setPage(1); void loadLeads(search, status, event.target.value, 1); }} value={sla}>
            <option value="all">Все заявки</option>
            <option value="first-contact-overdue">Нет первого контакта (SLA 2 ч)</option>
            <option value="action-overdue">Просрочено действие</option>
          </select>
        </label>
        <button className="admin-button-secondary" type="submit">Найти</button>
      </form>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Клиент</th><th>Обращение</th><th>Модель</th><th>Ответственный</th><th>Статус</th><th>Получено</th></tr></thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td><Link className="admin-record-link" href={`/admin/leads/${lead.id}`}>{lead.customerName}</Link><small>{lead.phone}</small></td>
                <td>{lead.type === "ORDER" ? "Заказ" : "Замер"}{lead.source ? <small>{lead.source}</small> : null}</td>
                <td>{lead.product ? `${lead.product.name} · ${lead.product.model}` : "Не указана"}</td>
                <td>{lead.assignedManager ? lead.assignedManager.email : <span className="admin-muted">Не назначен</span>}</td>
                <td>
                  {statusLabel(lead.status)}
                  {lead.rejectionReason && (
                    <small className="admin-muted">{rejectionReasonLabel(lead.rejectionReason)}</small>
                  )}
                </td>
                <td>
                  {new Date(lead.createdAt).toLocaleString("ru-RU")}
                  {lead.firstContactOverdue && <span className="admin-sla-badge">SLA просрочен</span>}
                  {lead.actionOverdue && <span className="admin-action-badge">Действие просрочено</span>}
                </td>
              </tr>
            ))}
            {leads.length === 0 && !error && <tr><td colSpan={6}>По заданным условиям заявок нет.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="admin-pagination">
        <span>{total} заявок · страница {page}</span>
        <div>
          <button className="admin-button-secondary" disabled={page <= 1} onClick={() => { const nextPage = page - 1; setPage(nextPage); void loadLeads(search, status, sla, nextPage); }} type="button">Назад</button>
          <button className="admin-button-secondary" disabled={page * 30 >= total} onClick={() => { const nextPage = page + 1; setPage(nextPage); void loadLeads(search, status, sla, nextPage); }} type="button">Далее</button>
        </div>
      </div>
    </section>
  );
}

export { statuses as adminLeadStatuses, statusLabel };
