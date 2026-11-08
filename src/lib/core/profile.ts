import { db, documentKey, type LocalDocument } from "#lib/core/db/index.js";
import { syncEngine } from "#lib/core/sync/engine.js";

export const PROFILE_COLLECTION = "profile";
export const PROFILE_ID = "me";

export type ProfileData = {
  name: string;
  headline: string;
  location: string;
  createdAt: number;
};

export type ProfileState = {
  data: ProfileData;
  updatedAt: number;
  rev: number;
  exists: boolean;
};

const KEY = documentKey(PROFILE_COLLECTION, PROFILE_ID);

function emptyProfile(): ProfileData {
  return { name: "", headline: "", location: "", createdAt: 0 };
}

function clean(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

async function readDocument(): Promise<LocalDocument<ProfileData> | null> {
  const document = await db.documents.get(KEY);
  if (!document || document.deletedAt !== null) return null;
  return document as LocalDocument<ProfileData>;
}

function toState(
  document: LocalDocument<ProfileData>,
  exists: boolean,
): ProfileState {
  return {
    data: document.data,
    updatedAt: document.updatedAt,
    rev: document.rev,
    exists,
  };
}

export async function getProfile(): Promise<ProfileState> {
  const document = await readDocument();
  if (!document) {
    return {
      data: emptyProfile(),
      updatedAt: 0,
      rev: 0,
      exists: false,
    };
  }
  return toState(document, true);
}

export async function saveProfile(
  patch: Partial<Omit<ProfileData, "createdAt">>,
): Promise<ProfileState> {
  const existing = await readDocument();
  const previous = existing?.data ?? emptyProfile();
  const updatedAt = Math.max(Date.now(), (existing?.updatedAt ?? 0) + 1);

  const data: ProfileData = {
    name: clean(patch.name ?? previous.name, 80),
    headline: clean(patch.headline ?? previous.headline, 120),
    location: clean(patch.location ?? previous.location, 80),
    createdAt: previous.createdAt || updatedAt,
  };

  const document: LocalDocument<ProfileData> = {
    key: KEY,
    collection: PROFILE_COLLECTION,
    id: PROFILE_ID,
    data,
    updatedAt,
    deletedAt: null,
    serverSeq: existing?.serverSeq ?? 0,
    dirty: 1,
    rev: (existing?.rev ?? 0) + 1,
  };

  await db.documents.put(document);
  syncEngine.notifyLocalChange();

  return toState(document, true);
}

export function greetingName(profile: ProfileState): string {
  return profile.data.name.trim();
}
