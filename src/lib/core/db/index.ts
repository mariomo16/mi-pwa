import Dexie, { type Table } from "dexie";

export type LocalDocument<T = Record<string, unknown>> = {
  key: string;
  collection: string;
  id: string;
  data: T;
  updatedAt: number;
  deletedAt: number | null;
  serverSeq: number;
  dirty: 0 | 1;
  rev: number;
};

export type MetaRecord = {
  key: string;
  value: string;
};

export function documentKey(collection: string, id: string): string {
  return `${collection}:${id}`;
}

class CoreDatabase extends Dexie {
  documents!: Table<LocalDocument, string>;
  meta!: Table<MetaRecord, string>;
  gymbro_muscle_groups!: Table<LocalDocument, string>;
  gymbro_exercises!: Table<LocalDocument, string>;
  gymbro_routines!: Table<LocalDocument, string>;
  gymbro_routine_days!: Table<LocalDocument, string>;
  gymbro_routine_exercises!: Table<LocalDocument, string>;
  gymbro_workouts!: Table<LocalDocument, string>;
  gymbro_workout_exercises!: Table<LocalDocument, string>;
  gymbro_workout_sets!: Table<LocalDocument, string>;
  gymbro_body_weights!: Table<LocalDocument, string>;

  constructor() {
    super("core");
    this.version(2).stores({
      documents: "key, collection, dirty, serverSeq, updatedAt",
      meta: "key",
      gymbro_muscle_groups:
        "key, collection, dirty, serverSeq, updatedAt, data.muscle_group_id, data.deletedAt",
      gymbro_exercises:
        "key, collection, dirty, serverSeq, updatedAt, data.muscle_group_id, data.deletedAt",
      gymbro_routines:
        "key, collection, dirty, serverSeq, updatedAt, data.owner_id, data.active, data.deletedAt",
      gymbro_routine_days:
        "key, collection, dirty, serverSeq, updatedAt, data.routine_id, data.weekday, data.deletedAt",
      gymbro_routine_exercises:
        "key, collection, dirty, serverSeq, updatedAt, data.routine_day_id, data.exercise_id, data.deletedAt",
      gymbro_workouts:
        "key, collection, dirty, serverSeq, updatedAt, data.owner_id, data.ended_at, data.started_at, data.routine_day_id, data.deletedAt",
      gymbro_workout_exercises:
        "key, collection, dirty, serverSeq, updatedAt, data.workout_id, data.exercise_id, data.deletedAt",
      gymbro_workout_sets:
        "key, collection, dirty, serverSeq, updatedAt, data.workout_exercise_id, data.deletedAt",
      gymbro_body_weights:
        "key, collection, dirty, serverSeq, updatedAt, data.owner_id, data.date, data.deletedAt",
    });
  }
}

export const db = new CoreDatabase();

export async function getMeta(key: string): Promise<string | null> {
  const record = await db.meta.get(key);
  return record?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

export async function deleteMeta(key: string): Promise<void> {
  await db.meta.delete(key);
}
