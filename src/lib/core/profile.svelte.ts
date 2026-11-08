import {
  getProfile,
  type ProfileData,
  type ProfileState,
  saveProfile,
} from "#lib/core/profile.js";
import { syncEngine } from "#lib/core/sync/engine.js";

const empty: ProfileState = {
  data: { name: "", headline: "", location: "", createdAt: 0 },
  updatedAt: 0,
  rev: 0,
  exists: false,
};

export const profileState = $state<ProfileState>({
  ...empty,
  data: { ...empty.data },
});

let loaded = false;
let loading: Promise<void> | null = null;

export async function loadProfile(force = false): Promise<void> {
  if (loading) return loading;
  if (loaded && !force) return;

  loading = getProfile()
    .then((profile) => {
      Object.assign(profileState, profile);
      loaded = true;
    })
    .finally(() => {
      loading = null;
    });

  return loading;
}

export async function updateProfile(
  patch: Partial<Omit<ProfileData, "createdAt">>,
): Promise<void> {
  const next = await saveProfile(patch);
  Object.assign(profileState, next);
}

let lastSyncedAt = 0;

syncEngine.subscribe((snapshot) => {
  if (snapshot.lastSyncedAt && snapshot.lastSyncedAt !== lastSyncedAt) {
    lastSyncedAt = snapshot.lastSyncedAt;
    void loadProfile(true);
  }
});
