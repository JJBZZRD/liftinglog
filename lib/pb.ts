import type { E1RMFormulaId } from "./db";

export function epley(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

export function brzycki(weightKg: number, reps: number): number {
  return weightKg * (36 / (37 - reps));
}

export function oconner(weightKg: number, reps: number): number {
  return weightKg * (1 + 0.025 * reps);
}

export function lombardi(weightKg: number, reps: number): number {
  return weightKg * Math.pow(reps, 0.1);
}

export function mayhew(weightKg: number, reps: number): number {
  return (100 * weightKg) / (52.2 + 41.9 * Math.exp(-0.055 * reps));
}

export function wathan(weightKg: number, reps: number): number {
  return (100 * weightKg) / (48.8 + 53.8 * Math.exp(-0.075 * reps));
}

export const formulaComputeMap: Record<E1RMFormulaId, (w: number, r: number) => number> = {
  epley,
  brzycki,
  oconner,
  lombardi,
  mayhew,
  wathan,
};

export const E1RM_FORMULA_LABELS: Record<E1RMFormulaId, string> = {
  epley: "Epley",
  brzycki: "Brzycki",
  oconner: "O'Conner",
  lombardi: "Lombardi",
  mayhew: "Mayhew",
  wathan: "Wathan",
};

export function computeE1rm(formula: E1RMFormulaId, weightKg: number, reps: number): number {
  const fn = formulaComputeMap[formula] ?? epley;
  return fn(weightKg, reps);
}

export function projectWeightFromE1rm(
  formula: E1RMFormulaId,
  estimated1RMKg: number,
  targetReps: number
): number {
  switch (formula) {
    case "epley":
      return estimated1RMKg / (1 + targetReps / 30);
    case "brzycki":
      return (estimated1RMKg * (37 - targetReps)) / 36;
    case "oconner":
      return estimated1RMKg / (1 + 0.025 * targetReps);
    case "lombardi":
      return estimated1RMKg / Math.pow(targetReps, 0.1);
    case "mayhew":
      return (estimated1RMKg * (52.2 + 41.9 * Math.exp(-0.055 * targetReps))) / 100;
    case "wathan":
      return (estimated1RMKg * (48.8 + 53.8 * Math.exp(-0.075 * targetReps))) / 100;
    default: {
      let low = 0;
      let high = estimated1RMKg * 2;
      for (let step = 0; step < 24; step += 1) {
        const mid = (low + high) / 2;
        const projected = computeE1rm(formula, mid, targetReps);
        if (projected > estimated1RMKg) {
          high = mid;
        } else {
          low = mid;
        }
      }
      return (low + high) / 2;
    }
  }
}

