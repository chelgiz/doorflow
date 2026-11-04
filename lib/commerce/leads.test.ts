import { describe, expect, it } from "vitest";
import { leadRequestSchema, normalizePhone } from "@/lib/commerce/leads";

describe("lead request validation", () => {
  const measurementRequest = {
    type: "measurement",
    name: "Тестовый клиент",
    phone: "+7 (900) 123-45-67",
    address: "Тестовый адрес, 1",
    consent: true,
    website: "",
  };

  it("accepts a consented measurement request", () => {
    expect(leadRequestSchema.safeParse(measurementRequest).success).toBe(true);
  });

  it("requires consent, a valid phone, and an address for measurement", () => {
    expect(
      leadRequestSchema.safeParse({ ...measurementRequest, consent: false }).success,
    ).toBe(false);
    expect(
      leadRequestSchema.safeParse({ ...measurementRequest, phone: "call me" }).success,
    ).toBe(false);
    expect(
      leadRequestSchema.safeParse({ ...measurementRequest, address: "" }).success,
    ).toBe(false);
  });

  it("rejects honeypot submissions and unexpected fields", () => {
    expect(
      leadRequestSchema.safeParse({ ...measurementRequest, website: "spam" }).success,
    ).toBe(false);
    expect(
      leadRequestSchema.safeParse({ ...measurementRequest, admin: true }).success,
    ).toBe(false);
  });

  it("normalizes the phone number before database storage", () => {
    expect(normalizePhone("+7 (900) 123-45-67")).toBe("+79001234567");
    expect(normalizePhone("8 900 123-45-67")).toBe("89001234567");
  });
});
