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

  const cardShadowStyle = {
    shadowColor: rawColors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  } as const;

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
      <View className="gap-2 rounded-2xl bg-surface p-5" style={cardShadowStyle}>
        <Text className="text-2xl font-extrabold leading-[30px] text-foreground" selectable>
          Offline lifting calculators
        </Text>
        <Text className="text-[15px] leading-[22px] text-foreground-secondary" selectable>
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
