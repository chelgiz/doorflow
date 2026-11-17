import { describe, expect, it } from "vitest";
import { FOLLOW_UP_AFTER_MS, daysSinceFirstContact, followUpDueAt, needsFollowUp } from "@/lib/admin/lead-followup";

const NOW = new Date("2026-11-20T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function lead(overrides: Partial<Parameters<typeof needsFollowUp>[0]> = {}) {
  return {
    firstContactAt: new Date(NOW.getTime() - 3 * DAY),
    status: "IN_PROGRESS",
    nextActionAt: null,
    lastStatusChangeAt: null,
    ...overrides,
  };
}

describe("repeat touch rule", () => {
  it("is three days", () => {
    expect(FOLLOW_UP_AFTER_MS).toBe(3 * DAY);
    expect(followUpDueAt(new Date("2026-11-17T12:00:00.000Z")).toISOString()).toBe(
      "2026-11-20T12:00:00.000Z",
    );
  });

  it("is not due without a recorded first contact", () => {
    expect(needsFollowUp(lead({ firstContactAt: null }), NOW)).toBe(false);
  });

  it("is not due before three days pass", () => {
    expect(needsFollowUp(lead({ firstContactAt: new Date(NOW.getTime() - 2 * DAY) }), NOW)).toBe(false);
  });

  it("is due after three days with no status change", () => {
    expect(needsFollowUp(lead(), NOW)).toBe(true);
  });

  it("is not due when the status changed after the first contact", () => {
    expect(
      needsFollowUp(
        lead({ lastStatusChangeAt: new Date(NOW.getTime() - DAY) }),
        NOW,
      ),
    ).toBe(false);
  });

  it("is not due for closed leads", () => {
    for (const status of ["SALE", "REJECTED", "COMPLETED"]) {
      expect(needsFollowUp(lead({ status }), NOW)).toBe(false);
    }
  });

  it("is not due when a future action is already planned", () => {
    expect(needsFollowUp(lead({ nextActionAt: new Date(NOW.getTime() + DAY) }), NOW)).toBe(false);
    expect(needsFollowUp(lead({ nextActionAt: new Date(NOW.getTime() - DAY) }), NOW)).toBe(true);
  });

  it("counts whole days since the first contact", () => {
    expect(daysSinceFirstContact(lead({ firstContactAt: null }), NOW)).toBeNull();
    expect(daysSinceFirstContact(lead({ firstContactAt: new Date(NOW.getTime() - 5 * DAY) }), NOW)).toBe(5);
  });
});
