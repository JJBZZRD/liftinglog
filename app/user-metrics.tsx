import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useUnitPreference } from "../lib/contexts/UnitPreferenceContext";
import { listAllUserCheckins, type UserCheckin } from "../lib/db/userCheckins";
import { useTheme, type RawThemeColors } from "../lib/theme/ThemeContext";
import {
  USER_METRIC_DEFINITIONS,
  formatUserMetricValue,
  getUserMetricEntries,
  type UserMetricAccent,
  type UserMetricEntry,
  type UserMetricKey,
} from "../lib/userMetrics/definitions";

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

function formatMetricDate(entry: UserMetricEntry | null) {
  if (!entry) {
    return null;
  }

  const date = new Date(entry.recordedAt);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
}

export default function UserMetricsScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const [checkins, setCheckins] = useState<UserCheckin[]>([]);
  const [loading, setLoading] = useState(true);

  const cardShadowStyle = {
    shadowColor: rawColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  } as const;

  const loadCheckins = useCallback(async () => {
    try {
      const rows = await listAllUserCheckins();
      setCheckins(rows);
    } catch (error) {
      console.error("Error loading user check-ins:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCheckins();
    }, [loadCheckins])
  );

  const handleMetricPress = useCallback((metric: UserMetricKey) => {
    router.push({
      pathname: "/user-metric/[metric]",
      params: { metric },
    });
  }, []);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "User Metrics",
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ paddingRight: 8 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120, gap: 16 }}
      >
        <View className="rounded-2xl bg-surface p-5" style={cardShadowStyle}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-xl font-semibold text-foreground" selectable>
                Metrics Hub
              </Text>
              <Text className="mt-1 text-sm text-foreground-secondary" selectable>
                Each card is a standing quick-view tile for a metric and your jump-off point for its history, logging, and analytics.
              </Text>
            </View>
            <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-light">
              <MaterialCommunityIcons name="view-dashboard-outline" size={24} color={rawColors.primary} />
            </View>
          </View>

          <View className="mt-4 flex-row flex-wrap gap-2">
            <View className="rounded-full bg-surface-secondary px-3 py-2">
              <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary" selectable>
                {USER_METRIC_DEFINITIONS.length} tracked metrics
              </Text>
            </View>
            <View className="rounded-full bg-surface-secondary px-3 py-2">
              <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary" selectable>
                {checkins.length} total check-ins
              </Text>
            </View>
            {loading ? (
              <View className="flex-row items-center gap-2 rounded-full bg-primary-light px-3 py-2">
                <ActivityIndicator size="small" color={rawColors.primary} />
                <Text className="text-xs font-semibold uppercase tracking-wide text-primary" selectable>
                  Refreshing latest values
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="gap-4">
          {USER_METRIC_DEFINITIONS.map((metric) => {
            const accent = getAccentColors(metric.accent, rawColors);
            const entries = getUserMetricEntries(checkins, metric.key);
            const latestEntry = entries[0] ?? null;
            const latestValue = formatUserMetricValue(metric.key, latestEntry?.value, unitPreference);
            const latestDate = formatMetricDate(latestEntry);

            return (
              <Pressable
                key={metric.key}
                className="rounded-2xl bg-surface p-5"
                onPress={() => handleMetricPress(metric.key)}
                style={cardShadowStyle}
              >
                <View className="flex-row items-start gap-4">
                  <View
                    className="h-12 w-12 items-center justify-center rounded-full"
                    style={{ backgroundColor: accent.iconBackground }}
                  >
                    <MaterialCommunityIcons name={metric.icon as never} size={24} color={accent.iconColor} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-lg font-semibold text-foreground" selectable>
                      {metric.label}
                    </Text>
                    <Text className="mt-1 text-sm text-foreground-secondary" selectable>
                      {metric.subtitle}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={24}
                    color={rawColors.foregroundSecondary}
                  />
                </View>

                <View className="mt-4 rounded-2xl border border-border-light bg-surface-secondary p-4">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary" selectable>
                    Quick View
                  </Text>
                  <Text
                    className="mt-2 text-[28px] font-bold text-foreground"
                    selectable
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {latestValue}
                  </Text>
                  <Text className="mt-1 text-xs text-foreground-muted" selectable>
                    {loading
                      ? "Loading latest value..."
                      : latestEntry
                        ? `Logged ${latestDate}`
                        : metric.emptyStateLabel}
                  </Text>
                </View>

                <View className="mt-4 flex-row flex-wrap gap-2">
                  <View className="rounded-full bg-primary-light px-3 py-1.5">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-primary" selectable>
                      History
                    </Text>
                  </View>
                  <View className="rounded-full bg-surface-secondary px-3 py-1.5">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary" selectable>
                      Log
                    </Text>
                  </View>
                  <View className="rounded-full bg-surface-secondary px-3 py-1.5">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary" selectable>
                      Analytics
                    </Text>
                  </View>
                  <View className="rounded-full bg-surface-secondary px-3 py-1.5">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary" selectable>
                      {entries.length} {entries.length === 1 ? "entry" : "entries"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
