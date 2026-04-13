import { Text, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";

type CalculatorResultCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "primary" | "success" | "warning";
  testID?: string;
};

export default function CalculatorResultCard({
  title,
  value,
  subtitle,
  tone = "primary",
  testID,
}: CalculatorResultCardProps) {
  const { rawColors } = useTheme();

  const accentColor =
    tone === "success"
      ? rawColors.success
      : tone === "warning"
        ? rawColors.warning
        : rawColors.primary;

  return (
    <View
      testID={testID}
      style={{
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingVertical: 16,
        backgroundColor: rawColors.surface,
        borderWidth: 1,
        borderColor: rawColors.borderLight,
        boxShadow: `0 12px 28px ${rawColors.shadow}14`,
        gap: 6,
      }}
    >
      <Text
        selectable
        style={{
          color: rawColors.foregroundSecondary,
          fontSize: 13,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {title}
      </Text>
      <Text
        selectable
        style={{
          color: accentColor,
          fontSize: 28,
          fontWeight: "800",
          lineHeight: 34,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      {subtitle ? (
        <Text
          selectable
          style={{
            color: rawColors.foregroundMuted,
            fontSize: 13,
            lineHeight: 18,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
