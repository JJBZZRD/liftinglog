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
import {
  calculateDots,
  calculateGoodlift,
  calculateWilks,
  getDotsBodyweightRange,
} from "../../lib/calculators/powerlifting";
import type { AthleteSex } from "../../lib/calculators/types";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { useLatestBodyweight } from "../../lib/hooks/useLatestBodyweight";
import { useTheme } from "../../lib/theme/ThemeContext";
import { formatEditableWeightFromKg, getWeightUnitLabel } from "../../lib/utils/units";

export default function PowerScoreScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const latestBodyweight = useLatestBodyweight();
  const [unit, setUnit] = useState(unitPreference);
  const [sex, setSex] = useState<AthleteSex>("male");
  const [bodyweightInput, setBodyweightInput] = useState("");
  const [totalInput, setTotalInput] = useState("");
  const [hasEditedBodyweight, setHasEditedBodyweight] = useState(false);

  useEffect(() => {
    if (!latestBodyweight || hasEditedBodyweight || bodyweightInput.trim().length > 0) {
      return;
    }

    setBodyweightInput(formatEditableWeightFromKg(latestBodyweight.value, unit, 1));
  }, [latestBodyweight, hasEditedBodyweight, bodyweightInput, unit]);

  const handleUnitChange = (nextUnit: "kg" | "lb") => {
    setBodyweightInput((current) => convertWeightInputValue(current, unit, nextUnit));
    setTotalInput((current) => convertWeightInputValue(current, unit, nextUnit));
    setUnit(nextUnit);
  };

  const bodyweightKg = parsePositiveWeightInputToKg(bodyweightInput, unit);
  const totalKg = parsePositiveWeightInputToKg(totalInput, unit);
  const dots =
    bodyweightKg !== null && totalKg !== null ? calculateDots(sex, bodyweightKg, totalKg) : null;
  const goodlift =
    bodyweightKg !== null && totalKg !== null ? calculateGoodlift(sex, bodyweightKg, totalKg) : null;
  const wilks =
    bodyweightKg !== null && totalKg !== null ? calculateWilks(sex, bodyweightKg, totalKg) : null;
  const dotsRange = getDotsBodyweightRange(sex);

  return (
    <ScrollView
      testID="power-score-screen"
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
          Compare a total across bodyweights
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
                  testID={`power-score-sex-${value}`}
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

        <UnitToggle value={unit} onChange={handleUnitChange} testIDPrefix="power-score-unit" />

        <CalculatorNumberInput
          testID="power-score-bodyweight-input"
          label="Bodyweight"
          value={bodyweightInput}
          onChangeText={(value) => {
            setHasEditedBodyweight(true);
            setBodyweightInput(value);
          }}
          placeholder={unit === "kg" ? "90" : "198"}
          suffix={getWeightUnitLabel(unit)}
        />

        <CalculatorNumberInput
          testID="power-score-total-input"
          label="Total"
          value={totalInput}
          onChangeText={setTotalInput}
          placeholder={unit === "kg" ? "750" : "1653"}
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

      <CalculatorNote title="DOTS bodyweight cap">
        DOTS uses the standard capped range for {sex === "male" ? "men" : "women"}:{" "}
        {dotsRange.minBodyweightKg}-{dotsRange.maxBodyweightKg} kg.
      </CalculatorNote>

      {dots !== null && goodlift !== null && wilks !== null ? (
        <View style={{ gap: 12 }}>
          <CalculatorResultCard
            title="DOTS"
            value={formatDecimal(dots, 2)}
            subtitle="Current DOTS coefficient score"
          />
          <CalculatorResultCard
            title="IPF GL"
            value={formatDecimal(goodlift, 2)}
            subtitle="Classic full-power Goodlift score"
            tone="success"
          />
          <CalculatorResultCard
            title="Wilks Legacy"
            value={formatDecimal(wilks, 2)}
            subtitle="Historical Wilks formula result"
            tone="warning"
          />
        </View>
      ) : (
        <CalculatorNote title="Enter bodyweight and total">
          Add a positive bodyweight and full-power total to see DOTS, IPF GL, and Wilks Legacy.
        </CalculatorNote>
      )}
    </ScrollView>
  );
}
