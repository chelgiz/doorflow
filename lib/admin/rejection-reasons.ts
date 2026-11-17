/**
 * Fixed refusal reasons for CRM leads (step 2.4).
 *
 * The codes mirror the Prisma `RejectionReason` enum; the labels are the only
 * Russian wording shown to staff, so the list stays consistent between the API
 * error messages, the audit trail and the admin UI.
 */
export const REJECTION_REASON_LABELS = {
  PRICE: "Дорого / не устроила цена",
  SPECIFICATIONS: "Не подошли характеристики или комплектация",
  LEAD_TIME: "Не устроили сроки изготовления, доставки или монтажа",
  COMPETITOR: "Выбрал другой магазин / купил в другом месте",
  NO_NEED: "Передумал / отложил покупку",
} as const;

export type RejectionReasonCode = keyof typeof REJECTION_REASON_LABELS;

export const REJECTION_REASON_CODES = Object.keys(
  REJECTION_REASON_LABELS,
) as RejectionReasonCode[];

export function rejectionReasonLabel(code: string): string {
  return REJECTION_REASON_LABELS[code as RejectionReasonCode] ?? code;
}
