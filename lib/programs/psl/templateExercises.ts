type ExerciseLike = {
  id: number;
  name: string;
};

export type TemplateExerciseRequirement = {
  exerciseId: string;
  canonicalName: string;
  aliases: string[];
  resolutionStrategy?: "match_or_create" | "select_or_create";
  includeCanonicalAliasOnOverride?: boolean;
};

export type TemplateExerciseSuggestion<TExercise extends ExerciseLike = ExerciseLike> = {
  exercise: TExercise;
  score: number;
  matchType: "exact" | "alias" | "fuzzy";
  matchedName: string;
};

export type TemplateExerciseMatch<TExercise extends ExerciseLike = ExerciseLike> = {
  requirement: TemplateExerciseRequirement;
  exactMatch: TemplateExerciseSuggestion<TExercise> | null;
  suggestions: TemplateExerciseSuggestion<TExercise>[];
};

type TemplateExerciseDefinition = TemplateExerciseRequirement;

const TEMPLATE_EXERCISE_DEFINITIONS: TemplateExerciseDefinition[] = [
  {
    exerciseId: "back_squat",
    canonicalName: "Back Squat",
    aliases: ["Barbell Squat", "Competition Back Squat", "Competition Squat", "High Bar Squat"],
  },
  {
    exerciseId: "front_squat",
    canonicalName: "Front Squat",
    aliases: ["Barbell Front Squat"],
  },
  {
    exerciseId: "paused_back_squat",
    canonicalName: "Paused Back Squat",
    aliases: ["Paused Squat"],
  },
  {
    exerciseId: "barbell_bench_press",
    canonicalName: "Barbell Bench Press",
    aliases: ["Bench Press", "Flat Barbell Bench Press", "Competition Bench Press"],
  },
  {
    exerciseId: "close_grip_bench_press",
    canonicalName: "Close Grip Bench Press",
    aliases: ["Close-Grip Bench Press", "CGBP"],
  },
  {
    exerciseId: "incline_dumbbell_press",
    canonicalName: "Incline Dumbbell Press",
    aliases: ["Incline DB Press"],
  },
  {
    exerciseId: "dumbbell_bench_press",
    canonicalName: "Dumbbell Bench Press",
    aliases: ["DB Bench Press", "Flat Dumbbell Bench Press"],
  },
  {
    exerciseId: "barbell_deadlift",
    canonicalName: "Barbell Deadlift",
    aliases: ["Deadlift", "Conventional Deadlift"],
  },
  {
    exerciseId: "romanian_deadlift",
    canonicalName: "Romanian Deadlift",
    aliases: ["RDL"],
  },
  {
    exerciseId: "standing_barbell_overhead_press",
    canonicalName: "Standing Barbell Overhead Press",
    aliases: ["Overhead Press", "Barbell Overhead Press", "Standing Overhead Press", "OHP"],
  },
  {
    exerciseId: "dumbbell_shoulder_press",
    canonicalName: "Dumbbell Shoulder Press",
    aliases: ["DB Shoulder Press", "Dumbbell Overhead Press"],
  },
  {
    exerciseId: "barbell_row",
    canonicalName: "Barbell Row",
    aliases: ["Bent Over Row", "Bent-Over Row"],
  },
  {
    exerciseId: "pendlay_row",
    canonicalName: "Pendlay Row",
    aliases: ["Barbell Pendlay Row"],
  },
  {
    exerciseId: "dumbbell_row",
    canonicalName: "Dumbbell Row",
    aliases: ["DB Row", "One Arm Dumbbell Row", "One-Arm Dumbbell Row"],
  },
  {
    exerciseId: "cable_row",
    canonicalName: "Cable Row",
    aliases: ["Seated Cable Row"],
  },
  {
    exerciseId: "chest_supported_row",
    canonicalName: "Chest Supported Row",
    aliases: ["Chest-Supported Row"],
  },
  {
    exerciseId: "weighted_pull_up",
    canonicalName: "Weighted Pull-Up",
    aliases: ["Weighted Pull Up", "Pull-Up", "Pull Up"],
  },
  {
    exerciseId: "chin_up",
    canonicalName: "Chin-Up",
    aliases: ["Chin Up", "Weighted Chin-Up", "Weighted Chin Up"],
  },
  {
    exerciseId: "lat_pulldown",
    canonicalName: "Lat Pulldown",
    aliases: ["Lat Pull-Down", "Lat Pull Down"],
  },
  {
    exerciseId: "leg_press",
    canonicalName: "Leg Press",
    aliases: ["45 Degree Leg Press"],
  },
  {
    exerciseId: "leg_curl",
    canonicalName: "Leg Curl",
    aliases: ["Lying Leg Curl"],
  },
  {
    exerciseId: "seated_leg_curl",
    canonicalName: "Seated Leg Curl",
    aliases: [],
  },
  {
    exerciseId: "back_extension",
    canonicalName: "Back Extension",
    aliases: ["Hyperextension"],
  },
  {
    exerciseId: "standing_calf_raise",
    canonicalName: "Standing Calf Raise",
    aliases: ["Calf Raise"],
  },
  {
    exerciseId: "walking_lunge",
    canonicalName: "Walking Lunge",
    aliases: ["Dumbbell Walking Lunge"],
  },
  {
    exerciseId: "dumbbell_lateral_raise",
    canonicalName: "Dumbbell Lateral Raise",
    aliases: ["Lateral Raise", "DB Lateral Raise"],
  },
  {
    exerciseId: "rear_delt_fly",
    canonicalName: "Rear Delt Fly",
    aliases: ["Rear Delt Raise", "Reverse Fly"],
  },
  {
    exerciseId: "face_pull",
    canonicalName: "Face Pull",
    aliases: ["Cable Face Pull"],
  },
  {
    exerciseId: "cable_triceps_pressdown",
    canonicalName: "Cable Triceps Pressdown",
    aliases: ["Triceps Pressdown", "Cable Pressdown", "Cable Pushdown", "Triceps Pushdown"],
  },
  {
    exerciseId: "overhead_rope_triceps_extension",
    canonicalName: "Overhead Rope Triceps Extension",
    aliases: ["Rope Overhead Triceps Extension", "Overhead Triceps Extension"],
  },
  {
    exerciseId: "cable_skull_crusher",
    canonicalName: "Cable Skull Crusher",
    aliases: ["Cable Skullcrusher", "Skull Crusher", "Skullcrusher"],
  },
  {
    exerciseId: "barbell_curl",
    canonicalName: "Barbell Curl",
    aliases: ["EZ-Bar Curl", "EZ Bar Curl"],
  },
  {
    exerciseId: "incline_dumbbell_curl",
    canonicalName: "Incline Dumbbell Curl",
    aliases: ["Incline DB Curl"],
  },
  {
    exerciseId: "hammer_curl",
    canonicalName: "Hammer Curl",
    aliases: ["Dumbbell Hammer Curl"],
  },
  {
    exerciseId: "cable_fly",
    canonicalName: "Cable Fly",
    aliases: ["Cable Chest Fly", "Cable Crossover"],
  },
  {
    exerciseId: "dip",
    canonicalName: "Dip",
    aliases: ["Parallel Bar Dip", "Weighted Dip"],
  },
  {
    exerciseId: "hanging_leg_raise",
    canonicalName: "Hanging Leg Raise",
    aliases: ["Leg Raise"],
  },
];

