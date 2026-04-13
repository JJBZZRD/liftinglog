import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import CalculatorNote from "../../components/calculators/CalculatorNote";
import CalculatorNumberInput from "../../components/calculators/CalculatorNumberInput";
import CalculatorResultCard from "../../components/calculators/CalculatorResultCard";
import UnitToggle from "../../components/calculators/UnitToggle";
import {
  convertWeightInputValue,
  formatDecimal,
  parsePositiveWeightInputToKg,
} from "../../lib/calculators/input";
import type { AthleteSex } from "../../lib/calculators/types";
import { calculateSinclair } from "../../lib/calculators/weightlifting";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { useLatestBodyweight } from "../../lib/hooks/useLatestBodyweight";
import { useTheme } from "../../lib/theme/ThemeContext";
import { formatEditableWeightFromKg, formatWeightFromKg, getWeightUnitLabel } from "../../lib/utils/units";

export default function SinclairScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const latestBodyweight = useLatestBodyweight();
  const [unit, setUnit] = useState(unitPreference);
  const [sex, setSex] = useState<AthleteSex>("male");
  const [bodyweightInput, setBodyweightInput] = useState("");
  const [snatchInput, setSnatchInput] = useState("");
  const [cleanAndJerkInput, setCleanAndJerkInput] = useState("");
  const [hasEditedBodyweight, setHasEditedBodyweight] = useState(false);

  useEffect(() => {
    if (!latestBodyweight || hasEditedBodyweight || bodyweightInput.trim().length > 0) {
      return;
    }

    setBodyweightInput(formatEditableWeightFromKg(latestBodyweight.value, unit, 1));
  }, [latestBodyweight, hasEditedBodyweight, bodyweightInput, unit]);

  const handleUnitChange = (nextUnit: "kg" | "lb") => {
    setBodyweightInput((current) => convertWeightInputValue(current, unit, nextUnit));
    setSnatchInput((current) => convertWeightInputValue(current, unit, nextUnit));
    setCleanAndJerkInput((current) => convertWeightInputValue(current, unit, nextUnit));
    setUnit(nextUnit);
  };

  const bodyweightKg = parsePositiveWeightInputToKg(bodyweightInput, unit);
  const snatchKg = parsePositiveWeightInputToKg(snatchInput, unit);
  const cleanAndJerkKg = parsePositiveWeightInputToKg(cleanAndJerkInput, unit);
  const result =
    bodyweightKg !== null && snatchKg !== null && cleanAndJerkKg !== null
      ? calculateSinclair(sex, bodyweightKg, snatchKg, cleanAndJerkKg)
      : null;

  return (
    <ScrollView
      testID="sinclair-screen"
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 120,
        gap: 16,
      }}
    >
      <View
        style={{
          borderRadius: 24,
          padding: 20,
          backgroundColor: rawColors.surface,
          borderWidth: 1,
          borderColor: rawColors.borderLight,
          boxShadow: `0 18px 32px ${rawColors.shadow}12`,
          gap: 16,
        }}
      >
        <Text
          selectable
          style={{
            color: rawColors.foreground,
            fontSize: 24,
            fontWeight: "800",
            lineHeight: 30,
          }}
        >
          Compare Olympic lifting totals
        </Text>

        <View style={{ gap: 10 }}>
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
            Sex
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["male", "female"] as AthleteSex[]).map((value) => {
              const isSelected = sex === value;
              return (
                <Pressable
                  key={value}
                  testID={`sinclair-sex-${value}`}
                  onPress={() => setSex(value)}
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
                    {value === "male" ? "Men" : "Women"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <UnitToggle value={unit} onChange={handleUnitChange} testIDPrefix="sinclair-unit" />

        <CalculatorNumberInput
          testID="sinclair-bodyweight-input"
          label="Bodyweight"
          value={bodyweightInput}
          onChangeText={(value) => {
            setHasEditedBodyweight(true);
            setBodyweightInput(value);
          }}
          placeholder={unit === "kg" ? "89" : "196"}
          suffix={getWeightUnitLabel(unit)}
        />

        <CalculatorNumberInput
          label="Snatch"
          value={snatchInput}
          onChangeText={setSnatchInput}
          placeholder={unit === "kg" ? "145" : "320"}
          suffix={getWeightUnitLabel(unit)}
        />

        <CalculatorNumberInput
          label="Clean & Jerk"
          value={cleanAndJerkInput}
          onChangeText={setCleanAndJerkInput}
          placeholder={unit === "kg" ? "180" : "397"}
          suffix={getWeightUnitLabel(unit)}
        />
      </View>

      {latestBodyweight ? (
        <CalculatorNote title="Bodyweight prefill" tone="primary">
          Latest user metrics bodyweight was loaded as the starting value. You can still edit it.
        </CalculatorNote>
      ) : (
        <CalculatorNote title="Bodyweight prefill">
          No bodyweight was found in User Metrics, so this field starts blank and stays fully editable.
        </CalculatorNote>
      )}

      {result ? (
        <View style={{ gap: 12 }}>
          <CalculatorResultCard
            title="Olympic Total"
            value={formatWeightFromKg(result.totalKg, unit)}
            subtitle="Snatch plus clean & jerk"
          />
          <CalculatorResultCard
            title="Sinclair"
            value={formatDecimal(result.score, 2)}
            subtitle={`Coefficient ${formatDecimal(result.coefficient, 4)}`}
            tone="success"
          />
        </View>
      ) : (
        <CalculatorNote title="Enter a full result">
          Add bodyweight, snatch, and clean & jerk values to calculate a Sinclair score.
        </CalculatorNote>
      )}
    </ScrollView>
  );
}
