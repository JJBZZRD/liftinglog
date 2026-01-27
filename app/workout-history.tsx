import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import DatePickerModal from "../components/modals/DatePickerModal";
import {
  getWorkoutDayDetails,
  listWorkoutDays,
  searchWorkoutDays,
  type WorkoutDayDetails,
  type WorkoutDaySummary,
} from "../lib/db/workouts";
import { useTheme, type RawThemeColors } from "../lib/theme/ThemeContext";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PAGE_SIZE = 20;
const COLLAPSED_ITEM_HEIGHT = 88; // Approximate height of collapsed card + margin

// Date range presets
type DateRangePreset = "1w" | "1m" | "3m" | "6m" | "1y" | "all" | "custom";

interface DateRangeState {
  preset: DateRangePreset;
  startDate: Date | null;
  endDate: Date | null;
}

const presets: { id: DateRangePreset; label: string; days: number | null }[] = [
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "6m", label: "6M", days: 180 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: null },
];

// Precomputed display item with formatted labels
interface WorkoutDayDisplayItem extends WorkoutDaySummary {
  formattedDate: string;
  formattedFullDate: string;
  exerciseCountLabel: string;
}

// Precompute date labels to avoid formatting during render
function computeDisplayItem(item: WorkoutDaySummary): WorkoutDayDisplayItem {
  const date = new Date(item.displayDate);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let formattedDate: string;
  if (date.toDateString() === today.toDateString()) {
    formattedDate = "Today";
  } else if (date.toDateString() === yesterday.toDateString()) {
    formattedDate = "Yesterday";
  } else {
    formattedDate = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  return {
    ...item,
    formattedDate,
    formattedFullDate: date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    exerciseCountLabel: `${item.totalExercises} exercise${item.totalExercises !== 1 ? "s" : ""}`,
  };
}

// Helper to get alphabet letter
const getAlphabetLetter = (index: number) => String.fromCharCode(65 + index);

// =============================================================================
// WorkoutDayCard - Memoized list item component
// =============================================================================

interface WorkoutDayCardProps {
  item: WorkoutDayDisplayItem;
  isExpanded: boolean;
  details: WorkoutDayDetails | undefined;
  isLoadingDetails: boolean;
  onToggle: () => void;
  onContentPress: () => void;
  rawColors: RawThemeColors;
}

const WorkoutDayCard = React.memo(function WorkoutDayCard({
  item,
  isExpanded,
  details,
  isLoadingDetails,
  onToggle,
  onContentPress,
  rawColors,
}: WorkoutDayCardProps) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: rawColors.surface, shadowColor: rawColors.shadow },
      ]}
    >
      {/* Summary Header - Pressable for expand/collapse */}
      <Pressable onPress={onToggle} style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={[styles.cardDate, { color: rawColors.foreground }]}>
            {item.formattedDate}
          </Text>
          <Text style={[styles.cardFullDate, { color: rawColors.foregroundSecondary }]}>
            {item.formattedFullDate}
          </Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <View style={styles.statBadge}>
            <Text style={[styles.statBadgeText, { color: rawColors.foregroundSecondary }]}>
              {item.exerciseCountLabel}
            </Text>
          </View>
          <MaterialCommunityIcons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={24}
            color={rawColors.foregroundSecondary}
          />
        </View>
      </Pressable>

      {/* Expanded Content - Pressable for navigation to detail page */}
      {isExpanded && (
        <Pressable onPress={onContentPress} style={styles.expandedContent}>
          {isLoadingDetails ? (
            <View style={styles.cardLoadingContainer}>
              <ActivityIndicator size="small" color={rawColors.primary} />
            </View>
          ) : details ? (
            <>
              {/* Stats Row */}
              <View style={[styles.statsRow, { borderColor: rawColors.border }]}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: rawColors.foreground }]}>
                    {details.exercises.length}
                  </Text>
                  <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>
                    Exercises
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: rawColors.foreground }]}>
                    {details.totalVolumeKg.toLocaleString()}
                  </Text>
                  <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>
                    Volume (kg)
                  </Text>
                </View>
                {details.bestE1rmKg && (
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: rawColors.foreground }]}>
                      {details.bestE1rmKg}
                    </Text>
                    <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>
                      Best e1RM
                    </Text>
                  </View>
                )}
              </View>

              {/* Exercise List */}
              <View style={styles.exerciseList}>
                {details.exercises.map((exercise, index) => (
                  <View key={exercise.workoutExerciseId} style={styles.exerciseItem}>
                    <View style={[styles.alphabetCircle, { backgroundColor: rawColors.primary }]}>
                      <Text style={styles.alphabetText}>{getAlphabetLetter(index)}</Text>
                    </View>
                    <View style={styles.exerciseDetails}>
                      <Text
                        style={[styles.exerciseName, { color: rawColors.foreground }]}
                        numberOfLines={1}
                      >
                        {exercise.exerciseName}
                      </Text>
                      <Text style={[styles.bestSetText, { color: rawColors.foregroundSecondary }]}>
                        {exercise.bestSet
                          ? `Best: ${exercise.bestSet.weightKg} kg × ${exercise.bestSet.reps} (e1RM ${exercise.bestSet.e1rm} kg)`
                          : "No sets recorded"}
                      </Text>
                      {exercise.note && (
                        <Text
                          style={[styles.exerciseNote, { color: rawColors.foregroundMuted }]}
                          numberOfLines={2}
                        >
                          {exercise.note}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}

                {details.hasMoreExercises && (
                  <Text style={[styles.showMoreText, { color: rawColors.foregroundMuted }]}>
                    Showing first 26 exercises
                  </Text>
                )}
              </View>
            </>
          ) : null}
        </Pressable>
      )}
    </View>
  );
});

