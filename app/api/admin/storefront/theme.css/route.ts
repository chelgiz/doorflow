import { connection } from "next/server";
import { authorizeAdmin } from "@/lib/admin/auth";
import { storefrontThemeColorsSchema, storefrontThemeCss } from "@/lib/storefront/theme";

export async function GET(request: Request) {
  await connection();
  const authorization = await authorizeAdmin("settings:read");
  if (!authorization.ok) return new Response(null, { status: 404 });
  const url = new URL(request.url);
  const parsed = storefrontThemeColorsSchema.safeParse({
    preset: url.searchParams.get("preset"),
    primaryColor: url.searchParams.get("primaryColor"),
    accentColor: url.searchParams.get("accentColor"),
    backgroundColor: url.searchParams.get("backgroundColor"),
    textColor: url.searchParams.get("textColor"),
  });
  if (!parsed.success) return new Response(null, { status: 400 });
  return new Response(storefrontThemeCss(parsed.data, ".storefront-theme-preview"), {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Vary": "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
