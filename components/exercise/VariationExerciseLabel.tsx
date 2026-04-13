import { Text, type StyleProp, type TextStyle } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";
import { getVariationDisplayParts, type VariationExerciseLike } from "../../lib/utils/exerciseVariations";

type VariationExerciseLabelProps = {
  exercise: VariationExerciseLike;
  style?: StyleProp<TextStyle>;
  suffixStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export default function VariationExerciseLabel({
  exercise,
  style,
  suffixStyle,
  numberOfLines,
}: VariationExerciseLabelProps) {
  const { rawColors } = useTheme();
  const { baseName, variationSuffix } = getVariationDisplayParts(exercise);

  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: rawColors.foreground }, style]}
    >
      {baseName}
      {variationSuffix ? (
        <Text style={[{ color: rawColors.foregroundSecondary }, suffixStyle]}>
          {` ${variationSuffix}`}
        </Text>
      ) : null}
    </Text>
  );
}
