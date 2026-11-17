import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";

export default async function NotFound() {
  // A real store must render its own identity, not the demo defaults.
  const configuration =
    (await getPublicStorefront().catch(() => null)) ?? defaultStorefrontConfiguration;

  return (
    <>
      <SiteHeader identity={configuration.identity} />
      <main className="container not-found">
        <span className="eyebrow">Страница не найдена</span>
        <h1>Такой страницы нет.</h1>
        <p>Возможно, модель больше не продаётся или ссылка устарела.</p>
        <Link className="button button-accent" href="/catalog">
          Открыть каталог
        </Link>
      </main>
      <SiteFooter identity={configuration.identity} />
    </>
  );
}
