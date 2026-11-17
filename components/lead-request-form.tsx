"use client";

import { useRef, useState, type FormEvent } from "react";
import { useEffect } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { storefrontCapabilitiesSchema } from "@/lib/commerce/model";

type LeadRequestFormProps = {
  productSlug: string;
  productName: string;
  isDemoProduct: boolean;
  quantity: number;
  selections: Record<string, string[]>;
  services: Record<string, number>;
};

function getAttribution() {
  const search = new URLSearchParams(window.location.search);
  const values = {
    utmSource: search.get("utm_source"),
    utmMedium: search.get("utm_medium"),
    utmCampaign: search.get("utm_campaign"),
    utmContent: search.get("utm_content"),
    utmTerm: search.get("utm_term"),
  };
  const attribution = Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return Object.keys(attribution).length > 0 ? attribution : undefined;
}

export function LeadRequestForm({
  productSlug,
  productName,
  isDemoProduct,
  quantity,
  selections,
  services,
}: LeadRequestFormProps) {
  const [capabilitiesLoaded, setCapabilitiesLoaded] = useState(false);
  const [submissionEnabled, setSubmissionEnabled] = useState(false);
  const [privacyNoticeUrl, setPrivacyNoticeUrl] = useState<string | undefined>();
  const [requestType, setRequestType] = useState<"measurement" | "order">("measurement");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCapabilities() {
      try {
        const response = await fetch("/api/capabilities", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Не удалось проверить доступность формы.");
        }
        const result: unknown = await response.json();
        const parsed = storefrontCapabilitiesSchema.safeParse(result);
        if (!parsed.success) {
          throw new Error("Сервер вернул некорректные настройки формы.");
        }
        if (active) {
          setSubmissionEnabled(parsed.data.submissionEnabled);
          setPrivacyNoticeUrl(parsed.data.privacyNoticeUrl ?? undefined);
        }
      } catch {
        if (active) {
          setSubmissionEnabled(false);
          setError("Не удалось проверить настройки приёма заявок.");
        }
      } finally {
        if (active) setCapabilitiesLoaded(true);
      }
    }

    void loadCapabilities();
    return () => {
      active = false;
    };
  }, []);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReference(null);
    setIsSubmitting(true);

    const formElement = event.currentTarget;
    idempotencyKey.current ??= crypto.randomUUID();
    const formData = new FormData(formElement);
    const payload = {
      type: requestType,
      name: formData.get("name"),
      phone: formData.get("phone"),
      address: formData.get("address"),
      comment: formData.get("comment") || undefined,
      consent: formData.get("consent") === "on",
      website: formData.get("website") ?? "",
      attribution: getAttribution(),
      ...(requestType === "order"
        ? { productSlug, quantity, selections, services }
        : isDemoProduct
          ? {}
          : { productSlug }),
    };

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const result: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Не удалось сохранить обращение.";
        throw new Error(message);
      }

      if (
        typeof result !== "object" ||
        result === null ||
        !("id" in result) ||
        typeof result.id !== "string"
      ) {
        throw new Error("Сервер не подтвердил сохранение обращения.");
      }
      setReference(result.id);
      idempotencyKey.current = null;
      formElement.reset();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось сохранить обращение.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="lead-form-heading" className="lead-form-section">
      <div className="lead-form-heading">
        <span className="eyebrow">Следующий шаг{isDemoProduct ? " · DEMO" : ""}</span>
        <h3 id="lead-form-heading">Заявка на замер</h3>
        <p>Перед отправкой проверьте комплектацию и укажите удобный адрес.</p>
      </div>

      {!capabilitiesLoaded ? (
        <div className="submission-disabled" role="status">
          Проверяем настройки приёма заявок…
        </div>
      ) : !submissionEnabled ? (
        <div className="submission-disabled" role="status">
          Отправка выключена: для приёма заявок нужны подключённая база данных,
          настроенный магазин и опубликованное уведомление о персональных данных.
          Данные в демо-режиме не принимаются и не сохраняются.
        </div>
      ) : (
        <form className="lead-form" onSubmit={submitRequest}>
          <fieldset className="lead-type">
            <legend>Что вас интересует?</legend>
            <label>
              <input
                checked={requestType === "measurement"}
                name="requestType"
                onChange={() => setRequestType("measurement")}
                type="radio"
                value="measurement"
              />
              <span>Вызвать замерщика</span>
            </label>
            <label className={isDemoProduct ? "is-disabled" : undefined}>
              <input
                checked={requestType === "order"}
                disabled={isDemoProduct}
                name="requestType"
                onChange={() => setRequestType("order")}
                type="radio"
                value="order"
              />
              <span>
                Заявка по модели
                {isDemoProduct ? " · появится после публикации реального товара" : ""}
              </span>
            </label>
          </fieldset>

          <div className="lead-fields">
            <label>
              <span>Ваше имя</span>
              <input
                autoComplete="name"
                maxLength={120}
                minLength={2}
                name="name"
                placeholder="Как к вам обращаться"
                required
              />
            </label>
            <label>
              <span>Телефон</span>
              <input
                autoComplete="tel"
                maxLength={20}
                name="phone"
                placeholder="+7 900 000-00-00"
                required
                type="tel"
              />
            </label>
            {requestType === "measurement" || requestType === "order" ? (
              <label className="lead-field-wide">
                <span>Адрес для связи или замера</span>
                <input
                  autoComplete="street-address"
                  maxLength={300}
                  minLength={3}
                  name="address"
                  placeholder="Город, улица, дом"
                  required={requestType === "measurement"}
                />
              </label>
            ) : null}
            <label className="lead-field-wide">
              <span>Комментарий <small>необязательно</small></span>
              <textarea
                maxLength={1200}
                name="comment"
                placeholder="Удобное время, особенности проёма или вопрос"
                rows={3}
              />
            </label>
            <label aria-hidden="true" className="lead-honeypot">
              <span>Не заполняйте это поле</span>
              <input autoComplete="off" name="website" tabIndex={-1} />
            </label>
          </div>

          <label className="lead-consent">
            <input name="consent" required type="checkbox" />
            <span>
              Согласен(на) на обработку данных для ответа на мой запрос.{" "}
              {privacyNoticeUrl ? (
                <a href={privacyNoticeUrl} rel="noreferrer" target="_blank">
                  Уведомление о персональных данных
                </a>
              ) : null}
            </span>
          </label>

          <button className="button button-accent" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <ArrowRight aria-hidden="true" />
            )}
            {isSubmitting ? "Сохраняем обращение…" : "Отправить заявку"}
          </button>
        </form>
      )}

      {error ? (
        <p aria-live="polite" className="form-error">
          {error}
        </p>
      ) : null}
      {reference ? (
        <p aria-live="polite" className="form-success">
          Обращение сохранено. Номер: <strong>{reference}</strong>
        </p>
      ) : null}

      {isDemoProduct ? (
        <p className="lead-demo-note">
          Модель «{productName}» демонстрационная: заказ товара для неё недоступен.
        </p>
      ) : null}
    </section>
  );
}
