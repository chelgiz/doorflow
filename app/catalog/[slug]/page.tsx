import { AttributionTracker } from "@/components/attribution-tracker";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { DoorConfigurator } from "@/components/door-configurator";
import { DoorIllustration } from "@/components/door-illustration";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorefrontTheme } from "@/components/site/storefront-theme";
import { demoStorePricing } from "@/lib/commerce/demo-pricing";
import { getQuoteSource } from "@/lib/commerce/quote-source";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";
import { products } from "@/lib/products";
import { getPublicProduct } from "@/lib/storefront/catalog";

const priceFormatter = new Intl.NumberFormat("ru-RU");

const specificationLabels: Record<string, string> = {
  dimensions: "Размер",
  height: "Высота",
  width: "Ширина",
  leafThickness: "Толщина полотна",
  steelThickness: "Толщина металла",
  sealContours: "Уплотнение",
  insulation: "Утепление",
  exteriorFinish: "Наружная отделка",
  interiorFinish: "Внутренняя отделка",
  color: "Цвет",
  locks: "Замки",
  weight: "Вес",
  warrantyYears: "Гарантия",
  series: "Серия",
};

function formatAttribute(key: string, value: string | number | boolean) {
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value !== "number") return value;
  if (["height", "width", "leafThickness", "steelThickness"].includes(key)) return `${value} мм`;
  if (key === "weight") return `${value} кг`;
  if (key === "sealContours") return `${value} контура`;
  if (key === "warrantyYears") return `${value} года`;
  return String(value);
}

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return products.map(({ slug }) => ({ slug }));
}

export default function ProductPage({ params }: ProductPageProps) {
  return (
    <>
      <AttributionTracker />
      <Suspense fallback={<main className="detail-main"><div className="container">Загрузка товара…</div></main>}>
        <ProductPageContent params={params} />
      </Suspense>
    </>
  );
}

async function ProductPageContent({ params }: ProductPageProps) {
  await connection();
  const { slug } = await params;
  const product = await getPublicProduct(slug);
  const configuration = (await getPublicStorefront()) ?? defaultStorefrontConfiguration;

  if (!product) {
    notFound();
  }
  const pricingRules = product.isDemo
    ? demoStorePricing.rules
    : (await getQuoteSource(slug))?.pricing.rules;
  if (!pricingRules) notFound();
  // Internal keys that must not reach the customer-facing specification list.
  const hiddenSpecificationKeys = new Set(["seriesLabel", "variant"]);
  const specifications: Array<[string, string | number | boolean]> = Object.entries(
    product.attributes,
  )
    .filter(([key]) => !hiddenSpecificationKeys.has(key))
    .map(([key, value]) => {
      // `series` stores a machine value next to its Russian label; show the label.
      const seriesLabel = product.attributes.seriesLabel;
      if (key === "series" && typeof seriesLabel === "string" && seriesLabel.length > 0) {
        return [key, seriesLabel];
      }
      return [key, value];
    });

  return (
    <StorefrontTheme configuration={configuration}>
    <>
      {product.isDemo && (
        <div className="announcement">
          DEMO · МОДЕЛЬ, ХАРАКТЕРИСТИКИ И ЦЕНА НЕ ЯВЛЯЮТСЯ ДАННЫМИ МАГАЗИНА
        </div>
      )}
      <SiteHeader identity={configuration.identity} />
      <main className="detail-main">
        <div className="container">
          <nav aria-label="Навигация" className="breadcrumbs">
            <Link href="/">Главная</Link>
            <span aria-hidden="true">/</span>
            <Link href="/catalog">Каталог</Link>
            <span aria-hidden="true">/</span>
            <span>{product.name}</span>
          </nav>

          <div className="detail-grid">
            <div className="detail-art">
              <span className="demo-badge">
                {product.isDemo ? "DEMO · ПРИМЕР" : "ИЛЛЮСТРАЦИЯ"}
              </span>
              {product.imageUrl ? (
                <Image
                  alt={`Фото двери ${product.name}`}
                  className="door-illustration"
                  height={480}
                  src={product.imageUrl}
                  unoptimized
                  width={360}
                />
              ) : (
                <DoorIllustration
                  label={`Иллюстрация модели ${product.name}`}
                  variant={product.variant}
                />
              )}
            </div>

            <article className="detail-copy">
              <span className="eyebrow">{product.model} · {product.categoryLabel}</span>
              <h1>{product.name}</h1>
              <p>{product.description}</p>
              <div className="detail-price">
                <strong>{priceFormatter.format(product.price)} ₽</strong>
                <span>{product.isDemo ? "условная цена · DEMO" : "базовая цена магазина"}</span>
              </div>
              <h2 className="sr-only">Характеристики</h2>
              <dl className="detail-spec-list">
                {specifications.map(([key, value]) => (
                  <div className="detail-spec" key={key}>
                    <dt>{specificationLabels[key] ?? key}</dt>
                    <dd>{formatAttribute(key, value)}</dd>
                  </div>
                ))}
              </dl>
              <div className="detail-actions">
                <Link className="button button-accent" href="/catalog">
                  Вернуться в каталог <ArrowRight aria-hidden="true" />
                </Link>
                <Link className="button button-outline" href="/catalog">
                  <ArrowLeft aria-hidden="true" /> Все модели
                </Link>
              </div>
            </article>
          </div>
          <DoorConfigurator
            basePriceMinor={product.price * 100}
            optionGroups={product.optionGroups}
            pricingRules={pricingRules}
            productName={product.name}
            productSlug={product.slug}
            isDemoProduct={product.isDemo}
          />
        </div>
      </main>
      {product.isDemo && (
        <div className="demo-disclaimer">
          Демонстрационный товар: цена и характеристики вымышлены. Заказ реального
          товара из DEMO-каталога невозможен.
        </div>
      )}
      <SiteFooter identity={configuration.identity} />
    </>
    </StorefrontTheme>
  );
}
