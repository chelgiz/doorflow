import { AdminUsers } from "@/components/admin/admin-users";
import { requireAdminPage } from "@/lib/admin/pages";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function AdminUsersPage() {
  const actor = await requireAdminPage("users:read");
  const users = await getPrismaClient().adminUser.findMany({
    where: { storeId: actor.storeId },
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return (
    <>
      <div className="admin-page-heading">
        <span className="eyebrow">Доступ к системе</span>
        <h1>Сотрудники</h1>
        <p>Только владелец может создавать учётные записи и изменять роли.</p>
      </div>
      <AdminUsers
        initialUsers={users.map((user) => ({
          ...user,
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          createdAt: user.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
