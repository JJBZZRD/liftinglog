export type RestoreColumn = {
  readonly definition: string;
  readonly dfltValue: string | null;
  readonly name: string;
  readonly notNull: 0 | 1;
  readonly pk: 0 | 1;
  readonly type: string;
};

export type RestoreForeignKey = {
  readonly from: string;
  readonly match: string;
  readonly onDelete: string;
  readonly onUpdate: string;
  readonly table: string;
  readonly to: string;
};

export type RestoreTableShape = {
  readonly columns: readonly RestoreColumn[];
  readonly definition: string;
  readonly foreignKeys: readonly RestoreForeignKey[];
  readonly id: string;
};

export type RestoreIndex = {
  readonly columns: readonly (string | null)[];
  readonly partial?: 0 | 1;
  readonly name: string;
  readonly origin: "c" | "u";
  readonly sql: string | null;
  readonly table: string;
  readonly unique: 0 | 1;
};

export type RestoreSchemaProfile = {
  readonly id: string;
  readonly indexes: readonly RestoreIndex[];
  readonly optionalTables: readonly string[];
  readonly requiredTables: readonly string[];
  readonly tables: Readonly<Record<string, readonly RestoreTableShape[]>>;
};

type ColumnOptions = {
  readonly defaultValue?: string;
  readonly notNull?: boolean;
  readonly primaryKey?: boolean;
  readonly unique?: boolean;
};

function column(name: string, type: string, options: ColumnOptions = {}): RestoreColumn {
  const definition = [
    name,
    type,
    options.primaryKey ? "PRIMARY KEY" : "",
    options.notNull ? "NOT NULL" : "",
    options.unique ? "UNIQUE" : "",
    options.defaultValue === undefined ? "" : `DEFAULT ${options.defaultValue}`,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    definition,
    dfltValue: options.defaultValue ?? null,
    name,
    notNull: options.notNull ? 1 : 0,
    pk: options.primaryKey ? 1 : 0,
    type,
  };
}

function foreignKey(
  from: string,
  table: string,
  to: string,
  onDelete: string
): RestoreForeignKey {
  return { from, match: "NONE", onDelete, onUpdate: "NO ACTION", table, to };
}

function tableShape(
  id: string,
  columns: readonly RestoreColumn[],
  foreignKeys: readonly RestoreForeignKey[] = []
): RestoreTableShape {
  const definitions = [
    ...columns.map((candidate) => candidate.definition),
    ...foreignKeys.map(
      (candidate) =>
        `FOREIGN KEY(${candidate.from}) REFERENCES ${candidate.table}(${candidate.to}) ON DELETE ${candidate.onDelete}`
    ),
  ];
  return {
    columns,
    definition: `(${definitions.join(", ")})`,
    foreignKeys,
    id,
  };
}

function declaredIndex(
  name: string,
  table: string,
  columns: readonly string[],
  unique: 0 | 1 = 0
): RestoreIndex {
  return {
    columns,
    name,
    origin: "c",
    sql: `CREATE ${unique ? "UNIQUE " : ""}INDEX ${name} ON ${table}(${columns.join(", ")})`,
    table,
    unique,
  };
}

function implicitUniqueIndex(name: string, table: string, indexedColumn: string): RestoreIndex {
  return {
    columns: [indexedColumn],
    name,
    origin: "u",
    sql: null,
    table,
    unique: 1,
  };
}

const id = () => column("id", "INTEGER", { notNull: true, primaryKey: true });
const uid = () => column("uid", "TEXT");

const settingsCurrent = tableShape("settings-current", [
  id(),
  column("e1rm_formula", "TEXT", { defaultValue: "'epley'", notNull: true }),
  column("unit_preference", "TEXT", { defaultValue: "'kg'", notNull: true }),
  column("theme_preference", "TEXT", { defaultValue: "'system'", notNull: true }),
  column("color_theme", "TEXT", { defaultValue: "'default'", notNull: true }),
  column("show_all_tab_body_part_grouping", "INTEGER", { defaultValue: "1", notNull: true }),
]);
const settingsHistorical = tableShape("settings-pre-refactor-upgrade", [
  id(),
  column("e1rm_formula", "TEXT", { notNull: true }),
  column("unit_preference", "TEXT", { notNull: true }),
  column("theme_preference", "TEXT", { defaultValue: "'system'", notNull: true }),
  column("color_theme", "TEXT", { defaultValue: "'default'", notNull: true }),
  column("show_all_tab_body_part_grouping", "INTEGER", { defaultValue: "1", notNull: true }),
]);
const settingsE9ee8ed = tableShape("settings-e9ee8ed", [
  id(),
  column("e1rm_formula", "TEXT", { notNull: true }),
  column("unit_preference", "TEXT", { notNull: true }),
  column("theme_preference", "TEXT", { defaultValue: "'system'", notNull: true }),
]);

