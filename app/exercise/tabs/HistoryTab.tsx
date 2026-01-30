import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";
import SetItem from "../../../components/lists/SetItem";
import DatePickerModal from "../../../components/modals/DatePickerModal";
import { getPREventsBySetIds } from "../../../lib/db/prEvents";
import { deleteExerciseSession, getExerciseHistory, type WorkoutHistoryEntry, type SetRow } from "../../../lib/db/workouts";
import { useTheme } from "../../../lib/theme/ThemeContext";

// Date range presets
type DateRangePreset = "1w" | "1m" | "3m" | "6m" | "1y" | "all" | "custom";

interface DateRangeState {
  preset: DateRangePreset;
  startDate: Date | null;
  endDate: Date | null;
}

const DATE_PRESETS: { id: DateRangePreset; label: string; days: number | null }[] = [
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "6m", label: "6M", days: 180 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: null },
];

// Filter state for weight and reps
interface NumericFilter {
  min: string;
  max: string;
}

// Parsed search result
interface ParsedSearch {
  notesQuery: string;
  weightValue: number | null;
  repsValue: number | null;
}

/**
 * Parse search query to extract weight, reps, and notes text.
 * Supports patterns like:
 * - Weight: "100kg", "100 kg", "100KG"
 * - Reps: "10 reps", "10reps", "10 rep"
 * - Remaining text is treated as notes search
 */
function parseSearchQuery(query: string): ParsedSearch {
  let notesQuery = query.trim();
  let weightValue: number | null = null;
  let repsValue: number | null = null;

  // Extract weight pattern: 100kg, 100 kg, 100KG
  const weightMatch = notesQuery.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (weightMatch) {
    weightValue = parseFloat(weightMatch[1]);
    notesQuery = notesQuery.replace(weightMatch[0], "").trim();
  }

  // Extract reps pattern: 10 reps, 10reps, 10 rep
  const repsMatch = notesQuery.match(/(\d+)\s*reps?/i);
  if (repsMatch) {
    repsValue = parseInt(repsMatch[1], 10);
    notesQuery = notesQuery.replace(repsMatch[0], "").trim();
  }

  // Clean up multiple spaces
  notesQuery = notesQuery.replace(/\s+/g, " ").trim();

  return { notesQuery, weightValue, repsValue };
}

// Extended set row with PR badge
type SetWithPR = SetRow & { prBadge?: string };

/**
 * Calculate estimated 1RM using Epley formula
 * e1RM = weight × (1 + 0.0333 × reps)
 */
function calculateE1RM(weight: number | null, reps: number | null): number {
  if (weight === null || reps === null || weight <= 0 || reps <= 0) return 0;
  return weight * (1 + 0.0333 * reps);
}

/**
 * Calculate session stats for a list of sets
 */
function calculateSessionStats(sets: SetWithPR[]): {
  totalVolume: number;
  totalReps: number;
  totalSets: number;
  bestSetId: number | null;
  bestSetE1RM: number;
} {
  let totalVolume = 0;
  let totalReps = 0;
  let bestSetId: number | null = null;
  let bestSetE1RM = 0;

  for (const set of sets) {
    const weight = set.weightKg ?? 0;
    const reps = set.reps ?? 0;

    // Calculate volume (weight × reps)
    totalVolume += weight * reps;
    totalReps += reps;

    // Find best set by estimated 1RM
    const e1rm = calculateE1RM(set.weightKg, set.reps);
    if (e1rm > bestSetE1RM) {
      bestSetE1RM = e1rm;
      bestSetId = set.id;
    }
  }

  return {
    totalVolume,
    totalReps,
    totalSets: sets.length,
    bestSetId,
    bestSetE1RM,
  };
}

/**
 * Format volume for display (e.g., 1250 kg or 1.2k kg)
 */
