import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Calendar } from "react-native-calendars";
import type { DateData, MarkedDates } from "react-native-calendars/src/types";
import { TabBar, TabView } from "react-native-tab-view";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
  getProgramById,
  activateProgram,
  deactivateProgram,
  deleteProgram,
  type Program,
} from "../../lib/db/programs";
import { listProgramDays } from "../../lib/db/programDays";
import { listProgramExercises } from "../../lib/db/programExercises";
import {
  listPlannedWorkoutsInRange,
  getNextPlannedWorkout,
  getCompletedDayKeysInRange,
  generatePlannedWorkoutsWindow,
  applyPlannedWorkout,
  type PlannedWorkout,
  type AppliedExercise,
} from "../../lib/db/plannedWorkouts";
import { getExerciseById } from "../../lib/db/exercises";
import { parseProgramPrescription } from "../../lib/programs/prescription";
import { getWorkoutExercisesForDate, resetWorkoutForDate, type WorkoutExerciseStatus } from "../../lib/db/workouts";
import BaseModal from "../../components/modals/BaseModal";

// ============================================================================
// Types
// ============================================================================

type UpcomingExercise = {
  programExerciseId: number;
  exerciseId: number;
  exerciseName: string;
  prescriptionSummary: string;
  weightSummary: string;
};

type CalendarExercise = {
  programExerciseId: number;
  exerciseId: number;
  exerciseName: string;
  prescriptionSummary: string;
};

type CalendarDayInfo = {
  dayKey: string;
  programDayId: number;
  planned: PlannedWorkout | null;
  completed: boolean;
  exercises: CalendarExercise[];
};

// ============================================================================
// Upcoming Tab
// ============================================================================

