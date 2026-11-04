import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest, roleCan } from "@/lib/admin/auth";
import { storedStoreSettingsSchema, databaseIdSchema } from "@/lib/admin/schemas";
import { adminDatabaseError } from "@/lib/admin/http";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/http/json";
import { storefrontConfigurationSchema } from "@/lib/storefront/config";

export async function DELETE(
  request: Request,
  { params }: RouteContext<"/api/admin/assets/[id]">,
) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("catalog:write");
  const settingsAuthorization = authorization.ok
    ? null
    : await authorizeAdmin("settings:write");
  const actor = authorization.ok
    ? authorization.actor
    : settingsAuthorization?.ok
      ? settingsAuthorization.actor
      : null;
  if (!actor) {
    if (settingsAuthorization && !settingsAuthorization.ok) return settingsAuthorization.response;
    if (!authorization.ok) return authorization.response;
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid asset id" }, 400);

  const prisma = getPrismaClient();
  try {
    const asset = await prisma.storeAsset.findFirst({
      where: { id: parsedId.data, storeId: actor.storeId },
      select: { id: true, type: true },
    });
    if (!asset) return jsonResponse({ error: "Asset not found" }, 404);
    const requiredPermission = asset.type === "PRODUCT_IMAGE" ? "catalog:write" : "settings:write";
    if (!roleCan(actor.role, requiredPermission)) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    await prisma.$transaction(async (transaction) => {
      if (asset.type === "STORE_LOGO") {
        const store = await transaction.store.findUniqueOrThrow({
          where: { id: actor.storeId },
          select: { settings: true },
        });
        const settings = storedStoreSettingsSchema.parse(store.settings);
        if (settings.logoUrl === `/api/store-assets/${asset.id}`) {
          await transaction.store.update({
            where: { id: actor.storeId },
            data: { settings: { ...settings, logoUrl: null } },
          });
        }
      }
      if (asset.type === "STORE_LOGO" || asset.type === "STORE_BANNER") {
        const storefront = await transaction.storefront.findUnique({
          where: { storeId: actor.storeId },
          select: { draft: true, published: true },
        });
        if (storefront) {
          const draft = storefrontConfigurationSchema.parse(storefront.draft);
          const published = storefrontConfigurationSchema.parse(storefront.published);
          const url = `/api/store-assets/${asset.id}`;
          if (
            (asset.type === "STORE_LOGO" &&
              (draft.identity.logoUrl === url || published.identity.logoUrl === url)) ||
            (asset.type === "STORE_BANNER" &&
              (draft.home.bannerAssetId === asset.id || published.home.bannerAssetId === asset.id))
          ) {
            throw new ReferencedStorefrontAssetError();
          }
        }
      }
      await transaction.storeAsset.delete({ where: { id: asset.id } });
    });
    return jsonResponse({ deleted: true });
  } catch (error) {
    if (error instanceof ReferencedStorefrontAssetError) {
      return jsonResponse({ error: "Сначала удалите изображение из черновика и опубликуйте изменения." }, 409);
    }
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Store image settings are invalid" }, 422);
    }
    return adminDatabaseError(error);
  }
}

class ReferencedStorefrontAssetError extends Error {}
