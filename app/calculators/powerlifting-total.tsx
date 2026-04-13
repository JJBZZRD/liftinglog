import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import CalculatorNote from "../../components/calculators/CalculatorNote";
import CalculatorNumberInput from "../../components/calculators/CalculatorNumberInput";
import CalculatorResultCard from "../../components/calculators/CalculatorResultCard";
import UnitToggle from "../../components/calculators/UnitToggle";
import {
  convertWeightInputValue,
  parsePositiveWeightInputToKg,
} from "../../lib/calculators/input";
import { calculatePowerliftingTotal } from "../../lib/calculators/powerlifting";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { useTheme } from "../../lib/theme/ThemeContext";
import { formatWeightFromKg, getWeightUnitLabel } from "../../lib/utils/units";

export default function PowerliftingTotalScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const [unit, setUnit] = useState(unitPreference);
  const [squatInput, setSquatInput] = useState("");
  const [benchInput, setBenchInput] = useState("");
  const [deadliftInput, setDeadliftInput] = useState("");

  const handleUnitChange = (nextUnit: "kg" | "lb") => {
    setSquatInput((current) => convertWeightInputValue(current, unit, nextUnit));
    setBenchInput((current) => convertWeightInputValue(current, unit, nextUnit));
    setDeadliftInput((current) => convertWeightInputValue(current, unit, nextUnit));
    setUnit(nextUnit);
  };

  const squatKg = parsePositiveWeightInputToKg(squatInput, unit);
  const benchKg = parsePositiveWeightInputToKg(benchInput, unit);
  const deadliftKg = parsePositiveWeightInputToKg(deadliftInput, unit);
  const totalKg =
    squatKg !== null && benchKg !== null && deadliftKg !== null
      ? calculatePowerliftingTotal(squatKg, benchKg, deadliftKg)
      : null;

  return (
    <ScrollView
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
          Build a full-power total
        </Text>

        <UnitToggle value={unit} onChange={handleUnitChange} testIDPrefix="powerlifting-total-unit" />

        <CalculatorNumberInput
          label="Squat"
          value={squatInput}
          onChangeText={setSquatInput}
          placeholder={unit === "kg" ? "220" : "485"}
          suffix={getWeightUnitLabel(unit)}
        />

        <CalculatorNumberInput
          label="Bench"
          value={benchInput}
          onChangeText={setBenchInput}
          placeholder={unit === "kg" ? "150" : "330"}
          suffix={getWeightUnitLabel(unit)}
        />

        <CalculatorNumberInput
          label="Deadlift"
          value={deadliftInput}
          onChangeText={setDeadliftInput}
          placeholder={unit === "kg" ? "260" : "573"}
          suffix={getWeightUnitLabel(unit)}
        />
      </View>

      <CalculatorNote title="Scope">
        This calculator is for classic full-power totals only: squat, bench press, and deadlift.
      </CalculatorNote>

      {totalKg !== null ? (
        <CalculatorResultCard
          title="Powerlifting Total"
          value={formatWeightFromKg(totalKg, unit)}
          subtitle="Sum of squat, bench, and deadlift"
        />
      ) : (
        <CalculatorNote title="Enter all three lifts">
          Add positive squat, bench, and deadlift values to compute a total.
        </CalculatorNote>
      )}
    </ScrollView>
  );
}
