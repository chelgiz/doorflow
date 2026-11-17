import { z } from "zod";
import { buildStoreAnalytics } from "@/lib/admin/analytics-data";
import { ANALYTICS_PERIODS } from "@/lib/admin/analytics-metrics";
import { authorizeAdmin } from "@/lib/admin/auth";
import { jsonResponse } from "@/lib/http/json";

const periodSchema = z.enum(ANALYTICS_PERIODS);

/** `GET /api/admin/analytics?period=today|7d|30d|all` (step 6). */
export async function GET(request: Request) {
  const authorization = await authorizeAdmin("operations:read");
  if (!authorization.ok) return authorization.response;

  const parsedPeriod = periodSchema.safeParse(
    new URL(request.url).searchParams.get("period") ?? "30d",
  );
  if (!parsedPeriod.success) return jsonResponse({ error: "Invalid analytics period" }, 400);

  return jsonResponse(await buildStoreAnalytics(authorization.actor, parsedPeriod.data));
}
