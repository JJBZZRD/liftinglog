import type { AthleteSex } from "./types";

const SINCLAIR_COEFFICIENTS = {
  // Sinclair coefficients for the 2025-2028 Olympic cycle.
  male: {
    a: 0.700767819,
    b: 201.159,
  },
  female: {
    a: 0.674107991,
    b: 163.918,
  },
} as const;

export function calculateSinclairCoefficient(
  sex: AthleteSex,
  bodyweightKg: number
): number | null {
  if (!Number.isFinite(bodyweightKg) || bodyweightKg <= 0) {
    return null;
  }

  const { a, b } = SINCLAIR_COEFFICIENTS[sex];
  if (bodyweightKg >= b) {
    return 1;
  }

  return 10 ** (a * Math.log10(bodyweightKg / b) ** 2);
}

export function calculateSinclair(
  sex: AthleteSex,
  bodyweightKg: number,
  snatchKg: number,
  cleanAndJerkKg: number
): { totalKg: number; coefficient: number; score: number } | null {
  if (
    !Number.isFinite(bodyweightKg) ||
    !Number.isFinite(snatchKg) ||
    !Number.isFinite(cleanAndJerkKg) ||
    bodyweightKg <= 0 ||
    snatchKg <= 0 ||
    cleanAndJerkKg <= 0
  ) {
    return null;
  }

  const totalKg = snatchKg + cleanAndJerkKg;
  const coefficient = calculateSinclairCoefficient(sex, bodyweightKg);
  if (coefficient === null) {
    return null;
  }

  return {
    totalKg,
    coefficient,
    score: totalKg * coefficient,
  };
}
