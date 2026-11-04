"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";

type ProductAsset = { id: string; url: string };

type AdminOption = {
  id: string;
  key: string;
  label: string;
  priceMinor: number;
  pricingUnit: "PER_DOOR" | "PER_ORDER";
  isActive: boolean;
  sortOrder: number;
};

type AdminOptionGroup = {
  id: string;
  key: string;
  label: string;
  selectionMode: "SINGLE" | "MULTIPLE";
  required: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  isActive: boolean;
  options: AdminOption[];
};

type AdminProduct = {
  id: string;
  slug: string;
  model: string;
  name: string;
  description: string;
  category: "apartment" | "house" | "technical";
  basePriceMinor: number;
  costMinor: number | null;
  manufacturerId: string | null;
  specifications: Record<string, string | number | boolean>;
  isActive: boolean;
  assets: ProductAsset[];
  optionGroups: AdminOptionGroup[];
};

type Manufacturer = { id: string; name: string; series: string | null };
type ProductEditor = {
  slug: string;
  model: string;
  name: string;
  description: string;
  category: AdminProduct["category"];
  price: string;
  cost: string;
  manufacturerId: string;
  isActive: boolean;
  specifications: string;
  optionGroups: string;
};

const emptyEditor: ProductEditor = {
  slug: "",
  model: "",
  name: "",
  description: "",
  category: "apartment",
  price: "",
  cost: "",
  manufacturerId: "",
  isActive: false,
  specifications: "{}",
  optionGroups: "[]",
};

function minorUnits(value: string) {
  const amount = Number(value.replace(",", "."));
  const minor = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(minor) || minor < 0) {
    throw new Error("Проверьте цену: укажите неотрицательную сумму с точностью до копеек.");
  }
  return minor;
}

function toEditor(product: AdminProduct): ProductEditor {
  return {
    slug: product.slug,
    model: product.model,
    name: product.name,
    description: product.description,
    category: product.category,
    price: String(product.basePriceMinor / 100),
    cost: product.costMinor === null ? "" : String(product.costMinor / 100),
    manufacturerId: product.manufacturerId ?? "",
    isActive: product.isActive,
    specifications: JSON.stringify(product.specifications, null, 2),
    optionGroups: JSON.stringify(groupsForInput(product.optionGroups), null, 2),
  };
}

function groupsForInput(groups: AdminProduct["optionGroups"]) {
  return groups.map((group) => ({
    key: group.key,
    label: group.label,
    selectionMode: group.selectionMode,
    required: group.required,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    sortOrder: group.sortOrder,
    isActive: group.isActive,
    options: group.options.map((option) => ({
      key: option.key,
      label: option.label,
      priceMinor: option.priceMinor,
      pricingUnit: option.pricingUnit,
      isActive: option.isActive,
      sortOrder: option.sortOrder,
    })),
  }));
}

async function responseJson(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Не удалось выполнить операцию");
  return result;
}

