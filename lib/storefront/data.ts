import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getAdminStoreId, isDemoMode } from "@/lib/db/config";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  createStorefrontConfiguration,
  defaultStorefrontConfiguration,
  storefrontConfigurationSchema,
  type StorefrontConfiguration,
} from "@/lib/storefront/config";

type StorefrontTransaction = Prisma.TransactionClient;

export async function getStorefrontForAdmin(storeId: string) {
  const store = await getPrismaClient().store.findUnique({
    where: { id: storeId },
    select: {
      name: true,
      settings: true,
      storefront: { select: { draft: true, published: true, publishedAt: true } },
      locations: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, address: true, phone: true, businessHours: true },
      },
    },
  });
  if (!store) return null;

  const legacyConfiguration = createStorefrontConfiguration(store, store.locations);
  return {
    draft: storefrontConfigurationSchema.parse(store.storefront?.draft ?? legacyConfiguration),
    published: storefrontConfigurationSchema.parse(store.storefront?.published ?? legacyConfiguration),
    publishedAt: store.storefront?.publishedAt ?? null,
  };
}

export async function getPublicStorefront(): Promise<StorefrontConfiguration | null> {
  if (isDemoMode()) return null;
  const scope = getAdminStoreId();
  if (!scope) throw new Error("Production storefront requires a configured store.");

  return getPublishedStorefront(scope.storeId);
}

export function storefrontCacheTag(storeId: string) {
  return `storefront:${storeId}`;
}

async function getPublishedStorefront(storeId: string): Promise<StorefrontConfiguration> {
  "use cache";
  cacheLife("max");
  cacheTag(storefrontCacheTag(storeId));
  const store = await getPrismaClient().store.findFirst({
    where: { id: storeId, isDemo: false },
    select: {
      storefront: { select: { published: true } },
    },
  });
  if (!store) throw new Error("Configured storefront was not found.");

  return storefrontConfigurationSchema.parse(store.storefront?.published ?? defaultStorefrontConfiguration);
}

export async function validateStorefrontReferences(
  transaction: StorefrontTransaction,
  storeId: string,
  configuration: StorefrontConfiguration,
) {
  const locationIds = configuration.identity.locations.flatMap((location) =>
    location.id ? [location.id] : [],
  );
  const uniqueLocationIds = new Set(locationIds);
  if (uniqueLocationIds.size !== locationIds.length) {
    return "Торговые точки содержат повторяющиеся записи.";
  }
  if (locationIds.length > 0) {
    const ownedLocations = await transaction.storeLocation.findMany({
      where: { storeId, id: { in: locationIds } },
      select: { id: true },
    });
    if (ownedLocations.length !== locationIds.length) {
      return "Одна из торговых точек не принадлежит этому магазину.";
    }
  }

  const logoAssetId = configuration.identity.logoUrl?.match(
    /^\/api\/store-assets\/([0-9a-f-]{36})$/i,
  )?.[1];
  if (logoAssetId) {
    const asset = await transaction.storeAsset.findFirst({
      where: { id: logoAssetId, storeId, type: "STORE_LOGO" },
      select: { id: true },
    });
    if (!asset) return "Файл логотипа не принадлежит этому магазину.";
  }
  if (configuration.home.bannerAssetId) {
    const asset = await transaction.storeAsset.findFirst({
      where: {
        id: configuration.home.bannerAssetId,
        storeId,
        type: "STORE_BANNER",
      },
      select: { id: true },
    });
    if (!asset) return "Изображение баннера не принадлежит этому магазину.";
  }
  return null;
}

export async function saveStorefrontDraft(
  transaction: StorefrontTransaction,
  storeId: string,
  configuration: StorefrontConfiguration,
  initialPublished: StorefrontConfiguration,
) {
  return transaction.storefront.upsert({
    where: { storeId },
    create: {
      storeId,
      draft: configuration as Prisma.InputJsonValue,
      published: initialPublished as Prisma.InputJsonValue,
    },
    update: { draft: configuration as Prisma.InputJsonValue },
    select: { updatedAt: true },
  });
}

export async function publishStorefront(
  transaction: StorefrontTransaction,
  storeId: string,
  configuration: StorefrontConfiguration,
) {
  const existingLocations = await transaction.storeLocation.findMany({
    where: { storeId },
    select: { id: true },
  });
  const retainedIds = configuration.identity.locations.flatMap((location) =>
    location.id ? [location.id] : [],
  );
  const removedIds = existingLocations
    .map(({ id }) => id)
    .filter((id) => !retainedIds.includes(id));
  if (removedIds.length > 0) {
    await transaction.storeLocation.updateMany({
      where: { storeId, id: { in: removedIds }, isActive: true },
      data: { isActive: false },
    });
  }

  const publishedLocations: StorefrontConfiguration["identity"]["locations"] = [];
  for (const location of configuration.identity.locations) {
    if (location.id) {
      const result = await transaction.storeLocation.updateMany({
        where: { id: location.id, storeId },
        data: {
          name: location.name,
          address: location.address,
          phone: location.phone,
          businessHours: location.businessHours,
          isActive: true,
        },
      });
      if (result.count !== 1) throw new Error("Storefront location ownership changed during publication.");
      publishedLocations.push(location);
    } else {
      const created = await transaction.storeLocation.create({
        data: {
          storeId,
          name: location.name,
          address: location.address,
          phone: location.phone,
          businessHours: location.businessHours,
          isActive: true,
        },
        select: { id: true },
      });
      publishedLocations.push({ ...location, id: created.id });
    }
  }

  const published = storefrontConfigurationSchema.parse({
    ...configuration,
    identity: { ...configuration.identity, locations: publishedLocations },
  });
  const now = new Date();
  await transaction.storefront.upsert({
    where: { storeId },
    create: {
      storeId,
      draft: published as Prisma.InputJsonValue,
      published: published as Prisma.InputJsonValue,
      publishedAt: now,
    },
    update: {
      draft: published as Prisma.InputJsonValue,
      published: published as Prisma.InputJsonValue,
      publishedAt: now,
    },
  });
  return published;
}
