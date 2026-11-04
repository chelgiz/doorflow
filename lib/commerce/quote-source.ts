import { z } from "zod";
import {
  doorProductSchema,
  storePricingSchema,
  type ConfigurableDoor,
  type StorePricing,
} from "@/lib/commerce/model";
import { demoStorePricing } from "@/lib/commerce/demo-pricing";
import { getAdminStoreId, isDemoMode } from "@/lib/db/config";
import { getPrismaClient } from "@/lib/db/prisma";
import { getProductBySlug, toConfigurableDoor } from "@/lib/products";

export class QuoteSourceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteSourceConfigurationError";
  }
}

export type QuoteSource = {
  product: ConfigurableDoor;
  pricing: StorePricing;
  productId: string | null;
};

function toSafeMinorUnits(amount: bigint, fieldName: string) {
  const numericAmount = Number(amount);
  if (!Number.isSafeInteger(numericAmount) || numericAmount < 0) {
    throw new QuoteSourceConfigurationError(`${fieldName} is outside the supported range`);
  }
  return numericAmount;
}

export async function getQuoteSource(slug: string): Promise<QuoteSource | null> {
  if (isDemoMode()) {
    const product = getProductBySlug(slug);
    if (!product) return null;
    return {
      product: toConfigurableDoor(product),
      pricing: demoStorePricing,
      productId: null,
    };
  }

  const configuredStore = getAdminStoreId();
  if (!configuredStore) {
    throw new QuoteSourceConfigurationError("A non-demo store and database are not configured");
  }

  const prisma = getPrismaClient();
  const product = await prisma.product.findFirst({
    where: {
      storeId: configuredStore.storeId,
      slug,
      isActive: true,
      isDemo: false,
      store: { isDemo: false },
    },
    include: {
      store: {
        include: {
          pricingRules: {
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      optionGroups: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          options: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  if (!product) return null;
  if (product.currency !== "RUB") {
    throw new QuoteSourceConfigurationError("Only RUB prices are currently supported");
  }

  const attributes = z
    .record(
      z.string().trim().min(1).max(80),
      z.union([z.string().max(500), z.number().finite(), z.boolean()]),
    )
    .parse(product.specifications);

  const configurableProduct = doorProductSchema.parse({
    id: product.id,
    slug: product.slug,
    model: product.model,
    name: product.name,
    basePriceMinor: toSafeMinorUnits(product.basePriceMinor, "Product price"),
    currency: product.currency,
    isDemo: product.isDemo,
    optionGroups: product.optionGroups.map((group) => ({
      id: group.id,
      label: group.label,
      selection: group.selectionMode === "SINGLE" ? "single" : "multiple",
      required: group.required,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      options: group.options.map((option) => ({
        id: option.id,
        label: option.label,
        priceMinor: toSafeMinorUnits(option.priceMinor, "Option price"),
        unit: option.pricingUnit === "PER_DOOR" ? "per-door" : "per-order",
        active: option.isActive,
      })),
    })),
    attributes,
  });

  const pricing = storePricingSchema.parse({
    currency: product.currency,
    isDemo: product.store.isDemo,
    rules: product.store.pricingRules.map((rule) => {
      const sharedFields = {
        id: rule.id,
        label: rule.label,
        maxQuantity: rule.maxQuantity,
        active: rule.isActive,
      };
      switch (rule.method) {
        case "FIXED":
          return {
            ...sharedFields,
            method: "fixed",
            priceMinor: toSafeMinorUnits(rule.priceMinor, "Fixed service price"),
          };
        case "PER_DOOR":
          return {
            ...sharedFields,
            method: "per-door",
            priceMinor: toSafeMinorUnits(rule.priceMinor, "Per-door service price"),
          };
        case "PER_UNIT":
          return {
            ...sharedFields,
            method: "per-unit",
            priceMinor: toSafeMinorUnits(rule.priceMinor, "Per-unit service price"),
          };
        case "PERCENTAGE":
          if (rule.basisPoints === null) {
            throw new QuoteSourceConfigurationError(
              `Percentage pricing rule "${rule.key}" is missing its rate`,
            );
          }
          return {
            ...sharedFields,
            method: "percentage",
            basisPoints: rule.basisPoints,
          };
      }
    }),
  });

  return {
    product: configurableProduct,
    pricing,
    productId: product.id,
  };
}
