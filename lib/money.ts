export function parseRublesToMinor(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const amount = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}

export function formatMinorUnits(amountMinor: number, currency = "RUB") {
  if (!Number.isSafeInteger(amountMinor)) return "—";
  const sign = amountMinor < 0 ? "−" : "";
  const value = BigInt(Math.abs(amountMinor));
  const major = Number(value / BigInt(100));
  const minor = (value % BigInt(100)).toString().padStart(2, "0");
  const formattedMajor = new Intl.NumberFormat("ru-RU").format(major);
  const currencySymbol = currency === "RUB" ? "₽" : currency;
  return `${sign}${formattedMajor},${minor} ${currencySymbol}`;
}
