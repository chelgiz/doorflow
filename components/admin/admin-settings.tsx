"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";

type StoreSettings = {
  name: string;
  contactPhone: string | null;
  contactEmail: string | null;
  logoUrl: string | null;
};

type StoreLocation = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  businessHours: string | null;
  isActive: boolean;
  sortOrder: number;
};

type LocationEditor = {
  name: string;
  address: string;
  phone: string;
  businessHours: string;
  isActive: boolean;
  sortOrder: string;
};

const emptyLocation: LocationEditor = {
  name: "",
  address: "",
  phone: "",
  businessHours: "",
  isActive: true,
  sortOrder: "0",
};

async function parseResponse(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Не удалось выполнить операцию");
  return result;
}

export function AdminSettings({
  initialSettings,
  initialLocations,
}: {
  initialSettings: StoreSettings;
  initialLocations: StoreLocation[];
}) {
  const [settings, setSettings] = useState<StoreSettings>(initialSettings);
  const [locations, setLocations] = useState<StoreLocation[]>(initialLocations);
  const [locationEditor, setLocationEditor] = useState<LocationEditor>(emptyLocation);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [settingsResult, locationsResult] = await Promise.all([
      parseResponse(await fetch("/api/admin/settings", { cache: "no-store" })),
      parseResponse(await fetch("/api/admin/locations", { cache: "no-store" })),
    ]);
    setSettings(settingsResult.settings);
    setLocations(locationsResult.locations);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const result = await parseResponse(await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: settings.name,
          contactPhone: settings.contactPhone || null,
          contactEmail: settings.contactEmail || null,
          logoUrl: settings.logoUrl || null,
        }),
      }));
      setSettings(result.settings);
      setMessage("Настройки сохранены.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить настройки");
    }
  }

  async function uploadLogo(file?: File) {
    if (!file) return;
    setError("");
    setMessage("");
    try {
      const result = await parseResponse(await fetch("/api/admin/assets?type=logo", {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      }));
      setSettings((current) => ({ ...current, logoUrl: result.asset.url }));
      setMessage("Логотип обработан и сохранён в базе данных магазина.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить логотип");
    }
  }

  async function removeLogo() {
    const assetId = settings.logoUrl?.match(/^\/api\/store-assets\/([0-9a-f-]{36})$/i)?.[1];
    if (!assetId) return;
    setError("");
    try {
      await parseResponse(await fetch(`/api/admin/assets/${assetId}`, { method: "DELETE" }));
      setSettings((current) => ({ ...current, logoUrl: null }));
      setMessage("Логотип удалён.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось удалить логотип");
    }
  }

  function editLocation(location: StoreLocation) {
    setEditingId(location.id);
    setLocationEditor({
      name: location.name,
      address: location.address,
      phone: location.phone ?? "",
      businessHours: location.businessHours ?? "",
      isActive: location.isActive,
      sortOrder: String(location.sortOrder),
    });
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await parseResponse(await fetch(
        editingId ? `/api/admin/locations/${editingId}` : "/api/admin/locations",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: locationEditor.name,
            address: locationEditor.address,
            phone: locationEditor.phone || null,
            businessHours: locationEditor.businessHours || null,
            isActive: locationEditor.isActive,
            sortOrder: Number(locationEditor.sortOrder),
          }),
        },
      ));
      await load();
      setEditingId(null);
      setLocationEditor(emptyLocation);
      setMessage("Торговая точка сохранена.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить адрес");
    }
  }

  async function deactivateLocation(id: string) {
    try {
      await parseResponse(await fetch(`/api/admin/locations/${id}`, { method: "DELETE" }));
      await load();
      setMessage("Торговая точка отключена.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось отключить адрес");
    }
  }

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <h2>Профиль магазина</h2>
        <form className="admin-form-grid" onSubmit={saveSettings}>
          <label>Название магазина<input onChange={(event) => setSettings({ ...settings, name: event.target.value })} required value={settings.name} /></label>
          <label>Контактный телефон<input onChange={(event) => setSettings({ ...settings, contactPhone: event.target.value })} value={settings.contactPhone ?? ""} /></label>
          <label>Контактный email<input onChange={(event) => setSettings({ ...settings, contactEmail: event.target.value })} type="email" value={settings.contactEmail ?? ""} /></label>
          <label>URL логотипа (HTTPS)<input onChange={(event) => setSettings({ ...settings, logoUrl: event.target.value })} type="text" value={settings.logoUrl ?? ""} /></label>
          <label>Загрузить логотип (JPEG, PNG, WebP; до 5 МБ)
            <input
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                void uploadLogo(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </label>
          <div className="admin-form-wide">
            <p className="admin-muted">Загруженные изображения проверяются и хранятся в PostgreSQL вместе с резервной копией.</p>
            {settings.logoUrl?.startsWith("/api/store-assets/") && (
              <div className="admin-actions">
                <Image alt="Логотип магазина" height={72} src={settings.logoUrl} unoptimized width={144} />
                <button className="admin-text-button" onClick={removeLogo} type="button">Удалить логотип</button>
              </div>
            )}
            {error && <p className="admin-error" role="alert">{error}</p>}
            {message && <p className="admin-success" role="status">{message}</p>}
            <button className="button button-accent" type="submit">Сохранить профиль</button>
          </div>
        </form>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div><h2>{editingId ? "Изменить торговую точку" : "Новая торговая точка"}</h2><p>Адреса хранятся отдельно, их можно временно отключать.</p></div>
        </div>
        <form className="admin-form-grid" onSubmit={saveLocation}>
          <label>Название точки<input onChange={(event) => setLocationEditor({ ...locationEditor, name: event.target.value })} required value={locationEditor.name} /></label>
          <label>Телефон<input onChange={(event) => setLocationEditor({ ...locationEditor, phone: event.target.value })} value={locationEditor.phone} /></label>
          <label>Режим работы<input maxLength={300} onChange={(event) => setLocationEditor({ ...locationEditor, businessHours: event.target.value })} value={locationEditor.businessHours} /></label>
          <label className="admin-form-wide">Адрес<input onChange={(event) => setLocationEditor({ ...locationEditor, address: event.target.value })} required value={locationEditor.address} /></label>
          <label>Порядок отображения<input min="0" onChange={(event) => setLocationEditor({ ...locationEditor, sortOrder: event.target.value })} type="number" value={locationEditor.sortOrder} /></label>
          <label className="admin-checkbox"><input checked={locationEditor.isActive} onChange={(event) => setLocationEditor({ ...locationEditor, isActive: event.target.checked })} type="checkbox" />Активна</label>
          <div className="admin-form-wide">
            {error && <p className="admin-error" role="alert">{error}</p>}
            <button className="button button-accent" type="submit">Сохранить точку</button>
            {editingId && <button className="admin-button-secondary" onClick={() => { setEditingId(null); setLocationEditor(emptyLocation); }} type="button">Отмена</button>}
          </div>
        </form>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Точка</th><th>Адрес</th><th>Телефон</th><th>Режим работы</th><th>Статус</th><th>Действия</th></tr></thead>
            <tbody>
              {locations.map((location) => (
                <tr key={location.id}>
                  <td>{location.name}</td><td>{location.address}</td><td>{location.phone || "—"}</td><td>{location.businessHours || "—"}</td><td>{location.isActive ? "Активна" : "Отключена"}</td>
                  <td className="admin-actions"><button className="admin-text-button" onClick={() => editLocation(location)} type="button">Изменить</button>{location.isActive && <button className="admin-text-button" onClick={() => deactivateLocation(location.id)} type="button">Отключить</button>}</td>
                </tr>
              ))}
              {locations.length === 0 && <tr><td colSpan={6}>Торговые точки пока не добавлены.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
