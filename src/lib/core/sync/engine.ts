import {
  db,
  documentKey,
  getMeta,
  type LocalDocument,
  setMeta,
} from "#lib/core/db/index.js";
import {
  type DeviceIdentity,
  ensureIdentity,
  saveIdentity,
} from "#lib/core/identity.js";
import {
  type DocumentEnvelope,
  SYNC_BATCH_SIZE,
  type SyncDocument,
  type SyncResponse,
} from "#lib/core/sync/protocol.js";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

export type SyncSnapshot = {
  status: SyncStatus;
  pending: number;
  lastSyncedAt: number | null;
  error: string | null;
  registered: boolean;
};

export type SyncListener = (snapshot: SyncSnapshot) => void;

const CURSOR_KEY = "sync:cursor";
const REGISTERED_KEY = "sync:registered";
const LAST_SYNC_KEY = "sync:last";
const SYNC_INTERVAL = 60_000;
const LOCAL_DEBOUNCE = 900;
const REQUEST_TIMEOUT = 20_000;

class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SyncHttpError";
  }
}

class SyncEngine {
  private snapshot: SyncSnapshot = {
    status: "idle",
    pending: 0,
    lastSyncedAt: null,
    error: null,
    registered: false,
  };

  private listeners = new Set<SyncListener>();
  private started = false;
  private running: Promise<void> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): SyncSnapshot {
    return this.snapshot;
  }

  start(): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    document.addEventListener("visibilitychange", this.handleVisibility);

    this.interval = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        !this.running
      ) {
        void this.sync();
      }
    }, SYNC_INTERVAL);

    void this.initialize();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    document.removeEventListener("visibilitychange", this.handleVisibility);

    if (this.interval) clearInterval(this.interval);
    if (this.debounce) clearTimeout(this.debounce);
    this.interval = null;
    this.debounce = null;
  }

  notifyLocalChange(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.sync();
    }, LOCAL_DEBOUNCE);
    void this.refreshPending();
  }

  async sync(): Promise<void> {
    if (this.running) return this.running;

    this.running = this.withTabLock();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  private withTabLock(): Promise<void> {
    if (
      typeof navigator !== "undefined" &&
      "locks" in navigator &&
      navigator.locks
    ) {
      return navigator.locks.request(
        "core:sync",
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return;
          await this.runSync();
        },
      );
    }
    return this.runSync();
  }

  private async initialize(): Promise<void> {
    void requestPersistentStorage();

    const [pending, lastSynced, registered] = await Promise.all([
      this.countDirty(),
      getMeta(LAST_SYNC_KEY),
      getMeta(REGISTERED_KEY),
    ]);

    this.update({
      pending,
      lastSyncedAt: lastSynced ? Number(lastSynced) : null,
      registered: registered === "1",
      status: navigator.onLine ? "idle" : "offline",
    });

    if (navigator.onLine) {
      setTimeout(() => void this.sync(), 300);
    }
  }

  private async runSync(retried = false): Promise<void> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.update({ status: "offline", error: null });
      await this.refreshPending();
      return;
    }

    this.update({ status: "syncing", error: null });

    try {
      const identity = await this.ensureRegistered();
      let cursor = Number((await getMeta(CURSOR_KEY)) ?? "0");
      if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

      let rounds = 0;

      while (rounds < 6) {
        rounds += 1;

        const dirty = await db.documents
          .where("dirty")
          .equals(1)
          .limit(SYNC_BATCH_SIZE)
          .toArray();

        const response = await this.postSync(identity, cursor, dirty);

        await this.mergeServerDocuments([
          ...response.applied,
          ...response.changes,
        ]);

        cursor = response.cursor;
        await setMeta(CURSOR_KEY, String(cursor));

        if (!response.hasMore && dirty.length < SYNC_BATCH_SIZE) {
          break;
        }
      }

      const pending = await this.countDirty();
      const now = Date.now();
      await setMeta(LAST_SYNC_KEY, String(now));

      this.update({
        status: "idle",
        pending,
        lastSyncedAt: now,
        error: null,
        registered: true,
      });
    } catch (cause) {
      if (cause instanceof SyncHttpError && cause.status === 401 && !retried) {
        await setMeta(REGISTERED_KEY, "0");
        await this.runSync(true);
        return;
      }

      const pending = await this.countDirty();
      const offline = typeof navigator !== "undefined" && !navigator.onLine;

      this.update({
        status: offline ? "offline" : "error",
        pending,
        error: offline ? null : describeError(cause),
      });
    }
  }

  private async ensureRegistered(): Promise<DeviceIdentity> {
    const identity = await ensureIdentity();
    const registered = await getMeta(REGISTERED_KEY);

    if (registered === "1" && identity.ownerId) {
      return identity;
    }

    const response = await fetch("/api/sync/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: identity.deviceId,
        token: identity.token,
        name: identity.name,
      }),
    });

    if (!response.ok) {
      throw new SyncHttpError(
        response.status,
        await readError(response, "No se pudo registrar este dispositivo"),
      );
    }

    const payload = (await response.json()) as { ownerId?: unknown };

    if (typeof payload.ownerId !== "string") {
      throw new Error("El servidor devolvió una identidad inválida");
    }

    const updated: DeviceIdentity = {
      ...identity,
      ownerId: payload.ownerId,
    };

    saveIdentity(updated);
    await setMeta(REGISTERED_KEY, "1");

    return updated;
  }

  private async postSync(
    identity: DeviceIdentity,
    cursor: number,
    documents: LocalDocument[],
  ): Promise<SyncResponse> {
    const changes: DocumentEnvelope[] = documents.map((document) => ({
      collection: document.collection,
      id: document.id,
      data: document.data,
      updatedAt: document.updatedAt,
      deletedAt: document.deletedAt,
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${identity.token}`,
          "x-core-device": identity.deviceId,
        },
        body: JSON.stringify({ cursor, changes }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new SyncHttpError(
          response.status,
          await readError(response, "No se pudo sincronizar"),
        );
      }

      return (await response.json()) as SyncResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async mergeServerDocuments(documents: SyncDocument[]): Promise<void> {
    if (documents.length === 0) return;

    const latest = new Map<string, SyncDocument>();
    for (const document of documents) {
      latest.set(documentKey(document.collection, document.id), document);
    }

    await db.transaction("rw", db.documents, async () => {
      for (const [key, server] of latest) {
        const local = await db.documents.get(key);

        if (server.deletedAt !== null) {
          if (!local) continue;
          if (!local.dirty || server.updatedAt >= local.updatedAt) {
            await db.documents.delete(key);
          }
          continue;
        }

        if (!local) {
          await db.documents.put({
            key,
            collection: server.collection,
            id: server.id,
            data: server.data,
            updatedAt: server.updatedAt,
            deletedAt: null,
            serverSeq: server.serverSeq,
            dirty: 0,
            rev: 0,
          });
          continue;
        }

        if (local.dirty && server.updatedAt < local.updatedAt) {
          continue;
        }

        await db.documents.put({
          key,
          collection: server.collection,
          id: server.id,
          data: server.data,
          updatedAt: server.updatedAt,
          deletedAt: null,
          serverSeq: server.serverSeq,
          dirty: 0,
          rev: local.rev + 1,
        });
      }
    });
  }

  private async countDirty(): Promise<number> {
    return db.documents.where("dirty").equals(1).count();
  }

  private async refreshPending(): Promise<void> {
    const pending = await this.countDirty();
    if (pending !== this.snapshot.pending) {
      this.update({ pending });
    }
  }

  private update(patch: Partial<SyncSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private handleOnline = (): void => {
    void this.sync();
  };

  private handleOffline = (): void => {
    this.update({ status: "offline", error: null });
  };

  private handleVisibility = (): void => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      void this.sync();
    }
  };
}

async function readError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === "string" && payload.message.length > 0) {
      return payload.message;
    }
  } catch {
    // The response was not JSON.
  }
  return fallback;
}

function describeError(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return "La sincronización tardó demasiado";
  }
  if (cause instanceof TypeError) {
    return "Sin conexión con el servidor";
  }
  if (cause instanceof Error && cause.message) {
    return cause.message;
  }
  return "No se pudo sincronizar";
}

async function requestPersistentStorage(): Promise<void> {
  try {
    if (!navigator.storage?.persist) return;
    if (await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch {
    // Storage persistence is a best-effort improvement.
  }
}

export const syncEngine = new SyncEngine();
