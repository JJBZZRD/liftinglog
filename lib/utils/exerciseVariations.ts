export type VariationExerciseLike = {
  name: string;
  parentExerciseId?: number | null;
  variationLabel?: string | null;
  parentName?: string | null;
};

export function normalizeVariationLabel(label: string): string {
  const trimmed = label.trim();
  const unwrapped = trimmed.replace(/^\((.*)\)$/, "$1").trim();
  return unwrapped.replace(/\s+/g, " ");
}

export function buildVariationExerciseName(
  parentExerciseName: string,
  variationLabel: string
): string {
  return `${parentExerciseName} (${normalizeVariationLabel(variationLabel)})`;
}

export function isVariationExercise(
  exercise: Pick<VariationExerciseLike, "parentExerciseId">
): boolean {
  return exercise.parentExerciseId !== null && exercise.parentExerciseId !== undefined;
}

export function getVariationDisplayParts(exercise: VariationExerciseLike): {
  baseName: string;
  variationSuffix: string | null;
  fullName: string;
} {
  if (!isVariationExercise(exercise) || !exercise.variationLabel?.trim()) {
    return {
      baseName: exercise.parentName?.trim() || exercise.name,
      variationSuffix: null,
      fullName: exercise.name,
    };
  }

  const normalizedLabel = normalizeVariationLabel(exercise.variationLabel);
  const inferredBaseName = exercise.name.endsWith(` (${normalizedLabel})`)
    ? exercise.name.slice(0, -(` (${normalizedLabel})`.length)).trim()
    : exercise.name;
  const baseName = exercise.parentName?.trim() || inferredBaseName;
  const variationSuffix = `(${normalizedLabel})`;

  return {
    baseName,
    variationSuffix,
    fullName: `${baseName} ${variationSuffix}`,
  };
}

export function formatVariationCountLabel(count: number): string {
  return `${count} Variation${count === 1 ? "" : "s"}`;
}

export function formatExerciseLibraryTitle(name: string, variationCount: number): string {
  if (variationCount <= 0) {
    return name;
  }

  return `${name} (${formatVariationCountLabel(variationCount)})`;
}
