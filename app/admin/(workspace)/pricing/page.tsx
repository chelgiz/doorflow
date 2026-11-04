import { AdminPricing } from "@/components/admin/admin-pricing";
import { requireAdminPage } from "@/lib/admin/pages";
import { serializePricingRule } from "@/lib/admin/http";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function AdminPricingPage() {
  const actor = await requireAdminPage("catalog:read");
  const rules = await getPrismaClient().pricingRule.findMany({
    where: { storeId: actor.storeId },
    orderBy: [{ createdAt: "asc" }, { key: "asc" }],
  });
  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Расчёт комплектации</span>
        <h1>Цены и услуги</h1>
        <p>Правила влияют на серверный калькулятор; опубликованные цены не берутся из клиентского запроса.</p>
      </div>
      <AdminPricing initialRules={rules.map(serializePricingRule)} />
    </>
  );
}
