import type { AthleteSex } from "./types";

const DOTS_COEFFICIENTS = {
  // DOTS coefficients for full power.
  male: {
    a: -0.000001093,
    b: 0.0007391293,
    c: -0.1918759221,
    d: 24.0900756,
    e: -307.75076,
    minBodyweightKg: 40,
    maxBodyweightKg: 210,
  },
  female: {
    a: -0.0000010706,
    b: 0.0005158568,
    c: -0.1126655495,
    d: 13.6175032,
    e: -57.96288,
    minBodyweightKg: 40,
    maxBodyweightKg: 150,
  },
} as const;

const WILKS_COEFFICIENTS = {
  // Wilks 2020 legacy coefficients retained for historical comparison.
  male: {
    a: -0.00000001291,
    b: 0.00000701863,
    c: -0.00113732,
    d: -0.002388645,
    e: 16.2606339,
    f: -216.0475144,
  },
  female: {
    a: -0.00000009054,
    b: 0.00004731582,
    c: -0.00930733913,
    d: 0.82112226871,
    e: -27.23842536447,
    f: 594.31747775582,
  },
} as const;

const GOODLIFT_CLASSIC_COEFFICIENTS = {
  // IPF GL / Goodlift classic full-power coefficients from the IPF 2020 model evaluation.
  male: {
    a: 1199.72839,
    b: 1025.18162,
    c: 0.00921,
  },
  female: {
    a: 610.32796,
    b: 1045.59282,
    c: 0.03048,
  },
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function calculatePowerliftingTotal(
  squatKg: number,
  benchKg: number,
  deadliftKg: number
): number | null {
  if (
    !Number.isFinite(squatKg) ||
    !Number.isFinite(benchKg) ||
    !Number.isFinite(deadliftKg) ||
    squatKg <= 0 ||
    benchKg <= 0 ||
    deadliftKg <= 0
  ) {
    return null;
  }

  return squatKg + benchKg + deadliftKg;
}

export function calculateDots(
  sex: AthleteSex,
  bodyweightKg: number,
  totalKg: number
): number | null {
  if (!Number.isFinite(bodyweightKg) || !Number.isFinite(totalKg) || bodyweightKg <= 0 || totalKg <= 0) {
    return null;
  }

  const coefficients = DOTS_COEFFICIENTS[sex];
  const cappedBodyweightKg = clamp(
    bodyweightKg,
    coefficients.minBodyweightKg,
    coefficients.maxBodyweightKg
  );
  const denominator =
    coefficients.a * cappedBodyweightKg ** 4 +
    coefficients.b * cappedBodyweightKg ** 3 +
    coefficients.c * cappedBodyweightKg ** 2 +
    coefficients.d * cappedBodyweightKg +
    coefficients.e;

  return (totalKg * 500) / denominator;
}

export function calculateWilks(
  sex: AthleteSex,
  bodyweightKg: number,
  totalKg: number
): number | null {
  if (!Number.isFinite(bodyweightKg) || !Number.isFinite(totalKg) || bodyweightKg <= 0 || totalKg <= 0) {
    return null;
  }

  const coefficients = WILKS_COEFFICIENTS[sex];
  const denominator =
    coefficients.a * bodyweightKg ** 5 +
    coefficients.b * bodyweightKg ** 4 +
    coefficients.c * bodyweightKg ** 3 +
    coefficients.d * bodyweightKg ** 2 +
    coefficients.e * bodyweightKg +
    coefficients.f;

  return (totalKg * 500) / denominator;
}

export function calculateGoodlift(
  sex: AthleteSex,
  bodyweightKg: number,
  totalKg: number
): number | null {
  if (!Number.isFinite(bodyweightKg) || !Number.isFinite(totalKg) || bodyweightKg <= 0 || totalKg <= 0) {
    return null;
  }

  const coefficients = GOODLIFT_CLASSIC_COEFFICIENTS[sex];
  return totalKg * (100 / (coefficients.a - coefficients.b * Math.exp(-coefficients.c * bodyweightKg)));
}

export function getDotsBodyweightRange(sex: AthleteSex): {
  minBodyweightKg: number;
  maxBodyweightKg: number;
} {
  const coefficients = DOTS_COEFFICIENTS[sex];
  return {
    minBodyweightKg: coefficients.minBodyweightKg,
    maxBodyweightKg: coefficients.maxBodyweightKg,
  };
}
