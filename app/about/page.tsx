import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { AttributionTracker } from "@/components/attribution-tracker";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorefrontTheme } from "@/components/site/storefront-theme";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";

export default function AboutPage() {
  return (
    <>
      <AttributionTracker />
      <Suspense fallback={<main className="container"><p>Загрузка…</p></main>}>
        <AboutContent />
      </Suspense>
    </>
  );
}

async function AboutContent() {
  await connection();
  const configuration = (await getPublicStorefront()) ?? defaultStorefrontConfiguration;
  return (
    <StorefrontTheme configuration={configuration}>
      <>
        <div className="announcement">Стальные двери в Челябинске с 2007 года</div>
        <SiteHeader identity={configuration.identity} />
        <main className="content-main">
          <div className="container content-page">
            <span className="eyebrow">О магазине</span>
            <h1>ДверМонт — стальные двери с установкой</h1>
            <p className="content-lead">
              Мы занимаемся входными стальными дверями с 2007 года. Подбираем модель под ваш
              проём, привозим и устанавливаем сами — без подрядчиков и посредников между
              вами и монтажом.
            </p>
            <div className="content-cards">
              <article className="content-card">
                <h2>Подбор под проём</h2>
                <p>
                  Замер по Челябинску бесплатный: проверяем проём, сторону открывания и стену,
                  чтобы дверь встала без переделок.
                </p>
              </article>
              <article className="content-card">
                <h2>Монтаж своими руками</h2>
                <p>
                  Устанавливаем сами: дверь, коробку, наличники и откосы делает один мастер,
                  который отвечает за результат.
                </p>
              </article>
              <article className="content-card">
                <h2>Оплата после установки</h2>
                <p>
                  Постоплата: сначала принимаете работу, потом оплачиваете. Предоплату за
                  дверь не берём.
                </p>
              </article>
              <article className="content-card">
                <h2>Гарантия 1 год</h2>
                <p>
                  Гарантия на дверь и монтаж. Если что-то не так — приезжаем и разбираемся.
                </p>
              </article>
            </div>
            <p className="content-note">
              Каталог и цены — <Link href="/catalog">на этой странице</Link>. Доставка и монтаж —
              во <Link href="/delivery">прайсе работ</Link>.
            </p>
          </div>
        </main>
        <SiteFooter identity={configuration.identity} />
      </>
    </StorefrontTheme>
  );
}
