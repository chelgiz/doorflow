"use client";

import { FormEvent, useState } from "react";
import { adminLeadStatuses, statusLabel } from "@/components/admin/admin-leads";
import { AdminLeadOperations, type CustomerHistory } from "@/components/admin/admin-lead-operations";

export type LeadDetailData = {
  id: string;
  type: "ORDER" | "MEASUREMENT";
  status: string;
  customerName: string;
  phone: string;
  address: string | null;
  comment: string | null;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  selectedConfiguration: unknown;
  quoteSnapshot: unknown;
  personalDataConsentAt: string;
  consentNoticeVersion: string;
  createdAt: string;
  product: { id: string; name: string; model: string; slug: string } | null;
  statusHistory: Array<{
    id: string;
    from: string | null;
    to: string;
    note: string | null;
    changedAt: string;
    changedBy: { email: string; role: string } | null;
  }>;
  customerActivities: Array<{
    id: string;
    type: string;
    body: string;
    createdAt: string;
    createdBy: { email: string };
  }>;
  measurements: Array<{
    id: string;
    status: string;
    scheduledAt: string;
    address: string;
    assignedMeasurer: { id: string; email: string } | null;
  }>;
  order: { id: string; status: string; totalMinor: number; currency: string } | null;
};

export function AdminLeadDetail({
  id,
  initialLead,
  measurers,
  managers,
  customerHistory,
}: {
  id: string;
  initialLead: LeadDetailData;
  measurers: Array<{ id: string; email: string }>;
  managers: Array<{ id: string; email: string }>;
  customerHistory: CustomerHistory;
}) {
  const [lead, setLead] = useState<LeadDetailData>(initialLead);
  const [status, setStatus] = useState(initialLead.status);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/leads/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось обновить статус");
      const refreshedResponse = await fetch(`/api/admin/leads/${id}`, { cache: "no-store" });
      const refreshed = await refreshedResponse.json();
      if (!refreshedResponse.ok) throw new Error(refreshed.error ?? "Не удалось обновить карточку");
      setLead(refreshed.lead);
      setStatus(refreshed.lead.status);
      setNote("");
      setMessage("Статус изменён, запись добавлена в историю.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось обновить статус");
    }
  }

  const attribution = [
    ["Источник", lead.source],
    ["UTM source", lead.utmSource],
    ["UTM medium", lead.utmMedium],
    ["UTM campaign", lead.utmCampaign],
    ["UTM content", lead.utmContent],
    ["UTM term", lead.utmTerm],
  ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0);

  return (
    <div className="admin-detail-grid">
      <section className="admin-panel">
        <h2>{lead.customerName}</h2>
        <dl className="admin-definition-list">
          <dt>Телефон</dt><dd><a href={`tel:${lead.phone}`}>{lead.phone}</a></dd>
          <dt>Тип обращения</dt><dd>{lead.type === "ORDER" ? "Заказ" : "Вызов замерщика"}</dd>
          <dt>Адрес</dt><dd>{lead.address || "Не указан"}</dd>
          <dt>Дверь</dt><dd>{lead.product ? `${lead.product.name} · ${lead.product.model}` : "Не выбрана"}</dd>
          <dt>Комментарий</dt><dd>{lead.comment || "Нет"}</dd>
          <dt>Создана</dt><dd>{new Date(lead.createdAt).toLocaleString("ru-RU")}</dd>
          <dt>Согласие</dt><dd>{new Date(lead.personalDataConsentAt).toLocaleString("ru-RU")} · {lead.consentNoticeVersion}</dd>
          {attribution.map(([label, value]) => <div className="admin-definition-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {Boolean(lead.selectedConfiguration) && (
          <div className="admin-json-block"><h3>Выбранная комплектация</h3><pre>{JSON.stringify(lead.selectedConfiguration, null, 2)}</pre></div>
        )}
        {Boolean(lead.quoteSnapshot) && (
          <div className="admin-json-block"><h3>Снимок расчёта на момент заявки</h3><pre>{JSON.stringify(lead.quoteSnapshot, null, 2)}</pre></div>
        )}
      </section>
      <div className="admin-stack">
        <section className="admin-panel">
          <h2>Статус заявки</h2>
          <form className="admin-stack" onSubmit={saveStatus}>
            <label>Новый статус
              <select onChange={(event) => setStatus(event.target.value)} value={status}>
                {adminLeadStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Комментарий к изменению<textarea onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} value={note} /></label>
            {error && <p className="admin-error" role="alert">{error}</p>}
            {message && <p className="admin-success" role="status">{message}</p>}
            <button className="button button-accent" type="submit">Сохранить статус</button>
          </form>
        </section>
        <section className="admin-panel">
          <h2>История изменений</h2>
          <ol className="admin-history">
            {lead.statusHistory.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.from ? `${statusLabel(entry.from)} → ` : ""}{statusLabel(entry.to)}</strong>
                <time>{new Date(entry.changedAt).toLocaleString("ru-RU")}</time>
                <span>{entry.changedBy?.email ?? "Система"}</span>
                {entry.note && <p>{entry.note}</p>}
              </li>
            ))}
          </ol>
        </section>
      </div>
      <AdminLeadOperations
        leadId={lead.id}
        leadType={lead.type}
        leadAddress={lead.address}
        measurements={lead.measurements}
        customerHistory={customerHistory}
        order={lead.order}
        measurers={measurers}
        managers={managers}
      />
    </div>
  );
}
