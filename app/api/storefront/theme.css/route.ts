import { connection } from "next/server";
import { getPublicStorefront } from "@/lib/storefront/data";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { storefrontThemeCss } from "@/lib/storefront/theme";

export async function GET() {
  await connection();
  const configuration = (await getPublicStorefront()) ?? defaultStorefrontConfiguration;
  return new Response(storefrontThemeCss(configuration.theme), {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
