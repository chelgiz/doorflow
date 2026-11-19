import { z } from "zod";
import type { DoorVariant } from "@/components/door-illustration";
import { demoOptionGroups } from "@/lib/commerce/demo-pricing";
import type { ConfigurableDoor, DoorOptionGroup } from "@/lib/commerce/model";
import { doorProductSchema } from "@/lib/commerce/model";

export type DoorCategory = "apartment" | "house";
export type DoorCategoryFilter = "all" | DoorCategory;

export type Product = {
  slug: string;
  model: string;
  name: string;
  series: string;
  description: string;
  category: DoorCategory;
  categoryLabel: string;
  dimensions?: string;
  height?: number;
  width?: number;
  leafThickness?: number;
  steelThickness?: number;
  sealContours?: number;
  insulation?: string;
  exteriorFinish?: string;
  interiorFinish?: string;
  color?: string;
  locks?: string;
  weight?: number;
  warrantyYears?: number;
  price: number;
  variant: DoorVariant;
  imageUrl?: string;
  imageUrls: string[];
  isDemo: boolean;
  optionGroups: DoorOptionGroup[];
  attributes: Record<string, string | number | boolean>;
};

const demoProductFixtures: Omit<Product, "isDemo" | "optionGroups" | "attributes" | "imageUrls">[] = [
  {
    slug: "df-a01-graphite",
    model: "DF-A01",
    name: "Графит",
    series: "Серия «Квартира» · DEMO",
    description: "Сдержанная геометрия и практичная отделка для городской квартиры.",
    category: "apartment",
    categoryLabel: "Квартира",
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
    locks: "2 замка · пример",
    weight: 78,
    warrantyYears: 2,
    price: 48900,
    variant: "graphite",
  },
  {
    slug: "df-h02-walnut",
    model: "DF-H02",
    name: "Тёплый орех",
    series: "Серия «Загородная» · DEMO",
    description: "Тёплый древесный оттенок и контрастная фурнитура в примере отделки.",
    category: "house",
    categoryLabel: "Для дома",
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
    locks: "2 замка · пример",
    weight: 96,
    warrantyYears: 2,
    price: 72900,
    variant: "walnut",
  },
  {
    slug: "df-a03-slate",
    model: "DF-A03",
    name: "Серо-синий",
    series: "Серия «Квартира» · DEMO",
    description: "Матовая холодная гамма и лаконичный рисунок внутренней панели.",
    category: "apartment",
    categoryLabel: "Квартира",
    dimensions: "2000 × 900 мм",
    height: 2000,
    width: 900,
    leafThickness: 90,
    steelThickness: 1.5,
    sealContours: 2,
    insulation: "Минеральная плита",
    exteriorFinish: "Порошковое покрытие",
    interiorFinish: "МДФ-панель",
    color: "Серо-синий",
    locks: "2 замка · пример",
    weight: 82,
    warrantyYears: 2,
    price: 56400,
    variant: "slate",
  },
  {
    slug: "df-h04-olive",
    model: "DF-H04",
    name: "Тихая олива",
    series: "Серия «Загородная» · DEMO",
    description: "Сложный природный оттенок для сдержанного фасада загородного дома.",
    category: "house",
    categoryLabel: "Для дома",
    dimensions: "2050 × 900 мм",
    height: 2050,
    width: 900,
    leafThickness: 100,
    steelThickness: 1.8,
    sealContours: 3,
    insulation: "Комбинированное",
    exteriorFinish: "Декоративная панель",
    interiorFinish: "Панель под дуб",
    color: "Олива",
    locks: "2 замка · пример",
    weight: 94,
    warrantyYears: 2,
    price: 69800,
    variant: "olive",
  },
  {
    slug: "df-t05-sand",
    model: "DF-T05",
    name: "Светлый камень",
    series: "Серия «Для дома» · DEMO",
    description: "Нейтральное оформление для загородного дома.",
    category: "house",
    categoryLabel: "Для дома",
    dimensions: "2000 × 800 мм",
    height: 2000,
    width: 800,
    leafThickness: 70,
    steelThickness: 1.2,
    sealContours: 1,
    insulation: "Без утеплителя",
    exteriorFinish: "Грунт-эмаль",
    interiorFinish: "Грунт-эмаль",
    color: "Песочный",
    locks: "1 замок · пример",
    weight: 59,
    warrantyYears: 1,
    price: 31900,
    variant: "sand",
  },
  {
    slug: "df-a06-plum",
    model: "DF-A06",
    name: "Тёмный каштан",
    series: "Серия «Квартира» · DEMO",
    description: "Глубокий тёплый цвет с лаконичной панельной геометрией.",
    category: "apartment",
    categoryLabel: "Квартира",
    dimensions: "2000 × 900 мм",
    height: 2000,
    width: 900,
    leafThickness: 90,
    steelThickness: 1.5,
    sealContours: 2,
    insulation: "Минеральная плита",
    exteriorFinish: "Порошковое покрытие",
    interiorFinish: "МДФ-панель",
    color: "Каштан",
    locks: "2 замка · пример",
    weight: 84,
    warrantyYears: 2,
    price: 61200,
    variant: "plum",
  },
];

