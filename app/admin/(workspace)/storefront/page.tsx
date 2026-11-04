import { AdminStorefront } from "@/components/admin/admin-storefront";
import { requireAdminPage } from "@/lib/admin/pages";
import { getStorefrontForAdmin } from "@/lib/storefront/data";
import { notFound } from "next/navigation";

export default async function AdminStorefrontPage() {
  const actor = await requireAdminPage("settings:read");
  const storefront = await getStorefrontForAdmin(actor.storeId);
  if (!storefront) notFound();

  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Публичный сайт магазина</span>
        <h1>Управление витриной</h1>
        <p>Сначала сохраните черновик, проверьте предпросмотр, затем опубликуйте изменения.</p>
      </div>
      <AdminStorefront
        initialDraft={storefront.draft}
        initialPublishedAt={storefront.publishedAt?.toISOString() ?? null}
      />
    </>
  );
}
