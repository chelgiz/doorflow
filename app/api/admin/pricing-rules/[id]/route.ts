import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError, serializePricingRule } from "@/lib/admin/http";
import { databaseIdSchema, pricingRuleInputSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("catalog:write");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid pricing rule id" }, 400);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = pricingRuleInputSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid pricing rule", issues: z.treeifyError(parsed.error) }, 400);
  }

  const input = parsed.data;
  const prisma = getPrismaClient();
  try {
    const current = await prisma.pricingRule.findFirst({
      where: { id: parsedId.data, storeId: authorization.actor.storeId },
      select: { id: true },
    });
    if (!current) return jsonResponse({ error: "Pricing rule not found" }, 404);
    const rule = await prisma.pricingRule.update({
      where: { id: current.id },
      data: {
        ...input,
        priceMinor: BigInt("priceMinor" in input ? input.priceMinor : 0),
        basisPoints: "basisPoints" in input ? input.basisPoints : null,
      },
    });
    return jsonResponse({ rule: serializePricingRule(rule) });
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
  if (!parsedId.success) return jsonResponse({ error: "Invalid pricing rule id" }, 400);
  const result = await getPrismaClient().pricingRule.updateMany({
    where: { id: parsedId.data, storeId: authorization.actor.storeId },
    data: { isActive: false },
  });
  if (!result.count) return jsonResponse({ error: "Pricing rule not found" }, 404);
  return jsonResponse({ ok: true, isActive: false });
}
