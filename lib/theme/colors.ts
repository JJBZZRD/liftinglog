/**
 * Shared color constants for the app
 * 
 * This module consolidates hardcoded colors that were previously
 * scattered across multiple components.
 */

// Light theme colors
export const lightColors = {
  // Primary blue (iOS system blue)
  primary: '#007AFF',
  primaryLight: '#f0f7ff',
  
  // Status colors
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  destructive: '#FF3B30',
  
  // Neutral grays
  background: '#f5f5f5',
  surface: '#fff',
  surfaceSecondary: '#f9f9f9',
  
  // Borders
  border: '#e5e5ea',
  borderLight: '#f0f0f0',
  
  // Text colors
  text: '#000',
  textSecondary: '#666',
  textTertiary: '#999',
  textPlaceholder: '#999',
  textLight: '#ccc',
  
  // Interactive states
  pressed: '#e5e5ea',
  
  // Overlay
  overlay: 'rgba(0,0,0,0.3)',
  overlayDark: 'rgba(0,0,0,0.5)',
  
  // Shadows (for shadow color property)
  shadow: '#000',
  
  // PR badges
  prGold: '#FFD700',
} as const;

// Dark theme colors
export const darkColors = {
  // Primary blue (iOS system blue) - slightly lighter for dark mode
  primary: '#0A84FF',
  primaryLight: '#1a1a2e',
  
  // Status colors (slightly adjusted for dark mode)
  success: '#30D158',
  warning: '#FF9F0A',
  error: '#FF453A',
  destructive: '#FF453A',
  
  // Neutral grays (inverted for dark mode)
  background: '#000000',
  surface: '#1c1c1e',
  surfaceSecondary: '#2c2c2e',
  
  // Borders
  border: '#38383a',
  borderLight: '#2c2c2e',
  
  // Text colors (inverted for dark mode)
  text: '#ffffff',
  textSecondary: '#ebebf5',
  textTertiary: '#8e8e93',
  textPlaceholder: '#8e8e93',
  textLight: '#636366',
  
  // Interactive states
  pressed: '#2c2c2e',
  
  // Overlay
  overlay: 'rgba(0,0,0,0.5)',
  overlayDark: 'rgba(0,0,0,0.7)',
  
  // Shadows (for shadow color property)
  shadow: '#000',
  
  // PR badges
  prGold: '#B8860B',
} as const;

// Default export for backward compatibility (light theme)
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

/**
 * Get theme colors based on dark mode preference
 * @param isDark - Whether dark mode is active
 * @returns Color object for the specified theme
 */
export function getThemeColors(isDark: boolean) {
  return isDark ? darkColors : lightColors;
}

// Type for color keys
export type ColorKey = keyof typeof colors;
export type SemanticColorKey = keyof typeof semantic;





