import { Pressable, Text, View } from "react-native";
import type { UnitPreference } from "../../lib/db/settings";
import { useTheme } from "../../lib/theme/ThemeContext";

type UnitToggleProps = {
  value: UnitPreference;
  onChange: (value: UnitPreference) => void;
  testIDPrefix?: string;
};

export default function UnitToggle({
  value,
  onChange,
  testIDPrefix = "calculator-unit-toggle",
}: UnitToggleProps) {
  const { rawColors } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
      }}
    >
      {(["kg", "lb"] as UnitPreference[]).map((unit) => {
        const isSelected = value === unit;
        return (
          <Pressable
            key={unit}
            testID={`${testIDPrefix}-${unit}`}
            onPress={() => onChange(unit)}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: isSelected ? rawColors.primary : rawColors.border,
              backgroundColor: isSelected ? rawColors.primaryLight : rawColors.surfaceSecondary,
              paddingVertical: 12,
              alignItems: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              selectable
              style={{
                color: isSelected ? rawColors.primary : rawColors.foregroundSecondary,
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              {unit.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
