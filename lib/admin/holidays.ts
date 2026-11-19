/**
 * State holidays of the Russian Federation (step 7).
 *
 * Article 112 of the Labour Code lists the non-working holidays; on those days
 * the shop is closed, so the first-contact SLA clock does not run.
 *
 * Only the fixed federal dates are modelled here. The official production
 * calendar also shifts some days off (for example, when 8 March falls on a
 * Sunday the day off moves to Monday) and declares occasional working
 * Saturdays; those transfers are approved yearly and are not guessed here.
 */
export type Holiday = {
  month: number;
  day: number;
  name: string;
};

export const FIXED_HOLIDAYS: readonly Holiday[] = [
  { month: 1, day: 1, name: "Новый год" },
  { month: 1, day: 2, name: "Новогодние каникулы" },
  { month: 1, day: 3, name: "Новогодние каникулы" },
  { month: 1, day: 4, name: "Новогодние каникулы" },
  { month: 1, day: 5, name: "Новогодние каникулы" },
  { month: 1, day: 6, name: "Новогодние каникулы" },
  { month: 1, day: 7, name: "Рождество Христово" },
  { month: 1, day: 8, name: "Новогодние каникулы" },
  { month: 2, day: 23, name: "День защитника Отечества" },
  { month: 3, day: 8, name: "Международный женский день" },
  { month: 5, day: 1, name: "Праздник Весны и Труда" },
  { month: 5, day: 9, name: "День Победы" },
  { month: 6, day: 12, name: "День России" },
  { month: 11, day: 4, name: "День народного единства" },
];

/** Returns the holiday for a calendar date, or null for a working day. */
export function holidayFor(year: number, month: number, day: number): Holiday | null {
  void year; // fixed federal dates do not depend on the year
  return FIXED_HOLIDAYS.find((holiday) => holiday.month === month && holiday.day === day) ?? null;
}

export function isHolidayDate(year: number, month: number, day: number): boolean {
  return holidayFor(year, month, day) !== null;
}

const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** Human readable label, e.g. "7 января — Рождество Христово". */
export function holidayLabel(holiday: Holiday): string {
  return `${holiday.day} ${MONTHS_GENITIVE[holiday.month - 1] ?? holiday.month} — ${holiday.name}`;
}
