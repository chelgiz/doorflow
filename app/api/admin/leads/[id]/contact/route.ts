import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest, leadVisibilityFilter } from "@/lib/admin/auth";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { databaseIdSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };

const contactSchema = z
  .object({ contactedAt: z.iso.datetime({ offset: true }).optional() })
  .strict();

/**
 * Records the first contact with the customer (SLA, step 2.2).
 *
 * `firstContactAt` is written once: a repeated request keeps the original
 * timestamp and answers with the stored value, so retries and concurrent
 * clicks cannot rewrite history.
 */
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
  const parsed = contactSchema.safeParse(body.body ?? {});
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid contact payload", issues: z.treeifyError(parsed.error) }, 400);
  }
  const contactedAt = parsed.data.contactedAt ? new Date(parsed.data.contactedAt) : new Date();

  const prisma = getPrismaClient();
  const result = await prisma.$transaction(async (transaction) => {
    const current = await transaction.lead.findFirst({
      where: {
        id: parsedId.data,
        storeId: actor.storeId,
        ...leadVisibilityFilter(actor),
      },
      select: { id: true, firstContactAt: true },
    });
    if (!current) return null;

    if (current.firstContactAt) {
      return { lead: current, alreadyRecorded: true as const };
    }

    const updated = await transaction.lead.update({
      where: { id: current.id },
      data: { firstContactAt: contactedAt },
      select: { id: true, firstContactAt: true },
    });

    await writeOperationAudit(transaction, actor, "LEAD", current.id, "CONTACT_RECORDED", {
      firstContactAt: { from: null, to: updated.firstContactAt?.toISOString() ?? null },
    });

    return { lead: updated, alreadyRecorded: false as const };
  });

  if (!result) return jsonResponse({ error: "Lead not found" }, 404);
  return jsonResponse(
    {
      lead: result.lead,
      alreadyRecorded: result.alreadyRecorded,
      message: result.alreadyRecorded
        ? "Первый контакт уже зафиксирован"
        : "Первый контакт зафиксирован",
    },
    result.alreadyRecorded ? 200 : 201,
  );
}
