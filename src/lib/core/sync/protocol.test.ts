import { describe, expect, it } from "vitest";
import {
  documentEnvelopeSchema,
  documentIdSchema,
  MAX_DOCUMENT_BYTES,
  SYNC_BATCH_SIZE,
  syncRequestSchema,
  timestampSchema,
} from "#lib/core/sync/protocol.js";

const envelope = {
  collection: "profile",
  id: "me",
  data: { name: "Ana" },
  updatedAt: 1_700_000_000_000,
  deletedAt: null,
};

describe("sync protocol", () => {
  it("accepts a valid document envelope", () => {
    expect(documentEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it("rejects invalid collection names", () => {
    for (const collection of [
      "",
      "Profile",
      "1profile",
      "profile-extra",
      "a".repeat(65),
    ]) {
      expect(
        documentEnvelopeSchema.safeParse({ ...envelope, collection }).success,
      ).toBe(false);
    }
  });

  it("rejects invalid document ids", () => {
    for (const id of ["", "with space", "emoji🙂", "a".repeat(129)]) {
      expect(documentIdSchema.safeParse(id).success).toBe(false);
    }
    expect(documentIdSchema.safeParse("gymbro:session_01").success).toBe(true);
  });

  it("rejects negative or fractional timestamps", () => {
    expect(timestampSchema.safeParse(-1).success).toBe(false);
    expect(timestampSchema.safeParse(1.5).success).toBe(false);
    expect(timestampSchema.safeParse(0).success).toBe(true);
  });

  it("rejects documents larger than the limit", () => {
    const data = { text: "x".repeat(MAX_DOCUMENT_BYTES) };
    const result = documentEnvelopeSchema.safeParse({ ...envelope, data });

    expect(result.success).toBe(false);
  });

  it("limits a sync batch to the allowed size", () => {
    const changes = Array.from({ length: SYNC_BATCH_SIZE + 1 }, (_, index) => ({
      ...envelope,
      id: `doc-${index}`,
    }));

    expect(syncRequestSchema.safeParse({ cursor: 0, changes }).success).toBe(
      false,
    );
    expect(
      syncRequestSchema.safeParse({
        cursor: 0,
        changes: changes.slice(0, SYNC_BATCH_SIZE),
      }).success,
    ).toBe(true);
  });

  it("rejects negative cursors", () => {
    expect(
      syncRequestSchema.safeParse({ cursor: -1, changes: [] }).success,
    ).toBe(false);
  });
});
