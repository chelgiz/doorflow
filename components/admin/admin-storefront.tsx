"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import {
  storefrontConfigurationSchema,
  type StorefrontConfiguration,
} from "@/lib/storefront/config";
import { contrastRatio, themeForPreset, themePresets } from "@/lib/storefront/theme";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorefrontHomeSections } from "@/components/site/storefront-home-sections";
import { StorefrontTheme } from "@/components/site/storefront-theme";

type StorefrontTab = "identity" | "home" | "appearance";

const tabs: { value: StorefrontTab; label: string }[] = [
  { value: "identity", label: "Идентичность" },
  { value: "home", label: "Главная страница" },
  { value: "appearance", label: "Оформление" },
];

type NewLocation = Omit<StorefrontConfiguration["identity"]["locations"][number], "id">;

async function parseResponse(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Не удалось выполнить операцию");
  return result;
}

export function AdminStorefront({
  initialDraft,
  initialPublishedAt,
}: {
  initialDraft: StorefrontConfiguration;
  initialPublishedAt: string | null;
}) {
  const [configuration, setConfiguration] = useState(initialDraft);
  const [savedDraft, setSavedDraft] = useState(initialDraft);
  const [tab, setTab] = useState<StorefrontTab>("identity");
  const [locationEditor, setLocationEditor] = useState<NewLocation>({
    name: "",
    address: "",
    phone: null,
    businessHours: null,
  });
  const [showLocationEditor, setShowLocationEditor] = useState(false);
  const [publishedAt, setPublishedAt] = useState(initialPublishedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isDirty = useMemo(
    () => JSON.stringify(configuration) !== JSON.stringify(savedDraft),
    [configuration, savedDraft],
  );
  const textContrast = contrastRatio(configuration.theme.textColor, configuration.theme.backgroundColor);
  const buttonContrast = contrastRatio("#ffffff", configuration.theme.accentColor);
  const primaryContrast = contrastRatio("#ffffff", configuration.theme.primaryColor);
  const hasAccessibleTheme = textContrast >= 4.5 && buttonContrast >= 4.5 && primaryContrast >= 4.5;

  function updateIdentity<K extends keyof StorefrontConfiguration["identity"]>(
    key: K,
    value: StorefrontConfiguration["identity"][K],
  ) {
    setConfiguration((current) => ({
      ...current,
      identity: { ...current.identity, [key]: value },
    }));
  }

  function updateHome<K extends keyof StorefrontConfiguration["home"]>(
    key: K,
    value: StorefrontConfiguration["home"][K],
  ) {
    setConfiguration((current) => ({
      ...current,
      home: { ...current.home, [key]: value },
    }));
  }

  function updateBenefit(
    index: number,
    key: "title" | "description",
    value: string,
  ) {
    setConfiguration((current) => ({
      ...current,
      home: {
        ...current.home,
        benefits: current.home.benefits.map((benefit, itemIndex) =>
          itemIndex === index ? { ...benefit, [key]: value } : benefit,
        ),
      },
    }));
  }

  function updateInformationBlock(
    index: number,
    key: "title" | "body",
    value: string,
  ) {
    setConfiguration((current) => ({
      ...current,
      home: {
        ...current.home,
        informationBlocks: current.home.informationBlocks.map((block, itemIndex) =>
          itemIndex === index ? { ...block, [key]: value } : block,
        ),
      },
    }));
  }

  function updateLocation(
    index: number,
    key: "name" | "address" | "phone" | "businessHours",
    value: string,
  ) {
    setConfiguration((current) => ({
      ...current,
      identity: {
        ...current.identity,
        locations: current.identity.locations.map((location, itemIndex) =>
          itemIndex === index
            ? { ...location, [key]: value || (key === "name" || key === "address" ? "" : null) }
            : location,
        ),
      },
    }));
  }

  async function uploadImage(file: File | undefined, target: "storefront-logo" | "storefront-banner") {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await parseResponse(await fetch(`/api/admin/assets?type=${target}`, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      }));
      if (target === "storefront-logo") {
        updateIdentity("logoUrl", result.asset.url);
      } else {
        updateHome("bannerAssetId", result.asset.id);
      }
      setMessage("Изображение загружено в черновик. Оно появится на сайте после публикации.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить изображение");
    } finally {
      setBusy(false);
    }
  }

  function addLocation() {
    if (locationEditor.name.trim().length < 2 || locationEditor.address.trim().length < 3) {
      setError("Укажите название и адрес торговой точки.");
      return;
    }
    updateIdentity("locations", [
      ...configuration.identity.locations,
      {
        id: null,
        ...locationEditor,
        phone: locationEditor.phone || null,
        businessHours: locationEditor.businessHours || null,
      },
    ]);
    setError("");
    setLocationEditor({ name: "", address: "", phone: null, businessHours: null });
    setShowLocationEditor(false);
  }

  function setThemePreset(preset: keyof typeof themePresets | "custom") {
    if (preset === "custom") {
      setConfiguration((current) => ({
        ...current,
        theme: { ...current.theme, preset },
      }));
      return;
    }
    setConfiguration((current) => ({
      ...current,
      theme: themeForPreset(preset),
    }));
  }

  function setThemeColor(
    key: "primaryColor" | "accentColor" | "backgroundColor" | "textColor",
    value: string,
  ) {
    setConfiguration((current) => ({
      ...current,
      theme: { ...current.theme, preset: "custom", [key]: value },
    }));
  }

  async function saveDraft() {
    const parsed = storefrontConfigurationSchema.safeParse(configuration);
    if (!parsed.success) {
      throw new Error("Проверьте заполнение полей и контраст цветов перед сохранением.");
    }
    const result = await parseResponse(await fetch("/api/admin/storefront", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    }));
    setConfiguration(result.draft);
    setSavedDraft(result.draft);
    return result.draft as StorefrontConfiguration;
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await saveDraft();
      setMessage("Черновик сохранён. Публичный сайт пока не изменён.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить черновик");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await saveDraft();
      const result = await parseResponse(await fetch("/api/admin/storefront/publish", {
        method: "POST",
      }));
      setConfiguration(result.published);
      setSavedDraft(result.published);
      setPublishedAt(result.publishedAt);
      setMessage("Изменения опубликованы и доступны на витрине.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось опубликовать витрину");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-storefront">
      <div className="admin-storefront-editor">
        <div className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Настройка витрины</h2>
              <p>
                {publishedAt
                  ? `Последняя публикация: ${new Date(publishedAt).toLocaleString("ru-RU")}`
                  : "Сохранённые изменения останутся черновиком, пока вы их не опубликуете."}
              </p>
            </div>
            {isDirty && <span className="admin-muted">Есть несохранённые изменения</span>}
          </div>
          <div className="admin-storefront-tabs" role="tablist" aria-label="Разделы витрины">
            {tabs.map((item) => (
              <button
                aria-selected={tab === item.value}
                className={tab === item.value ? "admin-storefront-tab is-active" : "admin-storefront-tab"}
                id={`storefront-tab-${item.value}`}
                key={item.value}
                onClick={() => setTab(item.value)}
                role="tab"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <form onSubmit={onSave}>
            {tab === "identity" && (
              <section aria-labelledby="storefront-tab-identity" className="admin-form-grid" role="tabpanel">
                <h3 className="admin-form-wide">Информация для покупателей</h3>
                <label>Публичное название
                  <input
                    maxLength={160}
                    onChange={(event) => updateIdentity("publicName", event.target.value)}
                    required
                    value={configuration.identity.publicName}
                  />
                </label>
                <label>Телефон
                  <input
                    maxLength={24}
                    onChange={(event) => updateIdentity("phone", event.target.value || null)}
                    type="tel"
                    value={configuration.identity.phone ?? ""}
                  />
                </label>
                <label>Email
                  <input
                    maxLength={254}
                    onChange={(event) => updateIdentity("email", event.target.value || null)}
                    type="email"
                    value={configuration.identity.email ?? ""}
                  />
                </label>
                <label className="admin-form-wide">Логотип магазина (JPG, PNG или WebP, до 5 МБ)
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      void uploadImage(event.currentTarget.files?.[0], "storefront-logo");
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                </label>
                {configuration.identity.logoUrl && (
                  <div className="admin-storefront-image-row admin-form-wide">
                    <Image
                      alt="Текущий логотип"
                      height={64}
                      src={configuration.identity.logoUrl}
                      unoptimized
                      width={180}
                    />
                    <button
                      className="admin-button-secondary"
                      onClick={() => updateIdentity("logoUrl", null)}
                      type="button"
                    >
                      Убрать из черновика
                    </button>
                  </div>
                )}
                <div className="admin-form-wide admin-storefront-subsection">
                  <div className="admin-panel-heading">
                    <div><h3>Адреса и режим работы</h3><p>Показываются на сайте после публикации.</p></div>
                    <button
                      className="admin-button-secondary"
                      onClick={() => setShowLocationEditor((current) => !current)}
                      type="button"
                    >
                      {showLocationEditor ? "Отмена" : "Добавить адрес"}
                    </button>
                  </div>
                  {configuration.identity.locations.map((location, index) => (
                    <div className="admin-storefront-location" key={location.id ?? `new-location-${index}`}>
                      <label>Название точки
                        <input
                          onChange={(event) => updateLocation(index, "name", event.target.value)}
                          required
                          value={location.name}
                        />
                      </label>
                      <label>Адрес
                        <input
                          onChange={(event) => updateLocation(index, "address", event.target.value)}
                          required
                          value={location.address}
                        />
                      </label>
                      <label>Телефон точки
                        <input
                          onChange={(event) => updateLocation(index, "phone", event.target.value)}
                          type="tel"
                          value={location.phone ?? ""}
                        />
                      </label>
                      <label>Режим работы
                        <input
                          maxLength={300}
                          onChange={(event) => updateLocation(index, "businessHours", event.target.value)}
                          placeholder="Например: Пн–Сб, 10:00–19:00"
                          value={location.businessHours ?? ""}
                        />
                      </label>
                      <button
                        className="admin-text-button"
                        onClick={() => updateIdentity(
                          "locations",
                          configuration.identity.locations.filter((_, itemIndex) => itemIndex !== index),
                        )}
                        type="button"
                      >
                        Убрать адрес из черновика
                      </button>
                    </div>
                  ))}
                  {showLocationEditor && (
                    <div className="admin-storefront-location">
                      <label>Название точки
                        <input
                          onChange={(event) => setLocationEditor({ ...locationEditor, name: event.target.value })}
                          required
                          value={locationEditor.name}
                        />
                      </label>
                      <label>Адрес
                        <input
                          onChange={(event) => setLocationEditor({ ...locationEditor, address: event.target.value })}
                          required
                          value={locationEditor.address}
                        />
                      </label>
                      <label>Телефон точки
                        <input
                          onChange={(event) => setLocationEditor({ ...locationEditor, phone: event.target.value || null })}
                          type="tel"
                          value={locationEditor.phone ?? ""}
                        />
                      </label>
                      <label>Режим работы
                        <input
                          maxLength={300}
                          onChange={(event) => setLocationEditor({ ...locationEditor, businessHours: event.target.value || null })}
                          placeholder="Например: Пн–Сб, 10:00–19:00"
                          value={locationEditor.businessHours ?? ""}
                        />
                      </label>
                      <button className="admin-button-secondary" onClick={addLocation} type="button">
                        Добавить в черновик
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}

            {tab === "home" && (
              <section aria-labelledby="storefront-tab-home" className="admin-form-grid" role="tabpanel">
                <h3 className="admin-form-wide">Главный экран</h3>
                <label>Короткая подпись
                  <input
                    maxLength={100}
                    onChange={(event) => updateHome("eyebrow", event.target.value)}
                    required
                    value={configuration.home.eyebrow}
                  />
                </label>
                <label className="admin-form-wide">Заголовок
                  <input
                    maxLength={160}
                    onChange={(event) => updateHome("heading", event.target.value)}
                    required
                    value={configuration.home.heading}
                  />
                </label>
                <label className="admin-form-wide">Подзаголовок
                  <textarea
                    maxLength={500}
                    onChange={(event) => updateHome("subheading", event.target.value)}
                    required
                    rows={3}
                    value={configuration.home.subheading}
                  />
                </label>
                <label className="admin-form-wide">Главное изображение (JPG, PNG или WebP, до 5 МБ)
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      void uploadImage(event.currentTarget.files?.[0], "storefront-banner");
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                </label>
                {configuration.home.bannerAssetId && (
                  <div className="admin-storefront-image-row admin-form-wide">
                    <Image
                      alt={configuration.home.bannerAlt || "Предпросмотр главного изображения"}
                      height={140}
                      src={`/api/store-assets/${configuration.home.bannerAssetId}`}
                      unoptimized
                      width={240}
                    />
                    <button
                      className="admin-button-secondary"
                      onClick={() => updateHome("bannerAssetId", null)}
                      type="button"
                    >
                      Убрать из черновика
                    </button>
                  </div>
                )}
                <label className="admin-form-wide">Описание изображения
                  <input
                    maxLength={160}
                    onChange={(event) => updateHome("bannerAlt", event.target.value)}
                    value={configuration.home.bannerAlt}
                  />
                </label>
                <h3 className="admin-form-wide">Преимущества</h3>
                {configuration.home.benefits.map((benefit, index) => (
                  <div className="admin-storefront-pair admin-form-wide" key={`benefit-${index}`}>
                    <label>Название
                      <input
                        maxLength={80}
                        onChange={(event) => updateBenefit(index, "title", event.target.value)}
                        required
                        value={benefit.title}
                      />
                    </label>
                    <label>Короткое пояснение
                      <input
                        maxLength={180}
                        onChange={(event) => updateBenefit(index, "description", event.target.value)}
                        required
                        value={benefit.description}
                      />
                    </label>
                  </div>
                ))}
                <div className="admin-form-wide admin-storefront-subsection">
                  <div className="admin-panel-heading">
                    <div><h3>Информационные блоки</h3><p>Можно добавить до трёх коротких блоков.</p></div>
                    {configuration.home.informationBlocks.length < 3 && (
                      <button
                        className="admin-button-secondary"
                        onClick={() => updateHome("informationBlocks", [
                          ...configuration.home.informationBlocks,
                          { title: "Новый блок", body: "Добавьте полезную информацию для покупателей." },
                        ])}
                        type="button"
                      >
                        Добавить блок
                      </button>
                    )}
                  </div>
                  {configuration.home.informationBlocks.map((block, index) => (
                    <div className="admin-storefront-location" key={`info-${index}`}>
                      <label>Заголовок
                        <input
                          maxLength={100}
                          onChange={(event) => updateInformationBlock(index, "title", event.target.value)}
                          required
                          value={block.title}
                        />
                      </label>
                      <label>Текст
                        <textarea
                          maxLength={500}
                          onChange={(event) => updateInformationBlock(index, "body", event.target.value)}
                          required
                          rows={3}
                          value={block.body}
                        />
                      </label>
                      <button
                        className="admin-text-button"
                        onClick={() => updateHome(
                          "informationBlocks",
                          configuration.home.informationBlocks.filter((_, itemIndex) => itemIndex !== index),
                        )}
                        type="button"
                      >
                        Удалить блок
                      </button>
                    </div>
                  ))}
                </div>
                <h3 className="admin-form-wide">Кнопки и призывы к действию</h3>
                <label>Текст основной кнопки
                  <input
                    maxLength={60}
                    onChange={(event) => updateHome("primaryCtaLabel", event.target.value)}
                    required
                    value={configuration.home.primaryCtaLabel}
                  />
                </label>
                <label>Куда ведёт основная кнопка
                  <select
                    onChange={(event) => updateHome("primaryCtaHref", event.target.value)}
                    value={configuration.home.primaryCtaHref}
                  >
                    <option value="/catalog">Каталог</option>
                    <option value="#categories">Категории на главной</option>
                  </select>
                </label>
                <label>Текст второй кнопки
                  <input
                    maxLength={60}
                    onChange={(event) => updateHome("secondaryCtaLabel", event.target.value)}
                    required
                    value={configuration.home.secondaryCtaLabel}
                  />
                </label>
                <label>Куда ведёт вторая кнопка
                  <select
                    onChange={(event) => updateHome("secondaryCtaHref", event.target.value)}
                    value={configuration.home.secondaryCtaHref}
                  >
                    <option value="#how-to-choose">Информация на главной</option>
                    <option value="#categories">Категории на главной</option>
                    <option value="/catalog">Каталог</option>
                  </select>
                </label>
                <h3 className="admin-form-wide">Для поисковых систем</h3>
                <label className="admin-form-wide">Заголовок страницы
                  <input
                    maxLength={70}
                    onChange={(event) => setConfiguration((current) => ({
                      ...current,
                      seo: { ...current.seo, title: event.target.value },
                    }))}
                    required
                    value={configuration.seo.title}
                  />
                </label>
                <label className="admin-form-wide">Описание страницы
                  <textarea
                    maxLength={180}
                    onChange={(event) => setConfiguration((current) => ({
                      ...current,
                      seo: { ...current.seo, description: event.target.value },
                    }))}
                    required
                    rows={2}
                    value={configuration.seo.description}
                  />
                </label>
              </section>
            )}

            {tab === "appearance" && (
              <section aria-labelledby="storefront-tab-appearance" className="admin-form-grid" role="tabpanel">
                <h3 className="admin-form-wide">Выберите готовую схему или настройте свои цвета</h3>
                <label className="admin-form-wide">Цветовая схема
                  <select
                    onChange={(event) => setThemePreset(event.target.value as keyof typeof themePresets | "custom")}
                    value={configuration.theme.preset}
                  >
                    {Object.entries(themePresets).map(([key, preset]) => (
                      <option key={key} value={key}>{preset.label}</option>
                    ))}
                    <option value="custom">Собственные цвета</option>
                  </select>
                </label>
                {([
                  ["primaryColor", "Основной цвет"],
                  ["accentColor", "Акцентный цвет"],
                  ["backgroundColor", "Цвет фона"],
                  ["textColor", "Цвет текста"],
                ] as const).map(([key, label]) => (
                  <label key={key}>{label}
                    <span className="admin-storefront-color">
                      <input
                        onChange={(event) => setThemeColor(key, event.target.value)}
                        type="color"
                        value={configuration.theme[key]}
                      />
                      <code>{configuration.theme[key]}</code>
                    </span>
                  </label>
                ))}
                <div className={hasAccessibleTheme ? "admin-success admin-form-wide" : "admin-error admin-form-wide"} role="status">
                  {hasAccessibleTheme
                    ? `Контраст проверен: текст ${textContrast.toFixed(1)}:1, кнопка ${buttonContrast.toFixed(1)}:1, основной цвет ${primaryContrast.toFixed(1)}:1.`
                    : `Недостаточный контраст. Нужно не менее 4,5:1: текст ${textContrast.toFixed(1)}:1, кнопка ${buttonContrast.toFixed(1)}:1, основной цвет ${primaryContrast.toFixed(1)}:1.`}
                </div>
                <p className="admin-muted admin-form-wide">
                  Цвета применяются только к готовым элементам сайта. Произвольный CSS и HTML не поддерживаются.
                </p>
              </section>
            )}

            {error && <p className="admin-error admin-form-wide" role="alert">{error}</p>}
            {message && <p className="admin-success admin-form-wide" role="status">{message}</p>}
            <div className="admin-storefront-actions">
              <button className="admin-button-secondary" disabled={busy} type="submit">
                {busy ? "Сохраняем…" : "Сохранить черновик"}
              </button>
              <button
                className="button button-accent"
                disabled={busy || !hasAccessibleTheme}
                onClick={() => void publish()}
                type="button"
              >
                {busy ? "Публикуем…" : "Опубликовать"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <aside className="admin-storefront-preview" aria-label="Предпросмотр витрины">
        <div className="admin-panel-heading">
          <div><h2>Предпросмотр</h2><p>Черновик виден только вам.</p></div>
        </div>
        <div className="admin-storefront-preview-frame">
          <StorefrontTheme configuration={configuration} preview>
            <div className="announcement">Предпросмотр черновика · не опубликовано</div>
            <SiteHeader identity={configuration.identity} />
            <StorefrontHomeSections configuration={configuration} />
            <SiteFooter identity={configuration.identity} />
          </StorefrontTheme>
        </div>
      </aside>
    </div>
  );
}
