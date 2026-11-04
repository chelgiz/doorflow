import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError, serializeProduct } from "@/lib/admin/http";
import { productInputSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

const productInclude = {
  manufacturer: { select: { id: true, name: true, series: true } },
  assets: {
    where: { type: "PRODUCT_IMAGE" as const },
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    select: { id: true, contentType: true, byteSize: true },
  },
  optionGroups: {
    orderBy: { sortOrder: "asc" as const },
    include: { options: { orderBy: { sortOrder: "asc" as const } } },
  },
};

export async function GET() {
  const authorization = await authorizeAdmin("catalog:read");
  if (!authorization.ok) return authorization.response;

  const products = await getPrismaClient().product.findMany({
    where: { storeId: authorization.actor.storeId, isDemo: false },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    include: productInclude,
  });
  return jsonResponse({ products: products.map(serializeProduct) });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("catalog:write");
  if (!authorization.ok) return authorization.response;

  const body = await readJsonRequest(request, 128_000);
  if (!body.ok) return body.response;
  const parsed = productInputSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid product", issues: z.treeifyError(parsed.error) }, 400);
  }

  const { optionGroups, ...input } = parsed.data;
  const prisma = getPrismaClient();
  try {
    if (input.manufacturerId) {
      const manufacturer = await prisma.manufacturer.findFirst({
        where: { id: input.manufacturerId, storeId: authorization.actor.storeId },
        select: { id: true },
      });
      if (!manufacturer) return jsonResponse({ error: "Manufacturer not found" }, 422);
    }

    const productId = await prisma.$transaction(async (transaction) => {
      const created = await transaction.product.create({
        data: {
          ...input,
          storeId: authorization.actor.storeId,
          currency: "RUB",
          basePriceMinor: BigInt(input.basePriceMinor),
          costMinor: input.costMinor === null ? null : BigInt(input.costMinor),
          specifications: input.specifications,
          isDemo: false,
        },
        select: { id: true },
      });
      for (const group of optionGroups) {
        const createdGroup = await transaction.productOptionGroup.create({
          data: {
            productId: created.id,
            key: group.key,
            label: group.label,
            selectionMode: group.selectionMode,
            required: group.required,
            minSelections: group.minSelections,
            maxSelections: group.maxSelections,
            sortOrder: group.sortOrder,
            isActive: group.isActive,
          },
          select: { id: true },
        });
        if (group.options.length > 0) {
          await transaction.productOption.createMany({
            data: group.options.map((option) => ({
              ...option,
              groupId: createdGroup.id,
              priceMinor: BigInt(option.priceMinor),
            })),
          });
        }
      }
      return created.id;
    });
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: productInclude,
    });
    return jsonResponse({ product: serializeProduct(product) }, 201);
  } catch (error) {
    return adminDatabaseError(error);
  }
}
