import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { getTotalPRCount } from "../../lib/db/prEvents";
import { getLastWorkoutDay, getQuickStats, type LastWorkoutDayResult, type QuickStats } from "../../lib/db/workouts";
import { useTheme } from "../../lib/theme/ThemeContext";

export default function OverviewScreen() {
  const { rawColors } = useTheme();
  const [lastWorkout, setLastWorkout] = useState<LastWorkoutDayResult | null>(null);
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [totalPRs, setTotalPRs] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [workoutResult, statsResult, prCount] = await Promise.all([
        getLastWorkoutDay(),
        getQuickStats(),
        getTotalPRCount(),
      ]);
      setLastWorkout(workoutResult);
      setQuickStats(statsResult);
      setTotalPRs(prCount);
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

  const getAlphabetLetter = (index: number) => {
    return String.fromCharCode(65 + index); // A = 65
  };

  const handleWorkoutHistoryPress = () => {
    router.push("/workout-history");
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
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Header */}
        <View className="mb-6 mt-12">
          <Text className="text-3xl font-bold text-foreground">
            WorkoutLog
          </Text>
        </View>

        {/* Quick Stats */}
        <View
          className="rounded-2xl p-5 mb-4 bg-surface"
          style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
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
              <MaterialCommunityIcons name="weight-kilogram" size={32} color={rawColors.warning} />
              <Text className="text-2xl font-bold mt-2 text-foreground">
                {quickStats ? (quickStats.totalVolumeKg >= 1000 
                  ? `${(quickStats.totalVolumeKg / 1000).toFixed(1)}k` 
                  : quickStats.totalVolumeKg) : 0}
              </Text>
              <Text className="text-xs text-foreground-secondary">Volume (kg)</Text>
            </View>
            <View className="items-center">
              <MaterialCommunityIcons name="trophy" size={32} color={rawColors.success} />
              <Text className="text-2xl font-bold mt-2 text-foreground">{totalPRs}</Text>
              <Text className="text-xs text-foreground-secondary">PRs</Text>
            </View>
          </View>
        </View>

        {/* Workout History */}
        <View
          className="rounded-2xl p-5 mb-4 bg-surface min-h-[400px] max-h-[700px]"
          style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
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
            <Pressable className="flex-1" onPress={handleLastWorkoutPress}>
              {/* Last Workout Header */}
              <View className="mb-4">
                <Text className="text-xs font-medium uppercase tracking-wide text-foreground-secondary">
                  Last Workout
                </Text>
                <Text className="text-xl font-semibold mt-1 text-foreground">
                  {formatDate(lastWorkout.date)}
                </Text>
              </View>

              {/* Exercise List */}
              <View className="flex-1">
                {lastWorkout.exercises.map((exercise, index) => (
                  <View key={exercise.workoutExerciseId} className="flex-row items-center py-2.5">
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
                          ? `Best set: ${exercise.bestSet.weightKg} kg × ${exercise.bestSet.reps} (e1RM ${exercise.bestSet.e1rm} kg)`
                          : "Best set: —"}
                      </Text>
                    </View>
                  </View>
                ))}

                {/* Show more indicator */}
                {lastWorkout.hasMore && (
                  <Text className="text-xs text-center py-2 italic text-foreground-muted">
                    Showing first 26 exercises
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
