import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { normalizeUploadedImage } from "@/lib/assets/image";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { databaseIdSchema, storedStoreSettingsSchema } from "@/lib/admin/schemas";
import { adminDatabaseError } from "@/lib/admin/http";
import { getPrismaClient } from "@/lib/db/prisma";
import { readBoundedBinaryRequest } from "@/lib/http/bounded-body";
import { jsonResponse } from "@/lib/http/json";

const maximumImagesPerProduct = 12;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const url = new URL(request.url);
  const assetTarget = url.searchParams.get("type");
  const isLegacyLogo = assetTarget === "logo";
  const isStorefrontLogo = assetTarget === "storefront-logo";
  const isStorefrontBanner = assetTarget === "storefront-banner";
  const isProductImage = assetTarget === null && Boolean(url.searchParams.get("productId"));
  const productId = url.searchParams.get("productId");
  if (
    (!isLegacyLogo && !isStorefrontLogo && !isStorefrontBanner && !isProductImage) ||
    (isProductImage !== Boolean(productId)) ||
    (productId && !databaseIdSchema.safeParse(productId).success)
  ) {
    return jsonResponse({ error: "Choose one valid asset target" }, 400);
  }
  const isStorefrontAsset = isStorefrontLogo || isStorefrontBanner;
  const authorization = await authorizeAdmin(
    isLegacyLogo || isStorefrontAsset ? "settings:write" : "catalog:write",
  );
  if (!authorization.ok) return authorization.response;

  const body = await readBoundedBinaryRequest(request, 5 * 1024 * 1024);
  if (!body.ok) return body.response;
  const image = await normalizeUploadedImage(
    body.bytes,
    request.headers.get("content-type") ?? "",
  );
  if (!image) {
    return jsonResponse({
      error: "Upload a valid single-frame JPEG, PNG, or WebP image within the size limits",
    }, 415);
  }

  const prisma = getPrismaClient();
  try {
    if (isProductImage) {
      if (!productId) return jsonResponse({ error: "Product id is required" }, 400);
      const product = await prisma.product.findFirst({
        where: {
          id: productId,
          storeId: authorization.actor.storeId,
          isDemo: false,
        },
        select: { id: true },
      });
      if (!product) return jsonResponse({ error: "Product not found" }, 404);
      const existingCount = await prisma.storeAsset.count({
        where: { storeId: authorization.actor.storeId, productId, type: "PRODUCT_IMAGE" },
      });
      if (existingCount >= maximumImagesPerProduct) {
        return jsonResponse({ error: "A product may have at most 12 images" }, 422);
      }
      const asset = await prisma.storeAsset.create({
        data: {
          storeId: authorization.actor.storeId,
          productId,
          type: "PRODUCT_IMAGE",
          contentType: image.contentType,
          byteSize: image.byteSize,
          sha256: image.sha256,
          data: image.data,
          sortOrder: existingCount,
        },
        select: { id: true, type: true, contentType: true, byteSize: true },
      });
      return jsonResponse({
        asset: { ...asset, url: `/api/store-assets/${asset.id}` },
      }, 201);
    }

    if (isStorefrontAsset) {
      const asset = await prisma.storeAsset.create({
        data: {
          storeId: authorization.actor.storeId,
          type: isStorefrontLogo ? "STORE_LOGO" : "STORE_BANNER",
          contentType: image.contentType,
          byteSize: image.byteSize,
          sha256: image.sha256,
          data: image.data,
        },
        select: { id: true, type: true, contentType: true, byteSize: true },
      });
      return jsonResponse({
        asset: { ...asset, url: `/api/store-assets/${asset.id}` },
      }, 201);
    }

    const asset = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.storeAsset.create({
        data: {
          storeId: authorization.actor.storeId,
          type: "STORE_LOGO",
          contentType: image.contentType,
          byteSize: image.byteSize,
          sha256: image.sha256,
          data: image.data,
        },
        select: { id: true, type: true, contentType: true, byteSize: true },
      });
      const store = await transaction.store.findUniqueOrThrow({
        where: { id: authorization.actor.storeId },
        select: { settings: true },
      });
      const settings = storedStoreSettingsSchema.parse(store.settings);
      await transaction.store.update({
        where: { id: authorization.actor.storeId },
        data: {
          settings: {
            ...settings,
            logoUrl: `/api/store-assets/${saved.id}`,
          } satisfies Prisma.InputJsonValue,
        },
      });
      return saved;
    });
    return jsonResponse({
      asset: { ...asset, url: `/api/store-assets/${asset.id}` },
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "Store image settings are invalid" }, 422);
    }
    return adminDatabaseError(error);
  }
}
