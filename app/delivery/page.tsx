import { Suspense } from "react";
import { connection } from "next/server";
import { AttributionTracker } from "@/components/attribution-tracker";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StorefrontTheme } from "@/components/site/storefront-theme";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";

const works = [
  { name: "Замер в черте города", price: "бесплатно" },
  { name: "Выезд за город", price: "60 ₽ за километр" },
  { name: "Доставка по городу", price: "1 200 ₽" },
  { name: "Доставка за город", price: "60 ₽ за километр" },
  { name: "Монтаж двери", price: "4 000 ₽" },
  { name: "Монтаж термо-двери", price: "4 500 ₽" },
  { name: "Демонтаж железной двери", price: "1 000 ₽" },
  { name: "Демонтаж деревянной двери", price: "700 ₽" },
  { name: "Подъём на лифте (до 60 кг / больше)", price: "600 / 800 ₽" },
  { name: "Подъём по этажам (до 60 кг / больше)", price: "300 / 400 ₽" },
  { name: "Расширение проёма", price: "1 000 ₽ за метр" },
  { name: "Демонтаж заливной коробки с расширением", price: "5 500 ₽" },
  { name: "Монтажные пластины", price: "1 000 ₽" },
  { name: "Утепление коробки термо-двери", price: "600 ₽" },
  { name: "Наличники МДФ", price: "600 ₽" },
  { name: "Отделка откосов МДФ", price: "от 6 500 ₽" },
  { name: "Закладка проёма пеноблоком", price: "от 1 700 ₽" },
];

export default function DeliveryPage() {
  return (
    <>
      <AttributionTracker />
      <Suspense fallback={<main className="container"><p>Загрузка…</p></main>}>
        <DeliveryContent />
      </Suspense>
    </>
  );
}

async function DeliveryContent() {
  await connection();
  const configuration = (await getPublicStorefront()) ?? defaultStorefrontConfiguration;
  return (
    <StorefrontTheme configuration={configuration}>
      <>
        <div className="announcement">Доставка и монтаж по Челябинску и области</div>
        <SiteHeader identity={configuration.identity} />
        <main className="content-main">
          <div className="container content-page">
            <span className="eyebrow">Доставка и монтаж</span>
            <h1>Привезём, поднимем и установим</h1>
            <p className="content-lead">
              Работаем по Челябинску и области. Монтаж выполняет мастер, а не подрядчик: дверь
              ставим в день доставки, обычно за один выезд. Замер по городу — бесплатно.
            </p>
            <table className="price-table">
              <thead>
                <tr>
                  <th>Работа</th>
                  <th>Стоимость</th>
                </tr>
              </thead>
              <tbody>
                {works.map((work) => (
                  <tr key={work.name}>
                    <td>{work.name}</td>
                    <td>{work.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="content-note">
              На уличные работы при отрицательной температуре воздуха действует надбавка 20 %.
              Итоговую стоимость подтверждаем после замера.
            </p>
          </div>
        </main>
        <SiteFooter identity={configuration.identity} />
      </>
    </StorefrontTheme>
  );
}
