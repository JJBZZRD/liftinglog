import { Text, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
  getPerformanceGuideToneStyles,
  type PerformanceGuideTone,
} from "../../lib/userMetrics/performanceGuide/display";

type GuideBadgeProps = {
  label: string;
  tone: PerformanceGuideTone;
  testID?: string;
};

export default function GuideBadge({
  label,
  tone,
  testID,
}: GuideBadgeProps) {
  const { rawColors } = useTheme();
  const toneStyles = getPerformanceGuideToneStyles(rawColors, tone);

  return (
    <View
      testID={testID}
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: toneStyles.borderColor,
        backgroundColor: toneStyles.backgroundColor,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Text
        className="text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: toneStyles.textColor }}
      >
        {label}
      </Text>
    </View>
  );
}
