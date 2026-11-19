import { describe, expect, it } from "vitest";
import { FIXED_HOLIDAYS, holidayFor, holidayLabel, isHolidayDate } from "@/lib/admin/holidays";

describe("state holidays", () => {
  it("knows the federal non-working dates", () => {
    expect(FIXED_HOLIDAYS).toHaveLength(14);
    expect(isHolidayDate(2027, 1, 1)).toBe(true);
    expect(isHolidayDate(2027, 1, 7)).toBe(true);
    expect(isHolidayDate(2027, 2, 23)).toBe(true);
    expect(isHolidayDate(2027, 3, 8)).toBe(true);
    expect(isHolidayDate(2027, 5, 1)).toBe(true);
    expect(isHolidayDate(2027, 5, 9)).toBe(true);
    expect(isHolidayDate(2027, 6, 12)).toBe(true);
    expect(isHolidayDate(2027, 11, 4)).toBe(true);
  });

  it("does not mark ordinary days", () => {
    expect(isHolidayDate(2027, 1, 9)).toBe(false);
    expect(isHolidayDate(2027, 2, 22)).toBe(false);
    expect(isHolidayDate(2027, 3, 9)).toBe(false);
    expect(isHolidayDate(2027, 12, 31)).toBe(false);
  });

  it("returns a readable name", () => {
    const holiday = holidayFor(2027, 1, 7);
    expect(holiday?.name).toBe("Рождество Христово");
    expect(holiday && holidayLabel(holiday)).toBe("7 января — Рождество Христово");
    expect(holidayFor(2027, 1, 9)).toBeNull();
  });
});
