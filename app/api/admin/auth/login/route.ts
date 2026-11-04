import { z } from "zod";
import {
  clearLoginFailures,
  createAdminSession,
  isLoginBlocked,
  isSameOriginRequest,
  recordLoginFailure,
} from "@/lib/admin/auth";
import { hashAdminPassword, verifyAdminPassword } from "@/lib/admin/password";
import { getAdminStoreId } from "@/lib/db/config";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

const dummyPasswordHash = hashAdminPassword("doorflow-invalid-account-password");

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128),
}).strict();

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "Origin is not allowed" }, 403);
  }
  const storeScope = getAdminStoreId();
  if (!storeScope) return jsonResponse({ error: "Admin store is not configured" }, 503);

  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = loginSchema.safeParse(body.body);
  if (!parsed.success) return jsonResponse({ error: "Invalid credentials" }, 400);

  const prisma = getPrismaClient();
  const store = await prisma.store.findUnique({
    where: { id: storeScope.storeId },
    select: { isDemo: true },
  });
  if (!store || store.isDemo) {
    return jsonResponse({ error: "Admin store is not available" }, 503);
  }
  if (await isLoginBlocked(storeScope.storeId, parsed.data.email)) {
    return jsonResponse({ error: "Too many sign-in attempts. Try again later." }, 429);
  }
  const user = await prisma.adminUser.findFirst({
    where: { storeId: storeScope.storeId, email: parsed.data.email },
  });
  if (!user || !user.isActive) {
    await verifyAdminPassword(await dummyPasswordHash, parsed.data.password);
    const blocked = await recordLoginFailure(storeScope.storeId, parsed.data.email);
    if (blocked) {
      return jsonResponse({ error: "Too many sign-in attempts. Try again later." }, 429);
    }
    return jsonResponse({ error: "Invalid email or password" }, 401);
  }

  const passwordMatches = await verifyAdminPassword(user.passwordHash, parsed.data.password);
  if (!passwordMatches) {
    const blocked = await recordLoginFailure(storeScope.storeId, parsed.data.email);
    if (blocked) {
      return jsonResponse({ error: "Too many sign-in attempts. Try again later." }, 429);
    }
    return jsonResponse({ error: "Invalid email or password" }, 401);
  }

  await clearLoginFailures(storeScope.storeId, parsed.data.email);
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await createAdminSession(user.id);
  return jsonResponse({
    user: { id: user.id, email: user.email, role: user.role },
  });
}
