import type { UnitPreference } from "../db/connection";

const KG_TO_LB = 2.2046226218487757;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

export function getWeightUnitLabel(unit: UnitPreference): "kg" | "lb" {
  return unit === "lb" ? "lb" : "kg";
}

export function convertWeightFromKg(weightKg: number, unit: UnitPreference): number {
  if (unit === "lb") {
    return weightKg * KG_TO_LB;
  }
  return weightKg;
}

export function convertWeightToKg(weightValue: number, unit: UnitPreference): number {
  if (unit === "lb") {
    return weightValue / KG_TO_LB;
  }
  return weightValue;
}

export function toDisplayWeight(
  weightKg: number | null | undefined,
  unit: UnitPreference,
  maximumFractionDigits = 1
): number | null {
  if (weightKg === null || weightKg === undefined || Number.isNaN(weightKg)) {
    return null;
  }
  const converted = convertWeightFromKg(weightKg, unit);
  return roundTo(converted, maximumFractionDigits);
}

export function toDisplayVolumeFromKg(
  volumeKg: number | null | undefined,
  unit: UnitPreference,
  maximumFractionDigits = 0
): number | null {
  if (volumeKg === null || volumeKg === undefined || Number.isNaN(volumeKg)) {
    return null;
  }
  const converted = convertWeightFromKg(volumeKg, unit);
  return roundTo(converted, maximumFractionDigits);
}

type FormatWeightOptions = {
  withUnit?: boolean;
  placeholder?: string;
  maximumFractionDigits?: number;
};

export function formatWeightFromKg(
  weightKg: number | null | undefined,
  unit: UnitPreference,
  options: FormatWeightOptions = {}
): string {
  const { withUnit = true, placeholder = "--", maximumFractionDigits = 1 } = options;
  const displayWeight = toDisplayWeight(weightKg, unit, maximumFractionDigits);
  if (displayWeight === null) {
    return placeholder;
  }
  const formatted = formatNumber(displayWeight, maximumFractionDigits);
  return withUnit ? `${formatted} ${getWeightUnitLabel(unit)}` : formatted;
}

type FormatVolumeOptions = {
  abbreviate?: boolean;
  withUnit?: boolean;
  placeholder?: string;
  maximumFractionDigits?: number;
};

export function formatVolumeFromKg(
  volumeKg: number | null | undefined,
  unit: UnitPreference,
  options: FormatVolumeOptions = {}
): string {
  const {
    abbreviate = false,
    withUnit = false,
    placeholder = "--",
    maximumFractionDigits = 0,
  } = options;

  const displayVolume = toDisplayVolumeFromKg(volumeKg, unit, maximumFractionDigits);
  if (displayVolume === null) {
    return placeholder;
  }

  let formattedValue: string;
  if (abbreviate && Math.abs(displayVolume) >= 1000) {
    formattedValue = `${roundTo(displayVolume / 1000, 1)}k`;
  } else {
    formattedValue = formatNumber(displayVolume, maximumFractionDigits);
  }

  return withUnit ? `${formattedValue} ${getWeightUnitLabel(unit)}` : formattedValue;
}

export function formatEditableWeightFromKg(
  weightKg: number | null | undefined,
  unit: UnitPreference,
  maximumFractionDigits = 1
): string {
  const displayWeight = toDisplayWeight(weightKg, unit, maximumFractionDigits);
  if (displayWeight === null) {
    return "";
  }
  return trimTrailingZeros(displayWeight.toFixed(maximumFractionDigits));
}

export function parseWeightInputToKg(value: string, unit: UnitPreference): number | null {
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return roundTo(convertWeightToKg(parsed, unit), 4);
}
