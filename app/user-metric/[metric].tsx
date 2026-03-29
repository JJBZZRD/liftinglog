import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import DateRangeSelector, {
  getDefaultDateRange,
  type DateRange,
} from "../../components/charts/DateRangeSelector";
import UserMetricChart, { type UserMetricChartPoint } from "../../components/charts/UserMetricChart";
import SleepClockInput from "../../components/userMetrics/SleepClockInput";
import MetricBaseModal from "../../components/modals/BaseModal";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import {
  createUserCheckin,
  deleteUserCheckin,
  listAllUserCheckins,
  updateUserCheckin,
  type UserCheckin,
  type UserCheckinInput,
} from "../../lib/db/userCheckins";
import { useTheme, type RawThemeColors } from "../../lib/theme/ThemeContext";
import {
  buildUserMetricCheckinInput,
  formatUserMetricValue,
  getAverageMetricValue,
  getMetricRange,
  getUserMetricChartVariant,
  getUserMetricDefinition,
  getUserMetricEntries,
  getUserMetricNumericValue,
  parseUserMetricInputValue,
  type UserMetricAccent,
  type UserMetricEntry,
  type UserMetricKey,
} from "../../lib/userMetrics/definitions";
import {
  formatSleepClockTime,
  formatSleepDurationMinutes,
  getDefaultSleepWindow,
  getSleepDurationMinutes,
} from "../../lib/userMetrics/sleep";
import {
  formatEditableWeightFromKg,
  formatWeightFromKg,
  getWeightUnitLabel,
  parseWeightInputToKg,
} from "../../lib/utils/units";

function getAccentColors(accent: UserMetricAccent, rawColors: RawThemeColors) {
  switch (accent) {
    case "success":
      return {
        iconColor: rawColors.success,
        iconBackground: `${rawColors.success}18`,
      };
    case "warning":
      return {
        iconColor: rawColors.warning,
        iconBackground: `${rawColors.warning}18`,
      };
    case "destructive":
      return {
        iconColor: rawColors.destructive,
        iconBackground: `${rawColors.destructive}15`,
      };
    case "primary":
    default:
      return {
        iconColor: rawColors.primary,
        iconBackground: rawColors.primaryLight,
      };
  }
}

function formatRecordedAt(timestamp: number, includeTime = true) {
  const date = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const timeLabel = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  let dateLabel: string;
  if (date.toDateString() === now.toDateString()) {
    dateLabel = "Today";
  } else if (date.toDateString() === yesterday.toDateString()) {
    dateLabel = "Yesterday";
  } else if (date.getFullYear() === now.getFullYear()) {
    dateLabel = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } else {
    dateLabel = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return includeTime ? `${dateLabel} | ${timeLabel}` : dateLabel;
}

function parseMetricInputValue(
  metricKey: UserMetricKey,
  rawValue: string,
  unitPreference: "kg" | "lb"
): number | null {
  if (metricKey === "bodyweight") {
    return parseWeightInputToKg(rawValue, unitPreference);
  }

  return parseUserMetricInputValue(metricKey, rawValue);
}

function isValidMetricValue(metricKey: UserMetricKey, value: number | null): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false;
  }

  switch (metricKey) {
    case "bodyweight":
    case "waist":
    case "restingHr":
      return value > 0;
    case "sleep":
    case "steps":
      return value >= 0;
    case "readiness":
    case "soreness":
    case "stress":
      return value >= 1 && value <= 5;
    default:
      return false;
  }
}

function formatAverageValue(
  metricKey: UserMetricKey,
  value: number | null,
  unitPreference: "kg" | "lb"
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  if (metricKey === "readiness" || metricKey === "soreness" || metricKey === "stress") {
    return `${value.toFixed(1).replace(/\.0$/, "")}/5`;
  }

  return formatUserMetricValue(metricKey, value, unitPreference);
}

function formatAxisValue(metricKey: UserMetricKey, value: number, unitPreference: "kg" | "lb") {
  switch (metricKey) {
    case "bodyweight":
      return formatWeightFromKg(value, unitPreference, {
        withUnit: false,
        placeholder: "--",
        maximumFractionDigits: 0,
      });
    case "sleep":
      return `${Math.round(value)}h`;
    case "steps":
      if (value >= 1000) {
        const shortValue = (value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, "");
        return `${shortValue}k`;
      }
      return `${Math.round(value)}`;
    default:
      return `${Math.round(value)}`;
  }
}

