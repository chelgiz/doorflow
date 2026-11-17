/**
 * Display helpers for analytics numbers (step 6).
 *
 * Percentages arrive from the API already rounded to one decimal place, money
 * arrives in integer kopeks. Both the analytics page and the home summary use
 * these helpers so the same number never renders two different ways.
 */
export function rubles(amountMinor: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amountMinor / 100)} ₽`;
}

export function percent(value: number | null) {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)} %`;
}

export function duration(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч ${Math.round(minutes % 60)} мин`;
  return `${Math.floor(hours / 24)} д ${hours % 24} ч`;
}

/** Russian plural form for a count: plural(2, "заявка", "заявки", "заявок"). */
export function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
