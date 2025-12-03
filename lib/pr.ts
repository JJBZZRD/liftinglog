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

export function computeE1rm(formula: E1RMFormulaId, weightKg: number, reps: number): number {
  const fn = formulaComputeMap[formula] ?? epley;
  return fn(weightKg, reps);
}


