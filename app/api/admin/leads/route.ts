import { z } from "zod";
import { authorizeAdmin, leadVisibilityFilter } from "@/lib/admin/auth";
import { getPrismaClient } from "@/lib/db/prisma";
import { jsonResponse } from "@/lib/http/json";
import { LeadStatus } from "@/generated/prisma/client";

const leadStatuses = Object.values(LeadStatus);

export async function GET(request: Request) {
  const authorization = await authorizeAdmin("leads:read");
  if (!authorization.ok) return authorization.response;

  const url = new URL(request.url);
  const search = z.string().trim().max(100).safeParse(url.searchParams.get("q") ?? "");
  const status = z.enum(leadStatuses).or(z.literal("all"))
    .safeParse(url.searchParams.get("status") ?? "all");
  const page = z.coerce.number().int().min(1).max(10_000)
    .safeParse(url.searchParams.get("page") ?? "1");
  if (!search.success || !status.success || !page.success) {
    return jsonResponse({ error: "Invalid lead filters" }, 400);
  }

  const where = {
    storeId: authorization.actor.storeId,
    ...leadVisibilityFilter(authorization.actor),
    ...(status.data === "all" ? {} : { status: status.data }),
    ...(search.data
      ? {
          OR: [
            { customerName: { contains: search.data, mode: "insensitive" as const } },
            { phone: { contains: search.data } },
            { source: { contains: search.data, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const prisma = getPrismaClient();
  const [leads, total] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page.data - 1) * 30,
      take: 30,
      select: {
        id: true,
        type: true,
        status: true,
        customerName: true,
        phone: true,
        address: true,
        source: true,
        utmSource: true,
        assignedManager: { select: { id: true, email: true } },
        createdAt: true,
        product: { select: { name: true, model: true, slug: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);
  return jsonResponse({ leads, total, page: page.data, pageSize: 30 });
}
