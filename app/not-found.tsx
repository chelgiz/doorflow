import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorefrontTheme } from "@/components/site/storefront-theme";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";

export const metadata = {
  title: "Страница не найдена — ДверМонт",
  robots: { index: false, follow: true },
};

export default async function NotFound() {
  // A real store must render its own identity, not the demo defaults.
  const configuration =
    (await getPublicStorefront().catch(() => null)) ?? defaultStorefrontConfiguration;

  return (
    <StorefrontTheme configuration={configuration}>
      <>
        <div className="announcement">Стальные двери с установкой в Челябинске</div>
        <SiteHeader identity={configuration.identity} />
        <main className="content-main">
          <div className="container not-found">
            <span className="eyebrow">Ошибка 404</span>
            <h1>Такой страницы нет</h1>
            <p>
              Возможно, модель больше не продаётся или ссылка устарела. Загляните в каталог —
              там 41 модель с ценами и характеристиками.
            </p>
            <div className="content-actions">
              <Link className="button button-accent" href="/catalog">
                Открыть каталог
              </Link>
              <Link className="button button-outline" href="/">
                На главную
              </Link>
            </div>
            <p className="content-note">
              Нужна помощь с подбором? <Link href="/contacts">Свяжитесь с нами</Link> или
              посмотрите <Link href="/delivery">условия доставки и монтажа</Link>.
            </p>
          </div>
        </main>
        <SiteFooter identity={configuration.identity} />
      </>
    </StorefrontTheme>
  );
}
