import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { hashAdminPassword } from "@/lib/admin/password";
import { adminDatabaseError } from "@/lib/admin/http";
import { adminUserUpdateSchema, databaseIdSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";
import { writeOperationAudit } from "@/lib/admin/operation-audit";

type RouteContext = { params: Promise<{ id: string }> };
const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export async function PUT(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("users:write");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid user id" }, 400);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = adminUserUpdateSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid employee account", issues: z.treeifyError(parsed.error) }, 400);
  }

  const prisma = getPrismaClient();
  try {
    const user = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.adminUser.findFirst({
        where: {
          id: parsedId.data,
          storeId: authorization.actor.storeId,
          role: { not: "OWNER" },
        },
        select: { id: true, role: true, isActive: true },
      });
      if (!existing) return null;
      const updated = await transaction.adminUser.update({
        where: { id: existing.id },
        data: {
          role: parsed.data.role,
          isActive: parsed.data.isActive,
          ...(parsed.data.password
            ? { passwordHash: await hashAdminPassword(parsed.data.password) }
            : {}),
        },
        select: publicUserSelect,
      });
      if (!parsed.data.isActive || parsed.data.password) {
        await transaction.adminSession.deleteMany({ where: { userId: existing.id } });
      }
      await writeOperationAudit(transaction, authorization.actor, "ADMIN_USER", existing.id, "UPDATED", {
        role: { from: existing.role, to: updated.role },
        isActive: { from: existing.isActive, to: updated.isActive },
        passwordChanged: Boolean(parsed.data.password),
      });
      return updated;
    });
    if (!user) return jsonResponse({ error: "Employee account not found" }, 404);
    return jsonResponse({ user });
  } catch (error) {
    return adminDatabaseError(error);
  }
}
