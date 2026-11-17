import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getLead } from "@/app/api/admin/leads/[id]/route";
import { PATCH as assignLead } from "@/app/api/admin/leads/[id]/assign/route";
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

function sessionTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sameOrigin(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://localhost" },
  });
}

integration("lead manager assignment (CRM core)", () => {
  const suffixes = { store: randomUUID(), owner: `owner-${randomUUID()}@test.local` } as Record<string, string>;
  let storeId: string;
  let ownerId: string;
  let managerId: string;
  let subscriberId: string;
  let assignedLeadId: string;
  let foreignLeadId: string;
  let ownerToken: string;
  let managerToken: string;

  async function actAs(role: "owner" | "manager") {
    cookieState.value = role === "owner" ? ownerToken : managerToken;
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
      data: { slug: `assign-test-${suffixes.store.slice(0, 8)}`, name: "Assignment test store", isDemo: false },
    });
    storeId = store.id;
    process.env.DOORFLOW_STORE_ID = storeId;

    const passwordHash = await hashAdminPassword("integration-test-password-1234");
    const [owner, manager, subscriber] = await Promise.all([
      prisma.adminUser.create({ data: { storeId, email: `owner-${suffixes.store.slice(0, 8)}@test.local`, passwordHash, role: "OWNER" } }),
      prisma.adminUser.create({ data: { storeId, email: `manager-${suffixes.store.slice(0, 8)}@test.local`, passwordHash, role: "MANAGER" } }),
      prisma.adminUser.create({ data: { storeId, email: `installer-${suffixes.store.slice(0, 8)}@test.local`, passwordHash, role: "INSTALLER" } }),
    ]);
    ownerId = owner.id;
    managerId = manager.id;
    subscriberId = subscriber.id;

    const leadBase = {
      storeId,
      type: "MEASUREMENT" as const,
      customerName: "Assignment test",
      phone: "+79000000123",
      personalDataConsentAt: new Date(),
      consentNoticeVersion: "test-v1",
    };
    const [assignedLead, foreignLead] = await Promise.all([
      prisma.lead.create({ data: { ...leadBase, idempotencyKey: `assigned-${suffixes.store}` } }),
      prisma.lead.create({ data: { ...leadBase, idempotencyKey: `foreign-${suffixes.store}` } }),
    ]);
    assignedLeadId = assignedLead.id;
    foreignLeadId = foreignLead.id;

    ownerToken = `owner-token-${randomUUID()}`;
    managerToken = `manager-token-${randomUUID()}`;
    await prisma.adminSession.create({
      data: { userId: ownerId, tokenHash: sessionTokenHash(ownerToken), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await prisma.adminSession.create({
      data: { userId: managerId, tokenHash: sessionTokenHash(managerToken), expiresAt: new Date(Date.now() + 3_600_000) },
    });
  });

  afterAll(async () => {
    if (!testDatabaseUrl) return;
    const prisma = getPrismaClient();
    await prisma.store.delete({ where: { id: storeId } }).catch(() => undefined);
    cookieState.value = undefined;
  });

  it("assigns a manager to a lead and records LEAD | ASSIGNED in the audit log", async () => {
    await actAs("owner");
    const request = sameOrigin(`/api/admin/leads/${assignedLeadId}/assign`);
    const body = JSON.stringify({ managerId });
    const response = await assignLead(
      new Request(request.url, { method: "PATCH", headers: Object.fromEntries(request.headers), body }),
      { params: Promise.resolve({ id: assignedLeadId }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.lead.assignedManagerId).toBe(managerId);

    const prisma = getPrismaClient();
    const stored = await prisma.lead.findUniqueOrThrow({ where: { id: assignedLeadId } });
    expect(stored.assignedManagerId).toBe(managerId);

    const audit = await prisma.operationAudit.findFirst({
      where: { storeId, entityType: "LEAD", entityId: assignedLeadId, action: "ASSIGNED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.changes)).toContain(managerId);
  });

  it("rejects assigning an account that is not a manager", async () => {
    await actAs("owner");
    const request = sameOrigin(`/api/admin/leads/${assignedLeadId}/assign`);
    const response = await assignLead(
      new Request(request.url, {
        method: "PATCH",
        headers: Object.fromEntries(request.headers),
        body: JSON.stringify({ managerId: subscriberId }),
      }),
      { params: Promise.resolve({ id: assignedLeadId }) },
    );
    expect(response.status).toBe(422);
  });

  it("lets a manager see only their assigned lead and hides foreign leads", async () => {
    await actAs("manager");
    const listResponse = await getLeads(new Request("http://localhost/api/admin/leads"));
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json();
    expect(list.leads.map((lead: { id: string }) => lead.id)).toEqual([assignedLeadId]);

    const own = await getLead(new Request(`http://localhost/api/admin/leads/${assignedLeadId}`), {
      params: Promise.resolve({ id: assignedLeadId }),
    });
    expect(own.status).toBe(200);

    const foreign = await getLead(new Request(`http://localhost/api/admin/leads/${foreignLeadId}`), {
      params: Promise.resolve({ id: foreignLeadId }),
    });
    expect(foreign.status).toBe(404);
  });

  it("forbids managers from assigning a responsible manager", async () => {
    await actAs("manager");
    const request = sameOrigin(`/api/admin/leads/${assignedLeadId}/assign`);
    const response = await assignLead(
      new Request(request.url, {
        method: "PATCH",
        headers: Object.fromEntries(request.headers),
        body: JSON.stringify({ managerId: null }),
      }),
      { params: Promise.resolve({ id: assignedLeadId }) },
    );
    expect(response.status).toBe(403);
  });
});
