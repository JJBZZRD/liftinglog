import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useColorScheme } from "react-native";
import { getThemePreference, setThemePreference, type ThemePreference } from "../db/settings";
import { getThemeColors, type lightColors } from "./colors";

export type ThemeColors = typeof lightColors;

type ThemeContextType = {
  isDark: boolean;
  themeColors: ThemeColors;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>("system");
  const [isInitialized, setIsInitialized] = useState(false);

  // Load theme preference from database on mount
  useEffect(() => {
    const loadThemePreference = () => {
      try {
        const preference = getThemePreference();
        setThemePreferenceState(preference);
      } catch (error) {
        console.error("Error loading theme preference:", error);
        setThemePreferenceState("system");
      } finally {
        setIsInitialized(true);
      }
    };
    loadThemePreference();
  }, []);

  // Determine if dark mode should be active
  const isDark =
    themePreference === "dark" ||
    (themePreference === "system" && systemColorScheme === "dark");

  // Get theme colors based on dark mode state
  const themeColors = getThemeColors(isDark);

  // Update theme preference (both state and database)
  const updateThemePreference = (preference: ThemePreference) => {
    setThemePreferenceState(preference);
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
        themeColors,
        themePreference,
        setThemePreference: updateThemePreference,
      }}
    >
      {children}
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