// =============================================================================
// Main Screen Component
// =============================================================================

export default function WorkoutHistoryScreen() {
  const { rawColors } = useTheme();

  // List data
  const [workoutDays, setWorkoutDays] = useState<WorkoutDaySummary[]>([]);

  // Single expanded card (only one at a time)
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);

  // Cache details by dayKey to avoid repeated DB calls
  const [detailsCache, setDetailsCache] = useState<Map<string, WorkoutDayDetails>>(new Map());
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  // Search and filter
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeState>({
    preset: "all",
    startDate: null,
    endDate: null,
  });

  // Date picker modals
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<Date>(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
  const [tempEndDate, setTempEndDate] = useState<Date>(new Date());

  // Loading states
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Pagination guard to prevent concurrent fetches
  const isFetchingRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Compute date range timestamps
  const dateRangeTimestamps = useMemo(() => {
    let startTs: number | null = null;
    let endTs: number | null = null;

    if (dateRange.preset === "custom") {
      if (dateRange.startDate) {
        const d = new Date(dateRange.startDate);
        d.setHours(0, 0, 0, 0);
        startTs = d.getTime();
      }
      if (dateRange.endDate) {
        const d = new Date(dateRange.endDate);
        d.setHours(23, 59, 59, 999);
        endTs = d.getTime();
      }
    } else if (dateRange.preset !== "all") {
      const presetConfig = presets.find((p) => p.id === dateRange.preset);
      if (presetConfig?.days) {
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        endTs = now.getTime();
        startTs = now.getTime() - presetConfig.days * 24 * 60 * 60 * 1000;
      }
    }

    return { startDate: startTs, endDate: endTs };
  }, [dateRange]);

  // Precompute display items with formatted labels
  const displayItems = useMemo(
    () => workoutDays.map(computeDisplayItem),
    [workoutDays]
  );

  // Dedupe helper: merge new days into existing list by unique key
  const mergeWorkoutDays = useCallback(
    (existing: WorkoutDaySummary[], incoming: WorkoutDaySummary[]): WorkoutDaySummary[] => {
      const map = new Map<string, WorkoutDaySummary>();
      // Add existing items first
      for (const item of existing) {
        const key = `${item.dayKey}-${item.displayDate}`;
        map.set(key, item);
      }
      // Merge incoming items (overwrites if duplicate key)
      for (const item of incoming) {
        const key = `${item.dayKey}-${item.displayDate}`;
        map.set(key, item);
      }
      // Convert back to array and sort by dayKey descending
      return Array.from(map.values()).sort((a, b) => b.dayKey.localeCompare(a.dayKey));
    },
    []
  );

  // Load workout days
  const loadWorkoutDays = useCallback(async (reset = true) => {
    // Guard against concurrent fetches
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (reset) {
      setLoading(true);
      setHasMore(true);
      setWorkoutDays([]); // Clear list on reset
    } else {
      setLoadingMore(true);
    }

    try {
      const offset = reset ? 0 : workoutDays.length;
      const { startDate, endDate } = dateRangeTimestamps;

      const days =
        debouncedQuery || startDate || endDate
          ? await searchWorkoutDays({
              query: debouncedQuery,
              startDate,
              endDate,
              limit: PAGE_SIZE,
              offset,
            })
          : await listWorkoutDays({ limit: PAGE_SIZE, offset });

      if (reset) {
        setWorkoutDays(days);
      } else {
        // Dedupe merge to prevent duplicate keys
        setWorkoutDays((prev) => mergeWorkoutDays(prev, days));
      }

      setHasMore(days.length === PAGE_SIZE);

      // DEV: Check for duplicates
      if (__DEV__) {
        const allDays = reset ? days : mergeWorkoutDays(workoutDays, days);
        const keys = allDays.map((d) => `${d.dayKey}-${d.displayDate}`);
        const uniqueKeys = new Set(keys);
        if (uniqueKeys.size !== keys.length) {
          console.warn("[WorkoutHistory] Duplicate keys detected:", keys.filter((k, i) => keys.indexOf(k) !== i));
        }
      }
    } catch (error) {
      console.error("Error loading workout days:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [debouncedQuery, dateRangeTimestamps, workoutDays, mergeWorkoutDays]);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      loadWorkoutDays(true);
    }, [debouncedQuery, dateRangeTimestamps])
  );

  // Handle card press (expand/collapse)
  const handleCardPress = useCallback(async (dayKey: string) => {
    // Same card: collapse
    if (expandedDayKey === dayKey) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedDayKey(null);
      return;
    }

    // Different card: collapse previous, expand new
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDayKey(dayKey);

    // Load details if not cached
    if (!detailsCache.has(dayKey)) {
      setLoadingDetails(dayKey);
      try {
        const details = await getWorkoutDayDetails(dayKey);
        setDetailsCache((prev) => new Map(prev).set(dayKey, details));
      } catch (error) {
        console.error("Error loading workout details:", error);
      } finally {
        setLoadingDetails(null);
      }
    }
  }, [expandedDayKey, detailsCache]);

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      loadWorkoutDays(false);
    }
  }, [loadingMore, hasMore, loading, loadWorkoutDays]);

  // Stable keyExtractor - use composite key to ensure uniqueness
  const keyExtractor = useCallback(
    (item: WorkoutDayDisplayItem) => `${item.dayKey}-${item.displayDate}`,
    []
  );

  // Handle preset selection
  const handlePresetPress = useCallback((preset: DateRangePreset) => {
    if (preset === "custom") {
      setTempStartDate(dateRange.startDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
      setTempEndDate(dateRange.endDate ?? new Date());
      setShowStartPicker(true);
      return;
    }
    setDateRange({ preset, startDate: null, endDate: null });
  }, [dateRange.startDate, dateRange.endDate]);

  // Check if filters are active
  const hasActiveFilters = debouncedQuery || dateRange.preset !== "all";

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setDateRange({ preset: "all", startDate: null, endDate: null });
  }, []);

  // Handle content press - navigate to workout day detail page
  const handleContentPress = useCallback((dayKey: string) => {
    router.push({ pathname: "/workout/[dayKey]", params: { dayKey } });
  }, []);

  // Render workout day card - stable callback
  const renderItem = useCallback(
    ({ item }: { item: WorkoutDayDisplayItem }) => (
      <WorkoutDayCard
        item={item}
        isExpanded={expandedDayKey === item.dayKey}
        details={detailsCache.get(item.dayKey)}
        isLoadingDetails={loadingDetails === item.dayKey}
        onToggle={() => handleCardPress(item.dayKey)}
        onContentPress={() => handleContentPress(item.dayKey)}
        rawColors={rawColors}
      />
    ),
    [expandedDayKey, detailsCache, loadingDetails, handleCardPress, handleContentPress, rawColors]
  );

  // Render empty state
  const renderEmptyState = useCallback(() => {
    if (loading) return null;

    return (
      <View style={styles.emptyState}>
        <MaterialCommunityIcons
          name="clipboard-text-outline"
          size={64}
          color={rawColors.foregroundMuted}
        />
        <Text style={[styles.emptyTitle, { color: rawColors.foregroundMuted }]}>
          {hasActiveFilters ? "No matching workouts" : "No workouts yet"}
        </Text>
        <Text style={[styles.emptySubtext, { color: rawColors.foregroundMuted }]}>
          {hasActiveFilters
            ? "Try adjusting your search or filters"
            : "Complete an exercise to see your workout history"}
        </Text>
        {hasActiveFilters && (
          <Pressable
            style={[styles.clearButton, { backgroundColor: rawColors.primary }]}
            onPress={clearFilters}
          >
            <Text style={[styles.clearButtonText, { color: rawColors.surface }]}>
              Clear Filters
            </Text>
          </Pressable>
        )}
      </View>
    );
  }, [loading, hasActiveFilters, rawColors, clearFilters]);

  // Render footer (loading more indicator)
  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={rawColors.primary} />
      </View>
    );
  }, [loadingMore, rawColors.primary]);

  // Get item layout for performance (only works well for collapsed items)
  const getItemLayout = useCallback(
    (_data: ArrayLike<WorkoutDayDisplayItem> | null | undefined, index: number) => ({
      length: COLLAPSED_ITEM_HEIGHT,
      offset: COLLAPSED_ITEM_HEIGHT * index,
      index,
    }),
    []
  );

  // Format date for custom range display
  const formatDateShort = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <View style={[styles.container, { backgroundColor: rawColors.background }]}>
      <Stack.Screen
        options={{
          title: "Workout History",
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      {/* Search and Filter Section */}
      <View style={[styles.filterSection, { backgroundColor: rawColors.surface }]}>
        {/* Search Bar */}
        <View
          style={[
            styles.searchBar,
            { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.border },
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={20} color={rawColors.foregroundSecondary} />
          <TextInput
            style={[styles.searchInput, { color: rawColors.foreground }]}
            placeholder="Search exercises, notes, weights..."
            placeholderTextColor={rawColors.foregroundPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialCommunityIcons name="close-circle" size={20} color={rawColors.foregroundSecondary} />
            </Pressable>
          )}
        </View>

        {/* Date Range Presets */}
        <View style={styles.presetsRow}>
          {presets.map((preset) => (
            <Pressable
              key={preset.id}
              style={[
                styles.presetButton,
                { borderColor: rawColors.border },
                dateRange.preset === preset.id && {
                  backgroundColor: rawColors.primary,
                  borderColor: rawColors.primary,
                },
              ]}
              onPress={() => handlePresetPress(preset.id)}
            >
              <Text
                style={[
                  styles.presetText,
                  { color: rawColors.foreground },
                  dateRange.preset === preset.id && { color: rawColors.surface },
                ]}
              >
                {preset.label}
              </Text>
            </Pressable>
          ))}

          {/* Custom Button */}
          <Pressable
            style={[
              styles.presetButton,
              { borderColor: rawColors.border },
              dateRange.preset === "custom" && {
                backgroundColor: rawColors.primary,
                borderColor: rawColors.primary,
              },
            ]}
            onPress={() => handlePresetPress("custom")}
          >
            <MaterialCommunityIcons
              name="calendar-range"
              size={16}
              color={dateRange.preset === "custom" ? rawColors.surface : rawColors.foregroundSecondary}
            />
          </Pressable>
        </View>

        {/* Custom Range Display */}
        {dateRange.preset === "custom" && dateRange.startDate && dateRange.endDate && (
          <Pressable
            style={[styles.customRangeDisplay, { backgroundColor: rawColors.surfaceSecondary }]}
            onPress={() => setShowStartPicker(true)}
          >
            <Text style={[styles.customRangeText, { color: rawColors.foreground }]}>
              {formatDateShort(dateRange.startDate)} - {formatDateShort(dateRange.endDate)}
            </Text>
            <MaterialCommunityIcons name="pencil" size={14} color={rawColors.foregroundSecondary} />
          </Pressable>
        )}
      </View>

      {/* Workout List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={rawColors.primary} />
        </View>
      ) : (
        <View style={styles.listContainer}>
          <FlatList
            ref={flatListRef}
            data={displayItems}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ListEmptyComponent={renderEmptyState}
            ListFooterComponent={renderFooter}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
            // Performance tuning
            initialNumToRender={8}
            maxToRenderPerBatch={5}
            windowSize={7}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS === "android"}
            getItemLayout={expandedDayKey ? undefined : getItemLayout}
          />
        </View>
      )}

      {/* Date Pickers */}
      <DatePickerModal
        visible={showStartPicker}
        onClose={() => {
          setShowStartPicker(false);
          setShowEndPicker(true);
        }}
        value={tempStartDate}
        onChange={(date) => {
          setTempStartDate(date);
        }}
        title="Start Date"
      />

      <DatePickerModal
        visible={showEndPicker}
        onClose={() => {
          setShowEndPicker(false);
          // Auto-correct if start > end
          let start = tempStartDate;
          let end = tempEndDate;
          if (start.getTime() > end.getTime()) {
            const temp = start;
            start = end;
            end = temp;
          }
          setDateRange({
            preset: "custom",
            startDate: start,
            endDate: end,
          });
        }}
        value={tempEndDate}
        onChange={(date) => {
          setTempEndDate(date);
        }}
        title="End Date"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    padding: 8,
    marginLeft: -8,
  },
  filterSection: {
    padding: 16,
    paddingTop: 12,
    gap: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  presetsRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  presetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetText: {
    fontSize: 13,
    fontWeight: "600",
  },
  customRangeDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  customRangeText: {
    fontSize: 13,
    fontWeight: "500",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardHeaderLeft: {
    flex: 1,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardDate: {
    fontSize: 18,
    fontWeight: "600",
  },
  cardFullDate: {
    fontSize: 13,
    marginTop: 2,
  },
  statBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statBadgeText: {
    fontSize: 12,
    fontWeight: "500",
  },
  expandedContent: {
    marginTop: 16,
  },
  cardLoadingContainer: {
    paddingVertical: 24,
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  exerciseList: {
    gap: 2,
  },
  exerciseItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  alphabetCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  alphabetText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  exerciseDetails: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  bestSetText: {
    fontSize: 13,
  },
  exerciseNote: {
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 4,
  },
  showMoreText: {
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 8,
    fontStyle: "italic",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  clearButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  footerLoader: {
    paddingVertical: 20,
  },
});
