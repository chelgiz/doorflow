/**
 * Pilot seeding tool for a single non-demo DoorFlow store.
 *
 * This replaces the interactive `scripts/create-admin.ts` for automated pilot
 * preparation. It reuses the same production helpers (Argon2id password
 * hashing and storefront configuration) so the resulting rows are identical in
 * shape to the ones that script creates, but it can run non-interactively and
 * is idempotent.
 *
 * Usage:
 *   npx tsx scripts/seed-pilot.ts --store-owner   # store + locations + owner
 *   npx tsx scripts/seed-pilot.ts --catalog       # manufacturers, rules, products
 *   npx tsx scripts/seed-pilot.ts --store-owner --catalog
 *
 * The generated owner password is printed once and never stored in plaintext.
 *
 * NOTE: all catalogue content below is TEST DATA for the pilot. Prices, models
 * and specifications are plausible placeholders, not a real commercial offer.
 */
import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { hashAdminPassword } from "../lib/admin/password";
import { createStorefrontConfiguration } from "../lib/storefront/config";

/** Money is stored in integer kopeks; the helper keeps seed values readable in rubles. */
const rub = (amount: number) => BigInt(amount) * BigInt(100);


const STORE = {
  name: "ДверМонт",
  slug: "dvermont",
  settings: {
    contactPhone: "+7 (343) 000-00-01",
    contactEmail: "info@dvermont.ru",
  },
  ownerEmail: "owner@dvermont.ru",
};

const LOCATIONS = [
  {
    name: "Салон на Ленина",
    address: "г. Екатеринбург, ул. Ленина, 24",
    phone: "+7 (343) 000-00-01",
    businessHours: "Пн–Сб 10:00–19:00",
    sortOrder: 0,
  },
  {
    name: "Склад-шоурум",
    address: "г. Екатеринбург, ул. Артинская, 8",
    phone: "+7 (343) 000-00-02",
    businessHours: "Пн–Пт 09:00–18:00",
    sortOrder: 1,
  },
];

type PricingSeed = {
  key: string;
  label: string;
  method: Prisma.PricingRuleCreateInput["method"];
  priceMinor: bigint;
  maxQuantity: number;
};

const PRICING_RULES: PricingSeed[] = [
  { key: "delivery", label: "Доставка", method: "FIXED", priceMinor: rub(2_500), maxQuantity: 1 },
  { key: "installation", label: "Монтаж", method: "PER_DOOR", priceMinor: rub(7_200), maxQuantity: 1 },
  { key: "dismantling", label: "Демонтаж", method: "PER_DOOR", priceMinor: rub(1_800), maxQuantity: 1 },
  { key: "trim-set", label: "Комплект доборов", method: "PER_UNIT", priceMinor: rub(1_400), maxQuantity: 10 },
  { key: "casing-set", label: "Комплект наличников", method: "PER_UNIT", priceMinor: rub(1_100), maxQuantity: 10 },
];

/** Shared option groups; the same structure is intentionally reused per product. */
const OPTION_GROUPS = [
  {
    key: "lock-set",
    label: "Комплект замков",
    selectionMode: "SINGLE" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    options: [
      { key: "lock-standard", label: "Базовый", priceMinor: rub(0) },
      { key: "lock-enhanced", label: "Расширенный", priceMinor: rub(6_400) },
    ],
  },
  {
    key: "interior-panel",
    label: "Внутренняя панель",
    selectionMode: "SINGLE" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    options: [
      { key: "panel-standard", label: "Гладкая", priceMinor: rub(0) },
      { key: "panel-milled", label: "Фрезерованная", priceMinor: rub(4_800) },
    ],
  },
  {
    key: "size",
    label: "Размер проёма",
    selectionMode: "SINGLE" as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    options: [
      { key: "size-2000-800", label: "2000 × 800 мм", priceMinor: rub(0) },
      { key: "size-2050-900", label: "2050 × 900 мм", priceMinor: rub(3_500) },
      { key: "size-2100-1000", label: "2100 × 1000 мм", priceMinor: rub(6_900) },
    ],
  },
  {
    key: "accessories",
    label: "Дополнительная комплектация",
    selectionMode: "MULTIPLE" as const,
    required: false,
    minSelections: 0,
    maxSelections: 2,
    options: [
      { key: "door-closer", label: "Доводчик", priceMinor: rub(3_600) },
      { key: "cylinder-upgrade", label: "Цилиндровый механизм", priceMinor: rub(2_900) },
    ],
  },
];

