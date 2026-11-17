import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PATCH as updateLead } from "@/app/api/admin/leads/[id]/route";
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

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function patchLead(leadId: string, body: unknown, origin = "http://localhost") {
  return updateLead(
    new Request(`http://localhost/api/admin/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: leadId }) },
  );
}

integration("lead rejection reasons", () => {
  const suffix = randomUUID().slice(0, 8);
  let storeId: string;
  let leadId: string;
  let otherLeadId: string;
  let foreignLeadId: string;

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
      data: { slug: `reject-test-${suffix}`, name: "Rejection test store", isDemo: false },
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
      customerName: "Rejection test",
      phone: "+79000000911",
      personalDataConsentAt: new Date(),
      consentNoticeVersion: "test-v1",
    };
    const [lead, other] = await Promise.all([
      prisma.lead.create({
        data: { ...base, idempotencyKey: `reject-main-${suffix}`, assignedManagerId: manager.id },
      }),
      prisma.lead.create({
        data: { ...base, idempotencyKey: `reject-other-${suffix}`, assignedManagerId: manager.id },
      }),
    ]);
    leadId = lead.id;
    otherLeadId = other.id;
    foreignLeadId = (
      await prisma.lead.create({ data: { ...base, idempotencyKey: `reject-foreign-${suffix}` } })
    ).id;

    const token = `manager-token-${randomUUID()}`;
    await prisma.adminSession.create({
      data: { userId: manager.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    cookieState.value = token;
  });

  afterAll(async () => {
    if (!testDatabaseUrl) return;
    const prisma = getPrismaClient();
    await prisma.store.delete({ where: { id: storeId } }).catch(() => undefined);
    cookieState.value = undefined;
  });

  it("rejects the transition to REJECTED without a reason", async () => {
    const response = await patchLead(leadId, { status: "REJECTED" });
    expect(response.status).toBe(400);
    const prisma = getPrismaClient();
    const stored = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(stored.status).toBe("NEW");
  });

  it("rejects a reason attached to a non-rejection status", async () => {
    const response = await patchLead(leadId, { status: "IN_PROGRESS", rejectionReason: "PRICE" });
    expect(response.status).toBe(400);
  });

  it("stores the reason, history note and audit entry on rejection", async () => {
    const response = await patchLead(leadId, {
      status: "REJECTED",
      rejectionReason: "COMPETITOR",
      note: "клиент уже купил",
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.lead.status).toBe("REJECTED");
    expect(payload.lead.rejectionReason).toBe("COMPETITOR");

    const prisma = getPrismaClient();
    const history = await prisma.leadStatusHistory.findFirst({
      where: { leadId },
      orderBy: { changedAt: "desc" },
    });
    expect(history?.note).toContain("Причина отказа");
    expect(history?.note).toContain("другой магазин");

    const audit = await prisma.operationAudit.findFirst({
      where: { storeId, entityType: "LEAD", entityId: leadId, action: "REJECTED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.changes)).toContain("COMPETITOR");
  });

  it("clears the reason when the lead leaves the rejected status", async () => {
    const response = await patchLead(otherLeadId, { status: "REJECTED", rejectionReason: "PRICE" });
    expect(response.status).toBe(200);
    const reopened = await patchLead(otherLeadId, { status: "IN_PROGRESS" });
    expect(reopened.status).toBe(200);
    const payload = await reopened.json();
    expect(payload.lead.rejectionReason).toBeNull();
  });

  it("enforces the rejection reason in the database itself", async () => {
    const prisma = getPrismaClient();
    await expect(
      prisma.$executeRaw`UPDATE "Lead" SET "status" = 'REJECTED' WHERE "id" = ${foreignLeadId}::uuid`,
    ).rejects.toThrow();
  });
});
