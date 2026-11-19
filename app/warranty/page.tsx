import { Suspense } from "react";
import { connection } from "next/server";
import { AttributionTracker } from "@/components/attribution-tracker";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorefrontTheme } from "@/components/site/storefront-theme";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";

export const metadata = {
  title: "Гарантия и оплата — ДверМонт",
  description:
    "Оплата после установки, гарантия 1 год на дверь и монтаж, сроки поставки: в наличии или до 2 недель под заказ.",
};

export default function WarrantyPage() {
  return (
    <>
      <AttributionTracker />
      <Suspense fallback={<main className="container"><p>Загрузка…</p></main>}>
        <WarrantyContent />
      </Suspense>
    </>
  );
}

async function WarrantyContent() {
  await connection();
  const configuration = (await getPublicStorefront()) ?? defaultStorefrontConfiguration;
  return (
    <StorefrontTheme configuration={configuration}>
      <>
        <div className="announcement">Оплата после установки · Гарантия 1 год</div>
        <SiteHeader identity={configuration.identity} />
        <main className="content-main">
          <div className="container content-page">
            <span className="eyebrow">Гарантия и оплата</span>
            <h1>Сначала принимаете работу, потом платите</h1>
            <div className="content-cards">
              <article className="content-card">
                <h2>Оплата после установки</h2>
                <p>
                  Постоплата: вы проверяете дверь, работу и документы, и только после этого
                  оплачиваете. Предоплату за дверь не берём.
                </p>
              </article>
              <article className="content-card">
                <h2>Гарантия 1 год</h2>
                <p>
                  Гарантия действует на дверь и на монтаж. Если что-то пошло не так — приезжаем
                  и разбираемся, а не отправляем к производителю.
                </p>
              </article>
              <article className="content-card">
                <h2>Сроки</h2>
                <p>
                  Большинство моделей есть в наличии — привезём и поставим в ближайшие дни.
                  Отдельные позиции под заказ: в среднем до 2 недель.
                </p>
              </article>
              <article className="content-card">
                <h2>Документы</h2>
                <p>
                  Передаём документы на дверь и работы. Все условия — до начала монтажа,
                  без доплат «по факту».
                </p>
              </article>
            </div>
          </div>
        </main>
        <SiteFooter identity={configuration.identity} />
      </>
    </StorefrontTheme>
  );
}
