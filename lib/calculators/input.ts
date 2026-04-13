import type { UnitPreference } from "../db/settings";
import {
  formatEditableWeightFromKg,
  parseWeightInputToKg,
} from "../utils/units";

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function formatDecimal(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

export function parsePositiveIntegerInput(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function parsePositiveDisplayNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function parsePositiveWeightInputToKg(
  value: string,
  unitPreference: UnitPreference
): number | null {
  const parsed = parseWeightInputToKg(value, unitPreference);
  if (parsed === null || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function convertWeightInputValue(
  value: string,
  fromUnit: UnitPreference,
  toUnit: UnitPreference,
  maximumFractionDigits = 2
): string {
  if (fromUnit === toUnit || value.trim().length === 0) {
    return value;
  }

  const parsedKg = parseWeightInputToKg(value, fromUnit);
  if (parsedKg === null) {
    return value;
  }

  return formatEditableWeightFromKg(parsedKg, toUnit, maximumFractionDigits);
}
