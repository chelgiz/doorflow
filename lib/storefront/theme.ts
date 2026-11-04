import { z } from "zod";

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);

export const themePresets = {
  warm: {
    label: "Тёплый",
    primaryColor: "#1d2927",
    accentColor: "#99513a",
    backgroundColor: "#f7f6f2",
    textColor: "#1d2927",
  },
  sage: {
    label: "Шалфей",
    primaryColor: "#20332e",
    accentColor: "#315f4c",
    backgroundColor: "#f3f6f1",
    textColor: "#20332e",
  },
  graphite: {
    label: "Графит",
    primaryColor: "#20242b",
    accentColor: "#3d526d",
    backgroundColor: "#f4f5f7",
    textColor: "#20242b",
  },
  sand: {
    label: "Песочная",
    primaryColor: "#382c24",
    accentColor: "#795334",
    backgroundColor: "#faf6f0",
    textColor: "#382c24",
  },
} as const;

export type ThemePreset = keyof typeof themePresets | "custom";

function linearize(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string) {
  const channels = color.slice(1).match(/.{2}/g);
  if (!channels) return 0;
  const [red, green, blue] = channels.map((channel) => linearize(Number.parseInt(channel, 16)));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export const storefrontThemeColorsSchema = z.object({
  preset: z.enum(["warm", "sage", "graphite", "sand", "custom"]),
  primaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  backgroundColor: hexColorSchema,
  textColor: hexColorSchema,
}).strict();

export function themeForPreset(preset: Exclude<ThemePreset, "custom">) {
  const colors = themePresets[preset];
  return storefrontThemeColorsSchema.parse({
    preset,
    primaryColor: colors.primaryColor,
    accentColor: colors.accentColor,
    backgroundColor: colors.backgroundColor,
    textColor: colors.textColor,
  });
}

export const storefrontThemeSchema = storefrontThemeColorsSchema.superRefine((theme, context) => {
  if (contrastRatio(theme.textColor, theme.backgroundColor) < 4.5) {
    context.addIssue({
      code: "custom",
      path: ["textColor"],
      message: "Контраст текста и фона должен быть не ниже 4,5:1.",
    });
  }
  if (contrastRatio("#ffffff", theme.primaryColor) < 4.5) {
    context.addIssue({
      code: "custom",
      path: ["primaryColor"],
      message: "Белый текст на основном цвете должен иметь контраст не ниже 4,5:1.",
    });
  }
  if (contrastRatio("#ffffff", theme.accentColor) < 4.5) {
    context.addIssue({
      code: "custom",
      path: ["accentColor"],
      message: "Белый текст на акцентном цвете должен иметь контраст не ниже 4,5:1.",
    });
  }
});

export function storefrontThemeCss(
  theme: z.infer<typeof storefrontThemeColorsSchema>,
  selector = ".storefront-theme",
) {
  const parsed = storefrontThemeColorsSchema.parse(theme);
  return `${selector}{--ink:${parsed.textColor};--primary:${parsed.primaryColor};--paper:${parsed.backgroundColor};--accent:${parsed.accentColor};--accent-dark:${darken(parsed.accentColor)}}`;
}

function darken(hex: string, factor = 0.82) {
  const channels = hex.slice(1).match(/.{2}/g);
  if (!channels) return hex;
  return `#${channels
    .map((channel) => Math.round(Number.parseInt(channel, 16) * factor).toString(16).padStart(2, "0"))
    .join("")}`;
}

export const defaultTheme = {
  primaryColor: themePresets.warm.primaryColor,
  accentColor: themePresets.warm.accentColor,
  backgroundColor: themePresets.warm.backgroundColor,
  textColor: themePresets.warm.textColor,
};
