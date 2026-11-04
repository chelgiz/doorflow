import type { Metadata } from "next";
import { defaultStorefrontConfiguration } from "@/lib/storefront/config";
import { getPublicStorefront } from "@/lib/storefront/data";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const configuration = (await getPublicStorefront()) ?? defaultStorefrontConfiguration;
  return {
    title: configuration.seo.title,
    description: configuration.seo.description,
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html data-scroll-behavior="smooth" lang="ru">
      <body>{children}</body>
    </html>
  );
}