type ProductSeed = {
  slug: string;
  model: string;
  name: string;
  /** Existing application category axis: apartment | house | technical. */
  category: "apartment" | "house" | "technical";
  /** New series axis stored in specifications, not in the category enum. */
  series: "budget" | "standard" | "luxury" | "premium";
  manufacturer: string;
  basePriceMinor: bigint;
  description: string;
  attributes: Record<string, string | number | boolean>;
};

const SERIES_LABELS: Record<ProductSeed["series"], string> = {
  budget: "Бюджет",
  standard: "Стандарт",
  luxury: "Люкс",
  premium: "Премиум",
};

const PRODUCTS: ProductSeed[] = [
  {
    slug: "df-a01-graphite",
    model: "DF-A01",
    name: "Графит",
    category: "apartment",
    series: "budget",
    manufacturer: "СтальПром",
    basePriceMinor: rub(48_900),
    description:
      "Практичная дверь для городской квартиры: порошковое покрытие, два контура уплотнения, базовый комплект замков.",
    attributes: {
      dimensions: "2000 × 800 мм",
      height: 2000,
      width: 800,
      leafThickness: 85,
      steelThickness: 1.5,
      sealContours: 2,
      insulation: "Минеральная плита",
      exteriorFinish: "Порошковое покрытие",
      interiorFinish: "Панель под ясень",
      color: "Графит",
      locks: "2 замка",
      weight: 78,
      warrantyYears: 2,
      variant: "graphite",
    },
  },
  {
    slug: "df-a03-slate",
    model: "DF-A03",
    name: "Сланец",
    category: "apartment",
    series: "standard",
    manufacturer: "СтальПром",
    basePriceMinor: rub(54_900),
    description:
      "Усиленный лист и три контура уплотнения для квартиры с интенсивным использованием входа.",
    attributes: {
      dimensions: "2050 × 900 мм",
      height: 2050,
      width: 900,
      leafThickness: 90,
      steelThickness: 1.8,
      sealContours: 3,
      insulation: "Минеральная плита + пенополистирол",
      exteriorFinish: "Порошковое покрытие",
      interiorFinish: "МДФ-панель",
      color: "Сланец",
      locks: "2 замка",
      weight: 88,
      warrantyYears: 3,
      variant: "slate",
    },
  },
  {
    slug: "df-h02-walnut",
    model: "DF-H02",
    name: "Тёплый орех",
    category: "house",
    series: "standard",
    manufacturer: "Дверной Завод Урал",
    basePriceMinor: rub(72_900),
    description:
      "Дверь для загородного дома: утолщённое полотно, комбинированное утепление, декоративная наружная панель.",
    attributes: {
      dimensions: "2050 × 900 мм",
      height: 2050,
      width: 900,
      leafThickness: 100,
      steelThickness: 1.8,
      sealContours: 3,
      insulation: "Комбинированное",
      exteriorFinish: "Декоративная панель",
      interiorFinish: "Панель под орех",
      color: "Орех",
      locks: "2 замка",
      weight: 96,
      warrantyYears: 3,
      variant: "walnut",
    },
  },
  {
    slug: "df-h05-oak",
    model: "DF-H05",
    name: "Дуб натуральный",
    category: "house",
    series: "luxury",
    manufacturer: "Дверной Завод Урал",
    basePriceMinor: rub(84_500),
    description:
      "Терморазрыв и увеличенная толщина стали для дома с постоянным проживанием, шпон дуба и скрытые петли.",
    attributes: {
      dimensions: "2100 × 1000 мм",
      height: 2100,
      width: 1000,
      leafThickness: 110,
      steelThickness: 2,
      sealContours: 4,
      insulation: "Пенополиуретан",
      exteriorFinish: "Шпон дуба",
      interiorFinish: "Шпон дуба",
      color: "Натуральный дуб",
      locks: "3 замка",
      weight: 118,
      warrantyYears: 5,
      variant: "olive",
    },
  },
  {
    slug: "df-t01-technical",
    model: "DF-T01",
    name: "Техническая",
    category: "technical",
    series: "budget",
    manufacturer: "СтальПром",
    basePriceMinor: rub(39_900),
    description:
      "Служебная дверь для подсобных помещений и складов: простая конструкция, один замок, окраска по RAL.",
    attributes: {
      dimensions: "2000 × 800 мм",
      height: 2000,
      width: 800,
      leafThickness: 60,
      steelThickness: 1.2,
      sealContours: 1,
      insulation: "Без утепления",
      exteriorFinish: "Окраска по RAL",
      interiorFinish: "Окраска по RAL",
      color: "Серый",
      locks: "1 замок",
      weight: 52,
      warrantyYears: 1,
      variant: "sand",
    },
  },
  {
    slug: "df-t02-technical-reinforced",
    model: "DF-T02",
    name: "Техническая усиленная",
    category: "technical",
    series: "standard",
    manufacturer: "СтальПром",
    basePriceMinor: rub(45_500),
    description:
      "Техническая дверь с усиленным каркасом и вторым контуром уплотнения для производственных помещений.",
    attributes: {
      dimensions: "2050 × 900 мм",
      height: 2050,
      width: 900,
      leafThickness: 70,
      steelThickness: 1.5,
      sealContours: 2,
      insulation: "Минеральная плита",
      exteriorFinish: "Порошковое покрытие",
      interiorFinish: "Окраска по RAL",
      color: "Тёмно-серый",
      locks: "2 замка",
      weight: 64,
      warrantyYears: 2,
      variant: "plum",
    },
  },
];

