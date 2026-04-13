import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CalculatorsSummaryCard from "../../components/calculators/CalculatorsSummaryCard";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { getTotalPBCount } from "../../lib/db/pbEvents";
import { getLatestUserMetricsSnapshot, type UserMetricsSnapshot } from "../../lib/db/userCheckins";
import { getLastWorkoutDay, getQuickStats, type LastWorkoutDayResult, type QuickStats } from "../../lib/db/workouts";
import { useTheme } from "../../lib/theme/ThemeContext";
import { formatVolumeFromKg, formatWeightFromKg, getWeightUnitLabel } from "../../lib/utils/units";

export default function OverviewScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const [lastWorkout, setLastWorkout] = useState<LastWorkoutDayResult | null>(null);
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [userMetrics, setUserMetrics] = useState<UserMetricsSnapshot | null>(null);
  const [totalPRs, setTotalPRs] = useState(0);
  const [loading, setLoading] = useState(true);
  const weightUnitLabel = getWeightUnitLabel(unitPreference);
  const cardShadowStyle = {
    shadowColor: rawColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  } as const;

  const loadData = useCallback(async () => {
    try {
      const [workoutResult, statsResult, prCount, metricsResult] = await Promise.all([
        getLastWorkoutDay(),
        getQuickStats(),
        getTotalPBCount(),
        getLatestUserMetricsSnapshot(),
      ]);
      setLastWorkout(workoutResult);
      setQuickStats(statsResult);
      setTotalPRs(prCount);
      setUserMetrics(metricsResult);
    } catch (error) {
      console.error("Error loading home data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

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

  const formatMetricDate = (timestamp: number | null | undefined) => {
    if (typeof timestamp !== "number") {
      return "No date logged";
    }
    const date = new Date(timestamp);
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString("en-US", sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" });
  };

  const formatSleepDuration = (hoursValue: number | null | undefined) => {
    if (typeof hoursValue !== "number" || !Number.isFinite(hoursValue)) {
      return "--";
    }

    const totalMinutes = Math.max(0, Math.round(hoursValue * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  };

  const getAlphabetLetter = (index: number) => {
    return String.fromCharCode(65 + index); // A = 65
  };

  const handleWorkoutHistoryPress = () => {
    router.push("/workout-history");
  };

  const handleUserMetricsPress = () => {
    router.push("/user-metrics");
  };

  const handleCalculatorsPress = () => {
    router.push("/calculators");
  };

  // Convert timestamp to dayKey format (YYYY-MM-DD) for navigation
  const timestampToDayKey = (timestamp: number): string => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleLastWorkoutPress = () => {
    if (!lastWorkout) return;
    const dayKey = timestampToDayKey(lastWorkout.date);
    router.push({ pathname: "/workout/[dayKey]", params: { dayKey } });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {/* Header */}
        <View className="mb-6 pt-3">
          <Text className="text-[32px] leading-[38px] font-bold text-foreground">
            LiftingLog
          </Text>
        </View>

        {/* Quick Stats */}
        <View
          className="rounded-2xl p-5 mb-4 bg-surface"
          style={cardShadowStyle}
        >
          <Text className="text-lg font-semibold mb-4 text-foreground">
            Quick Stats
          </Text>
          <View className="flex-row justify-around">
            <View className="items-center">
              <MaterialCommunityIcons name="dumbbell" size={32} color={rawColors.primary} />
              <Text className="text-2xl font-bold mt-2 text-foreground">
                {quickStats?.totalWorkoutDays ?? 0}
              </Text>
              <Text className="text-xs text-foreground-secondary">Workouts</Text>
            </View>
            <View className="items-center">
              <MaterialCommunityIcons
                name={unitPreference === "lb" ? "weight-pound" : "weight-kilogram"}
                size={32}
                color={rawColors.warning}
              />
              <Text className="text-2xl font-bold mt-2 text-foreground">
                {quickStats ? formatVolumeFromKg(quickStats.totalVolumeKg, unitPreference, { abbreviate: true }) : 0}
              </Text>
              <Text className="text-xs text-foreground-secondary">Volume ({weightUnitLabel})</Text>
            </View>
            <View className="items-center">
              <MaterialCommunityIcons name="trophy" size={32} color={rawColors.success} />
              <Text className="text-2xl font-bold mt-2 text-foreground">{totalPRs}</Text>
              <Text className="text-xs text-foreground-secondary">PBs</Text>
            </View>
          </View>
        </View>

        <CalculatorsSummaryCard onPress={handleCalculatorsPress} />

        {/* User Metrics */}
        <View className="rounded-2xl p-5 mb-4 bg-surface" style={cardShadowStyle}>
          <Pressable className="mb-4 flex-row items-center justify-between" onPress={handleUserMetricsPress}>
            <View className="flex-1 pr-3">
              <Text className="text-lg font-semibold text-foreground">
                User Metrics
              </Text>
              <Text className="mt-1 text-xs text-foreground-secondary">
                Latest bodyweight and recovery check-ins
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-light">
                <MaterialCommunityIcons name="account-heart-outline" size={22} color={rawColors.primary} />
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color={rawColors.foregroundSecondary} />
            </View>
          </Pressable>

          <View className="gap-3">
            <View className="rounded-2xl border border-border-light bg-surface-secondary p-4">
              <View className="flex-row items-start gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-light">
                  <MaterialCommunityIcons name="scale-bathroom" size={24} color={rawColors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                    Bodyweight
                  </Text>
                  <Text
                    className="mt-2 text-[30px] font-bold text-foreground"
                    selectable
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {formatWeightFromKg(userMetrics?.bodyweightKg?.value, unitPreference, {
                      placeholder: "--",
                      maximumFractionDigits: 1,
                    })}
                  </Text>
                  <Text className="mt-1 text-xs text-foreground-muted" selectable>
                    {userMetrics?.bodyweightKg
                      ? `Recorded ${formatMetricDate(userMetrics.bodyweightKg.recordedAt)}`
                      : "No weigh-in logged yet"}
                  </Text>
                </View>
              </View>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1 rounded-2xl border border-border-light bg-surface-secondary p-4">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-warning/15">
                  <MaterialCommunityIcons name="sleep" size={20} color={rawColors.warning} />
                </View>
                <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                  Sleep
                </Text>
                <Text
                  className="mt-2 text-xl font-bold text-foreground"
                  numberOfLines={1}
                  selectable
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {formatSleepDuration(userMetrics?.sleepHours?.value)}
                </Text>
                <Text className="mt-1 text-xs text-foreground-muted" selectable>
                  {userMetrics?.sleepHours
                    ? formatMetricDate(userMetrics.sleepHours.recordedAt)
                    : "No sleep logged"}
                </Text>
              </View>

              <View className="flex-1 rounded-2xl border border-border-light bg-surface-secondary p-4">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <MaterialCommunityIcons name="heart-pulse" size={20} color={rawColors.destructive} />
                </View>
                <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                  Resting HR
                </Text>
                <Text
                  className="mt-2 text-xl font-bold text-foreground"
                  numberOfLines={1}
                  selectable
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {typeof userMetrics?.restingHrBpm?.value === "number"
                    ? `${userMetrics.restingHrBpm.value} bpm`
                    : "--"}
                </Text>
                <Text className="mt-1 text-xs text-foreground-muted" selectable>
                  {userMetrics?.restingHrBpm
                    ? formatMetricDate(userMetrics.restingHrBpm.recordedAt)
                    : "No RHR logged"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Workout History */}
        <View
          className="rounded-2xl p-5 mb-4 bg-surface min-h-[400px] max-h-[700px] overflow-hidden"
          style={cardShadowStyle}
        >
          {/* Card Header */}
          <Pressable
            className="flex-row justify-between items-center mb-4"
            onPress={handleWorkoutHistoryPress}
          >
            <Text className="text-lg font-semibold text-foreground">
              Workout History
            </Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={rawColors.foregroundSecondary}
            />
          </Pressable>

          {/* Content */}
          {loading ? (
            <View className="items-center py-8">
              <Text className="text-base mt-3 text-foreground-muted">
                Loading...
              </Text>
            </View>
          ) : lastWorkout === null ? (
            <View className="items-center py-8">
              <MaterialCommunityIcons
                name="clipboard-text-outline"
                size={48}
                color={rawColors.foregroundMuted}
              />
              <Text className="text-base mt-3 text-foreground-muted">
                No workouts yet
              </Text>
              <Text className="text-sm mt-1 text-center text-foreground-muted">
                Complete an exercise to see your activity here
              </Text>
            </View>
          ) : (
            <View className="flex-1 min-h-0">
              {/* Last Workout Header */}
              <Pressable className="mb-4" onPress={handleLastWorkoutPress}>
                <Text className="text-xs font-medium uppercase tracking-wide text-foreground-secondary">
                  Last Workout
                </Text>
                <Text className="text-xl font-semibold mt-1 text-foreground">
                  {formatDate(lastWorkout.date)}
                </Text>
              </Pressable>

              {/* Exercise List */}
              <ScrollView
                className="flex-1 min-h-0"
                nestedScrollEnabled
                showsVerticalScrollIndicator={lastWorkout.exercises.length > 5}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                {lastWorkout.exercises.map((exercise, index) => (
                  <Pressable
                    key={exercise.workoutExerciseId}
                    className="flex-row items-center py-2.5"
                    onPress={handleLastWorkoutPress}
                  >
                    {/* Alphabet Circle */}
                    <View className="w-8 h-8 rounded-full items-center justify-center mr-3 bg-primary">
                      <Text className="text-sm font-semibold text-primary-foreground">
                        {getAlphabetLetter(index)}
                      </Text>
                    </View>

                    {/* Exercise Details */}
                    <View className="flex-1">
                      <Text
                        className="text-[15px] font-semibold mb-0.5 text-foreground"
                        numberOfLines={1}
                      >
                        {exercise.exerciseName}
                      </Text>
                      <Text className="text-[13px] text-foreground-secondary">
                        {exercise.bestSet
                          ? `Best set: ${formatWeightFromKg(exercise.bestSet.weightKg, unitPreference)} x ${exercise.bestSet.reps} (e1RM ${formatWeightFromKg(exercise.bestSet.e1rm, unitPreference)})`
                          : "Best set: â€”"}
                      </Text>
                    </View>
                  </Pressable>
                ))}

                {/* Show more indicator */}
                {lastWorkout.hasMore && (
                  <Pressable onPress={handleLastWorkoutPress}>
                    <Text className="text-xs text-center py-2 italic text-foreground-muted">
                      Showing first 26 exercises
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

