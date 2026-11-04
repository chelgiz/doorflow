import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { databaseIdSchema, manufacturerInputSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("catalog:write");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid manufacturer id" }, 400);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = manufacturerInputSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid manufacturer", issues: z.treeifyError(parsed.error) }, 400);
  }
  try {
    const existing = await getPrismaClient().manufacturer.findFirst({
      where: { id: parsedId.data, storeId: authorization.actor.storeId },
      select: { id: true },
    });
    if (!existing) return jsonResponse({ error: "Manufacturer not found" }, 404);
    const manufacturer = await getPrismaClient().manufacturer.update({
      where: { id: existing.id },
      data: parsed.data,
    });
    return jsonResponse({ manufacturer });
  } catch (error) {
    return adminDatabaseError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("catalog:write");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid manufacturer id" }, 400);
  try {
    const existing = await getPrismaClient().manufacturer.findFirst({
      where: { id: parsedId.data, storeId: authorization.actor.storeId },
      select: { id: true },
    });
    if (!existing) return jsonResponse({ error: "Manufacturer not found" }, 404);
    await getPrismaClient().manufacturer.delete({ where: { id: existing.id } });
    return jsonResponse({ ok: true });
  } catch (error) {
    return adminDatabaseError(error);
  }
}
