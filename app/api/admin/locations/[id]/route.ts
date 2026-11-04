import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { databaseIdSchema, locationInputSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("settings:write");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid location id" }, 400);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = locationInputSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid store location", issues: z.treeifyError(parsed.error) }, 400);
  }
  try {
    const result = await getPrismaClient().storeLocation.updateMany({
      where: { id: parsedId.data, storeId: authorization.actor.storeId },
      data: parsed.data,
    });
    if (!result.count) return jsonResponse({ error: "Store location not found" }, 404);
    const location = await getPrismaClient().storeLocation.findUnique({ where: { id: parsedId.data } });
    return jsonResponse({ location });
  } catch (error) {
    return adminDatabaseError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("settings:write");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid location id" }, 400);
  const result = await getPrismaClient().storeLocation.updateMany({
    where: { id: parsedId.data, storeId: authorization.actor.storeId },
    data: { isActive: false },
  });
  if (!result.count) return jsonResponse({ error: "Store location not found" }, 404);
  return jsonResponse({ ok: true, isActive: false });
}
