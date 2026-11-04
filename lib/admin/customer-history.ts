import "server-only";
import { toSafeMinorUnits } from "@/lib/admin/http";
import { getPrismaClient } from "@/lib/db/prisma";

export async function getCustomerHistory(storeId: string, phone: string) {
  const prisma = getPrismaClient();
  const phoneDigits = phone.replace(/\D/g, "");
  const leads = await prisma.lead.findMany({
    where: {
      storeId,
      phone: { in: [phoneDigits, `+${phoneDigits}`] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
      address: true,
      comment: true,
      product: { select: { name: true, model: true } },
      statusHistory: {
        orderBy: { changedAt: "asc" },
        select: { from: true, to: true, note: true, changedAt: true },
      },
      measurements: {
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          address: true,
          assignedMeasurer: { select: { id: true, email: true } },
        },
      },
      order: {
        select: { id: true, status: true, totalMinor: true, currency: true },
      },
    },
  });
  const activities = await prisma.customerActivity.findMany({
    where: { storeId, leadId: { in: leads.map(({ id }) => id) } },
    orderBy: { createdAt: "asc" },
    include: { createdBy: { select: { id: true, email: true, role: true } } },
  });
  return {
    leads: leads.map((lead) => ({
      ...lead,
      order: lead.order
        ? { ...lead.order, totalMinor: toSafeMinorUnits(lead.order.totalMinor, "Order total") }
        : null,
    })),
    activities,
  };
}
