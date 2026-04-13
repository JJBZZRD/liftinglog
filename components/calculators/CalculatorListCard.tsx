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

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 22,
        padding: 18,
        backgroundColor: rawColors.surface,
        borderWidth: 1,
        borderColor: rawColors.borderLight,
        boxShadow: `0 14px 30px ${rawColors.shadow}12`,
        opacity: pressed ? 0.88 : 1,
        gap: 14,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 14,
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: rawColors.primaryLight,
          }}
        >
          <MaterialCommunityIcons name={icon as never} size={22} color={rawColors.primary} />
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
            {title}
          </Text>
          <Text
            selectable
            style={{
              color: rawColors.foregroundSecondary,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            {description}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={22}
          color={rawColors.foregroundMuted}
        />
      </View>
      {previewChips && previewChips.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {previewChips.map((chip) => (
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
      ) : null}
    </Pressable>
  );
}
