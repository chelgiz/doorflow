import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest, leadVisibilityFilter } from "@/lib/admin/auth";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { databaseIdSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };

const nextActionSchema = z
  .object({ nextActionAt: z.iso.datetime({ offset: true }).nullable() })
  .strict();

/** Plans or clears the next follow-up action of a lead (CRM step 2.3). */
export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "Origin is not allowed" }, 403);
  }
  const authorization = await authorizeAdmin("leads:write");
  if (!authorization.ok) return authorization.response;
  const actor = authorization.actor;

  const { id } = await context.params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid lead id" }, 400);

  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = nextActionSchema.safeParse(body.body ?? {});
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid next action payload", issues: z.treeifyError(parsed.error) }, 400);
  }

  const nextActionAt = parsed.data.nextActionAt ? new Date(parsed.data.nextActionAt) : null;

  const prisma = getPrismaClient();
  const updated = await prisma.$transaction(async (transaction) => {
    const current = await transaction.lead.findFirst({
      where: { id: parsedId.data, storeId: actor.storeId, ...leadVisibilityFilter(actor) },
      select: { id: true, nextActionAt: true },
    });
    if (!current) return null;

    const lead = await transaction.lead.update({
      where: { id: current.id },
      data: { nextActionAt },
      select: { id: true, nextActionAt: true, status: true },
    });

    await writeOperationAudit(transaction, actor, "LEAD", current.id, "NEXT_ACTION_SET", {
      nextActionAt: {
        from: current.nextActionAt ? current.nextActionAt.toISOString() : null,
        to: lead.nextActionAt ? lead.nextActionAt.toISOString() : null,
      },
    });

    return lead;
  });

  if (!updated) return jsonResponse({ error: "Lead not found" }, 404);
  return jsonResponse({ lead: updated });
}
