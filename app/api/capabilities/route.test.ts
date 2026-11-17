import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/capabilities/route";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: vi.fn().mockResolvedValue(undefined),
  };
});

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

describe("GET /api/capabilities", () => {
  it("returns 200 with submissions disabled when DOORFLOW_PRIVACY_NOTICE_URL is empty", async () => {
    // Regression: an empty privacy-notice URL used to make `new URL("")` throw,
    // producing a 500 and blocking the public lead form.
    process.env.DATABASE_URL = "postgresql://doorflow:placeholder@127.0.0.1:54329/doorflow";
    process.env.DOORFLOW_DEMO_MODE = "false";
    process.env.DOORFLOW_STORE_ID = "2f0f3ca1-6c8c-4aef-85c6-89234567abcd";
    process.env.DOORFLOW_CONSENT_NOTICE_VERSION = "v1";
    process.env.DOORFLOW_PRIVACY_NOTICE_URL = "";
    process.env.DOORFLOW_RATE_LIMIT_SECRET = "test-rate-limit-secret-with-at-least-32-chars";

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      demoMode: false,
      submissionEnabled: false,
      privacyNoticeUrl: null,
    });
  });

  it("returns 200 and reports demo mode when demo mode is enabled", async () => {
    process.env.DOORFLOW_DEMO_MODE = "true";

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      demoMode: true,
      submissionEnabled: false,
      privacyNoticeUrl: null,
    });
  });

  it("is reachable without any configuration at all", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ submissionEnabled: false, privacyNoticeUrl: null });
  });
});
