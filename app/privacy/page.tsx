import { Suspense } from "react";
import { connection } from "next/server";
import { AttributionTracker } from "@/components/attribution-tracker";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorefrontTheme } from "@/components/site/storefront-theme";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";

export const metadata = {
  title: "Политика обработки персональных данных — ДверМонт",
  description:
    "Как магазин ДверМонт обрабатывает персональные данные: какие данные собираются, зачем, сколько хранятся и как отозвать согласие.",
  robots: { index: false, follow: true },
};

const sections: Array<{ title: string; paragraphs: string[] }> = [
  {
    title: "1. Общие положения",
    paragraphs: [
      "Политика определяет порядок обработки персональных данных и меры по обеспечению их безопасности. Оператор — магазин ДверМонт, контакт для обращений: info@dvermont.ru.",
      "Политика разработана в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных».",
    ],
  },
  {
    title: "2. Какие данные мы собираем",
    paragraphs: [
      "Из формы заявки: имя, телефон, адрес для замера или доставки, комментарий, удобное время звонка.",
      "Обезличенные данные о посещении сайта: cookie, источник перехода, UTM-метки, IP-адрес.",
    ],
  },
  {
    title: "3. Зачем мы их обрабатываем",
    paragraphs: [
      "Чтобы принять и обработать заявку, связаться с вами, подготовить расчёт, оформить заказ, выполнить доставку, монтаж и гарантийное обслуживание, сообщать статус заказа.",
    ],
  },
  {
    title: "4. Основания и сроки",
    paragraphs: [
      "Основания: ваше согласие, исполнение договора, требования законодательства.",
      "Срок хранения — не дольше, чем нужно для целей обработки, но не более 3 лет с последнего обращения, если иное не предусмотрено законом. По запросу данные удаляются.",
    ],
  },
  {
    title: "5. Кому передаются данные",
    paragraphs: [
      "Подрядчикам, привлечённым для выполнения заказа (доставка, монтаж), и поставщику хостинга на территории Российской Федерации — в объёме, необходимом для оказания услуг.",
      "Передача персональных данных за пределы Российской Федерации не осуществляется.",
    ],
  },
  {
    title: "6. Ваши права",
    paragraphs: [
      "Вы можете запросить сведения об обработке ваших данных, потребовать уточнения, блокирования или удаления, а также отозвать согласие.",
      "Обращения принимаются по адресу info@dvermont.ru и рассматриваются в течение 10 рабочих дней.",
    ],
  },
  {
    title: "7. Меры защиты",
    paragraphs: [
      "Доступ сотрудников ограничен ролями, соединение защищено HTTPS, данные резервируются, действия в системе журналируются.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <AttributionTracker />
      <Suspense fallback={<main className="container"><p>Загрузка…</p></main>}>
        <PrivacyContent />
      </Suspense>
    </>
  );
}

async function PrivacyContent() {
  await connection();
  const configuration = (await getPublicStorefront()) ?? defaultStorefrontConfiguration;
  return (
    <StorefrontTheme configuration={configuration}>
      <>
        <div className="announcement">Политика обработки персональных данных</div>
        <SiteHeader identity={configuration.identity} />
        <main className="content-main">
          <div className="container content-page">
            <span className="eyebrow">Документы</span>
            <h1>Политика обработки персональных данных</h1>
            <div className="seo-text">
              {sections.map((section) => (
                <section key={section.title}>
                  <h2>{section.title}</h2>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                  ))}
                </section>
              ))}
            </div>
            <p className="content-note">
              Документ требует проверки юристом и указания реквизитов оператора перед публичным
              запуском.
            </p>
          </div>
        </main>
        <SiteFooter identity={configuration.identity} />
      </>
    </StorefrontTheme>
  );
}
