import { authorizeAdmin } from "@/lib/admin/auth";
import { jsonResponse } from "@/lib/http/json";

export async function GET() {
  const authorization = await authorizeAdmin("catalog:read");
  if (!authorization.ok) return authorization.response;
  return jsonResponse({
    user: {
      id: authorization.actor.userId,
      email: authorization.actor.email,
      role: authorization.actor.role,
    },
  });
}
