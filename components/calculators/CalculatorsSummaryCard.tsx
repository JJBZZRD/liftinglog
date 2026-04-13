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

  const cardShadowStyle = {
    shadowColor: rawColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  } as const;

  return (
    <Pressable
      testID="calculators-summary-card"
      onPress={onPress}
      className="mb-4 gap-3.5 rounded-2xl bg-surface p-5"
      style={({ pressed }) => [cardShadowStyle, { opacity: pressed ? 0.9 : 1 }]}
    >
      <View className="flex-row items-center gap-3.5">
        <View className="h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-light">
          <MaterialCommunityIcons name="calculator-variant-outline" size={32} color={rawColors.primary} />
        </View>
        <View className="flex-1 gap-1 pr-1">
          <Text className="text-lg font-semibold text-foreground" selectable>
            Calculators
          </Text>
          <Text className="text-sm leading-5 text-foreground-secondary" selectable>
            Offline lifting tools for estimating, comparing, and loading weight.
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={rawColors.foregroundSecondary}
        />
      </View>

      <View className="flex-row flex-wrap gap-2">
        {PREVIEW_CHIPS.map((chip) => (
          <View key={chip} className="rounded-full bg-surface-secondary px-2.5 py-1.5">
            <Text className="text-xs font-bold text-foreground-secondary" selectable>
              {chip}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}
