import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { adminDatabaseError } from "@/lib/admin/http";
import { customerActivitySchema } from "@/lib/admin/operations-schemas";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { databaseIdSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) return jsonResponse({ error: "Origin is not allowed" }, 403);
  const authorization = await authorizeAdmin("leads:write");
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid lead id" }, 400);
  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = customerActivitySchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid customer activity", issues: z.treeifyError(parsed.error) }, 400);
  }
  try {
    const activity = await getPrismaClient().$transaction(async (transaction) => {
      const lead = await transaction.lead.findFirst({
        where: { id: parsedId.data, storeId: authorization.actor.storeId },
        select: { id: true },
      });
      if (!lead) return null;
      const created = await transaction.customerActivity.create({
        data: {
          ...parsed.data,
          storeId: authorization.actor.storeId,
          leadId: lead.id,
          createdById: authorization.actor.userId,
        },
        include: { createdBy: { select: { id: true, email: true, role: true } } },
      });
      await writeOperationAudit(transaction, authorization.actor, "CUSTOMER_ACTIVITY", created.id, "RECORDED", {
        leadId: lead.id,
        type: created.type,
        body: created.body,
      });
      return created;
    });
    if (!activity) return jsonResponse({ error: "Lead not found" }, 404);
    return jsonResponse({ activity }, 201);
  } catch (error) {
    return adminDatabaseError(error);
  }
}
