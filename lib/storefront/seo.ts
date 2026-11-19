/**
 * Публичный адрес витрины для метаданных, sitemap и robots.
 *
 * В продакшене задаётся переменной окружения DOORFLOW_PUBLIC_URL, локально и в
 * тестах используется домен магазина по умолчанию.
 */
const DEFAULT_PUBLIC_URL = "https://xn--b1ade2affmt.xn--p1ai"; // двермонт.рф

export function getPublicSiteUrl() {
  const configured = process.env.DOORFLOW_PUBLIC_URL?.trim();
  if (!configured) return DEFAULT_PUBLIC_URL;
  try {
    return new URL(configured).origin;
  } catch {
    return DEFAULT_PUBLIC_URL;
  }
}

export function absoluteUrl(path: string) {
  return new URL(path, getPublicSiteUrl()).toString();
}