export function AdminProducts({
  initialProducts,
  initialManufacturers,
}: {
  initialProducts: AdminProduct[];
  initialManufacturers: Manufacturer[];
}) {
  const [products, setProducts] = useState<AdminProduct[]>(initialProducts);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>(initialManufacturers);
  const [manufacturerName, setManufacturerName] = useState("");
  const [manufacturerSeries, setManufacturerSeries] = useState("");
  const [editingManufacturerId, setEditingManufacturerId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ProductEditor>(emptyEditor);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadProducts() {
    const [productResult, manufacturerResult] = await Promise.all([
      responseJson(await fetch("/api/admin/products", { cache: "no-store" })),
      responseJson(await fetch("/api/admin/manufacturers", { cache: "no-store" })),
    ]);
    setProducts(productResult.products);
    setManufacturers(manufacturerResult.manufacturers);
  }

  async function saveManufacturer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch(
        editingManufacturerId
          ? `/api/admin/manufacturers/${editingManufacturerId}`
          : "/api/admin/manufacturers",
        {
          method: editingManufacturerId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: manufacturerName, series: manufacturerSeries || null }),
        },
      );
      const result = await responseJson(response);
      setManufacturers((current) => editingManufacturerId
        ? current.map((item) => item.id === editingManufacturerId ? result.manufacturer : item)
        : [...current, result.manufacturer]);
      setEditor((current) => ({ ...current, manufacturerId: result.manufacturer.id }));
      setManufacturerName("");
      setManufacturerSeries("");
      setEditingManufacturerId(null);
      setMessage(editingManufacturerId ? "Производитель обновлён." : "Производитель добавлен.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить производителя");
    }
  }

  async function removeManufacturer(manufacturerId: string) {
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/manufacturers/${manufacturerId}`, {
        method: "DELETE",
      }));
      setManufacturers((current) => current.filter((item) => item.id !== manufacturerId));
      setEditor((current) => ({
        ...current,
        manufacturerId: current.manufacturerId === manufacturerId ? "" : current.manufacturerId,
      }));
      setMessage("Производитель удалён; связанные товары остаются в каталоге.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось удалить производителя");
    }
  }

  function editManufacturer(manufacturer: Manufacturer) {
    setEditingManufacturerId(manufacturer.id);
    setManufacturerName(manufacturer.name);
    setManufacturerSeries(manufacturer.series ?? "");
  }

  function edit(product: AdminProduct) {
    setEditor(toEditor(product));
    setEditingId(product.id);
    setMessage("");
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const specifications: unknown = JSON.parse(editor.specifications);
      const optionGroups: unknown = JSON.parse(editor.optionGroups);
      const payload = {
        slug: editor.slug,
        model: editor.model,
        name: editor.name,
        description: editor.description,
        category: editor.category,
        basePriceMinor: minorUnits(editor.price),
        costMinor: editor.cost.trim() ? minorUnits(editor.cost) : null,
        manufacturerId: editor.manufacturerId.trim() || null,
        specifications,
        isActive: editor.isActive,
        optionGroups,
      };
      const response = await fetch(
        editingId ? `/api/admin/products/${editingId}` : "/api/admin/products",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      await responseJson(response);
      await loadProducts();
      setMessage(editingId ? "Изменения сохранены." : "Товар создан.");
      setEditor(emptyEditor);
      setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить товар");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(product: AdminProduct) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: product.slug,
          model: product.model,
          name: product.name,
          description: product.description,
          category: product.category,
          basePriceMinor: product.basePriceMinor,
          costMinor: product.costMinor,
          manufacturerId: product.manufacturerId,
          isActive: !product.isActive,
          specifications: product.specifications,
          optionGroups: groupsForInput(product.optionGroups),
        }),
      });
      await responseJson(response);
      await loadProducts();
      setMessage(product.isActive ? "Товар снят с публикации." : "Товар опубликован.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось изменить публикацию");
    }
  }

  async function uploadImage(productId: string, file?: File) {
    if (!file) return;
    setError("");
    setMessage("");
    try {
      await responseJson(await fetch(`/api/admin/assets?productId=${encodeURIComponent(productId)}`, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      }));
      await loadProducts();
      setMessage("Фото обработано и сохранено в базе данных магазина.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить фото");
    }
  }

  async function removeImage(assetId: string) {
    setError("");
    try {
      await responseJson(await fetch(`/api/admin/assets/${assetId}`, { method: "DELETE" }));
      await loadProducts();
      setMessage("Фото удалено.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось удалить фото");
    }
  }

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <h2>{editingId ? "Редактировать товар" : "Новый товар"}</h2>
            <p>Поля характеристик и комплектаций — JSON; цены дополнительных опций указываются в копейках.</p>
          </div>
          {editingId && (
            <button className="admin-button-secondary" onClick={() => { setEditingId(null); setEditor(emptyEditor); }} type="button">
              Отмена
            </button>
          )}
        </div>
        <form className="admin-form-grid" onSubmit={save}>
          <label>Slug<input onChange={(event) => setEditor({ ...editor, slug: event.target.value })} required value={editor.slug} /></label>
          <label>Модель<input onChange={(event) => setEditor({ ...editor, model: event.target.value })} required value={editor.model} /></label>
          <label>Название<input onChange={(event) => setEditor({ ...editor, name: event.target.value })} required value={editor.name} /></label>
          <label>Категория
            <select onChange={(event) => setEditor({ ...editor, category: event.target.value as AdminProduct["category"] })} value={editor.category}>
              <option value="apartment">Квартира</option>
              <option value="house">Дом</option>
              <option value="technical">Техническая</option>
            </select>
          </label>
          <label>Базовая цена, ₽<input min="0" onChange={(event) => setEditor({ ...editor, price: event.target.value })} required step="0.01" type="number" value={editor.price} /></label>
          <label>Себестоимость, ₽<input min="0" onChange={(event) => setEditor({ ...editor, cost: event.target.value })} step="0.01" type="number" value={editor.cost} /></label>
          <label className="admin-form-wide">Описание<textarea onChange={(event) => setEditor({ ...editor, description: event.target.value })} required rows={3} value={editor.description} /></label>
          <label>Производитель
            <select onChange={(event) => setEditor({ ...editor, manufacturerId: event.target.value })} value={editor.manufacturerId}>
              <option value="">Не указан</option>
              {manufacturers.map((manufacturer) => <option key={manufacturer.id} value={manufacturer.id}>{manufacturer.name}{manufacturer.series ? ` · ${manufacturer.series}` : ""}</option>)}
            </select>
          </label>
          <label className="admin-checkbox"><input checked={editor.isActive} onChange={(event) => setEditor({ ...editor, isActive: event.target.checked })} type="checkbox" />Опубликован</label>
          <label className="admin-form-wide">Характеристики JSON
            <textarea autoComplete="off" onChange={(event) => setEditor({ ...editor, specifications: event.target.value })} required rows={5} value={editor.specifications} />
          </label>
          <label className="admin-form-wide">Группы и опции JSON
            <textarea autoComplete="off" onChange={(event) => setEditor({ ...editor, optionGroups: event.target.value })} required rows={9} value={editor.optionGroups} />
          </label>
          <div className="admin-form-wide">
            {error && <p className="admin-error" role="alert">{error}</p>}
            {message && <p className="admin-success" role="status">{message}</p>}
            <button className="button button-accent" disabled={busy} type="submit">{busy ? "Сохраняем…" : "Сохранить товар"}</button>
          </div>
        </form>
      </section>

      <section className="admin-panel">
        <h2>Производители</h2>
        <form className="admin-inline-form" onSubmit={saveManufacturer}>
          <label>Название<input onChange={(event) => setManufacturerName(event.target.value)} required value={manufacturerName} /></label>
          <label>Серия<input onChange={(event) => setManufacturerSeries(event.target.value)} value={manufacturerSeries} /></label>
          <button className="admin-button-secondary" type="submit">{editingManufacturerId ? "Сохранить производителя" : "Добавить производителя"}</button>
          {editingManufacturerId && <button className="admin-button-secondary" onClick={() => { setEditingManufacturerId(null); setManufacturerName(""); setManufacturerSeries(""); }} type="button">Отмена</button>}
        </form>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Название</th><th>Серия</th><th>Действия</th></tr></thead>
            <tbody>
              {manufacturers.map((manufacturer) => (
                <tr key={manufacturer.id}>
                  <td>{manufacturer.name}</td><td>{manufacturer.series || "—"}</td>
                  <td className="admin-actions">
                    <button className="admin-text-button" onClick={() => editManufacturer(manufacturer)} type="button">Изменить</button>
                    <button className="admin-text-button" onClick={() => removeManufacturer(manufacturer.id)} type="button">Удалить</button>
                  </td>
                </tr>
              ))}
              {manufacturers.length === 0 && <tr><td colSpan={3}>Производители не добавлены.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div><h2>Каталог магазина</h2><p>{products.length} товаров, включая снятые с публикации.</p></div>
          <button className="admin-button-secondary" onClick={() => { setEditingId(null); setEditor(emptyEditor); }} type="button">Добавить товар</button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Товар</th><th>Цена</th><th>Статус</th><th>Фото</th><th>Действия</th></tr></thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td><strong>{product.name}</strong><small>{product.model} · /{product.slug}</small></td>
                  <td>{(product.basePriceMinor / 100).toLocaleString("ru-RU")} ₽</td>
                  <td>{product.isActive ? "Опубликован" : "Черновик"}</td>
                  <td>
                    <div className="admin-actions">
                      {product.assets.map((asset) => (
                        <span key={asset.id}>
                          <Image alt={`Фото ${product.name}`} height={56} src={asset.url} unoptimized width={44} />
                          <button
                            aria-label={`Удалить фото товара ${product.name}`}
                            className="admin-text-button"
                            onClick={() => removeImage(asset.id)}
                            type="button"
                          >
                            Удалить фото
                          </button>
                        </span>
                      ))}
                      {product.assets.length < 12 && (
                        <label className="admin-text-button">
                          Добавить фото
                          <input
                            accept="image/jpeg,image/png,image/webp"
                            aria-label={`Добавить фото товара ${product.name}`}
                            onChange={(event) => {
                              void uploadImage(product.id, event.currentTarget.files?.[0]);
                              event.currentTarget.value = "";
                            }}
                            type="file"
                          />
                        </label>
                      )}
                    </div>
                  </td>
                  <td className="admin-actions">
                    <button className="admin-text-button" onClick={() => edit(product)} type="button">Изменить</button>
                    <button className="admin-text-button" onClick={() => togglePublished(product)} type="button">
                      {product.isActive ? "Снять" : "Опубликовать"}
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={5}>Каталог пока пуст. Добавьте товар после ввода подтверждённых данных.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
