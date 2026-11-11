import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const syncSequence = pgSequence("core_sync_seq");

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    name: text("name").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("devices_owner_idx").on(table.ownerId)],
);

export const documents = pgTable(
  "documents",
  {
    ownerId: uuid("owner_id").notNull(),
    collection: text("collection").notNull(),
    id: text("id").notNull(),
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    serverSeq: bigint("server_seq", { mode: "number" })
      .notNull()
      .default(sql`nextval('core_sync_seq')`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.collection, table.id] }),
    index("documents_owner_seq_idx").on(table.ownerId, table.serverSeq),
  ],
);

export const muscleGroups = pgTable("muscle_groups", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
});

export const exercises = pgTable(
  "exercises",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    muscleGroupId: integer("muscle_group_id")
      .notNull()
      .references(() => muscleGroups.id),
    name: text("name").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("exercises_muscle_group_idx").on(table.muscleGroupId)],
);

export const routines = pgTable(
  "routines",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => devices.id),
    name: text("name").notNull(),
    active: integer("active").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("routines_owner_idx").on(table.ownerId)],
);

export const routineDays = pgTable(
  "routine_days",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    routineId: integer("routine_id")
      .notNull()
      .references(() => routines.id),
    weekday: integer("weekday").notNull(),
  },
  (table) => [
    index("routine_days_routine_idx").on(table.routineId),
    index("routine_days_weekday_idx").on(table.weekday),
  ],
);

export const routineExercises = pgTable(
  "routine_exercises",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    routineDayId: integer("routine_day_id")
      .notNull()
      .references(() => routineDays.id),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id),
    position: integer("position").notNull(),
    targetSets: integer("target_sets"),
    targetRepsMin: integer("target_reps_min"),
    targetRepsMax: integer("target_reps_max"),
  },
  (table) => [
    index("routine_exercises_day_idx").on(table.routineDayId),
    index("routine_exercises_exercise_idx").on(table.exerciseId),
  ],
);

export const workouts = pgTable(
  "workouts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => devices.id),
    routineDayId: integer("routine_day_id").references(() => routineDays.id),
    startedAt: bigint("started_at", { mode: "number" }).notNull(),
    endedAt: bigint("ended_at", { mode: "number" }),
    durationSeconds: bigint("duration_seconds", { mode: "number" }),
  },
  (table) => [
    index("workouts_owner_idx").on(table.ownerId),
    index("workouts_routine_day_idx").on(table.routineDayId),
  ],
);

export const workoutExercises = pgTable(
  "workout_exercises",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    workoutId: integer("workout_id")
      .notNull()
      .references(() => workouts.id),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id),
    position: integer("position").notNull(),
  },
  (table) => [
    index("workout_exercises_workout_idx").on(table.workoutId),
    index("workout_exercises_exercise_idx").on(table.exerciseId),
  ],
);

export const workoutSets = pgTable(
  "workout_sets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    workoutExerciseId: integer("workout_exercise_id")
      .notNull()
      .references(() => workoutExercises.id),
    setNumber: integer("set_number").notNull(),
    reps: integer("reps").notNull(),
    weight: integer("weight").notNull(),
  },
  (table) => [
    index("workout_sets_workout_exercise_idx").on(table.workoutExerciseId),
  ],
);

export const bodyWeights = pgTable(
  "body_weights",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => devices.id),
    date: text("date").notNull(),
    weight: integer("weight").notNull(),
  },
  (table) => [
    index("body_weights_owner_idx").on(table.ownerId),
    index("body_weights_date_idx").on(table.date),
  ],
);
