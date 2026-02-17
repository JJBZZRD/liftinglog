import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
  listPrograms,
  getActiveProgram,
  type Program,
} from "../../lib/db/programs";
import {
  getNextPlannedWorkout,
  generatePlannedWorkoutsWindow,
  type PlannedWorkout,
} from "../../lib/db/plannedWorkouts";
import { getProgramDayById } from "../../lib/db/programDays";
import { listProgramExercises } from "../../lib/db/programExercises";
import { getExerciseById } from "../../lib/db/exercises";

export default function ProgramsScreen() {
  const { rawColors } = useTheme();
  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [activeProgram, setActiveProgram] = useState<Program | null>(null);
  const [nextPlanned, setNextPlanned] = useState<PlannedWorkout | null>(null);
  const [nextPlannedDayNote, setNextPlannedDayNote] = useState<string | null>(null);
  const [nextExerciseNames, setNextExerciseNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [programs, active] = await Promise.all([
        listPrograms(),
        getActiveProgram(),
      ]);
      setAllPrograms(programs);
      setActiveProgram(active);

      if (active) {
        await generatePlannedWorkoutsWindow(active.id);
        const next = await getNextPlannedWorkout(active.id);
        setNextPlanned(next);
        if (next) {
          const day = await getProgramDayById(next.programDayId);
          setNextPlannedDayNote(day?.note ?? null);

          // Load exercise names for the card
          if (day) {
            const pes = await listProgramExercises(day.id);
            const names: string[] = [];
            for (const pe of pes) {
              const ex = await getExerciseById(pe.exerciseId);
              if (ex) names.push(ex.name);
            }
            setNextExerciseNames(names);
          } else {
            setNextExerciseNames([]);
          }
        } else {
          setNextPlannedDayNote(null);
          setNextExerciseNames([]);
        }
      } else {
        setNextPlanned(null);
        setNextPlannedDayNote(null);
        setNextExerciseNames([]);
      }
    } catch (error) {
      console.error("Error loading programs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const handleCreateProgram = () => {
    router.push("/programs/builder");
  };

  const handleBrowseTemplates = () => {
    router.push("/programs/templates");
  };

  const handleProgramPress = (program: Program) => {
    router.push({ pathname: "/programs/[id]", params: { id: String(program.id) } });
  };

  const handleStartPlannedDay = () => {
    if (activeProgram) {
      router.push({
        pathname: "/programs/[id]",
        params: { id: String(activeProgram.id) },
      });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {/* Header */}
        <View className="pt-3 mb-6">
          <Text className="text-[32px] leading-[38px] font-bold text-foreground">Programs</Text>
          <Text className="text-base mt-1 text-foreground-secondary">
            Plan and track your training
          </Text>
        </View>

        {/* Next Planned Day Card */}
        {activeProgram && nextPlanned && (
          <Pressable
            onPress={handleStartPlannedDay}
            className="rounded-2xl p-5 mb-4"
            style={{
              backgroundColor: rawColors.primary + "12",
              borderWidth: 1.5,
              borderColor: rawColors.primary + "40",
              shadowColor: rawColors.shadow,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.12,
              shadowRadius: 10,
              elevation: 5,
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <MaterialCommunityIcons name="calendar-today" size={20} color={rawColors.primary} />
                <Text className="text-sm font-bold ml-2 text-primary">NEXT WORKOUT</Text>
              </View>
              <View className="px-3 py-1 rounded-full" style={{ backgroundColor: rawColors.primary }}>
                <Text className="text-xs font-bold" style={{ color: rawColors.primaryForeground }}>
                  {formatDate(nextPlanned.plannedFor)}
                </Text>
              </View>
            </View>
            <Text className="text-lg font-bold text-foreground mb-1">
              {activeProgram.name}
            </Text>
            {nextExerciseNames.length > 0 && (
              <Text className="text-sm text-foreground-secondary mb-3" numberOfLines={2}>
                {nextExerciseNames.join("  ·  ")}
              </Text>
            )}
            <View className="flex-row items-center justify-center py-3.5 rounded-xl bg-primary">
              <MaterialCommunityIcons name="play" size={22} color={rawColors.primaryForeground} />
              <Text className="text-base font-bold ml-2 text-primary-foreground">
                View Workout
              </Text>
            </View>
          </Pressable>
        )}

        {/* CTA Buttons */}
        <View className="flex-row gap-3 mb-6">
          <Pressable
            onPress={handleCreateProgram}
            className="flex-1 flex-row items-center justify-center py-4 rounded-xl bg-primary"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <MaterialCommunityIcons name="plus" size={20} color={rawColors.primaryForeground} />
            <Text className="text-base font-semibold ml-2 text-primary-foreground">
              Create Program
            </Text>
          </Pressable>
          <Pressable
            onPress={handleBrowseTemplates}
            className="flex-1 flex-row items-center justify-center py-4 rounded-xl border border-border bg-surface"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <MaterialCommunityIcons name="book-open-variant" size={20} color={rawColors.primary} />
            <Text className="text-base font-semibold ml-2 text-primary">
              Templates
            </Text>
          </Pressable>
        </View>

        {/* Programs List */}
        <View className="mb-4">
          <Text className="text-lg font-semibold mb-3 text-foreground">Your Programs</Text>
          {allPrograms.length === 0 ? (
            <View className="items-center py-10">
              <MaterialCommunityIcons name="book-outline" size={64} color={rawColors.foregroundMuted} />
              <Text className="text-lg font-semibold mt-4 text-foreground-muted">
                No programs yet
              </Text>
              <Text className="text-sm mt-2 text-center max-w-[280px] text-foreground-muted">
                Create a custom program or import a template to get started
              </Text>
            </View>
          ) : (
            allPrograms.map((program) => (
              <Pressable
                key={program.id}
                onPress={() => handleProgramPress(program)}
                className="rounded-2xl p-4 mb-3 bg-surface"
                style={{
                  shadowColor: rawColors.shadow,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <View className="flex-row items-center">
                      <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                        {program.name}
                      </Text>
                      {program.isActive && (
                        <View className="ml-2 px-2 py-0.5 rounded-full bg-primary">
                          <Text className="text-[10px] font-bold uppercase text-primary-foreground">
                            Active
                          </Text>
                        </View>
                      )}
                    </View>
                    {program.description && (
                      <Text className="text-sm mt-1 text-foreground-secondary" numberOfLines={2}>
                        {program.description}
                      </Text>
                    )}
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={rawColors.foregroundSecondary}
                  />
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
