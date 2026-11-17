import { describe, expect, it } from "vitest";
import {
  defaultStorefrontConfiguration,
  storefrontConfigurationSchema,
} from "@/lib/storefront/config";
import {
  contrastRatio,
  storefrontThemeSchema,
  themeForPreset,
  themePresets,
} from "@/lib/storefront/theme";

describe("storefront theme validation", () => {
  it("keeps preset labels out of the strict persisted theme configuration", () => {
    for (const preset of ["warm", "sage", "graphite", "sand", "copper"] as const) {
      const theme = themeForPreset(preset);
      expect(storefrontThemeSchema.parse(theme)).toEqual(theme);
    }
  });

  it("accepts every shipped palette with readable text and buttons", () => {
    for (const [preset, colors] of Object.entries(themePresets)) {
      const theme = {
        primaryColor: colors.primaryColor,
        accentColor: colors.accentColor,
        backgroundColor: colors.backgroundColor,
        textColor: colors.textColor,
      };
      expect(storefrontThemeSchema.safeParse({ preset, ...theme }).success).toBe(true);
    }
  });

  it("rejects custom colors that fail required contrast ratios", () => {
    expect(storefrontThemeSchema.safeParse({
      preset: "custom",
      primaryColor: "#ffffff",
      accentColor: "#eeeeee",
      backgroundColor: "#ffffff",
      textColor: "#cccccc",
    }).success).toBe(false);
  });

  it("accepts fixed local destinations and rejects arbitrary links", () => {
    const configuration = structuredClone(defaultStorefrontConfiguration);
    configuration.home.primaryCtaHref = "javascript:alert(1)";
    expect(storefrontConfigurationSchema.safeParse(configuration).success).toBe(false);
  });

  it("only accepts same-origin uploaded logo assets", () => {
    const configuration = structuredClone(defaultStorefrontConfiguration);
    configuration.identity.logoUrl = "https://external.example/logo.png";
    expect(storefrontConfigurationSchema.safeParse(configuration).success).toBe(false);
  });

  it("calculates known contrast values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
