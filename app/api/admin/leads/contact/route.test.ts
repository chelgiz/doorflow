import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PATCH as recordContact } from "@/app/api/admin/leads/[id]/contact/route";
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

function sessionTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function contactRequest(leadId: string, body: unknown, origin = "http://localhost") {
  return new Request(`http://localhost/api/admin/leads/${leadId}/contact`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

integration("lead first contact (SLA)", () => {
  const suffix = randomUUID().slice(0, 8);
  let storeId: string;
  let assignedLeadId: string;
  let foreignLeadId: string;
  let managerToken: string;

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
      data: { slug: `contact-test-${suffix}`, name: "Contact test store", isDemo: false },
    });
    storeId = store.id;
    process.env.DOORFLOW_STORE_ID = storeId;

    const passwordHash = await hashAdminPassword("integration-test-password-1234");
    const manager = await prisma.adminUser.create({
      data: { storeId, email: `manager-${suffix}@test.local`, passwordHash, role: "MANAGER" },
    });

    const base = {
      storeId,
      type: "MEASUREMENT" as const,
      customerName: "First contact test",
      phone: "+79000000456",
      personalDataConsentAt: new Date(),
      consentNoticeVersion: "test-v1",
    };
    const [assigned, foreign] = await Promise.all([
      prisma.lead.create({
        data: { ...base, idempotencyKey: `contact-assigned-${suffix}`, assignedManagerId: manager.id },
      }),
      prisma.lead.create({ data: { ...base, idempotencyKey: `contact-foreign-${suffix}` } }),
    ]);
    assignedLeadId = assigned.id;
    foreignLeadId = foreign.id;

    managerToken = `manager-token-${randomUUID()}`;
    await prisma.adminSession.create({
      data: { userId: manager.id, tokenHash: sessionTokenHash(managerToken), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    cookieState.value = managerToken;
  });

  afterAll(async () => {
    if (!testDatabaseUrl) return;
    const prisma = getPrismaClient();
    await prisma.store.delete({ where: { id: storeId } }).catch(() => undefined);
    cookieState.value = undefined;
  });

  it("records the first contact once and audits it", async () => {
    const first = await recordContact(contactRequest(assignedLeadId, {}), {
      params: Promise.resolve({ id: assignedLeadId }),
    });
    expect(first.status).toBe(201);
    const firstPayload = await first.json();
    expect(firstPayload.alreadyRecorded).toBe(false);
    const firstContactAt = firstPayload.lead.firstContactAt;
    expect(typeof firstContactAt).toBe("string");

    const second = await recordContact(contactRequest(assignedLeadId, {}), {
      params: Promise.resolve({ id: assignedLeadId }),
    });
    expect(second.status).toBe(200);
    const secondPayload = await second.json();
    expect(secondPayload.alreadyRecorded).toBe(true);
    expect(secondPayload.lead.firstContactAt).toBe(firstContactAt);

    const prisma = getPrismaClient();
    const audit = await prisma.operationAudit.findFirst({
      where: { storeId, entityType: "LEAD", entityId: assignedLeadId, action: "CONTACT_RECORDED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
  });

  it("accepts an explicit contact time", async () => {
    const prisma = getPrismaClient();
    const lead = await prisma.lead.create({
      data: {
        storeId,
        type: "MEASUREMENT",
        customerName: "Explicit time",
        phone: "+79000000457",
        personalDataConsentAt: new Date(),
        consentNoticeVersion: "test-v1",
        idempotencyKey: `contact-explicit-${suffix}`,
        assignedManagerId: (await prisma.adminUser.findFirstOrThrow({ where: { storeId, role: "MANAGER" } })).id,
      },
    });
    const response = await recordContact(
      contactRequest(lead.id, { contactedAt: "2026-11-17T09:30:00+05:00" }),
      { params: Promise.resolve({ id: lead.id }) },
    );
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(new Date(payload.lead.firstContactAt).toISOString()).toBe("2026-11-17T04:30:00.000Z");
  });

  it("hides foreign leads from a manager", async () => {
    const response = await recordContact(contactRequest(foreignLeadId, {}), {
      params: Promise.resolve({ id: foreignLeadId }),
    });
    expect(response.status).toBe(404);
  });

  it("rejects a foreign origin", async () => {
    const response = await recordContact(
      contactRequest(assignedLeadId, {}, "http://evil.example"),
      { params: Promise.resolve({ id: assignedLeadId }) },
    );
    expect(response.status).toBe(403);
  });
});
