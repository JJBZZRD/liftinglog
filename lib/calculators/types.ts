export type AthleteSex = "male" | "female";

export type CalculatorCategoryId =
  | "strength"
  | "powerlifting"
  | "weightlifting"
  | "utility";

export type CalculatorHref =
  | "/calculators/1rm-toolkit"
  | "/calculators/powerlifting-total"
  | "/calculators/power-score"
  | "/calculators/sinclair"
  | "/calculators/plate-loader";

export type CalculatorDefinition = {
  id: string;
  title: string;
  description: string;
  category: CalculatorCategoryId;
  href: CalculatorHref;
  icon: string;
  previewChips?: string[];
};
