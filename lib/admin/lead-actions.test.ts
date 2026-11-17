import { describe, expect, it } from "vitest";
import { hoursUntilAction, isActionOverdue, isLeadClosed } from "@/lib/admin/lead-actions";

const NOW = new Date("2026-11-17T12:00:00.000Z");

function lead(nextActionAt: Date | null, status = "IN_PROGRESS") {
  return { nextActionAt, status };
}

describe("lead next action", () => {
  it("treats sale, rejection and completion as closed", () => {
    expect(isLeadClosed("SALE")).toBe(true);
    expect(isLeadClosed("REJECTED")).toBe(true);
    expect(isLeadClosed("COMPLETED")).toBe(true);
    expect(isLeadClosed("NEW")).toBe(false);
    expect(isLeadClosed("MEASURED")).toBe(false);
  });

  it("is not overdue without a planned action", () => {
    expect(isActionOverdue(lead(null), NOW)).toBe(false);
  });

  it("is not overdue while the action is in the future", () => {
    expect(isActionOverdue(lead(new Date(NOW.getTime() + 60_000)), NOW)).toBe(false);
  });

  it("is overdue when the planned action is in the past", () => {
    expect(isActionOverdue(lead(new Date(NOW.getTime() - 60_000)), NOW)).toBe(true);
  });

  it("is never overdue for closed leads", () => {
    const past = new Date(NOW.getTime() - 3_600_000);
    expect(isActionOverdue(lead(past, "SALE"), NOW)).toBe(false);
    expect(isActionOverdue(lead(past, "REJECTED"), NOW)).toBe(false);
    expect(isActionOverdue(lead(past, "COMPLETED"), NOW)).toBe(false);
  });

  it("reports hours until the action", () => {
    expect(hoursUntilAction({ nextActionAt: null, status: "NEW" }, NOW)).toBeNull();
    expect(hoursUntilAction(lead(new Date(NOW.getTime() + 3 * 3_600_000)), NOW)).toBe(3);
    expect(hoursUntilAction(lead(new Date(NOW.getTime() - 2 * 3_600_000)), NOW)).toBe(-2);
  });
});
