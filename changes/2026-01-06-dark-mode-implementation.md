# Dark Mode Implementation

**Date:** January 6, 2026

## Overview

Added comprehensive dark mode support throughout the WorkoutLog app. The theme system defaults to the device's system settings but allows manual override from the Settings page.

## Architecture

### Theme Context (`lib/theme/ThemeContext.tsx`)

The app uses React Context to provide theme information globally:

```typescript
import { useTheme } from '../lib/theme/ThemeContext';

const { themeColors, isDark, themePreference, setThemePreference } = useTheme();
```

- **`themeColors`**: The current color palette based on light/dark mode
- **`isDark`**: Boolean indicating if dark mode is active
- **`themePreference`**: Current setting: `'system'` | `'light'` | `'dark'`
- **`setThemePreference`**: Function to update the theme preference

### Color System (`lib/theme/colors.ts`)

Two color palettes are defined:
- `lightColors`: Colors optimized for light mode
- `darkColors`: Colors optimized for dark mode (OLED-friendly pure black backgrounds)

Key color tokens:
- `background`: Main background color
- `surface`: Card/container backgrounds
- `surfaceSecondary`: Secondary surfaces (inputs, etc.)
- `text`: Primary text
- `textSecondary`: Secondary text (subtitles, labels)
- `textTertiary`: Tertiary text (placeholders, disabled)
- `textPlaceholder`: Input placeholder text
- `primary`: Brand/action color (blue)
- `border`: Border colors
- `error`/`destructive`: Error states
- `success`/`warning`: Status indicators

### Database Persistence

Theme preference is stored in SQLite via `lib/db/settings.ts`:
- `getThemePreference()`: Read current preference
- `setThemePreference(preference)`: Save preference

## Files Modified

### Core Theme System
- `lib/theme/ThemeContext.tsx` - Theme provider and hook
- `lib/theme/colors.ts` - Color palettes
- `lib/db/settings.ts` - Theme preference persistence
- `lib/db/connection.ts` - Added `theme_preference` column migration

### App Layout
- `app/_layout.tsx` - ThemeProvider wrapper, StatusBar styling
- `app/(tabs)/_layout.tsx` - Tab bar theming

### Tab Screens
- `app/(tabs)/index.tsx` - Overview page
- `app/(tabs)/exercises.tsx` - Exercises list
- `app/(tabs)/programs.tsx` - Programs page
- `app/(tabs)/settings.tsx` - Settings with theme picker

### Exercise Screens
- `app/exercise/[id].tsx` - Exercise modal
- `app/exercise/tabs/RecordTab.tsx` - Recording tab
- `app/exercise/tabs/HistoryTab.tsx` - History tab
- `app/exercise/tabs/VisualisationTab.tsx` - Charts tab
- `app/edit-workout.tsx` - Edit workout screen

### Components
- `components/modals/BaseModal.tsx` - Base modal wrapper
- `components/modals/EditSetModal.tsx` - Set editing modal
- `components/modals/DatePickerModal.tsx` - Date picker modal
- `components/lists/SetItem.tsx` - Set display component
- `components/AddExerciseModal.tsx` - Add exercise modal
- `components/PinnedExercisesOverlay.tsx` - Pinned exercises panel
- `components/TimerModal.tsx` - Rest timer modal

## Implementation Pattern

All components follow this pattern:

```typescript
import { useTheme } from '../lib/theme/ThemeContext';

export default function MyComponent() {
  const { themeColors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Text style={[styles.title, { color: themeColors.text }]}>
        Hello World
      </Text>
      <TextInput
        style={[styles.input, { 
          borderColor: themeColors.border,
          backgroundColor: themeColors.surface,
          color: themeColors.text 
        }]}
        placeholderTextColor={themeColors.textPlaceholder}
        placeholder="Enter text..."
      />
    </View>
  );
}

// Static styles (non-color related)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
});
```

## Key Decisions

1. **Inline style overrides**: Rather than creating dynamic StyleSheets inside components, we use style arrays to merge static styles with theme-dependent colors.

2. **OLED-optimized dark mode**: Using pure black (`#000000`) for backgrounds to save battery on OLED screens.

3. **System default**: The app respects device settings by default using `useColorScheme()` hook.

4. **Immediate persistence**: Theme changes are saved to the database immediately for persistence across app restarts.

5. **No flash on load**: ThemeProvider delays rendering until preference is loaded from the database.

