"use client";

import { FormEvent, useState } from "react";
import { measurementResultsSchema } from "@/lib/admin/operations-schemas";

type MeasurementTask = {
  id: string;
  status: string;
  scheduledAt: string;
  address: string;
  results: unknown;
  comments: string | null;
  lead: { id: string; customerName: string; phone: string; product: { name: string; model: string } | null };
  assignedMeasurer: { id: string; email: string } | null;
};
type InstallationTask = {
  id: string;
  status: string;
  scheduledAt: string;
  address: string;
  result: string | null;
  comments: string | null;
  order: { id: string; customerName: string; phone: string; address: string | null; configurationSnapshot: unknown };
  assignedInstaller: { id: string; email: string } | null;
};
type AuditEntry = {
  id: string;
  action: string;
  changes: unknown;
  actorEmail: string;
  createdAt: string;
};

const measurementOptions: Record<string, string[]> = {
  SCHEDULED: ["CONFIRMED", "IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "NO_SHOW"],
  NO_SHOW: ["SCHEDULED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
const installationOptions: Record<string, string[]> = {
  SCHEDULED: ["CONFIRMED", "IN_PROGRESS", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "ISSUE"],
  ISSUE: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AdminTaskDetail({
  kind,
  initialTask,
  initialAudit,
  manager,
  employees,
}: {
  kind: "measurement" | "installation";
  initialTask: MeasurementTask | InstallationTask;
  initialAudit: AuditEntry[];
  manager: boolean;
  employees: Array<{ id: string; email: string }>;
}) {
  const [task, setTask] = useState(initialTask);
  const [audit, setAudit] = useState(initialAudit);
  const [status, setStatus] = useState(task.status);
  const [scheduledAt, setScheduledAt] = useState(localDateTime(task.scheduledAt));
  const [address, setAddress] = useState(task.address);
  const [employeeId, setEmployeeId] = useState(kind === "measurement"
    ? (task as MeasurementTask).assignedMeasurer?.id ?? ""
    : (task as InstallationTask).assignedInstaller?.id ?? "");
  const [results, setResults] = useState(JSON.stringify(
    kind === "measurement" ? (task as MeasurementTask).results ?? {} : {},
    null,
    2,
  ));
  const [result, setResult] = useState(kind === "installation" ? (task as InstallationTask).result ?? "" : "");
  const [comments, setComments] = useState(task.comments ?? "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const allowedTransitions = kind === "measurement" ? measurementOptions : installationOptions;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    let parsedResults: Record<string, string | number | boolean> | undefined;
    if (kind === "measurement") {
      try {
        const parsed = measurementResultsSchema.safeParse(JSON.parse(results));
        if (!parsed.success) throw new Error("Результаты должны быть JSON-объектом с текстовыми, числовыми или логическими значениями.");
        parsedResults = parsed.data;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Некорректный JSON результатов");
        return;
      }
    }

    try {
      const currentTask = task;
      const data: Record<string, unknown> = {};
      if (status !== currentTask.status) data.status = status;
      if (manager) {
        data.scheduledAt = new Date(scheduledAt).toISOString();
        data.address = address;
        if (kind === "measurement") data.assignedMeasurerId = employeeId || null;
        else data.assignedInstallerId = employeeId || null;
      }
      if (kind === "measurement") data.results = parsedResults;
      else data.result = result;
      data.comments = comments;

      const response = await fetch(`/api/admin/${kind === "measurement" ? "measurements" : "installations"}/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить задачу");
      const refreshedResponse = await fetch(`/api/admin/${kind === "measurement" ? "measurements" : "installations"}/${task.id}`, { cache: "no-store" });
      const refreshed = await refreshedResponse.json();
      if (!refreshedResponse.ok) throw new Error(refreshed.error ?? "Не удалось обновить задачу");
      const updatedTask = refreshed[kind];
      setTask(updatedTask);
      setAudit(refreshed.audit);
      setStatus(updatedTask.status);
      setScheduledAt(localDateTime(updatedTask.scheduledAt));
      setAddress(updatedTask.address);
      setEmployeeId(kind === "measurement" ? updatedTask.assignedMeasurer?.id ?? "" : updatedTask.assignedInstaller?.id ?? "");
      setComments(updatedTask.comments ?? "");
      if (kind === "measurement") setResults(JSON.stringify(updatedTask.results ?? {}, null, 2));
      else setResult(updatedTask.result ?? "");
      setMessage("Изменения сохранены и записаны в журнал.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить задачу");
    }
  }

  const customer = kind === "measurement"
    ? (task as MeasurementTask).lead
    : (task as InstallationTask).order;
  const subheading = kind === "measurement"
    ? (customer as MeasurementTask["lead"]).product
      ? `${(customer as MeasurementTask["lead"]).product?.name} · ${(customer as MeasurementTask["lead"]).product?.model}`
      : "Модель не выбрана"
    : "Состав заказа сохранён в снимке";

  return (
    <div className="admin-detail-grid">
      <section className="admin-panel">
        <h2>{customer.customerName}</h2>
        <dl className="admin-definition-list">
          <dt>Телефон</dt><dd><a href={`tel:${customer.phone}`}>{customer.phone}</a></dd>
          <dt>Адрес</dt><dd>{task.address}</dd>
          <dt>Контекст</dt><dd>{subheading}</dd>
          <dt>Назначен</dt><dd>{kind === "measurement"
            ? (task as MeasurementTask).assignedMeasurer?.email ?? "Не назначен"
            : (task as InstallationTask).assignedInstaller?.email ?? "Не назначен"}</dd>
        </dl>
        {kind === "installation" && (
          <div className="admin-json-block">
            <h3>Снимок комплектации</h3>
            <pre>{JSON.stringify((task as InstallationTask).order.configurationSnapshot, null, 2)}</pre>
          </div>
        )}
      </section>
      <div className="admin-stack">
        <section className="admin-panel">
          <h2>{kind === "measurement" ? "Результат замера" : "Результат установки"}</h2>
          <form className="admin-stack" onSubmit={save}>
            {manager && (
              <>
                <label>Дата и время<input onChange={(event) => setScheduledAt(event.target.value)} required type="datetime-local" value={scheduledAt} /></label>
                <label>Адрес<input maxLength={300} onChange={(event) => setAddress(event.target.value)} required value={address} /></label>
                <label>{kind === "measurement" ? "Замерщик" : "Установщик"}
                  <select onChange={(event) => setEmployeeId(event.target.value)} value={employeeId}>
                    <option value="">Не назначен</option>
                    {employees.map((person) => <option key={person.id} value={person.id}>{person.email}</option>)}
                  </select>
                </label>
              </>
            )}
            <label>Статус
              <select onChange={(event) => setStatus(event.target.value)} value={status}>
                <option value={status}>{status}</option>
                {(allowedTransitions[status] ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            {kind === "measurement"
              ? <label>Результаты (JSON: размеры и параметры)<textarea onChange={(event) => setResults(event.target.value)} rows={7} value={results} /></label>
              : <label>Результат выполненных работ<textarea maxLength={2000} onChange={(event) => setResult(event.target.value)} rows={4} value={result} /></label>}
            <label>Комментарии<textarea maxLength={2000} onChange={(event) => setComments(event.target.value)} rows={3} value={comments} /></label>
            {error && <p className="admin-error" role="alert">{error}</p>}
            {message && <p className="admin-success" role="status">{message}</p>}
            <button className="button button-accent" type="submit">Сохранить</button>
          </form>
        </section>
        {manager && (
          <section className="admin-panel">
            <h2>История операций</h2>
            <ol className="admin-history">
              {audit.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.action}</strong>
                  <time>{new Date(entry.createdAt).toLocaleString("ru-RU")}</time>
                  <span>{entry.actorEmail}</span>
                  <pre>{JSON.stringify(entry.changes, null, 2)}</pre>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
