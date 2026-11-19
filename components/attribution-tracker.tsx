"use client";

import { useEffect } from "react";
import {
  ATTRIBUTION_STORAGE_KEY,
  attributionFromSearch,
  isEmptyAttribution,
  mergeAttribution,
  parseStoredAttribution,
  referrerSource,
} from "@/lib/commerce/attribution";

/**
 * Remembers the campaign a visitor arrived with.
 *
 * Mounted on public pages, it stores the first touch in sessionStorage, so a
 * visitor who lands on `/?utm_source=yandex` and only submits a form two pages
 * later still brings the campaign with the lead. Renders nothing.
 */
export function AttributionTracker() {
  useEffect(() => {
    const fromUrl = attributionFromSearch(window.location.search);
    const fromReferrer = { source: referrerSource(document.referrer, window.location.origin) };
    let stored = null;
    try {
      stored = parseStoredAttribution(window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY));
    } catch {
      stored = null;
    }
    const merged = mergeAttribution(stored, { ...fromUrl, ...fromReferrer });
    if (isEmptyAttribution(merged)) return;
    try {
      window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Private mode or quota exceeded: attribution must never break the page.
    }
  }, []);

  return null;
}
