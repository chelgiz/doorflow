/**
 * Period and percentage helpers for store analytics (step 6).
 *
 * Percentages keep one decimal place: the pilot dataset is tiny, so integer
 * rounding would hide the difference between 40.9 % and 41 %.
 */
export const ANALYTICS_PERIODS = ["today", "7d", "30d", "all"] as const;

export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

const DAY_MS = 86_400_000;

/**
 * Start of the selected period. `all` is unbounded (null), `today` starts at
 * midnight UTC of the current day.
 */
export function analyticsPeriodStart(period: AnalyticsPeriod, now: Date): Date | null {
  if (period === "all") return null;
  if (period === "today") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * DAY_MS);
}

/** Share of `part` in `whole` in percents with one decimal place; null if empty. */
export function toPercent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}
