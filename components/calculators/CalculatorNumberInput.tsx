import { Text, TextInput, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";

type CalculatorNumberInputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  suffix?: string;
  helperText?: string;
  testID?: string;
};

export default function CalculatorNumberInput({
  label,
  value,
  onChangeText,
  placeholder,
  suffix,
  helperText,
  testID,
}: CalculatorNumberInputProps) {
  const { rawColors } = useTheme();

  return (
    <View
      style={{
        gap: 8,
      }}
    >
      <Text
        selectable
        style={{
          color: rawColors.foregroundSecondary,
          fontSize: 13,
          fontWeight: "600",
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderWidth: 1,
          borderColor: rawColors.border,
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: rawColors.surfaceSecondary,
        }}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={rawColors.foregroundMuted}
          keyboardType="decimal-pad"
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            flex: 1,
            color: rawColors.foreground,
            fontSize: 18,
            fontWeight: "600",
            paddingVertical: 0,
          }}
        />
        {suffix ? (
          <Text
            selectable
            style={{
              color: rawColors.foregroundSecondary,
              fontSize: 15,
              fontWeight: "600",
            }}
          >
            {suffix}
          </Text>
        ) : null}
      </View>
      {helperText ? (
        <Text
          selectable
          style={{
            color: rawColors.foregroundMuted,
            fontSize: 12,
            lineHeight: 18,
          }}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
