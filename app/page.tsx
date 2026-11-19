import { AttributionTracker } from "@/components/attribution-tracker";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowUpRight, Boxes, ShieldCheck } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorefrontHomeSections } from "@/components/site/storefront-home-sections";
import { StorefrontTheme } from "@/components/site/storefront-theme";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";
import { isDemoMode } from "@/lib/db/config";
import { getPublicCatalogProducts } from "@/lib/storefront/catalog";

const categories = [
  {
    icon: Boxes,
    title: "Для квартиры",
    detail: "Тёплые двери с шумоизоляцией для подъезда",
    href: "/catalog?purpose=apartment",
  },
  {
    icon: ShieldCheck,
    title: "Для дома",
    detail: "Терморазрыв и утепление — для улицы и мороза",
    href: "/catalog?purpose=house",
  },
];

export default function Home() {
  return (
    <>
      <AttributionTracker />
      <Suspense fallback={<main className="container"><p>Загрузка витрины…</p></main>}>
        <HomeContent />
      </Suspense>
    </>
  );
}

async function HomeContent() {
  await connection();
  const demoMode = isDemoMode();
  const products = (await getPublicCatalogProducts()).slice(0, 3);
  const configuration = (await getPublicStorefront()) ?? defaultStorefrontConfiguration;
  return (
    <StorefrontTheme configuration={configuration}>
    <>
      <div className="announcement">
        {demoMode
          ? "ДЕМО-ВИТРИНА · ЦЕНЫ И ХАРАКТЕРИСТИКИ ПОКАЗАНЫ ТОЛЬКО ДЛЯ ПРИМЕРА"
          : "Стальные двери с установкой в Челябинске · Замер бесплатно"}
      </div>
      <SiteHeader identity={configuration.identity} />
      <main>
        <StorefrontHomeSections configuration={configuration} />

        <section className="section" id="collection">
          <div className="container">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{demoMode ? "Коллекция для примера" : "Ассортимент магазина"}</span>
                <h2>Модели дверей</h2>
              </div>
              <Link className="text-link text-link-underline" href="/catalog">
                {demoMode ? "Весь демо-каталог" : "Весь каталог"} <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
            <div className="product-grid">
              {products.slice(0, 3).map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          </div>
        </section>

        <section className="section category-section" id="categories">
          <div className="container">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Выберите назначение</span>
                <h2>С чего начать</h2>
              </div>
              <p>
                {demoMode
                  ? "Назначение, размеры и условия эксплуатации помогают сравнить варианты. Демонстрационные категории пока не привязаны к ассортименту конкретного магазина."
                  : "Фильтруйте опубликованные модели по назначению, чтобы быстрее найти подходящие варианты."}
              </p>
            </div>
            <div className="category-grid">
              {categories.map(({ icon: Icon, title, detail, href }) => (
                <Link className="category-tile" href={href} key={title}>
                  <span className="category-tile-icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <span className="category-tile-bottom">
                    <span>
                      <h3>{title}</h3>
                      <p>{detail}</p>
                    </span>
                    <span className="category-tile-arrow">
                      <ArrowUpRight aria-hidden="true" />
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

      </main>
      {demoMode && (
        <div className="demo-disclaimer">
          Все названия, изображения, характеристики и цены товаров на этой
          странице — демонстрационные данные DoorFlow. Это не предложение о
          продаже; обращения не отправляются и не сохраняются.
        </div>
      )}
      <SiteFooter identity={configuration.identity} />
    </>
    </StorefrontTheme>
  );
}
