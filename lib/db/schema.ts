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

// Programs
export const programs = sqliteTable("programs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at"),
});

export const programDays = sqliteTable("program_days", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  programId: integer("program_id").notNull(),
  schedule: text("schedule").notNull(), // "weekly" | "interval"
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly
  intervalDays: integer("interval_days"), // for interval schedule
  note: text("note"),
});

export const programExercises = sqliteTable("program_exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  programDayId: integer("program_day_id").notNull(),
  exerciseId: integer("exercise_id").notNull(),
  orderIndex: integer("order_index"),
  prescriptionJson: text("prescription_json"),
});

export const progressions = sqliteTable("progressions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  programExerciseId: integer("program_exercise_id").notNull(),
  type: text("type").notNull(), // "kg_per_session" | "percent_per_session" | "double_progression" | "autoreg_rpe"
  value: real("value").notNull(),
  cadence: text("cadence").notNull(), // "every_session" | "weekly" | "every_2_exposures"
  capKg: real("cap_kg"),
});

export const plannedWorkouts = sqliteTable("planned_workouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  programId: integer("program_id").notNull(),
  programDayId: integer("program_day_id").notNull(),
  plannedFor: integer("planned_for").notNull(),
  note: text("note"),
});

export type ExerciseRow = typeof exercises.$inferSelect;
export type WorkoutRow = typeof workouts.$inferSelect;
export type WorkoutExerciseRow = typeof workoutExercises.$inferSelect;
export type SetRow = typeof sets.$inferSelect;
export type PREventRow = typeof prEvents.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type ProgramRow = typeof programs.$inferSelect;
export type ProgramDayRow = typeof programDays.$inferSelect;
export type ProgramExerciseRow = typeof programExercises.$inferSelect;
export type ProgressionRow = typeof progressions.$inferSelect;
export type PlannedWorkoutRow = typeof plannedWorkouts.$inferSelect;