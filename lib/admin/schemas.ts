import { z } from "zod";

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/);
const moneySchema = z.number().int().safe().nonnegative();
export const databaseIdSchema = z.uuid();
export const productSpecificationsSchema = z.record(
  z.string().trim().min(1).max(80),
  z.union([z.string().trim().max(500), z.number().finite(), z.boolean()]),
);
export const productCategorySchema = z.enum(["apartment", "house", "technical"]);

const productOptionSchema = z.object({
  key: slugSchema.max(64),
  label: z.string().trim().min(1).max(100),
  priceMinor: moneySchema,
  pricingUnit: z.enum(["PER_DOOR", "PER_ORDER"]),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
}).strict();

const productOptionGroupSchema = z.object({
  key: slugSchema.max(64),
  label: z.string().trim().min(1).max(100),
  selectionMode: z.enum(["SINGLE", "MULTIPLE"]),
  required: z.boolean(),
  minSelections: z.number().int().min(0).max(20),
  maxSelections: z.number().int().min(1).max(20),
  sortOrder: z.number().int().min(0).max(10_000),
  isActive: z.boolean(),
  options: z.array(productOptionSchema).min(1).max(50),
}).strict().superRefine((group, context) => {
  if (group.minSelections > group.maxSelections) {
    context.addIssue({ code: "custom", path: ["minSelections"], message: "Invalid selection range" });
  }
  if (group.required && group.minSelections === 0) {
    context.addIssue({ code: "custom", path: ["minSelections"], message: "Required groups need a minimum selection" });
  }
  if (group.selectionMode === "SINGLE" && group.maxSelections > 1) {
    context.addIssue({ code: "custom", path: ["maxSelections"], message: "Single-choice groups allow one selection" });
  }
  if (group.required && !group.options.some((option) => option.isActive)) {
    context.addIssue({ code: "custom", path: ["options"], message: "Required groups need an active option" });
  }
  if (new Set(group.options.map(({ key }) => key)).size !== group.options.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Option keys must be unique" });
  }
});

export const productInputSchema = z.object({
  slug: slugSchema,
  model: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2000),
  category: productCategorySchema,
  basePriceMinor: moneySchema,
  costMinor: moneySchema.nullable(),
  manufacturerId: z.uuid().nullable(),
  specifications: productSpecificationsSchema,
  isActive: z.boolean(),
  optionGroups: z.array(productOptionGroupSchema).max(50),
}).strict().superRefine((product, context) => {
  if (new Set(product.optionGroups.map(({ key }) => key)).size !== product.optionGroups.length) {
    context.addIssue({ code: "custom", path: ["optionGroups"], message: "Group keys must be unique" });
  }
});

export const pricingRuleInputSchema = z.discriminatedUnion("method", [
  z.object({
    key: slugSchema.max(64),
    label: z.string().trim().min(1).max(100),
    method: z.literal("FIXED"),
    priceMinor: moneySchema,
    maxQuantity: z.literal(1),
    isActive: z.boolean(),
  }).strict(),
  z.object({
    key: slugSchema.max(64),
    label: z.string().trim().min(1).max(100),
    method: z.enum(["PER_DOOR", "PER_UNIT"]),
    priceMinor: moneySchema,
    maxQuantity: z.number().int().min(1).max(100),
    isActive: z.boolean(),
  }).strict(),
  z.object({
    key: slugSchema.max(64),
    label: z.string().trim().min(1).max(100),
    method: z.literal("PERCENTAGE"),
    basisPoints: z.number().int().min(0).max(100_000),
    maxQuantity: z.literal(1),
    isActive: z.boolean(),
  }).strict(),
]);

export const storeSettingsInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactPhone: z.string().trim().max(24).nullable(),
  contactEmail: z.string().trim().email().max(254).nullable(),
  logoUrl: z.string().max(2048).nullable().refine((value) => {
    if (value === null || /^\/api\/store-assets\/[0-9a-f-]{36}$/i.test(value)) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Logo must use HTTPS or a DoorFlow image asset"),
}).strict();

export const storedStoreSettingsSchema = z.object({
  contactPhone: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
}).passthrough();

export const locationInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(300),
  phone: z.string().trim().max(24).nullable(),
  businessHours: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
}).strict();

export const manufacturerInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  series: z.string().trim().max(160).nullable(),
}).strict();

export const adminUserCreateSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128),
  role: z.enum(["ADMIN", "MANAGER", "MEASURER", "INSTALLER"]),
}).strict();

export const adminUserUpdateSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "MEASURER", "INSTALLER"]),
  isActive: z.boolean(),
  password: z.string().min(12).max(128).optional(),
}).strict();
