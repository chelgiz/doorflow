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
  it("knows the store schedule: every day 09:00–19:00", () => {
    expect(isWorkingTime(local(2026, 11, 16, 10))).toBe(true); // понедельник
    expect(isWorkingTime(local(2026, 11, 16, 8, 59))).toBe(false);
    expect(isWorkingTime(local(2026, 11, 16, 19))).toBe(false);
    expect(isWorkingTime(local(2026, 11, 21, 12))).toBe(true); // суббота
    expect(isWorkingTime(local(2026, 11, 22, 12))).toBe(true); // воскресенье
    expect(isWorkingTime(local(2026, 11, 22, 20))).toBe(false);
  });

  it("is closed on state holidays", () => {
    expect(isWorkingTime(local(2027, 1, 1, 12))).toBe(false);
    expect(isWorkingTime(local(2027, 1, 7, 12))).toBe(false);
    expect(isWorkingTime(local(2027, 2, 23, 12))).toBe(false);
    expect(isWorkingTime(local(2027, 11, 4, 12))).toBe(false);
    // 9 января — обычный рабочий день.
    expect(isWorkingTime(local(2027, 1, 9, 12))).toBe(true);
  });

  it("reports local wall-clock parts of the store time zone", () => {
    const parts = localParts(new Date("2026-11-16T05:30:00.000Z"));
    expect(parts).toMatchObject({ year: 2026, month: 11, day: 16, weekday: 1, hour: 10, minute: 30 });
  });
});

describe("adding working minutes", () => {
  it("counts inside one working day", () => {
    expect(addWorkingMinutes(local(2026, 11, 16, 10), 240).toISOString()).toBe(
      local(2026, 11, 16, 14).toISOString(),
    );
  });

  it("stops at closing time and continues the next morning", () => {
    // Понедельник 18:30 + 4 ч = 30 мин до закрытия + 210 мин во вторник.
    expect(addWorkingMinutes(local(2026, 11, 16, 18, 30), 240).toISOString()).toBe(
      local(2026, 11, 17, 12, 30).toISOString(),
    );
  });

  it("works on weekends as well", () => {
    expect(addWorkingMinutes(local(2026, 11, 21, 14, 30), 240).toISOString()).toBe(
      local(2026, 11, 21, 18, 30).toISOString(),
    );
    expect(addWorkingMinutes(local(2026, 11, 22, 12), 240).toISOString()).toBe(
      local(2026, 11, 22, 16).toISOString(),
    );
  });

  it("starts at the opening time for an early lead", () => {
    expect(addWorkingMinutes(local(2026, 11, 16, 8), 240).toISOString()).toBe(
      local(2026, 11, 16, 13).toISOString(),
    );
  });

  it("skips the New Year holidays", () => {
    // 31 декабря 18:00 + 4 ч = 60 мин в декабре + 180 мин 9 января.
    expect(addWorkingMinutes(local(2026, 12, 31, 18), 240).toISOString()).toBe(
      local(2027, 1, 9, 12).toISOString(),
    );
  });

  it("skips a single holiday in the middle of the week", () => {
    // 30 апреля 18:00 + 4 ч = 60 мин + 180 мин 2 мая (1 мая — праздник).
    expect(addWorkingMinutes(local(2027, 4, 30, 18), 240).toISOString()).toBe(
      local(2027, 5, 2, 12).toISOString(),
    );
  });

  it("starts at the next opening time for an after-hours lead", () => {
    expect(addWorkingMinutes(local(2026, 11, 16, 20), 60).toISOString()).toBe(
      local(2026, 11, 17, 10).toISOString(),
    );
  });
});

describe("working minutes between two moments", () => {
  it("counts only open hours", () => {
    // Понедельник 18:00–19:00 и вторник 09:00–10:00.
    expect(workingMinutesBetween(local(2026, 11, 16, 18), local(2026, 11, 17, 10))).toBe(120);
    // Пятница 18:00–19:00, выходные 09:00–19:00 и понедельник 09:00–10:00.
    expect(workingMinutesBetween(local(2026, 11, 20, 18), local(2026, 11, 23, 10))).toBe(1_320);
    expect(workingMinutesBetween(local(2026, 11, 22, 12), local(2026, 11, 23, 12))).toBe(600);
    // Через новогодние каникулы: 31 декабря 18:00–19:00 и 9 января 09:00–10:00.
    expect(workingMinutesBetween(local(2026, 12, 31, 18), local(2027, 1, 9, 10))).toBe(120);
  });

  it("is never negative", () => {
    expect(workingMinutesBetween(local(2026, 11, 16, 12), local(2026, 11, 16, 10))).toBe(0);
    expect(workingMinutesBetween(local(2026, 11, 16, 12), local(2026, 11, 16, 12))).toBe(0);
  });
});
