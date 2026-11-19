import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AttributionTracker } from "@/components/attribution-tracker";
import { ProductCard } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorefrontTheme } from "@/components/site/storefront-theme";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";
import { getPublicCatalogProducts } from "@/lib/storefront/catalog";

type CategoryLandingProps = {
  category: "apartment" | "house";
  eyebrow: string;
  title: string;
  lead: string;
  paragraphs: string[];
  announcement: string;
};

export function CategoryLanding(props: CategoryLandingProps) {
  return (
    <>
      <AttributionTracker />
      <Suspense fallback={<main className="container"><p>Загрузка каталога…</p></main>}>
        <CategoryLandingContent {...props} />
      </Suspense>
    </>
  );
}

async function CategoryLandingContent({
  category,
  eyebrow,
  title,
  lead,
  paragraphs,
  announcement,
}: CategoryLandingProps) {
  await connection();
  const configuration = (await getPublicStorefront()) ?? defaultStorefrontConfiguration;
  const products = (await getPublicCatalogProducts()).filter(
    (product) => product.category === category,
  );
  return (
    <StorefrontTheme configuration={configuration}>
      <>
        <div className="announcement">{announcement}</div>
        <SiteHeader identity={configuration.identity} />
        <main className="content-main">
          <div className="container">
            <nav aria-label="Навигация" className="breadcrumbs">
              <Link href="/">Главная</Link>
              <span aria-hidden="true">/</span>
              <Link href="/catalog">Каталог</Link>
              <span aria-hidden="true">/</span>
              <span>{title}</span>
            </nav>
            <span className="eyebrow">{eyebrow}</span>
            <h1 className="content-title">{title}</h1>
            <p className="content-lead">{lead}</p>

            <div className="product-grid">
              {products.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>

            <div className="seo-text">
              {paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </div>

            <div className="content-actions">
              <Link className="button button-outline" href="/catalog">
                <ArrowLeft aria-hidden="true" /> Весь каталог
              </Link>
              <Link className="button button-accent" href="/catalog">
                Подобрать дверь
              </Link>
            </div>
          </div>
        </main>
        <SiteFooter identity={configuration.identity} />
      </>
    </StorefrontTheme>
  );
}