function formatVolume(volume: number): string {
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}k`;
  }
  return `${Math.round(volume)}`;
}

type HistoryTabProps = {
  refreshKey?: number;
};

export default function HistoryTab({ refreshKey }: HistoryTabProps) {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; name?: string; workoutId?: string; refreshHistory?: string }>();
  const exerciseId = typeof params.id === "string" ? parseInt(params.id, 10) : null;
  const exerciseName = typeof params.name === "string" ? params.name : "Exercise";
  const [rawHistory, setRawHistory] = useState<(WorkoutHistoryEntry & { sets: SetWithPR[] })[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeState>({
    preset: "all",
    startDate: null,
    endDate: null,
  });
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [weightFilter, setWeightFilter] = useState<NumericFilter>({ min: "", max: "" });
  const [repsFilter, setRepsFilter] = useState<NumericFilter>({ min: "", max: "" });

  // Animation value for filter reveal (Reanimated)
  const filterExpansion = useSharedValue(0);
  
  // Animated styles using Reanimated
  const filterAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(filterExpansion.value, [0, 1], [0, 1]),
      transform: [
        { translateY: interpolate(filterExpansion.value, [0, 1], [-15, 0]) },
      ],
      maxHeight: interpolate(filterExpansion.value, [0, 1], [0, 500]),
    };
  });

  // Date picker modal states
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<Date>(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
  const [tempEndDate, setTempEndDate] = useState<Date>(new Date());

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
      const presetConfig = DATE_PRESETS.find((p) => p.id === dateRange.preset);
      if (presetConfig?.days) {
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        endTs = now.getTime();
        startTs = now.getTime() - presetConfig.days * 24 * 60 * 60 * 1000;
      }
    }

    return { startDate: startTs, endDate: endTs };
  }, [dateRange]);

  // Parse search query for weight, reps, and notes
  const parsedSearch = useMemo(() => parseSearchQuery(debouncedQuery), [debouncedQuery]);

  // Compute effective filter values (explicit filters take precedence over parsed search)
  const effectiveFilters = useMemo(() => {
    const weightMin = weightFilter.min ? parseFloat(weightFilter.min) : parsedSearch.weightValue;
    const weightMax = weightFilter.max ? parseFloat(weightFilter.max) : null;
    const repsMin = repsFilter.min ? parseInt(repsFilter.min, 10) : parsedSearch.repsValue;
    const repsMax = repsFilter.max ? parseInt(repsFilter.max, 10) : null;

    return {
      weightMin: !isNaN(weightMin as number) ? weightMin : null,
      weightMax: !isNaN(weightMax as number) ? weightMax : null,
      repsMin: !isNaN(repsMin as number) ? repsMin : null,
      repsMax: !isNaN(repsMax as number) ? repsMax : null,
      notesQuery: parsedSearch.notesQuery.toLowerCase(),
    };
  }, [weightFilter, repsFilter, parsedSearch]);

  // Filter history based on all filter criteria
  const filteredHistory = useMemo((): (WorkoutHistoryEntry & { sets: SetWithPR[] })[] => {
    const { startDate, endDate } = dateRangeTimestamps;
    const { weightMin, weightMax, repsMin, repsMax, notesQuery } = effectiveFilters;

    const matchesFilters = (set: SetWithPR) => {
      // Weight filter
      if (weightMin !== null && (set.weightKg ?? 0) < weightMin) return false;
      if (weightMax !== null && (set.weightKg ?? 0) > weightMax) return false;

      // Reps filter
      if (repsMin !== null && (set.reps ?? 0) < repsMin) return false;
      if (repsMax !== null && (set.reps ?? 0) > repsMax) return false;

      // Notes filter
      if (notesQuery && !(set.note?.toLowerCase().includes(notesQuery))) return false;

      return true;
    };

    return rawHistory
      .filter((entry) => {
        // Date filter
        const workoutDate = entry.workoutExercise?.performedAt ?? entry.workoutExercise?.completedAt ?? entry.workout.startedAt;
        if (startDate && workoutDate < startDate) return false;
        if (endDate && workoutDate > endDate) return false;
        return true;
      })
      .filter((entry) => entry.sets.some(matchesFilters));
  }, [rawHistory, dateRangeTimestamps, effectiveFilters]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      debouncedQuery.length > 0 ||
      dateRange.preset !== "all" ||
      weightFilter.min !== "" ||
      weightFilter.max !== "" ||
      repsFilter.min !== "" ||
      repsFilter.max !== ""
    );
  }, [debouncedQuery, dateRange.preset, weightFilter, repsFilter]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setDateRange({ preset: "all", startDate: null, endDate: null });
    setWeightFilter({ min: "", max: "" });
    setRepsFilter({ min: "", max: "" });
  }, []);

  const loadHistory = useCallback(async () => {
    if (!exerciseId) {
      setLoading(false);
      return;
    }

    try {
      const exerciseHistory = await getExerciseHistory(exerciseId);
      
      // Get all set IDs to fetch PR events
      const allSetIds = exerciseHistory.flatMap(entry => entry.sets.map(set => set.id));
      const prEventsMap = await getPREventsBySetIds(allSetIds);
      
      // Map PR events to sets
      const historyWithPRs = exerciseHistory.map(entry => ({
        ...entry,
        sets: entry.sets.map(set => ({
          ...set,
          prBadge: prEventsMap.get(set.id)?.type.toUpperCase() || undefined,
        })),
      }));
      
      setRawHistory(historyWithPRs);
    } catch (error) {
      console.error("Error loading exercise history:", error);
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (refreshKey !== undefined) {
      loadHistory();
    }
  }, [refreshKey, loadHistory]);

  // Reload history when component comes into focus (after returning from edit page)
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  // Also reload when refreshHistory param changes (triggered after saving edits)
  useEffect(() => {
    if (params.refreshHistory) {
      loadHistory();
      // Clear the param after refreshing
      router.setParams({ refreshHistory: undefined });
    }
  }, [params.refreshHistory, loadHistory]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handleEdit = useCallback((entry: WorkoutHistoryEntry) => {
    if (!exerciseId) return;
    router.push({
      pathname: "/edit-workout",
      params: {
        exerciseId: String(exerciseId),
        workoutId: String(entry.workout.id),
        exerciseName,
      },
    });
  }, [exerciseId, exerciseName]);

  // Handle date preset selection
  const handlePresetPress = useCallback((preset: DateRangePreset) => {
    if (preset === "custom") {
      setTempStartDate(dateRange.startDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
      setTempEndDate(dateRange.endDate ?? new Date());
      setShowStartPicker(true);
      return;
    }
    setDateRange({ preset, startDate: null, endDate: null });
  }, [dateRange.startDate, dateRange.endDate]);

  // Toggle filter section with animation
  const toggleFilters = useCallback(() => {
    const expanding = !filtersExpanded;
    setFiltersExpanded(expanding);
    
    // Animate with Reanimated - runs on UI thread for smooth 60fps
    filterExpansion.value = withTiming(expanding ? 1 : 0, {
      duration: 250,
      easing: Easing.bezier(0.4, 0, 0.2, 1), // Material Design standard easing
    });
  }, [filtersExpanded, filterExpansion]);

  // Format date for custom range display
  const formatDateShort = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const handleDelete = useCallback((entry: WorkoutHistoryEntry) => {
    if (!exerciseId) return;
    
    const setCount = entry.sets.length;
    Alert.alert(
      "Delete Session",
      `Are you sure you want to delete this ${exerciseName} session? This will remove ${setCount} set${setCount !== 1 ? "s" : ""} and cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteExerciseSession(entry.workout.id, exerciseId);
              await loadHistory();
            } catch (error) {
              if (__DEV__) console.error("[HistoryTab] Error deleting session:", error);
              Alert.alert("Error", "Failed to delete session. Please try again.");
            }
          },
        },
      ]
    );
  }, [exerciseId, exerciseName, loadHistory]);

  if (!exerciseId) {
    return (
      <View style={[styles.tabContainer, { backgroundColor: rawColors.background }]}>
        <Text style={[styles.errorText, { color: rawColors.destructive }]}>Invalid exercise ID</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.tabContainer, { backgroundColor: rawColors.background }]}>
        <Text style={[styles.loadingText, { color: rawColors.foregroundSecondary }]}>Loading history...</Text>
      </View>
    );
  }

  // Show empty state only if there's no raw data at all
  if (rawHistory.length === 0) {
    return (
      <View style={[styles.tabContainer, { backgroundColor: rawColors.background }]}>
        <Text style={[styles.emptyText, { color: rawColors.foreground }]}>No workout history found</Text>
        <Text style={[styles.emptySubtext, { color: rawColors.foregroundSecondary }]}>Start recording sets to see your history here</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: rawColors.background }]}>
      {/* Search and Filter Section - Collapsible */}
      <View style={[styles.filterSection, { backgroundColor: rawColors.background, borderBottomColor: rawColors.border }]}>
        {/* Filter Toggle Header */}
        <Pressable
          style={[styles.filterToggleHeader, { borderColor: rawColors.border }]}
          onPress={toggleFilters}
        >
          <View style={styles.filterToggleLeft}>
            <MaterialCommunityIcons 
              name="filter-variant" 
              size={18} 
              color={hasActiveFilters ? rawColors.primary : rawColors.foregroundSecondary} 
            />
            <Text style={[styles.filterToggleText, { color: rawColors.foreground }]}>
              Search & Filters
            </Text>
            {hasActiveFilters && (
              <View style={[styles.activeFilterBadge, { backgroundColor: rawColors.primary }]}>
                <Text style={[styles.activeFilterBadgeText, { color: rawColors.surface }]}>
                  {filteredHistory.length}/{rawHistory.length}
                </Text>
              </View>
            )}
          </View>
          <MaterialCommunityIcons
            name={filtersExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={rawColors.foregroundSecondary}
          />
        </Pressable>

        {/* Animated Filter Content */}
        <Animated.View
          style={[
            styles.filterContentWrapper,
            filterAnimatedStyle,
          ]}
        >
          <View style={styles.filterContent}>
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
                placeholder="Search notes, 100kg, 8 reps..."
                placeholderTextColor={rawColors.foregroundMuted}
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
              {DATE_PRESETS.map((preset) => (
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

              {/* Custom Date Button */}
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

            {/* Weight/Reps Filters */}
            <View style={styles.filterInputsContainer}>
              {/* Weight Filter */}
              <View style={styles.filterInputRow}>
                <Text style={[styles.filterInputLabel, { color: rawColors.foreground }]}>Weight (kg)</Text>
                <View style={styles.filterInputs}>
                  <TextInput
                    style={[
                      styles.filterInput,
                      { backgroundColor: rawColors.surfaceSecondary, color: rawColors.foreground, borderColor: rawColors.border },
                    ]}
                    placeholder="Min"
                    placeholderTextColor={rawColors.foregroundMuted}
                    value={weightFilter.min}
                    onChangeText={(text) => setWeightFilter((prev) => ({ ...prev, min: text }))}
                    keyboardType="numeric"
                  />
                  <Text style={[styles.filterInputDash, { color: rawColors.foregroundSecondary }]}>-</Text>
                  <TextInput
                    style={[
                      styles.filterInput,
                      { backgroundColor: rawColors.surfaceSecondary, color: rawColors.foreground, borderColor: rawColors.border },
                    ]}
                    placeholder="Max"
                    placeholderTextColor={rawColors.foregroundMuted}
                    value={weightFilter.max}
                    onChangeText={(text) => setWeightFilter((prev) => ({ ...prev, max: text }))}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Reps Filter */}
              <View style={styles.filterInputRow}>
                <Text style={[styles.filterInputLabel, { color: rawColors.foreground }]}>Reps</Text>
                <View style={styles.filterInputs}>
                  <TextInput
                    style={[
                      styles.filterInput,
                      { backgroundColor: rawColors.surfaceSecondary, color: rawColors.foreground, borderColor: rawColors.border },
                    ]}
                    placeholder="Min"
                    placeholderTextColor={rawColors.foregroundMuted}
                    value={repsFilter.min}
                    onChangeText={(text) => setRepsFilter((prev) => ({ ...prev, min: text }))}
                    keyboardType="numeric"
                  />
                  <Text style={[styles.filterInputDash, { color: rawColors.foregroundSecondary }]}>-</Text>
                  <TextInput
                    style={[
                      styles.filterInput,
                      { backgroundColor: rawColors.surfaceSecondary, color: rawColors.foreground, borderColor: rawColors.border },
                    ]}
                    placeholder="Max"
                    placeholderTextColor={rawColors.foregroundMuted}
                    value={repsFilter.max}
                    onChangeText={(text) => setRepsFilter((prev) => ({ ...prev, max: text }))}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            {/* Active Filters Summary with Clear */}
            {hasActiveFilters && (
              <View style={styles.activeFiltersRow}>
                <Text style={[styles.activeFiltersText, { color: rawColors.foregroundSecondary }]}>
                  Showing {filteredHistory.length} of {rawHistory.length} sessions
                </Text>
                <Pressable onPress={clearFilters}>
                  <Text style={[styles.clearFiltersLink, { color: rawColors.primary }]}>Clear All</Text>
                </Pressable>
              </View>
            )}
          </View>
        </Animated.View>
      </View>

      {/* Date Pickers */}
      <DatePickerModal
        visible={showStartPicker}
        onClose={() => {
          setShowStartPicker(false);
          setShowEndPicker(true);
        }}
        value={tempStartDate}
        onChange={(date) => setTempStartDate(date)}
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
        onChange={(date) => setTempEndDate(date)}
        title="End Date"
      />

      <FlatList
        data={filteredHistory}
        keyExtractor={(item) => String(item.workout.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          // Use workoutExercise dates for display, fall back to workout dates
          const workoutDate = item.workoutExercise?.performedAt ?? item.workoutExercise?.completedAt ?? item.workout.startedAt;
          const isCompleted = item.workoutExercise?.completedAt !== null;
          
          // Calculate session stats
          const sessionStats = calculateSessionStats(item.sets);

          return (
            <View
              style={[styles.workoutCard, { backgroundColor: rawColors.surface, borderColor: rawColors.border }]}
            >
              <View style={[styles.workoutHeader, { borderBottomColor: rawColors.border }]}>
                <View style={styles.workoutDateContainer}>
                  <Text style={[styles.workoutDate, { color: rawColors.foreground }]}>{formatDate(workoutDate)}</Text>
                  <Text style={[styles.workoutTime, { color: rawColors.foregroundSecondary }]}>{formatTime(workoutDate)}</Text>
                </View>
                <View style={styles.headerActions}>
                  {!isCompleted && (
                    <View style={[styles.inProgressBadge, { backgroundColor: rawColors.primary }]}>
                      <Text style={[styles.inProgressText, { color: rawColors.surface }]}>In Progress</Text>
                    </View>
                  )}
                  {isCompleted && (
                    <>
                      <Pressable
                        onPress={() => handleEdit(item)}
                        hitSlop={8}
                        style={[styles.actionIconButton, { backgroundColor: rawColors.background }]}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={16} color={rawColors.primary} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(item)}
                        hitSlop={8}
                        style={[styles.actionIconButton, { backgroundColor: rawColors.background }]}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color={rawColors.destructive} />
                      </Pressable>
                    </>
                  )}
                </View>
              </View>

              {/* Session Stats Summary */}
              <View style={[styles.sessionStatsContainer, { backgroundColor: rawColors.surfaceSecondary }]}>
                <View style={styles.statItem}>
                  <MaterialCommunityIcons name="dumbbell" size={14} color={rawColors.foregroundSecondary} />
                  <Text style={[styles.statValue, { color: rawColors.foreground }]}>{sessionStats.totalSets}</Text>
                  <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>sets</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: rawColors.border }]} />
                <View style={styles.statItem}>
                  <MaterialCommunityIcons name="repeat" size={14} color={rawColors.foregroundSecondary} />
                  <Text style={[styles.statValue, { color: rawColors.foreground }]}>{sessionStats.totalReps}</Text>
                  <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>reps</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: rawColors.border }]} />
                <View style={styles.statItem}>
                  <MaterialCommunityIcons name="weight" size={14} color={rawColors.foregroundSecondary} />
                  <Text style={[styles.statValue, { color: rawColors.foreground }]}>{formatVolume(sessionStats.totalVolume)}</Text>
                  <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>kg vol</Text>
                </View>
              </View>

              <View style={styles.setsContainer}>
                {item.sets.map((set: SetWithPR, index) => (
                  <SetItem
                    key={set.id}
                    index={index + 1}
                    weightKg={set.weightKg}
                    reps={set.reps}
                    note={set.note}
                    variant="compact"
                    prBadge={set.prBadge}
                    isBestSet={set.id === sessionStats.bestSetId}
                  />
                ))}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          hasActiveFilters ? (
            <View style={styles.emptyFilterState}>
              <MaterialCommunityIcons name="filter-off-outline" size={48} color={rawColors.foregroundMuted} />
              <Text style={[styles.emptyText, { color: rawColors.foreground }]}>No matching sessions</Text>
              <Text style={[styles.emptySubtext, { color: rawColors.foregroundSecondary }]}>
                Try adjusting your search or filters
              </Text>
              <Pressable
                style={[styles.clearFiltersButton, { backgroundColor: rawColors.primary }]}
                onPress={clearFilters}
              >
                <Text style={[styles.clearFiltersText, { color: rawColors.surface }]}>Clear Filters</Text>
              </Pressable>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  tabContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  errorText: {
    fontSize: 16,
    color: "#ff3b30",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  emptyFilterState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  clearFiltersButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  clearFiltersText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Filter Section
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  filterToggleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: "500",
  },
  activeFilterBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 4,
  },
  activeFilterBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  filterContentWrapper: {
    overflow: "hidden",
  },
  filterContent: {
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
  filterInputsContainer: {
    gap: 12,
  },
  filterInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterInputLabel: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  filterInputs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterInput: {
    width: 70,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    textAlign: "center",
  },
  filterInputDash: {
    fontSize: 14,
  },
  activeFiltersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  activeFiltersText: {
    fontSize: 13,
  },
  clearFiltersLink: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Workout Cards
  workoutCard: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  workoutHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5ea",
  },
  workoutDateContainer: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  workoutDate: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 2,
  },
  workoutTime: {
    fontSize: 14,
    color: "#666",
  },
  inProgressBadge: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  inProgressText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  setsContainer: {
    gap: 4,
  },

  // Session Stats
  sessionStatsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  statLabel: {
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    height: 16,
  },
});