const userCheckinsCurrent = tableShape("user-checkins-current", [
  id(), uid(),
  column("recorded_at", "INTEGER", { notNull: true }),
  column("context", "TEXT"), column("bodyweight_kg", "REAL"), column("waist_cm", "REAL"),
  column("sleep_start_at", "INTEGER"), column("sleep_end_at", "INTEGER"),
  column("sleep_hours", "REAL"), column("resting_hr_bpm", "INTEGER"),
  column("fatigue_score", "INTEGER"), column("soreness_score", "INTEGER"),
  column("stress_score", "INTEGER"), column("steps", "INTEGER"),
  column("note", "TEXT"), column("source", "TEXT"),
]);

const exerciseBaseColumns = {
  id: id(), uid: uid(),
  nameLegacy: column("name", "TEXT", { notNull: true, unique: true }),
  nameTarget: column("name", "TEXT", { notNull: true }),
  parentExerciseId: column("parent_exercise_id", "INTEGER"),
  variationLabel: column("variation_label", "TEXT"),
  description: column("description", "TEXT"), muscleGroup: column("muscle_group", "TEXT"),
  equipment: column("equipment", "TEXT"),
  isBodyweight: column("is_bodyweight", "INTEGER", { defaultValue: "0", notNull: true }),
  createdAt: column("created_at", "INTEGER"), lastRestSeconds: column("last_rest_seconds", "INTEGER"),
  isPinned: column("is_pinned", "INTEGER", { defaultValue: "0", notNull: true }),
} as const;

const exerciseOrders = [
  ["id", "uid", "name", "parentExerciseId", "variationLabel", "description", "muscleGroup", "equipment", "isBodyweight", "createdAt", "lastRestSeconds", "isPinned"],
  ["id", "uid", "name", "description", "muscleGroup", "equipment", "isBodyweight", "createdAt", "lastRestSeconds", "isPinned", "parentExerciseId", "variationLabel"],
  ["id", "name", "description", "muscleGroup", "equipment", "isBodyweight", "createdAt", "lastRestSeconds", "parentExerciseId", "variationLabel", "isPinned", "uid"],
  ["id", "name", "description", "muscleGroup", "equipment", "isBodyweight", "createdAt", "lastRestSeconds", "isPinned", "uid", "parentExerciseId", "variationLabel"],
  ["id", "name", "description", "muscleGroup", "equipment", "isBodyweight", "createdAt", "lastRestSeconds", "isPinned", "parentExerciseId", "variationLabel", "uid"],
] as const;
type ExerciseColumnKey = (typeof exerciseOrders)[number][number];

function exerciseShapes(kind: "legacy" | "target"): readonly RestoreTableShape[] {
  return exerciseOrders.map((order, index) => {
    const columns = order.map((key) => {
      if (key === "name") {
        return kind === "legacy" ? exerciseBaseColumns.nameLegacy : exerciseBaseColumns.nameTarget;
      }
      return exerciseBaseColumns[key as Exclude<ExerciseColumnKey, "name">];
    });
    return tableShape(`exercises-${kind}-${index + 1}`, columns);
  });
}

const exercisesLegacy = exerciseShapes("legacy");
const exercisesTarget = exerciseShapes("target");
const exercisesE9ee8ed = tableShape("exercises-e9ee8ed", [
  exerciseBaseColumns.id, exerciseBaseColumns.nameLegacy, exerciseBaseColumns.description,
  exerciseBaseColumns.muscleGroup, exerciseBaseColumns.equipment, exerciseBaseColumns.isBodyweight,
  exerciseBaseColumns.createdAt, exerciseBaseColumns.lastRestSeconds, exerciseBaseColumns.isPinned,
]);

