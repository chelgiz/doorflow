import {
  storePricingSchema,
  type DoorOptionGroup,
  type StorePricing,
} from "@/lib/commerce/model";

export const demoOptionGroups: DoorOptionGroup[] = [
  {
    id: "lock-set",
    label: "Комплект замков",
    selection: "single",
    required: true,
    minSelections: 1,
    maxSelections: 1,
    options: [
      { id: "lock-standard", label: "Базовый · DEMO", priceMinor: 0, unit: "per-door", active: true },
      { id: "lock-enhanced", label: "Расширенный · DEMO", priceMinor: 6_400_00, unit: "per-door", active: true },
    ],
  },
  {
    id: "interior-panel",
    label: "Внутренняя панель",
    selection: "single",
    required: true,
    minSelections: 1,
    maxSelections: 1,
    options: [
      { id: "panel-standard", label: "Гладкая · DEMO", priceMinor: 0, unit: "per-door", active: true },
      { id: "panel-milled", label: "Фрезерованная · DEMO", priceMinor: 4_800_00, unit: "per-door", active: true },
    ],
  },
  {
    id: "accessories",
    label: "Дополнительная комплектация",
    selection: "multiple",
    required: false,
    minSelections: 0,
    maxSelections: 2,
    options: [
      { id: "door-closer", label: "Доводчик · DEMO", priceMinor: 3_600_00, unit: "per-door", active: true },
      { id: "cylinder-upgrade", label: "Цилиндр · DEMO", priceMinor: 2_900_00, unit: "per-door", active: true },
    ],
  },
];

export const demoStorePricing: StorePricing = storePricingSchema.parse({
  currency: "RUB",
  isDemo: true,
  rules: [
    { id: "delivery", label: "Доставка · DEMO", method: "fixed", priceMinor: 2_500_00, maxQuantity: 1, active: true },
    { id: "dismantling", label: "Демонтаж · DEMO", method: "per-door", priceMinor: 1_800_00, maxQuantity: 1, active: true },
    { id: "installation", label: "Монтаж · DEMO", method: "per-door", priceMinor: 7_200_00, maxQuantity: 1, active: true },
    { id: "trim-set", label: "Комплект доборов · DEMO", method: "per-unit", priceMinor: 1_400_00, maxQuantity: 10, active: true },
    { id: "casing-set", label: "Комплект наличников · DEMO", method: "per-unit", priceMinor: 1_100_00, maxQuantity: 10, active: true },
  ],
});

export function getDefaultSelections(groups: DoorOptionGroup[]) {
  const selections: Record<string, string[]> = {};

  for (const group of groups) {
    if (!group.required) continue;
    const firstAvailableOption = group.options.find((option) => option.active);
    if (!firstAvailableOption) {
      throw new Error(`Required option group "${group.id}" has no available option`);
    }
    selections[group.id] = [firstAvailableOption.id];
  }

  return selections;
}
