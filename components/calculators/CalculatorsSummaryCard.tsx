import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";

type CalculatorsSummaryCardProps = {
  onPress: () => void;
};

const PREVIEW_CHIPS = ["1RM", "DOTS", "GL", "Sinclair", "Plates"];

export default function CalculatorsSummaryCard({
  onPress,
}: CalculatorsSummaryCardProps) {
  const { rawColors } = useTheme();

  return (
    <Pressable
      testID="calculators-summary-card"
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 24,
        padding: 18,
        backgroundColor: rawColors.surface,
        borderWidth: 1,
        borderColor: rawColors.borderLight,
        boxShadow: `0 16px 32px ${rawColors.shadow}12`,
        opacity: pressed ? 0.9 : 1,
        gap: 14,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: rawColors.primaryLight,
          }}
        >
          <MaterialCommunityIcons name="calculator-variant-outline" size={24} color={rawColors.primary} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            selectable
            style={{
              color: rawColors.foreground,
              fontSize: 18,
              fontWeight: "700",
            }}
          >
            Calculators
          </Text>
          <Text
            selectable
            style={{
              color: rawColors.foregroundSecondary,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            Offline lifting tools for estimating, comparing, and loading weight.
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={22}
          color={rawColors.foregroundMuted}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {PREVIEW_CHIPS.map((chip) => (
          <View
            key={chip}
            style={{
              borderRadius: 999,
              backgroundColor: rawColors.surfaceSecondary,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text
              selectable
              style={{
                color: rawColors.foregroundSecondary,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {chip}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}
