import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getAdminStoreId, isDemoMode } from "@/lib/db/config";
import { getPrismaClient } from "@/lib/db/prisma";
import { mapPersistedProduct, products, type Product } from "@/lib/products";

const publicProductInclude = {
  manufacturer: { select: { name: true, series: true } },
  assets: {
    where: { type: "PRODUCT_IMAGE" as const },
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    select: { id: true },
  },
  optionGroups: {
    where: { isActive: true },
    orderBy: { sortOrder: "asc" as const },
    include: {
      options: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" as const },
      },
    },
  },
} satisfies Prisma.ProductInclude;

async function getPublicStoreId() {
  const scope = getAdminStoreId();
  if (!scope) {
    throw new Error("Production storefront requires DATABASE_URL and DOORFLOW_STORE_ID.");
  }
  const store = await getPrismaClient().store.findUnique({
    where: { id: scope.storeId },
    select: { id: true, isDemo: true },
  });
  if (!store || store.isDemo) {
    throw new Error("Production storefront requires a configured non-demo store.");
  }
  return store.id;
}

export async function getPublicCatalogProducts(): Promise<Product[]> {
  if (isDemoMode()) return products;

  const storeId = await getPublicStoreId();
  const rows = await getPrismaClient().product.findMany({
    where: { storeId, isDemo: false, isActive: true },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    include: publicProductInclude,
  });
  return rows.map(mapPersistedProduct);
}

export async function getPublicProduct(slug: string): Promise<Product | undefined> {
  if (isDemoMode()) return products.find((product) => product.slug === slug);

  const storeId = await getPublicStoreId();
  const row = await getPrismaClient().product.findFirst({
    where: { storeId, slug, isDemo: false, isActive: true },
    include: publicProductInclude,
  });
  return row ? mapPersistedProduct(row) : undefined;
}
