/**
 * Shared color constants for the app
 * 
 * This module consolidates hardcoded colors that were previously
 * scattered across multiple components.
 */

// Primary brand colors
export const colors = {
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
} as const;

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


