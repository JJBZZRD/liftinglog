import type { E1RMFormulaId } from "../db/settings";
import { computeE1rm, projectWeightFromE1rm } from "../pb";
import { roundTo } from "./input";

export const E1RM_TARGET_REPS = Array.from({ length: 12 }, (_, index) => index + 1);
export const E1RM_PERCENTAGES = Array.from({ length: 9 }, (_, index) => 60 + index * 5);

export type E1rmToolkitResult = {
  estimated1RMKg: number;
  repMaxes: Array<{
    targetReps: number;
    projectedWeightKg: number;
  }>;
  percentages: Array<{
    percentage: number;
    weightKg: number;
  }>;
};

export function calculateE1rmToolkit(
  weightKg: number,
  reps: number,
  formula: E1RMFormulaId
): E1rmToolkitResult | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps) || weightKg <= 0 || reps <= 0) {
    return null;
  }

  const estimated1RMKg = computeE1rm(formula, weightKg, reps);

  return {
    estimated1RMKg,
    repMaxes: E1RM_TARGET_REPS.map((targetReps) => ({
      targetReps,
      projectedWeightKg: roundTo(
        targetReps === 1
          ? estimated1RMKg
          : projectWeightFromE1rm(formula, estimated1RMKg, targetReps),
        4
      ),
    })),
    percentages: E1RM_PERCENTAGES.map((percentage) => ({
      percentage,
      weightKg: roundTo(estimated1RMKg * (percentage / 100), 4),
    })),
  };
}
