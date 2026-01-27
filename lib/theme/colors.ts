/**
 * Color Theme System
 * 
 * This module provides multiple color themes for the app, each following
 * the 60/30/10 design rule:
 * - 60% Primary/dominant (backgrounds, main surfaces)
 * - 30% Secondary (cards, containers, supporting elements)  
 * - 10% Accent (buttons, highlights, interactive elements)
 * 
 * Each theme has both light and dark mode variants.
 */

// ============================================================
// Theme Color Type Definition
// ============================================================

export interface ThemeColors {
  // Primary accent (10% - interactive elements)
  primary: string;
  primaryLight: string;
  
  // Status colors
  success: string;
  warning: string;
  error: string;
  destructive: string;
  
  // Backgrounds (60% - dominant)
  background: string;
  surface: string;
  surfaceSecondary: string;
  
  // Borders (30% - supporting)
  border: string;
  borderLight: string;
  
  // Text colors
  text: string;
  textSecondary: string;
  textTertiary: string;
  textPlaceholder: string;
  textLight: string;
  
  // Interactive states
  pressed: string;
  
  // Overlays
  overlay: string;
  overlayDark: string;
  
  // Shadows
  shadow: string;
  
  // Special
  prGold: string;
}

// ============================================================
// Color Theme ID Type
// ============================================================

export type ColorThemeId = 'default' | 'ocean' | 'forest' | 'sunset' | 'rose' | 'violet' | 'slate';

export const COLOR_THEME_OPTIONS: { id: ColorThemeId; label: string; previewColor: string }[] = [
  { id: 'default', label: 'Default', previewColor: '#007AFF' },
  { id: 'ocean', label: 'Ocean', previewColor: '#0D9488' },
  { id: 'forest', label: 'Forest', previewColor: '#059669' },
  { id: 'sunset', label: 'Sunset', previewColor: '#EA580C' },
  { id: 'rose', label: 'Rose', previewColor: '#E11D48' },
  { id: 'violet', label: 'Violet', previewColor: '#7C3AED' },
  { id: 'slate', label: 'Slate', previewColor: '#475569' },
];

// ============================================================
// DEFAULT Theme (iOS-style Blue)
// ============================================================

const defaultLightColors: ThemeColors = {
  // Primary blue (iOS system blue)
  primary: '#007AFF',
  primaryLight: '#E5F1FF',
  
  // Status colors
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  destructive: '#FF3B30',
  
  // Neutral backgrounds
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceSecondary: '#F9F9F9',
  
  // Borders
  border: '#E5E5EA',
  borderLight: '#F0F0F0',
  
  // Text colors
  text: '#000000',
  textSecondary: '#666666',
  textTertiary: '#999999',
  textPlaceholder: '#999999',
  textLight: '#CCCCCC',
  
  // Interactive states
  pressed: '#E5E5EA',
  
  // Overlay
  overlay: 'rgba(0,0,0,0.3)',
  overlayDark: 'rgba(0,0,0,0.5)',
  
  // Shadows
  shadow: '#000000',
  
  // PR badges
  prGold: '#FFD700',
};

const defaultDarkColors: ThemeColors = {
  // Primary blue (slightly lighter for dark mode)
  primary: '#0A84FF',
  primaryLight: '#1A2744',
  
  // Status colors (adjusted for dark mode)
  success: '#30D158',
  warning: '#FF9F0A',
  error: '#FF453A',
  destructive: '#FF453A',
  
  // Dark backgrounds
  background: '#000000',
  surface: '#1C1C1E',
  surfaceSecondary: '#2C2C2E',
  
  // Borders
  border: '#38383A',
  borderLight: '#2C2C2E',
  
  // Text colors
  text: '#FFFFFF',
  textSecondary: '#EBEBF5',
  textTertiary: '#8E8E93',
  textPlaceholder: '#8E8E93',
  textLight: '#636366',
  
  // Interactive states
  pressed: '#2C2C2E',
  
  // Overlay
  overlay: 'rgba(0,0,0,0.5)',
  overlayDark: 'rgba(0,0,0,0.7)',
  
  // Shadows
  shadow: '#000000',
  
  // PR badges
  prGold: '#B8860B',
};

