import { error, json } from "@sveltejs/kit";
import { registerDeviceSchema } from "#lib/core/sync/protocol.js";
import { registerDevice } from "#lib/server/auth/device.js";
import { readJsonBody } from "#lib/server/http/json.js";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  const body = await readJsonBody(request, 16 * 1024);
  const parsed = registerDeviceSchema.safeParse(body);

  if (!parsed.success) {
    error(400, "Datos de dispositivo inválidos");
  }

  const device = await registerDevice(parsed.data);

  return json({
    ownerId: device.ownerId,
    name: device.name,
  });
};
