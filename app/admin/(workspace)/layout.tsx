import { Suspense } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AdminSignoutButton } from "@/components/admin/admin-signout-button";
import { getCurrentAdmin, roleCan } from "@/lib/admin/auth";

const navigation = [
  { href: "/admin", label: "Обзор" },
  { href: "/admin/storefront", label: "Управление витриной" },
  { href: "/admin/products", label: "Каталог и комплектации" },
  { href: "/admin/pricing", label: "Услуги и цены" },
  { href: "/admin/leads", label: "Заявки" },
  { href: "/admin/measurements", label: "Замеры" },
  { href: "/admin/orders", label: "Заказы" },
  { href: "/admin/installations", label: "Установки" },
  { href: "/admin/deliveries", label: "Доставки" },
  { href: "/admin/settings", label: "Настройки магазина" },
  { href: "/admin/users", label: "Сотрудники" },
];

export default async function AdminWorkspaceLayout({
  children,
}: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="admin-content">Загрузка рабочего пространства…</div>}>
      <AuthenticatedAdminWorkspace>{children}</AuthenticatedAdminWorkspace>
    </Suspense>
  );
}

async function AuthenticatedAdminWorkspace({ children }: { children: ReactNode }) {
  await connection();
  const actor = await getCurrentAdmin();
  if (!actor) redirect("/admin/login");
  const visibleNavigation = navigation.filter((item) => {
    if (item.href === "/admin/storefront") return roleCan(actor.role, "settings:read");
    if (item.href === "/admin/users") return roleCan(actor.role, "users:read");
    if (item.href === "/admin/measurements") return roleCan(actor.role, "operations:read") || roleCan(actor.role, "measurements:own");
    if (item.href === "/admin/installations") return roleCan(actor.role, "operations:read") || roleCan(actor.role, "installations:own");
    if (item.href === "/admin/deliveries") return roleCan(actor.role, "operations:read");
    if (item.href === "/admin/orders") return roleCan(actor.role, "operations:read");
    return true;
  });

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <Link className="brand" href="/admin">
          <span className="brand-mark">D</span>
          <span className="brand-word">door<span>flow</span></span>
        </Link>
        <div className="admin-account">
          <span>{actor.email} · {actor.role.toLowerCase()}</span>
          <AdminSignoutButton />
        </div>
      </header>
      <div className="admin-body">
        <aside className="admin-sidebar">
          <nav aria-label="Администрирование">
            {visibleNavigation.map((item) => (
              <Link href={item.href} key={item.href}>{item.label}</Link>
            ))}
          </nav>
          <Link className="admin-back-link" href="/">Открыть витрину</Link>
        </aside>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
