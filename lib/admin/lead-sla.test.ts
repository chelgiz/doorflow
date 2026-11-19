import { describe, expect, it } from "vitest";
import {
  FIRST_CONTACT_SLA_MINUTES,
  firstContactDueAt,
  isFirstContactOverdue,
  workingHoursSinceCreation,
} from "@/lib/admin/lead-sla";
import { zonedTimeToInstant } from "@/lib/admin/working-hours";

function local(year: number, month: number, day: number, hour: number, minute = 0) {
  return zonedTimeToInstant(year, month, day, hour, minute);
}

function lead(createdAt: Date, firstContactAt: Date | null = null, status = "NEW") {
  return { createdAt, firstContactAt, status };
}

describe("first-contact SLA in working hours", () => {
  it("is four working hours", () => {
    expect(FIRST_CONTACT_SLA_MINUTES).toBe(240);
    // Понедельник 10:00 → 14:00.
    expect(firstContactDueAt(local(2026, 11, 16, 10)).toISOString()).toBe(
      local(2026, 11, 16, 14).toISOString(),
    );
  });

  it("does not count the night", () => {
    // Понедельник 18:30 → вторник 12:30.
    expect(firstContactDueAt(local(2026, 11, 16, 18, 30)).toISOString()).toBe(
      local(2026, 11, 17, 12, 30).toISOString(),
    );
  });

  it("is not overdue inside the working window", () => {
    const created = local(2026, 11, 16, 10);
    expect(isFirstContactOverdue(lead(created), local(2026, 11, 16, 13, 59))).toBe(false);
    expect(isFirstContactOverdue(lead(created), local(2026, 11, 16, 14))).toBe(false);
  });

  it("is overdue once the working window is over", () => {
    const created = local(2026, 11, 16, 10);
    expect(isFirstContactOverdue(lead(created), local(2026, 11, 16, 14, 1))).toBe(true);
    // Овернайт не делает заявку просроченной: 18:30 + ночь.
    const evening = local(2026, 11, 16, 18, 30);
    expect(isFirstContactOverdue(lead(evening), local(2026, 11, 17, 12))).toBe(false);
    expect(isFirstContactOverdue(lead(evening), local(2026, 11, 17, 12, 31))).toBe(true);
  });

  it("counts weekend leads immediately, because the store works every day", () => {
    const sunday = local(2026, 11, 22, 12);
    expect(firstContactDueAt(sunday).toISOString()).toBe(local(2026, 11, 22, 16).toISOString());
    expect(isFirstContactOverdue(lead(sunday), local(2026, 11, 22, 15, 59))).toBe(false);
    expect(isFirstContactOverdue(lead(sunday), local(2026, 11, 22, 16, 1))).toBe(true);
  });

  it("is never overdue once the first contact is recorded", () => {
    const created = local(2026, 11, 16, 10);
    expect(isFirstContactOverdue(lead(created, local(2026, 11, 16, 19)), local(2026, 11, 20, 12))).toBe(false);
  });

  it("is never overdue for closed leads", () => {
    const created = local(2026, 11, 16, 10);
    for (const status of ["SALE", "REJECTED", "COMPLETED"]) {
      expect(isFirstContactOverdue(lead(created, null, status), local(2026, 11, 20, 12))).toBe(false);
    }
    for (const status of ["NEW", "MEASURED"]) {
      expect(isFirstContactOverdue(lead(created, null, status), local(2026, 11, 20, 12))).toBe(true);
    }
  });

  it("reports elapsed working hours, never negative", () => {
    const sunday = local(2026, 11, 22, 12);
    // Воскресенье 12:00–19:00 плюс понедельник 09:00–12:00 = 10 рабочих часов.
    expect(workingHoursSinceCreation(lead(sunday), local(2026, 11, 23, 12))).toBe(10);
    expect(workingHoursSinceCreation(lead(sunday), local(2026, 11, 22, 13))).toBe(1);
  });
});
