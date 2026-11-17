import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/leads/route";

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

function postLead(body: unknown) {
  return POST(
    new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify(body),
    }),
  );
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

describe("POST /api/leads without a configured store", () => {
  it("returns a clear 503 instead of a 500 when DOORFLOW_PRIVACY_NOTICE_URL is empty", async () => {
    // Regression: the empty URL made configuration parsing throw, so the route
    // answered with an unhandled 500 instead of an explained refusal.
    process.env.DATABASE_URL = "postgresql://doorflow:placeholder@127.0.0.1:54329/doorflow";
    process.env.DOORFLOW_DEMO_MODE = "false";
    process.env.DOORFLOW_STORE_ID = "2f0f3ca1-6c8c-4aef-85c6-89234567abcd";
    process.env.DOORFLOW_CONSENT_NOTICE_VERSION = "v1";
    process.env.DOORFLOW_PRIVACY_NOTICE_URL = "";
    process.env.DOORFLOW_RATE_LIMIT_SECRET = "test-rate-limit-secret-with-at-least-32-chars";

    const response = await postLead({
      type: "measurement",
      name: "Тест",
      phone: "+7 900 000-00-00",
    });

    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.error).toContain("Приём заявок отключён");
  });

  it("returns a clear 503 in demo mode", async () => {
    process.env.DOORFLOW_DEMO_MODE = "true";

    const response = await postLead({ type: "measurement", name: "Тест", phone: "+7 900 000-00-00" });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Приём заявок отключён"),
    });
  });

  it("never answers with a 500 for a malformed body while unconfigured", async () => {
    const response = await POST(
      new Request("http://localhost/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: "{not json",
      }),
    );

    expect(response.status).toBe(503);
  });
});
