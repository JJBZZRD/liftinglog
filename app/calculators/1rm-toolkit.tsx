import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import CalculatorNote from "../../components/calculators/CalculatorNote";
import CalculatorNumberInput from "../../components/calculators/CalculatorNumberInput";
import CalculatorResultCard from "../../components/calculators/CalculatorResultCard";
import UnitToggle from "../../components/calculators/UnitToggle";
import {
  convertWeightInputValue,
  parsePositiveIntegerInput,
  parsePositiveWeightInputToKg,
} from "../../lib/calculators/input";
import { calculateE1rmToolkit } from "../../lib/calculators/strength";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import type { E1RMFormulaId } from "../../lib/db/settings";
import { getGlobalFormula } from "../../lib/db/settings";
import { useTheme } from "../../lib/theme/ThemeContext";
import { E1RM_FORMULA_LABELS } from "../../lib/pb";
import { formatWeightFromKg, getWeightUnitLabel } from "../../lib/utils/units";

const FORMULA_IDS: E1RMFormulaId[] = [
  "epley",
  "brzycki",
  "oconner",
  "lombardi",
  "mayhew",
  "wathan",
];

export default function OneRmToolkitScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const [unit, setUnit] = useState(unitPreference);
  const [formula, setFormula] = useState<E1RMFormulaId>(() => getGlobalFormula());
  const [weightInput, setWeightInput] = useState("");
  const [repsInput, setRepsInput] = useState("");

  const handleUnitChange = (nextUnit: "kg" | "lb") => {
    setWeightInput((current) => convertWeightInputValue(current, unit, nextUnit));
    setUnit(nextUnit);
  };

  const weightKg = parsePositiveWeightInputToKg(weightInput, unit);
  const reps = parsePositiveIntegerInput(repsInput);
  const result =
    weightKg !== null && reps !== null ? calculateE1rmToolkit(weightKg, reps, formula) : null;

  return (
    <ScrollView
      testID="1rm-toolkit-screen"
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
          Estimate strength and plan targets
        </Text>

        <UnitToggle value={unit} onChange={handleUnitChange} testIDPrefix="1rm-unit" />

        <CalculatorNumberInput
          testID="1rm-weight-input"
          label="Weight"
          value={weightInput}
          onChangeText={setWeightInput}
          placeholder={unit === "kg" ? "100" : "225"}
          suffix={getWeightUnitLabel(unit)}
        />

        <CalculatorNumberInput
          testID="1rm-reps-input"
          label="Reps"
          value={repsInput}
          onChangeText={setRepsInput}
          placeholder="5"
        />

        <View style={{ gap: 10 }}>
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
            Formula
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {FORMULA_IDS.map((formulaId) => {
              const isSelected = formula === formulaId;
              return (
                <Pressable
                  key={formulaId}
                  testID={`1rm-formula-${formulaId}`}
                  onPress={() => setFormula(formulaId)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: isSelected ? rawColors.primary : rawColors.border,
                    backgroundColor: isSelected ? rawColors.primaryLight : rawColors.surfaceSecondary,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text
                    selectable
                    style={{
                      color: isSelected ? rawColors.primary : rawColors.foregroundSecondary,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {E1RM_FORMULA_LABELS[formulaId]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <CalculatorNote title="Local calculator state">
        Formula and unit changes here do not update your global app settings.
      </CalculatorNote>

      {result ? (
        <>
          <CalculatorResultCard
            testID="1rm-estimated-result"
            title="Estimated 1RM"
            value={formatWeightFromKg(result.estimated1RMKg, unit)}
            subtitle={`${E1RM_FORMULA_LABELS[formula]} projection`}
          />

          <View
            style={{
              borderRadius: 24,
              padding: 18,
              backgroundColor: rawColors.surface,
              borderWidth: 1,
              borderColor: rawColors.borderLight,
              boxShadow: `0 16px 28px ${rawColors.shadow}10`,
              gap: 12,
            }}
          >
            <Text
              selectable
              style={{
                color: rawColors.foreground,
                fontSize: 18,
                fontWeight: "700",
              }}
            >
              Projected rep maxes
            </Text>
            {result.repMaxes.map((entry) => (
              <View
                key={entry.targetReps}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 6,
                }}
              >
                <Text selectable style={{ color: rawColors.foregroundSecondary, fontSize: 15 }}>
                  {entry.targetReps} {entry.targetReps === 1 ? "rep" : "reps"}
                </Text>
                <Text
                  selectable
                  style={{
                    color: rawColors.foreground,
                    fontSize: 15,
                    fontWeight: "700",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formatWeightFromKg(entry.projectedWeightKg, unit)}
                </Text>
              </View>
            ))}
          </View>

          <View
            style={{
              borderRadius: 24,
              padding: 18,
              backgroundColor: rawColors.surface,
              borderWidth: 1,
              borderColor: rawColors.borderLight,
              boxShadow: `0 16px 28px ${rawColors.shadow}10`,
              gap: 12,
            }}
          >
            <Text
              selectable
              style={{
                color: rawColors.foreground,
                fontSize: 18,
                fontWeight: "700",
              }}
            >
              Percentage table
            </Text>
            {result.percentages.map((entry) => (
              <View
                key={entry.percentage}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 6,
                }}
              >
                <Text selectable style={{ color: rawColors.foregroundSecondary, fontSize: 15 }}>
                  {entry.percentage}%
                </Text>
                <Text
                  selectable
                  style={{
                    color: rawColors.foreground,
                    fontSize: 15,
                    fontWeight: "700",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formatWeightFromKg(entry.weightKg, unit)}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <CalculatorNote title="Enter a valid set">
          Add a positive weight and rep count to calculate an estimated 1RM, rep projections, and
          percentage targets.
        </CalculatorNote>
      )}
    </ScrollView>
  );
}