const workoutsCurrent = tableShape("workouts-current", [id(), uid(), column("started_at", "INTEGER", { notNull: true }), column("completed_at", "INTEGER"), column("note", "TEXT")]);
const workoutsUidAppended = tableShape("workouts-uid-appended", [id(), column("started_at", "INTEGER", { notNull: true }), column("completed_at", "INTEGER"), column("note", "TEXT"), uid()]);
const namedWorkoutsCurrent = tableShape("workouts-named-current", [...workoutsCurrent.columns, column("name", "TEXT")]);
const namedWorkoutsUidAppended = tableShape("workouts-named-uid-appended", [...workoutsUidAppended.columns, column("name", "TEXT")]);
const workoutsE9ee8ed = tableShape("workouts-e9ee8ed", [id(), column("started_at", "INTEGER", { notNull: true }), column("completed_at", "INTEGER"), column("note", "TEXT")]);

const workoutExerciseFks = [foreignKey("workout_id", "workouts", "id", "CASCADE"), foreignKey("exercise_id", "exercises", "id", "RESTRICT")] as const;
const workoutExerciseColumns = [
  column("workout_id", "INTEGER", { notNull: true }), column("exercise_id", "INTEGER", { notNull: true }),
  column("order_index", "INTEGER"), column("note", "TEXT"), column("current_weight", "REAL"),
  column("current_reps", "INTEGER"), column("completed_at", "INTEGER"), column("performed_at", "INTEGER"),
] as const;
const workoutExerciseE9ee8edColumns = workoutExerciseColumns.slice(0, 6);
const workoutExercisesCurrent = tableShape("workout-exercises-current", [id(), uid(), ...workoutExerciseColumns], workoutExerciseFks);
const workoutExercisesUidAppended = tableShape("workout-exercises-uid-appended", [id(), ...workoutExerciseColumns, uid()], workoutExerciseFks);
const workoutExercisesE9ee8ed = tableShape("workout-exercises-e9ee8ed", [id(), ...workoutExerciseE9ee8edColumns], workoutExerciseFks);

const setFks = [
  foreignKey("workout_id", "workouts", "id", "CASCADE"),
  foreignKey("exercise_id", "exercises", "id", "RESTRICT"),
  foreignKey("workout_exercise_id", "workout_exercises", "id", "SET NULL"),
] as const;
const setColumns = [
  column("workout_id", "INTEGER", { notNull: true }), column("exercise_id", "INTEGER", { notNull: true }),
  column("workout_exercise_id", "INTEGER"), column("set_group_id", "TEXT"), column("set_index", "INTEGER"),
  column("weight_kg", "REAL"), column("reps", "INTEGER"), column("rpe", "REAL"), column("rir", "REAL"),
  column("is_warmup", "INTEGER", { defaultValue: "0", notNull: true }), column("note", "TEXT"),
  column("superset_group_id", "TEXT"), column("performed_at", "INTEGER"),
] as const;
const setsCurrent = tableShape("sets-current", [id(), uid(), ...setColumns], setFks);
const setsUidAppended = tableShape("sets-uid-appended", [id(), ...setColumns, uid()], setFks);
const setsE9ee8ed = tableShape("sets-e9ee8ed", [id(), ...setColumns], setFks);

const pslProgramsCurrent = tableShape("psl-programs-current", [
  id(), column("name", "TEXT", { notNull: true }), column("description", "TEXT"),
  column("psl_source", "TEXT", { notNull: true }), column("compiled_hash", "TEXT"),
  column("percent_intensity_config_json", "TEXT"),
  column("is_active", "INTEGER", { defaultValue: "0", notNull: true }),
  column("start_date", "TEXT"), column("end_date", "TEXT"), column("units", "TEXT"),
  column("created_at", "INTEGER"), column("updated_at", "INTEGER"),
]);
const programCalendar = tableShape("program-calendar-current", [
  id(), column("program_id", "INTEGER", { notNull: true }),
  column("psl_session_id", "TEXT", { notNull: true }),
  column("session_name", "TEXT", { notNull: true }), column("date_iso", "TEXT", { notNull: true }),
  column("sequence", "INTEGER", { notNull: true }),
  column("status", "TEXT", { defaultValue: "'pending'", notNull: true }),
  column("completed_at", "INTEGER"), column("completion_override_exercise_ids_json", "TEXT"),
], [foreignKey("program_id", "psl_programs", "id", "CASCADE")]);

