import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";

type CalculatorNoteProps = {
  title?: string;
  tone?: "neutral" | "primary" | "warning";
  children: ReactNode;
  testID?: string;
};

export default function CalculatorNote({
  title,
  tone = "neutral",
  children,
  testID,
}: CalculatorNoteProps) {
  const { rawColors } = useTheme();

  const colors =
    tone === "primary"
      ? {
          background: rawColors.primaryLight,
          border: rawColors.primary,
          text: rawColors.primary,
        }
      : tone === "warning"
        ? {
            background: `${rawColors.warning}15`,
            border: rawColors.warning,
            text: rawColors.warning,
          }
        : {
            background: rawColors.surfaceSecondary,
            border: rawColors.borderLight,
            text: rawColors.foregroundSecondary,
          };

  return (
    <View
      testID={testID}
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 4,
      }}
    >
      {title ? (
        <Text
          selectable
          style={{
            color: colors.text,
            fontSize: 13,
            fontWeight: "700",
          }}
        >
          {title}
        </Text>
      ) : null}
      <Text
        selectable
        style={{
          color: tone === "neutral" ? rawColors.foregroundSecondary : colors.text,
          fontSize: 13,
          lineHeight: 18,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
