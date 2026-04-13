import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";

type CalculatorListCardProps = {
  title: string;
  description: string;
  icon: string;
  previewChips?: string[];
  onPress: () => void;
  testID?: string;
};

export default function CalculatorListCard({
  title,
  description,
  icon,
  previewChips,
  onPress,
  testID,
}: CalculatorListCardProps) {
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
      testID={testID}
      onPress={onPress}
      className="gap-3.5 rounded-2xl bg-surface p-5"
      style={({ pressed }) => [cardShadowStyle, { opacity: pressed ? 0.88 : 1 }]}
    >
      <View className="flex-row items-start gap-3.5">
        <View className="h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-light">
          <MaterialCommunityIcons name={icon as never} size={26} color={rawColors.primary} />
        </View>
        <View className="min-w-0 flex-1 gap-1 pr-1">
          <Text className="text-lg font-semibold text-foreground" selectable>
            {title}
          </Text>
          <Text className="text-sm leading-5 text-foreground-secondary" selectable>
            {description}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={rawColors.foregroundSecondary}
        />
      </View>
      {previewChips && previewChips.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {previewChips.map((chip) => (
            <View key={chip} className="rounded-full bg-surface-secondary px-2.5 py-1.5">
              <Text className="text-xs font-bold text-foreground-secondary" selectable>
                {chip}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