const programCalendarExercises = tableShape("program-calendar-exercises-current", [
  id(), column("calendar_id", "INTEGER", { notNull: true }),
  column("exercise_name", "TEXT", { notNull: true }), column("exercise_id", "INTEGER"),
  column("order_index", "INTEGER", { notNull: true }),
  column("prescribed_sets_json", "TEXT", { notNull: true }),
  column("status", "TEXT", { defaultValue: "'pending'", notNull: true }),
  column("workout_exercise_id", "INTEGER"),
], [
  foreignKey("calendar_id", "program_calendar", "id", "CASCADE"),
  foreignKey("exercise_id", "exercises", "id", "SET NULL"),
]);

const programCalendarSets = tableShape("program-calendar-sets-current", [
  id(), column("calendar_exercise_id", "INTEGER", { notNull: true }),
  column("set_index", "INTEGER", { notNull: true }), column("prescribed_reps", "TEXT"),
  column("prescribed_intensity_json", "TEXT"), column("prescribed_role", "TEXT"),
  column("actual_weight", "REAL"), column("actual_reps", "INTEGER"), column("actual_rpe", "REAL"),
  column("is_user_added", "INTEGER", { defaultValue: "0", notNull: true }),
  column("is_logged", "INTEGER", { defaultValue: "0", notNull: true }),
  column("set_id", "INTEGER"), column("logged_at", "INTEGER"),
], [
  foreignKey("calendar_exercise_id", "program_calendar_exercises", "id", "CASCADE"),
  foreignKey("set_id", "sets", "id", "SET NULL"),
]);

const prFks = [foreignKey("set_id", "sets", "id", "CASCADE"), foreignKey("exercise_id", "exercises", "id", "RESTRICT")] as const;
const prColumns = [
  column("set_id", "INTEGER", { notNull: true }), column("exercise_id", "INTEGER", { notNull: true }),
  column("type", "TEXT", { notNull: true }), column("metric_value", "REAL", { notNull: true }),
  column("occurred_at", "INTEGER", { notNull: true }),
] as const;
const prEventsCurrent = tableShape("pr-events-current", [id(), uid(), ...prColumns], prFks);
const prEventsUidAppended = tableShape("pr-events-uid-appended", [id(), ...prColumns, uid()], prFks);
const prEventsE9ee8ed = tableShape("pr-events-e9ee8ed", [id(), ...prColumns], prFks);

const tags = tableShape("tags-current", [id(), column("name", "TEXT", { notNull: true, unique: true })]);
const taggings = tableShape("taggings-current", [
  id(), column("tag_id", "INTEGER", { notNull: true }),
  column("target_type", "TEXT", { notNull: true }), column("target_id", "INTEGER", { notNull: true }),
], [foreignKey("tag_id", "tags", "id", "CASCADE")]);

const mediaFks = [foreignKey("set_id", "sets", "id", "CASCADE"), foreignKey("workout_id", "workouts", "id", "CASCADE")] as const;
const mediaCurrent = tableShape("media-current", [
  id(), column("local_uri", "TEXT", { notNull: true }), column("asset_id", "TEXT"),
  column("mime", "TEXT"), column("set_id", "INTEGER"), column("workout_id", "INTEGER"),
  column("note", "TEXT"), column("created_at", "INTEGER"), column("original_filename", "TEXT"),
  column("media_created_at", "INTEGER"), column("duration_ms", "INTEGER"), column("album_name", "TEXT"),
], mediaFks);
const mediaAssetAppended = tableShape("media-asset-appended", [
  id(), column("local_uri", "TEXT", { notNull: true }), column("mime", "TEXT"),
  column("set_id", "INTEGER"), column("workout_id", "INTEGER"), column("note", "TEXT"),
  column("created_at", "INTEGER"), column("asset_id", "TEXT"), column("original_filename", "TEXT"),
  column("media_created_at", "INTEGER"), column("duration_ms", "INTEGER"), column("album_name", "TEXT"),
], mediaFks);
const mediaE9ee8ed = tableShape("media-e9ee8ed", [
  id(), column("local_uri", "TEXT", { notNull: true }), column("mime", "TEXT"),
  column("set_id", "INTEGER"), column("workout_id", "INTEGER"), column("note", "TEXT"),
  column("created_at", "INTEGER"),
], mediaFks);

