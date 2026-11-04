"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import type { DoorCategoryFilter, Product } from "@/lib/products";

type SortOrder = "default" | "price-asc" | "price-desc";

const filters: { value: DoorCategoryFilter; label: string }[] = [
  { value: "all", label: "Все модели" },
  { value: "apartment", label: "Для квартиры" },
  { value: "house", label: "Для дома" },
  { value: "technical", label: "Технические" },
];

type CatalogBrowserProps = {
  products: Product[];
  demoMode: boolean;
};

export function CatalogBrowser({ products, demoMode }: CatalogBrowserProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DoorCategoryFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("default");

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    const matchingProducts = products.filter((product) => {
      const matchesCategory = category === "all" || product.category === category;
      const searchableText = [
        product.model,
        product.name,
        product.series,
        product.categoryLabel,
        product.color,
      ]
        .join(" ")
        .toLocaleLowerCase("ru");

      return matchesCategory && searchableText.includes(normalizedQuery);
    });

    if (sortOrder === "price-asc") {
      return matchingProducts.toSorted((first, second) => first.price - second.price);
    }

    if (sortOrder === "price-desc") {
      return matchingProducts.toSorted((first, second) => second.price - first.price);
    }

    return matchingProducts;
  }, [category, products, query, sortOrder]);

  return (
    <section aria-label="Демо-каталог дверей">
      <div className="catalog-toolbar">
        <label className="search-control">
          <Search aria-hidden="true" />
          <span className="sr-only">Поиск по каталогу</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти по названию, цвету или модели"
            type="search"
            value={query}
          />
        </label>
        <label className="select-control">
          <span className="sr-only">Сортировка</span>
          <select
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
            value={sortOrder}
          >
            <option value="default">Порядок каталога</option>
            <option value="price-asc">Сначала дешевле</option>
            <option value="price-desc">Сначала дороже</option>
          </select>
        </label>
      </div>

      <div aria-label="Фильтр по назначению" className="filter-row">
        <span className="filter-label">Назначение:</span>
        {filters.map((filter) => (
          <button
            aria-pressed={category === filter.value}
            className="filter-chip"
            key={filter.value}
            onClick={() => setCategory(filter.value)}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>

      <p aria-live="polite" className="catalog-count">
        Найдено: <strong>{visibleProducts.length}</strong> из {products.length}
        {demoMode ? " демонстрационных моделей" : " моделей магазина"}
      </p>

      {visibleProducts.length > 0 ? (
        <div className="product-grid catalog-grid">
          {visibleProducts.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      ) : (
        <div className="empty-results">
          <h2>Ничего не найдено</h2>
          <p>Попробуйте изменить поисковый запрос или выбрать другую категорию.</p>
        </div>
      )}
    </section>
  );
}
