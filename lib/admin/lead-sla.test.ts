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
  it("is two working hours", () => {
    expect(FIRST_CONTACT_SLA_MINUTES).toBe(120);
    // Понедельник 10:00 → 12:00.
    expect(firstContactDueAt(local(2026, 11, 16, 10)).toISOString()).toBe(
      local(2026, 11, 16, 12).toISOString(),
    );
  });

  it("does not count the night", () => {
    // Понедельник 18:30 → вторник 10:30.
    expect(firstContactDueAt(local(2026, 11, 16, 18, 30)).toISOString()).toBe(
      local(2026, 11, 17, 10, 30).toISOString(),
    );
  });

  it("is not overdue inside the working window", () => {
    const created = local(2026, 11, 16, 10);
    expect(isFirstContactOverdue(lead(created), local(2026, 11, 16, 11, 59))).toBe(false);
    expect(isFirstContactOverdue(lead(created), local(2026, 11, 16, 12))).toBe(false);
  });

  it("is overdue once the working window is over", () => {
    const created = local(2026, 11, 16, 10);
    expect(isFirstContactOverdue(lead(created), local(2026, 11, 16, 12, 1))).toBe(true);
    // Овернайт не делает заявку просроченной: 18:30 + ночь.
    const evening = local(2026, 11, 16, 18, 30);
    expect(isFirstContactOverdue(lead(evening), local(2026, 11, 17, 10))).toBe(false);
    expect(isFirstContactOverdue(lead(evening), local(2026, 11, 17, 10, 31))).toBe(true);
  });

  it("does not make a weekend lead overdue before Monday", () => {
    const sunday = local(2026, 11, 22, 12);
    expect(isFirstContactOverdue(lead(sunday), local(2026, 11, 23, 10))).toBe(false);
    expect(isFirstContactOverdue(lead(sunday), local(2026, 11, 23, 11, 1))).toBe(true);
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
    expect(workingHoursSinceCreation(lead(sunday), local(2026, 11, 23, 12))).toBe(3);
    expect(workingHoursSinceCreation(lead(sunday), local(2026, 11, 22, 13))).toBe(0);
  });
});