const PASSWORD_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePassword(length = 20) {
  let password = "";
  for (let index = 0; index < length; index += 1) {
    password += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return password;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function seedStoreAndOwner(prisma: PrismaClient) {
  const existing = await prisma.store.findUnique({
    where: { slug: STORE.slug },
    select: { id: true, name: true, users: { select: { email: true, role: true } } },
  });

  if (existing) {
    console.info("Store already exists; nothing was created.");
    console.info(`  slug: ${STORE.slug}`);
    console.info(`  id: ${existing.id}`);
    console.info(`  accounts: ${existing.users.map((user) => `${user.email} (${user.role})`).join(", ") || "none"}`);
    console.info(`Set DOORFLOW_STORE_ID=${existing.id}`);
    return;
  }

  const storeId = randomUUID();
  const password = generatePassword();
  const passwordHash = await hashAdminPassword(password);

  await prisma.$transaction(async (transaction) => {
    await transaction.store.create({
      data: {
        id: storeId,
        slug: STORE.slug,
        name: STORE.name,
        isDemo: false,
        settings: STORE.settings as Prisma.InputJsonValue,
      },
    });

    for (const location of LOCATIONS) {
      await transaction.storeLocation.create({
        data: { ...location, storeId },
      });
    }

    const storedLocations = await transaction.storeLocation.findMany({
      where: { storeId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, address: true, phone: true, businessHours: true },
    });
    const storefront = createStorefrontConfiguration(
      { name: STORE.name, settings: STORE.settings },
      storedLocations,
    );

    await transaction.storefront.create({
      data: {
        storeId,
        draft: storefront as unknown as Prisma.InputJsonValue,
        published: storefront as unknown as Prisma.InputJsonValue,
      },
    });

    await transaction.adminUser.create({
      data: {
        storeId,
        email: STORE.ownerEmail,
        passwordHash,
        role: "OWNER",
      },
    });
  });

  console.info("Store, locations and owner account created (TEST DATA for the pilot).");
  console.info(`  store:   ${STORE.name} (slug ${STORE.slug})`);
  console.info(`  id:      ${storeId}`);
  console.info(`  owner:   ${STORE.ownerEmail}`);
  console.info(`  password: ${password}`);
  console.info("  The password is shown once; only its Argon2id hash is stored.");
  console.info(`Set DOORFLOW_STORE_ID=${storeId}`);
}

async function seedCatalog(prisma: PrismaClient) {
  const store = await prisma.store.findUnique({
    where: { slug: STORE.slug },
    select: { id: true },
  });
  if (!store) {
    throw new Error(`Run --store-owner first: store "${STORE.slug}" does not exist.`);
  }

  const manufacturerIds = new Map<string, string>();
  for (const name of new Set(PRODUCTS.map((product) => product.manufacturer))) {
    const manufacturer = await prisma.manufacturer.upsert({
      where: { storeId_name: { storeId: store.id, name } },
      update: {},
      create: { storeId: store.id, name },
    });
    manufacturerIds.set(name, manufacturer.id);
  }

  for (const rule of PRICING_RULES) {
    await prisma.pricingRule.upsert({
      where: { storeId_key: { storeId: store.id, key: rule.key } },
      update: {},
      create: { ...rule, storeId: store.id },
    });
  }

  let created = 0;
  let skipped = 0;
  for (const product of PRODUCTS) {
    const existing = await prisma.product.findUnique({
      where: { storeId_slug: { storeId: store.id, slug: product.slug } },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.product.create({
      data: {
        storeId: store.id,
        manufacturerId: manufacturerIds.get(product.manufacturer) ?? null,
        slug: product.slug,
        model: product.model,
        name: product.name,
        description: product.description,
        category: product.category,
        basePriceMinor: product.basePriceMinor,
        specifications: {
          ...product.attributes,
          series: product.series,
          seriesLabel: SERIES_LABELS[product.series],
        } as Prisma.InputJsonValue,
        optionGroups: {
          create: OPTION_GROUPS.map((group, groupIndex) => ({
            key: group.key,
            label: group.label,
            selectionMode: group.selectionMode,
            required: group.required,
            minSelections: group.minSelections,
            maxSelections: group.maxSelections,
            sortOrder: groupIndex,
            options: {
              create: group.options.map((option, optionIndex) => ({
                key: option.key,
                label: option.label,
                priceMinor: option.priceMinor,
                sortOrder: optionIndex,
              })),
            },
          })),
        },
      },
    });
    created += 1;
  }

  console.info(`Catalogue seeded: ${created} product(s) created, ${skipped} already existed.`);
  console.info(`  pricing rules: ${PRICING_RULES.length}`);
  console.info(`  manufacturers: ${manufacturerIds.size}`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !["postgres:", "postgresql:"].includes(new URL(databaseUrl).protocol)) {
    throw new Error("Configure DATABASE_URL with a PostgreSQL connection before seeding.");
  }
  const runStore = hasFlag("--store-owner");
  const runCatalog = hasFlag("--catalog");
  if (!runStore && !runCatalog) {
    throw new Error("Pass --store-owner, --catalog, or both.");
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  try {
    if (runStore) await seedStoreAndOwner(prisma);
    if (runCatalog) await seedCatalog(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Pilot seeding failed", {
    category: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message : "unknown failure",
    ...(error instanceof Prisma.PrismaClientKnownRequestError ? { code: error.code } : {}),
  });
  process.exitCode = 1;
});
