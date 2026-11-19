const steps = [
  {
    title: "Заявка",
    text: "Оставьте заявку на сайте или позвоните: подскажем модель, цвет и цену под ваш проём.",
  },
  {
    title: "Замер",
    text: "Бесплатный замер по городу: проверяем проём, стену, сторону открывания и условия монтажа.",
  },
  {
    title: "Доставка и монтаж",
    text: "Привозим дверь в удобный день и устанавливаем — обычно в течение одного дня.",
  },
  {
    title: "Оплата после установки",
    text: "Сначала принимаете работу, потом оплачиваете. Гарантия на дверь и монтаж — 1 год.",
  },
];

export function HowWeWork() {
  return (
    <section className="section how-we-work" id="how-we-work">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Как мы работаем</span>
            <h2>От заявки до установки — четыре шага</h2>
          </div>
          <p>Без предоплаты за дверь и без сюрпризов в день монтажа.</p>
        </div>
        <ol className="steps-grid">
          {steps.map((step, index) => (
            <li className="step-card" key={step.title}>
              <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
