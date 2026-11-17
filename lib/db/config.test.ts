import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  areSubmissionsEnabled,
  getAdminStoreId,
  getConfiguredStore,
  getDatabaseConfig,
  isDemoMode,
} from "@/lib/db/config";

const STORE_ID = "2f0f3ca1-6c8c-4aef-85c6-89234567abcd";
const DATABASE_URL = "postgresql://doorflow:placeholder@127.0.0.1:54329/doorflow?schema=public";
const RATE_LIMIT_SECRET = "test-rate-limit-secret-with-at-least-32-chars";

const managedVariables = [
  "DATABASE_URL",
  "DOORFLOW_DEMO_MODE",
  "DOORFLOW_STORE_ID",
  "DOORFLOW_CONSENT_NOTICE_VERSION",
  "DOORFLOW_PRIVACY_NOTICE_URL",
  "DOORFLOW_RATE_LIMIT_SECRET",
  "DOORFLOW_PUBLIC_LEAD_RATE_LIMIT",
  "DOORFLOW_PUBLIC_LEAD_WINDOW_SECONDS",
] as const;

let originalEnvironment: Record<string, string | undefined>;

function setProductionLikeEnvironment(): void {
  process.env.DATABASE_URL = DATABASE_URL;
  process.env.DOORFLOW_DEMO_MODE = "false";
  process.env.DOORFLOW_STORE_ID = STORE_ID;
  process.env.DOORFLOW_CONSENT_NOTICE_VERSION = "v1";
  process.env.DOORFLOW_PRIVACY_NOTICE_URL = "https://shop.example.test/privacy";
  process.env.DOORFLOW_RATE_LIMIT_SECRET = RATE_LIMIT_SECRET;
  process.env.DOORFLOW_PUBLIC_LEAD_RATE_LIMIT = "5";
  process.env.DOORFLOW_PUBLIC_LEAD_WINDOW_SECONDS = "900";
}

beforeEach(() => {
  originalEnvironment = Object.fromEntries(
    managedVariables.map((name) => [name, process.env[name]]),
  );
  for (const name of managedVariables) delete process.env[name];
});

afterEach(() => {
  for (const name of managedVariables) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("environment configuration parsing", () => {
  it("treats an empty DOORFLOW_PRIVACY_NOTICE_URL as missing configuration instead of throwing", () => {
    // Regression: Zod refinements run after a failed `.url()` check, so
    // `new URL("")` used to throw a TypeError and turn public endpoints into 500s.
    setProductionLikeEnvironment();
    process.env.DOORFLOW_PRIVACY_NOTICE_URL = "";

    expect(() => getConfiguredStore()).not.toThrow();
    expect(getConfiguredStore()).toBeNull();
    expect(() => areSubmissionsEnabled()).not.toThrow();
    expect(areSubmissionsEnabled()).toBe(false);
  });

  it("treats an empty DATABASE_URL as missing configuration instead of throwing", () => {
    setProductionLikeEnvironment();
    process.env.DATABASE_URL = "";

    expect(() => getDatabaseConfig()).not.toThrow();
    expect(getDatabaseConfig()).toBeNull();
    expect(getConfiguredStore()).toBeNull();
    expect(getAdminStoreId()).toBeNull();
  });

  it("treats a malformed URL as invalid instead of throwing", () => {
    setProductionLikeEnvironment();
    process.env.DATABASE_URL = "not a url";
    process.env.DOORFLOW_PRIVACY_NOTICE_URL = "://broken";

    expect(() => getDatabaseConfig()).not.toThrow();
    expect(getDatabaseConfig()).toBeNull();
    expect(() => getConfiguredStore()).not.toThrow();
    expect(getConfiguredStore()).toBeNull();
  });

  it("accepts a complete non-demo configuration", () => {
    setProductionLikeEnvironment();

    expect(getConfiguredStore()).toEqual({
      databaseUrl: DATABASE_URL,
      storeId: STORE_ID,
      consentNoticeVersion: "v1",
      privacyNoticeUrl: "https://shop.example.test/privacy",
    });
    expect(areSubmissionsEnabled()).toBe(true);
    expect(isDemoMode()).toBe(false);
    expect(getAdminStoreId()).toEqual({ databaseUrl: DATABASE_URL, storeId: STORE_ID });
  });

  it("allows a localhost http privacy notice for local development", () => {
    setProductionLikeEnvironment();
    process.env.DOORFLOW_PRIVACY_NOTICE_URL = "http://localhost:3000/privacy";

    expect(getConfiguredStore()?.privacyNoticeUrl).toBe("http://localhost:3000/privacy");
  });

  it("rejects a non-https public privacy notice", () => {
    setProductionLikeEnvironment();
    process.env.DOORFLOW_PRIVACY_NOTICE_URL = "http://shop.example.test/privacy";

    expect(getConfiguredStore()).toBeNull();
  });

  it("rejects a non-PostgreSQL DATABASE_URL scheme", () => {
    setProductionLikeEnvironment();
    process.env.DATABASE_URL = "mysql://doorflow:placeholder@127.0.0.1:3306/doorflow";

    expect(getDatabaseConfig()).toBeNull();
    expect(getConfiguredStore()).toBeNull();
  });

  it("disables submissions in demo mode even when every other value is present", () => {
    setProductionLikeEnvironment();
    process.env.DOORFLOW_DEMO_MODE = "true";

    expect(isDemoMode()).toBe(true);
    expect(getConfiguredStore()).toBeNull();
    expect(getAdminStoreId()).toBeNull();
    expect(areSubmissionsEnabled()).toBe(false);
  });

  it("rejects a short rate-limit secret", () => {
    setProductionLikeEnvironment();
    process.env.DOORFLOW_RATE_LIMIT_SECRET = "too-short";

    expect(getConfiguredStore()).toBeNull();
  });

  it("rejects an out-of-range rate-limit window", () => {
    setProductionLikeEnvironment();
    process.env.DOORFLOW_PUBLIC_LEAD_WINDOW_SECONDS = "5";

    expect(getConfiguredStore()).toBeNull();
  });
});
