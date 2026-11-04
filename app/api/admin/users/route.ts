import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { hashAdminPassword } from "@/lib/admin/password";
import { adminDatabaseError } from "@/lib/admin/http";
import { adminUserCreateSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";
import { writeOperationAudit } from "@/lib/admin/operation-audit";

const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export async function GET() {
  const authorization = await authorizeAdmin("users:read");
  if (!authorization.ok) return authorization.response;
  const users = await getPrismaClient().adminUser.findMany({
    where: { storeId: authorization.actor.storeId },
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: publicUserSelect,
  });
  return jsonResponse({ users });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("users:write");
  if (!authorization.ok) return authorization.response;
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = adminUserCreateSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid employee account", issues: z.treeifyError(parsed.error) }, 400);
  }
  try {
    const { email, password, role } = parsed.data;
    const user = await getPrismaClient().$transaction(async (transaction) => {
      const created = await transaction.adminUser.create({
        data: {
          email,
          role,
          storeId: authorization.actor.storeId,
          passwordHash: await hashAdminPassword(password),
        },
        select: publicUserSelect,
      });
      await writeOperationAudit(transaction, authorization.actor, "ADMIN_USER", created.id, "CREATED", {
        email: created.email,
        role: created.role,
        isActive: created.isActive,
      });
      return created;
    });
    return jsonResponse({ user }, 201);
  } catch (error) {
    return adminDatabaseError(error);
  }
}
