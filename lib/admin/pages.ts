import "server-only";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import type { AdminPermission } from "@/lib/admin/auth";
import { getCurrentAdmin, roleCan } from "@/lib/admin/auth";

export async function requireAdminPage(permission: AdminPermission) {
  await connection();
  const actor = await getCurrentAdmin();
  if (!actor) redirect("/admin/login");
  if (!roleCan(actor.role, permission)) notFound();
  return actor;
}

export async function requireAdminPageOneOf(...permissions: AdminPermission[]) {
  await connection();
  const actor = await getCurrentAdmin();
  if (!actor) redirect("/admin/login");
  if (!permissions.some((permission) => roleCan(actor.role, permission))) notFound();
  return actor;
}