function UpcomingTab({
  program,
  rawColors,
}: {
  program: Program;
  rawColors: any;
}) {
  const [nextPlanned, setNextPlanned] = useState<PlannedWorkout | null>(null);
  const [exercises, setExercises] = useState<UpcomingExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [appliedExercises, setAppliedExercises] = useState<AppliedExercise[]>([]);
  const [exerciseStatuses, setExerciseStatuses] = useState<WorkoutExerciseStatus[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await generatePlannedWorkoutsWindow(program.id);
      const next = await getNextPlannedWorkout(program.id);
      setNextPlanned(next);

      if (next) {
        // Load exercise details for this planned day
        const pes = await listProgramExercises(next.programDayId);
        const items: UpcomingExercise[] = [];
        for (const pe of pes) {
          const ex = await getExerciseById(pe.exerciseId);
          const prescription = parseProgramPrescription(pe.prescriptionJson);

          let summary = "Not configured";
          let weightStr = "";
          if (prescription) {
            const workBlocks = prescription.blocks.filter((b) => b.kind === "work");
            if (workBlocks.length > 0) {
              const parts: string[] = [];
              for (const wb of workBlocks) {
                if (wb.kind === "work") {
                  const repsStr =
                    wb.reps.type === "fixed" ? `${wb.reps.value}` : `${wb.reps.min}-${wb.reps.max}`;
                  parts.push(`${wb.sets}x${repsStr}`);
                  if (wb.target?.type === "fixed_weight_kg") {
                    weightStr = `${wb.target.value}kg`;
                  } else if (wb.target?.type === "rpe") {
                    weightStr = `RPE ${wb.target.value}`;
                  } else if (wb.target?.type === "percent_e1rm") {
                    weightStr = `${wb.target.value}% e1RM`;
                  }
                }
              }
              summary = parts.join(" + ");
            }
          }

          items.push({
            programExerciseId: pe.id,
            exerciseId: pe.exerciseId,
            exerciseName: ex?.name ?? "Unknown",
            prescriptionSummary: summary,
            weightSummary: weightStr,
          });
        }
        setExercises(items);

        // Check if workout was already started (exercises exist for this date)
        const statuses = await getWorkoutExercisesForDate(next.plannedFor);
        setExerciseStatuses(statuses);
        if (statuses.length > 0) {
          setWorkoutStarted(true);
          // Reconstruct applied exercises from statuses
          setAppliedExercises(
            statuses.map((s) => ({
              workoutExerciseId: s.workoutExerciseId,
              exerciseId: s.exerciseId,
              exerciseName: s.exerciseName,
            }))
          );
        } else {
          setWorkoutStarted(false);
          setAppliedExercises([]);
        }
      } else {
        setExercises([]);
        setWorkoutStarted(false);
        setAppliedExercises([]);
        setExerciseStatuses([]);
      }
    } catch (error) {
      console.error("Error loading upcoming workout:", error);
    } finally {
      setLoading(false);
    }
  }, [program.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleStartWorkout = useCallback(async () => {
    if (!nextPlanned || applying) return;
    setApplying(true);
    try {
      const applied = await applyPlannedWorkout(nextPlanned.id);
      setAppliedExercises(applied);
      setWorkoutStarted(true);

      // Refresh statuses
      const statuses = await getWorkoutExercisesForDate(nextPlanned.plannedFor);
      setExerciseStatuses(statuses);
    } catch (error) {
      console.error("Error starting workout:", error);
    } finally {
      setApplying(false);
    }
  }, [nextPlanned, applying]);

  const handleResetWorkout = useCallback(() => {
    if (!nextPlanned) return;
    Alert.alert(
      "Reset Workout",
      "This will remove all uncompleted exercises and their sets for this workout day. Already completed exercises will be kept. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await resetWorkoutForDate(nextPlanned.plannedFor);
            setWorkoutStarted(false);
            setAppliedExercises([]);
            setExerciseStatuses([]);
            await loadData();
          },
        },
      ]
    );
  }, [nextPlanned, loadData]);

  const handleExercisePress = useCallback(
    (applied: AppliedExercise) => {
      router.push({
        pathname: "/exercise/[id]",
        params: {
          id: String(applied.exerciseId),
          name: applied.exerciseName,
          tab: "record",
          weId: String(applied.workoutExerciseId),
          plannedDate: nextPlanned ? String(nextPlanned.plannedFor) : undefined,
        },
      });
    },
    [nextPlanned]
  );

  const formatPlannedDate = (ts: number) => {
    const date = new Date(ts);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
    const dateStr = date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });

    if (date.toDateString() === today.toDateString()) return `Today — ${dateStr}`;
    if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow — ${dateStr}`;
    return `${dayName} — ${dateStr}`;
  };

  const getExerciseCompletionStatus = (exerciseId: number): "completed" | "in_progress" | "pending" => {
    const status = exerciseStatuses.find((s) => s.exerciseId === exerciseId);
    if (!status) return "pending";
    if (status.completedAt) return "completed";
    return "in_progress";
  };

  const completedCount = exerciseStatuses.filter((s) => s.completedAt).length;
  const totalCount = workoutStarted ? appliedExercises.length : exercises.length;

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={rawColors.primary} />
      </View>
    );
  }

  if (!nextPlanned) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <MaterialCommunityIcons name="calendar-check" size={64} color={rawColors.foregroundMuted} />
        <Text className="text-xl font-bold mt-4 text-foreground-muted">No Upcoming Workouts</Text>
        <Text className="text-sm mt-2 text-center text-foreground-muted">
          All planned workouts have been completed, or the program has no scheduled days.
        </Text>
        <Pressable
          className="mt-6 px-6 py-3 rounded-xl bg-primary"
          onPress={() =>
            router.push({ pathname: "/programs/builder", params: { programId: String(program.id) } })
          }
        >
          <Text className="text-base font-semibold text-primary-foreground">Edit Program</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {/* Date Header Card */}
        <View
          className="rounded-2xl p-5 mb-5 bg-surface"
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.12,
            shadowRadius: 10,
            elevation: 5,
          }}
        >
          <View className="flex-row items-center mb-2">
            <MaterialCommunityIcons name="calendar-today" size={20} color={rawColors.primary} />
            <Text className="text-sm font-semibold ml-2 text-primary">NEXT WORKOUT</Text>
          </View>
          <Text className="text-xl font-bold text-foreground">
            {formatPlannedDate(nextPlanned.plannedFor)}
          </Text>
          {workoutStarted && (
            <View className="flex-row items-center mt-2">
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: completedCount === totalCount ? rawColors.success : rawColors.warning,
                  marginRight: 8,
                }}
              />
              <Text className="text-sm text-foreground-secondary">
                {completedCount}/{totalCount} exercises completed
              </Text>
            </View>
          )}
        </View>

        {/* Exercise List */}
        <Text className="text-base font-bold mb-3 text-foreground">
          {workoutStarted ? "Workout Exercises" : "Planned Exercises"} ({totalCount})
        </Text>

        {workoutStarted ? (
          // Show applied exercises with completion tracking
          appliedExercises.map((applied, idx) => {
            const status = getExerciseCompletionStatus(applied.exerciseId);
            const isComplete = status === "completed";
            const isInProgress = status === "in_progress";

            return (
              <Pressable
                key={applied.workoutExerciseId}
                onPress={() => handleExercisePress(applied)}
                style={[
                  {
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 10,
                    borderWidth: 1.5,
                    borderColor: isComplete
                      ? rawColors.success
                      : isInProgress
                      ? rawColors.primary
                      : rawColors.border,
                    backgroundColor: isComplete
                      ? rawColors.success + "12"
                      : rawColors.surface,
                  },
                ]}
              >
                <View className="flex-row items-center">
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isComplete
                        ? rawColors.success
                        : isInProgress
                        ? rawColors.primary
                        : rawColors.surfaceSecondary,
                      marginRight: 12,
                    }}
                  >
                    {isComplete ? (
                      <MaterialCommunityIcons name="check" size={20} color="#fff" />
                    ) : (
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: isInProgress ? rawColors.primaryForeground : rawColors.foregroundSecondary,
                        }}
                      >
                        {String.fromCharCode(65 + idx)}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: isComplete ? rawColors.success : rawColors.foreground,
                        textDecorationLine: isComplete ? "line-through" : "none",
                      }}
                      numberOfLines={1}
                    >
                      {applied.exerciseName}
                    </Text>
                    <Text className="text-xs mt-0.5" style={{ color: rawColors.foregroundSecondary }}>
                      {isComplete ? "Completed" : isInProgress ? "Tap to log sets" : "Not started"}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={isComplete ? "check-circle" : "chevron-right"}
                    size={22}
                    color={isComplete ? rawColors.success : rawColors.foregroundSecondary}
                  />
                </View>
              </Pressable>
            );
          })
        ) : (
          // Show planned exercises (before start)
          exercises.map((item, idx) => (
            <View
              key={item.programExerciseId}
              style={{
                borderRadius: 16,
                padding: 16,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: rawColors.border,
                backgroundColor: rawColors.surface,
              }}
            >
              <View className="flex-row items-center">
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: rawColors.primary,
                    marginRight: 12,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: rawColors.primaryForeground }}>
                    {String.fromCharCode(65 + idx)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text
                    style={{ fontSize: 15, fontWeight: "600", color: rawColors.foreground }}
                    numberOfLines={1}
                  >
                    {item.exerciseName}
                  </Text>
                  <View className="flex-row items-center mt-0.5">
                    <Text className="text-xs" style={{ color: rawColors.foregroundSecondary }}>
                      {item.prescriptionSummary}
                    </Text>
                    {item.weightSummary ? (
                      <Text className="text-xs ml-1.5 font-semibold" style={{ color: rawColors.primary }}>
                        {item.weightSummary}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          ))
        )}

        {exercises.length === 0 && !workoutStarted && (
          <View className="items-center py-10">
            <MaterialCommunityIcons name="dumbbell" size={48} color={rawColors.foregroundMuted} />
            <Text className="text-base font-medium mt-3 text-foreground-muted">
              No exercises planned for this day
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Button */}
      {!workoutStarted && exercises.length > 0 && (
        <View
          className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-border bg-background"
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 10,
          }}
        >
          <Pressable
            className="flex-row items-center justify-center py-4 rounded-2xl bg-primary"
            style={({ pressed }) => ({ opacity: pressed || applying ? 0.7 : 1 })}
            onPress={handleStartWorkout}
            disabled={applying}
          >
            <MaterialCommunityIcons name="play" size={24} color={rawColors.primaryForeground} />
            <Text className="text-lg font-bold ml-2 text-primary-foreground">
              {applying ? "Starting..." : "Start Workout"}
            </Text>
          </Pressable>
        </View>
      )}

      {workoutStarted && (
        <View
          className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-border bg-background"
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 10,
          }}
        >
          {completedCount < totalCount && (
            <View
              style={{
                borderRadius: 16,
                padding: 16,
                backgroundColor: rawColors.surface,
                borderWidth: 1,
                borderColor: rawColors.border,
                marginBottom: 10,
              }}
            >
              {/* Progress bar */}
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-semibold text-foreground">Workout Progress</Text>
                <Text className="text-sm font-semibold" style={{ color: rawColors.primary }}>
                  {completedCount}/{totalCount}
                </Text>
              </View>
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: rawColors.surfaceSecondary,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: rawColors.primary,
                    width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
                  }}
                />
              </View>
            </View>
          )}

          {/* Reset Workout Button */}
          <Pressable
            className="flex-row items-center justify-center py-3 rounded-xl"
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              backgroundColor: rawColors.destructive + "15",
              borderWidth: 1,
              borderColor: rawColors.destructive + "40",
            })}
            onPress={handleResetWorkout}
          >
            <MaterialCommunityIcons name="restart" size={18} color={rawColors.destructive} />
            <Text
              className="text-sm font-semibold ml-1.5"
              style={{ color: rawColors.destructive }}
            >
              Reset Workout
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Calendar Tab
// ============================================================================

function CalendarTab({
  program,
  rawColors,
}: {
  program: Program;
  rawColors: any;
}) {
  const [calendarMode, setCalendarMode] = useState<"grid" | "list">("grid");
  const [dayInfoMap, setDayInfoMap] = useState<Map<string, CalendarDayInfo>>(new Map());
  const [allDays, setAllDays] = useState<CalendarDayInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());

  const loadCalendarData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const windowEnd = new Date(today);
      windowEnd.setDate(windowEnd.getDate() + 56);

      const [planned, completed, days] = await Promise.all([
        listPlannedWorkoutsInRange(program.id, today.getTime(), windowEnd.getTime()),
        getCompletedDayKeysInRange(today.getTime(), windowEnd.getTime()),
        listProgramDays(program.id),
      ]);

      const completedSet = new Set(completed);
      setCompletedKeys(completedSet);

      // Build planned map by dayKey
      const plannedByDayKey = new Map<string, PlannedWorkout>();
      for (const pw of planned) {
        const dk = dayKeyFromTimestamp(pw.plannedFor);
        plannedByDayKey.set(dk, pw);
      }

      // Build dayInfo from program_days that have exercises
      const map = new Map<string, CalendarDayInfo>();
      const daysList: CalendarDayInfo[] = [];

      for (const day of days) {
        if (day.note && /^\d{4}-\d{2}-\d{2}$/.test(day.note)) {
          const dayKey = day.note;
          const pes = await listProgramExercises(day.id);
          if (pes.length === 0) continue;

          const exerciseItems: CalendarExercise[] = [];
          for (const pe of pes) {
            const ex = await getExerciseById(pe.exerciseId);
            const prescription = parseProgramPrescription(pe.prescriptionJson);
            let summary = "Not configured";
            if (prescription) {
              const workBlocks = prescription.blocks.filter((b) => b.kind === "work");
              if (workBlocks.length > 0) {
                const parts: string[] = [];
                for (const wb of workBlocks) {
                  if (wb.kind === "work") {
                    const repsStr =
                      wb.reps.type === "fixed" ? `${wb.reps.value}` : `${wb.reps.min}-${wb.reps.max}`;
                    let wStr = "";
                    if (wb.target?.type === "fixed_weight_kg") wStr = ` @ ${wb.target.value}kg`;
                    parts.push(`${wb.sets}x${repsStr}${wStr}`);
                  }
                }
                summary = parts.join(" + ");
              }
            }
            exerciseItems.push({
              programExerciseId: pe.id,
              exerciseId: pe.exerciseId,
              exerciseName: ex?.name ?? "Unknown",
              prescriptionSummary: summary,
            });
          }

          const pw = plannedByDayKey.get(dayKey) ?? null;
          const info: CalendarDayInfo = {
            dayKey,
            programDayId: day.id,
            planned: pw,
            completed: completedSet.has(dayKey),
            exercises: exerciseItems,
          };
          map.set(dayKey, info);
          daysList.push(info);
        }
      }

      setDayInfoMap(map);
      setAllDays(daysList.sort((a, b) => a.dayKey.localeCompare(b.dayKey)));
    } catch (error) {
      console.error("Error loading calendar:", error);
    } finally {
      setLoading(false);
    }
  }, [program.id]);

  useFocusEffect(
    useCallback(() => {
      loadCalendarData();
    }, [loadCalendarData])
  );

  // Calendar marked dates
  const markedDates: MarkedDates = useMemo(() => {
    const marks: MarkedDates = {};
    for (const [dk, info] of dayInfoMap) {
      const isCompleted = completedKeys.has(dk);
      marks[dk] = {
        customStyles: {
          container: {
            backgroundColor: isCompleted ? rawColors.success : rawColors.primary,
            borderRadius: 8,
          },
          text: {
            color: "#fff",
            fontWeight: "bold",
          },
        },
      };
    }
    return marks;
  }, [dayInfoMap, completedKeys, rawColors]);

  const calendarTheme = useMemo(
    () => ({
      backgroundColor: rawColors.background,
      calendarBackground: rawColors.background,
      textSectionTitleColor: rawColors.foregroundSecondary,
      selectedDayBackgroundColor: rawColors.primary,
      selectedDayTextColor: rawColors.primaryForeground,
      todayTextColor: rawColors.primary,
      dayTextColor: rawColors.foreground,
      textDisabledColor: rawColors.foregroundMuted,
      monthTextColor: rawColors.foreground,
      arrowColor: rawColors.primary,
      textMonthFontWeight: "bold" as const,
      textDayFontSize: 15,
      textMonthFontSize: 17,
      textDayHeaderFontSize: 13,
    }),
    [rawColors]
  );

  const handleDayPress = useCallback(
    (dateData: DateData) => {
      const dk = dateData.dateString;
      const info = dayInfoMap.get(dk);
      if (info) {
        router.push({
          pathname: "/programs/day/[dayKey]",
          params: {
            dayKey: dk,
            programId: String(program.id),
            programDayId: String(info.programDayId),
          },
        });
      }
    },
    [dayInfoMap, program.id]
  );

  const formatDayKey = (dk: string) => {
    const d = new Date(dk + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  // Build list for 8 weeks — show ALL days
  const listDays = useMemo(() => {
    const days: { dayKey: string; info: CalendarDayInfo | null; hasExercises: boolean }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 56; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const info = dayInfoMap.get(dk) ?? null;
      const hasExercises = info !== null && info.exercises.length > 0;
      days.push({ dayKey: dk, info, hasExercises });
    }
    return days;
  }, [dayInfoMap]);

  const handleListDayPress = useCallback(
    (dk: string) => {
      const info = dayInfoMap.get(dk);
      if (info) {
        router.push({
          pathname: "/programs/day/[dayKey]",
          params: {
            dayKey: dk,
            programId: String(program.id),
            programDayId: String(info.programDayId),
          },
        });
      }
    },
    [dayInfoMap, program.id]
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={rawColors.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      {/* Mode toggle */}
      <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
        <View className="flex-row items-center">
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: rawColors.primary,
              marginRight: 6,
            }}
          />
          <Text className="text-xs text-foreground-secondary">Planned</Text>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: rawColors.success,
              marginLeft: 12,
              marginRight: 6,
            }}
          />
          <Text className="text-xs text-foreground-secondary">Completed</Text>
        </View>
        <View className="flex-row bg-surface-secondary rounded-lg overflow-hidden">
          <Pressable
            className={`px-3 py-1.5 ${calendarMode === "grid" ? "bg-primary" : ""}`}
            onPress={() => setCalendarMode("grid")}
          >
            <MaterialCommunityIcons
              name="calendar-month"
              size={18}
              color={calendarMode === "grid" ? rawColors.primaryForeground : rawColors.foregroundSecondary}
            />
          </Pressable>
          <Pressable
            className={`px-3 py-1.5 ${calendarMode === "list" ? "bg-primary" : ""}`}
            onPress={() => setCalendarMode("list")}
          >
            <MaterialCommunityIcons
              name="format-list-bulleted"
              size={18}
              color={calendarMode === "list" ? rawColors.primaryForeground : rawColors.foregroundSecondary}
            />
          </Pressable>
        </View>
      </View>

      {calendarMode === "grid" ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          <Calendar
            theme={calendarTheme}
            markingType="custom"
            markedDates={markedDates}
            onDayPress={handleDayPress}
            enableSwipeMonths
          />

          {/* Scheduled days list under calendar */}
          {allDays.length > 0 && (
            <View className="px-4 mt-4">
              <Text className="text-base font-bold mb-3 text-foreground">
                Upcoming Workouts ({allDays.length})
              </Text>
              {allDays.map((info) => {
                const isCompleted = completedKeys.has(info.dayKey);
                return (
                  <Pressable
                    key={info.dayKey}
                    onPress={() => handleListDayPress(info.dayKey)}
                    style={{
                      borderRadius: 14,
                      padding: 14,
                      marginBottom: 8,
                      borderWidth: 1.5,
                      borderColor: isCompleted ? rawColors.success : rawColors.primary + "40",
                      backgroundColor: isCompleted
                        ? rawColors.success + "10"
                        : rawColors.surface,
                    }}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <View className="flex-row items-center">
                          <MaterialCommunityIcons
                            name={isCompleted ? "check-circle" : "calendar"}
                            size={16}
                            color={isCompleted ? rawColors.success : rawColors.primary}
                          />
                          <Text
                            className="text-[15px] font-semibold ml-2"
                            style={{ color: rawColors.foreground }}
                          >
                            {formatDayKey(info.dayKey)}
                          </Text>
                        </View>
                        <Text
                          className="text-xs mt-1"
                          style={{ color: rawColors.foregroundSecondary, marginLeft: 24 }}
                          numberOfLines={2}
                        >
                          {info.exercises.map((e) => e.exerciseName).join(", ")}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={20}
                        color={rawColors.foregroundSecondary}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={listDays}
          keyExtractor={(item) => item.dayKey}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          renderItem={({ item }) => {
            const active = item.hasExercises;
            const isCompleted = completedKeys.has(item.dayKey);
            return (
              <Pressable
                onPress={() => {
                  if (active) handleListDayPress(item.dayKey);
                }}
                style={{
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 6,
                  borderWidth: 1,
                  borderColor: isCompleted
                    ? rawColors.success
                    : active
                    ? rawColors.primary
                    : rawColors.border,
                  backgroundColor: isCompleted
                    ? rawColors.success + "12"
                    : active
                    ? rawColors.primary + "10"
                    : rawColors.surface,
                  opacity: active ? 1 : 0.45,
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      {isCompleted ? (
                        <MaterialCommunityIcons name="check-circle" size={16} color={rawColors.success} />
                      ) : active ? (
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: rawColors.primary,
                          }}
                        />
                      ) : null}
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: active ? "700" : "500",
                          color: active ? rawColors.foreground : rawColors.foregroundMuted,
                          marginLeft: active || isCompleted ? 8 : 0,
                        }}
                      >
                        {formatDayKey(item.dayKey)}
                      </Text>
                    </View>
                    {active && item.info ? (
                      <Text
                        className="text-xs mt-1"
                        style={{ color: rawColors.foregroundSecondary, marginLeft: 16 }}
                        numberOfLines={2}
                      >
                        {item.info.exercises.map((e) => e.exerciseName).join(", ")}
                      </Text>
                    ) : (
                      <Text className="text-xs mt-1" style={{ color: rawColors.foregroundMuted }}>
                        Rest day
                      </Text>
                    )}
                  </View>
                  {active && (
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={isCompleted ? rawColors.success : rawColors.primary}
                    />
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

// ============================================================================
// Helper
// ============================================================================

function dayKeyFromTimestamp(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ============================================================================
// Main ProgramDetail Screen
// ============================================================================

export default function ProgramDetailScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const programId = typeof params.id === "string" ? parseInt(params.id, 10) : null;
  const layout = useWindowDimensions();

  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [routes] = useState([
    { key: "upcoming", title: "Upcoming" },
    { key: "calendar", title: "Calendar" },
  ]);

  const loadData = useCallback(async () => {
    if (!programId) return;
    setLoading(true);
    const p = await getProgramById(programId);
    setProgram(p);
    setLoading(false);
  }, [programId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleToggleActive = useCallback(async () => {
    if (!program) return;
    if (program.isActive) {
      await deactivateProgram(program.id);
    } else {
      await activateProgram(program.id);
      await generatePlannedWorkoutsWindow(program.id);
    }
    await loadData();
  }, [program, loadData]);

  const handleDelete = useCallback(async () => {
    if (!program) return;
    setDeleteConfirmVisible(false);
    await deleteProgram(program.id);
    router.back();
  }, [program]);

  const renderScene = useCallback(
    ({ route }: { route: { key: string } }) => {
      if (!program) return null;
      switch (route.key) {
        case "upcoming":
          return <UpcomingTab program={program} rawColors={rawColors} />;
        case "calendar":
          return <CalendarTab program={program} rawColors={rawColors} />;
        default:
          return null;
      }
    },
    [program, rawColors]
  );

  if (loading || !program) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Stack.Screen
          options={{
            title: "Program",
            headerStyle: { backgroundColor: rawColors.surface },
            headerTitleStyle: { color: rawColors.foreground },
          }}
        />
        <ActivityIndicator color={rawColors.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: program.name,
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
          headerRight: () => (
            <View className="flex-row items-center">
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/programs/builder",
                    params: { programId: String(program.id) },
                  })
                }
                style={{ paddingHorizontal: 8, paddingVertical: 6 }}
              >
                <MaterialCommunityIcons name="pencil-outline" size={22} color={rawColors.primary} />
              </Pressable>
              <Pressable
                onPress={handleToggleActive}
                style={{ paddingHorizontal: 8, paddingVertical: 6 }}
              >
                <MaterialCommunityIcons
                  name={program.isActive ? "star" : "star-outline"}
                  size={24}
                  color={program.isActive ? rawColors.warning : rawColors.foregroundSecondary}
                />
              </Pressable>
              <Pressable
                onPress={() => setDeleteConfirmVisible(true)}
                style={{ paddingHorizontal: 8, paddingVertical: 6 }}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={22} color={rawColors.destructive} />
              </Pressable>
            </View>
          ),
        }}
      />

      <TabView
        navigationState={{ index: tabIndex, routes }}
        renderScene={renderScene}
        onIndexChange={setTabIndex}
        initialLayout={{ width: layout.width }}
        renderTabBar={(props) => (
          <TabBar
            {...props}
            indicatorStyle={{ backgroundColor: rawColors.primary }}
            style={{ backgroundColor: rawColors.background }}
            activeColor={rawColors.primary}
            inactiveColor={rawColors.foregroundSecondary}
            pressColor={rawColors.pressed}
          />
        )}
      />

      <BaseModal
        visible={deleteConfirmVisible}
        onClose={() => setDeleteConfirmVisible(false)}
        maxWidth={380}
      >
        <Text className="text-xl font-bold mb-2 text-foreground">Delete program?</Text>
        <Text className="text-base mb-4 text-foreground-secondary">
          This will permanently delete this program and all its day templates, exercises, and
          planned workouts. This cannot be undone.
        </Text>
        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
            onPress={() => setDeleteConfirmVisible(false)}
          >
            <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center p-3.5 rounded-lg gap-1.5 bg-destructive"
            onPress={handleDelete}
          >
            <MaterialCommunityIcons name="delete" size={20} color={rawColors.surface} />
            <Text className="text-base font-semibold text-primary-foreground">Delete</Text>
          </Pressable>
        </View>
      </BaseModal>
    </View>
  );
}
