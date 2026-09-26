/**
 * Colour roles and the NativeWind variables built from them.
 *
 * The app has one palette, Ink (`designColors` in `lib/design-system/tokens.ts`),
 * in light and dark. The seven selectable legacy palettes were retired in the UI
 * redesign (Phase 7); the stored `settings.color_theme` value is no longer read.
 */

import { vars } from "nativewind";

export type ColorScheme = "light" | "dark";

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
  pbGold: string;
  /** In-progress highlight: live dot and pill accents. */
  live: string;
  /** Tinted fill behind in-progress pills and strips. */
  liveSoft: string;
  /** Text on `liveSoft`. */
  liveInk: string;
  /** Secondary button fill, darker than `surfaceSecondary`. */
  control: string;
  controlBorder: string;
  /** Text and icons on a `destructive` fill. */
  onDestructive: string;
}

function hexToRgbString(hex: string): string {
  // Remove # if present
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export function createThemeVars(colors: RawThemeColors) {
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
    "--color-pb-gold": hexToRgbString(colors.pbGold),
    "--color-live": hexToRgbString(colors.live),
    "--color-live-soft": hexToRgbString(colors.liveSoft),
    "--color-live-ink": hexToRgbString(colors.liveInk),
    "--color-control": hexToRgbString(colors.control),
    "--color-control-border": hexToRgbString(colors.controlBorder),
    "--color-on-destructive": hexToRgbString(colors.onDestructive),
  });
}
