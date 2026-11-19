import { describe, expect, it } from "vitest";
import {
  attributionFromSearch,
  isEmptyAttribution,
  mergeAttribution,
  parseStoredAttribution,
  referrerSource,
} from "@/lib/commerce/attribution";

describe("attribution from a query string", () => {
  it("reads every supported parameter", () => {
    expect(
      attributionFromSearch(
        "?utm_source=yandex&utm_medium=cpc&utm_campaign=doors&utm_content=banner&utm_term=%D0%B4%D0%B2%D0%B5%D1%80%D0%B8&source=site",
      ),
    ).toEqual({
      utmSource: "yandex",
      utmMedium: "cpc",
      utmCampaign: "doors",
      utmContent: "banner",
      utmTerm: "двери",
      source: "site",
    });
  });

  it("accepts a search string without the question mark and ignores empty values", () => {
    expect(attributionFromSearch("utm_source=&utm_medium=")).toEqual({});
    expect(attributionFromSearch("utm_source=google")).toEqual({ utmSource: "google" });
    expect(attributionFromSearch("")).toEqual({});
  });

  it("truncates values to the schema limits", () => {
    const long = "x".repeat(300);
    expect(attributionFromSearch(`?utm_source=${long}`).utmSource).toHaveLength(120);
    expect(attributionFromSearch(`?utm_campaign=${long}`).utmCampaign).toHaveLength(160);
  });
});

describe("referrer", () => {
  it("keeps an external host and drops the same origin", () => {
    expect(referrerSource("https://yandex.ru/search?text=doors", "https://двермонт.рф")).toBe("yandex.ru");
    expect(referrerSource("https://двермонт.рф/catalog", "https://двермонт.рф")).toBeUndefined();
    expect(referrerSource("", "https://двермонт.рф")).toBeUndefined();
    expect(referrerSource("not a url", "https://двермонт.рф")).toBeUndefined();
  });
});

describe("merging first touch", () => {
  it("does not let a later page view overwrite the campaign", () => {
    const stored = { utmSource: "yandex", utmCampaign: "winter" };
    expect(mergeAttribution(stored, { utmSource: "google" })).toEqual({
      utmSource: "yandex",
      utmCampaign: "winter",
    });
  });

  it("fills missing fields from the current view", () => {
    expect(mergeAttribution({ utmSource: "yandex" }, { utmMedium: "cpc", source: "yandex.ru" })).toEqual({
      utmSource: "yandex",
      utmMedium: "cpc",
      source: "yandex.ru",
    });
    expect(mergeAttribution(null, { utmSource: "yandex" })).toEqual({ utmSource: "yandex" });
  });
});

describe("stored attribution", () => {
  it("reads a valid value", () => {
    expect(parseStoredAttribution(JSON.stringify({ utmSource: "yandex", extra: "ignored" }))).toEqual({
      utmSource: "yandex",
    });
  });

  it("ignores broken or empty values", () => {
    expect(parseStoredAttribution(null)).toBeNull();
    expect(parseStoredAttribution("{not json")).toBeNull();
    expect(parseStoredAttribution(JSON.stringify({}))).toBeNull();
    expect(parseStoredAttribution(JSON.stringify({ utmSource: 42 }))).toBeNull();
  });

  it("detects an empty attribution", () => {
    expect(isEmptyAttribution({})).toBe(true);
    expect(isEmptyAttribution({ utmSource: "yandex" })).toBe(false);
  });
});
