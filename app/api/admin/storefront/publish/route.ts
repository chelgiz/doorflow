import { revalidateTag } from "next/cache";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  getStorefrontForAdmin,
  publishStorefront,
  storefrontCacheTag,
  validateStorefrontReferences,
} from "@/lib/storefront/data";
import { storefrontConfigurationSchema } from "@/lib/storefront/config";
import { jsonResponse } from "@/lib/http/json";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("settings:write");
  if (!authorization.ok) return authorization.response;

  const prisma = getPrismaClient();
  const initial = await getStorefrontForAdmin(authorization.actor.storeId);
  if (!initial) return jsonResponse({ error: "Store not found" }, 404);
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const record = await transaction.storefront.findUnique({
        where: { storeId: authorization.actor.storeId },
        select: { draft: true },
      });
      const parsed = storefrontConfigurationSchema.safeParse(record?.draft ?? initial.draft);
      if (!parsed.success) return { error: "Черновик содержит некорректные данные." } as const;
      const referenceError = await validateStorefrontReferences(
        transaction,
        authorization.actor.storeId,
        parsed.data,
      );
      if (referenceError) return { error: referenceError } as const;
      const published = await publishStorefront(
        transaction,
        authorization.actor.storeId,
        parsed.data,
      );
      return { published } as const;
    });
    if ("error" in result) return jsonResponse({ error: result.error }, 422);
    revalidateTag(storefrontCacheTag(authorization.actor.storeId), { expire: 0 });
    return jsonResponse({ published: result.published, publishedAt: new Date().toISOString() });
  } catch (error) {
    return adminDatabaseError(error);
  }
}
