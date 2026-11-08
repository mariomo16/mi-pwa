import { z } from "zod";

export const SYNC_BATCH_SIZE = 200;
export const MAX_DOCUMENT_BYTES = 256 * 1024;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_COLLECTION_LENGTH = 64;
export const MAX_ID_LENGTH = 128;

export const collectionSchema = z
  .string()
  .min(1)
  .max(MAX_COLLECTION_LENGTH)
  .regex(/^[a-z][a-z0-9_]*$/);

export const documentIdSchema = z
  .string()
  .min(1)
  .max(MAX_ID_LENGTH)
  .regex(/^[A-Za-z0-9:_-]+$/);

export const timestampSchema = z.number().int().nonnegative();

export const documentEnvelopeSchema = z
  .object({
    collection: collectionSchema,
    id: documentIdSchema,
    data: z.record(z.string(), z.unknown()),
    updatedAt: timestampSchema,
    deletedAt: timestampSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value.data)).length;
    if (bytes > MAX_DOCUMENT_BYTES) {
      ctx.addIssue({
        code: "custom",
        path: ["data"],
        message: "Document is too large",
      });
    }
  });

export const registerDeviceSchema = z.object({
  deviceId: z.uuid(),
  token: z.string().min(32).max(256),
  name: z.string().trim().min(1).max(80),
});

export const syncRequestSchema = z.object({
  cursor: z.number().int().nonnegative(),
  changes: z.array(documentEnvelopeSchema).max(SYNC_BATCH_SIZE),
});

export type DocumentEnvelope = z.infer<typeof documentEnvelopeSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export type SyncDocument = DocumentEnvelope & {
  serverSeq: number;
};

export type SyncResponse = {
  applied: SyncDocument[];
  changes: SyncDocument[];
  cursor: number;
  hasMore: boolean;
};
