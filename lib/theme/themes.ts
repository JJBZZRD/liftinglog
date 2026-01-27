/**
 * NativeWind Theme Definitions
 * 
 * This module provides multiple color themes using NativeWind's vars() function.
 * Each theme has both light and dark mode variants following the 60/30/10 rule:
 * - 60% Primary/dominant (backgrounds, main surfaces)
 * - 30% Secondary (cards, containers, supporting elements)  
 * - 10% Accent (buttons, highlights, interactive elements)
 */

import { vars } from "nativewind";

// ============================================================
// Type Definitions
// ============================================================

export type ColorThemeId = "default" | "ocean" | "forest" | "sunset" | "rose" | "violet" | "slate";
export type ColorScheme = "light" | "dark";

export interface ThemeOption {
  id: ColorThemeId;
  label: string;
  previewColor: string;
}

// ============================================================
// Theme Options for UI
// ============================================================

export const COLOR_THEME_OPTIONS: ThemeOption[] = [
  { id: "default", label: "Default", previewColor: "#007AFF" },
  { id: "ocean", label: "Ocean", previewColor: "#0D9488" },
  { id: "forest", label: "Forest", previewColor: "#059669" },
  { id: "sunset", label: "Sunset", previewColor: "#EA580C" },
  { id: "rose", label: "Rose", previewColor: "#E11D48" },
  { id: "violet", label: "Violet", previewColor: "#7C3AED" },
  { id: "slate", label: "Slate", previewColor: "#475569" },
];

// ============================================================
// Raw Color Definitions (hex values for direct use)
// ============================================================

export interface RawThemeColors {
  primary: string;
  primaryLight: string;
  primaryForeground: string;
  success: string;
  warning: string;
  destructive: string;
  background: string;
  surface: string;
  surfaceSecondary: string;
  border: string;
  borderLight: string;
  foreground: string;
  foregroundSecondary: string;
  foregroundMuted: string;
  pressed: string;
  overlay: string;
  overlayDark: string;
  shadow: string;
  prGold: string;
}