export const products: Product[] = demoProductFixtures.map((product) => ({
  ...product,
  isDemo: true,
  imageUrls: [],
  optionGroups: demoOptionGroups,
  attributes: (() => {
    const attributes: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries({
    dimensions: product.dimensions,
    height: product.height,
    width: product.width,
    leafThickness: product.leafThickness,
    steelThickness: product.steelThickness,
    sealContours: product.sealContours,
    insulation: product.insulation,
    exteriorFinish: product.exteriorFinish,
    interiorFinish: product.interiorFinish,
    color: product.color,
    locks: product.locks,
    weight: product.weight,
    warrantyYears: product.warrantyYears,
    })) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        attributes[key] = value;
      }
    }
    return attributes;
  })(),
}));

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}

type PersistedProduct = {
  slug: string;
  model: string;
  name: string;
  description: string;
  category: string;
  basePriceMinor: bigint;
  specifications: unknown;
  manufacturer: { name: string; series: string | null } | null;
  assets?: Array<{ id: string }>;
  optionGroups: Array<{
    id: string;
    label: string;
    selectionMode: "SINGLE" | "MULTIPLE";
    required: boolean;
    minSelections: number;
    maxSelections: number;
    options: Array<{
      id: string;
      label: string;
      priceMinor: bigint;
      pricingUnit: "PER_DOOR" | "PER_ORDER";
      isActive: boolean;
    }>;
  }>;
};

const publicAttributesSchema = doorProductSchema.shape.attributes;
const categorySchema = z.enum(["apartment", "house"]);
const categoryLabels: Record<DoorCategory, string> = {
  apartment: "Для квартиры",
  house: "Для дома",
};
const variants = ["graphite", "walnut", "slate", "olive", "sand", "plum"] as const;

export function mapPersistedProduct(row: PersistedProduct): Product {
  const attributes = publicAttributesSchema.parse(row.specifications);
  const parsedCategory = categorySchema.safeParse(row.category);
  if (!parsedCategory.success) {
    throw new Error(`Unsupported public product category: ${row.category}`);
  }
  const category = parsedCategory.data;
  const priceMinor = Number(row.basePriceMinor);
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) {
    throw new Error(`Product "${row.slug}" has a price outside the supported range`);
  }
  const variant = variants.find((candidate) => candidate === attributes.variant) ?? "graphite";

  return {
    slug: row.slug,
    model: row.model,
    name: row.name,
    series:
      row.manufacturer?.series ??
      row.manufacturer?.name ??
      (typeof attributes.collection === "string" ? attributes.collection : ""),
    description: row.description,
    category,
    categoryLabel: categoryLabels[category],
    dimensions: typeof attributes.dimensions === "string" ? attributes.dimensions : undefined,
    height: typeof attributes.height === "number" ? attributes.height : undefined,
    width: typeof attributes.width === "number" ? attributes.width : undefined,
    leafThickness: typeof attributes.leafThickness === "number" ? attributes.leafThickness : undefined,
    steelThickness: typeof attributes.steelThickness === "number" ? attributes.steelThickness : undefined,
    sealContours: typeof attributes.sealContours === "number" ? attributes.sealContours : undefined,
    insulation: typeof attributes.insulation === "string" ? attributes.insulation : undefined,
    exteriorFinish: typeof attributes.exteriorFinish === "string" ? attributes.exteriorFinish : undefined,
    interiorFinish: typeof attributes.interiorFinish === "string" ? attributes.interiorFinish : undefined,
    color: typeof attributes.color === "string" ? attributes.color : undefined,
    locks: typeof attributes.locks === "string" ? attributes.locks : undefined,
    weight: typeof attributes.weight === "number" ? attributes.weight : undefined,
    warrantyYears: typeof attributes.warrantyYears === "number" ? attributes.warrantyYears : undefined,
    price: priceMinor / 100,
    variant,
    imageUrl: row.assets?.[0] ? `/api/store-assets/${row.assets[0].id}` : undefined,
    imageUrls: (row.assets ?? []).map((asset) => `/api/store-assets/${asset.id}`),
    isDemo: false,
    attributes,
    optionGroups: row.optionGroups.map((group) => ({
      id: group.id,
      label: group.label,
      selection: group.selectionMode === "SINGLE" ? "single" : "multiple",
      required: group.required,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      options: group.options.map((option) => ({
        id: option.id,
        label: option.label,
        priceMinor: Number(option.priceMinor),
        unit: option.pricingUnit === "PER_DOOR" ? "per-door" : "per-order",
        active: option.isActive,
      })),
    })),
  };
}

export function toConfigurableDoor(product: Product): ConfigurableDoor {
  return {
    id: product.slug,
    slug: product.slug,
    model: product.model,
    name: product.name,
    basePriceMinor: product.price * 100,
    currency: "RUB",
    isDemo: product.isDemo,
    optionGroups: product.optionGroups,
    attributes: product.attributes,
  };
}
