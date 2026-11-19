import type { MetadataRoute } from "next";
import { getPublicCatalogProducts } from "@/lib/storefront/catalog";
import { getPublicSiteUrl } from "@/lib/storefront/seo";

const staticPages = [
  "",
  "/catalog",
  "/catalog/dlya-kvartiry",
  "/catalog/dlya-doma",
  "/about",
  "/delivery",
  "/warranty",
  "/contacts",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicSiteUrl();
  const now = new Date();
  const pages: MetadataRoute.Sitemap = staticPages.map((path) => ({
    url: new URL(path || "/", base).toString(),
    lastModified: now,
    changeFrequency: path === "" || path === "/catalog" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/catalog" ? 0.9 : 0.6,
  }));

  const products = await getPublicCatalogProducts().catch(() => []);
  return [
    ...pages,
    ...products.map((product) => ({
      url: new URL(`/catalog/${product.slug}`, base).toString(),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
