import type { UnitPreference } from "../db/settings";
import { roundTo } from "./input";

export const DEFAULT_BARBELL_BY_UNIT: Record<UnitPreference, number> = {
  kg: 20,
  lb: 45,
};

export const STANDARD_PLATES_BY_UNIT: Record<UnitPreference, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
  lb: [45, 35, 25, 10, 5, 2.5],
};

export type PlateLoadResult = {
  requestedTotal: number;
  achievableTotal: number;
  remainderPerSide: number;
  remainderTotal: number;
  perSide: Array<{
    plateWeight: number;
    count: number;
  }>;
};

export function calculatePlateLoadout(
  targetWeight: number,
  barbellWeight: number,
  unitPreference: UnitPreference
): PlateLoadResult | null {
  if (
    !Number.isFinite(targetWeight) ||
    !Number.isFinite(barbellWeight) ||
    targetWeight <= 0 ||
    barbellWeight <= 0 ||
    targetWeight < barbellWeight
  ) {
    return null;
  }

  let remainingPerSide = (targetWeight - barbellWeight) / 2;
  const perSide: PlateLoadResult["perSide"] = [];

  for (const plateWeight of STANDARD_PLATES_BY_UNIT[unitPreference]) {
    const count = Math.floor((remainingPerSide + 1e-9) / plateWeight);
    if (count <= 0) {
      continue;
    }

    perSide.push({ plateWeight, count });
    remainingPerSide -= count * plateWeight;
  }

  const roundedRemainderPerSide = roundTo(Math.max(remainingPerSide, 0), 4);
  const roundedRemainderTotal = roundTo(roundedRemainderPerSide * 2, 4);

  return {
    requestedTotal: targetWeight,
    achievableTotal: roundTo(targetWeight - roundedRemainderTotal, 4),
    remainderPerSide: roundedRemainderPerSide,
    remainderTotal: roundedRemainderTotal,
    perSide,
  };
}
