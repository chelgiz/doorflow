"use client";

import { FormEvent, useRef, useState } from "react";
import { formatMinorUnits, parseRublesToMinor } from "@/lib/money";

type Payment = {
  id: string;
  amountMinor: number;
  note: string | null;
  createdAt: string;
  receivedBy: { email: string };
};
type Installation = {
  id: string;
  status: string;
  scheduledAt: string;
  address: string;
  assignedInstaller: { id: string; email: string } | null;
};
type Delivery = {
  id: string;
  status: string;
  scheduledAt: string;
  address: string;
  result: string | null;
  deliveredAt: string | null;
  assignedEmployee: { id: string; email: string } | null;
};
type Order = {
  id: string;
  status: string;
  customerName: string;
  phone: string;
  address: string | null;
  currency: string;
  configurationSnapshot: unknown;
  sourceQuoteSnapshot: unknown;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  costMinor: number | null;
  prepaymentMinor: number;
  balanceMinor: number;
  manager: { id: string; email: string };
  lead: { id: string };
  payments: Payment[];
  installation: Installation | null;
  delivery: Delivery | null;
};
type AuditEntry = { id: string; action: string; changes: unknown; actorEmail: string; createdAt: string };

const deliveryStatusLabels: Record<string, string> = {
  SCHEDULED: "Запланирована",
  CONFIRMED: "Подтверждена",
  IN_PROGRESS: "В пути",
  DELIVERED: "Доставлено",
  FAILED: "Не доставлено",
  CANCELLED: "Отменена",
};

function deliveryStatusLabel(status: string) {
  return deliveryStatusLabels[status] ?? status;
}

const transitions: Record<string, string[]> = {
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "IN_PROGRESS"],
  COMPLETED: [],
  CANCELLED: [],
};

