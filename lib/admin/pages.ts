import "server-only";
import { notFound, redirect } from "next/navigation";
import type { AdminPermission } from "@/lib/admin/auth";
import { getCurrentAdmin, roleCan } from "@/lib/admin/auth";

export async function requireAdminPage(permission: AdminPermission) {
  const actor = await getCurrentAdmin();
  if (!actor) redirect("/admin/login");
  if (!roleCan(actor.role, permission)) notFound();
  return actor;
}

export async function requireAdminPageOneOf(...permissions: AdminPermission[]) {
  const actor = await getCurrentAdmin();
  if (!actor) redirect("/admin/login");
  if (!permissions.some((permission) => roleCan(actor.role, permission))) notFound();
  return actor;
}
