import { z } from "zod";
import { db, documentKey, type LocalDocument } from "#lib/core/db/index.js";
import { getStoredIdentity, importIdentity } from "#lib/core/identity.js";
import { syncEngine } from "#lib/core/sync/engine.js";
import {
  collectionSchema,
  documentIdSchema,
  timestampSchema,
} from "#lib/core/sync/protocol.js";

const backupDocumentSchema = z.object({
  collection: collectionSchema,
  id: documentIdSchema,
  data: z.record(z.string(), z.unknown()),
  updatedAt: timestampSchema,
  deletedAt: timestampSchema.nullable().optional(),
});

const backupIdentitySchema = z.object({
  deviceId: z.uuid(),
  token: z.string().min(32).max(256),
  name: z.string().min(1).max(80),
  ownerId: z.uuid().nullable().optional(),
});

export const backupSchema = z.object({
  app: z.literal("core"),
  version: z.literal(1),
  exportedAt: z.string(),
  identity: backupIdentitySchema.nullable().optional(),
  documents: z.array(backupDocumentSchema).max(10_000),
});

export type CoreBackup = z.infer<typeof backupSchema>;

export async function createBackup(): Promise<CoreBackup> {
  const documents = await db.documents.toArray();
  const identity = getStoredIdentity();

  return {
    app: "core",
    version: 1,
    exportedAt: new Date().toISOString(),
    identity: identity
      ? {
          deviceId: identity.deviceId,
          token: identity.token,
          name: identity.name,
          ownerId: identity.ownerId,
        }
      : null,
    documents: documents
      .filter((document) => document.deletedAt === null)
      .map((document) => ({
        collection: document.collection,
        id: document.id,
        data: document.data,
        updatedAt: document.updatedAt,
        deletedAt: null,
      })),
  };
}

export function downloadBackup(backup: CoreBackup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `core-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export type ImportOptions = {
  restoreIdentity?: boolean;
};

export async function importBackup(
  input: unknown,
  options: ImportOptions = {},
): Promise<{ imported: number }> {
  const parsed = backupSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("El archivo no es una copia válida de Core");
  }

  const backup = parsed.data;
  const restoreIdentity = options.restoreIdentity === true;

  if (restoreIdentity && !backup.identity) {
    throw new Error("La copia no incluye la credencial del dispositivo");
  }

  const documents = backup.documents.filter(
    (document) => document.deletedAt == null,
  );

  const restore = async (): Promise<number> => {
    if (restoreIdentity && backup.identity) {
      importIdentity({
        deviceId: backup.identity.deviceId,
        token: backup.identity.token,
        name: backup.identity.name,
        ownerId: backup.identity.ownerId ?? null,
      });

      await db.documents.clear();
      await db.meta.clear();
    }

    await db.transaction("rw", db.documents, async () => {
      for (const source of documents) {
        const key = documentKey(source.collection, source.id);
        const existing = await db.documents.get(key);

        if (
          existing &&
          !restoreIdentity &&
          existing.updatedAt > source.updatedAt
        ) {
          continue;
        }

        const document: LocalDocument = {
          key,
          collection: source.collection,
          id: source.id,
          data: source.data,
          updatedAt: source.updatedAt,
          deletedAt: null,
          serverSeq: restoreIdentity ? 0 : (existing?.serverSeq ?? 0),
          dirty: 1,
          rev: (existing?.rev ?? 0) + 1,
        };

        await db.documents.put(document);
      }
    });

    return documents.length;
  };

  const imported =
    typeof navigator !== "undefined" && "locks" in navigator && navigator.locks
      ? await navigator.locks.request("core:sync", restore)
      : await restore();

  void syncEngine.sync();

  return { imported };
}
