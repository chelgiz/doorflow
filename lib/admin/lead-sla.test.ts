import { describe, expect, it } from "vitest";
import { FIRST_CONTACT_SLA_MS, firstContactDueAt, hoursSinceCreation, isFirstContactOverdue } from "@/lib/admin/lead-sla";

const NOW = new Date("2026-11-17T12:00:00.000Z");

function lead(createdMinutesAgo: number, contactedAt: Date | null = null, status = "NEW") {
  return {
    createdAt: new Date(NOW.getTime() - createdMinutesAgo * 60_000),
    firstContactAt: contactedAt,
    status,
  };
}

describe("first-contact SLA", () => {
  it("is two hours", () => {
    expect(FIRST_CONTACT_SLA_MS).toBe(2 * 60 * 60 * 1000);
    expect(firstContactDueAt(new Date("2026-11-17T10:00:00.000Z")).toISOString()).toBe(
      "2026-11-17T12:00:00.000Z",
    );
  });

  it("is not overdue inside the SLA window", () => {
    expect(isFirstContactOverdue(lead(119), NOW)).toBe(false);
  });

  it("is not overdue exactly at the boundary", () => {
    expect(isFirstContactOverdue(lead(120), NOW)).toBe(false);
  });

  it("is overdue after the SLA window", () => {
    expect(isFirstContactOverdue(lead(121), NOW)).toBe(true);
  });

  it("is never overdue once the first contact is recorded", () => {
    expect(isFirstContactOverdue(lead(600, NOW), NOW)).toBe(false);
  });

  it("is never overdue for closed leads", () => {
    expect(isFirstContactOverdue(lead(600, null, "SALE"), NOW)).toBe(false);
    expect(isFirstContactOverdue(lead(600, null, "REJECTED"), NOW)).toBe(false);
    expect(isFirstContactOverdue(lead(600, null, "COMPLETED"), NOW)).toBe(false);
  });

  it("is still overdue for open leads without a contact", () => {
    expect(isFirstContactOverdue(lead(600, null, "NEW"), NOW)).toBe(true);
    expect(isFirstContactOverdue(lead(600, null, "MEASURED"), NOW)).toBe(true);
  });

  it("reports elapsed whole hours, never negative", () => {
    expect(hoursSinceCreation(lead(185), NOW)).toBe(3);
    expect(hoursSinceCreation(lead(-30), NOW)).toBe(0);
  });
});
