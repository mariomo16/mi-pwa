import { z } from "zod";
import { db, documentKey, type LocalDocument } from "#lib/core/db/index.js";
import { syncEngine } from "#lib/core/sync/engine.js";
import {
  collectionSchema,
  documentIdSchema,
  timestampSchema,
} from "#lib/core/sync/protocol.js";

export const GYMBRO_DB = "gymbro";

export const COL_EXERCISES = "gymbro_exercises";
export const COL_MUSCLE_GROUPS = "gymbro_muscle_groups";
export const COL_ROUTINES = "gymbro_routines";
export const COL_ROUTINE_DAYS = "gymbro_routine_days";
export const COL_ROUTINE_EXERCISES = "gymbro_routine_exercises";
export const COL_WORKOUTS = "gymbro_workouts";
export const COL_WORKOUT_EXERCISES = "gymbro_workout_exercises";
export const COL_WORKOUT_SETS = "gymbro_workout_sets";
export const COL_BODY_WEIGHTS = "gymbro_body_weights";

export type MuscleGroup = { id: number; name: string };
export type ExerciseLite = {
  id: number;
  name: string;
  muscle_group_id: number;
};
export type RoutineDayRow = {
  weekday: number;
  rows: {
    exercise: ExerciseLite;
    target_sets: number | null;
    target_reps_min: number | null;
    target_reps_max: number | null;
  }[];
};
export type WorkoutSet = {
  id: number;
  workout_exercise_id: number;
  set_number: number;
  reps: number;
  weight: number;
};
export type WorkoutExercise = {
  id: number;
  exercise_id: number;
  name: string;
  muscle_group_id: number;
  position: number;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
};

const DEFAULT_MUSCLE_GROUPS = [
  "Pecho",
  "Espalda",
  "Trapecio",
  "Hombros",
  "Bíceps",
  "Tríceps",
  "Antebrazos",
  "Cuádriceps",
  "Isquiosurales",
  "Glúteos",
  "Gemelos",
  "Core",
];

export async function ensureSeedData(): Promise<void> {
  const existing = await db[COL_MUSCLE_GROUPS].toArray();
  if (existing.length > 0) return;

  await db.transaction("rw", db[COL_MUSCLE_GROUPS], async () => {
    DEFAULT_MUSCLE_GROUPS.forEach((name, i) => {
      const key = documentKey(COL_MUSCLE_GROUPS, String(i + 1));
      db[COL_MUSCLE_GROUPS].put({
        key,
        collection: COL_MUSCLE_GROUPS,
        id: String(i + 1),
        data: { name },
        updatedAt: Date.now(),
        deletedAt: null,
        serverSeq: 0,
        dirty: 1,
        rev: 1,
      });
    });
  });

  void syncEngine.notifyLocalChange();
}

export async function getMuscleGroups(): Promise<MuscleGroup[]> {
  await ensureSeedData();
  return db[COL_MUSCLE_GROUPS]
    .toArray()
    .then((rows) =>
      rows
        .filter((r) => r.deletedAt === null)
        .map((r) => ({ id: Number(r.id), name: r.data.name as string })),
    );
}

