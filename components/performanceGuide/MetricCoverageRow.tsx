import { Text, View } from "react-native";
import type { MetricAvailability } from "../../lib/userMetrics/performanceGuide";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
  getPerformanceGuideCoverageStatus,
  getPerformanceGuideMetricLabel,
} from "../../lib/userMetrics/performanceGuide/display";
import GuideBadge from "./GuideBadge";

type MetricCoverageRowProps = {
  availability: MetricAvailability;
  testID?: string;
};

export default function MetricCoverageRow({
  availability,
  testID,
}: MetricCoverageRowProps) {
  const { rawColors } = useTheme();
  const status = getPerformanceGuideCoverageStatus(availability);
  const tone =
    status.label === "Trend ready"
      ? "primary"
      : status.label === "Acute only"
        ? "warning"
        : status.label === "Recent, trend limited"
          ? "neutral"
          : status.label === "Stale"
            ? "muted"
            : "muted";

  return (
    <View
      testID={testID}
      className="flex-row items-center justify-between rounded-xl bg-surface-secondary px-4 py-3"
    >
      <View className="flex-1 pr-3">
        <Text className="text-sm font-semibold text-foreground">
          {getPerformanceGuideMetricLabel(availability.metric)}
        </Text>
        <Text className="mt-1 text-xs text-foreground-muted">
          {status.detail}
        </Text>
      </View>

      <GuideBadge label={status.label} tone={tone} />
    </View>
  );
}
