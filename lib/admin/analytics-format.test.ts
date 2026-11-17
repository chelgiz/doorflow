import { describe, expect, it } from "vitest";
import { duration, percent, plural, rubles } from "@/lib/admin/analytics-format";

const normalize = (value: string) => value.replace(/\u00a0/g, " ");

describe("analytics number formatting", () => {
  it("shows rubles without kopeks when the amount is whole", () => {
    expect(normalize(rubles(7_330_000))).toBe("73 300 ₽");
    expect(normalize(rubles(4_330_000))).toBe("43 300 ₽");
    expect(normalize(rubles(0))).toBe("0 ₽");
  });

  it("renders percentages with the decimal comma and one decimal place", () => {
    expect(percent(40.9)).toBe("40,9 %");
    expect(percent(25)).toBe("25 %");
    expect(percent(null)).toBe("—");
  });

  it("renders first-contact durations in readable units", () => {
    expect(duration(49)).toBe("49 мин");
    expect(duration(748)).toBe("12 ч 28 мин");
    expect(duration(1448)).toBe("1 д 0 ч");
    expect(duration(null)).toBe("—");
  });

  it("picks the right Russian plural form", () => {
    expect(plural(1, "заявка", "заявки", "заявок")).toBe("заявка");
    expect(plural(2, "заявка", "заявки", "заявок")).toBe("заявки");
    expect(plural(5, "заявка", "заявки", "заявок")).toBe("заявок");
    expect(plural(11, "заявка", "заявки", "заявок")).toBe("заявок");
    expect(plural(21, "заявка", "заявки", "заявок")).toBe("заявка");
  });
});
