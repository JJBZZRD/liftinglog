import type { CalculatorCategoryId, CalculatorDefinition } from "./types";

export const CALCULATOR_CATEGORY_META: Record<
  CalculatorCategoryId,
  { title: string; description: string }
> = {
  strength: {
    title: "Strength",
    description: "One-rep max projections and percentage targets.",
  },
  powerlifting: {
    title: "Powerlifting",
    description: "Totals and bodyweight-adjusted scoring for full power.",
  },
  weightlifting: {
    title: "Weightlifting",
    description: "Olympic lifting score comparisons using Sinclair.",
  },
  utility: {
    title: "Utility",
    description: "Practical tools for loading the bar and planning attempts.",
  },
};

export const CALCULATOR_CATEGORY_ORDER: CalculatorCategoryId[] = [
  "strength",
  "powerlifting",
  "weightlifting",
  "utility",
];

export const CALCULATORS: CalculatorDefinition[] = [
  {
    id: "1rm-toolkit",
    title: "1RM Toolkit",
    description: "Estimate 1RM, projected rep maxes, and percentage targets.",
    category: "strength",
    href: "/calculators/1rm-toolkit",
    icon: "chart-line-variant",
    previewChips: ["1RM", "Reps 1-12", "60-100%"],
  },
  {
    id: "powerlifting-total",
    title: "Powerlifting Total",
    description: "Add squat, bench, and deadlift into a full-power total.",
    category: "powerlifting",
    href: "/calculators/powerlifting-total",
    icon: "trophy-outline",
    previewChips: ["Squat", "Bench", "Deadlift"],
  },
  {
    id: "power-score",
    title: "Power Score",
    description: "Compare a total using DOTS, IPF GL, and Wilks Legacy.",
    category: "powerlifting",
    href: "/calculators/power-score",
    icon: "scale-balance",
    previewChips: ["DOTS", "GL", "Legacy"],
  },
  {
    id: "sinclair",
    title: "Sinclair",
    description: "Compare Olympic lifting totals across bodyweights.",
    category: "weightlifting",
    href: "/calculators/sinclair",
    icon: "medal-outline",
    previewChips: ["Snatch", "C&J", "Sinclair"],
  },
  {
    id: "plate-loader",
    title: "Plate Loader",
    description: "Break a target weight into a plate-by-plate bar setup.",
    category: "utility",
    href: "/calculators/plate-loader",
    icon: "barbell",
    previewChips: ["Per side", "Remainder"],
  },
];
