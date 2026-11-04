"use client";

import { FormEvent, useState } from "react";
import { formatMinorUnits, parseRublesToMinor } from "@/lib/money";

type StaffOption = { id: string; email: string };
type Activity = {
  id: string;
  leadId: string;
  type: string;
  body: string;
  createdAt: string;
  createdBy: { email: string };
};
type Measurement = {
  id: string;
  status: string;
  scheduledAt: string;
  address: string;
  assignedMeasurer: { id: string; email: string } | null;
};
type ExistingOrder = { id: string; status: string; totalMinor: number; currency: string } | null;
export type CustomerHistory = {
  leads: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    address: string | null;
    comment: string | null;
    product: { name: string; model: string } | null;
    statusHistory: Array<{ from: string | null; to: string; note: string | null; changedAt: string }>;
    measurements: Array<{ id: string; status: string; scheduledAt: string; address: string; assignedMeasurer: { email: string } | null }>;
    order: { id: string; status: string; totalMinor: number; currency: string } | null;
  }>;
  activities: Activity[];
};

export function AdminLeadOperations({
  leadId,
  leadType,
  leadAddress,
  measurements: initialMeasurements,
  customerHistory: initialCustomerHistory,
  order: initialOrder,
  measurers,
  managers,
}: {
  leadId: string;
  leadType: "ORDER" | "MEASUREMENT";
  leadAddress: string | null;
  measurements: Measurement[];
  customerHistory: CustomerHistory;
  order: ExistingOrder;
  measurers: StaffOption[];
  managers: StaffOption[];
}) {
  const [measurements, setMeasurements] = useState(initialMeasurements);
  const [customerHistory, setCustomerHistory] = useState(initialCustomerHistory);
  const [order, setOrder] = useState(initialOrder);
  const [scheduledAt, setScheduledAt] = useState("");
  const [address, setAddress] = useState(leadAddress ?? "");
  const [measurerId, setMeasurerId] = useState("");
  const [activityType, setActivityType] = useState("NOTE");
  const [activityBody, setActivityBody] = useState("");
  const [discount, setDiscount] = useState("");
  const [cost, setCost] = useState("");
  const [prepayment, setPrepayment] = useState("");
  const [managerId, setManagerId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function responseData(response: Response) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Не удалось выполнить операцию");
    return data;
  }

  async function refresh() {
    const data = await responseData(await fetch(`/api/admin/leads/${leadId}`, { cache: "no-store" }));
    setMeasurements(data.lead.measurements);
    setCustomerHistory(data.customerHistory);
    setOrder(data.lead.order);
  }

  async function scheduleMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await responseData(await fetch("/api/admin/measurements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId,
          assignedMeasurerId: measurerId || null,
          scheduledAt: new Date(scheduledAt).toISOString(),
          address,
        }),
      }));
      setScheduledAt("");
      await refresh();
      setMessage("Замер запланирован и сохранён.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось запланировать замер");
    }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const discountMinor = discount ? parseRublesToMinor(discount) : 0;
    const costMinor = cost ? parseRublesToMinor(cost) : null;
    const prepaymentMinor = prepayment ? parseRublesToMinor(prepayment) : 0;
    if (discountMinor === null || costMinor === null && cost.length > 0 || prepaymentMinor === null) {
      setError("Введите суммы в рублях: например 1250 или 1250,50.");
      return;
    }
    try {
      const data = await responseData(await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId,
          ...(managerId ? { managerId } : {}),
          discountMinor,
          costMinor,
          prepaymentMinor,
        }),
      }));
      setOrder(data.order);
      setMessage("Заказ создан из сохранённого снимка заявки.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать заказ");
    }
  }

  async function recordActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await responseData(await fetch(`/api/admin/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: activityType, body: activityBody }),
      }));
      setActivityBody("");
      await refresh();
      setMessage("Запись добавлена в историю клиента.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить запись");
    }
  }

  return (
    <div className="admin-stack admin-lead-operations">
      {leadType === "MEASUREMENT" && (
        <section className="admin-panel">
          <h2>Планирование замера</h2>
          <form className="admin-form-grid" onSubmit={scheduleMeasurement}>
            <label>Дата и время<input onChange={(event) => setScheduledAt(event.target.value)} required type="datetime-local" value={scheduledAt} /></label>
            <label>Адрес<input maxLength={300} onChange={(event) => setAddress(event.target.value)} required value={address} /></label>
            <label>Замерщик
              <select onChange={(event) => setMeasurerId(event.target.value)} value={measurerId}>
                <option value="">Не назначен</option>
                {measurers.map((person) => <option key={person.id} value={person.id}>{person.email}</option>)}
              </select>
            </label>
            <div className="admin-form-wide"><button className="button button-accent" type="submit">Запланировать замер</button></div>
          </form>
          <ul className="admin-compact-list">
            {measurements.map((item) => (
              <li key={item.id}>
                <strong>{new Date(item.scheduledAt).toLocaleString("ru-RU")} · {item.status}</strong>
                <span>{item.address} · {item.assignedMeasurer?.email ?? "Не назначен"}</span>
                <a href={`/admin/measurements/${item.id}`}>Открыть задачу</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {leadType === "ORDER" && (
        <section className="admin-panel">
          <h2>Заказ</h2>
          {order ? (
            <p><a className="admin-record-link" href={`/admin/orders/${order.id}`}>Открыть заказ · {formatMinorUnits(order.totalMinor, order.currency)} · {order.status}</a></p>
          ) : (
            <form className="admin-form-grid" onSubmit={createOrder}>
              <label>Скидка, руб.<input inputMode="decimal" onChange={(event) => setDiscount(event.target.value)} placeholder="0" value={discount} /></label>
              <label>Себестоимость, руб.<input inputMode="decimal" onChange={(event) => setCost(event.target.value)} placeholder="Оставьте пустым, если неизвестна" value={cost} /></label>
              <label>Предоплата, руб.<input inputMode="decimal" onChange={(event) => setPrepayment(event.target.value)} placeholder="0" value={prepayment} /></label>
              <label>Ответственный менеджер
                <select onChange={(event) => setManagerId(event.target.value)} value={managerId}>
                  <option value="">Текущий сотрудник</option>
                  {managers.map((person) => <option key={person.id} value={person.id}>{person.email}</option>)}
                </select>
              </label>
              <div className="admin-form-wide">
                <p className="admin-muted">Цена и комплектация берутся только из сохранённой заявки. Денежные значения отправляются серверу в копейках. Неизвестная себестоимость остаётся пустой.</p>
                <button className="button button-accent" type="submit">Создать заказ</button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="admin-panel">
        <h2>Новая запись в истории клиента</h2>
        <form className="admin-inline-form" onSubmit={recordActivity}>
          <label>Тип записи
            <select onChange={(event) => setActivityType(event.target.value)} value={activityType}>
              <option value="NOTE">Внутренняя заметка</option>
              <option value="CALL">Звонок зафиксирован сотрудником</option>
              <option value="SMS">SMS, отправленное вне системы</option>
              <option value="EMAIL">Письмо, отправленное вне системы</option>
              <option value="OTHER">Другое</option>
            </select>
          </label>
          <label>Описание<textarea onChange={(event) => setActivityBody(event.target.value)} required rows={2} value={activityBody} /></label>
          <button className="button button-accent" type="submit">Добавить в историю</button>
        </form>
        <p className="admin-muted">Фиксируется только запись сотрудника. Звонки и сообщения автоматически не отправляются.</p>
      </section>
      <section className="admin-panel admin-customer-history">
        <h2>Все обращения и операции по телефону</h2>
        <div className="admin-compact-list">
          {customerHistory.leads.map((item) => (
            <article key={item.id}>
              <strong><a href={`/admin/leads/${item.id}`}>{item.type === "ORDER" ? "Заявка на заказ" : "Заявка на замер"} · {item.status}</a></strong>
              <span>{new Date(item.createdAt).toLocaleString("ru-RU")} · {item.address ?? "Адрес не указан"}</span>
              {item.product && <span>{item.product.name} · {item.product.model}</span>}
              {item.order && <span>Заказ: {item.order.status} · {formatMinorUnits(item.order.totalMinor, item.order.currency)} · <a href={`/admin/orders/${item.order.id}`}>открыть</a></span>}
              {item.measurements.map((measurement) => (
                <span key={measurement.id}>Замер {new Date(measurement.scheduledAt).toLocaleString("ru-RU")} · {measurement.status} · {measurement.assignedMeasurer?.email ?? "Не назначен"}</span>
              ))}
              {item.statusHistory.map((entry, index) => (
                <small key={`${item.id}-${index}`}>{entry.from ? `${entry.from} → ` : ""}{entry.to} · {new Date(entry.changedAt).toLocaleString("ru-RU")}{entry.note ? ` · ${entry.note}` : ""}</small>
              ))}
            </article>
          ))}
        </div>
        <h3>Заметки и коммуникации, внесённые сотрудниками</h3>
        <ol className="admin-history">
          {customerHistory.activities.map((activity) => (
            <li key={activity.id}>
              <strong>{activity.type} · <a href={`/admin/leads/${activity.leadId}`}>обращение</a></strong>
              <time>{new Date(activity.createdAt).toLocaleString("ru-RU")}</time>
              <span>{activity.createdBy.email}</span>
              <p>{activity.body}</p>
            </li>
          ))}
        </ol>
        {error && <p className="admin-error" role="alert">{error}</p>}
        {message && <p className="admin-success" role="status">{message}</p>}
      </section>
    </div>
  );
}