// ============================================================
// OCEAN Theme (Teal/Cyan)
// ============================================================

const oceanLightColors: ThemeColors = {
  primary: '#0D9488',
  primaryLight: '#CCFBF1',
  
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  destructive: '#EF4444',
  
  background: '#F0FDFA',
  surface: '#FFFFFF',
  surfaceSecondary: '#F5FFFE',
  
  border: '#99F6E4',
  borderLight: '#CCFBF1',
  
  text: '#134E4A',
  textSecondary: '#5EEAD4',
  textTertiary: '#99F6E4',
  textPlaceholder: '#5EEAD4',
  textLight: '#CCFBF1',
  
  pressed: '#CCFBF1',
  
  overlay: 'rgba(13,148,136,0.2)',
  overlayDark: 'rgba(13,148,136,0.4)',
  
  shadow: '#0D9488',
  
  prGold: '#FBBF24',
};

const oceanDarkColors: ThemeColors = {
  primary: '#2DD4BF',
  primaryLight: '#134E4A',
  
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  destructive: '#F87171',
  
  background: '#042F2E',
  surface: '#0D3D3B',
  surfaceSecondary: '#115E59',
  
  border: '#115E59',
  borderLight: '#0D3D3B',
  
  text: '#F0FDFA',
  textSecondary: '#99F6E4',
  textTertiary: '#5EEAD4',
  textPlaceholder: '#5EEAD4',
  textLight: '#2DD4BF',
  
  pressed: '#115E59',
  
  overlay: 'rgba(45,212,191,0.2)',
  overlayDark: 'rgba(45,212,191,0.4)',
  
  shadow: '#000000',
  
  prGold: '#FBBF24',
};

// ============================================================
// FOREST Theme (Emerald Green)
// ============================================================

const forestLightColors: ThemeColors = {
  primary: '#059669',
  primaryLight: '#D1FAE5',
  
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  destructive: '#EF4444',
  
  background: '#ECFDF5',
  surface: '#FFFFFF',
  surfaceSecondary: '#F0FDF9',
  
  border: '#A7F3D0',
  borderLight: '#D1FAE5',
  
  text: '#064E3B',
  textSecondary: '#047857',
  textTertiary: '#6EE7B7',
  textPlaceholder: '#6EE7B7',
  textLight: '#A7F3D0',
  
  pressed: '#D1FAE5',
  
  overlay: 'rgba(5,150,105,0.2)',
  overlayDark: 'rgba(5,150,105,0.4)',
  
  shadow: '#059669',
  
  prGold: '#FBBF24',
};

const forestDarkColors: ThemeColors = {
  primary: '#34D399',
  primaryLight: '#064E3B',
  
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',
  destructive: '#F87171',
  
  background: '#022C22',
  surface: '#064E3B',
  surfaceSecondary: '#065F46',
  
  border: '#065F46',
  borderLight: '#064E3B',
  
  text: '#ECFDF5',
  textSecondary: '#A7F3D0',
  textTertiary: '#6EE7B7',
  textPlaceholder: '#6EE7B7',
  textLight: '#34D399',
  
  pressed: '#065F46',
  
  overlay: 'rgba(52,211,153,0.2)',
  overlayDark: 'rgba(52,211,153,0.4)',
  
  shadow: '#000000',
  
  prGold: '#FBBF24',
};

// ============================================================
// SUNSET Theme (Orange/Amber)
// ============================================================

const sunsetLightColors: ThemeColors = {
  primary: '#EA580C',
  primaryLight: '#FFEDD5',
  
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#DC2626',
  destructive: '#DC2626',
  
  background: '#FFF7ED',
  surface: '#FFFFFF',
  surfaceSecondary: '#FFFAF5',
  
  border: '#FED7AA',
  borderLight: '#FFEDD5',
  
  text: '#7C2D12',
  textSecondary: '#C2410C',
  textTertiary: '#FB923C',
  textPlaceholder: '#FB923C',
  textLight: '#FED7AA',
  
  pressed: '#FFEDD5',
  
  overlay: 'rgba(234,88,12,0.2)',
  overlayDark: 'rgba(234,88,12,0.4)',
  
  shadow: '#EA580C',
  
  prGold: '#F59E0B',
};

