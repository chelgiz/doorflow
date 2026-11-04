import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError, serializeProduct } from "@/lib/admin/http";
import { databaseIdSchema, productInputSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };
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

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await authorizeAdmin("catalog:read");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid product id" }, 400);
  const product = await getPrismaClient().product.findFirst({
    where: { id: parsedId.data, storeId: authorization.actor.storeId, isDemo: false },
    include: productInclude,
  });
  if (!product) return jsonResponse({ error: "Product not found" }, 404);
  return jsonResponse({ product: serializeProduct(product) });
}

export async function PUT(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("catalog:write");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid product id" }, 400);
  const body = await readJsonRequest(request, 128_000);
  if (!body.ok) return body.response;
  const parsed = productInputSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid product", issues: z.treeifyError(parsed.error) }, 400);
  }

  const { optionGroups, ...input } = parsed.data;
  const prisma = getPrismaClient();
  try {
    const product = await prisma.$transaction(async (transaction) => {
      const current = await transaction.product.findFirst({
        where: { id: parsedId.data, storeId: authorization.actor.storeId, isDemo: false },
        select: { id: true },
      });
      if (!current) return null;
      if (input.manufacturerId) {
        const manufacturer = await transaction.manufacturer.findFirst({
          where: { id: input.manufacturerId, storeId: authorization.actor.storeId },
          select: { id: true },
        });
        if (!manufacturer) return null;
      }

      const updated = await transaction.product.update({
        where: { id: current.id },
        data: {
          ...input,
          basePriceMinor: BigInt(input.basePriceMinor),
          costMinor: input.costMinor === null ? null : BigInt(input.costMinor),
          specifications: input.specifications,
        },
        select: { id: true },
      });
      await transaction.productOptionGroup.deleteMany({ where: { productId: current.id } });
      for (const group of optionGroups) {
        const createdGroup = await transaction.productOptionGroup.create({
          data: {
            productId: current.id,
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
      return updated.id;
    });
    if (!product) return jsonResponse({ error: "Product or manufacturer not found" }, 404);
    const updatedProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product },
      include: productInclude,
    });
    return jsonResponse({ product: serializeProduct(updatedProduct) });
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
  if (!parsedId.success) return jsonResponse({ error: "Invalid product id" }, 400);
  try {
    const result = await getPrismaClient().product.updateMany({
      where: { id: parsedId.data, storeId: authorization.actor.storeId, isDemo: false },
      data: { isActive: false },
    });
    if (!result.count) return jsonResponse({ error: "Product not found" }, 404);
    return jsonResponse({ ok: true, isActive: false });
  } catch (error) {
    return adminDatabaseError(error);
  }
}
