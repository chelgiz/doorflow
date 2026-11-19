import { describe, expect, it } from "vitest";
import {
  addWorkingMinutes,
  isWorkingTime,
  localParts,
  workingMinutesBetween,
  zonedTimeToInstant,
} from "@/lib/admin/working-hours";

/** Local wall-clock time in Yekaterinburg (UTC+5, no DST). */
function local(year: number, month: number, day: number, hour: number, minute = 0) {
  return zonedTimeToInstant(year, month, day, hour, minute);
}

describe("working time detection", () => {
  it("knows the store schedule", () => {
    expect(isWorkingTime(local(2026, 11, 16, 10))).toBe(true); // понедельник
    expect(isWorkingTime(local(2026, 11, 16, 8, 59))).toBe(false);
    expect(isWorkingTime(local(2026, 11, 16, 19))).toBe(false);
    expect(isWorkingTime(local(2026, 11, 21, 12))).toBe(true); // суббота
    expect(isWorkingTime(local(2026, 11, 21, 15))).toBe(false);
    expect(isWorkingTime(local(2026, 11, 22, 12))).toBe(false); // воскресенье
  });

  it("reports local wall-clock parts of the store time zone", () => {
    const parts = localParts(new Date("2026-11-16T05:30:00.000Z"));
    expect(parts).toMatchObject({ year: 2026, month: 11, day: 16, weekday: 1, hour: 10, minute: 30 });
  });
});

describe("adding working minutes", () => {
  it("counts inside one working day", () => {
    expect(addWorkingMinutes(local(2026, 11, 16, 10), 120).toISOString()).toBe(
      local(2026, 11, 16, 12).toISOString(),
    );
  });

  it("stops at closing time and continues the next morning", () => {
    // Понедельник 18:30 + 2 ч = 30 мин до закрытия + 90 мин во вторник.
    expect(addWorkingMinutes(local(2026, 11, 16, 18, 30), 120).toISOString()).toBe(
      local(2026, 11, 17, 10, 30).toISOString(),
    );
  });

  it("skips the weekend between Friday evening and Saturday morning", () => {
    // Пятница 18:00 + 2 ч = 60 мин в пятницу + 60 мин в субботу.
    expect(addWorkingMinutes(local(2026, 11, 20, 18), 120).toISOString()).toBe(
      local(2026, 11, 21, 11).toISOString(),
    );
  });

  it("starts counting on Monday for a Sunday lead", () => {
    expect(addWorkingMinutes(local(2026, 11, 22, 12), 120).toISOString()).toBe(
      local(2026, 11, 23, 11).toISOString(),
    );
  });

  it("rolls Saturday afternoon over to Monday", () => {
    // Суббота 14:30 + 2 ч = 30 мин суббота + 90 мин понедельник.
    expect(addWorkingMinutes(local(2026, 11, 21, 14, 30), 120).toISOString()).toBe(
      local(2026, 11, 23, 10, 30).toISOString(),
    );
  });

  it("starts at the next opening time for an after-hours lead", () => {
    expect(addWorkingMinutes(local(2026, 11, 21, 15), 60).toISOString()).toBe(
      local(2026, 11, 23, 10).toISOString(),
    );
  });
});

describe("working minutes between two moments", () => {
  it("counts only open hours", () => {
    // Понедельник 18:00–19:00 и вторник 09:00–10:00.
    expect(workingMinutesBetween(local(2026, 11, 16, 18), local(2026, 11, 17, 10))).toBe(120);
    // Пятница 18:00–19:00, суббота 10:00–15:00 и понедельник 09:00–10:00.
    expect(workingMinutesBetween(local(2026, 11, 20, 18), local(2026, 11, 23, 10))).toBe(420);
    expect(workingMinutesBetween(local(2026, 11, 22, 12), local(2026, 11, 23, 12))).toBe(180);
  });

  it("is never negative", () => {
    expect(workingMinutesBetween(local(2026, 11, 16, 12), local(2026, 11, 16, 10))).toBe(0);
    expect(workingMinutesBetween(local(2026, 11, 16, 12), local(2026, 11, 16, 12))).toBe(0);
  });
});
