import { error, json } from "@sveltejs/kit";
import {
  MAX_BODY_BYTES,
  SYNC_BATCH_SIZE,
  type SyncResponse,
  syncRequestSchema,
} from "#lib/core/sync/protocol.js";
import { requireDevice } from "#lib/server/auth/device.js";
import { readJsonBody } from "#lib/server/http/json.js";
import { applyChanges, pullChanges } from "#lib/server/sync/service.js";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  const device = await requireDevice(request);
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  const parsed = syncRequestSchema.safeParse(body);

  if (!parsed.success) {
    error(400, "Solicitud de sincronización inválida");
  }

  const applied = await applyChanges(device.ownerId, parsed.data.changes);
  const pulled = await pullChanges(
    device.ownerId,
    parsed.data.cursor,
    SYNC_BATCH_SIZE,
  );

  return json({
    applied,
    changes: pulled.changes,
    cursor: pulled.cursor,
    hasMore: pulled.hasMore,
  } satisfies SyncResponse);
};
