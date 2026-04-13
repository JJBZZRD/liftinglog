import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  computeEndDateIso,
  DEFAULT_ACTIVATION_WEEKS,
  getDefaultActivationStartDateIso,
} from "../programs/psl/activationDates";
import { introspectPslSource } from "../programs/psl/pslIntrospection";
import { refreshUpcomingCalendarForPrograms } from "../programs/psl/programRuntime";
import { compilePslSource } from "../programs/psl/pslService";
import {
  buildVariationExerciseName,
  isVariationExercise,
  normalizeVariationLabel,
} from "../utils/exerciseVariations";
import { newUid } from "../utils/uid";
import { db } from "./connection";
import { rebuildPBEventsForExercise } from "./pbEvents";
import {
  clearLinkedProgramExercisesByWorkoutExerciseIds,
  clearLinkedProgramSetsByWorkoutSetIds,
  getProgramIdsForWorkoutExerciseIds,
  getProgramIdsForWorkoutSetIds,
  rewriteCalendarExerciseReferences,
} from "./programCalendar";
import {
  exerciseFormulaOverrides,
  exercises,
  pbEvents,
  pslPrograms,
  sets,
  type ExerciseRow,
  type PslProgramRow,
  workoutExercises,
} from "./schema";

export type Exercise = ExerciseRow;

export type ExerciseFamilyScope = {
  target: Exercise;
  parent: Exercise;
  variations: Exercise[];
  family: Exercise[];
  familyIds: number[];
  isVariation: boolean;
};

export type ExerciseLibraryGroup = {
  exercise: Exercise;
  variations: Exercise[];
  familyLastPerformedAt: number | null;
};

export type ExerciseWithParent = Exercise & {
  parentName: string | null;
  isVariation: boolean;
};

export type VariationDeleteMode = "keep_data" | "delete_data";

type PercentIntensityConfigEntry = {
  key: string;
  exerciseName: string;
  sourceExerciseId: number | null;
  sourceExerciseName: string | null;
  mode: "history_e1rm" | "history_single" | "custom";
  baselineKg: number;
};

type PercentIntensityConfigEnvelope = {
  version: 1;
  entries: PercentIntensityConfigEntry[];
};

type RewriteProgramReferencesParams = {
  fromExerciseId: number | null;
  fromExerciseName: string;
  toExerciseId: number | null;
  toExerciseName: string;
};

function assertNonEmptyName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Name is required.");
  }
  return trimmed;
}

