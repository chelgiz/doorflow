import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
const DAY = 86_400_000;

integration("follow-up due filter", () => {
  const suffix = randomUUID().slice(0, 8);
  let storeId: string;
  let dueId: string;
  let changedId: string;
  let closedId: string;
  let plannedId: string;

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
      data: { slug: `followup-test-${suffix}`, name: "Follow-up test store", isDemo: false },
    });
    storeId = store.id;
    process.env.DOORFLOW_STORE_ID = storeId;

    const passwordHash = await hashAdminPassword("integration-test-password-1234");
    const owner = await prisma.adminUser.create({
      data: { storeId, email: `owner-${suffix}@test.local`, passwordHash, role: "OWNER" },
    });

    const fourDaysAgo = new Date(Date.now() - 4 * DAY);
    const base = {
      storeId,
      type: "MEASUREMENT" as const,
      customerName: "Follow-up test",
      phone: "+79000000555",
      personalDataConsentAt: fourDaysAgo,
      consentNoticeVersion: "test-v1",
      firstContactAt: fourDaysAgo,
    };
    const [due, changed, closed, planned] = await Promise.all([
      prisma.lead.create({
        data: { ...base, idempotencyKey: `followup-due-${suffix}`, status: "IN_PROGRESS" },
      }),
      prisma.lead.create({
        data: { ...base, idempotencyKey: `followup-changed-${suffix}`, status: "IN_PROGRESS" },
      }),
      prisma.lead.create({
        data: { ...base, idempotencyKey: `followup-closed-${suffix}`, status: "SALE" },
      }),
      prisma.lead.create({
        data: {
          ...base,
          idempotencyKey: `followup-planned-${suffix}`,
          status: "IN_PROGRESS",
          nextActionAt: new Date(Date.now() + DAY),
        },
      }),
    ]);
    dueId = due.id;
    changedId = changed.id;
    closedId = closed.id;
    plannedId = planned.id;

    // The changed lead progressed after the first contact.
    await prisma.leadStatusHistory.create({
      data: {
        leadId: changedId,
        from: "NEW",
        to: "IN_PROGRESS",
        changedAt: new Date(Date.now() - DAY),
        changedById: owner.id,
      },
    });

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

  it("lists only leads that are due for a repeat touch", async () => {
    const response = await getLeads(new Request("http://localhost/api/admin/leads?sla=follow-up-due"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    const ids = payload.leads.map((lead: { id: string }) => lead.id);
    expect(ids).toContain(dueId);
    expect(ids).not.toContain(changedId);
    expect(ids).not.toContain(closedId);
    expect(ids).not.toContain(plannedId);
    expect(payload.leads.every((lead: { followUpDue: boolean }) => lead.followUpDue)).toBe(true);
    expect(payload.total).toBe(payload.leads.length);
  });

  it("exposes the flag on the regular list too", async () => {
    const response = await getLeads(new Request("http://localhost/api/admin/leads"));
    const payload = await response.json();
    const byId = new Map(payload.leads.map((lead: { id: string; followUpDue: boolean }) => [lead.id, lead.followUpDue]));
    expect(byId.get(dueId)).toBe(true);
    expect(byId.get(changedId)).toBe(false);
    expect(byId.get(closedId)).toBe(false);
    expect(byId.get(plannedId)).toBe(false);
  });
});
