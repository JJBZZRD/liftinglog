import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type ViewToken,
} from "react-native";
import DatePickerModal from "../components/modals/DatePickerModal";
import {
  dayKeyToTimestamp,
  getWorkoutDayDetails,
  listWorkoutDays,
  searchWorkoutDays,
  type WorkoutDayDetails,
  type WorkoutDaySummary,
} from "../lib/db/workouts";
import { useTheme } from "../lib/theme/ThemeContext";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PAGE_SIZE = 20;

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

export default function WorkoutHistoryScreen() {
  const { themeColors } = useTheme();

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

  // Fast scroll tooltip
  const [topVisibleDayKey, setTopVisibleDayKey] = useState<string | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);

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

  // Load workout days
  const loadWorkoutDays = useCallback(async (reset = true) => {
    if (reset) {
      setLoading(true);
      setHasMore(true);
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
        setWorkoutDays((prev) => [...prev, ...days]);
      }

      setHasMore(days.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error loading workout days:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedQuery, dateRangeTimestamps, workoutDays.length]);

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

  // Handle viewable items changed for fast scroll tooltip
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].item) {
        setTopVisibleDayKey((viewableItems[0].item as WorkoutDaySummary).dayKey);
      }
    },
    []
  );

  // Handle preset selection
  const handlePresetPress = (preset: DateRangePreset) => {
    if (preset === "custom") {
      setTempStartDate(dateRange.startDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
      setTempEndDate(dateRange.endDate ?? new Date());
      setShowStartPicker(true);
      return;
    }
    setDateRange({ preset, startDate: null, endDate: null });
  };

  // Format date for display
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatFullDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatMonthYear = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  };

  const formatDateShort = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getAlphabetLetter = (index: number) => {
    return String.fromCharCode(65 + index); // A = 65
  };

  // Check if filters are active
  const hasActiveFilters = debouncedQuery || dateRange.preset !== "all";

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery("");
    setDateRange({ preset: "all", startDate: null, endDate: null });
  };

  // Render workout day card
  const renderWorkoutDayCard = ({ item }: { item: WorkoutDaySummary }) => {
    const isExpanded = expandedDayKey === item.dayKey;
    const details = detailsCache.get(item.dayKey);
    const isLoadingThis = loadingDetails === item.dayKey;

    return (
      <Pressable
        style={[
          styles.card,
          { backgroundColor: themeColors.surface, shadowColor: themeColors.shadow },
        ]}
        onPress={() => handleCardPress(item.dayKey)}
      >
        {/* Summary Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={[styles.cardDate, { color: themeColors.text }]}>
              {formatDate(item.displayDate)}
            </Text>
            <Text style={[styles.cardFullDate, { color: themeColors.textSecondary }]}>
              {formatFullDate(item.displayDate)}
            </Text>
          </View>
          <View style={styles.cardHeaderRight}>
            <View style={styles.statBadge}>
              <Text style={[styles.statBadgeText, { color: themeColors.textSecondary }]}>
                {item.totalExercises} exercise{item.totalExercises !== 1 ? "s" : ""}
              </Text>
            </View>
            <MaterialCommunityIcons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={24}
              color={themeColors.textSecondary}
            />
          </View>
        </View>

        {/* Notes Preview (collapsed only) */}
        {!isExpanded && item.notesPreview && (
          <Text
            style={[styles.notesPreview, { color: themeColors.textTertiary }]}
            numberOfLines={1}
          >
            {item.notesPreview}
          </Text>
        )}

        {/* Expanded Content */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            {isLoadingThis ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={themeColors.primary} />
              </View>
            ) : details ? (
              <>
                {/* Stats Row */}
                <View style={[styles.statsRow, { borderColor: themeColors.border }]}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: themeColors.text }]}>
                      {details.exercises.length}
                    </Text>
                    <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                      Exercises
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: themeColors.text }]}>
                      {details.totalVolumeKg.toLocaleString()}
                    </Text>
                    <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                      Volume (kg)
                    </Text>
                  </View>
                  {details.bestE1rmKg && (
                    <View style={styles.statItem}>
                      <Text style={[styles.statValue, { color: themeColors.text }]}>
                        {details.bestE1rmKg}
                      </Text>
                      <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                        Best e1RM
                      </Text>
                    </View>
                  )}
                </View>

                {/* Exercise List */}
                <View style={styles.exerciseList}>
                  {details.exercises.map((exercise, index) => (
                    <View key={exercise.workoutExerciseId} style={styles.exerciseItem}>
                      {/* Alphabet Circle */}
                      <View style={[styles.alphabetCircle, { backgroundColor: themeColors.primary }]}>
                        <Text style={styles.alphabetText}>{getAlphabetLetter(index)}</Text>
                      </View>

                      {/* Exercise Details */}
                      <View style={styles.exerciseDetails}>
                        <Text
                          style={[styles.exerciseName, { color: themeColors.text }]}
                          numberOfLines={1}
                        >
                          {exercise.exerciseName}
                        </Text>
                        <Text style={[styles.bestSetText, { color: themeColors.textSecondary }]}>
                          {exercise.bestSet
                            ? `Best: ${exercise.bestSet.weightKg} kg × ${exercise.bestSet.reps} (e1RM ${exercise.bestSet.e1rm} kg)`
                            : "No sets recorded"}
                        </Text>
                      </View>
                    </View>
                  ))}

                  {/* Show more indicator */}
                  {details.hasMoreExercises && (
                    <Text style={[styles.showMoreText, { color: themeColors.textTertiary }]}>
                      Showing first 26 exercises
                    </Text>
                  )}
                </View>
              </>
            ) : null}
          </View>
        )}
      </Pressable>
    );
  };

  // Render empty state
  const renderEmptyState = () => {
    if (loading) return null;

    return (
      <View style={styles.emptyState}>
        <MaterialCommunityIcons
          name="clipboard-text-outline"
          size={64}
          color={themeColors.textLight}
        />
        <Text style={[styles.emptyTitle, { color: themeColors.textTertiary }]}>
          {hasActiveFilters ? "No matching workouts" : "No workouts yet"}
        </Text>
        <Text style={[styles.emptySubtext, { color: themeColors.textLight }]}>
          {hasActiveFilters
            ? "Try adjusting your search or filters"
            : "Complete an exercise to see your workout history"}
        </Text>
        {hasActiveFilters && (
          <Pressable
            style={[styles.clearButton, { backgroundColor: themeColors.primary }]}
            onPress={clearFilters}
          >
            <Text style={[styles.clearButtonText, { color: themeColors.surface }]}>
              Clear Filters
            </Text>
          </Pressable>
        )}
      </View>
    );
  };

  // Render footer (loading more indicator)
  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={themeColors.primary} />
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Stack.Screen
        options={{
          title: "Workout History",
          headerStyle: { backgroundColor: themeColors.surface },
          headerTitleStyle: { color: themeColors.text },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={themeColors.text} />
            </Pressable>
          ),
        }}
      />

      {/* Search and Filter Section */}
      <View style={[styles.filterSection, { backgroundColor: themeColors.surface }]}>
        {/* Search Bar */}
        <View
          style={[
            styles.searchBar,
            { backgroundColor: themeColors.surfaceSecondary, borderColor: themeColors.border },
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={20} color={themeColors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Search exercises, notes, weights..."
            placeholderTextColor={themeColors.textPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialCommunityIcons name="close-circle" size={20} color={themeColors.textSecondary} />
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
                { borderColor: themeColors.border },
                dateRange.preset === preset.id && {
                  backgroundColor: themeColors.primary,
                  borderColor: themeColors.primary,
                },
              ]}
              onPress={() => handlePresetPress(preset.id)}
            >
              <Text
                style={[
                  styles.presetText,
                  { color: themeColors.text },
                  dateRange.preset === preset.id && { color: themeColors.surface },
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
              { borderColor: themeColors.border },
              dateRange.preset === "custom" && {
                backgroundColor: themeColors.primary,
                borderColor: themeColors.primary,
              },
            ]}
            onPress={() => handlePresetPress("custom")}
          >
            <MaterialCommunityIcons
              name="calendar-range"
              size={16}
              color={dateRange.preset === "custom" ? themeColors.surface : themeColors.textSecondary}
            />
          </Pressable>
        </View>

        {/* Custom Range Display */}
        {dateRange.preset === "custom" && dateRange.startDate && dateRange.endDate && (
          <Pressable
            style={[styles.customRangeDisplay, { backgroundColor: themeColors.surfaceSecondary }]}
            onPress={() => setShowStartPicker(true)}
          >
            <Text style={[styles.customRangeText, { color: themeColors.text }]}>
              {formatDateShort(dateRange.startDate)} - {formatDateShort(dateRange.endDate)}
            </Text>
            <MaterialCommunityIcons name="pencil" size={14} color={themeColors.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Workout List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      ) : (
        <View style={styles.listContainer}>
          <FlatList
            data={workoutDays}
            keyExtractor={(item) => item.dayKey}
            renderItem={renderWorkoutDayCard}
            ListEmptyComponent={renderEmptyState}
            ListFooterComponent={renderFooter}
            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onScrollBeginDrag={() => setIsScrolling(true)}
            onScrollEndDrag={() => setIsScrolling(false)}
            onMomentumScrollEnd={() => setIsScrolling(false)}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />

          {/* Fast Scroll Date Tooltip */}
          {isScrolling && topVisibleDayKey && (
            <View style={[styles.dateTooltip, { backgroundColor: themeColors.primary }]}>
              <Text style={[styles.dateTooltipText, { color: themeColors.surface }]}>
                {formatMonthYear(dayKeyToTimestamp(topVisibleDayKey))}
              </Text>
            </View>
          )}
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
  notesPreview: {
    fontSize: 13,
    marginTop: 8,
    fontStyle: "italic",
  },
  expandedContent: {
    marginTop: 16,
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
  dateTooltip: {
    position: "absolute",
    right: 16,
    top: "50%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    transform: [{ translateY: -16 }],
  },
  dateTooltipText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
