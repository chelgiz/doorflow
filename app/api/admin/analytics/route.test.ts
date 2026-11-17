import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getAnalytics } from "@/app/api/admin/analytics/route";
import { getPrismaClient } from "@/lib/db/prisma";
import { hashAdminPassword } from "@/lib/admin/password";

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/headers")>();
  return {
    ...actual,
    cookies: vi.fn(async () => ({
      get: () => (cookieState.value ? { value: cookieState.value } : undefined),
      set: (_name: string, value: string) => {
        cookieState.value = value;
      },
      delete: () => {
        cookieState.value = undefined;
      },
    })),
  };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});

const testDatabaseUrl = process.env.DOORFLOW_TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
const MIN = 60_000;
const HOUR = 60 * MIN;

integration("analytics aggregates", () => {
  const suffix = randomUUID().slice(0, 8);
  let storeId: string;
  let ownerToken: string;
  let managerToken: string;
  let oldLeadId: string;

  function hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  function call(token: string, query = "") {
    cookieState.value = token;
    return getAnalytics(new Request(`http://localhost/api/admin/analytics${query}`));
  }

  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    const parsed = new URL(testDatabaseUrl);
    if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
      throw new Error("DOORFLOW_TEST_DATABASE_URL must point to a local test database");
    }
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.DOORFLOW_DEMO_MODE = "false";

    const prisma = getPrismaClient();
    const store = await prisma.store.create({
      data: { slug: `analytics-test-${suffix}`, name: "Analytics test store", isDemo: false },
    });
    storeId = store.id;
    process.env.DOORFLOW_STORE_ID = storeId;

    const passwordHash = await hashAdminPassword("integration-test-password-1234");
    const [owner, manager, otherManager] = await Promise.all([
      prisma.adminUser.create({ data: { storeId, email: `owner-${suffix}@test.local`, passwordHash, role: "OWNER" } }),
      prisma.adminUser.create({ data: { storeId, email: `manager-${suffix}@test.local`, passwordHash, role: "MANAGER" } }),
      prisma.adminUser.create({ data: { storeId, email: `manager2-${suffix}@test.local`, passwordHash, role: "MANAGER" } }),
    ]);

    const now = Date.now();
    const base = {
      storeId,
      customerName: "Analytics test",
      phone: "+79000000111",
      personalDataConsentAt: new Date(now),
      consentNoticeVersion: "test-v1",
    };

    // L1: ORDER lead assigned to manager, contacted in 30 min, sold with an order.
    const l1 = await prisma.lead.create({
      data: {
        ...base,
        type: "ORDER",
        status: "SALE",
        idempotencyKey: `an-l1-${suffix}`,
        assignedManagerId: manager.id,
        firstContactAt: new Date(now - 2 * HOUR + 30 * MIN),
        createdAt: new Date(now - 2 * HOUR),
      },
    });
    // L2: MEASUREMENT lead assigned to manager, rejected with PRICE, no contact.
    await prisma.lead.create({
      data: {
        ...base,
        type: "MEASUREMENT",
        status: "REJECTED",
        rejectionReason: "PRICE",
        idempotencyKey: `an-l2-${suffix}`,
        assignedManagerId: manager.id,
        createdAt: new Date(now - 3 * HOUR),
      },
    });
    // L3: unassigned MEASUREMENT lead contacted after 3 hours (SLA missed).
    await prisma.lead.create({
      data: {
        ...base,
        type: "MEASUREMENT",
        status: "IN_PROGRESS",
        idempotencyKey: `an-l3-${suffix}`,
        firstContactAt: new Date(now - 1 * HOUR),
        createdAt: new Date(now - 4 * HOUR),
      },
    });
    // L4: ORDER lead assigned to another manager, not converted.
    await prisma.lead.create({
      data: {
        ...base,
        type: "ORDER",
        status: "NEW",
        idempotencyKey: `an-l4-${suffix}`,
        assignedManagerId: otherManager.id,
        createdAt: new Date(now - 5 * HOUR),
      },
    });
    // Old lead outside the 30-day window.
    const oldLead = await prisma.lead.create({
      data: {
        ...base,
        type: "MEASUREMENT",
        status: "NEW",
        idempotencyKey: `an-old-${suffix}`,
        createdAt: new Date(now - 40 * 24 * HOUR),
      },
    });
    oldLeadId = oldLead.id;

    await prisma.order.create({
      data: {
        storeId,
        leadId: l1.id,
        managerId: manager.id,
        createdById: owner.id,
        customerName: "Analytics test",
        phone: "+79000000111",
        configurationSnapshot: {},
        sourceQuoteSnapshot: { totalPriceMinor: 100000 },
        subtotalMinor: BigInt(100000),
        totalMinor: BigInt(100000),
        balanceMinor: BigInt(60000),
        prepaymentMinor: BigInt(40000),
      },
    });
    const order = await prisma.order.findFirstOrThrow({ where: { leadId: l1.id } });
    await prisma.orderPayment.create({
      data: { orderId: order.id, amountMinor: BigInt(40000), receivedById: owner.id },
    });

    ownerToken = `owner-token-${randomUUID()}`;
    managerToken = `manager-token-${randomUUID()}`;
    await prisma.adminSession.create({
      data: { userId: owner.id, tokenHash: hash(ownerToken), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await prisma.adminSession.create({
      data: { userId: manager.id, tokenHash: hash(managerToken), expiresAt: new Date(Date.now() + 3_600_000) },
    });
  });

  afterAll(async () => {
    if (!testDatabaseUrl) return;
    const prisma = getPrismaClient();
    await prisma.store.delete({ where: { id: storeId } }).catch(() => undefined);
    cookieState.value = undefined;
  });

  it("returns store-wide aggregates for the owner", async () => {
    const response = await call(ownerToken, "?period=30d");
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.scope).toBe("store");
    expect(data.leads.total).toBe(4); // old lead excluded by the period
    expect(data.leads.byType).toEqual({ ORDER: 2, MEASUREMENT: 2 });
    expect(data.leads.assignmentCoveragePercent).toBe(75);

    expect(data.conversion.orderLeads).toBe(2);
    expect(data.conversion.orderConverted).toBe(1);
    expect(data.conversion.orderConversionPercent).toBe(50);
    expect(data.conversion.allConversionPercent).toBe(25);

    expect(data.firstContact.withContact).toBe(2);
    expect(data.firstContact.avgMinutes).toBe(105); // (30 + 180) / 2
    expect(data.firstContact.withinSla).toBe(1);
    expect(data.firstContact.withinSlaPercent).toBe(50);

    // Point-in-time snapshot: it ignores the period and counts every open lead.
    // Open leads without a contact older than 2h: L4 (5h) and the old lead (40d).
    // The rejected lead is closed and therefore excluded.
    expect(data.discipline.firstContactOverdue).toBe(2);
    expect(data.discipline.actionOverdue).toBe(0);

    expect(data.rejections.total).toBe(1);
    expect(data.rejections.byReason.find((row: { reason: string }) => row.reason === "PRICE").count).toBe(1);
    expect(data.rejections.byReason.every((row: { sharePercent: number }) => row.sharePercent === 0 || row.sharePercent === 100)).toBe(true);

    expect(data.finance.orders).toBe(1);
    expect(data.finance.ordersTotalMinor).toBe(100000);
    expect(data.finance.paidMinor).toBe(40000);
    expect(data.finance.balanceMinor).toBe(60000);
    expect(data.finance.averageCheckMinor).toBe(100000);
    expect(data.finance.collectionPercent).toBe(40);

    expect(data.managers).toHaveLength(2);
    const first = data.managers.find((row: { email: string }) => row.email.startsWith("manager-"));
    expect(first.leads).toBe(2);
    expect(first.sales).toBe(1);
    expect(first.rejections).toBe(1);
    expect(first.orderLeads).toBe(1);
    expect(first.orderConversionPercent).toBe(100);

    expect(data.unassigned).not.toBeNull();
    expect(data.unassigned.leads).toBe(1);

    expect(data.unavailable.map((row: { metric: string }) => row.metric)).toEqual([
      "profit",
      "ltv",
      "sources",
      "delivery_lead_time",
    ]);
  });

  it("includes the old lead for the whole period", async () => {
    const response = await call(ownerToken, "?period=all");
    const data = await response.json();
    expect(data.leads.total).toBe(5);
    expect(data.period.from).toBeNull();
  });

  it("scopes a manager to their own leads and money", async () => {
    const response = await call(managerToken, "?period=30d");
    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.scope).toBe("own");
    expect(data.leads.total).toBe(2);
    expect(data.unassigned).toBeNull();
    expect(data.finance.orders).toBe(1);
    expect(data.managers).toHaveLength(1);
    expect(data.managers[0].behaviour ?? data.managers[0].leads).toBeDefined();
  });

  it("rejects an unknown period", async () => {
    const response = await call(ownerToken, "?period=year");
    expect(response.status).toBe(400);
  });
});
