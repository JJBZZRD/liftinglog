import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { createUserCheckin, listAllUserCheckins, type UserCheckin } from "../../lib/db/userCheckins";
import { useTheme, type RawThemeColors } from "../../lib/theme/ThemeContext";
import {
  buildUserMetricCheckinInput,
  formatUserMetricValue,
  getAverageMetricValue,
  getMetricRange,
  getUserMetricDefinition,
  getUserMetricEntries,
  parseUserMetricInputValue,
  type UserMetricAccent,
  type UserMetricEntry,
  type UserMetricKey,
} from "../../lib/userMetrics/definitions";
import { getWeightUnitLabel, parseWeightInputToKg } from "../../lib/utils/units";

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

export default function UserMetricDetailScreen() {
  const params = useLocalSearchParams<{ metric?: string | string[] }>();
  const metricParam = Array.isArray(params.metric) ? params.metric[0] : params.metric;
  const metric = getUserMetricDefinition(metricParam ?? "");

  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const [checkins, setCheckins] = useState<UserCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

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

  const entries = metric ? getUserMetricEntries(checkins, metric.key) : [];
  const latestEntry = entries[0] ?? null;
  const averageValue = getAverageMetricValue(entries);
  const range = getMetricRange(entries);
  const recentWindowStart = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const recentCount = entries.filter((entry) => entry.recordedAt >= recentWindowStart).length;
  const parsedValue = metric
    ? parseMetricInputValue(metric.key, inputValue, unitPreference)
    : null;
  const canSave = metric ? isValidMetricValue(metric.key, parsedValue) : false;
  const accent = metric ? getAccentColors(metric.accent, rawColors) : getAccentColors("primary", rawColors);
  const saveButtonForeground = !canSave || saving ? rawColors.foregroundMuted : rawColors.surface;

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    setSaveFeedback(null);
  }, []);

  const handleScoreSelect = useCallback((score: number) => {
    setInputValue(String(score));
    setSaveFeedback(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!metric) {
      return;
    }

    const nextValue = parseMetricInputValue(metric.key, inputValue, unitPreference);
    if (!isValidMetricValue(metric.key, nextValue)) {
      return;
    }

    setSaving(true);
    setSaveFeedback(null);

    try {
      await createUserCheckin({
        ...buildUserMetricCheckinInput(metric.key, nextValue),
        context: "quick_log",
        source: "manual",
      });
      setInputValue("");
      setSaveFeedback("Saved to User Metrics.");
      await loadCheckins();
    } catch (error) {
      console.error(`Error saving ${metric.key} metric:`, error);
      setSaveFeedback("Unable to save right now.");
    } finally {
      setSaving(false);
    }
  }, [inputValue, loadCheckins, metric, unitPreference]);

  if (!metric) {
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

  const historyEntries = entries.slice(0, 8);
  const latestValue = formatUserMetricValue(metric.key, latestEntry?.value, unitPreference);
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

            <View className="mt-5 rounded-2xl border border-border-light bg-surface-secondary p-4">
              <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                Quick View
              </Text>
              <Text
                className="mt-2 text-[34px] font-bold text-foreground"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {latestValue}
              </Text>
              <Text className="mt-1 text-xs text-foreground-muted">
                {latestEntry ? `Logged ${formatRecordedAt(latestEntry.recordedAt, false)}` : metric.emptyStateLabel}
              </Text>
            </View>

            <View className="mt-4 flex-row flex-wrap gap-2">
              <View className="rounded-full bg-primary-light px-3 py-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {entries.length} {entries.length === 1 ? "entry" : "entries"}
                </Text>
              </View>
              <View className="rounded-full bg-surface-secondary px-3 py-1.5">
                <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                  {recentCount} in last 30 days
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
                <Text className="text-lg font-semibold text-foreground">Quick Log</Text>
                <Text className="mt-1 text-sm text-foreground-secondary">
                  Add a fresh {metric.label.toLowerCase()} check-in without leaving the page.
                </Text>
              </View>
              <View
                className="h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: accent.iconBackground }}
              >
                <MaterialCommunityIcons name="plus" size={22} color={accent.iconColor} />
              </View>
            </View>

            {metric.inputMode === "score" ? (
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

            <Text className="mt-3 text-xs text-foreground-muted">{metric.inputHelper}</Text>

            <View className="mt-4 flex-row items-center gap-3">
              <Pressable
                className="min-h-[48px] flex-1 flex-row items-center justify-center rounded-2xl px-4"
                onPress={handleSave}
                disabled={!canSave || saving}
                style={{
                  backgroundColor: !canSave || saving ? rawColors.surfaceSecondary : accent.iconColor,
                }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={saveButtonForeground} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="content-save-outline" size={18} color={saveButtonForeground} />
                    <Text className="ml-2 text-sm font-semibold" style={{ color: saveButtonForeground }}>
                      Save {metric.label}
                    </Text>
                  </>
                )}
              </Pressable>

              {saveFeedback ? (
                <Text className="flex-1 text-sm text-foreground-secondary">{saveFeedback}</Text>
              ) : (
                <Text className="flex-1 text-sm text-foreground-muted">
                  {metric.inputMode === "score" ? "Select a score, then save it." : "Enter a value, then save it."}
                </Text>
              )}
            </View>
          </View>

          <View className="rounded-2xl bg-surface p-5" style={cardShadowStyle}>
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-semibold text-foreground">Analytics Snapshot</Text>
                <Text className="mt-1 text-sm text-foreground-secondary">
                  Quick reference numbers for this metric before fuller charts exist.
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
                <Text className="mt-2 text-xl font-bold text-foreground">{latestValue}</Text>
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
                  Individual log points for {metric.label.toLowerCase()}.
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
                  <Text className="mt-3 text-base font-semibold text-foreground">No history yet</Text>
                  <Text className="mt-1 text-center text-sm text-foreground-secondary">
                    This card stays available so the metric can become a real quick-access hub before you log the first value.
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

                    {renderHistoryMeta(entry)}

                    {entry.note ? (
                      <Text className="mt-3 text-sm leading-5 text-foreground-secondary">{entry.note}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