// Raw color definitions for each theme (hex values)
const rawColors: Record<ColorThemeId, Record<ColorScheme, RawThemeColors>> = {
  default: {
    light: {
      primary: "#007AFF",
      primaryLight: "#E5F1FF",
      primaryForeground: "#FFFFFF",
      success: "#34C759",
      warning: "#FF9500",
      destructive: "#FF3B30",
      background: "#F2F2F7",
      surface: "#FFFFFF",
      surfaceSecondary: "#F5F8FC",
      border: "#D4E2F4",
      borderLight: "#E8F0FA",
      foreground: "#000000",
      foregroundSecondary: "#4A5568",
      foregroundMuted: "#8899AA",
      pressed: "#DCE8F8",
      overlay: "rgba(0, 0, 0, 0.3)",
      overlayDark: "rgba(0, 0, 0, 0.5)",
      shadow: "#000000",
      prGold: "#FFD700",
    },
    dark: {
      primary: "#0A84FF",
      primaryLight: "#1A2744",
      primaryForeground: "#FFFFFF",
      success: "#30D158",
      warning: "#FF9F0A",
      destructive: "#FF453A",
      background: "#000000",
      surface: "#1C1C1E",
      surfaceSecondary: "#2C2C2E",
      border: "#38383A",
      borderLight: "#2C2C2E",
      foreground: "#FFFFFF",
      foregroundSecondary: "#EBEBF5",
      foregroundMuted: "#8E8E93",
      pressed: "#2C2C2E",
      overlay: "rgba(0, 0, 0, 0.5)",
      overlayDark: "rgba(0, 0, 0, 0.7)",
      shadow: "#000000",
      prGold: "#B8860B",
    },
  },
  ocean: {
    light: {
      primary: "#0D9488",
      primaryLight: "#CCFBF1",
      primaryForeground: "#FFFFFF",
      success: "#10B981",
      warning: "#F59E0B",
      destructive: "#EF4444",
      background: "#E6F7F5",
      surface: "#F0FDFB",
      surfaceSecondary: "#E0F5F2",
      border: "#7DD4C9",
      borderLight: "#A8E6DE",
      foreground: "#134E4A",
      foregroundSecondary: "#1F7268",
      foregroundMuted: "#5EADA4",
      pressed: "#C2F0E9",
      overlay: "rgba(13, 148, 136, 0.2)",
      overlayDark: "rgba(13, 148, 136, 0.4)",
      shadow: "#0D9488",
      prGold: "#FBBF24",
    },
    dark: {
      primary: "#2DD4BF",
      primaryLight: "#134E4A",
      primaryForeground: "#134E4A",
      success: "#34D399",
      warning: "#FBBF24",
      destructive: "#F87171",
      background: "#042F2E",
      surface: "#0D3D3B",
      surfaceSecondary: "#115E59",
      border: "#115E59",
      borderLight: "#0D3D3B",
      foreground: "#F0FDFA",
      foregroundSecondary: "#99F6E4",
      foregroundMuted: "#5EEAD4",
      pressed: "#115E59",
      overlay: "rgba(45, 212, 191, 0.2)",
      overlayDark: "rgba(45, 212, 191, 0.4)",
      shadow: "#000000",
      prGold: "#FBBF24",
    },
  },
  forest: {
    light: {
      primary: "#059669",
      primaryLight: "#D1FAE5",
      primaryForeground: "#FFFFFF",
      success: "#22C55E",
      warning: "#F59E0B",
      destructive: "#EF4444",
      background: "#E2F9EE",
      surface: "#EDFDF4",
      surfaceSecondary: "#DCF5E8",
      border: "#7EDFB2",
      borderLight: "#A3EBCA",
      foreground: "#064E3B",
      foregroundSecondary: "#0A7B5A",
      foregroundMuted: "#4DB890",
      pressed: "#C1F0D8",
      overlay: "rgba(5, 150, 105, 0.2)",
      overlayDark: "rgba(5, 150, 105, 0.4)",
      shadow: "#059669",
      prGold: "#FBBF24",
    },
    dark: {
      primary: "#34D399",
      primaryLight: "#064E3B",
      primaryForeground: "#064E3B",
      success: "#4ADE80",
      warning: "#FBBF24",
      destructive: "#F87171",
      background: "#022C22",
      surface: "#064E3B",
      surfaceSecondary: "#065F46",
      border: "#065F46",
      borderLight: "#064E3B",
      foreground: "#ECFDF5",
      foregroundSecondary: "#A7F3D0",
      foregroundMuted: "#6EE7B7",
      pressed: "#065F46",
      overlay: "rgba(52, 211, 153, 0.2)",
      overlayDark: "rgba(52, 211, 153, 0.4)",
      shadow: "#000000",
      prGold: "#FBBF24",
    },
  },
  sunset: {
    light: {
      primary: "#EA580C",
      primaryLight: "#FFEDD5",
      primaryForeground: "#FFFFFF",
      success: "#22C55E",
      warning: "#F59E0B",
      destructive: "#DC2626",
      background: "#FFF0E0",
      surface: "#FFF8F2",
      surfaceSecondary: "#FFEBE0",
      border: "#F5C090",
      borderLight: "#FBD8B5",
      foreground: "#7C2D12",
      foregroundSecondary: "#A84810",
      foregroundMuted: "#D97F4A",
      pressed: "#FFE0C8",
      overlay: "rgba(234, 88, 12, 0.2)",
      overlayDark: "rgba(234, 88, 12, 0.4)",
      shadow: "#EA580C",
      prGold: "#F59E0B",
    },
    dark: {
      primary: "#FB923C",
      primaryLight: "#7C2D12",
      primaryForeground: "#7C2D12",
      success: "#4ADE80",
      warning: "#FBBF24",
      destructive: "#F87171",
      background: "#431407",
      surface: "#7C2D12",
      surfaceSecondary: "#9A3412",
      border: "#9A3412",
      borderLight: "#7C2D12",
      foreground: "#FFF7ED",
      foregroundSecondary: "#FED7AA",
      foregroundMuted: "#FDBA74",
      pressed: "#9A3412",
      overlay: "rgba(251, 146, 60, 0.2)",
      overlayDark: "rgba(251, 146, 60, 0.4)",
      shadow: "#000000",
      prGold: "#FBBF24",
    },
  },
  rose: {
    light: {
      primary: "#E11D48",
      primaryLight: "#FFE4E6",
      primaryForeground: "#FFFFFF",
      success: "#22C55E",
      warning: "#F59E0B",
      destructive: "#DC2626",
      background: "#FFE8EA",
      surface: "#FFF5F6",
      surfaceSecondary: "#FFE0E3",
      border: "#F5A0AD",
      borderLight: "#FBC5CC",
      foreground: "#881337",
      foregroundSecondary: "#A61840",
      foregroundMuted: "#E05A78",
      pressed: "#FFD4D9",
      overlay: "rgba(225, 29, 72, 0.2)",
      overlayDark: "rgba(225, 29, 72, 0.4)",
      shadow: "#E11D48",
      prGold: "#FBBF24",
    },
    dark: {
      primary: "#FB7185",
      primaryLight: "#881337",
      primaryForeground: "#881337",
      success: "#4ADE80",
      warning: "#FBBF24",
      destructive: "#F87171",
      background: "#4C0519",
      surface: "#881337",
      surfaceSecondary: "#9F1239",
      border: "#9F1239",
      borderLight: "#881337",
      foreground: "#FFF1F2",
      foregroundSecondary: "#FECDD3",
      foregroundMuted: "#FDA4AF",
      pressed: "#9F1239",
      overlay: "rgba(251, 113, 133, 0.2)",
      overlayDark: "rgba(251, 113, 133, 0.4)",
      shadow: "#000000",
      prGold: "#FBBF24",
    },
  },
  violet: {
    light: {
      primary: "#7C3AED",
      primaryLight: "#EDE9FE",
      primaryForeground: "#FFFFFF",
      success: "#22C55E",
      warning: "#F59E0B",
      destructive: "#EF4444",
      background: "#EDE6FF",
      surface: "#F7F4FF",
      surfaceSecondary: "#E8E0FF",
      border: "#C4B0F5",
      borderLight: "#D9CFFA",
      foreground: "#4C1D95",
      foregroundSecondary: "#6930C3",
      foregroundMuted: "#9B72E8",
      pressed: "#DED4FD",
      overlay: "rgba(124, 58, 237, 0.2)",
      overlayDark: "rgba(124, 58, 237, 0.4)",
      shadow: "#7C3AED",
      prGold: "#FBBF24",
    },
    dark: {
      primary: "#A78BFA",
      primaryLight: "#4C1D95",
      primaryForeground: "#4C1D95",
      success: "#4ADE80",
      warning: "#FBBF24",
      destructive: "#F87171",
      background: "#2E1065",
      surface: "#4C1D95",
      surfaceSecondary: "#5B21B6",
      border: "#5B21B6",
      borderLight: "#4C1D95",
      foreground: "#F5F3FF",
      foregroundSecondary: "#DDD6FE",
      foregroundMuted: "#C4B5FD",
      pressed: "#5B21B6",
      overlay: "rgba(167, 139, 250, 0.2)",
      overlayDark: "rgba(167, 139, 250, 0.4)",
      shadow: "#000000",
      prGold: "#FBBF24",
    },
  },
  slate: {
    light: {
      primary: "#475569",
      primaryLight: "#F1F5F9",
      primaryForeground: "#FFFFFF",
      success: "#22C55E",
      warning: "#F59E0B",
      destructive: "#EF4444",
      background: "#E8ECF2",
      surface: "#F3F6FA",
      surfaceSecondary: "#E2E8F0",
      border: "#B8C4D4",
      borderLight: "#D0D9E5",
      foreground: "#0F172A",
      foregroundSecondary: "#374151",
      foregroundMuted: "#728197",
      pressed: "#D4DCE8",
      overlay: "rgba(71, 85, 105, 0.2)",
      overlayDark: "rgba(71, 85, 105, 0.4)",
      shadow: "#475569",
      prGold: "#FBBF24",
    },
    dark: {
      primary: "#94A3B8",
      primaryLight: "#1E293B",
      primaryForeground: "#0F172A",
      success: "#4ADE80",
      warning: "#FBBF24",
      destructive: "#F87171",
      background: "#020617",
      surface: "#0F172A",
      surfaceSecondary: "#1E293B",
      border: "#334155",
      borderLight: "#1E293B",
      foreground: "#F8FAFC",
      foregroundSecondary: "#E2E8F0",
      foregroundMuted: "#94A3B8",
      pressed: "#334155",
      overlay: "rgba(148, 163, 184, 0.2)",
      overlayDark: "rgba(148, 163, 184, 0.4)",
      shadow: "#000000",
      prGold: "#FBBF24",
    },
  },
};

