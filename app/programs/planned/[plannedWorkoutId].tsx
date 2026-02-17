import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import DatePickerModal from "../../../components/modals/DatePickerModal";
import { useTheme } from "../../../lib/theme/ThemeContext";
import {
  getPlannedWorkoutById,
  applyPlannedWorkout,
  reschedulePlannedWorkout,
  skipPlannedWorkout,
  type PlannedWorkout,
  type AppliedExercise,
} from "../../../lib/db/plannedWorkouts";
import { getProgramDayById, type ProgramDay } from "../../../lib/db/programDays";
import { listProgramExercises, type ProgramExercise } from "../../../lib/db/programExercises";
import { getProgramById } from "../../../lib/db/programs";
import { getExerciseById } from "../../../lib/db/exercises";
import { parseProgramPrescription } from "../../../lib/programs/prescription";

type ExerciseDisplayItem = {
  id: number;
  exerciseName: string;
  prescriptionSummary: string;
};

export default function PlannedDayDetailScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ plannedWorkoutId?: string }>();
  const pwId =
    typeof params.plannedWorkoutId === "string"
      ? parseInt(params.plannedWorkoutId, 10)
      : null;

  const [pw, setPw] = useState<PlannedWorkout | null>(null);
  const [dayTemplate, setDayTemplate] = useState<ProgramDay | null>(null);
  const [programName, setProgramName] = useState<string>("");
  const [exerciseItems, setExerciseItems] = useState<ExerciseDisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const loadData = useCallback(async () => {
    if (!pwId) return;
    setLoading(true);

    const planned = await getPlannedWorkoutById(pwId);
    if (!planned) {
      setLoading(false);
      return;
    }
    setPw(planned);

    const [day, program] = await Promise.all([
      getProgramDayById(planned.programDayId),
      getProgramById(planned.programId),
    ]);
    setDayTemplate(day);
    setProgramName(program?.name ?? "Program");

    if (day) {
      const pes = await listProgramExercises(day.id);
      const items: ExerciseDisplayItem[] = [];
      for (const pe of pes) {
        const ex = await getExerciseById(pe.exerciseId);
        const prescription = parseProgramPrescription(pe.prescriptionJson);

        let summary = "No prescription";
        if (prescription) {
          const workBlocks = prescription.blocks.filter((b) => b.kind === "work");
          if (workBlocks.length > 0) {
            const wb = workBlocks[0];
            if (wb.kind === "work") {
              const repsStr =
                wb.reps.type === "fixed" ? `${wb.reps.value}` : `${wb.reps.min}-${wb.reps.max}`;
              summary = `${wb.sets}x${repsStr}`;
              if (wb.target) {
                if (wb.target.type === "rpe") summary += ` @RPE ${wb.target.value}`;
                else if (wb.target.type === "rir") summary += ` RIR ${wb.target.value}`;
                else if (wb.target.type === "percent_e1rm") summary += ` @${wb.target.value}%`;
                else if (wb.target.type === "fixed_weight_kg") summary += ` ${wb.target.value}kg`;
              }
            }
          }
        }

        items.push({
          id: pe.id,
          exerciseName: ex?.name ?? "Unknown",
          prescriptionSummary: summary,
        });
      }
      setExerciseItems(items);
    }

    setLoading(false);
  }, [pwId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatDate = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleApply = useCallback(async () => {
    if (!pw || applying) return;
    setApplying(true);

    try {
      const applied = await applyPlannedWorkout(pw.id);
      if (applied.length > 0) {
        // Navigate to the first exercise in the Record tab
        const first = applied[0];
        router.dismiss();
        router.push({
          pathname: "/exercise/[id]",
          params: {
            id: String(first.exerciseId),
            name: first.exerciseName,
            tab: "record",
          },
        });
      } else {
        router.back();
      }
    } catch (error) {
      console.error("Error applying planned workout:", error);
      Alert.alert("Error", "Failed to apply the planned workout.");
    } finally {
      setApplying(false);
    }
  }, [pw, applying]);

  const handleReschedule = useCallback(
    async (newDate: Date) => {
      if (!pw) return;
      setShowDatePicker(false);
      const newMs = new Date(newDate);
      newMs.setHours(0, 0, 0, 0);
      await reschedulePlannedWorkout(pw.id, newMs.getTime());
      await loadData();
    },
    [pw, loadData]
  );

  const handleSkip = useCallback(async () => {
    if (!pw) return;
    Alert.alert("Skip Planned Day", "This will remove this planned day. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Skip",
        style: "destructive",
        onPress: async () => {
          await skipPlannedWorkout(pw.id);
          router.back();
        },
      },
    ]);
  }, [pw]);

  if (loading || !pw) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Stack.Screen
          options={{
            title: "Planned Day",
            presentation: "modal",
            headerStyle: { backgroundColor: rawColors.surface },
            headerTitleStyle: { color: rawColors.foreground },
          }}
        />
        {loading ? (
          <ActivityIndicator color={rawColors.primary} />
        ) : (
          <Text className="text-base text-destructive">Planned workout not found</Text>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: dayTemplate?.note ?? "Planned Day",
          presentation: "modal",
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <MaterialCommunityIcons name="close" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {/* Header Info */}
        <View
          className="rounded-2xl p-5 mb-4 bg-surface"
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <View className="flex-row items-center mb-2">
            <MaterialCommunityIcons name="calendar" size={18} color={rawColors.primary} />
            <Text className="text-sm font-medium ml-2 text-primary">
              {formatDate(pw.plannedFor)}
            </Text>
          </View>
          <Text className="text-lg font-semibold text-foreground">{programName}</Text>
          {dayTemplate?.note && (
            <Text className="text-sm text-foreground-secondary mt-1">{dayTemplate.note}</Text>
          )}
        </View>

        {/* Exercise List */}
        <Text className="text-base font-semibold mb-3 text-foreground">
          Planned Exercises ({exerciseItems.length})
        </Text>
        {exerciseItems.map((item, idx) => (
          <View
            key={item.id}
            className="flex-row items-center py-3 px-4 mb-2 rounded-xl bg-surface border border-border"
          >
            <View className="w-8 h-8 rounded-full items-center justify-center bg-primary mr-3">
              <Text className="text-sm font-bold text-primary-foreground">
                {String.fromCharCode(65 + idx)}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
                {item.exerciseName}
              </Text>
              <Text className="text-xs text-foreground-secondary mt-0.5">
                {item.prescriptionSummary}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bottom Actions */}
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
          className="flex-row items-center justify-center py-4 rounded-xl bg-primary mb-2"
          style={({ pressed }) => ({ opacity: pressed || applying ? 0.7 : 1 })}
          onPress={handleApply}
          disabled={applying}
        >
          <MaterialCommunityIcons
            name="play"
            size={22}
            color={rawColors.primaryForeground}
          />
          <Text className="text-base font-semibold ml-2 text-primary-foreground">
            {applying ? "Applying..." : "Apply to Date"}
          </Text>
        </Pressable>
        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 flex-row items-center justify-center py-3 rounded-xl bg-surface-secondary"
            onPress={() => setShowDatePicker(true)}
          >
            <MaterialCommunityIcons name="calendar-edit" size={18} color={rawColors.primary} />
            <Text className="text-sm font-semibold ml-1.5 text-primary">Reschedule</Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center py-3 rounded-xl bg-surface-secondary"
            onPress={handleSkip}
          >
            <MaterialCommunityIcons name="skip-next" size={18} color={rawColors.destructive} />
            <Text className="text-sm font-semibold ml-1.5 text-destructive">Skip</Text>
          </Pressable>
        </View>
      </View>

      <DatePickerModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        value={new Date(pw.plannedFor)}
        onChange={handleReschedule}
        minimumDate={new Date()}
        title="Reschedule To"
      />
    </View>
  );
}
