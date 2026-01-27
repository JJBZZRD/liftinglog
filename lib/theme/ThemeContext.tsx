import { useColorScheme } from "nativewind";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { View } from "react-native";
import { 
  getThemePreference, 
  setThemePreference, 
  getColorTheme, 
  setColorTheme as setColorThemeDB,
  type ThemePreference,
  type ColorThemeId 
} from "../db/settings";
import { themes, getRawThemeColors, type RawThemeColors, type ColorScheme } from "./themes";

// Re-export types for convenience
export type { ColorThemeId, ColorScheme, RawThemeColors };

type ThemeContextType = {
  /** Whether dark mode is active */
  isDark: boolean;
  /** Current color scheme ('light' or 'dark') */
  colorScheme: ColorScheme;
  /** Current color theme ID */
  colorTheme: ColorThemeId;
  /** User's theme preference ('system', 'light', or 'dark') */
  themePreference: ThemePreference;
  /** Raw color values for non-Tailwind use cases (SVG, charts, etc.) */
  rawColors: RawThemeColors;
  /** Set the light/dark mode preference */
  setThemePreference: (preference: ThemePreference) => void;
  /** Set the color theme */
  setColorTheme: (theme: ColorThemeId) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme: nativewindColorScheme, setColorScheme } = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>("system");
  const [colorTheme, setColorThemeState] = useState<ColorThemeId>("default");
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
        
        const theme = getColorTheme();
        setColorThemeState(theme);
      } catch (error) {
        console.error("Error loading theme preferences:", error);
        setThemePreferenceState("system");
        setColorThemeState("default");
      } finally {
        setIsInitialized(true);
      }
    };
    loadThemePreferences();
  }, [setColorScheme]);

  // Determine the effective color scheme
  const effectiveColorScheme: ColorScheme = nativewindColorScheme === "dark" ? "dark" : "light";
  const isDark = effectiveColorScheme === "dark";

  // Get theme vars for the current theme and color scheme
  const themeVars = themes[colorTheme]?.[effectiveColorScheme] ?? themes.default[effectiveColorScheme];

  // Get raw colors for non-Tailwind use cases
  const rawColors = getRawThemeColors(colorTheme, effectiveColorScheme);

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

  // Update color theme (both state and database)
  const updateColorTheme = (theme: ColorThemeId) => {
    setColorThemeState(theme);
    try {
      setColorThemeDB(theme);
    } catch (error) {
      console.error("Error saving color theme:", error);
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
        colorTheme,
        rawColors,
        setThemePreference: updateThemePreference,
        setColorTheme: updateColorTheme,
      }}
    >
      <View style={themeVars} className="flex-1">
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
 * Hook to get raw color values for non-Tailwind use cases
 * (SVG fills, chart colors, third-party components, etc.)
 */
export function useRawColors(): RawThemeColors {
  const { rawColors } = useTheme();
  return rawColors;
}
