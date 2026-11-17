import { AdminAnalytics } from "@/components/admin/admin-analytics";
import { buildStoreAnalytics } from "@/lib/admin/analytics-data";
import { requireAdminPage } from "@/lib/admin/pages";

export default async function AdminAnalyticsPage() {
  const actor = await requireAdminPage("operations:read");
  const initialReport = await buildStoreAnalytics(actor, "30d");
  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Отчётность</span>
        <h1>Аналитика</h1>
        <p>
          Заявки, конверсия, дисциплина и деньги за выбранный период. Показатели считаются по данным
          магазина, рядом с каждой метрикой указан размер выборки.
        </p>
      </div>
      <AdminAnalytics
        canSeeUnassigned={actor.role !== "MANAGER"}
        initialReport={initialReport}
      />
    </>
  );
}