export function AdminOrderDetail({
  initialOrder,
  initialAudit,
  installers,
  employees,
}: {
  initialOrder: Order;
  initialAudit: AuditEntry[];
  installers: Array<{ id: string; email: string }>;
  employees: Array<{ id: string; email: string; role: string }>;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [audit, setAudit] = useState(initialAudit);
  const [status, setStatus] = useState(initialOrder.status);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const paymentRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const [installAt, setInstallAt] = useState("");
  const [installAddress, setInstallAddress] = useState(initialOrder.address ?? "");
  const [installerId, setInstallerId] = useState("");
  const [deliveryAt, setDeliveryAt] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState(initialOrder.address ?? "");
  const [deliveryEmployeeId, setDeliveryEmployeeId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function responseData(response: Response) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Не удалось выполнить операцию");
    return data;
  }

  async function refresh() {
    const data = await responseData(await fetch(`/api/admin/orders/${order.id}`, { cache: "no-store" }));
    setOrder(data.order);
    setAudit(data.audit);
    setStatus(data.order.status);
  }

  async function updateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === order.status) return;
    setError("");
    setMessage("");
    try {
      await responseData(await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      }));
      await refresh();
      setMessage("Статус изменён, изменение записано в историю.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось изменить заказ");
    }
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = parseRublesToMinor(paymentAmount);
    if (!amountMinor || amountMinor <= 0) {
      setError("Введите сумму больше нуля с точностью до копейки.");
      return;
    }
    setError("");
    setMessage("");
    const fingerprint = JSON.stringify({ amountMinor, note: paymentNote });
    if (paymentRequest.current?.fingerprint !== fingerprint) {
      paymentRequest.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      await responseData(await fetch(`/api/admin/orders/${order.id}/payments`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": paymentRequest.current.key,
        },
        body: JSON.stringify({ amountMinor, note: paymentNote }),
      }));
      paymentRequest.current = null;
      setPaymentAmount("");
      setPaymentNote("");
      await refresh();
      setMessage("Платёж добавлен в неизменяемый финансовый журнал.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось зарегистрировать платёж");
    }
  }

  async function scheduleDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const data = await responseData(await fetch("/api/admin/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          assignedEmployeeId: deliveryEmployeeId || null,
          scheduledAt: new Date(deliveryAt).toISOString(),
          address: deliveryAddress,
        }),
      }));
      setOrder({ ...order, delivery: data.delivery });
      setMessage("Доставка запланирована.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось запланировать доставку");
    }
  }

  async function scheduleInstallation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const data = await responseData(await fetch("/api/admin/installations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          assignedInstallerId: installerId || null,
          scheduledAt: new Date(installAt).toISOString(),
          address: installAddress,
        }),
      }));
      setOrder({ ...order, installation: data.installation });
      setMessage("Установка запланирована.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось запланировать установку");
    }
  }

  return (
    <div className="admin-detail-grid">
      <section className="admin-panel">
        <h2>{order.customerName}</h2>
        <dl className="admin-definition-list">
          <dt>Телефон</dt><dd><a href={`tel:${order.phone}`}>{order.phone}</a></dd>
          <dt>Адрес</dt><dd>{order.address ?? "Не указан"}</dd>
          <dt>Ответственный</dt><dd>{order.manager.email}</dd>
          <dt>Подытог</dt><dd>{formatMinorUnits(order.subtotalMinor, order.currency)}</dd>
          <dt>Скидка</dt><dd>{formatMinorUnits(order.discountMinor, order.currency)}</dd>
          <dt>Сумма заказа</dt><dd><strong>{formatMinorUnits(order.totalMinor, order.currency)}</strong></dd>
          <dt>Себестоимость</dt><dd>{order.costMinor === null ? "Не указана" : formatMinorUnits(order.costMinor, order.currency)}</dd>
          <dt>Валовая прибыль</dt><dd>{order.costMinor === null ? "Не рассчитана: себестоимость неизвестна" : formatMinorUnits(order.totalMinor - order.costMinor, order.currency)}</dd>
          <dt>Предоплата</dt><dd>{formatMinorUnits(order.prepaymentMinor, order.currency)}</dd>
          <dt>Остаток</dt><dd>{formatMinorUnits(order.balanceMinor, order.currency)}</dd>
        </dl>
        <div className="admin-json-block"><h3>Зафиксированная комплектация</h3><pre>{JSON.stringify(order.configurationSnapshot, null, 2)}</pre></div>
        <div className="admin-json-block"><h3>Снимок цены заявки</h3><pre>{JSON.stringify(order.sourceQuoteSnapshot, null, 2)}</pre></div>
      </section>
      <div className="admin-stack">
        <section className="admin-panel">
          <h2>Статус заказа</h2>
          <form className="admin-stack" onSubmit={updateStatus}>
            <label>Статус
              <select onChange={(event) => setStatus(event.target.value)} value={status}>
                <option value={status}>{status}</option>
                {(transitions[status] ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <button className="button button-accent" disabled={status === order.status} type="submit">Сохранить статус</button>
          </form>
        </section>
        <section className="admin-panel">
          <h2>Платежи</h2>
          <p>Остаток: <strong>{formatMinorUnits(order.balanceMinor, order.currency)}</strong></p>
          <form className="admin-stack" onSubmit={recordPayment}>
            <label>Сумма, руб.<input inputMode="decimal" onChange={(event) => setPaymentAmount(event.target.value)} required value={paymentAmount} /></label>
            <label>Комментарий<input maxLength={500} onChange={(event) => setPaymentNote(event.target.value)} value={paymentNote} /></label>
            <button className="button button-accent" disabled={order.balanceMinor === 0 || order.status === "CANCELLED"} type="submit">Зафиксировать платёж</button>
          </form>
          <ol className="admin-history">
            {order.payments.map((payment) => (
              <li key={payment.id}><strong>{formatMinorUnits(payment.amountMinor, order.currency)}</strong><time>{new Date(payment.createdAt).toLocaleString("ru-RU")}</time><span>{payment.receivedBy.email}</span>{payment.note && <p>{payment.note}</p>}</li>
            ))}
          </ol>
        </section>
        <section className="admin-panel">
          <h2>Доставка</h2>
          {order.delivery ? (
            <>
              <p>
                <a className="admin-record-link" href={`/admin/deliveries/${order.delivery.id}`}>
                  {new Date(order.delivery.scheduledAt).toLocaleString("ru-RU")} · {deliveryStatusLabel(order.delivery.status)} · открыть доставку
                </a>
              </p>
              <p className="admin-muted">Адрес: {order.delivery.address}</p>
              <p className="admin-muted">
                Исполнитель: {order.delivery.assignedEmployee?.email ?? "не назначен"}
              </p>
              {order.delivery.deliveredAt && (
                <p className="admin-success">
                  Доставлено: {new Date(order.delivery.deliveredAt).toLocaleString("ru-RU")}
                </p>
              )}
            </>
          ) : (
            <form className="admin-stack" onSubmit={scheduleDelivery}>
              <label>Дата и время<input onChange={(event) => setDeliveryAt(event.target.value)} required type="datetime-local" value={deliveryAt} /></label>
              <label>Адрес<input maxLength={300} onChange={(event) => setDeliveryAddress(event.target.value)} required value={deliveryAddress} /></label>
              <label>Исполнитель
                <select onChange={(event) => setDeliveryEmployeeId(event.target.value)} value={deliveryEmployeeId}>
                  <option value="">Не назначен</option>
                  {employees.map((person) => <option key={person.id} value={person.id}>{person.email} · {person.role}</option>)}
                </select>
              </label>
              <button className="button button-accent" type="submit">Запланировать доставку</button>
            </form>
          )}
        </section>
        <section className="admin-panel">
          <h2>Установка</h2>
          {order.installation ? (
            <p><a className="admin-record-link" href={`/admin/installations/${order.installation.id}`}>{new Date(order.installation.scheduledAt).toLocaleString("ru-RU")} · {order.installation.status} · открыть задачу</a></p>
          ) : (
            <form className="admin-stack" onSubmit={scheduleInstallation}>
              <label>Дата и время<input onChange={(event) => setInstallAt(event.target.value)} required type="datetime-local" value={installAt} /></label>
              <label>Адрес<input maxLength={300} onChange={(event) => setInstallAddress(event.target.value)} required value={installAddress} /></label>
              <label>Установщик
                <select onChange={(event) => setInstallerId(event.target.value)} value={installerId}>
                  <option value="">Не назначен</option>
                  {installers.map((person) => <option key={person.id} value={person.id}>{person.email}</option>)}
                </select>
              </label>
              <button className="button button-accent" type="submit">Запланировать установку</button>
            </form>
          )}
        </section>
        <section className="admin-panel">
          <h2>История финансовых и статусных изменений</h2>
          <ol className="admin-history">
            {audit.map((entry) => <li key={entry.id}><strong>{entry.action}</strong><time>{new Date(entry.createdAt).toLocaleString("ru-RU")}</time><span>{entry.actorEmail}</span><pre>{JSON.stringify(entry.changes, null, 2)}</pre></li>)}
          </ol>
        </section>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {message && <p className="admin-success" role="status">{message}</p>}
    </div>
  );
}
