import { z } from "zod";
import { storedStoreSettingsSchema } from "@/lib/admin/schemas";
import { defaultTheme, storefrontThemeSchema } from "@/lib/storefront/theme";

const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).nullable();
const uploadedAssetPathSchema = z.string().regex(
  /^\/api\/store-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
);

const storefrontLocationSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(300),
  phone: nullableText(24),
  businessHours: nullableText(300),
}).strict();

const homeLinkSchema = z.string().trim().min(1).max(80).regex(
  /^(\/(?!\/)[a-z0-9/#?=&-]*|#[a-z0-9-]+)$/i,
  "Ссылка должна вести на раздел сайта.",
);

export const storefrontConfigurationSchema = z.object({
  identity: z.object({
    publicName: z.string().trim().min(2).max(160),
    logoUrl: uploadedAssetPathSchema.nullable().refine(
      (value) => value === null || value.length <= 2048,
      "Загрузите логотип в DoorFlow.",
    ),
    phone: nullableText(24),
    email: z.string().trim().email().max(254).nullable(),
    locations: z.array(storefrontLocationSchema).max(20),
  }).strict(),
  home: z.object({
    eyebrow: z.string().trim().min(1).max(100),
    heading: z.string().trim().min(5).max(160),
    subheading: z.string().trim().min(10).max(500),
    bannerAssetId: z.uuid().nullable(),
    bannerAlt: z.string().trim().max(160),
    benefits: z.array(z.object({
      title: z.string().trim().min(2).max(80),
      description: z.string().trim().min(2).max(180),
    }).strict()).min(1).max(4),
    informationBlocks: z.array(z.object({
      title: z.string().trim().min(2).max(100),
      body: z.string().trim().min(5).max(500),
    }).strict()).max(3),
    primaryCtaLabel: z.string().trim().min(2).max(60),
    primaryCtaHref: homeLinkSchema,
    secondaryCtaLabel: z.string().trim().min(2).max(60),
    secondaryCtaHref: homeLinkSchema,
  }).strict(),
  gallery: z.array(z.object({
    assetId: z.uuid(),
    caption: z.string().trim().max(160).nullable(),
  }).strict()).max(12).default([]),
  theme: storefrontThemeSchema,
  seo: z.object({
    title: z.string().trim().min(2).max(70),
    description: z.string().trim().min(10).max(180),
  }).strict(),
}).strict();

export type StorefrontConfiguration = z.infer<typeof storefrontConfigurationSchema>;

export const defaultStorefrontConfiguration: StorefrontConfiguration = {
  identity: {
    publicName: "DoorFlow",
    logoUrl: null,
    phone: null,
    email: null,
    locations: [],
  },
  home: {
    eyebrow: "Каталог входных дверей",
    heading: "Надёжность начинается с входа.",
    subheading: "Сравните опубликованные магазином модели по отделке, размерам и доступной комплектации.",
    bannerAssetId: null,
    bannerAlt: "",
    benefits: [
      { title: "Уровни защиты", description: "Подбор под задачу" },
      { title: "Тепло и тишина", description: "Варианты наполнения" },
      { title: "Своя комплектация", description: "Детали под ваш проём" },
      { title: "Понятные характеристики", description: "Всё важное в карточке" },
    ],
    informationBlocks: [
      {
        title: "Подбор начинается с деталей",
        body: "Сравните характеристики и комплектацию дверей в каталоге.",
      },
    ],
    primaryCtaLabel: "Выбрать дверь",
    primaryCtaHref: "/catalog",
    secondaryCtaLabel: "Как устроен подбор",
    secondaryCtaHref: "#how-to-choose",
  },
  gallery: [],
  theme: { preset: "warm", ...defaultTheme },
  seo: {
    title: "Входные двери",
    description: "Каталог входных дверей и комплектаций магазина.",
  },
};

export function createStorefrontConfiguration(
  store: { name: string; settings: unknown },
  locations: Array<{
    id: string;
    name: string;
    address: string;
    phone: string | null;
    businessHours: string | null;
  }>,
): StorefrontConfiguration {
  const settings = storedStoreSettingsSchema.parse(store.settings);
  return storefrontConfigurationSchema.parse({
    ...defaultStorefrontConfiguration,
    identity: {
      publicName: store.name,
      logoUrl: settings.logoUrl && uploadedAssetPathSchema.safeParse(settings.logoUrl).success
        ? settings.logoUrl
        : null,
      phone: settings.contactPhone ?? null,
      email: settings.contactEmail ?? null,
      locations: locations.map((location) => ({ ...location })),
    },
    seo: { ...defaultStorefrontConfiguration.seo, title: store.name },
  });
}
