import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";

export default function NotFound() {
  return (
    <>
      <SiteHeader identity={defaultStorefrontConfiguration.identity} />
      <main className="container not-found">
        <span className="eyebrow">Страница не найдена</span>
        <h1>Такой модели нет в демо-каталоге.</h1>
        <p>Вернитесь к списку демонстрационных моделей.</p>
        <Link className="button button-accent" href="/catalog">
          Открыть каталог
        </Link>
      </main>
      <SiteFooter identity={defaultStorefrontConfiguration.identity} />
    </>
  );
}
