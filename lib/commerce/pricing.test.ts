import { describe, expect, it } from "vitest";
import { z } from "zod";
import { demoStorePricing } from "@/lib/commerce/demo-pricing";
import {
  calculateDoorQuote,
  parseQuoteRequest,
  QuoteValidationError,
} from "@/lib/commerce/pricing";
import { getProductBySlug, toConfigurableDoor } from "@/lib/products";

const product = toConfigurableDoor(getProductBySlug("df-a01-graphite")!);

function request(
  overrides: Partial<{
    quantity: number;
    selections: Record<string, string[]>;
    services: Record<string, number>;
  }> = {},
) {
  return {
    productSlug: product.slug,
    quantity: 1,
    selections: {
      "lock-set": ["lock-standard"],
      "interior-panel": ["panel-standard"],
    },
    services: {},
    ...overrides,
  };
}

describe("calculateDoorQuote", () => {
  it("disables Zod JIT compilation for strict-CSP browser parsing", () => {
    expect(z.config().jitless).toBe(true);
    expect(parseQuoteRequest(request()).productSlug).toBe(product.slug);
  });

  it("calculates a quote from trusted product, option, and service prices", () => {
    const quote = calculateDoorQuote(
      product,
      demoStorePricing,
      request({
        quantity: 2,
        selections: {
          "lock-set": ["lock-enhanced"],
          "interior-panel": ["panel-milled"],
          accessories: ["door-closer"],
        },
        services: { delivery: 1, installation: 1, "trim-set": 2 },
      }),
    );

    expect(quote).toEqual({
      currency: "RUB",
      isDemo: true,
      quantity: 2,
      lines: [
        { id: "door", label: "Графит", quantity: 2, unitPriceMinor: 4_890_000, totalPriceMinor: 9_780_000 },
        { id: "lock-enhanced", label: "Расширенный · DEMO", quantity: 2, unitPriceMinor: 640_000, totalPriceMinor: 1_280_000 },
        { id: "panel-milled", label: "Фрезерованная · DEMO", quantity: 2, unitPriceMinor: 480_000, totalPriceMinor: 960_000 },
        { id: "door-closer", label: "Доводчик · DEMO", quantity: 2, unitPriceMinor: 360_000, totalPriceMinor: 720_000 },
        { id: "delivery", label: "Доставка · DEMO", quantity: 1, unitPriceMinor: 250_000, totalPriceMinor: 250_000 },
        { id: "installation", label: "Монтаж · DEMO", quantity: 2, unitPriceMinor: 720_000, totalPriceMinor: 1_440_000 },
        { id: "trim-set", label: "Комплект доборов · DEMO", quantity: 2, unitPriceMinor: 140_000, totalPriceMinor: 280_000 },
      ],
      totalPriceMinor: 14_710_000,
    });
  });

  it("rejects a missing required option group", () => {
    expect(() =>
      calculateDoorQuote(product, demoStorePricing, request({ selections: {} })),
    ).toThrow('Choose an option in Комплект замков');
  });

  it("rejects unavailable options and unknown groups", () => {
    expect(() =>
      calculateDoorQuote(
        product,
        demoStorePricing,
        request({ selections: { "lock-set": ["not-available"] } }),
      ),
    ).toThrow(QuoteValidationError);
    expect(() =>
      calculateDoorQuote(
        product,
        demoStorePricing,
        request({ selections: { unknown: ["lock-standard"] } }),
      ),
    ).toThrow("Unknown option group");
  });

  it("rejects duplicate selections, excessive quantity, and client-supplied prices", () => {
    expect(() =>
      calculateDoorQuote(
        product,
        demoStorePricing,
        request({ selections: { "lock-set": ["lock-standard", "lock-standard"] } }),
      ),
    ).toThrow(QuoteValidationError);
    expect(() =>
      calculateDoorQuote(product, demoStorePricing, request({ quantity: 11 })),
    ).toThrow();
    expect(() =>
      parseQuoteRequest({ ...request(), totalPriceMinor: 1 }),
    ).toThrow();
  });

  it("rejects unknown services and quantities outside configured limits", () => {
    expect(() =>
      calculateDoorQuote(product, demoStorePricing, request({ services: { free: 1 } })),
    ).toThrow("Unknown service");
    expect(() =>
      calculateDoorQuote(product, demoStorePricing, request({ services: { "trim-set": 11 } })),
    ).toThrow("Unavailable quantity");
  });

  it("applies percentage rules to door and selected option subtotal, rounding to kopecks", () => {
    const quote = calculateDoorQuote(product, {
      currency: "RUB",
      isDemo: true,
      rules: [
        {
          id: "custom-rate",
          label: "Процент · DEMO",
          method: "percentage",
          basisPoints: 3333,
          maxQuantity: 1,
          active: true,
        },
      ],
    }, request({ services: { "custom-rate": 1 } }));

    expect(quote.lines.at(-1)?.totalPriceMinor).toBe(
      Math.round((4_890_000 * 3333) / 10_000),
    );
    expect(quote.totalPriceMinor).toBe(
      4_890_000 + Math.round((4_890_000 * 3333) / 10_000),
    );
  });
});
