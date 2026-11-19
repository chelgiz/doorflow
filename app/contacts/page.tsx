import { Suspense } from "react";
import { connection } from "next/server";
import { AttributionTracker } from "@/components/attribution-tracker";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorefrontTheme } from "@/components/site/storefront-theme";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";

export default function ContactsPage() {
  return (
    <>
      <AttributionTracker />
      <Suspense fallback={<main className="container"><p>Загрузка…</p></main>}>
        <ContactsContent />
      </Suspense>
    </>
  );
}

async function ContactsContent() {
  await connection();
  const configuration = (await getPublicStorefront()) ?? defaultStorefrontConfiguration;
  const phone = configuration.identity.phone;
  return (
    <StorefrontTheme configuration={configuration}>
      <>
        <div className="announcement">Приём заявок ежедневно 09:00–19:00</div>
        <SiteHeader identity={configuration.identity} />
        <main className="content-main">
          <div className="container content-page">
            <span className="eyebrow">Контакты</span>
            <h1>Свяжитесь с нами</h1>
            <div className="content-cards">
              <article className="content-card">
                <h2>Телефон</h2>
                <p>{phone ? <a href={`tel:${phone}`}>{phone}</a> : "Уточняется"}</p>
                <p className="content-note">Ежедневно 09:00–19:00</p>
              </article>
              <article className="content-card">
                <h2>Почта</h2>
                <p>{configuration.identity.email ? <a href={`mailto:${configuration.identity.email}`}>{configuration.identity.email}</a> : "Уточняется"}</p>
              </article>
              <article className="content-card">
                <h2>Адрес</h2>
                {configuration.identity.locations.map((location) => (
                  <address key={location.id ?? location.address}>
                    {location.address}
                    {location.businessHours && <span>{location.businessHours}</span>}
                  </address>
                ))}
              </article>
              <article className="content-card">
                <h2>Заявка на замер</h2>
                <p>Оставьте заявку на сайте — перезвоним, уточним проём и подберём модель.</p>
              </article>
            </div>
          </div>
        </main>
        <SiteFooter identity={configuration.identity} />
      </>
    </StorefrontTheme>
  );
}
