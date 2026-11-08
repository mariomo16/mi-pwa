import { type SyncSnapshot, syncEngine } from "#lib/core/sync/engine.js";

export const syncState = $state<SyncSnapshot>(syncEngine.getSnapshot());

syncEngine.subscribe((snapshot) => {
  Object.assign(syncState, snapshot);
});
