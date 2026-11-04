import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { manufacturerInputSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

export async function GET() {
  const authorization = await authorizeAdmin("catalog:read");
  if (!authorization.ok) return authorization.response;
  const manufacturers = await getPrismaClient().manufacturer.findMany({
    where: { storeId: authorization.actor.storeId },
    orderBy: { name: "asc" },
  });
  return jsonResponse({ manufacturers });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("catalog:write");
  if (!authorization.ok) return authorization.response;
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = manufacturerInputSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid manufacturer", issues: z.treeifyError(parsed.error) }, 400);
  }
  try {
    const manufacturer = await getPrismaClient().manufacturer.create({
      data: { ...parsed.data, storeId: authorization.actor.storeId },
    });
    return jsonResponse({ manufacturer }, 201);
  } catch (error) {
    return adminDatabaseError(error);
  }
}