export async function getExercises(): Promise<ExerciseLite[]> {
  await ensureSeedData();
  return db[COL_EXERCISES].toArray().then((rows) =>
    rows
      .filter((r) => r.deletedAt === null)
      .map((r) => ({
        id: Number(r.id),
        name: r.data.name as string,
        muscle_group_id: Number(r.data.muscle_group_id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
}

export async function createExercise(input: {
  name: string;
  muscleGroupId: number;
}): Promise<ExerciseLite> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) {
    throw new Error("El nombre debe tener entre 2 y 60 caracteres.");
  }

  const dup = await db[COL_EXERCISES]
    .where("data")
    .equalsIgnoreCase(name)
    .first();
  if (dup) {
    throw new Error("Ya existe un ejercicio con ese nombre.");
  }

  const max = await db[COL_EXERCISES].orderBy("id").last();
  const nextId = (max ? Number(max.id) : 0) + 1;
  const key = documentKey(COL_EXERCISES, String(nextId));
  const now = Date.now();

  const doc: LocalDocument = {
    key,
    collection: COL_EXERCISES,
    id: String(nextId),
    data: { name, muscle_group_id: input.muscleGroupId },
    updatedAt: now,
    deletedAt: null,
    serverSeq: 0,
    dirty: 1,
    rev: 1,
  };

  await db[COL_EXERCISES].put(doc);
  syncEngine.notifyLocalChange();

  return { id: nextId, name, muscle_group_id: input.muscleGroupId };
}

export async function deleteExercise(exerciseId: number): Promise<void> {
  const inRoutine = await db[COL_ROUTINE_EXERCISES]
    .where("data")
    .equalsIgnoreCase(String(exerciseId))
    .first();
  const inWorkout = await db[COL_WORKOUT_EXERCISES]
    .where("data")
    .equalsIgnoreCase(String(exerciseId))
    .first();
  if (inRoutine || inWorkout) {
    throw new Error(
      "No se puede borrar: está en uso en rutinas o entrenamientos.",
    );
  }

  await db[COL_EXERCISES]
    .where("id")
    .equals(String(exerciseId))
    .modify((d) => {
      d.deletedAt = Date.now();
      d.dirty = 1;
      d.rev = (d.rev ?? 0) + 1;
    });
  syncEngine.notifyLocalChange();
}

export async function getActiveWorkout(ownerId: string) {
  const rows = await db[COL_WORKOUTS]
    .where("data.owner_id")
    .equalsIgnoreCase(ownerId)
    .and((d) => d.data.ended_at === null)
    .sortBy("data.started_at")
    .then((arr) => arr.reverse());
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: Number(row.id),
    started_at: Number(row.data.started_at),
    routine_day_id: row.data.routine_day_id
      ? Number(row.data.routine_day_id)
      : null,
  };
}

export type TodayDay = {
  routine_day_id: number;
  routine_name: string;
  exercises: {
    exercise_id: number;
    exercise_name: string;
    muscle_group_id: number;
    target_sets: number | null;
    target_reps_min: number | null;
    target_reps_max: number | null;
  }[];
};

export function getRoutineDaysForWeekday(
  ownerId: string,
  weekday: number,
): Promise<TodayDay[]> {
  return db.transaction(
    "r",
    db[COL_ROUTINE_DAYS],
    db[COL_ROUTINES],
    async () => {
      const days = await db[COL_ROUTINE_DAYS]
        .where("data.weekday")
        .equals(weekday)
        .toArray();

      const routineIds = new Set(
        days.map((d) => Number(d.data.routine_id)).filter((id) => id > 0),
      );

      const routines = await db.gymbro_routines
        .where("data.owner_id")
        .equalsIgnoreCase(ownerId)
        .filter(
          (r) =>
            routineIds.has(Number(r.id)) && Boolean(r.data.active ?? false),
        )
        .toArray();

      const activeRoutineIds = new Set(routines.map((r) => Number(r.id)));

      const filteredDays = days.filter((d) =>
        activeRoutineIds.has(Number(d.data.routine_id)),
      );

      const result: TodayDay[] = [];
      for (const d of filteredDays) {
        const routine = routines.find(
          (r) => Number(r.id) === Number(d.data.routine_id),
        );
        const exRows = await db[COL_ROUTINE_EXERCISES]
          .where("data.routine_day_id")
          .equals(Number(d.id))
          .sortBy("data.position");

        const exercises = await Promise.all(
          exRows.map(async (rex) => {
            const ex = await db.gymbro_exercises.get(
              String(rex.data.exercise_id),
            );
            return {
              exercise_id: Number(rex.data.exercise_id),
              exercise_name: String(ex?.data.name ?? "Ejercicio"),
              muscle_group_id: Number(rex.data.muscle_group_id ?? 0),
              target_sets: rex.data.target_sets
                ? Number(rex.data.target_sets)
                : null,
              target_reps_min: rex.data.target_reps_min
                ? Number(rex.data.target_reps_min)
                : null,
              target_reps_max: rex.data.target_reps_max
                ? Number(rex.data.target_reps_max)
                : null,
            };
          }),
        );

        result.push({
          routine_day_id: Number(d.id),
          routine_name: String(routine?.data.name ?? "Rutina"),
          exercises,
        });
      }
      return result;
    },
  );
}

export async function getNextTrainingDay(ownerId: string) {
  const days = ["L", "M", "X", "J", "V", "S", "D"];
  const start = (new Date().getDay() + 6) % 7;
  for (let i = 1; i <= 7; i++) {
    const wd = (start + i) % 7;
    const hit = await db[COL_ROUTINE_DAYS]
      .where("data.weekday")
      .equals(wd)
      .toArray();
    if (hit.length > 0) {
      const routineIds = hit.map((d) => Number(d.data.routine_id));
      const routines = await db[COL_ROUTINES]
        .where("data.owner_id")
        .equalsIgnoreCase(ownerId)
        .filter(
          (r) =>
            routineIds.includes(Number(r.id)) &&
            Boolean(r.data.active ?? false),
        )
        .toArray();
      if (routines.length > 0) return { weekday: wd };
    }
  }
  return null;
}

export async function getDoneRoutineDayIdsToday(
  ownerId: string,
): Promise<number[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const rows = await db[COL_WORKOUTS]
    .where("data.owner_id")
    .equalsIgnoreCase(ownerId)
    .and((d) => d.data.ended_at !== null)
    .and((d) => Number(d.data.started_at) >= startOfDay.getTime())
    .and((d) => d.data.routine_day_id != null)
    .toArray();
  return [...new Set(rows.map((r) => Number(r.data.routine_day_id)))];
}

export type WorkoutSummary = {
  id: number;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number | null;
  volume: number;
  sets: number;
  exercises_count: number;
  title: string | null;
};

export async function getRecentWorkouts(
  ownerId: string,
  limit = 10,
): Promise<WorkoutSummary[]> {
  const rows = await db[COL_WORKOUTS]
    .where("data.owner_id")
    .equalsIgnoreCase(ownerId)
    .and((d) => d.data.ended_at !== null)
    .toArray();

  const summaries = await Promise.all(
    rows.map(async (row) => {
      const id = Number(row.id);
      const sets = await db[COL_WORKOUT_SETS]
        .where("data.workout_exercise_id")
        .above(0)
        .toArray();
      const weRows = await db[COL_WORKOUT_EXERCISES]
        .where("data.workout_id")
        .equals(id)
        .toArray();

      const setsForWe = sets.filter((s) =>
        weRows.some((we) => Number(we.id) === s.data.workout_exercise_id),
      );

      const volume = setsForWe.reduce(
        (a, s) => a + Number(s.data.reps) * Number(s.data.weight),
        0,
      );

      let title: string | null = null;
      if (row.data.routine_day_id) {
        const rd = await db[COL_ROUTINE_DAYS].get(
          String(row.data.routine_day_id),
        );
        if (rd) {
          const r = await db[COL_ROUTINES].get(String(rd.data.routine_id));
          title = String(r?.data.name ?? null);
        }
      }

      const startedAt = Number(row.data.started_at);
      const endedAt = Number(row.data.ended_at);
      let durationSeconds = row.data.duration_seconds
        ? Number(row.data.duration_seconds)
        : null;

      // If duration_seconds is corrupt, calculate from started_at and ended_at
      if (
        (!durationSeconds || durationSeconds <= 0 || durationSeconds > 86400) &&
        startedAt > 0 &&
        endedAt > startedAt
      ) {
        durationSeconds = Math.round((endedAt - startedAt) / 1000);
      }

      return {
        id,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        volume,
        sets: setsForWe.length,
        exercises_count: weRows.length,
        title,
      };
    }),
  );

  return summaries.sort((a, b) => b.ended_at - a.ended_at).slice(0, limit);
}

export type WeightEntry = { id: number; date: string; weight: number };

export async function getWeightEntries(
  ownerId: string,
): Promise<WeightEntry[]> {
  const rows = await db[COL_BODY_WEIGHTS]
    .where("data.owner_id")
    .equalsIgnoreCase(ownerId)
    .sortBy("data.date");
  return rows.map((r) => ({
    id: Number(r.id),
    date: r.data.date as string,
    weight: Number(r.data.weight),
  }));
}

export async function saveWeightEntry(
  ownerId: string,
  input: {
    date: string;
    weight: number;
  },
): Promise<{ weight: number; date: string }> {
  const date = input.date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Fecha inválida.");
  }
  const weight = Number(input.weight);
  if (!Number.isFinite(weight) || weight < 20 || weight > 400) {
    throw new Error("Peso inválido (20–400 kg).");
  }

  const existing = await db[COL_BODY_WEIGHTS]
    .where("data.owner_id")
    .equalsIgnoreCase(ownerId)
    .and((d) => d.data.date === date)
    .first();

  const now = Date.now();
  if (existing) {
    await db[COL_BODY_WEIGHTS].update(existing.id, {
      data: { ...existing.data, weight },
      updatedAt: now,
      dirty: 1,
      rev: (existing.rev ?? 0) + 1,
    });
  } else {
    const max = await db[COL_BODY_WEIGHTS].orderBy("id").last();
    const nextId = (max ? Number(max.id) : 0) + 1;
    const key = documentKey(COL_BODY_WEIGHTS, String(nextId));
    await db[COL_BODY_WEIGHTS].put({
      key,
      collection: COL_BODY_WEIGHTS,
      id: String(nextId),
      data: { owner_id: ownerId, date, weight },
      updatedAt: now,
      deletedAt: null,
      serverSeq: 0,
      dirty: 1,
      rev: 1,
    });
  }

  syncEngine.notifyLocalChange();
  return { weight, date };
}

export async function getWeightOnDate(
  ownerId: string,
  date: string,
): Promise<number | null> {
  const row = await db[COL_BODY_WEIGHTS]
    .where("data.owner_id")
    .equalsIgnoreCase(ownerId)
    .and((d) => d.data.date === date)
    .first();
  return row ? Number(row.data.weight) : null;
}

export async function deleteWeightEntry(id: number): Promise<void> {
  await db[COL_BODY_WEIGHTS]
    .where("id")
    .equals(String(id))
    .modify((d) => {
      d.deletedAt = Date.now();
      d.dirty = 1;
      d.rev = (d.rev ?? 0) + 1;
    });
  syncEngine.notifyLocalChange();
}

export async function getLastSetForExercise(
  ownerId: string,
  exerciseId: number,
): Promise<{ reps: number; weight: number } | null> {
  const weRows = await db[COL_WORKOUT_EXERCISES]
    .where("data.exercise_id")
    .equalsIgnoreCase(String(exerciseId))
    .toArray();

  const workoutIds = weRows.map((we) => Number(we.data.workout_id));
  const workouts = await db[COL_WORKOUTS]
    .where("data.owner_id")
    .equalsIgnoreCase(ownerId)
    .filter(
      (w) => workoutIds.includes(Number(w.id)) && w.data.ended_at !== null,
    )
    .toArray();

  const activeWorkoutIds = new Set(workouts.map((w) => Number(w.id)));
  const relevantWe = weRows.filter((we) =>
    activeWorkoutIds.has(Number(we.data.workout_id)),
  );

  const allSets: {
    id: number;
    reps: number;
    weight: number;
    workoutId: number;
  }[] = [];
  for (const we of relevantWe) {
    const sets = await db[COL_WORKOUT_SETS]
      .where("data.workout_exercise_id")
      .equalsIgnoreCase(String(we.id))
      .toArray();
    for (const s of sets) {
      allSets.push({
        id: Number(s.id),
        reps: Number(s.data.reps),
        weight: Number(s.data.weight),
        workoutId: Number(we.data.workout_id),
      });
    }
  }

  allSets.sort((a, b) => b.id - a.id);
  if (allSets.length === 0) return null;
  return { reps: allSets[0].reps, weight: allSets[0].weight };
}

export async function getWorkoutSets(workoutId: number): Promise<WorkoutSet[]> {
  const weRows = await db[COL_WORKOUT_EXERCISES]
    .where("data.workout_id")
    .equalsIgnoreCase(String(workoutId))
    .toArray();
  const weIds = weRows.map((we) => String(we.id));
  const rows = await db.gymbro_workout_sets
    .where("data.workout_exercise_id")
    .anyOfIgnoreCase(weIds)
    .toArray()
    .then((arr) =>
      arr.sort((a: any, b: any) => {
        const aWe = Number(a.data.workout_exercise_id);
        const bWe = Number(b.data.workout_exercise_id);
        if (aWe !== bWe) return aWe - bWe;
        const aSet = Number(a.data.set_number);
        const bSet = Number(b.data.set_number);
        if (aSet !== bSet) return aSet - bSet;
        return Number(a.id) - Number(b.id);
      }),
    );
  return (rows as any[]).map((s) => ({
    id: Number(s.id),
    workout_exercise_id: Number(s.data.workout_exercise_id),
    set_number: Number(s.data.set_number),
    reps: Number(s.data.reps),
    weight: Number(s.data.weight),
  }));
}
