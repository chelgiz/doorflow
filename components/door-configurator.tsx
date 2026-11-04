"use client";

import { useState } from "react";
import { Calculator, Check, LoaderCircle } from "lucide-react";
import { LeadRequestForm } from "@/components/lead-request-form";
import type {
  DoorOptionGroup,
  DoorQuote,
  PricingRule,
} from "@/lib/commerce/model";
import { doorQuoteSchema } from "@/lib/commerce/model";

type DoorConfiguratorProps = {
  productSlug: string;
  productName: string;
  basePriceMinor: number;
  optionGroups: DoorOptionGroup[];
  pricingRules: PricingRule[];
  isDemoProduct: boolean;
};

const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

function formatMoney(amountMinor: number) {
  return moneyFormatter.format(amountMinor / 100);
}

function makeDefaultSelections(groups: DoorOptionGroup[]) {
  const selections: Record<string, string[]> = {};
  for (const group of groups) {
    if (!group.required) continue;
    const firstOption = group.options.find((option) => option.active);
    if (firstOption) selections[group.id] = [firstOption.id];
  }
  return selections;
}

export function DoorConfigurator({
  productSlug,
  productName,
  basePriceMinor,
  optionGroups,
  pricingRules,
  isDemoProduct,
}: DoorConfiguratorProps) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState(() => makeDefaultSelections(optionGroups));
  const [services, setServices] = useState<Record<string, number>>({});
  const [quote, setQuote] = useState<DoorQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  function updateSelections(groupId: string, optionId: string, checked: boolean) {
    setSelections((current) => {
      const currentSelection = current[groupId] ?? [];
      const group = optionGroups.find((item) => item.id === groupId);
      if (!group) return current;
      const nextSelection =
        group.selection === "single"
          ? checked
            ? [optionId]
            : []
          : checked
            ? [...currentSelection, optionId]
            : currentSelection.filter((item) => item !== optionId);
      return { ...current, [groupId]: nextSelection };
    });
    setQuote(null);
  }

  function updateService(ruleId: string, selectedQuantity: number) {
    setServices((current) => {
      const next = { ...current };
      if (selectedQuantity <= 0) {
        delete next[ruleId];
      } else {
        next[ruleId] = selectedQuantity;
      }
      return next;
    });
    setQuote(null);
  }

  async function calculateQuote() {
    setError(null);
    setQuote(null);
    setIsCalculating(true);

    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSlug,
          quantity,
          selections,
          services,
        }),
        cache: "no-store",
      });
      const result: unknown = await response.json();

      if (!response.ok) {
        if (
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
        ) {
          throw new Error(result.error);
        }
        throw new Error("Не удалось рассчитать стоимость.");
      }

      if (
        typeof result !== "object" ||
        result === null ||
        !("quote" in result)
      ) {
        throw new Error("Сервер вернул некорректный расчёт.");
      }

      const parsedQuote = doorQuoteSchema.safeParse(result.quote);
      if (!parsedQuote.success) {
        throw new Error("Сервер вернул некорректный расчёт.");
      }
      setQuote(parsedQuote.data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось рассчитать стоимость.",
      );
    } finally {
      setIsCalculating(false);
    }
  }

  return (
    <section aria-labelledby="configurator-heading" className="configurator">
      <div className="configurator-heading">
        <span className="eyebrow">Комплектация · DEMO</span>
        <h2 id="configurator-heading">Соберите свой вариант</h2>
        <p>Стоимость рассчитывается сервером только из доступных демо-опций.</p>
      </div>

      <div className="configurator-quantity">
        <label htmlFor="door-quantity">Количество дверей</label>
        <input
          id="door-quantity"
          max={10}
          min={1}
          onChange={(event) => {
            setQuantity(Number(event.target.value));
            setQuote(null);
          }}
          type="number"
          value={quantity}
        />
      </div>

      <div className="configurator-groups">
        {optionGroups.map((group) => (
          <fieldset className="configurator-group" key={group.id}>
            <legend>
              {group.label}
              {group.required ? <span> · обязательно</span> : <span> · по желанию</span>}
            </legend>
            <div className="configurator-options">
              {group.options
                .filter((option) => option.active)
                .map((option) => {
                  const checked = (selections[group.id] ?? []).includes(option.id);
                  return (
                    <label className="configurator-option" key={option.id}>
                      <input
                        checked={checked}
                        name={group.id}
                        onChange={(event) =>
                          updateSelections(group.id, option.id, event.target.checked)
                        }
                        type={group.selection === "single" ? "radio" : "checkbox"}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>
                          {option.priceMinor === 0
                            ? "Без доплаты · DEMO"
                            : `+${formatMoney(option.priceMinor)} · DEMO`}
                        </small>
                      </span>
                    </label>
                  );
                })}
            </div>
          </fieldset>
        ))}
      </div>

      <fieldset className="configurator-group service-group">
        <legend>Доставка и работы · DEMO</legend>
        <div className="configurator-options">
          {pricingRules.map((rule) => {
            const selectedQuantity = services[rule.id] ?? 0;
            const isSelected = selectedQuantity > 0;
            return (
              <div className="service-option" key={rule.id}>
                <label className="configurator-option">
                  <input
                    checked={isSelected}
                    onChange={(event) =>
                      updateService(rule.id, event.target.checked ? 1 : 0)
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong>{rule.label}</strong>
                    <small>
                      {rule.method === "percentage"
                        ? `${rule.basisPoints / 100}% от комплектации · DEMO`
                        : `+${formatMoney(rule.priceMinor)}${rule.method === "per-door" ? " за дверь" : ""} · DEMO`}
                    </small>
                  </span>
                </label>
                {rule.method === "per-unit" && isSelected ? (
                  <label className="service-quantity">
                    <span className="sr-only">Количество: {rule.label}</span>
                    <input
                      max={rule.maxQuantity}
                      min={0}
                      onChange={(event) =>
                        updateService(rule.id, Number(event.target.value))
                      }
                      type="number"
                      value={selectedQuantity}
                    />
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>

      <button
        className="button button-accent configurator-submit"
        disabled={isCalculating}
        onClick={calculateQuote}
        type="button"
      >
        {isCalculating ? (
          <LoaderCircle aria-hidden="true" className="spin" />
        ) : (
          <Calculator aria-hidden="true" />
        )}
        {isCalculating ? "Считаем на сервере…" : "Рассчитать стоимость"}
      </button>

      {error ? (
        <p aria-live="polite" className="form-error">
          {error}
        </p>
      ) : null}

      {quote ? (
        <div aria-live="polite" className="quote-result">
          <div className="quote-result-heading">
            <span>
              <Check aria-hidden="true" />
              Расчёт с сервера · DEMO
            </span>
            <small>{quantity} шт. · {productName}</small>
          </div>
          <dl className="quote-lines">
            {quote.lines.map((line) => (
              <div className="quote-line" key={line.id}>
                <dt>
                  {line.label}
                  {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                </dt>
                <dd>{formatMoney(line.totalPriceMinor)}</dd>
              </div>
            ))}
          </dl>
          <div className="quote-total">
            <span>Предварительный итог · DEMO</span>
            <strong>{formatMoney(quote.totalPriceMinor)}</strong>
          </div>
          <p>Условная сумма для проверки интерфейса. Не оферта и не цена магазина.</p>
        </div>
      ) : (
        <p className="configurator-note">
          Базовая цена-пример: {formatMoney(basePriceMinor)} · DEMO. Итог появится
          после серверного расчёта.
        </p>
      )}

      <LeadRequestForm
        isDemoProduct={isDemoProduct}
        productName={productName}
        productSlug={productSlug}
        quantity={quantity}
        selections={selections}
        services={services}
      />
    </section>
  );
}
