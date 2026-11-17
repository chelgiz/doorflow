import { describe, expect, it } from "vitest";
import { REJECTION_REASON_CODES, REJECTION_REASON_LABELS, rejectionReasonLabel } from "@/lib/admin/rejection-reasons";

describe("rejection reasons", () => {
  it("ships exactly the five approved reasons", () => {
    expect(REJECTION_REASON_CODES).toEqual([
      "PRICE",
      "SPECIFICATIONS",
      "LEAD_TIME",
      "COMPETITOR",
      "NO_NEED",
    ]);
  });

  it("gives every code a Russian label", () => {
    for (const code of REJECTION_REASON_CODES) {
      expect(REJECTION_REASON_LABELS[code].length).toBeGreaterThan(3);
    }
  });

  it("falls back to the raw code for unknown values", () => {
    expect(rejectionReasonLabel("PRICE")).toBe(REJECTION_REASON_LABELS.PRICE);
    expect(rejectionReasonLabel("SOMETHING_ELSE")).toBe("SOMETHING_ELSE");
  });
});