function parseYamlScalarString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function rewriteExerciseReferencesInPslSource(
  source: string,
  fromExerciseName: string,
  toExerciseName: string
): string {
  let changed = false;
  const nextLines = source.split(/\r?\n/).map((line) => {
    const match = line.match(/^(\s*-\s*exercise:\s*)(.+?)(\s*(?:#.*)?)$/);
    if (!match) {
      return line;
    }

    const rawValue = match[2]?.trim() ?? "";
    if (parseYamlScalarString(rawValue) !== fromExerciseName) {
      return line;
    }

    changed = true;
    return `${match[1]}${JSON.stringify(toExerciseName)}${match[3] ?? ""}`;
  });

  return changed ? `${nextLines.join("\n")}${source.endsWith("\n") ? "\n" : ""}` : source;
}

function parsePercentIntensityConfig(
  value: string | null | undefined
): PercentIntensityConfigEntry[] {
  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as Partial<PercentIntensityConfigEnvelope>;
    if (!Array.isArray(parsed.entries)) {
      return [];
    }

    return parsed.entries.filter(
      (entry): entry is PercentIntensityConfigEntry =>
        typeof entry?.key === "string" &&
        entry.key.trim() !== "" &&
        typeof entry.exerciseName === "string" &&
        entry.exerciseName.trim() !== "" &&
        (entry.mode === "history_e1rm" ||
          entry.mode === "history_single" ||
          entry.mode === "custom") &&
        typeof entry.baselineKg === "number" &&
        Number.isFinite(entry.baselineKg) &&
        entry.baselineKg > 0 &&
        (entry.sourceExerciseId === null ||
          typeof entry.sourceExerciseId === "number") &&
        (entry.sourceExerciseName === null ||
          typeof entry.sourceExerciseName === "string")
    );
  } catch {
    return [];
  }
}

function serializePercentIntensityConfig(
  entries: PercentIntensityConfigEntry[]
): string | null {
  if (entries.length === 0) {
    return null;
  }

  return JSON.stringify({
    version: 1,
    entries,
  } satisfies PercentIntensityConfigEnvelope);
}

function rewritePercentIntensityConfigJson(
  value: string | null | undefined,
  params: RewriteProgramReferencesParams
): string | null {
  const entries = parsePercentIntensityConfig(value);
  if (entries.length === 0) {
    return value ?? null;
  }

  let changed = false;
  const nextEntries = entries.map((entry) => {
    let nextEntry = entry;

    if (entry.exerciseName === params.fromExerciseName) {
      nextEntry = {
        ...nextEntry,
        exerciseName: params.toExerciseName,
        key: entry.key === params.fromExerciseName ? params.toExerciseName : entry.key,
      };
      changed = true;
    }

    if (entry.sourceExerciseName === params.fromExerciseName) {
      nextEntry = {
        ...nextEntry,
        sourceExerciseName: params.toExerciseName,
      };
      changed = true;
    }

    if (
      params.fromExerciseId !== null &&
      entry.sourceExerciseId === params.fromExerciseId &&
      entry.sourceExerciseId !== params.toExerciseId
    ) {
      nextEntry = {
        ...nextEntry,
        sourceExerciseId: params.toExerciseId,
      };
      changed = true;
    }

    return nextEntry;
  });

  return changed ? serializePercentIntensityConfig(nextEntries) : value ?? null;
}

function buildProgramValidationOverride(program: Pick<PslProgramRow, "startDate" | "endDate">, source: string) {
  const startDate = program.startDate ?? getDefaultActivationStartDateIso();
  const introspection = introspectPslSource(source);

  return {
    start_date: startDate,
    ...(program.endDate
      ? { end_date: program.endDate }
      : introspection.ok && introspection.requiresEndDateForActivation
        ? { end_date: computeEndDateIso(startDate, DEFAULT_ACTIVATION_WEEKS) }
        : {}),
  };
}

async function rewriteStoredProgramReferences(
  params: RewriteProgramReferencesParams
): Promise<number[]> {
  if (params.fromExerciseName === params.toExerciseName && params.fromExerciseId === params.toExerciseId) {
    return [];
  }

  const programs = await db.select().from(pslPrograms);
  const affectedActiveProgramIds: number[] = [];

  for (const program of programs) {
    const nextSource = rewriteExerciseReferencesInPslSource(
      program.pslSource,
      params.fromExerciseName,
      params.toExerciseName
    );
    const nextPercentIntensityConfigJson = rewritePercentIntensityConfigJson(
      program.percentIntensityConfigJson,
      params
    );

    const sourceChanged = nextSource !== program.pslSource;
    const configChanged = nextPercentIntensityConfigJson !== (program.percentIntensityConfigJson ?? null);
    if (!sourceChanged && !configChanged) {
      continue;
    }

    let compiledHash = program.compiledHash ?? null;
    if (sourceChanged) {
      const compileResult = compilePslSource(nextSource, {
        calendarOverride: buildProgramValidationOverride(program, nextSource),
      });

      if (!compileResult.valid) {
        const errors = compileResult.diagnostics
          .filter((diagnostic) => diagnostic.severity === "error")
          .map((diagnostic) => diagnostic.message)
          .join("\n");
        throw new Error(errors || "Program source could not be rewritten safely.");
      }

      compiledHash = compileResult.compiled?.source_hash ?? null;
    }

    await db
      .update(pslPrograms)
      .set({
        pslSource: nextSource,
        percentIntensityConfigJson: nextPercentIntensityConfigJson,
        compiledHash,
        updatedAt: Date.now(),
      })
      .where(eq(pslPrograms.id, program.id))
      .run();

    if (program.isActive) {
      affectedActiveProgramIds.push(program.id);
    }
  }

  return [...new Set(affectedActiveProgramIds)];
}

async function deleteExerciseHistoryAndRow(exerciseId: number): Promise<void> {
  const linkedSetRows = await db
    .select({ id: sets.id })
    .from(sets)
    .where(eq(sets.exerciseId, exerciseId));
  const linkedSetIds = linkedSetRows.map((row) => row.id);
  const linkedWorkoutExerciseRows = await db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(eq(workoutExercises.exerciseId, exerciseId));
  const linkedWorkoutExerciseIds = linkedWorkoutExerciseRows.map((row) => row.id);
  const affectedProgramIds = [
    ...(await getProgramIdsForWorkoutSetIds(linkedSetIds)),
    ...(await getProgramIdsForWorkoutExerciseIds(linkedWorkoutExerciseIds)),
  ];

  await clearLinkedProgramSetsByWorkoutSetIds(linkedSetIds);
  await clearLinkedProgramExercisesByWorkoutExerciseIds(linkedWorkoutExerciseIds);

  await db.delete(sets).where(eq(sets.exerciseId, exerciseId)).run();
  await db.delete(workoutExercises).where(eq(workoutExercises.exerciseId, exerciseId)).run();
  await db.delete(pbEvents).where(eq(pbEvents.exerciseId, exerciseId)).run();
  await db.delete(exerciseFormulaOverrides).where(eq(exerciseFormulaOverrides.exerciseId, exerciseId)).run();
  await db.delete(exercises).where(eq(exercises.id, exerciseId)).run();
  await refreshUpcomingCalendarForPrograms(affectedProgramIds);
}

async function getSiblingVariations(parentExerciseId: number): Promise<Exercise[]> {
  return db
    .select()
    .from(exercises)
    .where(eq(exercises.parentExerciseId, parentExerciseId))
    .orderBy(asc(exercises.variationLabel), asc(exercises.name));
}

async function resolveParentExercise(exercise: Exercise): Promise<Exercise> {
  if (!isVariationExercise(exercise)) {
    return exercise;
  }

  const parent = await getExerciseById(exercise.parentExerciseId!);
  if (!parent) {
    throw new Error("Variation parent exercise no longer exists.");
  }

  return parent;
}

async function moveVariationFormulaOverrideToParent(
  variationExerciseId: number,
  parentExerciseId: number
): Promise<void> {
  const variationOverride = await db
    .select()
    .from(exerciseFormulaOverrides)
    .where(eq(exerciseFormulaOverrides.exerciseId, variationExerciseId))
    .limit(1);

  if (!variationOverride[0]) {
    return;
  }

  const parentOverride = await db
    .select()
    .from(exerciseFormulaOverrides)
    .where(eq(exerciseFormulaOverrides.exerciseId, parentExerciseId))
    .limit(1);

  if (parentOverride[0]) {
    await db
      .delete(exerciseFormulaOverrides)
      .where(eq(exerciseFormulaOverrides.exerciseId, variationExerciseId))
      .run();
    return;
  }

  await db
    .update(exerciseFormulaOverrides)
    .set({ exerciseId: parentExerciseId })
    .where(eq(exerciseFormulaOverrides.exerciseId, variationExerciseId))
    .run();
}

async function assertVariationLabelAvailable(
  parentExercise: Exercise,
  variationLabel: string,
  excludeExerciseId?: number
): Promise<void> {
  const normalizedLabel = normalizeVariationLabel(variationLabel);
  const nextName = buildVariationExerciseName(parentExercise.name, normalizedLabel);

  const existingName = await getExerciseByName(nextName);
  if (existingName && existingName.id !== excludeExerciseId) {
    throw new Error("An exercise with this variation name already exists.");
  }

  const siblings = await getSiblingVariations(parentExercise.id);
  const duplicateSibling = siblings.find(
    (variation) =>
      variation.id !== excludeExerciseId &&
      (variation.variationLabel ?? "").trim().toLowerCase() === normalizedLabel.toLowerCase()
  );

  if (duplicateSibling) {
    throw new Error("A variation with this label already exists for the selected exercise.");
  }
}

export async function createExercise(data: {
  name: string;
  description?: string | null;
  muscle_group?: string | null;
  equipment?: string | null;
  is_bodyweight?: boolean;
}): Promise<number> {
  const name = assertNonEmptyName(data.name);
  const res = await db
    .insert(exercises)
    .values({
      uid: newUid(),
      name,
      parentExerciseId: null,
      variationLabel: null,
      description: data.description ?? null,
      muscleGroup: data.muscle_group ?? null,
      equipment: data.equipment ?? null,
      isBodyweight: !!data.is_bodyweight,
      createdAt: Date.now(),
    })
    .run();
  return (res.lastInsertRowId as number) ?? 0;
}

export async function createExerciseVariation(
  parentExerciseId: number,
  variationLabel: string
): Promise<number> {
  const parentExercise = await getExerciseById(parentExerciseId);
  if (!parentExercise) {
    throw new Error("Parent exercise not found.");
  }
  if (isVariationExercise(parentExercise)) {
    throw new Error("Nested variations are not supported.");
  }

  const normalizedLabel = normalizeVariationLabel(variationLabel);
  if (!normalizedLabel) {
    throw new Error("Variation label is required.");
  }

  await assertVariationLabelAvailable(parentExercise, normalizedLabel);

  const res = await db
    .insert(exercises)
    .values({
      uid: newUid(),
      name: buildVariationExerciseName(parentExercise.name, normalizedLabel),
      parentExerciseId: parentExercise.id,
      variationLabel: normalizedLabel,
      description: parentExercise.description ?? null,
      muscleGroup: parentExercise.muscleGroup ?? null,
      equipment: parentExercise.equipment ?? null,
      isBodyweight: parentExercise.isBodyweight,
      createdAt: Date.now(),
      lastRestSeconds: parentExercise.lastRestSeconds ?? null,
      isPinned: false,
    })
    .run();

  return (res.lastInsertRowId as number) ?? 0;
}

export async function getExerciseById(id: number): Promise<Exercise | null> {
  const rows = await db.select().from(exercises).where(eq(exercises.id, id));
  return rows[0] ?? null;
}

export async function getExerciseWithParentById(id: number): Promise<ExerciseWithParent | null> {
  const exercise = await getExerciseById(id);
  if (!exercise) {
    return null;
  }

  if (!isVariationExercise(exercise)) {
    return {
      ...exercise,
      parentName: null,
      isVariation: false,
    };
  }

  const parent = await getExerciseById(exercise.parentExerciseId!);
  return {
    ...exercise,
    parentName: parent?.name ?? null,
    isVariation: true,
  };
}

export async function getExerciseByName(name: string): Promise<Exercise | null> {
  const rows = await db.select().from(exercises).where(eq(exercises.name, name));
  return rows[0] ?? null;
}

export async function listExercises(): Promise<Exercise[]> {
  return db.select().from(exercises).orderBy(exercises.name);
}

export async function listExercisesByNames(names: string[]): Promise<Exercise[]> {
  const normalizedNames = [...new Set(
    names
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
  )];

  if (normalizedNames.length === 0) {
    return [];
  }

  return db
    .select()
    .from(exercises)
    .where(inArray(exercises.name, normalizedNames))
    .orderBy(exercises.name);
}

export async function listExerciseVariations(parentExerciseId: number): Promise<Exercise[]> {
  return getSiblingVariations(parentExerciseId);
}

export async function getExerciseFamilyScope(
  exerciseId: number
): Promise<ExerciseFamilyScope | null> {
  const target = await getExerciseById(exerciseId);
  if (!target) {
    return null;
  }

  const parent = await resolveParentExercise(target);
  const variations = await getSiblingVariations(parent.id);

  return {
    target,
    parent,
    variations,
    family: [parent, ...variations],
    familyIds: [parent.id, ...variations.map((variation) => variation.id)],
    isVariation: isVariationExercise(target),
  };
}

export async function getExerciseScopeIdsForView(exerciseId: number): Promise<number[]> {
  const scope = await getExerciseFamilyScope(exerciseId);
  if (!scope) {
    return [];
  }

  return scope.isVariation ? [scope.target.id] : scope.familyIds;
}

export async function listExerciseLibraryGroups(): Promise<ExerciseLibraryGroup[]> {
  const parents = await db
    .select()
    .from(exercises)
    .where(isNull(exercises.parentExerciseId))
    .orderBy(asc(exercises.name));

  if (parents.length === 0) {
    return [];
  }

  const parentIds = parents.map((parent) => parent.id);
  const variations = await db
    .select()
    .from(exercises)
    .where(inArray(exercises.parentExerciseId, parentIds))
    .orderBy(asc(exercises.parentExerciseId), asc(exercises.variationLabel), asc(exercises.name));

  const variationsByParentId = new Map<number, Exercise[]>();
  for (const variation of variations) {
    const parentId = variation.parentExerciseId;
    if (parentId === null) {
      continue;
    }
    if (!variationsByParentId.has(parentId)) {
      variationsByParentId.set(parentId, []);
    }
    variationsByParentId.get(parentId)!.push(variation);
  }

  return Promise.all(
    parents.map(async (exercise) => {
      const childVariations = variationsByParentId.get(exercise.id) ?? [];
      return {
        exercise,
        variations: childVariations,
        familyLastPerformedAt: await lastPerformedAtForExerciseIds([
          exercise.id,
          ...childVariations.map((variation) => variation.id),
        ]),
      };
    })
  );
}

export async function updateExercise(
  id: number,
  updates: Partial<{
    name: string;
    description: string | null;
    muscle_group: string | null;
    equipment: string | null;
    is_bodyweight: boolean;
  }>
): Promise<void> {
  const existing = await getExerciseById(id);
  if (!existing) {
    return;
  }

  if (updates.name !== undefined && updates.name.trim() !== existing.name) {
    if (isVariationExercise(existing)) {
      throw new Error("Rename variations from the Variations manager.");
    }

    const childVariations = await getSiblingVariations(existing.id);
    if (childVariations.length > 0) {
      throw new Error("Rename or delete the existing variations before renaming the parent exercise.");
    }
  }

  const mapped: Partial<ExerciseRow> = {};
  if (updates.name !== undefined) mapped.name = assertNonEmptyName(updates.name);
  if (updates.description !== undefined) mapped.description = updates.description;
  if (updates.muscle_group !== undefined) mapped.muscleGroup = updates.muscle_group;
  if (updates.equipment !== undefined) mapped.equipment = updates.equipment;
  if (updates.is_bodyweight !== undefined) mapped.isBodyweight = !!updates.is_bodyweight;
  if (Object.keys(mapped).length === 0) return;
  await db.update(exercises).set(mapped).where(eq(exercises.id, id)).run();
}

export async function renameExerciseVariation(
  exerciseId: number,
  nextVariationLabel: string
): Promise<void> {
  const variation = await getExerciseById(exerciseId);
  if (!variation || !isVariationExercise(variation)) {
    throw new Error("Variation not found.");
  }

  const parentExercise = await resolveParentExercise(variation);
  const normalizedLabel = normalizeVariationLabel(nextVariationLabel);
  if (!normalizedLabel) {
    throw new Error("Variation label is required.");
  }

  await assertVariationLabelAvailable(parentExercise, normalizedLabel, variation.id);

  const nextName = buildVariationExerciseName(parentExercise.name, normalizedLabel);
  if (nextName === variation.name && normalizedLabel === variation.variationLabel) {
    return;
  }

  await db
    .update(exercises)
    .set({
      name: nextName,
      variationLabel: normalizedLabel,
    })
    .where(eq(exercises.id, variation.id))
    .run();

  const affectedActiveProgramIds = await rewriteStoredProgramReferences({
    fromExerciseId: variation.id,
    fromExerciseName: variation.name,
    toExerciseId: variation.id,
    toExerciseName: nextName,
  });
  const affectedCalendarProgramIds = await rewriteCalendarExerciseReferences({
    fromExerciseId: variation.id,
    fromExerciseName: variation.name,
    toExerciseId: variation.id,
    toExerciseName: nextName,
  });

  await refreshUpcomingCalendarForPrograms([
    ...affectedActiveProgramIds,
    ...affectedCalendarProgramIds,
  ]);
}

export async function deleteExerciseVariation(
  exerciseId: number,
  mode: VariationDeleteMode
): Promise<void> {
  const variation = await getExerciseById(exerciseId);
  if (!variation || !isVariationExercise(variation)) {
    throw new Error("Variation not found.");
  }

  const parentExercise = await resolveParentExercise(variation);
  const rewriteParams: RewriteProgramReferencesParams = {
    fromExerciseId: variation.id,
    fromExerciseName: variation.name,
    toExerciseId: parentExercise.id,
    toExerciseName: parentExercise.name,
  };

  const affectedActiveProgramIds = await rewriteStoredProgramReferences(rewriteParams);
  const affectedCalendarProgramIds = await rewriteCalendarExerciseReferences(rewriteParams);

  if (mode === "keep_data") {
    await db
      .update(workoutExercises)
      .set({ exerciseId: parentExercise.id })
      .where(eq(workoutExercises.exerciseId, variation.id))
      .run();

    await db
      .update(sets)
      .set({ exerciseId: parentExercise.id })
      .where(eq(sets.exerciseId, variation.id))
      .run();

    await moveVariationFormulaOverrideToParent(variation.id, parentExercise.id);
    await db.delete(pbEvents).where(eq(pbEvents.exerciseId, variation.id)).run();
    await db.delete(exercises).where(eq(exercises.id, variation.id)).run();
    await rebuildPBEventsForExercise(parentExercise.id);
  } else {
    await deleteExerciseHistoryAndRow(variation.id);
  }

  return refreshUpcomingCalendarForPrograms([
    ...affectedActiveProgramIds,
    ...affectedCalendarProgramIds,
  ]);
}

export async function deleteExercise(id: number): Promise<void> {
  const exercise = await getExerciseById(id);
  if (!exercise) {
    return;
  }

  if (isVariationExercise(exercise)) {
    await deleteExerciseVariation(id, "delete_data");
    return;
  }

  const childVariations = await getSiblingVariations(exercise.id);
  if (childVariations.length > 0) {
    throw new Error("Delete or migrate the exercise variations before deleting the parent exercise.");
  }

  await deleteExerciseHistoryAndRow(id);
}

async function lastPerformedAtForExerciseIds(exerciseIds: number[]): Promise<number | null> {
  const uniqueExerciseIds = [...new Set(exerciseIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (uniqueExerciseIds.length === 0) {
    return null;
  }

  const rows = await db
    .select({ lastPerformedAt: sql<number | null>`max(${sets.performedAt})` })
    .from(sets)
    .where(inArray(sets.exerciseId, uniqueExerciseIds));

  return rows[0]?.lastPerformedAt ?? null;
}

export async function lastPerformedAt(exerciseId: number): Promise<number | null> {
  return lastPerformedAtForExerciseIds([exerciseId]);
}

export async function getLastRestSeconds(exerciseId: number): Promise<number | null> {
  const rows = await db
    .select({ lastRestSeconds: exercises.lastRestSeconds })
    .from(exercises)
    .where(eq(exercises.id, exerciseId));
  return rows[0]?.lastRestSeconds ?? null;
}

export async function setLastRestSeconds(exerciseId: number, seconds: number): Promise<void> {
  await db.update(exercises)
    .set({ lastRestSeconds: seconds })
    .where(eq(exercises.id, exerciseId))
    .run();
}

export const MAX_PINNED_EXERCISES = 5;

export async function getPinnedExercises(): Promise<Exercise[]> {
  return db.select()
    .from(exercises)
    .where(eq(exercises.isPinned, true))
    .orderBy(exercises.name);
}

export async function getPinnedExercisesCount(): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)` })
    .from(exercises)
    .where(eq(exercises.isPinned, true));
  return rows[0]?.count ?? 0;
}

export async function togglePinExercise(exerciseId: number): Promise<boolean> {
  const exercise = await getExerciseById(exerciseId);
  if (!exercise) return false;

  const newPinnedState = !exercise.isPinned;
  await db.update(exercises)
    .set({ isPinned: newPinnedState })
    .where(eq(exercises.id, exerciseId))
    .run();
  return newPinnedState;
}

export async function isExercisePinned(exerciseId: number): Promise<boolean> {
  const exercise = await getExerciseById(exerciseId);
  return exercise?.isPinned ?? false;
}
