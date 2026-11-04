import {
  doorProductSchema,
  quoteRequestSchema,
  storePricingSchema,
  type ConfigurableDoor,
  type DoorQuote,
  type QuoteLine,
  type QuoteRequest,
  type StorePricing,
} from "@/lib/commerce/model";

export class QuoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteValidationError";
  }
}

function addLine(lines: QuoteLine[], line: QuoteLine) {
  if (!Number.isSafeInteger(line.totalPriceMinor)) {
    throw new QuoteValidationError("Calculated amount exceeds the supported range");
  }
  lines.push(line);
}

export function calculateDoorQuote(
  productInput: ConfigurableDoor,
  pricingInput: StorePricing,
  requestInput: QuoteRequest,
): DoorQuote {
  const product = doorProductSchema.parse(productInput);
  const pricing = storePricingSchema.parse(pricingInput);
  const request = quoteRequestSchema.parse(requestInput);
  const lines: QuoteLine[] = [];

  addLine(lines, {
    id: "door",
    label: product.name,
    quantity: request.quantity,
    unitPriceMinor: product.basePriceMinor,
    totalPriceMinor: product.basePriceMinor * request.quantity,
  });

  const groupsById = new Map(product.optionGroups.map((group) => [group.id, group]));
  for (const [groupId, selectedOptionIds] of Object.entries(request.selections)) {
    const group = groupsById.get(groupId);
    if (!group) {
      throw new QuoteValidationError(`Unknown option group: ${groupId}`);
    }
    if (new Set(selectedOptionIds).size !== selectedOptionIds.length) {
      throw new QuoteValidationError(`Duplicate option in group: ${group.label}`);
    }
    if (group.selection === "single" && selectedOptionIds.length > 1) {
      throw new QuoteValidationError(`Choose only one option in ${group.label}`);
    }
    if (
      selectedOptionIds.length < group.minSelections ||
      selectedOptionIds.length > group.maxSelections
    ) {
      throw new QuoteValidationError(`Invalid number of selections in ${group.label}`);
    }

    for (const optionId of selectedOptionIds) {
      const option = group.options.find((item) => item.id === optionId && item.active);
      if (!option) {
        throw new QuoteValidationError(`Unavailable option in ${group.label}`);
      }
      const quantity = option.unit === "per-door" ? request.quantity : 1;
      addLine(lines, {
        id: option.id,
        label: option.label,
        quantity,
        unitPriceMinor: option.priceMinor,
        totalPriceMinor: option.priceMinor * quantity,
      });
    }
  }

  for (const group of product.optionGroups) {
    if (!Object.hasOwn(request.selections, group.id) && group.required) {
      throw new QuoteValidationError(`Choose an option in ${group.label}`);
    }
  }

  const rulesById = new Map(pricing.rules.map((rule) => [rule.id, rule]));
  for (const serviceId of Object.keys(request.services)) {
    if (!rulesById.has(serviceId)) {
      throw new QuoteValidationError(`Unknown service: ${serviceId}`);
    }
  }

  const eligibleSubtotalMinor = lines.reduce(
    (subtotal, line) => subtotal + line.totalPriceMinor,
    0,
  );
  if (!Number.isSafeInteger(eligibleSubtotalMinor)) {
    throw new QuoteValidationError("Calculated amount exceeds the supported range");
  }

  for (const rule of pricing.rules) {
    const quantity = request.services[rule.id] ?? 0;
    if (quantity === 0) continue;
    if (!rule.active || quantity > rule.maxQuantity) {
      throw new QuoteValidationError(`Unavailable quantity for ${rule.label}`);
    }

    let unitPriceMinor = 0;
    let totalPriceMinor = 0;
    let lineQuantity = 1;

    switch (rule.method) {
      case "fixed":
        if (quantity !== 1) {
          throw new QuoteValidationError(`${rule.label} can be selected once`);
        }
        unitPriceMinor = rule.priceMinor;
        totalPriceMinor = rule.priceMinor;
        break;
      case "per-door":
        if (quantity !== 1) {
          throw new QuoteValidationError(`${rule.label} is selected for the whole order`);
        }
        unitPriceMinor = rule.priceMinor;
        lineQuantity = request.quantity;
        totalPriceMinor = rule.priceMinor * request.quantity;
        break;
      case "per-unit":
        unitPriceMinor = rule.priceMinor;
        lineQuantity = quantity;
        totalPriceMinor = rule.priceMinor * quantity;
        break;
      case "percentage":
        if (quantity !== 1) {
          throw new QuoteValidationError(`${rule.label} can be selected once`);
        }
        unitPriceMinor =
          Math.floor(eligibleSubtotalMinor / 10_000) * rule.basisPoints +
          Math.round(((eligibleSubtotalMinor % 10_000) * rule.basisPoints) / 10_000);
        totalPriceMinor = unitPriceMinor;
        break;
    }

    addLine(lines, {
      id: rule.id,
      label: rule.label,
      quantity: lineQuantity,
      unitPriceMinor,
      totalPriceMinor,
    });
  }

  const totalPriceMinor = lines.reduce((total, line) => total + line.totalPriceMinor, 0);
  if (!Number.isSafeInteger(totalPriceMinor)) {
    throw new QuoteValidationError("Calculated amount exceeds the supported range");
  }

  return {
    currency: pricing.currency,
    isDemo: product.isDemo || pricing.isDemo,
    quantity: request.quantity,
    lines,
    totalPriceMinor,
  };
}

export function parseQuoteRequest(input: unknown): QuoteRequest {
  return quoteRequestSchema.parse(input);
}
