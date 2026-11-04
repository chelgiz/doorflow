import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { storeSettingsInputSchema, storedStoreSettingsSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

export async function GET() {
  const authorization = await authorizeAdmin("settings:read");
  if (!authorization.ok) return authorization.response;
  const store = await getPrismaClient().store.findUnique({
    where: { id: authorization.actor.storeId },
    select: { id: true, name: true, slug: true, settings: true, updatedAt: true },
  });
  if (!store) return jsonResponse({ error: "Store not found" }, 404);
  const settings = storedStoreSettingsSchema.parse(store.settings);
  return jsonResponse({
    settings: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      contactPhone: settings.contactPhone ?? null,
      contactEmail: settings.contactEmail ?? null,
      logoUrl: settings.logoUrl ?? null,
      updatedAt: store.updatedAt,
    },
  });
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("settings:write");
  if (!authorization.ok) return authorization.response;
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = storeSettingsInputSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid store settings", issues: z.treeifyError(parsed.error) }, 400);
  }
  const current = await getPrismaClient().store.findUnique({
    where: { id: authorization.actor.storeId },
    select: { settings: true },
  });
  if (!current) return jsonResponse({ error: "Store not found" }, 404);
  const currentSettings = storedStoreSettingsSchema.parse(current.settings);
  const store = await getPrismaClient().store.update({
    where: { id: authorization.actor.storeId },
    data: {
      name: parsed.data.name,
      settings: { ...currentSettings, ...parsed.data },
    },
    select: { id: true, name: true, slug: true, settings: true, updatedAt: true },
  });
  const settings = storedStoreSettingsSchema.parse(store.settings);
  return jsonResponse({
    settings: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      contactPhone: settings.contactPhone ?? null,
      contactEmail: settings.contactEmail ?? null,
      logoUrl: settings.logoUrl ?? null,
      updatedAt: store.updatedAt,
    },
  });
}
