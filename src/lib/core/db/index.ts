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

  constructor() {
    super("core");
    this.version(1).stores({
      documents: "key, collection, dirty, serverSeq, updatedAt",
      meta: "key",
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
