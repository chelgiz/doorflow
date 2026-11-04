import { z } from "zod";

z.config({ jitless: true });

export const identifierSchema = z.union([
  z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  z.uuid(),
]);
const nonNegativeMoneySchema = z.number().int().safe().nonnegative();

export const optionSchema = z.object({
  id: identifierSchema,
  label: z.string().trim().min(1).max(100),
  priceMinor: nonNegativeMoneySchema,
  unit: z.enum(["per-door", "per-order"]),
  active: z.boolean().default(true),
});

export const optionGroupSchema = z
  .object({
    id: identifierSchema,
    label: z.string().trim().min(1).max(100),
    selection: z.enum(["single", "multiple"]),
    required: z.boolean(),
    minSelections: z.number().int().min(0).max(20),
    maxSelections: z.number().int().min(1).max(20),
    options: z.array(optionSchema).min(1).max(50),
  })
  .superRefine((group, context) => {
    if (group.minSelections > group.maxSelections) {
      context.addIssue({
        code: "custom",
        message: "Minimum selection count cannot exceed maximum",
        path: ["minSelections"],
      });
    }

    if (group.required && group.minSelections === 0) {
      context.addIssue({
        code: "custom",
        message: "Required groups must have at least one selection",
        path: ["minSelections"],
      });
    }

    if (group.required && !group.options.some((option) => option.active)) {
      context.addIssue({
        code: "custom",
        message: "Required groups must contain an available option",
        path: ["options"],
      });
    }

    if (group.selection === "single" && group.maxSelections > 1) {
      context.addIssue({
        code: "custom",
        message: "Single-selection groups may contain only one option",
        path: ["maxSelections"],
      });
    }

    const optionIds = group.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) {
      context.addIssue({
        code: "custom",
        message: "Option identifiers must be unique within a group",
        path: ["options"],
      });
    }
  });

export const pricingRuleSchema = z.discriminatedUnion("method", [
  z.object({
    id: identifierSchema,
    label: z.string().trim().min(1).max(100),
    method: z.literal("fixed"),
    priceMinor: nonNegativeMoneySchema,
    maxQuantity: z.literal(1),
    active: z.boolean().default(true),
  }),
  z.object({
    id: identifierSchema,
    label: z.string().trim().min(1).max(100),
    method: z.enum(["per-door", "per-unit"]),
    priceMinor: nonNegativeMoneySchema,
    maxQuantity: z.number().int().min(1).max(100),
    active: z.boolean().default(true),
  }),
  z.object({
    id: identifierSchema,
    label: z.string().trim().min(1).max(100),
    method: z.literal("percentage"),
    basisPoints: z.number().int().min(0).max(100_000),
    maxQuantity: z.literal(1),
    active: z.boolean().default(true),
  }),
]);

export const storePricingSchema = z.object({
  currency: z.literal("RUB"),
  isDemo: z.boolean(),
  rules: z.array(pricingRuleSchema).max(100),
});

export const doorProductSchema = z.object({
  id: identifierSchema,
  slug: identifierSchema,
  model: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(160),
  basePriceMinor: nonNegativeMoneySchema,
  currency: z.literal("RUB"),
  isDemo: z.boolean(),
  optionGroups: z.array(optionGroupSchema).max(50),
  attributes: z.record(
    z.string().trim().min(1).max(80),
    z.union([z.string().max(500), z.number().finite(), z.boolean()]),
  ),
});

export const doorQuoteSchema = z.object({
  currency: z.literal("RUB"),
  isDemo: z.boolean(),
  quantity: z.number().int().min(1).max(10),
  lines: z.array(
    z.object({
      id: identifierSchema,
      label: z.string().min(1),
      quantity: z.number().int().min(1),
      unitPriceMinor: nonNegativeMoneySchema,
      totalPriceMinor: nonNegativeMoneySchema,
    }),
  ),
  totalPriceMinor: nonNegativeMoneySchema,
});

export const storefrontCapabilitiesSchema = z.object({
  demoMode: z.boolean(),
  submissionEnabled: z.boolean(),
  privacyNoticeUrl: z.string().url().nullable(),
});

export const quoteRequestSchema = z
  .object({
    productSlug: identifierSchema,
    quantity: z.number().int().min(1).max(10),
    selections: z.record(identifierSchema, z.array(identifierSchema).max(20)),
    services: z.record(identifierSchema, z.number().int().min(0).max(100)),
  })
  .strict();

export type DoorOption = z.infer<typeof optionSchema>;
export type DoorOptionGroup = z.infer<typeof optionGroupSchema>;
export type PricingRule = z.infer<typeof pricingRuleSchema>;
export type StorePricing = z.infer<typeof storePricingSchema>;
export type ConfigurableDoor = z.infer<typeof doorProductSchema>;
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export type QuoteLine = {
  id: string;
  label: string;
  quantity: number;
  unitPriceMinor: number;
  totalPriceMinor: number;
};

export type DoorQuote = z.infer<typeof doorQuoteSchema>;
export type StorefrontCapabilities = z.infer<typeof storefrontCapabilitiesSchema>;
