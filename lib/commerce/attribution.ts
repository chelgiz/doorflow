/**
 * UTM and referrer attribution for public lead forms.
 *
 * A visitor usually lands on `/?utm_source=yandex` and then walks through the
 * catalogue before submitting a form, so the campaign parameters must survive
 * client-side navigation. The form stores the first touch in sessionStorage and
 * merges it with the current URL on submit.
 *
 * The module is pure: no `window`, no storage objects. The browser glue lives in
 * the form component, which keeps this logic testable.
 */

export type Attribution = {
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

export const ATTRIBUTION_STORAGE_KEY = "doorflow:attribution";

const LIMITS: Record<keyof Attribution, number> = {
  source: 120,
  utmSource: 120,
  utmMedium: 120,
  utmCampaign: 160,
  utmContent: 160,
  utmTerm: 160,
};

const SEARCH_PARAMS: ReadonlyArray<readonly [string, keyof Attribution]> = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_content", "utmContent"],
  ["utm_term", "utmTerm"],
  ["source", "source"],
];

function cleanValue(value: string | null | undefined, key: keyof Attribution): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, LIMITS[key]);
}

/** Reads attribution parameters from a query string (`?utm_source=...`). */
export function attributionFromSearch(search: string): Attribution {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const attribution: Attribution = {};
  for (const [param, key] of SEARCH_PARAMS) {
    const value = cleanValue(params.get(param), key);
    if (value) attribution[key] = value;
  }
  return attribution;
}

/** External referrer host, e.g. "yandex.ru"; same-origin referrals are ignored. */
export function referrerSource(referrer: string, ownOrigin: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const url = new URL(referrer);
    // Origins are compared in their normalized (punycode) form: the store
    // domain may be Cyrillic, while `URL` always returns ASCII.
    let normalizedOwnOrigin = ownOrigin;
    try {
      normalizedOwnOrigin = new URL(ownOrigin).origin;
    } catch {
      // keep the raw value when the caller passed something unusual
    }
    if (url.origin === normalizedOwnOrigin) return undefined;
    return cleanValue(url.hostname, "source");
  } catch {
    return undefined;
  }
}

/**
 * First touch wins: campaign parameters already stored for the session are not
 * overwritten by a later page view. `source` (referrer) is only filled when the
 * stored attribution has none.
 */
export function mergeAttribution(
  stored: Attribution | null | undefined,
  next: Attribution,
): Attribution {
  const merged: Attribution = { ...(stored ?? {}) };
  for (const [key, value] of Object.entries(next) as Array<[keyof Attribution, string | undefined]>) {
    if (!value) continue;
    if (!merged[key]) merged[key] = value;
  }
  return merged;
}

export function isEmptyAttribution(attribution: Attribution): boolean {
  return Object.values(attribution).every((value) => !value);
}

/** Parses attribution previously saved in sessionStorage; ignores junk. */
export function parseStoredAttribution(raw: string | null | undefined): Attribution | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const attribution: Attribution = {};
  for (const key of Object.keys(LIMITS) as Array<keyof Attribution>) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === "string") {
      const cleaned = cleanValue(value, key);
      if (cleaned) attribution[key] = cleaned;
    }
  }
  return isEmptyAttribution(attribution) ? null : attribution;
}
