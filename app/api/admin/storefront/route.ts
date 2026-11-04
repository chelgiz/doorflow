import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  getStorefrontForAdmin,
  saveStorefrontDraft,
  validateStorefrontReferences,
} from "@/lib/storefront/data";
import { storefrontConfigurationSchema } from "@/lib/storefront/config";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

export async function GET() {
  const authorization = await authorizeAdmin("settings:read");
  if (!authorization.ok) return authorization.response;
  const storefront = await getStorefrontForAdmin(authorization.actor.storeId);
  if (!storefront) return jsonResponse({ error: "Store not found" }, 404);
  return jsonResponse(storefront);
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("settings:write");
  if (!authorization.ok) return authorization.response;
  const body = await readJsonRequest(request, 32_000);
  if (!body.ok) return body.response;
  const parsed = storefrontConfigurationSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({
      error: "Проверьте поля витрины.",
      issues: z.treeifyError(parsed.error),
    }, 400);
  }

  const prisma = getPrismaClient();
  const current = await getStorefrontForAdmin(authorization.actor.storeId);
  if (!current) return jsonResponse({ error: "Store not found" }, 404);
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const referenceError = await validateStorefrontReferences(
        transaction,
        authorization.actor.storeId,
        parsed.data,
      );
      if (referenceError) return { error: referenceError } as const;
      const saved = await saveStorefrontDraft(
        transaction,
        authorization.actor.storeId,
        parsed.data,
        current.published,
      );
      return { updatedAt: saved.updatedAt } as const;
    });
    if ("error" in result) return jsonResponse({ error: result.error }, 422);
    return jsonResponse({ draft: parsed.data, updatedAt: result.updatedAt });
  } catch (error) {
    return adminDatabaseError(error);
  }
}
