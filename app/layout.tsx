import type { Metadata } from "next";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";
import { getPublicSiteUrl } from "@/lib/storefront/seo";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const configuration = (await getPublicStorefront()) ?? defaultStorefrontConfiguration;
  return {
    metadataBase: new URL(getPublicSiteUrl()),
    title: configuration.seo.title,
    description: configuration.seo.description,
    openGraph: {
      title: configuration.seo.title,
      description: configuration.seo.description,
      type: "website",
      locale: "ru_RU",
    },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html data-scroll-behavior="smooth" lang="ru">
      <body>{children}</body>
    </html>
  );
}