const exerciseFormulaOverrides = tableShape("exercise-formula-overrides-current", [
  column("exercise_id", "INTEGER", { notNull: true, primaryKey: true }),
  column("e1rm_formula", "TEXT", { notNull: true }),
], [foreignKey("exercise_id", "exercises", "id", "CASCADE")]);

const programs = tableShape("programs-e9ee8ed", [
  id(), column("name", "TEXT", { notNull: true, unique: true }), column("description", "TEXT"),
  column("is_active", "INTEGER", { defaultValue: "0", notNull: true }), column("created_at", "INTEGER"),
]);
const programDays = tableShape("program-days-e9ee8ed", [
  id(), column("program_id", "INTEGER", { notNull: true }), column("schedule", "TEXT", { notNull: true }),
  column("day_of_week", "INTEGER"), column("interval_days", "INTEGER"), column("note", "TEXT"),
], [foreignKey("program_id", "programs", "id", "CASCADE")]);
const programExercises = tableShape("program-exercises-e9ee8ed", [
  id(), column("program_day_id", "INTEGER", { notNull: true }),
  column("exercise_id", "INTEGER", { notNull: true }), column("order_index", "INTEGER"),
  column("prescription_json", "TEXT"),
], [
  foreignKey("program_day_id", "program_days", "id", "CASCADE"),
  foreignKey("exercise_id", "exercises", "id", "RESTRICT"),
]);
const progressions = tableShape("progressions-e9ee8ed", [
  id(), column("program_exercise_id", "INTEGER", { notNull: true }),
  column("type", "TEXT", { notNull: true }), column("value", "REAL", { notNull: true }),
  column("cadence", "TEXT", { notNull: true }), column("cap_kg", "REAL"),
], [foreignKey("program_exercise_id", "program_exercises", "id", "CASCADE")]);
const plannedWorkouts = tableShape("planned-workouts-e9ee8ed", [
  id(), column("program_id", "INTEGER", { notNull: true }),
  column("program_day_id", "INTEGER", { notNull: true }), column("planned_for", "INTEGER", { notNull: true }),
  column("note", "TEXT"),
], [
  foreignKey("program_id", "programs", "id", "CASCADE"),
  foreignKey("program_day_id", "program_days", "id", "CASCADE"),
]);

const canonicalCurrentTables = {
  settings: [settingsCurrent], user_checkins: [userCheckinsCurrent], exercises: exercisesTarget,
  workouts: [workoutsCurrent], workout_exercises: [workoutExercisesCurrent], sets: [setsCurrent],
  psl_programs: [pslProgramsCurrent], program_calendar: [programCalendar],
  program_calendar_exercises: [programCalendarExercises], program_calendar_sets: [programCalendarSets],
  pr_events: [prEventsCurrent], tags: [tags], taggings: [taggings], media: [mediaCurrent],
  exercise_formula_overrides: [exerciseFormulaOverrides],
} as const;

const e9ee8edMigratedCurrentTables = {
  settings: [settingsHistorical, settingsCurrent], user_checkins: [userCheckinsCurrent], exercises: [exercisesTarget[4]],
  workouts: [workoutsUidAppended], workout_exercises: [workoutExercisesUidAppended], sets: [setsUidAppended],
  psl_programs: [pslProgramsCurrent], program_calendar: [programCalendar],
  program_calendar_exercises: [programCalendarExercises], program_calendar_sets: [programCalendarSets],
  pr_events: [prEventsUidAppended, prEventsCurrent], tags: [tags], taggings: [taggings],
  media: [mediaAssetAppended, mediaCurrent],
  exercise_formula_overrides: [exerciseFormulaOverrides],
} as const;

