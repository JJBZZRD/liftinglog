/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Background colors (60% - dominant)
        background: "rgb(var(--color-background) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-secondary": "rgb(var(--color-surface-secondary) / <alpha-value>)",
        
        // Foreground/Text colors
        foreground: "rgb(var(--color-foreground) / <alpha-value>)",
        "foreground-secondary": "rgb(var(--color-foreground-secondary) / <alpha-value>)",
        "foreground-muted": "rgb(var(--color-foreground-muted) / <alpha-value>)",
        
        // Primary accent (10% - interactive)
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-light": "rgb(var(--color-primary-light) / <alpha-value>)",
        "primary-foreground": "rgb(var(--color-primary-foreground) / <alpha-value>)",
        
        // Status colors
        success: "rgb(var(--color-success) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        destructive: "rgb(var(--color-destructive) / <alpha-value>)",
        
        // Border colors
        border: "rgb(var(--color-border) / <alpha-value>)",
        "border-light": "rgb(var(--color-border-light) / <alpha-value>)",
        
        // Interactive states
        pressed: "rgb(var(--color-pressed) / <alpha-value>)",
        
        // Special
        "pr-gold": "rgb(var(--color-pr-gold) / <alpha-value>)",
      },
      backgroundColor: {
        overlay: "var(--color-overlay)",
        "overlay-dark": "var(--color-overlay-dark)",
      },
      boxShadowColor: {
        shadow: "var(--color-shadow)",
      },
    },
  },
  plugins: [],
};
