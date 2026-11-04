import { Prisma } from "@/generated/prisma/client";
import { jsonResponse } from "@/lib/http/json";

export function adminDatabaseError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return jsonResponse({ error: "A record with these values already exists" }, 409);
    }
    if (error.code === "P2025") {
      return jsonResponse({ error: "Record not found" }, 404);
    }
    console.error("DoorFlow admin database operation failed", {
      category: "prisma",
      code: error.code,
    });
  } else {
    console.error("DoorFlow admin database operation failed", {
      category: error instanceof Error ? error.name : "unknown",
    });
  }
  return jsonResponse({ error: "Admin operation failed" }, 500);
}

export function toSafeMinorUnits(value: bigint, field: string) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`${field} is outside the supported monetary range`);
  }
  return amount;
}

export function serializeProduct<T extends {
  basePriceMinor: bigint;
  costMinor: bigint | null;
  optionGroups: Array<{
    options: Array<{ priceMinor: bigint }>;
  }>;
}>(product: T) {
  return {
    ...product,
    basePriceMinor: toSafeMinorUnits(product.basePriceMinor, "Base price"),
    costMinor: product.costMinor === null
      ? null
      : toSafeMinorUnits(product.costMinor, "Cost price"),
    optionGroups: product.optionGroups.map((group) => ({
      ...group,
      options: group.options.map((option) => ({
        ...option,
        priceMinor: toSafeMinorUnits(option.priceMinor, "Option price"),
      })),
    })),
  };
}

export function serializePricingRule<T extends { priceMinor: bigint }>(rule: T) {
  return {
    ...rule,
    priceMinor: toSafeMinorUnits(rule.priceMinor, "Pricing rule"),
  };
}

export function serializeOrder<T extends {
  subtotalMinor: bigint;
  discountMinor: bigint;
  totalMinor: bigint;
  costMinor: bigint | null;
  prepaymentMinor: bigint;
  balanceMinor: bigint;
  payments?: Array<{ amountMinor: bigint }>;
}>(order: T) {
  return {
    ...order,
    subtotalMinor: toSafeMinorUnits(order.subtotalMinor, "Order subtotal"),
    discountMinor: toSafeMinorUnits(order.discountMinor, "Order discount"),
    totalMinor: toSafeMinorUnits(order.totalMinor, "Order total"),
    costMinor: order.costMinor === null ? null : toSafeMinorUnits(order.costMinor, "Order cost"),
    prepaymentMinor: toSafeMinorUnits(order.prepaymentMinor, "Order prepayment"),
    balanceMinor: toSafeMinorUnits(order.balanceMinor, "Order balance"),
    ...(order.payments
      ? {
          payments: order.payments.map((payment) => ({
            ...payment,
            amountMinor: toSafeMinorUnits(payment.amountMinor, "Payment amount"),
          })),
        }
      : {}),
  };
}
