import { useColorScheme } from "nativewind";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { designColors } from "../design-system/tokens";
import { getThemePreference, setThemePreference, type ThemePreference } from "../db/settings";
import { createThemeVars, type RawThemeColors, type ColorScheme } from "./themes";

// Re-export types for convenience
export type { ColorScheme, RawThemeColors };

/** NativeWind variables for the Ink palette, built once per mode. */
const themeVars: Record<ColorScheme, ReturnType<typeof createThemeVars>> = {
  light: createThemeVars(designColors.light),
  dark: createThemeVars(designColors.dark),
};

type ThemeContextType = {
  /** Whether dark mode is active */
  isDark: boolean;
  /** Current color scheme ('light' or 'dark') */
  colorScheme: ColorScheme;
  /** User's theme preference ('system', 'light', or 'dark') */
  themePreference: ThemePreference;
  /** Raw color values for non-Tailwind use cases (SVG, charts, etc.) */
  rawColors: RawThemeColors;
  /** Set the light/dark mode preference */
  setThemePreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme: nativewindColorScheme, setColorScheme } = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>("system");
  const [isInitialized, setIsInitialized] = useState(false);

  // Load theme preferences from database on mount
  useEffect(() => {
    const loadThemePreferences = () => {
      try {
        const preference = getThemePreference();
        setThemePreferenceState(preference);
        
        // Apply the preference to NativeWind
        if (preference === "light" || preference === "dark") {
          setColorScheme(preference);
        } else {
          setColorScheme("system");
        }
      } catch (error) {
        console.error("Error loading theme preferences:", error);
        setThemePreferenceState("system");
      } finally {
        setIsInitialized(true);
      }
    };
    loadThemePreferences();
  }, [setColorScheme]);

  // Determine the effective color scheme
  const effectiveColorScheme: ColorScheme = nativewindColorScheme === "dark" ? "dark" : "light";
  const isDark = effectiveColorScheme === "dark";

  // Raw colors for non-Tailwind use cases (SVG, charts, inline styles)
  const rawColors: RawThemeColors = designColors[effectiveColorScheme];

  // Update theme preference (both state and database)
  const updateThemePreference = (preference: ThemePreference) => {
    setThemePreferenceState(preference);
    
    // Apply to NativeWind
    if (preference === "light" || preference === "dark") {
      setColorScheme(preference);
    } else {
      setColorScheme("system");
    }
    
    try {
      setThemePreference(preference);
    } catch (error) {
      console.error("Error saving theme preference:", error);
    }
  };

  // Don't render until initialized to avoid flash
  if (!isInitialized) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        colorScheme: effectiveColorScheme,
        themePreference,
        rawColors,
        setThemePreference: updateThemePreference,
      }}
    >
      <View style={themeVars[effectiveColorScheme]} className="flex-1">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Scope a subtree to specific colours, such as the catalog's side-by-side light and dark previews.
 * Fills its parent by default; pass `style` (for example `{ flex: 0 }`) to size a scope to its content.
 */
export function ThemeColorScope({ colors, children, style }: { colors: RawThemeColors; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const parent = useTheme();
  return (
    <ThemeContext.Provider value={{ ...parent, rawColors: colors }}>
      <View style={[{ flex: 1, backgroundColor: colors.background }, createThemeVars(colors), style]}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

/**
 * Hook to get raw color values for non-Tailwind use cases
 * (SVG fills, chart colors, third-party components, etc.)
 */
export function useRawColors(): RawThemeColors {
  const { rawColors } = useTheme();
  return rawColors;
}
