"use client";

import { FormEvent, useState } from "react";
import { adminLeadStatuses, statusLabel } from "@/components/admin/admin-leads";
import { AdminLeadOperations, type CustomerHistory } from "@/components/admin/admin-lead-operations";
import { REJECTION_REASON_CODES, rejectionReasonLabel } from "@/lib/admin/rejection-reasons";

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
  assignedManager: { id: string; email: string } | null;
  firstContactAt: string | null;
  nextActionAt: string | null;
  rejectionReason: string | null;
};

function toLocalInputValue(isoDate: string) {
  const date = new Date(isoDate);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AdminLeadDetail({
  id,
  initialLead,
  measurers,
  managers,
  customerHistory,
  canAssign,
  canWrite,
  firstContactOverdue,
  actionOverdue,
}: {
  id: string;
  initialLead: LeadDetailData;
  measurers: Array<{ id: string; email: string }>;
  managers: Array<{ id: string; email: string }>;
  customerHistory: CustomerHistory;
  canAssign: boolean;
  canWrite: boolean;
  firstContactOverdue: boolean;
  actionOverdue: boolean;
}) {
  const [lead, setLead] = useState<LeadDetailData>(initialLead);
  const [status, setStatus] = useState(initialLead.status);
  const [rejectionReason, setRejectionReason] = useState(initialLead.rejectionReason ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [assignedManagerId, setAssignedManagerId] = useState(initialLead.assignedManager?.id ?? "");
  const [assignError, setAssignError] = useState("");
  const [assignMessage, setAssignMessage] = useState("");
  const [contactError, setContactError] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [nextActionAt, setNextActionAt] = useState(
    initialLead.nextActionAt ? toLocalInputValue(initialLead.nextActionAt) : "",
  );
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  async function saveNextAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setActionMessage("");
    try {
      const response = await fetch(`/api/admin/leads/${id}/next-action`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось сохранить напоминание");
      const refreshedResponse = await fetch(`/api/admin/leads/${id}`, { cache: "no-store" });
      const refreshed = await refreshedResponse.json();
      if (!refreshedResponse.ok) throw new Error(refreshed.error ?? "Не удалось обновить карточку");
      setLead(refreshed.lead);
      setNextActionAt(refreshed.lead.nextActionAt ? toLocalInputValue(refreshed.lead.nextActionAt) : "");
      setActionMessage(refreshed.lead.nextActionAt ? "Напоминание сохранено" : "Напоминание снято");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Не удалось сохранить напоминание");
    }
  }

  async function recordFirstContact() {
    setContactError("");
    setContactMessage("");
    try {
      const response = await fetch(`/api/admin/leads/${id}/contact`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось зафиксировать контакт");
      const refreshedResponse = await fetch(`/api/admin/leads/${id}`, { cache: "no-store" });
      const refreshed = await refreshedResponse.json();
      if (!refreshedResponse.ok) throw new Error(refreshed.error ?? "Не удалось обновить карточку");
      setLead(refreshed.lead);
      setContactMessage(result.message ?? "Первый контакт зафиксирован");
    } catch (caught) {
      setContactError(caught instanceof Error ? caught.message : "Не удалось зафиксировать контакт");
    }
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignError("");
    setAssignMessage("");
    try {
      const response = await fetch(`/api/admin/leads/${id}/assign`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ managerId: assignedManagerId || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось назначить менеджера");
      const refreshedResponse = await fetch(`/api/admin/leads/${id}`, { cache: "no-store" });
      const refreshed = await refreshedResponse.json();
      if (!refreshedResponse.ok) throw new Error(refreshed.error ?? "Не удалось обновить карточку");
      setLead(refreshed.lead);
      setAssignedManagerId(refreshed.lead.assignedManager?.id ?? "");
      setAssignMessage(
        refreshed.lead.assignedManager
          ? `Ответственный: ${refreshed.lead.assignedManager.email}`
          : "Ответственный снят",
      );
    } catch (caught) {
      setAssignError(caught instanceof Error ? caught.message : "Не удалось назначить менеджера");
    }
  }

  async function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/leads/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          note,
          ...(status === "REJECTED" && rejectionReason ? { rejectionReason } : {}),
        }),
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
          <h2>Следующее действие</h2>
          {lead.nextActionAt ? (
            <p className={actionOverdue ? "admin-error" : "admin-muted"} role={actionOverdue ? "alert" : undefined}>
              Запланировано: {new Date(lead.nextActionAt).toLocaleString("ru-RU")}
              {actionOverdue ? " — просрочено" : ""}
            </p>
          ) : (
            <p className="admin-muted">Действие не запланировано.</p>
          )}
          <form className="admin-stack" onSubmit={saveNextAction}>
            <label>Когда связаться
              <input
                onChange={(event) => setNextActionAt(event.target.value)}
                type="datetime-local"
                value={nextActionAt}
              />
            </label>
            {actionError && <p className="admin-error" role="alert">{actionError}</p>}
            {actionMessage && <p className="admin-success" role="status">{actionMessage}</p>}
            <div className="admin-actions">
              <button className="button button-accent" type="submit">Сохранить напоминание</button>
              <button
                className="admin-text-button"
                onClick={() => setNextActionAt("")}
                type="button"
              >
                Очистить
              </button>
            </div>
          </form>
        </section>
        <section className="admin-panel">
          <h2>Первый контакт (SLA 2 ч)</h2>
          {lead.firstContactAt ? (
            <p className="admin-success" role="status">
              Зафиксирован: {new Date(lead.firstContactAt).toLocaleString("ru-RU")}
            </p>
          ) : firstContactOverdue ? (
            <p className="admin-error" role="alert">
              Просрочен: с момента заявки прошло больше 2 часов, контакт не зафиксирован.
            </p>
          ) : (
            <p className="admin-muted">Ожидает первого контакта — SLA 2 часа ещё не истёк.</p>
          )}
          {canWrite && !lead.firstContactAt && (
            <button className="button button-accent" onClick={recordFirstContact} type="button">
              Зафиксировать первый контакт
            </button>
          )}
          {contactError && <p className="admin-error" role="alert">{contactError}</p>}
          {contactMessage && <p className="admin-success" role="status">{contactMessage}</p>}
        </section>
        <section className="admin-panel">
          <h2>Ответственный менеджер</h2>
          <p className="admin-muted">
            {lead.assignedManager
              ? `Назначен: ${lead.assignedManager.email}`
              : "Ответственный не назначен. Менеджеры видят только назначенные им заявки."}
          </p>
          {canAssign ? (
            <form className="admin-stack" onSubmit={saveAssignment}>
              <label>Менеджер
                <select onChange={(event) => setAssignedManagerId(event.target.value)} value={assignedManagerId}>
                  <option value="">Не назначен</option>
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>{manager.email}</option>
                  ))}
                </select>
              </label>
              {assignError && <p className="admin-error" role="alert">{assignError}</p>}
              {assignMessage && <p className="admin-success" role="status">{assignMessage}</p>}
              <button className="button button-accent" type="submit">Сохранить ответственного</button>
            </form>
          ) : (
            <p className="admin-muted">Назначать ответственного может владелец или администратор.</p>
          )}
        </section>
        <section className="admin-panel">
          <h2>Статус заявки</h2>
          {lead.rejectionReason && (
            <p className="admin-muted">Причина отказа: {rejectionReasonLabel(lead.rejectionReason)}</p>
          )}
          <form className="admin-stack" onSubmit={saveStatus}>
            <label>Новый статус
              <select onChange={(event) => setStatus(event.target.value)} value={status}>
                {adminLeadStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {status === "REJECTED" && (
              <label>Причина отказа (обязательно)
                <select onChange={(event) => setRejectionReason(event.target.value)} value={rejectionReason}>
                  <option value="">Выберите причину</option>
                  {REJECTION_REASON_CODES.map((code) => (
                    <option key={code} value={code}>{rejectionReasonLabel(code)}</option>
                  ))}
                </select>
              </label>
            )}
            <label>Комментарий к изменению<textarea onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} value={note} /></label>
            {error && <p className="admin-error" role="alert">{error}</p>}
            {message && <p className="admin-success" role="status">{message}</p>}
            <button
              className="button button-accent"
              disabled={status === "REJECTED" && !rejectionReason}
              type="submit"
            >
              Сохранить статус
            </button>
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
