import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AdminActor } from "@/lib/admin/auth";

export async function writeOperationAudit(
  transaction: Prisma.TransactionClient,
  actor: AdminActor,
  entityType: "MEASUREMENT" | "ORDER" | "INSTALLATION" | "CUSTOMER_ACTIVITY" | "ADMIN_USER",
  entityId: string,
  action: string,
  changes: Prisma.InputJsonValue,
) {
  await transaction.operationAudit.create({
    data: {
      storeId: actor.storeId,
      actorId: actor.userId,
      actorEmail: actor.email,
      entityType,
      entityId,
      action,
      changes,
    },
  });
}