const currentDeclaredIndexes = [
  declaredIndex("idx_sets_workout_id", "sets", ["workout_id"]),
  declaredIndex("idx_sets_exercise_id", "sets", ["exercise_id"]),
  declaredIndex("idx_sets_performed_at", "sets", ["performed_at"]),
  declaredIndex("idx_sets_group", "sets", ["set_group_id"]),
  declaredIndex("idx_sets_exercise_reps", "sets", ["exercise_id", "reps"]),
  declaredIndex("idx_sets_workout_exercise_id", "sets", ["workout_exercise_id"]),
  declaredIndex("idx_user_checkins_recorded_at", "user_checkins", ["recorded_at"]),
  declaredIndex("idx_workout_exercises_order", "workout_exercises", ["workout_id", "order_index"]),
  declaredIndex("idx_pr_events_exercise_time", "pr_events", ["exercise_id", "occurred_at"]),
  declaredIndex("idx_program_calendar_date", "program_calendar", ["date_iso"]),
  declaredIndex("idx_program_calendar_program", "program_calendar", ["program_id"]),
  declaredIndex("idx_program_calendar_exercises_cal", "program_calendar_exercises", ["calendar_id"]),
  declaredIndex("idx_program_calendar_sets_exercise", "program_calendar_sets", ["calendar_exercise_id"]),
  declaredIndex("idx_user_checkins_uid", "user_checkins", ["uid"], 1),
  declaredIndex("idx_exercises_uid", "exercises", ["uid"], 1),
  declaredIndex("idx_workouts_uid", "workouts", ["uid"], 1),
  declaredIndex("idx_workout_exercises_uid", "workout_exercises", ["uid"], 1),
  declaredIndex("idx_sets_uid", "sets", ["uid"], 1),
  declaredIndex("idx_pr_events_uid", "pr_events", ["uid"], 1),
  declaredIndex("idx_workout_exercises_performed_at", "workout_exercises", ["performed_at"]),
  declaredIndex("idx_workout_exercises_completed_at", "workout_exercises", ["completed_at"]),
  declaredIndex("idx_program_calendar_exercises_workout_exercise_id", "program_calendar_exercises", ["workout_exercise_id"]),
  declaredIndex("idx_program_calendar_sets_set_id", "program_calendar_sets", ["set_id"]),
  declaredIndex("idx_exercises_parent_exercise_id", "exercises", ["parent_exercise_id"]),
] as const;

const tagsImplicitIndex = implicitUniqueIndex("sqlite_autoindex_tags_1", "tags", "name");
const singleActiveWorkoutIndex: RestoreIndex = {
  name: "idx_workouts_single_active", table: "workouts", columns: [null],
  origin: "c", unique: 1, partial: 1,
  sql: "CREATE UNIQUE INDEX idx_workouts_single_active ON workouts((1)) WHERE completed_at IS NULL",
};
const exercisesImplicitIndex = implicitUniqueIndex("sqlite_autoindex_exercises_1", "exercises", "name");
const baseFixtureIndexes = currentDeclaredIndexes.slice(0, 13);

const e9ee8edTables = {
  settings: [settingsE9ee8ed], exercises: [exercisesE9ee8ed], workouts: [workoutsE9ee8ed],
  workout_exercises: [workoutExercisesE9ee8ed], sets: [setsE9ee8ed], pr_events: [prEventsE9ee8ed],
  tags: [tags], taggings: [taggings], media: [mediaE9ee8ed],
  exercise_formula_overrides: [exerciseFormulaOverrides], programs: [programs], program_days: [programDays],
  program_exercises: [programExercises], progressions: [progressions], planned_workouts: [plannedWorkouts],
} as const;
const e9ee8edIndexes = [
  ...baseFixtureIndexes.slice(0, 5),
  declaredIndex("idx_workout_exercises_order", "workout_exercises", ["workout_id", "order_index"]),
  declaredIndex("idx_pr_events_exercise_time", "pr_events", ["exercise_id", "occurred_at"]),
  declaredIndex("idx_planned_workouts_date", "planned_workouts", ["planned_for"]),
  tagsImplicitIndex, exercisesImplicitIndex,
  implicitUniqueIndex("sqlite_autoindex_programs_1", "programs", "name"),
] as const;