const sunsetDarkColors: ThemeColors = {
  primary: '#FB923C',
  primaryLight: '#7C2D12',
  
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',
  destructive: '#F87171',
  
  background: '#431407',
  surface: '#7C2D12',
  surfaceSecondary: '#9A3412',
  
  border: '#9A3412',
  borderLight: '#7C2D12',
  
  text: '#FFF7ED',
  textSecondary: '#FED7AA',
  textTertiary: '#FDBA74',
  textPlaceholder: '#FDBA74',
  textLight: '#FB923C',
  
  pressed: '#9A3412',
  
  overlay: 'rgba(251,146,60,0.2)',
  overlayDark: 'rgba(251,146,60,0.4)',
  
  shadow: '#000000',
  
  prGold: '#FBBF24',
};

// ============================================================
// ROSE Theme (Pink/Rose)
// ============================================================

const roseLightColors: ThemeColors = {
  primary: '#E11D48',
  primaryLight: '#FFE4E6',
  
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#DC2626',
  destructive: '#DC2626',
  
  background: '#FFF1F2',
  surface: '#FFFFFF',
  surfaceSecondary: '#FFF5F6',
  
  border: '#FECDD3',
  borderLight: '#FFE4E6',
  
  text: '#881337',
  textSecondary: '#BE123C',
  textTertiary: '#FB7185',
  textPlaceholder: '#FB7185',
  textLight: '#FECDD3',
  
  pressed: '#FFE4E6',
  
  overlay: 'rgba(225,29,72,0.2)',
  overlayDark: 'rgba(225,29,72,0.4)',
  
  shadow: '#E11D48',
  
  prGold: '#FBBF24',
};

const roseDarkColors: ThemeColors = {
  primary: '#FB7185',
  primaryLight: '#881337',
  
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',
  destructive: '#F87171',
  
  background: '#4C0519',
  surface: '#881337',
  surfaceSecondary: '#9F1239',
  
  border: '#9F1239',
  borderLight: '#881337',
  
  text: '#FFF1F2',
  textSecondary: '#FECDD3',
  textTertiary: '#FDA4AF',
  textPlaceholder: '#FDA4AF',
  textLight: '#FB7185',
  
  pressed: '#9F1239',
  
  overlay: 'rgba(251,113,133,0.2)',
  overlayDark: 'rgba(251,113,133,0.4)',
  
  shadow: '#000000',
  
  prGold: '#FBBF24',
};

// ============================================================
// VIOLET Theme (Purple)
// ============================================================

const violetLightColors: ThemeColors = {
  primary: '#7C3AED',
  primaryLight: '#EDE9FE',
  
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  destructive: '#EF4444',
  
  background: '#F5F3FF',
  surface: '#FFFFFF',
  surfaceSecondary: '#FAF8FF',
  
  border: '#DDD6FE',
  borderLight: '#EDE9FE',
  
  text: '#4C1D95',
  textSecondary: '#6D28D9',
  textTertiary: '#A78BFA',
  textPlaceholder: '#A78BFA',
  textLight: '#DDD6FE',
  
  pressed: '#EDE9FE',
  
  overlay: 'rgba(124,58,237,0.2)',
  overlayDark: 'rgba(124,58,237,0.4)',
  
  shadow: '#7C3AED',
  
  prGold: '#FBBF24',
};

