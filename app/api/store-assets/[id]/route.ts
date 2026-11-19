import { authorizeAdmin } from "@/lib/admin/auth";
import { databaseIdSchema } from "@/lib/admin/schemas";
import { getAdminStoreId } from "@/lib/db/config";
import { getPrismaClient } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { storefrontConfigurationSchema } from "@/lib/storefront/config";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/store-assets/[id]">,
) {
  const scope = getAdminStoreId();
  if (!scope) return new Response(null, { status: 404 });
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return new Response(null, { status: 404 });

  const prisma = getPrismaClient();
  const storefront = await prisma.storefront.findUnique({
    where: { storeId: scope.storeId },
    select: { published: true },
  });
  const publishedConfiguration = storefront
    ? storefrontConfigurationSchema.parse(storefront.published)
    : null;
  const publicAssetConditions: Prisma.StoreAssetWhereInput[] = [
    { type: "PRODUCT_IMAGE", product: { isActive: true, isDemo: false } },
  ];
  const logoUrl = publishedConfiguration?.identity.logoUrl;
  const logoId = typeof logoUrl === "string"
    ? logoUrl.match(/^\/api\/store-assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1]
    : null;
  const publicLogoIds = logoId ? [logoId] : [];
  if (publicLogoIds.length > 0) {
    publicAssetConditions.push({ type: "STORE_LOGO", id: { in: publicLogoIds } });
  }
  if (publishedConfiguration?.home.bannerAssetId) {
    publicAssetConditions.push({
      type: "STORE_BANNER",
      id: publishedConfiguration.home.bannerAssetId,
    });
  }
  const galleryIds = publishedConfiguration?.gallery.map((item) => item.assetId) ?? [];
  if (galleryIds.length > 0) {
    publicAssetConditions.push({ type: "GALLERY_IMAGE", id: { in: galleryIds } });
  }
  const publicAsset = await prisma.storeAsset.findFirst({
    where: {
      id: parsedId.data,
      storeId: scope.storeId,
      store: { isDemo: false },
      OR: publicAssetConditions,
    },
    select: { data: true, contentType: true, byteSize: true },
  });
  let asset = publicAsset;
  let isPrivate = false;
  if (!asset) {
    const adminAsset = await prisma.storeAsset.findFirst({
      where: { id: parsedId.data, storeId: scope.storeId },
      select: { type: true, data: true, contentType: true, byteSize: true },
    });
    if (!adminAsset) return new Response(null, { status: 404 });
    const authorization = await authorizeAdmin(
      adminAsset.type === "PRODUCT_IMAGE" ? "catalog:read" : "settings:read",
    );
    if (!authorization.ok) return new Response(null, { status: 404 });
    asset = adminAsset;
    isPrivate = true;
  }

  return new Response(asset.data, {
    headers: {
      "Content-Type": asset.contentType,
      "Content-Length": String(asset.byteSize),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": isPrivate ? "private, no-store" : "public, max-age=86400, immutable",
    },
  });
}
