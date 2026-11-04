"use client";

import { useRouter } from "next/navigation";

export function AdminSignoutButton() {
  const router = useRouter();
  async function signOut() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }
  return <button className="admin-signout" onClick={signOut} type="button">Выйти</button>;
}