const violetDarkColors: ThemeColors = {
  primary: '#A78BFA',
  primaryLight: '#4C1D95',
  
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',
  destructive: '#F87171',
  
  background: '#2E1065',
  surface: '#4C1D95',
  surfaceSecondary: '#5B21B6',
  
  border: '#5B21B6',
  borderLight: '#4C1D95',
  
  text: '#F5F3FF',
  textSecondary: '#DDD6FE',
  textTertiary: '#C4B5FD',
  textPlaceholder: '#C4B5FD',
  textLight: '#A78BFA',
  
  pressed: '#5B21B6',
  
  overlay: 'rgba(167,139,250,0.2)',
  overlayDark: 'rgba(167,139,250,0.4)',
  
  shadow: '#000000',
  
  prGold: '#FBBF24',
};

// ============================================================
// SLATE Theme (Neutral/Minimal)
// ============================================================

const slateLightColors: ThemeColors = {
  primary: '#475569',
  primaryLight: '#F1F5F9',
  
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  destructive: '#EF4444',
  
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1F5F9',
  
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  
  text: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  textPlaceholder: '#94A3B8',
  textLight: '#CBD5E1',
  
  pressed: '#E2E8F0',
  
  overlay: 'rgba(71,85,105,0.2)',
  overlayDark: 'rgba(71,85,105,0.4)',
  
  shadow: '#475569',
  
  prGold: '#FBBF24',
};

const slateDarkColors: ThemeColors = {
  primary: '#94A3B8',
  primaryLight: '#1E293B',
  
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',
  destructive: '#F87171',
  
  background: '#020617',
  surface: '#0F172A',
  surfaceSecondary: '#1E293B',
  
  border: '#334155',
  borderLight: '#1E293B',
  
  text: '#F8FAFC',
  textSecondary: '#E2E8F0',
  textTertiary: '#94A3B8',
  textPlaceholder: '#94A3B8',
  textLight: '#64748B',
  
  pressed: '#334155',
  
  overlay: 'rgba(148,163,184,0.2)',
  overlayDark: 'rgba(148,163,184,0.4)',
  
  shadow: '#000000',
  
  prGold: '#FBBF24',
};

// ============================================================
// Theme Registry
// ============================================================

export const colorThemes: Record<ColorThemeId, { light: ThemeColors; dark: ThemeColors }> = {
  default: { light: defaultLightColors, dark: defaultDarkColors },
  ocean: { light: oceanLightColors, dark: oceanDarkColors },
  forest: { light: forestLightColors, dark: forestDarkColors },
  sunset: { light: sunsetLightColors, dark: sunsetDarkColors },
  rose: { light: roseLightColors, dark: roseDarkColors },
  violet: { light: violetLightColors, dark: violetDarkColors },
  slate: { light: slateLightColors, dark: slateDarkColors },
};

// ============================================================
// Theme Getter Function
// ============================================================

/**
 * Get theme colors based on dark mode preference and color theme
 * @param isDark - Whether dark mode is active
 * @param themeId - The color theme to use (defaults to 'default')
 * @returns Color object for the specified theme and mode
 */
export function getThemeColors(isDark: boolean, themeId: ColorThemeId = 'default'): ThemeColors {
  const theme = colorThemes[themeId] ?? colorThemes.default;
  return isDark ? theme.dark : theme.light;
}

// ============================================================
// Legacy Exports (for backward compatibility)
// ============================================================

// Light theme colors (default theme)
export const lightColors = defaultLightColors;

// Dark theme colors (default theme)
export const darkColors = defaultDarkColors;

// Default export for backward compatibility
export const colors = lightColors;

// Semantic color aliases for specific use cases
export const semantic = {
  // Buttons
  buttonPrimary: colors.primary,
  buttonDestructive: colors.destructive,
  buttonSecondary: colors.surfaceSecondary,
  
  // Timer
  timerActive: colors.primary,
  timerInactive: colors.surfaceSecondary,
  
  // Status badges
  inProgress: colors.primary,
  completed: colors.success,
  
  // Cards
  cardBackground: colors.surface,
  cardBorder: colors.border,
  
  // Header
  headerBackground: colors.background,
} as const;

// Type for color keys
export type ColorKey = keyof typeof colors;
export type SemanticColorKey = keyof typeof semantic;
