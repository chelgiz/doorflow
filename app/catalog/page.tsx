import { AttributionTracker } from "@/components/attribution-tracker";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CatalogBrowser } from "@/app/catalog/catalog-browser";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorefrontTheme } from "@/components/site/storefront-theme";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";
import { getPublicCatalogProducts } from "@/lib/storefront/catalog";
import { isDemoMode } from "@/lib/db/config";

export const metadata = {
  title: "Каталог стальных входных дверей — ДверМонт, Челябинск",
  description:
    "41 модель стальных входных дверей для квартиры и дома: цены, характеристики, наличие. Доставка и монтаж по Челябинску, оплата после установки.",
};

export default function CatalogPage() {
  return (
    <>
      <AttributionTracker />
      <Suspense fallback={<main className="catalog-main"><div className="container">Загрузка каталога…</div></main>}>
        <CatalogContent />
      </Suspense>
    </>
  );
}

async function CatalogContent() {
  await connection();
  const demoMode = isDemoMode();
  const products = await getPublicCatalogProducts();
  const configuration = (await getPublicStorefront()) ?? defaultStorefrontConfiguration;
  return (
    <StorefrontTheme configuration={configuration}>
    <>
      <div className="announcement">
        {demoMode
          ? "ДЕМО-КАТАЛОГ · ВСЕ ЦЕНЫ И ПАРАМЕТРЫ УСЛОВНЫЕ"
          : "Каталог магазина · цены и характеристики предоставлены магазином"}
      </div>
      <SiteHeader identity={configuration.identity} />
      <main className="catalog-main">
        <div className="container">
          <div className="catalog-intro">
            <Link className="breadcrumbs" href="/">
              <ArrowLeft aria-hidden="true" size={14} /> Главная
            </Link>
            <span className="eyebrow">
              {demoMode ? "Двери · демонстрационная коллекция" : "Каталог магазина"}
            </span>
            <h1>Каталог входных дверей</h1>
            <p>
              {demoMode
                ? "Ищите по модели, оттенку или назначению. Характеристики и цены приведены только для демонстрации интерфейса DoorFlow."
                : "Ищите двери по модели, названию или назначению и сравнивайте опубликованные магазином характеристики."}
            </p>
          </div>
          <CatalogBrowser demoMode={demoMode} products={products} />
        </div>
      </main>
      <div className="demo-disclaimer">
        {demoMode
          ? "DEMO: все модели и цены — вымышленные примеры. Наличие и предложения реальных магазинов здесь не представлены."
          : "Информация о наличии и окончательной стоимости уточняется у магазина."}
      </div>
      <SiteFooter identity={configuration.identity} />
    </>
    </StorefrontTheme>
  );
}
