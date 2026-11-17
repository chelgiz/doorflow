"use client";

import { FormEvent, useState } from "react";

type DeliveryData = {
  id: string;
  status: string;
  scheduledAt: string;
  address: string;
  result: string | null;
  comments: string | null;
  deliveredAt: string | null;
  order: { id: string; customerName: string; phone: string; address: string | null };
  assignedEmployee: { id: string; email: string } | null;
};

type AuditEntry = {
  id: string;
  action: string;
  changes: unknown;
  actorEmail: string;
  createdAt: string;
};

const statusLabels: Record<string, string> = {
  SCHEDULED: "Запланирована",
  CONFIRMED: "Подтверждена",
  IN_PROGRESS: "В пути",
  DELIVERED: "Доставлено",
  FAILED: "Не доставлено",
  CANCELLED: "Отменена",
};

const transitions: Record<string, string[]> = {
  SCHEDULED: ["CONFIRMED", "IN_PROGRESS", "FAILED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "FAILED", "CANCELLED"],
  IN_PROGRESS: ["DELIVERED", "FAILED"],
  DELIVERED: [],
  FAILED: ["SCHEDULED", "CANCELLED"],
  CANCELLED: [],
};

function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AdminDeliveryDetail({
  deliveryId,
  initialDelivery,
  initialAudit,
  employees,
}: {
  deliveryId: string;
  initialDelivery: DeliveryData;
  initialAudit: AuditEntry[];
  employees: Array<{ id: string; email: string; role: string }>;
}) {
  const [delivery, setDelivery] = useState(initialDelivery);
  const [audit, setAudit] = useState(initialAudit);
  const [status, setStatus] = useState(initialDelivery.status);
  const [scheduledAt, setScheduledAt] = useState(localDateTime(initialDelivery.scheduledAt));
  const [address, setAddress] = useState(initialDelivery.address);
  const [employeeId, setEmployeeId] = useState(initialDelivery.assignedEmployee?.id ?? "");
  const [result, setResult] = useState(initialDelivery.result ?? "");
  const [comments, setComments] = useState(initialDelivery.comments ?? "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const allowed = status === delivery.status ? [] : transitions[delivery.status] ?? [];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        assignedEmployeeId: employeeId || null,
        scheduledAt: new Date(scheduledAt).toISOString(),
        address,
        comments,
        result,
      };
      if (status !== delivery.status) payload.status = status;
      const response = await fetch(`/api/admin/deliveries/${deliveryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось сохранить доставку");
      const refreshed = await fetch(`/api/admin/deliveries/${deliveryId}`, { cache: "no-store" });
      const refreshedBody = await refreshed.json();
      if (!refreshed.ok) throw new Error(refreshedBody.error ?? "Не удалось обновить карточку");
      setDelivery(refreshedBody.delivery);
      setAudit(refreshedBody.audit);
      setStatus(refreshedBody.delivery.status);
      setScheduledAt(localDateTime(refreshedBody.delivery.scheduledAt));
      setMessage("Доставка обновлена.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить доставку");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="admin-panel">
        <h2>Заказ</h2>
        <dl className="admin-definition-list">
          <dt>Клиент</dt>
          <dd>{delivery.order.customerName}</dd>
          <dt>Телефон</dt>
          <dd>{delivery.order.phone}</dd>
          <dt>Адрес заказа</dt>
          <dd>{delivery.order.address ?? "Не указан"}</dd>
          <dt>Статус доставки</dt>
          <dd>{statusLabels[delivery.status] ?? delivery.status}</dd>
          {delivery.deliveredAt && (
            <>
              <dt>Доставлено</dt>
              <dd>{new Date(delivery.deliveredAt).toLocaleString("ru-RU")}</dd>
            </>
          )}
        </dl>
      </section>

      <section className="admin-panel">
        <h2>Параметры доставки</h2>
        <form className="admin-stack" onSubmit={save}>
          <label>
            Дата и время
            <input onChange={(event) => setScheduledAt(event.target.value)} type="datetime-local" value={scheduledAt} />
          </label>
          <label>
            Адрес доставки
            <input onChange={(event) => setAddress(event.target.value)} value={address} />
          </label>
          <label>
            Исполнитель
            <select onChange={(event) => setEmployeeId(event.target.value)} value={employeeId}>
              <option value="">Не назначен</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.email} · {employee.role}
                </option>
              ))}
            </select>
          </label>
          <label>
            Статус
            <select onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value={delivery.status}>{statusLabels[delivery.status] ?? delivery.status}</option>
              {allowed.map((next) => (
                <option key={next} value={next}>{statusLabels[next] ?? next}</option>
              ))}
            </select>
          </label>
          <label>
            Что доставлено (результат)
            <textarea onChange={(event) => setResult(event.target.value)} rows={3} value={result} />
          </label>
          <label>
            Комментарий
            <textarea onChange={(event) => setComments(event.target.value)} rows={3} value={comments} />
          </label>
          {error && <p className="admin-error" role="alert">{error}</p>}
          {message && <p className="admin-success" role="status">{message}</p>}
          <button className="button button-accent" disabled={busy} type="submit">
            {busy ? "Сохраняем…" : "Сохранить доставку"}
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <h2>История изменений</h2>
        <ol className="admin-history">
          {audit.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.action}</strong>
              <small>{entry.actorEmail} · {new Date(entry.createdAt).toLocaleString("ru-RU")}</small>
              <pre>{JSON.stringify(entry.changes, null, 2)}</pre>
            </li>
          ))}
        </ol>
        {audit.length === 0 && <p className="admin-empty">Изменений пока нет.</p>}
      </section>
    </>
  );
}
