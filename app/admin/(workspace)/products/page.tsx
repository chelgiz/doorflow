import { AdminProducts } from "@/components/admin/admin-products";
import { requireAdminPage } from "@/lib/admin/pages";
import { getPrismaClient } from "@/lib/db/prisma";
import { toSafeMinorUnits } from "@/lib/admin/http";
import { productCategorySchema, productSpecificationsSchema } from "@/lib/admin/schemas";

export default async function AdminProductsPage() {
  const actor = await requireAdminPage("catalog:read");
  const prisma = getPrismaClient();
  const [products, manufacturers] = await Promise.all([
    prisma.product.findMany({
      where: { storeId: actor.storeId, isDemo: false },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      include: {
        manufacturer: { select: { id: true, name: true, series: true } },
        assets: {
          where: { type: "PRODUCT_IMAGE" },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        },
        optionGroups: {
          orderBy: { sortOrder: "asc" },
          include: { options: { orderBy: { sortOrder: "asc" } } },
        },
      },
    }),
    prisma.manufacturer.findMany({
      where: { storeId: actor.storeId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, series: true },
    }),
  ]);
  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Ассортимент</span>
        <h1>Каталог дверей</h1>
        <p>Публикация открывает товар в публичном каталоге. Указывайте только проверенные данные магазина.</p>
      </div>
      <AdminProducts
        initialManufacturers={manufacturers}
        initialProducts={products.map((product) => ({
          id: product.id,
          slug: product.slug,
          model: product.model,
          name: product.name,
          description: product.description,
          category: productCategorySchema.parse(product.category),
          basePriceMinor: toSafeMinorUnits(product.basePriceMinor, "Base price"),
          costMinor: product.costMinor === null
            ? null
            : toSafeMinorUnits(product.costMinor, "Cost price"),
          manufacturerId: product.manufacturerId,
          specifications: productSpecificationsSchema.parse(product.specifications),
          isActive: product.isActive,
          assets: product.assets.map((asset) => ({
            id: asset.id,
            url: `/api/store-assets/${asset.id}`,
          })),
          optionGroups: product.optionGroups.map((group) => ({
            id: group.id,
            key: group.key,
            label: group.label,
            selectionMode: group.selectionMode,
            required: group.required,
            minSelections: group.minSelections,
            maxSelections: group.maxSelections,
            sortOrder: group.sortOrder,
            isActive: group.isActive,
            options: group.options.map((option) => ({
              id: option.id,
              key: option.key,
              label: option.label,
              priceMinor: toSafeMinorUnits(option.priceMinor, "Option price"),
              pricingUnit: option.pricingUnit,
              isActive: option.isActive,
              sortOrder: option.sortOrder,
            })),
          })),
        }))}
      />
    </>
  );
}
