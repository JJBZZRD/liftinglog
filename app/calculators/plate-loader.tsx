import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import CalculatorNote from "../../components/calculators/CalculatorNote";
import CalculatorNumberInput from "../../components/calculators/CalculatorNumberInput";
import CalculatorResultCard from "../../components/calculators/CalculatorResultCard";
import UnitToggle from "../../components/calculators/UnitToggle";
import {
  convertWeightInputValue,
  formatDecimal,
  parsePositiveDisplayNumber,
} from "../../lib/calculators/input";
import {
  calculatePlateLoadout,
  DEFAULT_BARBELL_BY_UNIT,
} from "../../lib/calculators/plate-loading";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { useTheme } from "../../lib/theme/ThemeContext";
import { getWeightUnitLabel } from "../../lib/utils/units";

export default function PlateLoaderScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const [unit, setUnit] = useState(unitPreference);
  const [targetInput, setTargetInput] = useState("");
  const [barInput, setBarInput] = useState(String(DEFAULT_BARBELL_BY_UNIT[unitPreference]));

  const handleUnitChange = (nextUnit: "kg" | "lb") => {
    const currentDefault = DEFAULT_BARBELL_BY_UNIT[unit];
    const nextDefault = DEFAULT_BARBELL_BY_UNIT[nextUnit];

    setTargetInput((current) => convertWeightInputValue(current, unit, nextUnit));
    setBarInput((current) => {
      const parsed = parsePositiveDisplayNumber(current);
      if (parsed !== null && Math.abs(parsed - currentDefault) < 0.0001) {
        return String(nextDefault);
      }
      return convertWeightInputValue(current, unit, nextUnit);
    });
    setUnit(nextUnit);
  };

  const targetWeight = parsePositiveDisplayNumber(targetInput);
  const barWeight = parsePositiveDisplayNumber(barInput);
  const result =
    targetWeight !== null && barWeight !== null
      ? calculatePlateLoadout(targetWeight, barWeight, unit)
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
          Load the bar by plate
        </Text>

        <UnitToggle value={unit} onChange={handleUnitChange} testIDPrefix="plate-loader-unit" />

        <CalculatorNumberInput
          label="Target weight"
          value={targetInput}
          onChangeText={setTargetInput}
          placeholder={unit === "kg" ? "180" : "405"}
          suffix={getWeightUnitLabel(unit)}
        />

        <CalculatorNumberInput
          label="Bar weight"
          value={barInput}
          onChangeText={setBarInput}
          placeholder={String(DEFAULT_BARBELL_BY_UNIT[unit])}
          suffix={getWeightUnitLabel(unit)}
          helperText={`Defaults to ${DEFAULT_BARBELL_BY_UNIT[unit]} ${getWeightUnitLabel(unit)} in ${unit.toUpperCase()} mode.`}
        />
      </View>

      <CalculatorNote title="Standard plate set">
        Uses common gym denominations only and shows any unmatched remainder if the exact target
        cannot be built.
      </CalculatorNote>

      {result ? (
        <View style={{ gap: 12 }}>
          <CalculatorResultCard
            title="Achievable total"
            value={`${formatDecimal(result.achievableTotal, 2)} ${getWeightUnitLabel(unit)}`}
            subtitle={
              result.remainderTotal > 0
                ? `Leaves ${formatDecimal(result.remainderTotal, 2)} ${getWeightUnitLabel(unit)} unmatched`
                : "Exact match with the selected plates"
            }
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
              Per side
            </Text>

            {result.perSide.length > 0 ? (
              result.perSide.map((plate) => (
                <View
                  key={plate.plateWeight}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 6,
                  }}
                >
                  <Text selectable style={{ color: rawColors.foregroundSecondary, fontSize: 15 }}>
                    {formatDecimal(plate.plateWeight, 2)} {getWeightUnitLabel(unit)}
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
                    x{plate.count}
                  </Text>
                </View>
              ))
            ) : (
              <CalculatorNote title="No plates needed">
                The bar alone already matches the target weight.
              </CalculatorNote>
            )}
          </View>
        </View>
      ) : (
        <CalculatorNote title="Enter a valid setup">
          Add a target and bar weight. The target must be at least as heavy as the bar.
        </CalculatorNote>
      )}
    </ScrollView>
  );
}
