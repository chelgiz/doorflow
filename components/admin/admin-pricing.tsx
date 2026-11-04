"use client";

import { FormEvent, useState } from "react";

type PricingRule = {
  id: string;
  key: string;
  label: string;
  method: "FIXED" | "PER_DOOR" | "PER_UNIT" | "PERCENTAGE";
  priceMinor: number;
  basisPoints: number | null;
  maxQuantity: number;
  isActive: boolean;
};

type RuleEditor = {
  key: string;
  label: string;
  method: PricingRule["method"];
  price: string;
  basisPoints: string;
  maxQuantity: string;
  isActive: boolean;
};

const blankRule: RuleEditor = {
  key: "",
  label: "",
  method: "FIXED",
  price: "",
  basisPoints: "0",
  maxQuantity: "1",
  isActive: true,
};

function toEditor(rule: PricingRule): RuleEditor {
  return {
    key: rule.key,
    label: rule.label,
    method: rule.method,
    price: String(rule.priceMinor / 100),
    basisPoints: String(rule.basisPoints ?? 0),
    maxQuantity: String(rule.maxQuantity),
    isActive: rule.isActive,
  };
}

function priceToMinor(value: string) {
  const minor = Math.round(Number(value.replace(",", ".")) * 100);
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("Укажите допустимую цену.");
  return minor;
}

async function parseResponse(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Не удалось выполнить операцию");
  return result;
}

export function AdminPricing({ initialRules }: { initialRules: PricingRule[] }) {
  const [rules, setRules] = useState<PricingRule[]>(initialRules);
  const [editor, setEditor] = useState<RuleEditor>(blankRule);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const result = await parseResponse(await fetch("/api/admin/pricing-rules", { cache: "no-store" }));
    setRules(result.rules);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const common = {
        key: editor.key,
        label: editor.label,
        method: editor.method,
        maxQuantity: editor.method === "FIXED" || editor.method === "PERCENTAGE"
          ? 1
          : Number(editor.maxQuantity),
        isActive: editor.isActive,
      };
      const payload = editor.method === "PERCENTAGE"
        ? { ...common, basisPoints: Number(editor.basisPoints) }
        : { ...common, priceMinor: priceToMinor(editor.price) };
      const response = await fetch(
        editingId ? `/api/admin/pricing-rules/${editingId}` : "/api/admin/pricing-rules",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      await parseResponse(response);
      await load();
      setEditor(blankRule);
      setEditingId(null);
      setMessage(editingId ? "Правило обновлено." : "Правило добавлено.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить правило");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(rule: PricingRule) {
    try {
      await parseResponse(await fetch(`/api/admin/pricing-rules/${rule.id}`, { method: "DELETE" }));
      await load();
      setMessage("Услуга отключена. Существующие заявки не изменены.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось отключить услугу");
    }
  }

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <h2>{editingId ? "Редактировать правило" : "Новое правило / услуга"}</h2>
            <p>Примеры ключей: delivery, dismantling, installation, extensions, architraves. Значения цены вводятся в рублях.</p>
          </div>
        </div>
        <form className="admin-form-grid" onSubmit={save}>
          <label>Ключ услуги<input onChange={(event) => setEditor({ ...editor, key: event.target.value })} required value={editor.key} /></label>
          <label>Название<input onChange={(event) => setEditor({ ...editor, label: event.target.value })} required value={editor.label} /></label>
          <label>Метод расчёта
            <select onChange={(event) => setEditor({ ...editor, method: event.target.value as PricingRule["method"] })} value={editor.method}>
              <option value="FIXED">Фиксированная сумма за заказ</option>
              <option value="PER_DOOR">За каждую дверь</option>
              <option value="PER_UNIT">За единицу услуги</option>
              <option value="PERCENTAGE">Процент от комплектации</option>
            </select>
          </label>
          {editor.method === "PERCENTAGE" ? (
            <label>Ставка, базисные пункты
              <input min="0" max="100000" onChange={(event) => setEditor({ ...editor, basisPoints: event.target.value })} required type="number" value={editor.basisPoints} />
            </label>
          ) : (
            <label>Цена, ₽
              <input min="0" onChange={(event) => setEditor({ ...editor, price: event.target.value })} required step="0.01" type="number" value={editor.price} />
            </label>
          )}
          {editor.method === "PER_UNIT" || editor.method === "PER_DOOR" ? (
            <label>Максимальное количество
              <input min="1" max="100" onChange={(event) => setEditor({ ...editor, maxQuantity: event.target.value })} required type="number" value={editor.maxQuantity} />
            </label>
          ) : null}
          <label className="admin-checkbox"><input checked={editor.isActive} onChange={(event) => setEditor({ ...editor, isActive: event.target.checked })} type="checkbox" />Правило активно</label>
          <div className="admin-form-wide">
            {error && <p className="admin-error" role="alert">{error}</p>}
            {message && <p className="admin-success" role="status">{message}</p>}
            <button className="button button-accent" disabled={busy} type="submit">{busy ? "Сохраняем…" : "Сохранить правило"}</button>
            {editingId && <button className="admin-button-secondary" onClick={() => { setEditingId(null); setEditor(blankRule); }} type="button">Отмена</button>}
          </div>
        </form>
      </section>

      <section className="admin-panel">
        <h2>Правила магазина</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Услуга</th><th>Расчёт</th><th>Значение</th><th>Статус</th><th>Действия</th></tr></thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td><strong>{rule.label}</strong><small>{rule.key}</small></td>
                  <td>{rule.method}</td>
                  <td>{rule.method === "PERCENTAGE" ? `${((rule.basisPoints ?? 0) / 100).toLocaleString("ru-RU")}%` : `${(rule.priceMinor / 100).toLocaleString("ru-RU")} ₽`}</td>
                  <td>{rule.isActive ? "Активно" : "Отключено"}</td>
                  <td className="admin-actions">
                    <button className="admin-text-button" onClick={() => { setEditingId(rule.id); setEditor(toEditor(rule)); }} type="button">Изменить</button>
                    {rule.isActive && <button className="admin-text-button" onClick={() => deactivate(rule)} type="button">Отключить</button>}
                  </td>
                </tr>
              ))}
              {rules.length === 0 && <tr><td colSpan={5}>Цены и услуги не настроены.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
