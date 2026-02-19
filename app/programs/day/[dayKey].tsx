import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import BaseModal from "../../../components/modals/BaseModal";
import { useUnitPreference } from "../../../lib/contexts/UnitPreferenceContext";
import { useTheme } from "../../../lib/theme/ThemeContext";
import {
  listProgramExercises,
  createProgramExercise,
  deleteProgramExercise,
  type ProgramExercise,
} from "../../../lib/db/programExercises";
import {
  listProgramDays,
  createProgramDay,
  getProgramDayById,
  deleteProgramDay,
} from "../../../lib/db/programDays";
import { listExercises, type Exercise } from "../../../lib/db/exercises";
import { getExerciseById } from "../../../lib/db/exercises";
import { parseProgramPrescription } from "../../../lib/programs/prescription";
import { formatWeightFromKg } from "../../../lib/utils/units";

type ExerciseDisplayItem = {
  programExercise: ProgramExercise;
  exercise: Exercise;
  prescriptionSummary: string;
};

export default function ProgramDayDetailScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const params = useLocalSearchParams<{
    dayKey?: string;
    programId?: string;
    programDayId?: string;
  }>();
  const dayKey = typeof params.dayKey === "string" ? params.dayKey : "";
  const programId = typeof params.programId === "string" ? parseInt(params.programId, 10) : null;
  const initialProgramDayId =
    typeof params.programDayId === "string" ? parseInt(params.programDayId, 10) : null;

  const [exercises, setExercises] = useState<ExerciseDisplayItem[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentProgramDayId, setCurrentProgramDayId] = useState<number | null>(initialProgramDayId);

  // Mass-remove modal state
  const [removeModalVisible, setRemoveModalVisible] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ExerciseDisplayItem | null>(null);

  useEffect(() => {
    setCurrentProgramDayId(initialProgramDayId);
  }, [initialProgramDayId]);

  const loadExercises = useCallback(async () => {
    if (!currentProgramDayId) {
      setExercises([]);
      return;
    }
    const pes = await listProgramExercises(currentProgramDayId);
    const items: ExerciseDisplayItem[] = [];
    for (const pe of pes) {
      const ex = await getExerciseById(pe.exerciseId);
      if (!ex) continue;
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
              let weightStr = "";
              if (wb.target?.type === "fixed_weight_kg") {
                weightStr = ` @ ${formatWeightFromKg(wb.target.value, unitPreference)}`;
              }
              parts.push(`${wb.sets}x${repsStr}${weightStr}`);
            }
          }
          summary = parts.join(" + ");
        }
      }
      items.push({ programExercise: pe, exercise: ex, prescriptionSummary: summary });
    }
    setExercises(items);
  }, [currentProgramDayId, unitPreference]);

  const ensureProgramDayId = useCallback(async (): Promise<number | null> => {
    if (!programId || !dayKey) return null;

    if (currentProgramDayId) {
      const existing = await getProgramDayById(currentProgramDayId);
      if (existing) return existing.id;
    }

    const days = await listProgramDays(programId);
    const existingByDayKey = days.find((d) => d.note === dayKey);
    if (existingByDayKey) {
      setCurrentProgramDayId(existingByDayKey.id);
      return existingByDayKey.id;
    }

    const newDayId = await createProgramDay({
      program_id: programId,
      schedule: "weekly",
      day_of_week: null,
      interval_days: null,
      note: dayKey,
    });
    setCurrentProgramDayId(newDayId);
    return newDayId;
  }, [programId, dayKey, currentProgramDayId]);

  useFocusEffect(
    useCallback(() => {
      loadExercises();
    }, [loadExercises])
  );

  const openPicker = useCallback(async () => {
    const exs = await listExercises();
    setAllExercises(exs);
    setSearchQuery("");
    setPickerVisible(true);
  }, []);

  const handleAddExercise = useCallback(
    async (exercise: Exercise) => {
      if (!programId) return;
      setPickerVisible(false);

      try {
        const resolvedProgramDayId = await ensureProgramDayId();
        if (!resolvedProgramDayId) {
          Alert.alert("Error", "Unable to find or create this program day.");
          return;
        }

        const orderIndex = exercises.length;
        await createProgramExercise({
          program_day_id: resolvedProgramDayId,
          exercise_id: exercise.id,
          order_index: orderIndex,
          prescription_json: null,
        });
        await loadExercises();
      } catch (error) {
        console.error("Error adding exercise to program day:", error);
        Alert.alert("Error", "Failed to add exercise. Please try again.");
      }
    },
    [programId, exercises.length, loadExercises, ensureProgramDayId]
  );

  const openRemoveModal = useCallback((item: ExerciseDisplayItem) => {
    setRemoveTarget(item);
    setRemoveModalVisible(true);
  }, []);

  // Remove from this day only
  const handleRemoveThisDay = useCallback(async () => {
    if (!removeTarget) return;
    setRemoveModalVisible(false);
    await deleteProgramExercise(removeTarget.programExercise.id);
    setRemoveTarget(null);
    await loadExercises();
  }, [removeTarget, loadExercises]);

  // Remove from this day and all future days
  const handleRemoveFromHereOnwards = useCallback(async () => {
    if (!removeTarget || !programId) return;
    setRemoveModalVisible(false);
    const exerciseId = removeTarget.exercise.id;

    const allDays = await listProgramDays(programId);
    for (const day of allDays) {
      // Only process calendar-based days (note is a YYYY-MM-DD dayKey)
      if (!day.note || !/^\d{4}-\d{2}-\d{2}$/.test(day.note)) continue;
      // Only from this day onwards
      if (day.note < dayKey) continue;

      const pes = await listProgramExercises(day.id);
      for (const pe of pes) {
        if (pe.exerciseId === exerciseId) {
          await deleteProgramExercise(pe.id);
        }
      }
      // If day is now empty, clean it up
      const remaining = await listProgramExercises(day.id);
      if (remaining.length === 0) {
        await deleteProgramDay(day.id);
      }
    }

    setRemoveTarget(null);
    await loadExercises();
  }, [removeTarget, programId, dayKey, loadExercises]);

  // Remove from all days in the program
  const handleRemoveFromAllDays = useCallback(async () => {
    if (!removeTarget || !programId) return;
    setRemoveModalVisible(false);
    const exerciseId = removeTarget.exercise.id;

    const allDays = await listProgramDays(programId);
    for (const day of allDays) {
      if (!day.note || !/^\d{4}-\d{2}-\d{2}$/.test(day.note)) continue;

      const pes = await listProgramExercises(day.id);
      for (const pe of pes) {
        if (pe.exerciseId === exerciseId) {
          await deleteProgramExercise(pe.id);
        }
      }
      // If day is now empty, clean it up
      const remaining = await listProgramExercises(day.id);
      if (remaining.length === 0) {
        await deleteProgramDay(day.id);
      }
    }

    setRemoveTarget(null);
    await loadExercises();
  }, [removeTarget, programId, loadExercises]);

  const handleExercisePress = useCallback(
    (item: ExerciseDisplayItem) => {
      if (!programId) return;
      router.push({
        pathname: "/programs/exercise-config",
        params: {
          programExerciseId: String(item.programExercise.id),
          exerciseId: String(item.exercise.id),
          exerciseName: item.exercise.name,
          programId: String(programId),
          dayKey,
        },
      });
    },
    [programId, dayKey]
  );

  const formatDayKey = (dk: string) => {
    const d = new Date(dk + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const filteredExercises = allExercises.filter((e) =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: formatDayKey(dayKey),
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground, fontSize: 16 },
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      <FlatList
        data={exercises}
        keyExtractor={(item) => String(item.programExercise.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListHeaderComponent={
          <View className="mb-4">
            <Text className="text-sm text-foreground-secondary mb-1">
              Tap an exercise to configure sets, reps, weight & progression.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => handleExercisePress(item)}
            className="rounded-2xl p-4 mb-3 bg-surface"
            style={{
              shadowColor: rawColors.shadow,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <View className="flex-row items-center">
              <View className="w-9 h-9 rounded-full items-center justify-center bg-primary mr-3">
                <Text className="text-sm font-bold text-primary-foreground">
                  {String.fromCharCode(65 + index)}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
                  {item.exercise.name}
                </Text>
                <Text className="text-xs text-foreground-secondary mt-0.5">
                  {item.prescriptionSummary}
                </Text>
              </View>
              <Pressable
                onPress={() => openRemoveModal(item)}
                hitSlop={12}
                className="p-1 ml-2"
              >
                <MaterialCommunityIcons
                  name="close-circle-outline"
                  size={20}
                  color={rawColors.destructive}
                />
              </Pressable>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={rawColors.foregroundSecondary}
                style={{ marginLeft: 4 }}
              />
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="items-center py-12">
            <MaterialCommunityIcons name="dumbbell" size={56} color={rawColors.foregroundMuted} />
            <Text className="text-base font-medium mt-4 text-foreground-muted">
              No exercises for this day
            </Text>
            <Text className="text-sm mt-1 text-center text-foreground-muted">
              Tap the button below to add exercises
            </Text>
          </View>
        }
      />

      {/* Add Exercise FAB */}
      <View
        className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-border bg-background"
        style={{
          shadowColor: rawColors.shadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 8,
        }}
      >
        <Pressable
          className="flex-row items-center justify-center py-4 rounded-xl bg-primary"
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          onPress={openPicker}
        >
          <MaterialCommunityIcons name="plus" size={20} color={rawColors.primaryForeground} />
          <Text className="text-base font-semibold ml-2 text-primary-foreground">Add Exercise</Text>
        </Pressable>
      </View>

      {/* Exercise Picker Modal */}
      <BaseModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        maxWidth={420}
        contentStyle={{ padding: 0, maxHeight: "70%" }}
      >
        <View className="p-4 border-b border-border">
          <Text className="text-lg font-bold text-foreground mb-3">Add Exercise</Text>
          <TextInput
            className="border border-border rounded-lg p-3 text-base bg-surface-secondary text-foreground"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search exercises..."
            placeholderTextColor={rawColors.foregroundMuted}
            autoFocus
          />
        </View>
        <FlatList
          data={filteredExercises}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleAddExercise(item)}
              className="px-4 py-3 border-b border-border"
            >
              <Text className="text-base text-foreground">{item.name}</Text>
              {item.muscleGroup && (
                <Text className="text-xs text-foreground-secondary mt-0.5">{item.muscleGroup}</Text>
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            <View className="items-center py-8">
              <Text className="text-sm text-foreground-muted">No exercises found</Text>
            </View>
          }
        />
      </BaseModal>

      {/* Remove Exercise Modal */}
      <BaseModal
        visible={removeModalVisible}
        onClose={() => {
          setRemoveModalVisible(false);
          setRemoveTarget(null);
        }}
        maxWidth={380}
      >
        <Text className="text-xl font-bold mb-2 text-foreground">Remove Exercise</Text>
        {removeTarget && (
          <Text className="text-sm mb-4 text-foreground-secondary">
            How would you like to remove{" "}
            <Text className="font-semibold text-foreground">{removeTarget.exercise.name}</Text>?
          </Text>
        )}

        <Pressable
          className="flex-row items-center p-4 rounded-xl mb-2 bg-surface-secondary"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          onPress={handleRemoveThisDay}
        >
          <MaterialCommunityIcons name="calendar-remove" size={22} color={rawColors.foreground} />
          <View className="ml-3 flex-1">
            <Text className="text-[15px] font-semibold text-foreground">This day only</Text>
            <Text className="text-xs text-foreground-secondary mt-0.5">
              Remove from {formatDayKey(dayKey)} only
            </Text>
          </View>
        </Pressable>

        <Pressable
          className="flex-row items-center p-4 rounded-xl mb-2 bg-surface-secondary"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          onPress={handleRemoveFromHereOnwards}
        >
          <MaterialCommunityIcons name="calendar-arrow-right" size={22} color={rawColors.warning} />
          <View className="ml-3 flex-1">
            <Text className="text-[15px] font-semibold text-foreground">From this day onwards</Text>
            <Text className="text-xs text-foreground-secondary mt-0.5">
              Remove from this date and all future dates
            </Text>
          </View>
        </Pressable>

        <Pressable
          className="flex-row items-center p-4 rounded-xl mb-3 bg-surface-secondary"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          onPress={handleRemoveFromAllDays}
        >
          <MaterialCommunityIcons name="calendar-remove-outline" size={22} color={rawColors.destructive} />
          <View className="ml-3 flex-1">
            <Text className="text-[15px] font-semibold text-foreground">All days</Text>
            <Text className="text-xs text-foreground-secondary mt-0.5">
              Remove from every day in this program
            </Text>
          </View>
        </Pressable>

        <Pressable
          className="items-center p-3 rounded-xl bg-surface-secondary"
          onPress={() => {
            setRemoveModalVisible(false);
            setRemoveTarget(null);
          }}
        >
          <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
        </Pressable>
      </BaseModal>
    </View>
  );
}
