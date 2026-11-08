import { beforeEach, describe, expect, it } from "vitest";
import { db, documentKey, type LocalDocument } from "#lib/core/db/index.js";
import { syncEngine } from "#lib/core/sync/engine.js";
import type { SyncDocument } from "#lib/core/sync/protocol.js";

type MergeableEngine = {
  mergeServerDocuments(documents: SyncDocument[]): Promise<void>;
};

const engine = syncEngine as unknown as MergeableEngine;
const collection = "profile";
const id = "me";
const key = documentKey(collection, id);

function local(overrides: Partial<LocalDocument> = {}): LocalDocument {
  return {
    key,
    collection,
    id,
    data: { name: "Local" },
    updatedAt: 100,
    deletedAt: null,
    serverSeq: 3,
    dirty: 1,
    rev: 2,
    ...overrides,
  };
}

function remote(overrides: Partial<SyncDocument> = {}): SyncDocument {
  return {
    collection,
    id,
    data: { name: "Remoto" },
    updatedAt: 200,
    deletedAt: null,
    serverSeq: 10,
    ...overrides,
  };
}

describe("sync merge", () => {
  beforeEach(async () => {
    await db.documents.clear();
    await db.meta.clear();
  });

  it("inserts server documents that do not exist locally", async () => {
    await engine.mergeServerDocuments([remote()]);
    const stored = await db.documents.get(key);

    expect(stored).toMatchObject({
      data: { name: "Remoto" },
      updatedAt: 200,
      serverSeq: 10,
      dirty: 0,
      rev: 0,
    });
  });

  it("keeps a newer dirty local document", async () => {
    await db.documents.put(local({ updatedAt: 300 }));

    await engine.mergeServerDocuments([remote({ updatedAt: 200 })]);

    expect(await db.documents.get(key)).toMatchObject({
      data: { name: "Local" },
      updatedAt: 300,
      dirty: 1,
      rev: 2,
    });
  });

  it("accepts the server version when it is newer", async () => {
    await db.documents.put(local({ updatedAt: 100 }));

    await engine.mergeServerDocuments([remote({ updatedAt: 200 })]);

    expect(await db.documents.get(key)).toMatchObject({
      data: { name: "Remoto" },
      updatedAt: 200,
      serverSeq: 10,
      dirty: 0,
      rev: 3,
    });
  });

  it("lets the server win when timestamps are equal", async () => {
    await db.documents.put(local({ updatedAt: 200 }));

    await engine.mergeServerDocuments([remote({ updatedAt: 200 })]);

    expect(await db.documents.get(key)).toMatchObject({
      data: { name: "Remoto" },
      dirty: 0,
    });
  });

  it("applies remote deletions over clean local documents", async () => {
    await db.documents.put(local({ dirty: 0 }));

    await engine.mergeServerDocuments([
      remote({ deletedAt: 200, data: {}, updatedAt: 200 }),
    ]);

    expect(await db.documents.get(key)).toBeUndefined();
  });

  it("keeps a newer dirty local document when the server deleted an older version", async () => {
    await db.documents.put(local({ updatedAt: 300 }));

    await engine.mergeServerDocuments([
      remote({ deletedAt: 200, data: {}, updatedAt: 200 }),
    ]);

    expect(await db.documents.get(key)).toMatchObject({
      data: { name: "Local" },
      dirty: 1,
    });
  });

  it("ignores remote deletions for missing documents", async () => {
    await engine.mergeServerDocuments([
      remote({ deletedAt: 200, data: {}, updatedAt: 200 }),
    ]);

    expect(await db.documents.get(key)).toBeUndefined();
  });

  it("keeps the last copy when the server sends duplicates", async () => {
    await engine.mergeServerDocuments([
      remote({ data: { name: "Primero" }, serverSeq: 4 }),
      remote({ data: { name: "Segundo" }, serverSeq: 5 }),
    ]);

    expect(await db.documents.get(key)).toMatchObject({
      data: { name: "Segundo" },
      serverSeq: 5,
    });
  });
});
