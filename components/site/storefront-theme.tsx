import type { ReactNode } from "react";
import type { StorefrontConfiguration } from "@/lib/storefront/config";

export function StorefrontTheme({
  configuration,
  children,
  preview = false,
}: {
  configuration: StorefrontConfiguration;
  children: ReactNode;
  preview?: boolean;
}) {
  const query = new URLSearchParams({
    preset: configuration.theme.preset,
    primaryColor: configuration.theme.primaryColor,
    accentColor: configuration.theme.accentColor,
    backgroundColor: configuration.theme.backgroundColor,
    textColor: configuration.theme.textColor,
  });
  const stylesheet = preview
    ? `/api/admin/storefront/theme.css?${query.toString()}`
    : "/api/storefront/theme.css";
  return (
    <>
      <link href={stylesheet} precedence="default" rel="stylesheet" />
      <div className={preview ? "storefront-theme storefront-theme-preview" : "storefront-theme"}>
        {children}
      </div>
    </>
  );
}
