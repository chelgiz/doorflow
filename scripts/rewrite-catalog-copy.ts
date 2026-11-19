/**
 * Переписывает названия и описания товаров каталога человеческим языком.
 *
 * Прайс дилера даёт точные характеристики, но текст «Дверная коробка:. Короб
 * закрытый утепленный…» не продаёт. Скрипт оставляет характеристики в
 * specifications, а description собирает из них короткий живой текст.
 *
 * Usage: npx tsx scripts/rewrite-catalog-copy.ts [--apply|--dry-run]
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

type Specs = Record<string, unknown>;

const MODEL_CODE = /^[А-ЯA-Z]{1,4}[-\s]?\d/i;

function cleanName(source: string) {
  const normalized = source
    .replace(/\s+/g, " ")
    .replace(/([А-ЯA-Z]{1,4})-\s+(\d)/g, "$1-$2")
    .trim();
  return normalized
    .split(" ")
    .map((word) => {
      if (!word) return word;
      if (MODEL_CODE.test(word)) return word.replace(/^([а-яa-z])/, (char) => char.toUpperCase());
      if (word === "/" || word === "·") return word;
      if (word.length > 2 && word === word.toUpperCase()) {
        return word.charAt(0) + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(" ");
}

function text(specs: Specs, key: string) {
  const value = specs[key];
  return typeof value === "string" ? value.trim() : "";
}

function numberOf(specs: Specs, key: string) {
  const value = Number(specs[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const OPENERS: Record<"apartment" | "house", string[]> = {
  apartment: [
    "Дверь для квартиры: не пропускает шум подъезда и держит тепло.",
    "Спокойная дверь для квартиры — тихая, тёплая и с нормальными замками.",
    "Входная дверь для квартиры: закрывается плотно, не гуляет и не скрипит.",
  ],
  house: [
    "Дверь с терморазрывом для загородного дома: держит тепло даже в мороз.",
    "Уличная дверь для дома — с терморазрывом и утеплённой коробкой.",
    "Дверь для дома с улицы: не промерзает, не конденсирует влагу на полотне.",
  ],
};

const CLOSERS = [
  "Бесплатный замер по городу, доставка и монтаж — по Челябинску и области.",
  "Привезём, поднимем и установим; оплата после установки. Гарантия 1 год.",
  "Размеры под стандартный проём — 860 и 960 мм, открывание влево или вправо.",
];

function pick<T>(items: T[], seed: number) {
  return items[seed % items.length];
}

function buildDescription(name: string, category: string, specs: Specs, index: number) {
  const isHouse = category === "house";
  const leaf = numberOf(specs, "leafThickness");
  const contours = numberOf(specs, "sealContours");
  const insulation = text(specs, "insulation");
  const locks = text(specs, "locks");
  const outside = text(specs, "exteriorFinish");
  const inside = text(specs, "interiorFinish");
  const color = text(specs, "color");

  const details: string[] = [];
  if (leaf) details.push(`полотно ${leaf} мм`);
  if (contours) details.push(`${contours} ${contours === 1 ? "контур" : "контура"} уплотнения`);
  if (insulation) details.push(`утепление — ${insulation.toLowerCase()}`);
  const factsText = details.join(", ");
  const facts = factsText ? `${factsText.charAt(0).toUpperCase()}${factsText.slice(1)}.` : "";

  const extras: string[] = [];
  if (locks) extras.push(`Замки: ${locks}.`);
  if (outside) extras.push(`Снаружи — ${outside.toLowerCase()}.`);
  if (inside) extras.push(`Внутри — ${inside.toLowerCase()}.`);
  if (color) extras.push(`Цвет: ${color.toLowerCase()}.`);

  const opener = pick(OPENERS[isHouse ? "house" : "apartment"], index);
  const closer = pick(CLOSERS, index + 1);
  const body = [opener, facts, ...extras, closer].filter(Boolean).join(" ");
  return body.replace(/\s+/g, " ").slice(0, 2000);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const products = await prisma.product.findMany({
    where: { isDemo: false },
    select: { id: true, name: true, model: true, category: true, specifications: true, description: true },
    orderBy: { createdAt: "asc" },
  });

  let changed = 0;
  for (const [index, product] of products.entries()) {
    const specs = (product.specifications ?? {}) as Specs;
    const name = cleanName(product.name);
    const description = buildDescription(name, product.category, specs, index);
    if (name === product.name && description === product.description) continue;
    changed += 1;
    if (apply) {
      await prisma.product.update({ where: { id: product.id }, data: { name, description } });
    }
    if (changed <= 3) {
      console.log(`\n${product.name} → ${name}`);
      console.log(description);
    }
  }

  console.log(`\n${apply ? "обновлено" : "будет обновлено"}: ${changed} из ${products.length}`);
  await prisma.$disconnect();
}

void main();