function getChartYDomain(metricKey: UserMetricKey) {
  switch (metricKey) {
    case "readiness":
    case "soreness":
    case "stress":
      return { min: 1, max: 5 };
    default:
      return undefined;
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getStartOfLocalDay(value: number | Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getEndOfLocalDay(value: number | Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function filterEntriesByDateRange(entries: UserMetricEntry[], dateRange: DateRange) {
  const startTimestamp = dateRange.startDate ? getStartOfLocalDay(dateRange.startDate).getTime() : null;
  const endTimestamp = getEndOfLocalDay(dateRange.endDate).getTime();

  return entries.filter((entry) => {
    if (startTimestamp !== null && entry.recordedAt < startTimestamp) {
      return false;
    }
    return entry.recordedAt <= endTimestamp;
  });
}

function buildChartPoints(
  entries: UserMetricEntry[],
  chartVariant: "line" | "bar",
  dateRange: DateRange,
  yDomain?: { min: number; max: number }
): UserMetricChartPoint[] {
  const latestEntryByDay = new Map<number, UserMetricEntry>();

  for (const entry of entries) {
    const dayKey = getStartOfLocalDay(entry.recordedAt).getTime();
    const existingEntry = latestEntryByDay.get(dayKey);

    if (
      !existingEntry
      || entry.recordedAt > existingEntry.recordedAt
      || (entry.recordedAt === existingEntry.recordedAt && entry.checkinId > existingEntry.checkinId)
    ) {
      latestEntryByDay.set(dayKey, entry);
    }
  }

  const points = [...latestEntryByDay.values()]
    .sort((left, right) => left.recordedAt - right.recordedAt)
    .map((entry) => ({
      id: entry.checkinId,
      date: entry.recordedAt,
      value: entry.value,
    }));

  if (chartVariant !== "bar" || points.length === 0) {
    return points;
  }

  const startDate = dateRange.startDate
    ? getStartOfLocalDay(dateRange.startDate)
    : getStartOfLocalDay(
      Math.min(...entries.map((entry) => entry.recordedAt))
    );
  const endDate = getStartOfLocalDay(dateRange.endDate);
  const placeholderValue = yDomain ? yDomain.min + 0.001 : 0;
  const paddedPoints: UserMetricChartPoint[] = [];

  for (let dayTimestamp = startDate.getTime(); dayTimestamp <= endDate.getTime(); dayTimestamp += MS_PER_DAY) {
    const entry = latestEntryByDay.get(dayTimestamp);

    if (entry) {
      paddedPoints.push({
        id: entry.checkinId,
        date: entry.recordedAt,
        value: entry.value,
      });
      continue;
    }

    paddedPoints.push({
      id: -dayTimestamp,
      date: dayTimestamp,
      value: placeholderValue,
      isPlaceholder: true,
    });
  }

  return paddedPoints;
}

const ALL_USER_METRIC_KEYS: UserMetricKey[] = [
  "bodyweight",
  "waist",
  "sleep",
  "restingHr",
  "readiness",
  "soreness",
  "stress",
  "steps",
];

function formatEditableNumericValue(value: number, maximumFractionDigits = 2) {
  return value.toFixed(maximumFractionDigits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatEditableMetricValue(
  metricKey: UserMetricKey,
  value: number,
  unitPreference: "kg" | "lb"
) {
  switch (metricKey) {
    case "bodyweight":
      return formatEditableWeightFromKg(value, unitPreference, 1);
    case "waist":
    case "sleep":
      return formatEditableNumericValue(value, 2);
    case "restingHr":
    case "readiness":
    case "soreness":
    case "stress":
    case "steps":
    default:
      return String(Math.round(value));
  }
}

function buildSleepDraftFromEntry(entry: UserMetricEntry) {
  const durationMinutes = Math.max(0, Math.round(entry.value * 60));
  const sleepEndAt = entry.sleepEndAt ?? entry.recordedAt;
  const sleepStartAt = entry.sleepStartAt ?? (sleepEndAt - (durationMinutes * 60 * 1000));

  return {
    sleepStartAt,
    sleepEndAt,
    sleepHours: entry.value,
    durationMinutes,
  };
}

function buildMetricUpdate(metricKey: UserMetricKey, value: number): Partial<UserCheckinInput> {
  return buildUserMetricCheckinInput(metricKey, value);
}

function buildMetricClearUpdate(metricKey: UserMetricKey): Partial<UserCheckinInput> {
  switch (metricKey) {
    case "bodyweight":
      return { bodyweight_kg: null };
    case "waist":
      return { waist_cm: null };
    case "sleep":
      return {
        sleep_start_at: null,
        sleep_end_at: null,
        sleep_hours: null,
      };
    case "restingHr":
      return { resting_hr_bpm: null };
    case "readiness":
      return { readiness_score: null };
    case "soreness":
      return { soreness_score: null };
    case "stress":
      return { stress_score: null };
    case "steps":
      return { steps: null };
    default:
      return {};
  }
}

function hasOtherMetricValues(checkin: UserCheckin, activeMetricKey: UserMetricKey) {
  return ALL_USER_METRIC_KEYS.some((metricKey) => {
    if (metricKey === activeMetricKey) {
      return false;
    }

    const value = getUserMetricNumericValue(checkin, metricKey);
    return typeof value === "number" && Number.isFinite(value);
  });
}

function renderHistoryMeta(entry: UserMetricEntry) {
  const tags = [entry.context, entry.source].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  if (tags.length === 0) {
    return null;
  }

  return (
    <View className="mt-3 flex-row flex-wrap gap-2">
      {tags.map((tag) => (
        <View key={`${entry.checkinId}-${tag}`} className="rounded-full bg-surface px-2.5 py-1">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-foreground-secondary">
            {tag.replace(/_/g, " ")}
          </Text>
        </View>
      ))}
    </View>
  );
}

function renderSleepSummary(entry: UserMetricEntry | null) {
  if (!entry || entry.sleepStartAt === null || entry.sleepEndAt === null) {
    return null;
  }

  const durationMinutes = getSleepDurationMinutes(
    new Date(entry.sleepStartAt).getHours() * 60 + new Date(entry.sleepStartAt).getMinutes(),
    new Date(entry.sleepEndAt).getHours() * 60 + new Date(entry.sleepEndAt).getMinutes()
  );

  return (
    <View className="mt-4 flex-row gap-3">
      <View className="flex-1 rounded-2xl border border-border-light bg-surface px-3 py-3">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-foreground-secondary">
          Sleep Time
        </Text>
        <Text className="mt-2 text-sm font-semibold text-foreground">
          {formatSleepClockTime(entry.sleepStartAt)}
        </Text>
      </View>
      <View className="flex-1 rounded-2xl border border-border-light bg-surface px-3 py-3">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-foreground-secondary">
          Wake Time
        </Text>
        <Text className="mt-2 text-sm font-semibold text-foreground">
          {formatSleepClockTime(entry.sleepEndAt)}
        </Text>
      </View>
      <View className="flex-1 rounded-2xl border border-border-light bg-surface px-3 py-3">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-foreground-secondary">
          Sleep Duration
        </Text>
        <Text className="mt-2 text-sm font-semibold text-foreground">
          {formatSleepDurationMinutes(durationMinutes)}
        </Text>
      </View>
    </View>
  );
}

export default function UserMetricDetailScreen() {
  const params = useLocalSearchParams<{ metric?: string | string[] }>();
  const metricParam = Array.isArray(params.metric) ? params.metric[0] : params.metric;
  const metricDefinition = getUserMetricDefinition(metricParam ?? "");
  const metric = metricDefinition ?? getUserMetricDefinition("bodyweight")!;
  const isKnownMetric = metricDefinition !== null;

  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const [checkins, setCheckins] = useState<UserCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<UserMetricEntry | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [selectedPoint, setSelectedPoint] = useState<UserMetricChartPoint | null>(null);
  const [sleepDraft, setSleepDraft] = useState(() => getDefaultSleepWindow());

  const cardShadowStyle = {
    shadowColor: rawColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  } as const;

  const loadCheckins = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listAllUserCheckins();
      setCheckins(rows);
    } catch (error) {
      console.error("Error loading user metric detail:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCheckins();
    }, [loadCheckins])
  );

  useEffect(() => {
    setInputValue("");
    setSaveFeedback(null);
    setEditingEntryId(null);
  }, [metricParam]);

  const entries = getUserMetricEntries(checkins, metric.key);
  const latestEntry = entries[0] ?? null;
  const filteredEntries = filterEntriesByDateRange(entries, dateRange);
  const chartVariant = getUserMetricChartVariant(metric.key);
  const chartYDomain = getChartYDomain(metric.key);
  const chartPoints = buildChartPoints(filteredEntries, chartVariant, dateRange, chartYDomain);
  const accent = getAccentColors(metric.accent, rawColors);
  const editingEntry = editingEntryId !== null
    ? entries.find((entry) => entry.checkinId === editingEntryId) ?? null
    : null;
  const parsedValue = metric.key === "sleep"
    ? null
    : parseMetricInputValue(metric.key, inputValue, unitPreference);
  const canSave = metric.key === "sleep"
    ? sleepDraft.sleepHours > 0
    : isValidMetricValue(metric.key, parsedValue);
  const saveButtonForeground = !canSave || saving || deletingEntryId !== null
    ? rawColors.foregroundMuted
    : rawColors.surface;
  const averageValue = getAverageMetricValue(filteredEntries);
  const range = getMetricRange(filteredEntries);
  const historyEntries = filteredEntries.slice(0, 8);
  const latestSelectableChartPoint = useMemo(
    () => [...chartPoints].reverse().find((point) => !point.isPlaceholder) ?? null,
    [chartPoints]
  );

  useEffect(() => {
    if (chartPoints.length === 0 || latestSelectableChartPoint === null) {
      setSelectedPoint(null);
      return;
    }

    setSelectedPoint((currentSelection) => {
      if (
        currentSelection
        && chartPoints.some(
          (point) =>
            point.id === currentSelection.id
            && point.date === currentSelection.date
            && !point.isPlaceholder
        )
      ) {
        return currentSelection;
      }
      return latestSelectableChartPoint;
    });
  }, [chartPoints, latestSelectableChartPoint]);

  useEffect(() => {
    if (metric.key !== "sleep" || editingEntryId !== null) {
      return;
    }

    if (
      latestEntry
      && latestEntry.sleepStartAt !== null
      && latestEntry.sleepEndAt !== null
    ) {
      setSleepDraft({
        sleepStartAt: latestEntry.sleepStartAt,
        sleepEndAt: latestEntry.sleepEndAt,
        sleepHours: latestEntry.value,
        durationMinutes: Math.round(latestEntry.value * 60),
      });
      return;
    }

    setSleepDraft(getDefaultSleepWindow(latestEntry?.recordedAt ?? Date.now()));
  }, [editingEntryId, latestEntry, metric.key]);

  const selectedEntry = selectedPoint && !selectedPoint.isPlaceholder
    ? filteredEntries.find((entry) => entry.checkinId === selectedPoint.id && entry.recordedAt === selectedPoint.date) ?? null
    : null;
  const displayEntry = selectedEntry ?? filteredEntries[0] ?? null;
  const selectedValueLabel = formatUserMetricValue(metric.key, displayEntry?.value, unitPreference);
  const deleteConfirmSourceCheckin = deleteConfirmEntry
    ? checkins.find((checkin) => checkin.id === deleteConfirmEntry.checkinId) ?? null
    : null;
  const deleteConfirmKeepsOtherMetrics = deleteConfirmSourceCheckin
    ? hasOtherMetricValues(deleteConfirmSourceCheckin, metric.key)
    : false;
  const inputLabel =
    metric.key === "bodyweight"
      ? `${metric.inputLabel} (${getWeightUnitLabel(unitPreference)})`
      : metric.key === "waist"
        ? `${metric.inputLabel} (cm)`
        : metric.key === "sleep"
          ? `${metric.inputLabel} (hours)`
          : metric.key === "restingHr"
            ? `${metric.inputLabel} (bpm)`
            : metric.inputLabel;

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    setSaveFeedback(null);
  }, []);

  const handleScoreSelect = useCallback((score: number) => {
    setInputValue(String(score));
    setSaveFeedback(null);
  }, []);

  const handleStartEditing = useCallback((entry: UserMetricEntry) => {
    setEditingEntryId(entry.checkinId);
    setSaveFeedback(null);
    setSelectedPoint({
      id: entry.checkinId,
      date: entry.recordedAt,
      value: entry.value,
    });

    if (metric.key === "sleep") {
      setSleepDraft(buildSleepDraftFromEntry(entry));
      return;
    }

    setInputValue(formatEditableMetricValue(metric.key, entry.value, unitPreference));
  }, [metric.key, unitPreference]);

  const handleCancelEditing = useCallback(() => {
    setEditingEntryId(null);
    setInputValue("");
    setSaveFeedback(null);

    if (metric.key !== "sleep") {
      return;
    }

    if (latestEntry) {
      setSleepDraft(buildSleepDraftFromEntry(latestEntry));
      return;
    }

    setSleepDraft(getDefaultSleepWindow(Date.now()));
  }, [latestEntry, metric.key]);

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmEntry(null);
  }, []);

  const performDeleteEntry = useCallback(async (entry: UserMetricEntry) => {
    const sourceCheckin = checkins.find((checkin) => checkin.id === entry.checkinId);
    if (!sourceCheckin) {
      Alert.alert("Error", "Unable to find that entry.");
      return;
    }

    setDeletingEntryId(entry.checkinId);
    setSaveFeedback(null);

    try {
      if (hasOtherMetricValues(sourceCheckin, metric.key)) {
        await updateUserCheckin(entry.checkinId, buildMetricClearUpdate(metric.key));
        setSaveFeedback(`Removed ${metric.label.toLowerCase()} from that check-in.`);
      } else {
        await deleteUserCheckin(entry.checkinId);
        setSaveFeedback(`Deleted ${metric.label.toLowerCase()} entry.`);
      }

      if (editingEntryId === entry.checkinId) {
        setEditingEntryId(null);
        setInputValue("");
      }

      await loadCheckins();
    } catch (error) {
      console.error(`Error deleting ${metric.key} metric entry:`, error);
      Alert.alert("Error", `Failed to delete ${metric.label.toLowerCase()} entry. Please try again.`);
    } finally {
      setDeletingEntryId(null);
    }
  }, [checkins, editingEntryId, loadCheckins, metric.key, metric.label]);

  const handleDeleteEntry = useCallback((entry: UserMetricEntry) => {
    setDeleteConfirmEntry(entry);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirmEntry) {
      return;
    }

    closeDeleteConfirm();
    void performDeleteEntry(deleteConfirmEntry);
  }, [closeDeleteConfirm, deleteConfirmEntry, performDeleteEntry]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveFeedback(null);

    try {
      if (metric.key === "sleep" && editingEntryId !== null) {
        await updateUserCheckin(editingEntryId, {
          recorded_at: sleepDraft.sleepEndAt,
          sleep_start_at: sleepDraft.sleepStartAt,
          sleep_end_at: sleepDraft.sleepEndAt,
          sleep_hours: sleepDraft.sleepHours,
        });
        setEditingEntryId(null);
        setSaveFeedback(`Updated ${metric.label.toLowerCase()}.`);
      } else if (metric.key === "sleep") {
        await createUserCheckin({
          recorded_at: sleepDraft.sleepEndAt,
          sleep_start_at: sleepDraft.sleepStartAt,
          sleep_end_at: sleepDraft.sleepEndAt,
          sleep_hours: sleepDraft.sleepHours,
          context: "sleep_window",
          source: "manual",
        });
        setSaveFeedback("Saved sleep window.");
      } else {
        const nextValue = parseMetricInputValue(metric.key, inputValue, unitPreference);
        if (!isValidMetricValue(metric.key, nextValue)) {
          setSaving(false);
          return;
        }

        if (editingEntryId !== null) {
          await updateUserCheckin(editingEntryId, buildMetricUpdate(metric.key, nextValue));
          setEditingEntryId(null);
          setSaveFeedback(`Updated ${metric.label.toLowerCase()}.`);
        } else {
          await createUserCheckin({
            ...buildUserMetricCheckinInput(metric.key, nextValue),
            context: "manual_log",
            source: "manual",
          });
          setSaveFeedback(`Saved ${metric.label.toLowerCase()}.`);
        }
        setInputValue("");
      }

      await loadCheckins();
    } catch (error) {
      console.error(`Error saving ${metric.key} metric:`, error);
      setSaveFeedback("Unable to save right now.");
    } finally {
      setSaving(false);
    }
  }, [editingEntryId, inputValue, loadCheckins, metric.key, metric.label, sleepDraft, unitPreference]);

  if (!isKnownMetric) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen
          options={{
            title: "User Metric",
            headerStyle: { backgroundColor: rawColors.surface },
            headerTitleStyle: { color: rawColors.foreground },
            headerLeft: () => (
              <Pressable onPress={() => router.back()} style={{ paddingRight: 8 }}>
                <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
              </Pressable>
            ),
          }}
        />

        <View className="flex-1 items-center justify-center px-6">
          <View className="rounded-2xl bg-surface p-6" style={cardShadowStyle}>
            <View className="items-center">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-surface-secondary">
                <MaterialCommunityIcons name="help-circle-outline" size={28} color={rawColors.foregroundMuted} />
              </View>
              <Text className="mt-4 text-xl font-semibold text-foreground">Unknown metric</Text>
              <Text className="mt-2 text-center text-sm text-foreground-secondary">
                This metric route does not match a defined user metric.
              </Text>
              <Pressable
                className="mt-5 rounded-full px-4 py-2"
                onPress={() => router.replace("/user-metrics")}
                style={{ backgroundColor: rawColors.primaryLight }}
              >
                <Text className="text-sm font-semibold text-primary">Back to User Metrics</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: metric.label,
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ paddingRight: 8 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120, gap: 16 }}
        >
          <View className="rounded-2xl bg-surface p-5" style={cardShadowStyle}>
            <View className="flex-row items-start gap-4">
              <View
                className="h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: accent.iconBackground }}
              >
                <MaterialCommunityIcons name={metric.icon as never} size={28} color={accent.iconColor} />
              </View>
              <View className="flex-1">
                <Text className="text-2xl font-semibold text-foreground">{metric.label}</Text>
                <Text className="mt-1 text-sm text-foreground-secondary">{metric.subtitle}</Text>
              </View>
            </View>

            <View className="mt-5">
              <DateRangeSelector value={dateRange} onChange={setDateRange} />
            </View>

            <View className="mt-4 overflow-hidden rounded-2xl border border-border-light bg-surface-secondary py-2">
              <UserMetricChart
                data={chartPoints}
                variant={chartVariant}
                selectedPoint={selectedPoint}
                onSelectPoint={setSelectedPoint}
                unitLabel={
                  metric.key === "bodyweight"
                    ? getWeightUnitLabel(unitPreference)
                    : metric.key === "waist"
                      ? "cm"
                      : metric.key === "sleep"
                        ? "hours"
                        : metric.key === "restingHr"
                          ? "bpm"
                          : metric.key === "steps"
                            ? "steps"
                          : "score"
                }
                formatYAxisLabel={(value) => formatAxisValue(metric.key, value, unitPreference)}
                yDomain={chartYDomain}
              />
            </View>

            <View className="mt-4 rounded-2xl border border-border-light bg-surface-secondary p-4">
              <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                {selectedEntry ? "Selected Reading" : "Latest Reading"}
              </Text>
              <Text
                className="mt-2 text-[34px] font-bold text-foreground"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {selectedValueLabel}
              </Text>
              <Text className="mt-1 text-xs text-foreground-muted">
                {displayEntry
                  ? `Logged ${formatRecordedAt(displayEntry.recordedAt)}`
                  : metric.emptyStateLabel}
              </Text>

              {metric.key === "sleep"
                ? renderSleepSummary(displayEntry)
                : null}

              {displayEntry?.note ? (
                <Text className="mt-3 text-sm leading-5 text-foreground-secondary">
                  {displayEntry.note}
                </Text>
              ) : null}

              {displayEntry ? (
                <View className="mt-4 flex-row gap-2">
                  <Pressable
                    className="flex-1 flex-row items-center justify-center rounded-2xl border border-border-light bg-surface px-4 py-3"
                    onPress={() => handleStartEditing(displayEntry)}
                    disabled={saving || deletingEntryId !== null || editingEntryId === displayEntry.checkinId}
                    style={{
                      opacity: saving || deletingEntryId !== null ? 0.6 : 1,
                    }}
                  >
                    <MaterialCommunityIcons
                      name={editingEntryId === displayEntry.checkinId ? "pencil-circle" : "pencil-outline"}
                      size={18}
                      color={editingEntryId === displayEntry.checkinId ? accent.iconColor : rawColors.primary}
                    />
                    <Text
                      className="ml-2 text-sm font-semibold"
                      style={{ color: editingEntryId === displayEntry.checkinId ? accent.iconColor : rawColors.primary }}
                    >
                      {editingEntryId === displayEntry.checkinId ? "Editing" : "Edit Entry"}
                    </Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 flex-row items-center justify-center rounded-2xl border border-border-light bg-surface px-4 py-3"
                    onPress={() => handleDeleteEntry(displayEntry)}
                    disabled={saving || deletingEntryId !== null}
                    style={{
                      opacity: saving || deletingEntryId !== null ? 0.6 : 1,
                    }}
                  >
                    {deletingEntryId === displayEntry.checkinId ? (
                      <ActivityIndicator size="small" color={rawColors.destructive} />
                    ) : (
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={rawColors.destructive} />
                    )}
                    <Text className="ml-2 text-sm font-semibold" style={{ color: rawColors.destructive }}>
                      Delete
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View className="mt-4 flex-row flex-wrap gap-2">
              <View className="rounded-full bg-primary-light px-3 py-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {filteredEntries.length} in range
                </Text>
              </View>
              <View className="rounded-full bg-surface-secondary px-3 py-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                  {entries.length} total entries
                </Text>
              </View>
              {loading ? (
                <View className="flex-row items-center gap-2 rounded-full bg-surface-secondary px-3 py-1.5">
                  <ActivityIndicator size="small" color={rawColors.primary} />
                  <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                    Refreshing
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View className="rounded-2xl bg-surface p-5" style={cardShadowStyle}>
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-lg font-semibold text-foreground">
                    {editingEntry ? `Edit ${metric.label}` : `Log ${metric.label}`}
                  </Text>
                  <Text className="mt-1 text-sm text-foreground-secondary">
                    {editingEntry
                      ? `Updating the entry from ${formatRecordedAt(editingEntry.recordedAt)}.`
                      : metric.key === "sleep"
                        ? "Set bedtime and wake time on the clock, then save the sleep window."
                        : `This is the main logging area for ${metric.label.toLowerCase()}.`}
                  </Text>
                </View>
                <View
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: accent.iconBackground }}
                >
                  <MaterialCommunityIcons
                    name={editingEntry ? "pencil-outline" : metric.key === "sleep" ? "clock-time-eight-outline" : "plus"}
                    size={22}
                    color={accent.iconColor}
                  />
                </View>
              </View>

            {metric.key === "sleep" ? (
              <View className="mt-4">
                <SleepClockInput
                  sleepStartAt={sleepDraft.sleepStartAt}
                  sleepEndAt={sleepDraft.sleepEndAt}
                  accentColor={accent.iconColor}
                  accentBackground={accent.iconBackground}
                  onChange={(next) => setSleepDraft({
                    ...next,
                    durationMinutes: Math.round(next.sleepHours * 60),
                  })}
                />
              </View>
            ) : metric.inputMode === "score" ? (
              <View className="mt-4 flex-row flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((score) => {
                  const selected = inputValue === String(score);
                  return (
                    <Pressable
                      key={score}
                      className="min-w-[56px] rounded-2xl border px-4 py-3"
                      onPress={() => handleScoreSelect(score)}
                      style={{
                        backgroundColor: selected ? accent.iconColor : rawColors.surfaceSecondary,
                        borderColor: selected ? accent.iconColor : rawColors.border,
                      }}
                    >
                      <Text
                        className="text-center text-base font-semibold"
                        style={{ color: selected ? rawColors.surface : rawColors.foreground }}
                      >
                        {score}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View className="mt-4">
                <Text className="mb-2 text-sm font-medium text-foreground-secondary">{inputLabel}</Text>
                <TextInput
                  className="rounded-2xl border border-border bg-surface-secondary p-4 text-lg text-foreground"
                  value={inputValue}
                  onChangeText={handleInputChange}
                  placeholder={metric.inputPlaceholder}
                  placeholderTextColor={rawColors.foregroundMuted}
                  keyboardType={metric.inputMode === "decimal" ? "decimal-pad" : "number-pad"}
                />
              </View>
            )}

            <Text className="mt-3 text-xs text-foreground-muted">
              {metric.key === "sleep"
                ? "The saved entry stores sleep start, wake time, and duration."
                : metric.inputHelper}
            </Text>

            <View className="mt-4 flex-row items-center gap-3">
              {editingEntry ? (
                <Pressable
                  className="min-h-[48px] flex-row items-center justify-center rounded-2xl border border-border px-4"
                  onPress={handleCancelEditing}
                  disabled={saving || deletingEntryId !== null}
                  style={{
                    backgroundColor: rawColors.surfaceSecondary,
                    opacity: saving || deletingEntryId !== null ? 0.6 : 1,
                  }}
                >
                  <MaterialCommunityIcons name="close" size={18} color={rawColors.foregroundSecondary} />
                  <Text className="ml-2 text-sm font-semibold text-foreground-secondary">Cancel</Text>
                </Pressable>
              ) : null}
              <Pressable
                className="min-h-[48px] flex-1 flex-row items-center justify-center rounded-2xl px-4"
                onPress={handleSave}
                disabled={!canSave || saving || deletingEntryId !== null}
                style={{
                  backgroundColor: !canSave || saving || deletingEntryId !== null
                    ? rawColors.surfaceSecondary
                    : accent.iconColor,
                }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={saveButtonForeground} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="content-save-outline" size={18} color={saveButtonForeground} />
                    <Text className="ml-2 text-sm font-semibold" style={{ color: saveButtonForeground }}>
                      {editingEntry ? `Update ${metric.label}` : `Save ${metric.label}`}
                    </Text>
                  </>
                )}
              </Pressable>

              {saveFeedback ? (
                <Text className="flex-1 text-sm text-foreground-secondary">{saveFeedback}</Text>
              ) : (
                <Text className="flex-1 text-sm text-foreground-muted">
                  {metric.key === "sleep"
                    ? editingEntry
                      ? "Adjust the dial, then save your changes."
                      : "Adjust the dial, then save the window."
                    : metric.inputMode === "score"
                      ? editingEntry
                        ? "Select a score, then save your changes."
                        : "Select a score, then save it."
                      : editingEntry
                        ? "Adjust the value, then save your changes."
                        : "Enter a value, then save it."}
                </Text>
              )}
            </View>
          </View>

          <View className="rounded-2xl bg-surface p-5" style={cardShadowStyle}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-semibold text-foreground">Range Snapshot</Text>
                <Text className="mt-1 text-sm text-foreground-secondary">
                  Summary stats for the currently selected date range.
                </Text>
              </View>
              <View className="h-11 w-11 items-center justify-center rounded-full bg-surface-secondary">
                <MaterialCommunityIcons name="chart-line" size={22} color={rawColors.foregroundSecondary} />
              </View>
            </View>

            <View className="mt-4 flex-row gap-3">
              <View className="flex-1 rounded-2xl border border-border-light bg-surface-secondary p-4">
                <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                  Latest
                </Text>
                <Text className="mt-2 text-xl font-bold text-foreground">
                  {formatUserMetricValue(metric.key, filteredEntries[0]?.value, unitPreference)}
                </Text>
              </View>
              <View className="flex-1 rounded-2xl border border-border-light bg-surface-secondary p-4">
                <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                  Average
                </Text>
                <Text className="mt-2 text-xl font-bold text-foreground">
                  {formatAverageValue(metric.key, averageValue, unitPreference)}
                </Text>
              </View>
            </View>

            <View className="mt-3 flex-row gap-3">
              <View className="flex-1 rounded-2xl border border-border-light bg-surface-secondary p-4">
                <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                  High
                </Text>
                <Text className="mt-2 text-xl font-bold text-foreground">
                  {formatUserMetricValue(metric.key, range?.high, unitPreference)}
                </Text>
              </View>
              <View className="flex-1 rounded-2xl border border-border-light bg-surface-secondary p-4">
                <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                  Low
                </Text>
                <Text className="mt-2 text-xl font-bold text-foreground">
                  {formatUserMetricValue(metric.key, range?.low, unitPreference)}
                </Text>
              </View>
            </View>
          </View>

          <View className="rounded-2xl bg-surface p-5" style={cardShadowStyle}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-semibold text-foreground">Recent History</Text>
                <Text className="mt-1 text-sm text-foreground-secondary">
                  Individual log points in the active date range.
                </Text>
              </View>
              <View className="h-11 w-11 items-center justify-center rounded-full bg-surface-secondary">
                <MaterialCommunityIcons name="history" size={22} color={rawColors.foregroundSecondary} />
              </View>
            </View>

            {historyEntries.length === 0 ? (
              <View className="mt-4 rounded-2xl border border-dashed border-border bg-surface-secondary p-5">
                <View className="items-center">
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-surface">
                    <MaterialCommunityIcons
                      name="timeline-text-outline"
                      size={24}
                      color={rawColors.foregroundMuted}
                    />
                  </View>
                  <Text className="mt-3 text-base font-semibold text-foreground">No history in range</Text>
                  <Text className="mt-1 text-center text-sm text-foreground-secondary">
                    Change the date range or save a fresh entry to populate this list.
                  </Text>
                </View>
              </View>
            ) : (
              <View className="mt-4 gap-3">
                {historyEntries.map((entry) => (
                  <View
                    key={`${entry.checkinId}-${entry.recordedAt}`}
                    className="rounded-2xl border border-border-light bg-surface-secondary p-4"
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1">
                        <Text
                          className="text-xl font-semibold text-foreground"
                          style={{ fontVariant: ["tabular-nums"] }}
                        >
                          {formatUserMetricValue(metric.key, entry.value, unitPreference)}
                        </Text>
                        <Text className="mt-1 text-xs text-foreground-muted">
                          {formatRecordedAt(entry.recordedAt)}
                        </Text>
                      </View>
                      <View
                        className="h-10 w-10 items-center justify-center rounded-full"
                        style={{ backgroundColor: accent.iconBackground }}
                      >
                        <MaterialCommunityIcons name={metric.icon as never} size={18} color={accent.iconColor} />
                      </View>
                    </View>

                    {metric.key === "sleep"
                      ? renderSleepSummary(entry)
                      : null}

                    {renderHistoryMeta(entry)}

                    {entry.note ? (
                      <Text className="mt-3 text-sm leading-5 text-foreground-secondary">{entry.note}</Text>
                    ) : null}

                    <View className="mt-4 flex-row gap-2">
                      <Pressable
                        className="flex-1 flex-row items-center justify-center rounded-2xl border border-border-light bg-surface px-4 py-3"
                        onPress={() => handleStartEditing(entry)}
                        disabled={saving || deletingEntryId !== null || editingEntryId === entry.checkinId}
                        style={{
                          opacity: saving || deletingEntryId !== null ? 0.6 : 1,
                        }}
                      >
                        <MaterialCommunityIcons
                          name={editingEntryId === entry.checkinId ? "pencil-circle" : "pencil-outline"}
                          size={16}
                          color={editingEntryId === entry.checkinId ? accent.iconColor : rawColors.primary}
                        />
                        <Text
                          className="ml-2 text-sm font-semibold"
                          style={{ color: editingEntryId === entry.checkinId ? accent.iconColor : rawColors.primary }}
                        >
                          {editingEntryId === entry.checkinId ? "Editing" : "Edit"}
                        </Text>
                      </Pressable>
                      <Pressable
                        className="flex-1 flex-row items-center justify-center rounded-2xl border border-border-light bg-surface px-4 py-3"
                        onPress={() => handleDeleteEntry(entry)}
                        disabled={saving || deletingEntryId !== null}
                        style={{
                          opacity: saving || deletingEntryId !== null ? 0.6 : 1,
                        }}
                      >
                        {deletingEntryId === entry.checkinId ? (
                          <ActivityIndicator size="small" color={rawColors.destructive} />
                        ) : (
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color={rawColors.destructive} />
                        )}
                        <Text className="ml-2 text-sm font-semibold" style={{ color: rawColors.destructive }}>
                          Delete
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <MetricBaseModal
        visible={deleteConfirmEntry !== null}
        onClose={closeDeleteConfirm}
        maxWidth={380}
      >
        <Text className="text-xl font-bold mb-2 text-foreground">Delete {metric.label}?</Text>
        <Text className="text-base mb-4 text-foreground-secondary">
          {deleteConfirmEntry ? (
            <>
              This will permanently {deleteConfirmKeepsOtherMetrics ? "remove" : "delete"}{" "}
              <Text className="font-semibold text-foreground">
                {formatUserMetricValue(metric.key, deleteConfirmEntry.value, unitPreference)}
              </Text>
              {" "}from{" "}
              <Text className="font-semibold text-foreground">
                {formatRecordedAt(deleteConfirmEntry.recordedAt)}
              </Text>
              .{" "}
              {deleteConfirmKeepsOtherMetrics
                ? "Any other metrics saved on that same check-in will be kept."
                : "This action cannot be undone."}
            </>
          ) : null}
        </Text>
        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
            onPress={closeDeleteConfirm}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center p-3.5 rounded-lg gap-1.5 bg-destructive"
            onPress={handleConfirmDelete}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <MaterialCommunityIcons name="delete" size={20} color={rawColors.surface} />
            <Text className="text-base font-semibold text-primary-foreground">Delete</Text>
          </Pressable>
        </View>
      </MetricBaseModal>
    </View>
  );
}
