import { describe, expect, it } from "vitest";
import { ANALYTICS_PERIODS, analyticsPeriodStart, toPercent } from "@/lib/admin/analytics-metrics";

const NOW = new Date("2026-11-20T12:34:56.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("analytics percentages", () => {
  it("keeps one decimal place instead of rounding to integers", () => {
    // 30 000 ₽ of 73 300 ₽: integer rounding would report 41 %.
    expect(toPercent(30_000, 73_300)).toBe(40.9);
    expect(toPercent(1, 3)).toBe(33.3);
    expect(toPercent(2, 3)).toBe(66.7);
  });

  it("keeps whole numbers without a trailing fraction", () => {
    expect(toPercent(1, 1)).toBe(100);
    expect(toPercent(3, 4)).toBe(75);
    expect(toPercent(0, 5)).toBe(0);
  });

  it("returns null for an empty sample instead of zero", () => {
    expect(toPercent(0, 0)).toBeNull();
    expect(toPercent(3, 0)).toBeNull();
  });
});

describe("analytics period start", () => {
  it("supports the four fixed periods", () => {
    expect(ANALYTICS_PERIODS).toEqual(["today", "7d", "30d", "all"]);
  });

  it("starts today at midnight UTC", () => {
    expect(analyticsPeriodStart("today", NOW)?.toISOString()).toBe("2026-11-20T00:00:00.000Z");
  });

  it("counts back seven and thirty days from now", () => {
    expect(analyticsPeriodStart("7d", NOW)?.toISOString()).toBe(
      new Date(NOW.getTime() - 7 * DAY).toISOString(),
    );
    expect(analyticsPeriodStart("30d", NOW)?.toISOString()).toBe(
      new Date(NOW.getTime() - 30 * DAY).toISOString(),
    );
  });

  it("is unbounded for all time", () => {
    expect(analyticsPeriodStart("all", NOW)).toBeNull();
  });
});
