/**
 * Store working hours (step 7: SLA in working hours).
 *
 * A shop is not at the phone 24/7: a lead that arrives on Sunday evening must
 * not be "overdue" by Monday morning. Deadlines therefore count only the
 * minutes the store actually works.
 *
 * The schedule and the time zone are store configuration, kept in one place so
 * the owner can change them without touching the rest of the code. The server
 * time zone is not trusted: all arithmetic is done explicitly in
 * `WORKING_TIMEZONE`, so local development, tests and the VPS agree.
 */

export const WORKING_TIMEZONE = "Asia/Yekaterinburg";

/** Minutes from local midnight; key is the JS weekday (0 = Sunday). */
export type WorkingSegment = readonly [startMinute: number, endMinute: number];

const EVERY_DAY: readonly WorkingSegment[] = [[9 * 60, 19 * 60]];

/** The store answers every day, including weekends: 09:00–19:00. */
export const WORKING_HOURS: Readonly<Record<number, readonly WorkingSegment[]>> = {
  0: EVERY_DAY,
  1: EVERY_DAY,
  2: EVERY_DAY,
  3: EVERY_DAY,
  4: EVERY_DAY,
  5: EVERY_DAY,
  6: EVERY_DAY,
};

/** Human readable schedule for the UI. */
export const WORKING_HOURS_DESCRIPTION = "ежедневно 09:00–19:00";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const MAX_ITERATIONS = 400;

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
};

const weekdayIndex: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Local wall-clock parts of an instant in the store time zone. */
export function localParts(instant: Date, timeZone = WORKING_TIMEZONE): LocalParts {
  const parts = getFormatter(timeZone).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: weekdayIndex[value("weekday")] ?? 0,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
  };
}

function offsetMs(instantMs: number, timeZone: string) {
  const local = localParts(new Date(instantMs), timeZone);
  return (
    Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) -
    instantMs
  );
}

/**
 * Converts local wall-clock time in `timeZone` to an absolute instant.
 * Month/day overflow is handled by `Date.UTC` (e.g. day 32 becomes next month).
 */
export function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = WORKING_TIMEZONE,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = offsetMs(guess, timeZone);
  let instant = guess - firstOffset;
  const secondOffset = offsetMs(instant, timeZone);
  if (secondOffset !== firstOffset) instant = guess - secondOffset;
  return new Date(instant);
}

function instantAtLocalMinute(parts: LocalParts, minuteOfDay: number, timeZone: string) {
  return zonedTimeToInstant(
    parts.year,
    parts.month,
    parts.day,
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60,
    timeZone,
  );
}

function segmentsOfWeekday(weekday: number): readonly WorkingSegment[] {
  return WORKING_HOURS[weekday] ?? [];
}

/** True when the instant falls inside a working segment. */
export function isWorkingTime(instant: Date, timeZone = WORKING_TIMEZONE): boolean {
  const parts = localParts(instant, timeZone);
  const minuteOfDay = parts.hour * 60 + parts.minute + parts.second / 60;
  return segmentsOfWeekday(parts.weekday).some(
    ([start, end]) => minuteOfDay >= start && minuteOfDay < end,
  );
}

/**
 * Adds working minutes to an instant, skipping closed hours and weekends.
 * Starts at the next opening time when the instant is outside working hours.
 */
export function addWorkingMinutes(
  start: Date,
  minutes: number,
  timeZone = WORKING_TIMEZONE,
): Date {
  if (minutes <= 0) return new Date(start.getTime());
  let remaining = minutes;
  let cursor = start;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const parts = localParts(cursor, timeZone);
    const segments = segmentsOfWeekday(parts.weekday);
    const minuteOfDay = parts.hour * 60 + parts.minute + parts.second / 60;
    for (const [startMinute, endMinute] of segments) {
      if (minuteOfDay >= endMinute) continue;
      const fromMinute = Math.max(minuteOfDay, startMinute);
      const available = endMinute - fromMinute;
      if (remaining <= available) {
        return instantAtLocalMinute(parts, fromMinute + remaining, timeZone);
      }
      remaining -= available;
    }
    cursor = zonedTimeToInstant(parts.year, parts.month, parts.day + 1, 0, 0, timeZone);
  }
  return new Date(start.getTime());
}

/** Working minutes between two instants (never negative). */
export function workingMinutesBetween(
  from: Date,
  to: Date,
  timeZone = WORKING_TIMEZONE,
): number {
  if (to.getTime() <= from.getTime()) return 0;
  const fromMs = from.getTime();
  const toMs = to.getTime();
  let total = 0;
  const firstDay = localParts(from, timeZone);
  let dayCursor = zonedTimeToInstant(firstDay.year, firstDay.month, firstDay.day, 0, 0, timeZone);
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const dayParts = localParts(dayCursor, timeZone);
    let segmentTotal = 0;
    for (const [startMinute, endMinute] of segmentsOfWeekday(dayParts.weekday)) {
      const segmentStart = instantAtLocalMinute(dayParts, startMinute, timeZone).getTime();
      const segmentEnd = instantAtLocalMinute(dayParts, endMinute, timeZone).getTime();
      const overlapStart = Math.max(segmentStart, fromMs);
      const overlapEnd = Math.min(segmentEnd, toMs);
      if (overlapEnd > overlapStart) segmentTotal += overlapEnd - overlapStart;
    }
    total += segmentTotal;
    if (dayCursor.getTime() + DAY_MS >= toMs) break;
    dayCursor = zonedTimeToInstant(dayParts.year, dayParts.month, dayParts.day + 1, 0, 0, timeZone);
  }
  return Math.round(total / MINUTE_MS);
}
