import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const exercises = sqliteTable("exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uid: text("uid"),
  name: text("name").notNull().unique(),
  description: text("description"),
  muscleGroup: text("muscle_group"),
  equipment: text("equipment"),
  isBodyweight: integer("is_bodyweight", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at"),
  lastRestSeconds: integer("last_rest_seconds"),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
});

export const workouts = sqliteTable("workouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uid: text("uid"),
  startedAt: integer("started_at").notNull(),
  completedAt: integer("completed_at"),
  note: text("note"),
});

export const workoutExercises = sqliteTable("workout_exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uid: text("uid"),
  workoutId: integer("workout_id").notNull(),
  exerciseId: integer("exercise_id").notNull(),
  orderIndex: integer("order_index"),
  note: text("note"),
  currentWeight: real("current_weight"),
  currentReps: integer("current_reps"),
  completedAt: integer("completed_at"),
  performedAt: integer("performed_at"),
});

export const sets = sqliteTable("sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uid: text("uid"),
  workoutId: integer("workout_id").notNull(),
  exerciseId: integer("exercise_id").notNull(),
  workoutExerciseId: integer("workout_exercise_id"),
  setGroupId: text("set_group_id"),
  setIndex: integer("set_index"),
  weightKg: real("weight_kg"),
  reps: integer("reps"),
  rpe: real("rpe"),
  rir: real("rir"),
  isWarmup: integer("is_warmup", { mode: "boolean" }).notNull().default(false),
  note: text("note"),
  supersetGroupId: text("superset_group_id"),
  performedAt: integer("performed_at"),
});

export const prEvents = sqliteTable("pr_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uid: text("uid"),
  setId: integer("set_id").notNull(),
  exerciseId: integer("exercise_id").notNull(),
  type: text("type").notNull(), // "1rm", "2rm", "3rm", etc.
  metricValue: real("metric_value").notNull(), // the weight achieved
  occurredAt: integer("occurred_at").notNull(),
});

export const media = sqliteTable("media", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  localUri: text("local_uri").notNull(),
  assetId: text("asset_id"),
  mime: text("mime"),
  setId: integer("set_id"),
  workoutId: integer("workout_id"),
  note: text("note"),
  createdAt: integer("created_at"),
  // Metadata for re-discovery after reinstall
  originalFilename: text("original_filename"),
  mediaCreatedAt: integer("media_created_at"), // Video file creation timestamp
  durationMs: integer("duration_ms"),
  albumName: text("album_name"),
});

// PSL Programs
export const pslPrograms = sqliteTable("psl_programs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  pslSource: text("psl_source").notNull(),
  compiledHash: text("compiled_hash"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  startDate: text("start_date"),
  endDate: text("end_date"),
  units: text("units"),
  createdAt: integer("created_at"),
  updatedAt: integer("updated_at"),
});

export const programCalendar = sqliteTable("program_calendar", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  programId: integer("program_id").notNull(),
  pslSessionId: text("psl_session_id").notNull(),
  sessionName: text("session_name").notNull(),
  dateIso: text("date_iso").notNull(),
  sequence: integer("sequence").notNull(),
  status: text("status").notNull().default("pending"),
  completedAt: integer("completed_at"),
});

export const programCalendarExercises = sqliteTable("program_calendar_exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  calendarId: integer("calendar_id").notNull(),
  exerciseName: text("exercise_name").notNull(),
  exerciseId: integer("exercise_id"),
  orderIndex: integer("order_index").notNull(),
  prescribedSetsJson: text("prescribed_sets_json").notNull(),
  status: text("status").notNull().default("pending"),
  workoutExerciseId: integer("workout_exercise_id"),
});

export const programCalendarSets = sqliteTable("program_calendar_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  calendarExerciseId: integer("calendar_exercise_id").notNull(),
  setIndex: integer("set_index").notNull(),
  prescribedReps: text("prescribed_reps"),
  prescribedIntensityJson: text("prescribed_intensity_json"),
  prescribedRole: text("prescribed_role"),
  actualWeight: real("actual_weight"),
  actualReps: integer("actual_reps"),
  actualRpe: real("actual_rpe"),
  isUserAdded: integer("is_user_added", { mode: "boolean" }).notNull().default(false),
  isLogged: integer("is_logged", { mode: "boolean" }).notNull().default(false),
  setId: integer("set_id"),
  loggedAt: integer("logged_at"),
});

export type ExerciseRow = typeof exercises.$inferSelect;
export type WorkoutRow = typeof workouts.$inferSelect;
export type WorkoutExerciseRow = typeof workoutExercises.$inferSelect;
export type SetRow = typeof sets.$inferSelect;
export type PREventRow = typeof prEvents.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type PslProgramRow = typeof pslPrograms.$inferSelect;
export type ProgramCalendarRow = typeof programCalendar.$inferSelect;
export type ProgramCalendarExerciseRow = typeof programCalendarExercises.$inferSelect;
export type ProgramCalendarSetRow = typeof programCalendarSets.$inferSelect;