import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const exercises = sqliteTable("exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  muscleGroup: text("muscle_group"),
  equipment: text("equipment"),
  isBodyweight: integer("is_bodyweight", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at"),
});

export const workouts = sqliteTable("workouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at").notNull(),
  completedAt: integer("completed_at"),
  note: text("note"),
});

export const workoutExercises = sqliteTable("workout_exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workoutId: integer("workout_id").notNull(),
  exerciseId: integer("exercise_id").notNull(),
  orderIndex: integer("order_index"),
  note: text("note"),
});

export const sets = sqliteTable("sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export type ExerciseRow = typeof exercises.$inferSelect;
export type WorkoutRow = typeof workouts.$inferSelect;
export type WorkoutExerciseRow = typeof workoutExercises.$inferSelect;
export type SetRow = typeof sets.$inferSelect;