const TEMPLATE_EXERCISE_BY_CANONICAL_NAME = new Map(
  TEMPLATE_EXERCISE_DEFINITIONS.map((exercise) => [exercise.canonicalName, exercise])
);

const PHRASE_REPLACEMENTS: [RegExp, string][] = [
  [/\bcgbp\b/g, "close grip bench press"],
  [/\bohp\b/g, "overhead press"],
  [/\brdl\b/g, "romanian deadlift"],
  [/\bpullups?\b/g, "pull up"],
  [/\bchinups?\b/g, "chin up"],
  [/\bez bar\b/g, "ezbar"],
  [/\bez-bar\b/g, "ezbar"],
  [/\bdb\b/g, "dumbbell"],
  [/\bbb\b/g, "barbell"],
];

const TOKEN_REPLACEMENTS: Record<string, string> = {
  presses: "press",
  rows: "row",
  curls: "curl",
  extensions: "extension",
  raises: "raise",
  skullcrushers: "skullcrusher",
  tricep: "triceps",
};

function slugifyExerciseId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeExerciseText(value: string): string {
  let normalized = value.trim().toLowerCase();
  normalized = normalized.replace(/&/g, " and ");

  PHRASE_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });

  normalized = normalized.replace(/[^a-z0-9]+/g, " ");
  normalized = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => TOKEN_REPLACEMENTS[token] ?? token)
    .join(" ");

  return normalized.trim();
}