const SOURCE_OPTIONAL_TABLES = [
  "settings", "user_checkins", "psl_programs", "program_calendar", "program_calendar_exercises",
  "program_calendar_sets", "pr_events", "tags", "taggings", "media", "exercise_formula_overrides",
] as const;
const CORE_TABLES = ["exercises", "workouts", "workout_exercises", "sets"] as const;

export const CURRENT_SCHEMA_PROFILES: readonly RestoreSchemaProfile[] = [
  {
    id: "current-canonical-and-five-exercise-layouts",
    indexes: [...currentDeclaredIndexes, tagsImplicitIndex, singleActiveWorkoutIndex], optionalTables: [],
    requiredTables: Object.keys(canonicalCurrentTables), tables: { ...canonicalCurrentTables, workouts: [namedWorkoutsCurrent] },
  },
  {
    id: "e9ee8ed-migrated-current",
    indexes: [...currentDeclaredIndexes, tagsImplicitIndex, singleActiveWorkoutIndex], optionalTables: [],
    requiredTables: Object.keys(e9ee8edMigratedCurrentTables), tables: { ...e9ee8edMigratedCurrentTables, workouts: [namedWorkoutsUidAppended] },
  },
];

const legacyIndexedExercises = [exercisesLegacy[0], exercisesLegacy[1], exercisesLegacy[3]];
const legacyFixtureTables = {
  ...canonicalCurrentTables,
  exercises: legacyIndexedExercises,
} as const;
const legacyPreIndexFixtureTables = {
  ...canonicalCurrentTables,
  exercises: [exercisesLegacy[2]],
} as const;
const direct0923FixtureTables = {
  ...canonicalCurrentTables,
  exercises: [exercisesE9ee8ed],
} as const;

export const SOURCE_SCHEMA_PROFILES: readonly RestoreSchemaProfile[] = [
  ...CURRENT_SCHEMA_PROFILES.map((profile) => ({
    ...profile, id: `${profile.id}-named-workout-source`,
    optionalTables: SOURCE_OPTIONAL_TABLES, requiredTables: CORE_TABLES,
  })),
  {
    id: "mvp003b-production-fixtures-indexed",
    indexes: [
      ...baseFixtureIndexes,
      declaredIndex("idx_exercises_uid", "exercises", ["uid"], 1),
      declaredIndex("idx_exercises_parent_exercise_id", "exercises", ["parent_exercise_id"]),
      tagsImplicitIndex, exercisesImplicitIndex,
    ],
    optionalTables: SOURCE_OPTIONAL_TABLES, requiredTables: CORE_TABLES, tables: legacyFixtureTables,
  },
  {
    id: "mvp003b-production-fixtures-pre-index",
    indexes: [...baseFixtureIndexes, tagsImplicitIndex, exercisesImplicitIndex],
    optionalTables: SOURCE_OPTIONAL_TABLES, requiredTables: CORE_TABLES, tables: legacyPreIndexFixtureTables,
  },
  {
    id: "0923b8d-production-fixture-pre-column-migration",
    indexes: [...baseFixtureIndexes, tagsImplicitIndex, exercisesImplicitIndex],
    optionalTables: SOURCE_OPTIONAL_TABLES, requiredTables: CORE_TABLES, tables: direct0923FixtureTables,
  },
  {
    id: "current-supported-source",
    indexes: [...currentDeclaredIndexes, tagsImplicitIndex],
    optionalTables: SOURCE_OPTIONAL_TABLES, requiredTables: CORE_TABLES, tables: canonicalCurrentTables,
  },
  {
    id: "e9ee8ed-migrated-supported-source",
    indexes: [...currentDeclaredIndexes, tagsImplicitIndex],
    optionalTables: SOURCE_OPTIONAL_TABLES,
    requiredTables: CORE_TABLES,
    tables: e9ee8edMigratedCurrentTables,
  },
  {
    id: "e9ee8ed-fresh-historical",
    indexes: e9ee8edIndexes,
    optionalTables: [
      "settings", "pr_events", "tags", "taggings", "media", "exercise_formula_overrides",
      "programs", "program_days", "program_exercises", "progressions", "planned_workouts",
    ],
    requiredTables: CORE_TABLES, tables: e9ee8edTables,
  },
];