// ============================================================
// Helper to get raw color values
// ============================================================

export function getRawThemeColors(themeId: ColorThemeId, colorScheme: ColorScheme): RawThemeColors {
  return rawColors[themeId]?.[colorScheme] ?? rawColors.default[colorScheme];
}

// ============================================================
// NativeWind vars() Theme Definitions
// ============================================================

function hexToRgbString(hex: string): string {
  // Remove # if present
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function createThemeVars(colors: RawThemeColors) {
  return vars({
    "--color-primary": hexToRgbString(colors.primary),
    "--color-primary-light": hexToRgbString(colors.primaryLight),
    "--color-primary-foreground": hexToRgbString(colors.primaryForeground),
    "--color-success": hexToRgbString(colors.success),
    "--color-warning": hexToRgbString(colors.warning),
    "--color-destructive": hexToRgbString(colors.destructive),
    "--color-background": hexToRgbString(colors.background),
    "--color-surface": hexToRgbString(colors.surface),
    "--color-surface-secondary": hexToRgbString(colors.surfaceSecondary),
    "--color-border": hexToRgbString(colors.border),
    "--color-border-light": hexToRgbString(colors.borderLight),
    "--color-foreground": hexToRgbString(colors.foreground),
    "--color-foreground-secondary": hexToRgbString(colors.foregroundSecondary),
    "--color-foreground-muted": hexToRgbString(colors.foregroundMuted),
    "--color-pressed": hexToRgbString(colors.pressed),
    "--color-overlay": colors.overlay,
    "--color-overlay-dark": colors.overlayDark,
    "--color-shadow": hexToRgbString(colors.shadow),
    "--color-pr-gold": hexToRgbString(colors.prGold),
  });
}

// Generate NativeWind theme vars from raw colors
export const themes: Record<ColorThemeId, Record<ColorScheme, ReturnType<typeof vars>>> = {
  default: {
    light: createThemeVars(rawColors.default.light),
    dark: createThemeVars(rawColors.default.dark),
  },
  ocean: {
    light: createThemeVars(rawColors.ocean.light),
    dark: createThemeVars(rawColors.ocean.dark),
  },
  forest: {
    light: createThemeVars(rawColors.forest.light),
    dark: createThemeVars(rawColors.forest.dark),
  },
  sunset: {
    light: createThemeVars(rawColors.sunset.light),
    dark: createThemeVars(rawColors.sunset.dark),
  },
  rose: {
    light: createThemeVars(rawColors.rose.light),
    dark: createThemeVars(rawColors.rose.dark),
  },
  violet: {
    light: createThemeVars(rawColors.violet.light),
    dark: createThemeVars(rawColors.violet.dark),
  },
  slate: {
    light: createThemeVars(rawColors.slate.light),
    dark: createThemeVars(rawColors.slate.dark),
  },
};
