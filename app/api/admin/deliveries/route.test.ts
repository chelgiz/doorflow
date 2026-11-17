import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getDeliveries, POST as createDelivery } from "@/app/api/admin/deliveries/route";
import { PATCH as updateDelivery } from "@/app/api/admin/deliveries/[id]/route";
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
const DAY = 86_400_000;

integration("delivery entity", () => {
  const suffix = randomUUID().slice(0, 8);
  let storeId: string;
  let orderId: string;
  let secondOrderId: string;
  let employeeId: string;
  let deliveryId: string;

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
      data: { slug: `delivery-test-${suffix}`, name: "Delivery test store", isDemo: false },
    });
    storeId = store.id;
    process.env.DOORFLOW_STORE_ID = storeId;

    const passwordHash = await hashAdminPassword("integration-test-password-1234");
    const owner = await prisma.adminUser.create({
      data: { storeId, email: `owner-${suffix}@test.local`, passwordHash, role: "OWNER" },
    });
    const employee = await prisma.adminUser.create({
      data: { storeId, email: `courier-${suffix}@test.local`, passwordHash, role: "INSTALLER" },
    });
    employeeId = employee.id;

    const leadBase = {
      storeId,
      type: "ORDER" as const,
      customerName: "Delivery test",
      phone: "+79000000321",
      personalDataConsentAt: new Date(),
      consentNoticeVersion: "test-v1",
      status: "SALE" as const,
    };
    const [leadA, leadB] = await Promise.all([
      prisma.lead.create({ data: { ...leadBase, idempotencyKey: `delivery-a-${suffix}` } }),
      prisma.lead.create({ data: { ...leadBase, idempotencyKey: `delivery-b-${suffix}` } }),
    ]);
    const orderBase = {
      storeId,
      managerId: owner.id,
      createdById: owner.id,
      customerName: "Delivery test",
      phone: "+79000000321",
      configurationSnapshot: {},
      sourceQuoteSnapshot: { totalPriceMinor: 100000 },
      subtotalMinor: BigInt(100000),
      totalMinor: BigInt(100000),
      balanceMinor: BigInt(100000),
    };
    const [orderA, orderB] = await Promise.all([
      prisma.order.create({ data: { ...orderBase, leadId: leadA.id } }),
      prisma.order.create({ data: { ...orderBase, leadId: leadB.id } }),
    ]);
    orderId = orderA.id;
    secondOrderId = orderB.id;

    const token = `owner-token-${randomUUID()}`;
    await prisma.adminSession.create({
      data: { userId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    cookieState.value = token;
  });

  afterAll(async () => {
    if (!testDatabaseUrl) return;
    const prisma = getPrismaClient();
    await prisma.store.delete({ where: { id: storeId } }).catch(() => undefined);
    cookieState.value = undefined;
  });

  function post(body: unknown, origin = "http://localhost") {
    return createDelivery(
      new Request("http://localhost/api/admin/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify(body),
      }),
    );
  }

  function patch(id: string, body: unknown) {
    return updateDelivery(
      new Request(`http://localhost/api/admin/deliveries/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    );
  }

  it("creates a delivery for an active order and audits it", async () => {
    const response = await post({
      orderId,
      assignedEmployeeId: employeeId,
      scheduledAt: new Date(Date.now() + DAY).toISOString(),
      address: "г. Екатеринбург, ул. Доставки, 1",
      comments: "позвонить за час",
    });
    expect(response.status).toBe(201);
    const payload = await response.json();
    deliveryId = payload.delivery.id;
    expect(payload.delivery.status).toBe("SCHEDULED");
    expect(payload.delivery.assignedEmployeeId).toBe(employeeId);

    const prisma = getPrismaClient();
    const audit = await prisma.operationAudit.findFirst({
      where: { storeId, entityType: "DELIVERY", entityId: deliveryId, action: "CREATED" },
    });
    expect(audit).not.toBeNull();
  });

  it("refuses a second delivery for the same order", async () => {
    const response = await post({
      orderId,
      assignedEmployeeId: null,
      scheduledAt: new Date(Date.now() + DAY).toISOString(),
      address: "г. Екатеринбург, ул. Доставки, 1",
    });
    expect(response.status).toBe(409);
  });

  it("rejects an unknown employee", async () => {
    const response = await post({
      orderId: secondOrderId,
      assignedEmployeeId: randomUUID(),
      scheduledAt: new Date(Date.now() + DAY).toISOString(),
      address: "г. Екатеринбург, ул. Доставки, 2",
    });
    expect(response.status).toBe(422);
  });

  it("walks the allowed status transitions and sets deliveredAt", async () => {
    expect((await patch(deliveryId, { status: "CONFIRMED" })).status).toBe(200);
    expect((await patch(deliveryId, { status: "IN_PROGRESS" })).status).toBe(200);
    const delivered = await patch(deliveryId, { status: "DELIVERED", result: "двери переданы, 2 шт." });
    expect(delivered.status).toBe(200);
    const payload = await delivered.json();
    expect(payload.delivery.status).toBe("DELIVERED");
    expect(payload.delivery.deliveredAt).toBeTruthy();
  });

  it("rejects an invalid transition and a foreign origin", async () => {
    expect((await patch(deliveryId, { status: "SCHEDULED" })).status).toBe(409);
    const foreign = await post(
      {
        orderId: secondOrderId,
        assignedEmployeeId: null,
        scheduledAt: new Date(Date.now() + DAY).toISOString(),
        address: "г. Екатеринбург, ул. Доставки, 2",
      },
      "http://evil.example",
    );
    expect(foreign.status).toBe(403);
  });

  it("lists deliveries for the store", async () => {
    const response = await getDeliveries(new Request("http://localhost/api/admin/deliveries"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.deliveries.some((item: { id: string }) => item.id === deliveryId)).toBe(true);
  });
});
