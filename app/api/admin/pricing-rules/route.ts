import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError, serializePricingRule } from "@/lib/admin/http";
import { pricingRuleInputSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

export async function GET() {
  const authorization = await authorizeAdmin("catalog:read");
  if (!authorization.ok) return authorization.response;
  const rules = await getPrismaClient().pricingRule.findMany({
    where: { storeId: authorization.actor.storeId },
    orderBy: [{ createdAt: "asc" }, { key: "asc" }],
  });
  return jsonResponse({ rules: rules.map(serializePricingRule) });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("catalog:write");
  if (!authorization.ok) return authorization.response;
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = pricingRuleInputSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid pricing rule", issues: z.treeifyError(parsed.error) }, 400);
  }
  const input = parsed.data;
  try {
    const rule = await getPrismaClient().pricingRule.create({
      data: {
        ...input,
        storeId: authorization.actor.storeId,
        priceMinor: BigInt("priceMinor" in input ? input.priceMinor : 0),
        basisPoints: "basisPoints" in input ? input.basisPoints : null,
      },
    });
    return jsonResponse({ rule: serializePricingRule(rule) }, 201);
  } catch (error) {
    return adminDatabaseError(error);
  }
}
