import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Calendar, type DateData } from "react-native-calendars";
import BaseModal from "../../components/modals/BaseModal";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
  getCalendarSessionsForDate,
  getProgrammedDatesInRange,
  getNextProgrammedDate,
  getAllExercisesForDate,
  markSessionComplete,
  undoSessionComplete,
  markMissedSessions,
  type ProgramCalendarRow,
  type CalendarExerciseWithSets,
} from "../../lib/db/programCalendar";
import { getDateIsoToday, formatDateForDisplay } from "../../lib/programs/psl/pslService";
import { refreshUpcomingCalendarForPrograms } from "../../lib/programs/psl/programRuntime";
import { formatIntensity } from "../../lib/programs/psl/pslMapper";

function getAlphabetLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

interface FlatExerciseItem {
  calendarExerciseId: number;
  exerciseId: number | null;
  exerciseName: string;
  globalIndex: number;
  sessionId: number;
  status: string;
  setsSummary: string;
}

export default function ProgramsScreen() {
  const { rawColors, isDark, colorTheme } = useTheme();
  const { unitPreference } = useUnitPreference();

  const [selectedDate, setSelectedDate] = useState(getDateIsoToday());
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({});
  const [sessions, setSessions] = useState<(ProgramCalendarRow & { programName: string })[]>([]);
  const [exercises, setExercises] = useState<FlatExerciseItem[]>([]);
  const [programNames, setProgramNames] = useState<string[]>([]);
  const [sessionActionModalVisible, setSessionActionModalVisible] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(getDateIsoToday().slice(0, 7));

  // Animated calendar collapse state
  const calendarExpanded = useSharedValue(1);
  const [isExpanded, setIsExpanded] = useState(true);

  const CALENDAR_FULL_HEIGHT = 340;
  const CALENDAR_BAR_HEIGHT = 44;

  const calendarAnimatedStyle = useAnimatedStyle(() => ({
    height: withTiming(
      calendarExpanded.value === 1 ? CALENDAR_FULL_HEIGHT : CALENDAR_BAR_HEIGHT,
      { duration: 300 }
    ),
    overflow: "hidden" as const,
  }));

  const calendarContentOpacity = useAnimatedStyle(() => ({
    opacity: withTiming(calendarExpanded.value === 1 ? 1 : 0, { duration: 200 }),
  }));

  const barOpacity = useAnimatedStyle(() => ({
    opacity: withTiming(calendarExpanded.value === 0 ? 1 : 0, { duration: 200 }),
  }));

  // Animated Complete Session button slide-in
  const completeButtonTranslateY = useSharedValue(200);
  const completeButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: completeButtonTranslateY.value }],
  }));

  const toggleCalendar = useCallback(() => {
    const next = isExpanded ? 0 : 1;
    calendarExpanded.value = next;
    setIsExpanded(!isExpanded);
  }, [isExpanded, calendarExpanded]);

  const lastScrollY = useSharedValue(0);

  const handleScroll = useCallback(
    (event: any) => {
      const y = event.nativeEvent.contentOffset.y;
      const prevY = lastScrollY.value;
      lastScrollY.value = y;

      const scrollingUp = y > prevY;

      if (scrollingUp && y > 10 && isExpanded) {
        calendarExpanded.value = 0;
        runOnJS(setIsExpanded)(false);
      } else if (y <= 0 && !isExpanded) {
        calendarExpanded.value = 1;
        runOnJS(setIsExpanded)(true);
      }
    },
    [isExpanded, calendarExpanded, lastScrollY]
  );

  const touchStartY = useRef(0);
  const touchHandled = useRef(false);

  const onListTouchStart = useCallback((e: any) => {
    touchStartY.current = e.nativeEvent.pageY;
    touchHandled.current = false;
  }, []);

  const onListTouchMove = useCallback(
    (e: any) => {
      if (touchHandled.current) return;
      const delta = touchStartY.current - e.nativeEvent.pageY;
      if (delta > 30 && isExpanded) {
        touchHandled.current = true;
        calendarExpanded.value = 0;
        setIsExpanded(false);
      } else if (delta < -30 && !isExpanded && lastScrollY.value <= 0) {
        touchHandled.current = true;
        calendarExpanded.value = 1;
        setIsExpanded(true);
      }
    },
    [isExpanded, calendarExpanded, lastScrollY]
  );

  // Load marked dates for the visible month
  const loadMarkedDates = useCallback(async (monthStr: string) => {
    const year = parseInt(monthStr.split("-")[0]);
    const month = parseInt(monthStr.split("-")[1]);
    const startIso = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endIso = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const dateMap = await getProgrammedDatesInRange(startIso, endIso);
    const today = getDateIsoToday();

    const marked: Record<string, any> = {};
    dateMap.forEach((info, dateIso) => {
      const allComplete = info.statuses.every((s) => s === "complete");
      const anyPartial = info.statuses.some((s) => s === "partial" || s === "complete");
      const anyMissed = info.statuses.some((s) => s === "missed");
      const isPast = dateIso < today;

      let dotColor = rawColors.primary;
      if (allComplete) dotColor = rawColors.success;
      else if (anyMissed && isPast) dotColor = rawColors.destructive;
      else if (anyPartial) dotColor = rawColors.warning;

      marked[dateIso] = {
        marked: true,
        dotColor,
      };
    });

    return marked;
  }, [rawColors]);

  const loadDayData = useCallback(async (dateIso: string) => {
    const dayData = await getAllExercisesForDate(dateIso);
    const sessionsForDate = await getCalendarSessionsForDate(dateIso);
    setSessions(sessionsForDate);

    const names = [...new Set(sessionsForDate.map((s) => s.programName))];
    setProgramNames(names);

    const flatItems: FlatExerciseItem[] = [];
    let globalIdx = 0;
    for (const { session, exercises: exList } of dayData) {
      for (const ex of exList) {
        const setsSummary = buildSetsSummary(ex, unitPreference);
        flatItems.push({
          calendarExerciseId: ex.id,
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          globalIndex: globalIdx,
          sessionId: session.id,
          status: ex.status,
          setsSummary,
        });
        globalIdx++;
      }
    }
    setExercises(flatItems);
  }, [unitPreference]);

  const loadData = useCallback(async () => {
    try {
      await markMissedSessions(getDateIsoToday());
      const marked = await loadMarkedDates(currentMonth);
      setMarkedDates(marked);
      await loadDayData(selectedDate);
    } catch (error) {
      console.error("Error loading program data:", error);
    }
  }, [currentMonth, selectedDate, loadMarkedDates, loadDayData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleDayPress = useCallback(
    async (day: DateData) => {
      setSelectedDate(day.dateString);
      await loadDayData(day.dateString);
    },
    [loadDayData]
  );

  const handleMonthChange = useCallback(
    async (month: { year: number; month: number }) => {
      const monthStr = `${month.year}-${String(month.month).padStart(2, "0")}`;
      setCurrentMonth(monthStr);
      const marked = await loadMarkedDates(monthStr);
      setMarkedDates(marked);
    },
    [loadMarkedDates]
  );

  const handlePrevDay = useCallback(async () => {
    const prev = await getNextProgrammedDate(selectedDate, "backward");
    if (prev) {
      setSelectedDate(prev);
      await loadDayData(prev);
    }
  }, [selectedDate, loadDayData]);

  const handleNextDay = useCallback(async () => {
    const next = await getNextProgrammedDate(selectedDate, "forward");
    if (next) {
      setSelectedDate(next);
      await loadDayData(next);
    }
  }, [selectedDate, loadDayData]);

  const handleExercisePress = useCallback(
    (item: FlatExerciseItem) => {
      if (item.exerciseId) {
        router.push({
          pathname: "/exercise/[id]",
          params: {
            id: String(item.exerciseId),
            name: item.exerciseName,
            dateIso: selectedDate,
            programExerciseId: String(item.calendarExerciseId),
            tab: "record",
          },
        });
        return;
      }

      router.push({
        pathname: "/programs/exercise-log/[id]",
        params: {
          id: String(item.calendarExerciseId),
          dateIso: selectedDate,
        },
      });
    },
    [selectedDate]
  );

  const allSessionsComplete =
    sessions.length > 0 && sessions.every((session) => session.status === "complete");
  const hasUndoableSessionCompletion =
    allSessionsComplete &&
    sessions.some(
      (session) => session.completionOverrideExerciseIdsJson !== null
    );

  const handleSessionAction = useCallback(async () => {
    setSessionActionModalVisible(false);
    const affectedProgramIds = [...new Set(sessions.map((session) => session.programId))];

    for (const session of sessions) {
      if (hasUndoableSessionCompletion) {
        await undoSessionComplete(session.id);
        continue;
      }

      await markSessionComplete(session.id);
    }

    await refreshUpcomingCalendarForPrograms(affectedProgramIds);
    await loadData();
  }, [hasUndoableSessionCompletion, loadData, sessions]);

  const mergedMarkedDates = useMemo(() => {
    const result = { ...markedDates };
    const today = getDateIsoToday();

    if (result[today]) {
      result[today] = { ...result[today], today: true };
    } else {
      result[today] = { today: true };
    }

    if (result[selectedDate]) {
      result[selectedDate] = {
        ...result[selectedDate],
        selected: true,
        selectedColor: rawColors.primary,
        selectedTextColor: rawColors.primaryForeground,
      };
    } else {
      result[selectedDate] = {
        selected: true,
        selectedColor: rawColors.primary,
        selectedTextColor: rawColors.primaryForeground,
      };
    }

    return result;
  }, [markedDates, selectedDate, rawColors]);

  const calendarTheme = useMemo(
    () => ({
      backgroundColor: "transparent",
      calendarBackground: "transparent",
      textSectionTitleColor: rawColors.foregroundSecondary,
      dayTextColor: rawColors.foreground,
      todayTextColor: rawColors.primary,
      monthTextColor: rawColors.foreground,
      arrowColor: rawColors.primary,
      indicatorColor: rawColors.primary,
      textDisabledColor: rawColors.foregroundMuted,
      selectedDayBackgroundColor: rawColors.primary,
      selectedDayTextColor: rawColors.primaryForeground,
      selectedDotColor: rawColors.primaryForeground,
      dotColor: rawColors.primary,
    }),
    [rawColors]
  );

  const renderExerciseItem = useCallback(
    ({ item }: { item: FlatExerciseItem }) => {
      const isComplete = item.status === "complete";
      const isPartial = item.status === "partial";

      return (
        <Pressable
          onPress={() => handleExercisePress(item)}
          style={[
            styles.exerciseCard,
            {
              backgroundColor: rawColors.surface,
              shadowColor: rawColors.shadow,
            },
          ]}
        >
          {({ pressed }) => (
            <View style={[styles.exerciseCardInner, pressed && { opacity: 0.7 }]}>
              <View
                style={[
                  styles.alphabetCircle,
                  {
                    backgroundColor: isComplete
                      ? rawColors.success
                      : isPartial
                      ? rawColors.warning
                      : rawColors.primary,
                  },
                ]}
              >
                {isComplete ? (
                  <MaterialCommunityIcons
                    name="check"
                    size={17}
                    color={rawColors.primaryForeground}
                  />
                ) : (
                  <Text style={[styles.alphabetText, { color: rawColors.primaryForeground }]}>
                    {getAlphabetLetter(item.globalIndex)}
                  </Text>
                )}
              </View>

              <View style={styles.exerciseInfo}>
                <Text
                  style={[styles.exerciseName, { color: rawColors.foreground }]}
                  numberOfLines={1}
                >
                  {item.exerciseName}
                </Text>
                {item.setsSummary ? (
                  <Text
                    style={[styles.exerciseSets, { color: rawColors.foregroundSecondary }]}
                    numberOfLines={1}
                  >
                    {item.setsSummary}
                  </Text>
                ) : null}
              </View>

              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={rawColors.foregroundSecondary}
              />
            </View>
          )}
        </Pressable>
      );
    },
    [rawColors, handleExercisePress]
  );

  const showCompleteButton = exercises.length > 0 && !isExpanded;
  useEffect(() => {
    if (showCompleteButton) {
      completeButtonTranslateY.value = withSpring(0, { damping: 20, stiffness: 180 });
    } else {
      completeButtonTranslateY.value = withTiming(200, { duration: 200 });
    }
  }, [showCompleteButton, completeButtonTranslateY]);

  return (
    <SafeAreaView style={styles.container} className="bg-background" edges={["top"]}>
      {/* Fixed page header - always visible */}
      <View style={styles.pageHeader}>
        <Text style={[styles.headerTitle, { color: rawColors.foreground }]}>
          Programs
        </Text>
        <Pressable
          onPress={() => router.push("/programs/manage")}
          style={[styles.manageButton, { backgroundColor: rawColors.primary }]}
        >
          <MaterialCommunityIcons
            name="cog-outline"
            size={18}
            color={rawColors.primaryForeground}
          />
          <Text style={[styles.manageButtonText, { color: rawColors.primaryForeground }]}>
            Manage
          </Text>
        </Pressable>
      </View>

      {/* Animated calendar section - only the calendar widget */}
      <Animated.View style={[styles.calendarContainer, calendarAnimatedStyle]}>
        {/* Collapsed bar - positioned at left like the month/year header */}
        <Animated.View
          style={[styles.collapsedBar, barOpacity]}
          pointerEvents={isExpanded ? "none" : "auto"}
        >
          <Pressable onPress={toggleCalendar} style={styles.collapsedBarInner}>
            <MaterialCommunityIcons
              name="calendar"
              size={18}
              color={rawColors.primary}
            />
            <Text style={[styles.collapsedBarText, { color: rawColors.foreground }]}>
              Calendar
            </Text>
            <MaterialCommunityIcons
              name="chevron-down"
              size={16}
              color={rawColors.foregroundSecondary}
            />
          </Pressable>
        </Animated.View>

        {/* Full calendar */}
        <Animated.View style={[styles.fullCalendar, calendarContentOpacity]}>
          <Calendar
            key={`${colorTheme}-${isDark ? "dark" : "light"}`}
            current={selectedDate}
            onDayPress={handleDayPress}
            onMonthChange={handleMonthChange}
            markedDates={mergedMarkedDates}
            markingType="dot"
            theme={calendarTheme}
            enableSwipeMonths
          />
        </Animated.View>
      </Animated.View>

      {/* Date Navigator */}
      <View style={[styles.dateNavigator, { borderBottomColor: rawColors.borderLight }]}>
        <Pressable onPress={handlePrevDay} hitSlop={12} style={styles.navArrow}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={rawColors.primary} />
        </Pressable>
        <View style={styles.dateCenter}>
          <Text style={[styles.dateText, { color: rawColors.foreground }]}>
            {formatDateForDisplay(selectedDate)}
          </Text>
          {programNames.length > 0 && (
            <Text
              style={[styles.programNamesText, { color: rawColors.foregroundSecondary }]}
              numberOfLines={1}
            >
              {programNames.join(", ")}
            </Text>
          )}
        </View>
        <Pressable onPress={handleNextDay} hitSlop={12} style={styles.navArrow}>
          <MaterialCommunityIcons name="chevron-right" size={28} color={rawColors.primary} />
        </Pressable>
      </View>

      {/* Exercise List (always rendered so swipe gestures work even when empty) */}
      <FlatList
        data={exercises}
        keyExtractor={(item) => String(item.calendarExerciseId)}
        renderItem={renderExerciseItem}
        contentContainerStyle={[
          styles.listContent,
          showCompleteButton && { paddingBottom: 170 },
          exercises.length === 0 && styles.emptyListContainer,
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        onTouchStart={onListTouchStart}
        onTouchMove={onListTouchMove}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="calendar-blank-outline"
              size={64}
              color={rawColors.foregroundMuted}
            />
            <Text style={[styles.emptyTitle, { color: rawColors.foregroundMuted }]}>
              No exercises scheduled
            </Text>
            <Text style={[styles.emptySubtitle, { color: rawColors.foregroundMuted }]}>
              Use the arrows to navigate to a day with scheduled exercises, or add a program.
            </Text>
          </View>
        }
      />

      {/* Complete Session Button (sticky footer, above floating tab bar) */}
      {exercises.length > 0 && (
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 94,
              paddingHorizontal: 16,
              paddingVertical: 16,
              backgroundColor: rawColors.background,
              borderRadius: 16,
              shadowColor: rawColors.shadow,
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.08,
              shadowRadius: 6,
              elevation: 8,
            },
            completeButtonAnimatedStyle,
          ]}
          pointerEvents={showCompleteButton ? "auto" : "none"}
        >
          {allSessionsComplete && !hasUndoableSessionCompletion ? (
            <View className="flex-row items-center justify-center py-4 rounded-xl border border-border bg-surface-secondary">
              <MaterialCommunityIcons name="check-circle" size={20} color={rawColors.success} />
              <Text className="text-base font-semibold ml-2 text-foreground-secondary">
                Session Complete
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={() => setSessionActionModalVisible(true)}
              className={`flex-row items-center justify-center py-4 rounded-xl border ${
                hasUndoableSessionCompletion
                  ? "border-border bg-surface-secondary"
                  : "border-primary bg-primary"
              }`}
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <MaterialCommunityIcons
                name={hasUndoableSessionCompletion ? "undo-variant" : "check-all"}
                size={22}
                color={
                  hasUndoableSessionCompletion
                    ? rawColors.foreground
                    : rawColors.primaryForeground
                }
              />
              <Text
                className={`text-base font-semibold ml-2 ${
                  hasUndoableSessionCompletion
                    ? "text-foreground"
                    : "text-primary-foreground"
                }`}
              >
                {hasUndoableSessionCompletion ? "Undo Complete" : "Complete Session"}
              </Text>
            </Pressable>
          )}
        </Animated.View>
      )}

      {/* Session Action Confirmation Modal */}
      <BaseModal
        visible={sessionActionModalVisible}
        onClose={() => setSessionActionModalVisible(false)}
      >
        <Text style={[styles.modalTitle, { color: rawColors.foreground }]}>
          {hasUndoableSessionCompletion ? "Undo Session Complete?" : "Complete Session?"}
        </Text>
        <Text style={[styles.modalBody, { color: rawColors.foregroundSecondary }]}>
          {hasUndoableSessionCompletion
            ? "This will restore any globally completed partial exercises to their actual logged state. Saved sets stay linked and will reopen in the program record view if they are still partial."
            : "This will mark the current session as complete. Exercises with partial program progress will be marked complete for the session view, while untouched exercises stay pending."}
        </Text>
        <View style={styles.modalButtons}>
          <Pressable
            onPress={() => setSessionActionModalVisible(false)}
            style={[styles.modalButton, { backgroundColor: rawColors.surfaceSecondary }]}
          >
            <Text style={[styles.modalButtonText, { color: rawColors.foreground }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSessionAction}
            style={[
              styles.modalButton,
              {
                backgroundColor: hasUndoableSessionCompletion
                  ? rawColors.surfaceSecondary
                  : rawColors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.modalButtonText,
                {
                  color: hasUndoableSessionCompletion
                    ? rawColors.foreground
                    : rawColors.primaryForeground,
                },
              ]}
            >
              {hasUndoableSessionCompletion ? "Undo" : "Complete"}
            </Text>
          </Pressable>
        </View>
      </BaseModal>
    </SafeAreaView>
  );
}

function buildSetsSummary(
  ex: CalendarExerciseWithSets,
  unitPreference: "kg" | "lb"
): string {
  if (ex.sets.length === 0) return "";
  const totalSets = ex.sets.filter((s) => !s.isUserAdded).length;
  const first = ex.sets[0];
  const reps = first.prescribedReps ?? "";
  let intensityStr = "";
  if (first.prescribedIntensityJson) {
    try {
      const intensity = JSON.parse(first.prescribedIntensityJson);
      intensityStr = formatIntensity(intensity, unitPreference);
    } catch {}
  }
  let s = `${totalSets}x${reps}`;
  if (intensityStr) s += ` ${intensityStr}`;
  return s;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    paddingRight: 72,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  manageButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  calendarContainer: {
    position: "relative",
  },
  collapsedBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 44,
    zIndex: 1,
  },
  collapsedBarInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    gap: 6,
  },
  collapsedBarText: {
    fontSize: 15,
    fontWeight: "600",
  },
  fullCalendar: {
    paddingHorizontal: 16,
  },
  dateNavigator: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navArrow: {
    padding: 4,
  },
  dateCenter: {
    flex: 1,
    alignItems: "center",
  },
  dateText: {
    fontSize: 17,
    fontWeight: "700",
  },
  programNamesText: {
    fontSize: 12,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 100,
  },
  exerciseCard: {
    marginBottom: 10,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  exerciseCardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  alphabetCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  alphabetText: {
    fontSize: 14,
    fontWeight: "700",
  },
  exerciseInfo: {
    flex: 1,
    marginRight: 8,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: "600",
  },
  exerciseSets: {
    fontSize: 13,
    marginTop: 2,
  },
  emptyListContainer: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
