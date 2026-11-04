import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { locationInputSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

export async function GET() {
  const authorization = await authorizeAdmin("settings:read");
  if (!authorization.ok) return authorization.response;
  const locations = await getPrismaClient().storeLocation.findMany({
    where: { storeId: authorization.actor.storeId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return jsonResponse({ locations });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("settings:write");
  if (!authorization.ok) return authorization.response;
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = locationInputSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid store location", issues: z.treeifyError(parsed.error) }, 400);
  }
  try {
    const location = await getPrismaClient().storeLocation.create({
      data: { ...parsed.data, storeId: authorization.actor.storeId },
    });
    return jsonResponse({ location }, 201);
  } catch (error) {
    return adminDatabaseError(error);
  }
}
