import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, documentKey } from "#lib/core/db/index.js";
import {
  getProfile,
  greetingName,
  PROFILE_COLLECTION,
  PROFILE_ID,
  saveProfile,
} from "#lib/core/profile.js";
import { syncEngine } from "#lib/core/sync/engine.js";

describe("profile", () => {
  beforeEach(async () => {
    await db.documents.clear();
    await db.meta.clear();
    vi.spyOn(syncEngine, "notifyLocalChange").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty profile when nothing was saved", async () => {
    const profile = await getProfile();

    expect(profile.exists).toBe(false);
    expect(profile.rev).toBe(0);
    expect(profile.updatedAt).toBe(0);
    expect(profile.data).toEqual({
      name: "",
      headline: "",
      location: "",
      createdAt: 0,
    });
  });

  it("trims and truncates profile fields", async () => {
    const profile = await saveProfile({
      name: "  Ana  ",
      headline: "x".repeat(150),
      location: "  Madrid ",
    });

    expect(profile.data.name).toBe("Ana");
    expect(profile.data.headline).toHaveLength(120);
    expect(profile.data.location).toBe("Madrid");
    expect(profile.exists).toBe(true);
    expect(profile.rev).toBe(1);
  });

  it("preserves untouched fields on partial updates", async () => {
    await saveProfile({ name: "Ana", location: "Madrid" });
    const profile = await saveProfile({ headline: "Diseñadora" });

    expect(profile.data.name).toBe("Ana");
    expect(profile.data.location).toBe("Madrid");
    expect(profile.data.headline).toBe("Diseñadora");
    expect(profile.rev).toBe(2);
  });

  it("keeps updatedAt strictly increasing", async () => {
    const first = await saveProfile({ name: "Ana" });
    const second = await saveProfile({ name: "Ana María" });

    expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
    expect(second.data.createdAt).toBe(first.data.createdAt);
  });

  it("marks the document dirty for sync", async () => {
    await saveProfile({ name: "Ana" });
    const document = await db.documents.get(
      documentKey(PROFILE_COLLECTION, PROFILE_ID),
    );

    expect(document?.dirty).toBe(1);
    expect(document?.serverSeq).toBe(0);
    expect(document?.deletedAt).toBeNull();
  });

  it("exposes a trimmed greeting name", async () => {
    const profile = await saveProfile({ name: "  Ana  " });

    expect(greetingName(profile)).toBe("Ana");
  });
});
