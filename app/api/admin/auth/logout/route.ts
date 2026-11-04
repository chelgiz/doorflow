import { isSameOriginRequest, revokeAdminSession } from "@/lib/admin/auth";
import { jsonResponse } from "@/lib/http/json";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "Origin is not allowed" }, 403);
  }
  await revokeAdminSession();
  return jsonResponse({ ok: true });
}
