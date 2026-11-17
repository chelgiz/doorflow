import { z } from "zod";
import { authorizeAdmin, isSameOriginRequest } from "@/lib/admin/auth";
import { writeOperationAudit } from "@/lib/admin/operation-audit";
import { databaseIdSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse, readJsonRequest } from "@/lib/http/json";

type RouteContext = { params: Promise<{ id: string }> };

const assignSchema = z.object({ managerId: databaseIdSchema.nullable() }).strict();

/**
 * Assign or clear the responsible manager of a lead.
 * Available to OWNER/ADMIN only ("leads:assign"); the change is audited as
 * `LEAD | ASSIGNED` with the previous and next manager.
 */
export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "Origin is not allowed" }, 403);
  }
  const authorization = await authorizeAdmin("leads:assign");
  if (!authorization.ok) return authorization.response;
  const actor = authorization.actor;

  const { id } = await context.params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return jsonResponse({ error: "Invalid lead id" }, 400);

  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const parsed = assignSchema.safeParse(body.body);
  if (!parsed.success) {
    return jsonResponse({ error: "Invalid assignment", issues: z.treeifyError(parsed.error) }, 400);
  }

  const prisma = getPrismaClient();
  if (parsed.data.managerId) {
    const manager = await prisma.adminUser.findFirst({
      where: {
        id: parsed.data.managerId,
        storeId: actor.storeId,
        isActive: true,
        role: { in: ["OWNER", "ADMIN", "MANAGER"] },
      },
      select: { id: true },
    });
    if (!manager) return jsonResponse({ error: "Active manager not found" }, 422);
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const current = await transaction.lead.findFirst({
      where: { id: parsedId.data, storeId: actor.storeId },
      select: { id: true, assignedManagerId: true },
    });
    if (!current) return null;

    const lead = await transaction.lead.update({
      where: { id: current.id },
      data: { assignedManagerId: parsed.data.managerId },
      select: {
        id: true,
        assignedManagerId: true,
        assignedManager: { select: { id: true, email: true } },
      },
    });

    await writeOperationAudit(transaction, actor, "LEAD", current.id, "ASSIGNED", {
      assignedManagerId: { from: current.assignedManagerId, to: parsed.data.managerId },
    });

    return lead;
  });

  if (!updated) return jsonResponse({ error: "Lead not found" }, 404);
  return jsonResponse({ lead: updated });
}
