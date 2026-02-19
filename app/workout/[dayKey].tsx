import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import SetItem from "../../components/lists/SetItem";
import BaseModal from "../../components/modals/BaseModal";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import {
  dayKeyToTimestamp,
  deleteWorkoutExercise,
  getWorkoutDayPage,
  type WorkoutDayExerciseEntry,
  type WorkoutDayPageData,
} from "../../lib/db/workouts";
import { listMediaForSetIds } from "../../lib/db/media";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
  formatVolumeFromKg,
  formatWeightFromKg,
  getWeightUnitLabel,
} from "../../lib/utils/units";

// Helper to get alphabet letter (A-Z)
const getAlphabetLetter = (index: number) => String.fromCharCode(65 + index);

export default function WorkoutDayScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const params = useLocalSearchParams<{ dayKey: string }>();
  const dayKey = typeof params.dayKey === "string" ? params.dayKey : "";

  const [data, setData] = useState<WorkoutDayPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkoutDayExerciseEntry | null>(null);
  const [setIdsWithMedia, setSetIdsWithMedia] = useState<Set<number>>(new Set());
  const weightUnitLabel = getWeightUnitLabel(unitPreference);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatVolume = (volume: number) => {
    return formatVolumeFromKg(volume, unitPreference, { abbreviate: true, maximumFractionDigits: 0 });
  };

  // Compute display title from dayKey
  const displayDate = dayKey ? new Date(dayKeyToTimestamp(dayKey)) : new Date();
  const title = `${displayDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })} Workout`;

  // Load data on focus (refreshes when returning from edit)
  const loadData = useCallback(async () => {
    if (!dayKey) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await getWorkoutDayPage(dayKey);
      setData(result);
    } catch (error) {
      console.error("Error loading workout day page:", error);
    } finally {
      setLoading(false);
    }
  }, [dayKey]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    let cancelled = false;
    const setIds = data
      ? data.entries.flatMap((entry) => entry.sets.map((set) => set.id)).filter((id) => id > 0)
      : [];
    if (setIds.length === 0) {
      setSetIdsWithMedia(new Set());
      return () => {
        cancelled = true;
      };
    }

    listMediaForSetIds(setIds)
      .then((mediaRows) => {
        if (cancelled) return;
        const nextSetIds = new Set(
          mediaRows
            .map((row) => row.setId)
            .filter((setId): setId is number => typeof setId === "number")
        );
        setSetIdsWithMedia(nextSetIds);
      })
      .catch(() => {
        if (!cancelled) setSetIdsWithMedia(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [data]);

  // Handle edit action - navigate to edit page
  const handleEdit = useCallback((entry: WorkoutDayExerciseEntry) => {
    router.push({
      pathname: "/edit-workout",
      params: {
        workoutExerciseId: String(entry.workoutExerciseId),
        exerciseName: entry.exerciseName,
      },
    });
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmVisible(false);
    setDeleteTarget(null);
  }, []);

  // Handle delete action - delete the workout exercise entry
  const handleDelete = useCallback((entry: WorkoutDayExerciseEntry) => {
    setDeleteTarget(entry);
    setDeleteConfirmVisible(true);
  }, []);

  const handleSetPress = useCallback((setId: number) => {
    router.push({ pathname: "/set/[id]", params: { id: String(setId) } });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;

    closeDeleteConfirm();

    try {
      await deleteWorkoutExercise(deleteTarget.workoutExerciseId);
      await loadData();
    } catch (error) {
      console.error("Error deleting workout exercise:", error);
      Alert.alert("Error", "Failed to delete exercise. Please try again.");
    }
  }, [deleteTarget, closeDeleteConfirm, loadData]);

  if (!dayKey) {
    return (
      <View style={[styles.container, { backgroundColor: rawColors.background }]}>
        <Stack.Screen
          options={{
            title: "Workout",
            headerStyle: { backgroundColor: rawColors.surface },
            headerTitleStyle: { color: rawColors.foreground },
          }}
        />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: rawColors.destructive }]}>
            Invalid workout day
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: rawColors.background }]}>
      <Stack.Screen
        options={{
          title,
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={rawColors.primary} />
        </View>
      ) : !data ? (
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons
            name="clipboard-text-outline"
            size={64}
            color={rawColors.foregroundMuted}
          />
          <Text style={[styles.emptyText, { color: rawColors.foregroundMuted }]}>
            No workout data found
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          {/* Stats Card */}
          <View style={[styles.statsCard, { backgroundColor: rawColors.surface, shadowColor: rawColors.shadow }]}>
            <Text style={[styles.statsTitle, { color: rawColors.foreground }]}>Workout Stats</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statsCardItem}>
                <Text style={[styles.statsCardValue, { color: rawColors.foreground }]}>
                  {data.totals.totalExercises}
                </Text>
                <Text style={[styles.statsCardLabel, { color: rawColors.foregroundSecondary }]}>
                  Exercises
                </Text>
              </View>
              <View style={styles.statsCardItem}>
                <Text style={[styles.statsCardValue, { color: rawColors.foreground }]}>
                  {data.totals.totalSets}
                </Text>
                <Text style={[styles.statsCardLabel, { color: rawColors.foregroundSecondary }]}>
                  Sets
                </Text>
              </View>
              <View style={styles.statsCardItem}>
                <Text style={[styles.statsCardValue, { color: rawColors.foreground }]}>
                  {data.totals.totalReps}
                </Text>
                <Text style={[styles.statsCardLabel, { color: rawColors.foregroundSecondary }]}>
                  Reps
                </Text>
              </View>
              <View style={styles.statsCardItem}>
                <Text style={[styles.statsCardValue, { color: rawColors.foreground }]}>
                  {formatVolumeFromKg(data.totals.totalVolumeKg, unitPreference, { maximumFractionDigits: 0 })}
                </Text>
                <Text style={[styles.statsCardLabel, { color: rawColors.foregroundSecondary }]}>
                  Volume ({weightUnitLabel})
                </Text>
              </View>
              {data.totals.bestE1rmKg && (
                <View style={styles.statsCardItem}>
                  <Text style={[styles.statsCardValue, { color: rawColors.foreground }]}>
                    {formatWeightFromKg(data.totals.bestE1rmKg, unitPreference, {
                      withUnit: false,
                      maximumFractionDigits: 0,
                    })}
                  </Text>
                  <Text style={[styles.statsCardLabel, { color: rawColors.foregroundSecondary }]}>
                    Best e1RM ({weightUnitLabel})
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Exercise List */}
          <View style={styles.exerciseListSection}>
            <Text style={[styles.sectionTitle, { color: rawColors.foreground }]}>
              Exercises ({data.entries.length})
            </Text>

            {data.entries.map((entry, index) => (
              <View
                key={entry.workoutExerciseId}
                style={[
                  styles.exerciseCard,
                  { backgroundColor: rawColors.surface, borderColor: rawColors.border },
                ]}
              >
                {/* Header Row - A-Z badge + exercise name + time */}
                <View style={[styles.exerciseHeader, { borderBottomColor: rawColors.border }]}>
                  <View style={styles.exerciseHeaderLeft}>
                    <View style={[styles.alphabetCircle, { backgroundColor: rawColors.primary }]}>
                      <Text style={styles.alphabetText}>{getAlphabetLetter(index)}</Text>
                    </View>
                    <View style={styles.exerciseTitleBlock}>
                      <Text style={[styles.exerciseName, { color: rawColors.foreground }]} numberOfLines={1}>
                        {entry.exerciseName}
                      </Text>
                      <View style={styles.exerciseMetaRow}>
                        <MaterialCommunityIcons name="clock-outline" size={14} color={rawColors.foregroundSecondary} />
                        <Text style={[styles.exerciseMetaText, { color: rawColors.foregroundSecondary }]}>
                          {formatTime(entry.performedAt)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.headerActions}>
                    <Pressable
                      onPress={() => handleEdit(entry)}
                      hitSlop={8}
                      style={[styles.actionIconButton, { backgroundColor: rawColors.background }]}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={16} color={rawColors.primary} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(entry)}
                      hitSlop={8}
                      style={[styles.actionIconButton, { backgroundColor: rawColors.background }]}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={rawColors.destructive} />
                    </Pressable>
                  </View>
                </View>

                {/* Session Stats */}
                <View style={[styles.sessionStatsContainer, { backgroundColor: rawColors.surfaceSecondary }]}>
                  <View style={styles.statItem}>
                    <MaterialCommunityIcons name="dumbbell" size={14} color={rawColors.foregroundSecondary} />
                    <Text style={[styles.statValue, { color: rawColors.foreground }]}>{entry.totalSets}</Text>
                    <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>sets</Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: rawColors.border }]} />
                  <View style={styles.statItem}>
                    <MaterialCommunityIcons name="repeat" size={14} color={rawColors.foregroundSecondary} />
                    <Text style={[styles.statValue, { color: rawColors.foreground }]}>{entry.totalReps}</Text>
                    <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>reps</Text>
                  </View>
                  <View style={[styles.statDivider, { backgroundColor: rawColors.border }]} />
                  <View style={styles.statItem}>
                    <MaterialCommunityIcons name="weight" size={14} color={rawColors.foregroundSecondary} />
                    <Text style={[styles.statValue, { color: rawColors.foreground }]}>{formatVolume(entry.totalVolumeKg)}</Text>
                    <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>{weightUnitLabel} vol</Text>
                  </View>
                </View>

                {/* Sets List */}
                <View style={styles.setsContainer}>
                  {entry.sets.length === 0 ? (
                    <Text style={[styles.noSetsText, { color: rawColors.foregroundMuted }]}>
                      No sets recorded
                    </Text>
                  ) : (
                    (() => {
                      let bestSetHighlighted = false;
                      return entry.sets.map((set, setIndex) => {
                        const isBestSetMatch =
                          !bestSetHighlighted &&
                          !!entry.bestSet &&
                          set.weightKg === entry.bestSet.weightKg &&
                          set.reps === entry.bestSet.reps;

                        if (isBestSetMatch) {
                          bestSetHighlighted = true;
                        }

                        return (
                          <SetItem
                            key={set.id}
                            index={setIndex + 1}
                            weightKg={set.weightKg}
                            reps={set.reps}
                            note={set.note}
                            variant="compact"
                            isBestSet={isBestSetMatch}
                            onPress={() => handleSetPress(set.id)}
                            rightActions={
                              setIdsWithMedia.has(set.id) ? (
                                <View style={styles.mediaIconBadge}>
                                  <MaterialCommunityIcons
                                    name="video-outline"
                                    size={16}
                                    color={rawColors.primary}
                                  />
                                </View>
                              ) : undefined
                            }
                          />
                        );
                      });
                    })()
                  )}
                </View>
              </View>
            ))}

            {/* Overflow indicator */}
            {data.hasMore && (
              <Text style={[styles.showMoreText, { color: rawColors.foregroundMuted }]}>
                Showing first 26 exercises
              </Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* Delete Exercise Confirm Modal */}
      <BaseModal
        visible={deleteConfirmVisible}
        onClose={closeDeleteConfirm}
        maxWidth={380}
      >
        <Text className="text-xl font-bold mb-2 text-foreground">Delete exercise?</Text>
        <Text className="text-base mb-4 text-foreground-secondary">
          This will remove the exercise and all recorded sets. This action cannot be undone.
        </Text>

        {deleteTarget && (
          <View className="rounded-lg p-3 mb-5 bg-surface-secondary border border-border">
            <Text className="text-sm font-semibold text-foreground">
              {deleteTarget.exerciseName} • {formatTime(deleteTarget.performedAt)}
            </Text>
            <Text className="text-sm mt-1 text-foreground-secondary">
              {deleteTarget.sets.length} set{deleteTarget.sets.length !== 1 ? "s" : ""}
            </Text>
          </View>
        )}

        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
            onPress={closeDeleteConfirm}
          >
            <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center p-3.5 rounded-lg gap-1.5 bg-destructive"
            onPress={handleConfirmDelete}
          >
            <MaterialCommunityIcons name="delete" size={20} color={rawColors.surface} />
            <Text className="text-base font-semibold text-primary-foreground">Delete</Text>
          </Pressable>
        </View>
      </BaseModal>

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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  // Stats Card
  statsCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
  },
  statsCardItem: {
    alignItems: "center",
    minWidth: 70,
    marginBottom: 8,
  },
  statsCardValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  statsCardLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  // Exercise List Section
  exerciseListSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  // Exercise Card (aligned with HistoryTab styles)
  exerciseCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  exerciseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  exerciseMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  exerciseMetaText: {
    fontSize: 13,
    fontWeight: "500",
  },
  exerciseHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  exerciseTitleBlock: {
    flex: 1,
    justifyContent: "center",
    gap: 4,
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
  mediaIconBadge: {
    marginLeft: 8,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
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
  exerciseName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  setsContainer: {
    gap: 4,
  },
  noSetsText: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 8,
  },
  showMoreText: {
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 12,
    fontStyle: "italic",
  },
  // Session Stats
  sessionStatsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 10,
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