function tokenizeExerciseText(value: string): string[] {
  return normalizeExerciseText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function toBigrams(value: string): string[] {
  const compact = normalizeExerciseText(value).replace(/\s+/g, "");
  if (compact.length <= 1) {
    return compact ? [compact] : [];
  }

  const result: string[] = [];
  for (let index = 0; index < compact.length - 1; index += 1) {
    result.push(compact.slice(index, index + 2));
  }
  return result;
}

function getTokenDiceScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;

  const leftCounts = new Map<string, number>();
  left.forEach((token) => {
    leftCounts.set(token, (leftCounts.get(token) ?? 0) + 1);
  });

  let overlap = 0;
  right.forEach((token) => {
    const count = leftCounts.get(token) ?? 0;
    if (count <= 0) return;
    leftCounts.set(token, count - 1);
    overlap += 1;
  });

  return (2 * overlap) / (left.length + right.length);
}

function getBigramDiceScore(left: string, right: string): number {
  const leftBigrams = toBigrams(left);
  const rightBigrams = toBigrams(right);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) return 0;

  const counts = new Map<string, number>();
  leftBigrams.forEach((bigram) => {
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  });

  let overlap = 0;
  rightBigrams.forEach((bigram) => {
    const count = counts.get(bigram) ?? 0;
    if (count <= 0) return;
    counts.set(bigram, count - 1);
    overlap += 1;
  });

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function getDescriptorPenalty(leftTokens: string[], rightTokens: string[]): number {
  const descriptorGroups = [
    ["barbell", "dumbbell", "cable", "machine", "ezbar"],
    ["back", "front", "incline", "overhead", "standing", "seated", "walking", "hanging", "weighted", "paused", "close", "romanian", "conventional", "chest", "supported"],
  ];

  let penalty = 0;

  descriptorGroups.forEach((group) => {
    const leftDescriptor = group.find((token) => leftTokens.includes(token));
    const rightDescriptor = group.find((token) => rightTokens.includes(token));
    if (!leftDescriptor || !rightDescriptor) return;
    if (leftDescriptor !== rightDescriptor) {
      penalty += group === descriptorGroups[0] ? 0.12 : 0.06;
    }
  });

  return penalty;
}

function scoreExerciseNames(left: string, right: string): number {
  const normalizedLeft = normalizeExerciseText(left);
  const normalizedRight = normalizeExerciseText(right);

  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const leftTokens = tokenizeExerciseText(left);
  const rightTokens = tokenizeExerciseText(right);
  const tokenDice = getTokenDiceScore(leftTokens, rightTokens);
  const bigramDice = getBigramDiceScore(left, right);

  const compactLeft = normalizedLeft.replace(/\s+/g, "");
  const compactRight = normalizedRight.replace(/\s+/g, "");
  const containsBonus =
    compactLeft.includes(compactRight) || compactRight.includes(compactLeft) ? 0.08 : 0;

  const initialsLeft = leftTokens.map((token) => token[0]).join("");
  const initialsRight = rightTokens.map((token) => token[0]).join("");
  const initialsBonus =
    initialsLeft.length >= 2 && initialsLeft === initialsRight ? 0.08 : 0;

  const descriptorPenalty = getDescriptorPenalty(leftTokens, rightTokens);

  return Math.max(
    0,
    Math.min(
      0.96,
      tokenDice * 0.58 +
        bigramDice * 0.34 +
        containsBonus +
        initialsBonus -
        descriptorPenalty
    )
  );
}

function dedupeAliases(
  exerciseName: string,
  aliases: string[]
): string[] {
  const seen = new Set<string>([normalizeExerciseText(exerciseName)]);
  const result: string[] = [];

  aliases.forEach((alias) => {
    const normalized = normalizeExerciseText(alias);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(alias);
  });

  return result;
}

export function getTemplateExerciseRequirement(
  exerciseName: string
): TemplateExerciseRequirement {
  const existing = TEMPLATE_EXERCISE_BY_CANONICAL_NAME.get(exerciseName);
  if (existing) {
    return existing;
  }

  return {
    exerciseId: slugifyExerciseId(exerciseName),
    canonicalName: exerciseName,
    aliases: [],
  };
}

export function buildTemplateExerciseRequirement(
  exerciseName: string,
  aliases: string[] = []
): TemplateExerciseRequirement {
  const definition = getTemplateExerciseRequirement(exerciseName);
  return {
    ...definition,
    aliases: dedupeAliases(definition.canonicalName, [
      ...definition.aliases,
      ...aliases,
    ]),
  };
}

