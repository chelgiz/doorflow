import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PATCH as setNextAction } from "@/app/api/admin/leads/[id]/next-action/route";
import { GET as getLeads } from "@/app/api/admin/leads/route";
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

function request(leadId: string, body: unknown, origin = "http://localhost") {
  return new Request(`http://localhost/api/admin/leads/${leadId}/next-action`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

integration("lead next action", () => {
  const suffix = randomUUID().slice(0, 8);
  let storeId: string;
  let ownedLeadId: string;
  let foreignLeadId: string;
  let closedLeadId: string;

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
      data: { slug: `action-test-${suffix}`, name: "Action test store", isDemo: false },
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
      customerName: "Next action test",
      phone: "+79000000789",
      personalDataConsentAt: new Date(),
      consentNoticeVersion: "test-v1",
    };
    const [owned, foreign, closed] = await Promise.all([
      prisma.lead.create({
        data: { ...base, idempotencyKey: `action-owned-${suffix}`, assignedManagerId: manager.id },
      }),
      prisma.lead.create({ data: { ...base, idempotencyKey: `action-foreign-${suffix}` } }),
      prisma.lead.create({
        data: { ...base, idempotencyKey: `action-closed-${suffix}`, assignedManagerId: manager.id, status: "SALE" },
      }),
    ]);
    ownedLeadId = owned.id;
    foreignLeadId = foreign.id;
    closedLeadId = closed.id;

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

  it("plans a follow-up action and audits it", async () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const response = await setNextAction(request(ownedLeadId, { nextActionAt: past }), {
      params: Promise.resolve({ id: ownedLeadId }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(new Date(payload.lead.nextActionAt).toISOString()).toBe(past);

    const prisma = getPrismaClient();
    const audit = await prisma.operationAudit.findFirst({
      where: { storeId, entityType: "LEAD", entityId: ownedLeadId, action: "NEXT_ACTION_SET" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
  });

  it("clears the planned action", async () => {
    const response = await setNextAction(request(ownedLeadId, { nextActionAt: null }), {
      params: Promise.resolve({ id: ownedLeadId }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.lead.nextActionAt).toBeNull();
  });

  it("lists only overdue actions for open leads", async () => {
    const prisma = getPrismaClient();
    const past = new Date(Date.now() - 3_600_000);
    await prisma.lead.update({ where: { id: ownedLeadId }, data: { nextActionAt: past } });
    await prisma.lead.update({ where: { id: closedLeadId }, data: { nextActionAt: past } });

    const response = await getLeads(new Request("http://localhost/api/admin/leads?sla=action-overdue"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    const ids = payload.leads.map((lead: { id: string }) => lead.id);
    expect(ids).toContain(ownedLeadId);
    expect(ids).not.toContain(closedLeadId);
    expect(payload.leads.every((lead: { actionOverdue: boolean }) => lead.actionOverdue)).toBe(true);
  });

  it("hides foreign leads from a manager", async () => {
    const response = await setNextAction(request(foreignLeadId, { nextActionAt: null }), {
      params: Promise.resolve({ id: foreignLeadId }),
    });
    expect(response.status).toBe(404);
  });

  it("rejects a foreign origin", async () => {
    const response = await setNextAction(
      request(ownedLeadId, { nextActionAt: null }, "http://evil.example"),
      { params: Promise.resolve({ id: ownedLeadId }) },
    );
    expect(response.status).toBe(403);
  });
});
