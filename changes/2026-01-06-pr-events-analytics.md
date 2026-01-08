# PR Events & Analytics Visualization

**Date:** 2026-01-06

## Summary

Added Personal Record (PR) tracking for rep maxes and implemented an analytics visualization tab for exercise progress tracking.

## Changes

### New Files

- `lib/db/prEvents.ts` - Database operations for PR events (record, query, delete)
- `lib/pr/detection.ts` - PR detection logic for rep maxes (1RM, 2RM, etc.)
- `lib/utils/analytics.ts` - Analytics functions for chart data aggregation

### Database Schema Updates

**`lib/db/connection.ts`:**
- Commented out `best_lifts` table (reserved for future optimization)
- Added index `idx_sets_exercise_reps` on `sets(exercise_id, reps)` for PR queries

**`lib/db/schema.ts`:**
- Added `prEvents` table schema definition for Drizzle ORM
- Added `PREventRow` type export

### Theme Updates

**`lib/theme/colors.ts`:**
- Added `prGold` color for both light (#FFD700) and dark (#B8860B) themes

### Component Updates

**`components/lists/SetItem.tsx`:**
- Added optional `prBadge` prop for displaying PR badges
- Added PR badge styling (gold background, compact design)

**`app/exercise/tabs/RecordTab.tsx`:**
- Integrated PR detection after adding new sets
- Calls `detectAndRecordPRs()` when a set is successfully saved

**`app/exercise/tabs/HistoryTab.tsx`:**
- Fetches PR events for displayed sets
- Uses `SetItem` component with `prBadge` prop for consistent styling
- PR badges (e.g., "1RM", "5RM") display on sets that achieved a new record

**`app/exercise/tabs/VisualisationTab.tsx`:**
- Full implementation of interactive analytics chart
- Metric selector dropdown with options:
  - Max Weight Per Session
  - Estimated 1RM
  - Total Volume
  - Max Reps
  - Number of Sets
- Date range filtering (1W, 1M, 3M, 6M, 1Y, All, Custom)
- Summary statistics (Latest, Best, Sessions count)
- Theme-aware styling throughout

### New Chart Components

**`components/charts/AnalyticsChart.tsx`:**
- Custom SVG-based chart with react-native-svg
- Pinch-to-zoom (1x to 5x) with horizontal pan when zoomed
- Fixed Y-axis during horizontal scroll
- Data point tap interaction to view session details
- Double-tap to reset zoom
- Fullscreen button

**`components/charts/DateRangeSelector.tsx`:**
- Preset buttons (1W, 1M, 3M, 6M, 1Y, All)
- Custom date range picker
- Default 3-month window

**`components/charts/DataPointModal.tsx`:**
- Session details popup when tapping data points
- Shows: date, sets, total reps, max weight, max reps, total volume, best set, estimated 1RM

**`components/charts/FullscreenChart.tsx`:**
- Landscape fullscreen mode
- Uses expo-screen-orientation for orientation lock
- Same interactive features as main chart

### Index Updates

**`lib/db/index.ts`:**
- Added export for `prEvents` module

## PR Detection Logic

PR events are recorded for "rep maxes":
- A **1RM** is the heaviest weight lifted for exactly 1 rep
- A **5RM** is the heaviest weight lifted for exactly 5 reps
- etc.

When a new set is added, the system:
1. Queries all previous sets for the same exercise and rep count
2. Compares the new weight against the historical best
3. If the new weight exceeds the previous best, records a PR event

## Dependencies

- `react-native-svg` - SVG rendering for custom chart
- `react-native-gesture-handler` - Pinch and pan gestures
- `react-native-reanimated` - Smooth zoom/pan animations
- `expo-screen-orientation` - Fullscreen landscape mode

## Chart Features

### Date Range Filtering
- Preset buttons: 1W (1 week), 1M (1 month), 3M (3 months, default), 6M (6 months), 1Y (1 year), All
- Custom date range picker for precise control
- Data stretches to fill available space when fewer points exist

### Interactive Chart
- **Pinch to zoom**: Scale from 1x to 5x horizontally
- **Pan when zoomed**: Scroll through data with fixed Y-axis
- **Tap data points**: View detailed session summary
- **Double-tap**: Reset zoom to default
- **Fullscreen**: Landscape mode for detailed viewing

### Data Point Details
When tapping a data point, displays:
- Session date
- Number of sets performed
- Total reps across all sets
- Maximum weight lifted
- Maximum reps in a single set
- Total volume (weight × reps)
- Best set (highest estimated 1RM)
- Estimated 1RM based on best set

## Future Expansion

The analytics system is designed for easy extension:
- Add new metric types to `lib/utils/analytics.ts`
- Add options to the `metricOptions` array in `VisualisationTab.tsx`
- The `best_lifts` table is preserved in comments for potential caching optimization if performance becomes a concern with large datasets
