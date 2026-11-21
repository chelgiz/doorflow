import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getAdminStoreId } from "@/lib/db/config";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/http/json";
import type { AdminRole } from "@/generated/prisma/client";

const sessionCookieName = "doorflow_admin_session";
const sessionDurationMs = 1000 * 60 * 60 * 12;
const loginWindowMs = 15 * 60 * 1000;
const loginMaxAttempts = 5;

export type AdminPermission =
  | "catalog:read"
  | "catalog:write"
  | "leads:read"
  | "leads:write"
  | "leads:assign"
  | "settings:read"
  | "settings:write"
  | "users:read"
  | "users:write"
  | "operations:read"
  | "operations:write"
  | "measurements:own"
  | "installations:own";

export type AdminActor = {
  userId: string;
  storeId: string;
  email: string;
  role: AdminRole;
};

const rolePermissions: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  OWNER: new Set([
    "catalog:read",
    "catalog:write",
    "leads:read",
    "leads:write",
    "leads:assign",
    "settings:read",
    "settings:write",
    "users:read",
    "users:write",
    "operations:read",
    "operations:write",
  ]),
  ADMIN: new Set([
    "catalog:read",
    "catalog:write",
    "leads:read",
    "leads:write",
    "leads:assign",
    "settings:read",
    "settings:write",
    "operations:read",
    "operations:write",
  ]),
  MANAGER: new Set([
    "catalog:read",
    "leads:read",
    "leads:write",
    "operations:read",
    "operations:write",
  ]),
  MEASURER: new Set(["measurements:own"]),
  INSTALLER: new Set(["installations:own"]),
};

/**
 * A MANAGER sees only leads assigned to them; OWNER/ADMIN see the whole store.
 * Returns a Prisma filter fragment to merge into lead queries.
 */
export function leadVisibilityFilter(actor: AdminActor) {
  return actor.role === "MANAGER" ? { assignedManagerId: actor.userId } : {};
}

export function roleCan(role: AdminRole, permission: AdminPermission) {
  return rolePermissions[role].has(permission);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashLoginSubject(storeId: string, email: string) {
  return createHash("sha256").update(`${storeId}:${email}`).digest("hex");
}

export async function isLoginBlocked(storeId: string, email: string) {
  const attempt = await getPrismaClient().adminLoginAttempt.findUnique({
    where: { storeId_subjectHash: { storeId, subjectHash: hashLoginSubject(storeId, email) } },
    select: { blockedUntil: true },
  });
  return Boolean(attempt?.blockedUntil && attempt.blockedUntil > new Date());
}

export async function recordLoginFailure(storeId: string, email: string) {
  const subjectHash = hashLoginSubject(storeId, email);
  const now = new Date();
  const resetBefore = new Date(now.getTime() - loginWindowMs);
  const blockedUntil = new Date(now.getTime() + loginWindowMs);
  const [updated] = await getPrismaClient().$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "AdminLoginAttempt"
      ("id", "storeId", "subjectHash", "attempts", "windowStartedAt", "updatedAt")
    VALUES
      (${randomUUID()}::uuid, ${storeId}::uuid, ${subjectHash}, 1, ${now}, ${now})
    ON CONFLICT ("storeId", "subjectHash")
    DO UPDATE SET
      "attempts" = CASE
        WHEN "AdminLoginAttempt"."windowStartedAt" <= ${resetBefore} THEN 1
        ELSE "AdminLoginAttempt"."attempts" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "AdminLoginAttempt"."windowStartedAt" <= ${resetBefore} THEN ${now}
        ELSE "AdminLoginAttempt"."windowStartedAt"
      END,
      "blockedUntil" = CASE
        WHEN (
          CASE
            WHEN "AdminLoginAttempt"."windowStartedAt" <= ${resetBefore} THEN 1
            ELSE "AdminLoginAttempt"."attempts" + 1
          END
        ) >= ${loginMaxAttempts}
          THEN ${blockedUntil}::timestamptz
        ELSE NULL
      END,
      "updatedAt" = ${now}
    RETURNING "attempts"
  `;
  return updated.attempts >= loginMaxAttempts;
}

export async function clearLoginFailures(storeId: string, email: string) {
  await getPrismaClient().adminLoginAttempt.deleteMany({
    where: { storeId, subjectHash: hashLoginSubject(storeId, email) },
  });
}

export async function createAdminSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  await getPrismaClient().adminSession.create({
    data: { userId, tokenHash: hashSessionToken(token), expiresAt },
  });
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function revokeAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (token) {
    await getPrismaClient().adminSession.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }
  cookieStore.delete(sessionCookieName);
}

export async function getCurrentAdmin(): Promise<AdminActor | null> {
  const storeScope = getAdminStoreId();
  if (!storeScope) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  const session = await getPrismaClient().adminSession.findFirst({
    where: {
      tokenHash: hashSessionToken(token),
      expiresAt: { gt: new Date() },
      user: { storeId: storeScope.storeId, isActive: true, store: { isDemo: false } },
    },
    select: {
      user: { select: { id: true, storeId: true, email: true, role: true } },
    },
  });
  if (!session) {
    cookieStore.delete(sessionCookieName);
    return null;
  }

  return {
    userId: session.user.id,
    storeId: session.user.storeId,
    email: session.user.email,
    role: session.user.role,
  };
}

export async function authorizeAdmin(permission: AdminPermission) {
  if (!getAdminStoreId()) {
    return {
      ok: false as const,
      response: jsonResponse({ error: "Admin store is not configured" }, 503),
    };
  }
  const actor = await getCurrentAdmin();
  if (!actor) {
    return { ok: false as const, response: jsonResponse({ error: "Authentication required" }, 401) };
  }
  if (!roleCan(actor.role, permission)) {
    return { ok: false as const, response: jsonResponse({ error: "Forbidden" }, 403) };
  }

  return { ok: true as const, actor };
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  // Behind the reverse proxy (`next start` binds to loopback), `request.url`
  // carries the internal address, so the public host and scheme come from the
  // headers the proxy overwrites for every request.
  const host = firstHeaderValue(request.headers.get("host"))
    ?? firstHeaderValue(request.headers.get("x-forwarded-host"));
  if (host) {
    const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto"))
      ?? new URL(request.url).protocol.slice(0, -1);
    return originUrl.host === host && originUrl.protocol === `${protocol}:`;
  }

  try {
    return originUrl.origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function firstHeaderValue(value: string | null) {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}
