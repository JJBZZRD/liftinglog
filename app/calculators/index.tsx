import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import CalculatorListCard from "../../components/calculators/CalculatorListCard";
import {
  CALCULATORS,
  CALCULATOR_CATEGORY_META,
  CALCULATOR_CATEGORY_ORDER,
} from "../../lib/calculators/catalog";
import { useTheme } from "../../lib/theme/ThemeContext";

export default function CalculatorsScreen() {
  const { rawColors } = useTheme();

  return (
    <ScrollView
      testID="calculators-screen"
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 120,
        gap: 18,
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
          gap: 8,
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
          Offline lifting calculators
        </Text>
        <Text
          selectable
          style={{
            color: rawColors.foregroundSecondary,
            fontSize: 15,
            lineHeight: 22,
          }}
        >
          Quick tools for estimating strength, comparing totals, and loading the bar without relying
          on any API or external dataset.
        </Text>
      </View>

      {CALCULATOR_CATEGORY_ORDER.map((categoryId) => {
        const category = CALCULATOR_CATEGORY_META[categoryId];
        const calculators = CALCULATORS.filter((item) => item.category === categoryId);

        return (
          <View
            key={categoryId}
            testID={`calculator-category-${categoryId}`}
            style={{ gap: 12 }}
          >
            <View style={{ gap: 4 }}>
              <Text
                selectable
                style={{
                  color: rawColors.foreground,
                  fontSize: 20,
                  fontWeight: "800",
                }}
              >
                {category.title}
              </Text>
              <Text
                selectable
                style={{
                  color: rawColors.foregroundSecondary,
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {category.description}
              </Text>
            </View>

            {calculators.map((calculator) => (
              <CalculatorListCard
                key={calculator.id}
                testID={`calculator-card-${calculator.id}`}
                title={calculator.title}
                description={calculator.description}
                icon={calculator.icon}
                previewChips={calculator.previewChips}
                onPress={() => router.push(calculator.href)}
              />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}
