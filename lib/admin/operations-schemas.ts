import { z } from "zod";
import { databaseIdSchema } from "@/lib/admin/schemas";

const moneyMinorSchema = z.number().int().safe().nonnegative();
const scheduledAtSchema = z.iso.datetime({ offset: true });

export const measurementCreateSchema = z.object({
  leadId: databaseIdSchema,
  assignedMeasurerId: databaseIdSchema.nullable(),
  scheduledAt: scheduledAtSchema,
  address: z.string().trim().min(3).max(300),
  comments: z.string().trim().max(2000).optional(),
}).strict();

export const measurementResultsSchema = z.record(
  z.string().trim().min(1).max(80),
  z.union([z.string().trim().max(500), z.number().finite(), z.boolean()]),
);

export const measurementUpdateSchema = z.object({
  assignedMeasurerId: databaseIdSchema.nullable().optional(),
  scheduledAt: scheduledAtSchema.optional(),
  address: z.string().trim().min(3).max(300).optional(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "NO_SHOW", "CANCELLED"]).optional(),
  results: measurementResultsSchema.optional(),
  comments: z.string().trim().max(2000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field");

export const orderCreateSchema = z.object({
  leadId: databaseIdSchema,
  managerId: databaseIdSchema.optional(),
  discountMinor: moneyMinorSchema.default(0),
  costMinor: moneyMinorSchema.nullable().default(null),
  prepaymentMinor: moneyMinorSchema.default(0),
}).strict();

export const orderUpdateSchema = z.object({
  status: z.enum(["CONFIRMED", "IN_PROGRESS", "READY", "COMPLETED", "CANCELLED"]),
}).strict();

export const orderPaymentSchema = z.object({
  amountMinor: z.number().int().safe().positive(),
  note: z.string().trim().max(500).optional(),
}).strict();

export const installationCreateSchema = z.object({
  orderId: databaseIdSchema,
  assignedInstallerId: databaseIdSchema.nullable(),
  scheduledAt: scheduledAtSchema,
  address: z.string().trim().min(3).max(300),
  comments: z.string().trim().max(2000).optional(),
}).strict();

export const installationUpdateSchema = z.object({
  assignedInstallerId: databaseIdSchema.nullable().optional(),
  scheduledAt: scheduledAtSchema.optional(),
  address: z.string().trim().min(3).max(300).optional(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "ISSUE", "CANCELLED"]).optional(),
  result: z.string().trim().max(2000).optional(),
  comments: z.string().trim().max(2000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field");

export const customerActivitySchema = z.object({
  type: z.enum(["NOTE", "CALL", "SMS", "EMAIL", "OTHER"]),
  body: z.string().trim().min(1).max(2000),
}).strict();

export const orderListStatusSchema = z.enum(["all", "CONFIRMED", "IN_PROGRESS", "READY", "COMPLETED", "CANCELLED"]);
export const measurementListStatusSchema = z.enum(["all", "SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "NO_SHOW", "CANCELLED"]);
export const installationListStatusSchema = z.enum(["all", "SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "ISSUE", "CANCELLED"]);

export function isValidStatusTransition(
  current: string,
  next: string,
  transitions: Readonly<Record<string, readonly string[]>>,
) {
  return transitions[current]?.includes(next) ?? false;
}

export const measurementTransitions = {
  SCHEDULED: ["CONFIRMED", "IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "NO_SHOW", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "NO_SHOW"],
  NO_SHOW: ["SCHEDULED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
} as const;

export const orderTransitions = {
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "IN_PROGRESS"],
  COMPLETED: [],
  CANCELLED: [],
} as const;

export const installationTransitions = {
  SCHEDULED: ["CONFIRMED", "IN_PROGRESS", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "ISSUE"],
  ISSUE: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
} as const;

export const deliveryCreateSchema = z.object({
  orderId: databaseIdSchema,
  assignedEmployeeId: databaseIdSchema.nullable(),
  scheduledAt: scheduledAtSchema,
  address: z.string().trim().min(3).max(300),
  comments: z.string().trim().max(2000).optional(),
}).strict();

export const deliveryUpdateSchema = z.object({
  assignedEmployeeId: databaseIdSchema.nullable().optional(),
  scheduledAt: scheduledAtSchema.optional(),
  address: z.string().trim().min(3).max(300).optional(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "DELIVERED", "FAILED", "CANCELLED"]).optional(),
  result: z.string().trim().max(2000).optional(),
  comments: z.string().trim().max(2000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field");

export const deliveryListStatusSchema = z.enum([
  "all",
  "SCHEDULED",
  "CONFIRMED",
  "IN_PROGRESS",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
]);

export const deliveryTransitions = {
  SCHEDULED: ["CONFIRMED", "IN_PROGRESS", "FAILED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "FAILED", "CANCELLED"],
  IN_PROGRESS: ["DELIVERED", "FAILED"],
  DELIVERED: [],
  FAILED: ["SCHEDULED", "CANCELLED"],
  CANCELLED: [],
} as const;
