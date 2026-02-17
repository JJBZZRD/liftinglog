import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import type { DateData, MarkedDates } from "react-native-calendars/src/types";
import { useTheme } from "../../lib/theme/ThemeContext";
import { createProgram, getProgramById, activateProgram, type Program } from "../../lib/db/programs";
import { listProgramDays, createProgramDay, type ProgramDay } from "../../lib/db/programDays";
import { listProgramExercises, type ProgramExercise } from "../../lib/db/programExercises";
import { getExerciseById, type Exercise } from "../../lib/db/exercises";
import { generatePlannedWorkoutsWindow } from "../../lib/db/plannedWorkouts";

// ============================================================================
// Types
// ============================================================================

type CalendarExercise = {
  programExerciseId: number;
  exerciseId: number;
  exerciseName: string;
};

type DayInfo = {
  dayKey: string;
  programDayId: number;
  exercises: CalendarExercise[];
};

// ============================================================================
// Main Screen
// ============================================================================

export default function ProgramBuilderScreen() {
  const { rawColors, isDark } = useTheme();
  const params = useLocalSearchParams<{ programId?: string }>();

  // If we have a programId, we're editing an existing program (returning from sub-pages)
  const existingProgramId = typeof params.programId === "string" ? parseInt(params.programId, 10) : null;

  const [step, setStep] = useState<"basics" | "calendar">(existingProgramId ? "calendar" : "basics");
  const [programId, setProgramId] = useState<number | null>(existingProgramId);
  const [program, setProgram] = useState<Program | null>(null);
  const [saving, setSaving] = useState(false);

  // Basics
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Calendar state
  const [calendarMode, setCalendarMode] = useState<"grid" | "list">("grid");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dayInfoMap, setDayInfoMap] = useState<Map<string, DayInfo>>(new Map());
  const [allDaysInProgram, setAllDaysInProgram] = useState<DayInfo[]>([]);

  // Load program data when returning from sub-pages
  const loadProgramData = useCallback(async () => {
    const pid = programId ?? existingProgramId;
    if (!pid) return;

    const p = await getProgramById(pid);
    if (p) {
      setProgram(p);
      setName(p.name);
      setDescription(p.description ?? "");
    }

    const days = await listProgramDays(pid);
    const map = new Map<string, DayInfo>();
    const allDays: DayInfo[] = [];

    for (const day of days) {
      // Accept calendar-based days (note is a YYYY-MM-DD dayKey)
      if (day.note && /^\d{4}-\d{2}-\d{2}$/.test(day.note)) {
        const dayKey = day.note;
        const pes = await listProgramExercises(day.id);
        const exercises: CalendarExercise[] = [];
        for (const pe of pes) {
          const ex = await getExerciseById(pe.exerciseId);
          exercises.push({
            programExerciseId: pe.id,
            exerciseId: pe.exerciseId,
            exerciseName: ex?.name ?? "Unknown",
          });
        }
        const info: DayInfo = { dayKey, programDayId: day.id, exercises };
        // Only include in map/list if the day actually has exercises
        if (exercises.length > 0) {
          map.set(dayKey, info);
          allDays.push(info);
        }
      }
    }

    setDayInfoMap(map);
    setAllDaysInProgram(allDays.sort((a, b) => a.dayKey.localeCompare(b.dayKey)));
  }, [programId, existingProgramId]);

  useFocusEffect(
    useCallback(() => {
      if (step === "calendar") {
        loadProgramData();
      }
    }, [step, loadProgramData])
  );

  // Build calendar marked dates - use customStyles for background highlighting
  const markedDates: MarkedDates = useMemo(() => {
    const marks: MarkedDates = {};
    for (const [dk, info] of dayInfoMap) {
      // Only highlight days that have exercises
      if (info.exercises.length > 0) {
        marks[dk] = {
          customStyles: {
            container: {
              backgroundColor: rawColors.primary,
              borderRadius: 8,
            },
            text: {
              color: rawColors.primaryForeground,
              fontWeight: "bold",
            },
          },
        };
      }
    }
    return marks;
  }, [dayInfoMap, rawColors.primary, rawColors.primaryForeground]);

  // ----------------------------------------
  // Step: Basics
  // ----------------------------------------
  const handleCreateProgram = useCallback(async () => {
    if (saving) return;
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a program name.");
      return;
    }
    setSaving(true);
    try {
      const id = await createProgram({
        name: name.trim(),
        description: description.trim() || null,
      });
      setProgramId(id);
      setStep("calendar");
    } catch (error) {
      console.error("Error creating program:", error);
      Alert.alert("Error", "Failed to create program. The name may already be taken.");
    } finally {
      setSaving(false);
    }
  }, [name, description, saving]);

  const renderBasics = () => (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-lg font-semibold mb-4 text-foreground">Program Basics</Text>
      <View className="mb-4">
        <Text className="text-sm font-medium mb-2 text-foreground-secondary">Program Name</Text>
        <TextInput
          className="border border-border rounded-xl p-3.5 text-base bg-surface-secondary text-foreground"
          value={name}
          onChangeText={setName}
          placeholder="e.g. My Strength Program"
          placeholderTextColor={rawColors.foregroundMuted}
        />
      </View>
      <View className="mb-6">
        <Text className="text-sm font-medium mb-2 text-foreground-secondary">Description (optional)</Text>
        <TextInput
          className="border border-border rounded-xl p-3.5 text-base min-h-[80px] bg-surface-secondary text-foreground"
          style={{ textAlignVertical: "top" }}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the program..."
          placeholderTextColor={rawColors.foregroundMuted}
          multiline
        />
      </View>

      <Pressable
        className="flex-row items-center justify-center py-4 rounded-xl bg-primary"
        style={({ pressed }) => ({ opacity: pressed || saving ? 0.7 : 1 })}
        onPress={handleCreateProgram}
        disabled={saving}
      >
        <Text className="text-base font-semibold text-primary-foreground">
          {saving ? "Creating..." : "Next: Build Schedule"}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={rawColors.primaryForeground} />
      </Pressable>
    </ScrollView>
  );

  // ----------------------------------------
  // Step: Calendar
  // ----------------------------------------
  const handleDayPress = useCallback(
    async (dateData: DateData) => {
      const pid = programId ?? existingProgramId;
      if (!pid) return;

      const dayKey = dateData.dateString;

      // Check if a program_day already exists for this dayKey
      let dayInfo = dayInfoMap.get(dayKey);
      if (!dayInfo) {
        // Create a new program_day for this calendar date
        const dayId = await createProgramDay({
          program_id: pid,
          schedule: "weekly",
          day_of_week: null,
          interval_days: null,
          note: dayKey, // Store dayKey in note for identification
        });
        dayInfo = { dayKey, programDayId: dayId, exercises: [] };
        setDayInfoMap((prev) => new Map(prev).set(dayKey, dayInfo!));
      }

      // Navigate to day detail page
      router.push({
        pathname: "/programs/day/[dayKey]",
        params: {
          dayKey,
          programId: String(pid),
          programDayId: String(dayInfo.programDayId),
        },
      });
    },
    [programId, existingProgramId, dayInfoMap]
  );

  const handleListDayPress = useCallback(
    async (dayKey: string) => {
      const pid = programId ?? existingProgramId;
      if (!pid) return;

      let dayInfo = dayInfoMap.get(dayKey);
      if (!dayInfo) {
        // Create a new program_day for this calendar date
        const dayId = await createProgramDay({
          program_id: pid,
          schedule: "weekly",
          day_of_week: null,
          interval_days: null,
          note: dayKey,
        });
        dayInfo = { dayKey, programDayId: dayId, exercises: [] };
        setDayInfoMap((prev) => new Map(prev).set(dayKey, dayInfo!));
      }

      router.push({
        pathname: "/programs/day/[dayKey]",
        params: {
          dayKey,
          programId: String(pid),
          programDayId: String(dayInfo.programDayId),
        },
      });
    },
    [programId, existingProgramId, dayInfoMap]
  );

  const handleActivateAndFinish = useCallback(async () => {
    const pid = programId ?? existingProgramId;
    if (!pid) return;
    await activateProgram(pid);
    await generatePlannedWorkoutsWindow(pid);
    router.dismiss();
  }, [programId, existingProgramId]);

  const formatDayKey = (dk: string) => {
    const d = new Date(dk + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

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

  // Build list of upcoming 8 weeks for list mode — show ALL days
  const listDays = useMemo(() => {
    const days: { dayKey: string; info: DayInfo | null; hasExercises: boolean }[] = [];
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

  const renderCalendar = () => (
    <View className="flex-1">
      {/* Mode toggle */}
      <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
        <Text className="text-sm text-foreground-secondary">
          Tap a day to add exercises
        </Text>
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
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          <Calendar
            theme={calendarTheme}
            markingType="custom"
            markedDates={markedDates}
            onDayPress={handleDayPress}
            onMonthChange={(m) => setCurrentMonth(`${m.year}-${String(m.month).padStart(2, "0")}`)}
            enableSwipeMonths
          />

          {/* Days with exercises below calendar */}
          {allDaysInProgram.length > 0 && (
            <View className="px-4 mt-4">
              <Text className="text-base font-semibold mb-3 text-foreground">
                Scheduled Days ({allDaysInProgram.length})
              </Text>
              {allDaysInProgram.map((info) => (
                <Pressable
                  key={info.dayKey}
                  onPress={() => handleListDayPress(info.dayKey)}
                  className="rounded-xl p-4 mb-2 bg-surface border border-border"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-[15px] font-semibold text-foreground">
                        {formatDayKey(info.dayKey)}
                      </Text>
                      <Text className="text-xs text-foreground-secondary mt-1">
                        {info.exercises.length === 0
                          ? "No exercises"
                          : info.exercises.map((e) => e.exerciseName).join(", ")}
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={20}
                      color={rawColors.foregroundSecondary}
                    />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={listDays}
          keyExtractor={(item) => item.dayKey}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          renderItem={({ item }) => {
            const active = item.hasExercises;
            return (
              <Pressable
                onPress={() => handleListDayPress(item.dayKey)}
                style={[
                  {
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 6,
                    borderWidth: 1,
                    borderColor: active ? rawColors.primary : rawColors.border,
                    backgroundColor: active ? rawColors.primary + "18" : rawColors.surface,
                    opacity: active ? 1 : 0.5,
                  },
                ]}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      {active && (
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: rawColors.primary,
                            marginRight: 8,
                          }}
                        />
                      )}
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: active ? "700" : "500",
                          color: active ? rawColors.foreground : rawColors.foregroundMuted,
                        }}
                      >
                        {formatDayKey(item.dayKey)}
                      </Text>
                    </View>
                    {active && item.info ? (
                      <Text
                        className="text-xs mt-1"
                        style={{ color: rawColors.foregroundSecondary, marginLeft: active ? 16 : 0 }}
                        numberOfLines={2}
                      >
                        {item.info.exercises.map((e) => e.exerciseName).join(", ")}
                      </Text>
                    ) : (
                      <Text
                        className="text-xs mt-1"
                        style={{ color: rawColors.foregroundMuted }}
                      >
                        Tap to add exercises
                      </Text>
                    )}
                  </View>
                  <MaterialCommunityIcons
                    name={active ? "chevron-right" : "plus-circle-outline"}
                    size={20}
                    color={active ? rawColors.primary : rawColors.foregroundMuted}
                  />
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Bottom: Activate & Finish button */}
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
          onPress={handleActivateAndFinish}
        >
          <MaterialCommunityIcons name="check" size={20} color={rawColors.primaryForeground} />
          <Text className="text-base font-semibold ml-2 text-primary-foreground">
            Activate & Finish
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: step === "basics" ? "New Program" : (program?.name ?? "Program Schedule"),
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
        }}
      />
      {step === "basics" && renderBasics()}
      {step === "calendar" && renderCalendar()}
    </View>
  );
}