export function buildTemplateExerciseAliasesMap(
  requirements: TemplateExerciseRequirement[],
  exerciseNameOverrides: Record<string, string> = {}
): Record<string, string> {
  const aliasOwners = new Map<string, string>();
  const ambiguousAliases = new Set<string>();

  requirements.forEach((requirement) => {
    const activeExerciseName =
      exerciseNameOverrides[requirement.exerciseId]?.trim() ||
      requirement.canonicalName;

    dedupeAliases(activeExerciseName, [
      ...requirement.aliases,
      ...(activeExerciseName !== requirement.canonicalName &&
      requirement.includeCanonicalAliasOnOverride !== false
        ? [requirement.canonicalName]
        : []),
    ]).forEach((alias) => {
      const normalized = normalizeExerciseText(alias);
      const existingOwner = aliasOwners.get(normalized);
      if (!existingOwner) {
        aliasOwners.set(normalized, requirement.exerciseId);
        return;
      }

      if (existingOwner !== requirement.exerciseId) {
        ambiguousAliases.add(normalized);
      }
    });
  });

  const result: Record<string, string> = {};
  requirements.forEach((requirement) => {
    const activeExerciseName =
      exerciseNameOverrides[requirement.exerciseId]?.trim() ||
      requirement.canonicalName;

    dedupeAliases(activeExerciseName, [
      ...requirement.aliases,
      ...(activeExerciseName !== requirement.canonicalName &&
      requirement.includeCanonicalAliasOnOverride !== false
        ? [requirement.canonicalName]
        : []),
    ]).forEach((alias) => {
      const normalized = normalizeExerciseText(alias);
      if (ambiguousAliases.has(normalized)) return;
      if (aliasOwners.get(normalized) !== requirement.exerciseId) return;
      result[alias] = requirement.exerciseId;
    });
  });

  return result;
}

export function getTemplateExerciseSuggestions<
  TExercise extends ExerciseLike,
>(
  requirement: TemplateExerciseRequirement,
  exercises: TExercise[],
  options: {
    includeLowConfidence?: boolean;
    limit?: number;
  } = {}
): TemplateExerciseSuggestion<TExercise>[] {
  const includeLowConfidence = options.includeLowConfidence ?? false;
  const limit = options.limit ?? 3;
  const exactCanonicalName = normalizeExerciseText(requirement.canonicalName);
  const aliasCandidates = requirement.aliases.map((alias) => ({
    alias,
    normalized: normalizeExerciseText(alias),
  }));

  const suggestions = exercises
    .map((exercise) => {
      const normalizedExerciseName = normalizeExerciseText(exercise.name);
      if (!normalizedExerciseName) {
        return null;
      }

      if (normalizedExerciseName === exactCanonicalName) {
        return {
          exercise,
          score: 1,
          matchType: "exact" as const,
          matchedName: requirement.canonicalName,
        };
      }

      const exactAlias = aliasCandidates.find(
        (alias) => alias.normalized === normalizedExerciseName
      );
      if (exactAlias) {
        return {
          exercise,
          score: 0.985,
          matchType: "alias" as const,
          matchedName: exactAlias.alias,
        };
      }

      const scoredNames = [requirement.canonicalName, ...requirement.aliases].map(
        (candidateName) => ({
          candidateName,
          score: scoreExerciseNames(candidateName, exercise.name),
        })
      );

      const best = scoredNames.reduce((currentBest, candidate) =>
        candidate.score > currentBest.score ? candidate : currentBest
      );

      if (!includeLowConfidence && best.score < 0.72) {
        return null;
      }

      return {
        exercise,
        score: best.score,
        matchType: "fuzzy" as const,
        matchedName: best.candidateName,
      };
    })
    .filter(
      (suggestion): suggestion is TemplateExerciseSuggestion<TExercise> =>
        suggestion !== null
    )
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.exercise.name.localeCompare(right.exercise.name);
    });

  return suggestions.slice(0, limit);
}

export function matchTemplateExercises<
  TExercise extends ExerciseLike,
>(
  requirements: TemplateExerciseRequirement[],
  exercises: TExercise[]
): TemplateExerciseMatch<TExercise>[] {
  return requirements.map((requirement) => {
    const suggestions = getTemplateExerciseSuggestions(requirement, exercises, {
      limit: 3,
    });
    const exactMatch =
      suggestions.find((suggestion) => suggestion.matchType === "exact") ?? null;

    return {
      requirement,
      exactMatch,
      suggestions,
    };
  });
}
