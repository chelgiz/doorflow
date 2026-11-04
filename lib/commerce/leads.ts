import { z } from "zod";
import { identifierSchema } from "@/lib/commerce/model";

const nameSchema = z.string().trim().min(2).max(120);
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s()-]{10,20}$/)
  .refine((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  }, "Enter a valid phone number");

const attributionSchema = z
  .object({
    source: z.string().trim().max(120).optional(),
    utmSource: z.string().trim().max(120).optional(),
    utmMedium: z.string().trim().max(120).optional(),
    utmCampaign: z.string().trim().max(160).optional(),
    utmContent: z.string().trim().max(160).optional(),
    utmTerm: z.string().trim().max(160).optional(),
  })
  .strict()
  .optional();

const commonLeadFields = {
  name: nameSchema,
  phone: phoneSchema,
  comment: z.string().trim().max(1200).optional(),
  consent: z.literal(true),
  website: z.string().max(0).optional(),
  attribution: attributionSchema,
};

export const leadRequestSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...commonLeadFields,
      type: z.literal("measurement"),
      address: z.string().trim().min(3).max(300),
      productSlug: identifierSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...commonLeadFields,
      type: z.literal("order"),
      address: z.string().trim().min(3).max(300).optional(),
      productSlug: identifierSchema,
      quantity: z.number().int().min(1).max(10),
      selections: z.record(identifierSchema, z.array(identifierSchema).max(20)),
      services: z.record(identifierSchema, z.number().int().min(0).max(100)),
    })
    .strict(),
]);

export type LeadRequest = z.infer<typeof leadRequestSchema>;

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return phone.trim().startsWith("+") ? `+${digits}` : digits;
}
