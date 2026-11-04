import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getCapabilities } from "@/app/api/capabilities/route";
import { POST as createLead } from "@/app/api/leads/route";
import { POST as createQuote } from "@/app/api/quotes/route";
import { getPrismaClient } from "@/lib/db/prisma";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    connection: vi.fn().mockResolvedValue(undefined),
  };
});

const testDatabaseUrl = process.env.DOORFLOW_TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
const originalEnvironment = {
  databaseUrl: process.env.DATABASE_URL,
  demoMode: process.env.DOORFLOW_DEMO_MODE,
  storeId: process.env.DOORFLOW_STORE_ID,
  consentNoticeVersion: process.env.DOORFLOW_CONSENT_NOTICE_VERSION,
  privacyNoticeUrl: process.env.DOORFLOW_PRIVACY_NOTICE_URL,
  rateLimitSecret: process.env.DOORFLOW_RATE_LIMIT_SECRET,
  rateLimit: process.env.DOORFLOW_PUBLIC_LEAD_RATE_LIMIT,
  rateWindow: process.env.DOORFLOW_PUBLIC_LEAD_WINDOW_SECONDS,
};

integration("PostgreSQL-backed quote and lead flow", () => {
  let storeId: string | undefined;
  let productSlug: string;
  let optionGroupId: string;
  let optionId: string;
  let pricingRuleId: string;

  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    const databaseUrl = new URL(testDatabaseUrl);
    if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
      throw new Error("DOORFLOW_TEST_DATABASE_URL must point to a local test database");
    }

    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.DOORFLOW_DEMO_MODE = "false";
    process.env.DOORFLOW_CONSENT_NOTICE_VERSION = "test-v1";
    process.env.DOORFLOW_PRIVACY_NOTICE_URL = "https://doorflow.test/privacy";
    process.env.DOORFLOW_RATE_LIMIT_SECRET = "integration-test-secret-with-at-least-32-characters";
    process.env.DOORFLOW_PUBLIC_LEAD_RATE_LIMIT = "5";
    process.env.DOORFLOW_PUBLIC_LEAD_WINDOW_SECONDS = "900";
    storeId = randomUUID();
    process.env.DOORFLOW_STORE_ID = storeId;

    const prisma = getPrismaClient();
    await prisma.store.create({
      data: {
        id: storeId,
        slug: `test-${randomUUID()}`,
        name: "Test-only DoorFlow store",
        isDemo: false,
      },
    });

    productSlug = `test-door-${randomUUID()}`;
    const product = await prisma.product.create({
      data: {
        storeId,
        slug: productSlug,
        model: "TEST-001",
        name: "Test-only door",
        description: "Test fixture; not a catalog item",
        category: "test",
        basePriceMinor: BigInt(1_000_000),
        currency: "RUB",
        specifications: { test: true },
        isDemo: false,
        optionGroups: {
          create: {
            key: "lock-set",
            label: "Test lock set",
            selectionMode: "SINGLE",
            required: true,
            minSelections: 1,
            maxSelections: 1,
            options: {
              create: {
                key: "standard",
                label: "Test option",
                priceMinor: BigInt(100_000),
                pricingUnit: "PER_DOOR",
              },
            },
          },
        },
      },
      include: { optionGroups: { include: { options: true } } },
    });
    optionGroupId = product.optionGroups[0].id;
    optionId = product.optionGroups[0].options[0].id;

    const rule = await prisma.pricingRule.create({
      data: {
        storeId,
        key: "delivery",
        label: "Test delivery",
        method: "FIXED",
        priceMinor: BigInt(200_000),
        maxQuantity: 1,
      },
    });
    pricingRuleId = rule.id;
  });

  afterAll(async () => {
    if (storeId && testDatabaseUrl) {
      const prisma = getPrismaClient();
      await prisma.lead.deleteMany({ where: { storeId } });
      await prisma.store.delete({ where: { id: storeId } });
      await prisma.$disconnect();
      globalThis.doorflowPrisma = undefined;
    }
    process.env.DATABASE_URL = originalEnvironment.databaseUrl;
    process.env.DOORFLOW_DEMO_MODE = originalEnvironment.demoMode;
    process.env.DOORFLOW_STORE_ID = originalEnvironment.storeId;
    process.env.DOORFLOW_CONSENT_NOTICE_VERSION = originalEnvironment.consentNoticeVersion;
    process.env.DOORFLOW_PRIVACY_NOTICE_URL = originalEnvironment.privacyNoticeUrl;
    process.env.DOORFLOW_RATE_LIMIT_SECRET = originalEnvironment.rateLimitSecret;
    process.env.DOORFLOW_PUBLIC_LEAD_RATE_LIMIT = originalEnvironment.rateLimit;
    process.env.DOORFLOW_PUBLIC_LEAD_WINDOW_SECONDS = originalEnvironment.rateWindow;
  });

  it("reads a configured store, recalculates an order, and persists the consented lead", async () => {
    const capabilitiesResponse = await getCapabilities();
    const capabilities = await capabilitiesResponse.json();
    expect(capabilities.submissionEnabled).toBe(true);

    const quoteResponse = await createQuote(
      new Request("http://localhost/api/quotes", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
        body: JSON.stringify({
          productSlug,
          quantity: 1,
          selections: { [optionGroupId]: [optionId] },
          services: { [pricingRuleId]: 1 },
          totalPriceMinor: 1,
        }),
      }),
    );
    const quoteResult = await quoteResponse.json();
    expect(quoteResponse.status).toBe(400);

    const validQuoteResponse = await createQuote(
      new Request("http://localhost/api/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify({
          productSlug,
          quantity: 1,
          selections: { [optionGroupId]: [optionId] },
          services: { [pricingRuleId]: 1 },
        }),
      }),
    );
    const validQuote = await validQuoteResponse.json();
    expect(validQuoteResponse.status).toBe(200);
    expect(validQuote.quote.totalPriceMinor).toBe(1_300_000);
    expect(validQuote.quote.isDemo).toBe(false);
    expect(validQuote.disclaimer).toContain("Предварительный расчёт");
    expect(quoteResult.error).toBe("Invalid quote request");

    const missingClientIp = await createLead(new Request("http://localhost/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    expect(missingClientIp.status).toBe(503);

    const invalidOrderResponse = await createLead(
      new Request("http://localhost/api/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify({
          type: "order",
          name: "Test Customer",
          phone: "+7 (900) 000-00-01",
          address: "Test address 1",
          consent: true,
          website: "",
          productSlug,
          quantity: 1,
          selections: { [optionGroupId]: ["unknown-option"] },
          services: {},
        }),
      }),
    );
    expect(invalidOrderResponse.status).toBe(422);

    const orderIdempotencyKey = randomUUID();
    const orderPayload = {
      type: "order",
      name: "Test Customer",
      phone: "+7 (900) 000-00-01",
      address: "Test address 1",
      consent: true,
      website: "",
      productSlug,
      quantity: 1,
      selections: { [optionGroupId]: [optionId] },
      services: { [pricingRuleId]: 1 },
      attribution: { utmSource: "test-suite" },
    };
    const leadResponse = await createLead(
      new Request("http://localhost/api/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10",
          "Idempotency-Key": orderIdempotencyKey,
        },
        body: JSON.stringify(orderPayload),
      }),
    );
    const leadResult = await leadResponse.json();
    expect(leadResponse.status).toBe(201);
    expect(typeof leadResult.id).toBe("string");

    const savedLead = await getPrismaClient().lead.findUnique({
      where: { id: leadResult.id },
      include: { statusHistory: true },
    });
    expect(savedLead).toMatchObject({
      storeId,
      type: "ORDER",
      customerName: "Test Customer",
      phone: "+79000000001",
      utmSource: "test-suite",
      quoteSnapshot: { totalPriceMinor: 1_300_000 },
      consentNoticeVersion: "test-v1",
    });
    expect(savedLead?.personalDataConsentAt).toBeInstanceOf(Date);
    expect(savedLead?.statusHistory).toHaveLength(1);
    expect(savedLead?.statusHistory[0].to).toBe("NEW");

    const repeatedLeadResponse = await createLead(new Request("http://localhost/api/leads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10",
        "Idempotency-Key": orderIdempotencyKey,
      },
      body: JSON.stringify(orderPayload),
    }));
    expect(repeatedLeadResponse.status).toBe(200);
    expect((await repeatedLeadResponse.json()).id).toBe(leadResult.id);

    const reusedLeadKeyResponse = await createLead(new Request("http://localhost/api/leads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10",
        "Idempotency-Key": orderIdempotencyKey,
      },
      body: JSON.stringify({ ...orderPayload, name: "Different customer" }),
    }));
    expect(reusedLeadKeyResponse.status).toBe(409);

    const measurementResponse = await createLead(
      new Request("http://localhost/api/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify({
          type: "measurement",
          name: "Measurement Test",
          phone: "+7 (900) 000-00-02",
          address: "Test measurement address",
          comment: "Please call before visiting",
          consent: true,
          website: "",
          attribution: { source: "integration-test" },
        }),
      }),
    );
    expect(measurementResponse.status).toBe(201);
    const measurement = await getPrismaClient().lead.findUnique({
      where: { id: (await measurementResponse.json()).id },
    });
    expect(measurement).toMatchObject({
      storeId,
      type: "MEASUREMENT",
      customerName: "Measurement Test",
      address: "Test measurement address",
      source: "integration-test",
    });

    const throttledResponse = await createLead(new Request("http://localhost/api/leads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        type: "measurement",
        name: "Rate limit test",
        phone: "+7 (900) 000-00-03",
        address: "Rate limit test address",
        consent: true,
        website: "",
      }),
    }));
    expect(throttledResponse.status).toBe(429);
  });
});
