import { AdminSettings } from "@/components/admin/admin-settings";
import { requireAdminPage } from "@/lib/admin/pages";
import { storedStoreSettingsSchema } from "@/lib/admin/schemas";
import { getPrismaClient } from "@/lib/db/prisma";
import { notFound } from "next/navigation";

export default async function AdminSettingsPage() {
  const actor = await requireAdminPage("settings:read");
  const prisma = getPrismaClient();
  const [store, locations] = await Promise.all([
    prisma.store.findUnique({
      where: { id: actor.storeId },
      select: { name: true, settings: true },
    }),
    prisma.storeLocation.findMany({
      where: { storeId: actor.storeId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  if (!store) notFound();
  const savedSettings = storedStoreSettingsSchema.parse(store.settings);
  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Профиль компании</span>
        <h1>Настройки магазина</h1>
        <p>Контактные данные и торговые точки сохраняются в PostgreSQL.</p>
      </div>
      <AdminSettings
        initialLocations={locations}
        initialSettings={{
          name: store.name,
          contactPhone: savedSettings.contactPhone ?? null,
          contactEmail: savedSettings.contactEmail ?? null,
          logoUrl: savedSettings.logoUrl ?? null,
        }}
      />
    </>
  );
}
