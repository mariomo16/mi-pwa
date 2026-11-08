import { createHash, timingSafeEqual } from "node:crypto";
import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { RegisterDeviceInput } from "#lib/core/sync/protocol.js";
import { db } from "#lib/server/db/index.js";
import { devices } from "#lib/server/db/schema.js";

export type Device = typeof devices.$inferSelect;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function registerDevice(
  input: RegisterDeviceInput,
): Promise<Device> {
  const tokenHash = hashToken(input.token);

  await db
    .insert(devices)
    .values({
      id: input.deviceId,
      ownerId: input.deviceId,
      tokenHash,
      name: input.name,
    })
    .onConflictDoNothing({ target: devices.id });

  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.id, input.deviceId))
    .limit(1);

  if (!device) {
    error(500, "No se pudo registrar el dispositivo");
  }

  if (!hashesMatch(tokenHash, device.tokenHash)) {
    error(409, "Este dispositivo ya está registrado con otra credencial");
  }

  const [updated] = await db
    .update(devices)
    .set({ name: input.name, lastSeenAt: new Date() })
    .where(eq(devices.id, device.id))
    .returning();

  return updated ?? device;
}

export async function requireDevice(request: Request): Promise<Device> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const deviceId = request.headers.get("x-core-device") ?? "";

  if (
    !token ||
    !tokenIsPlausible(token) ||
    !z.uuid().safeParse(deviceId).success
  ) {
    error(401, "Dispositivo no autorizado");
  }

  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1);

  if (!device || !hashesMatch(hashToken(token), device.tokenHash)) {
    error(401, "Dispositivo no autorizado");
  }

  void db
    .update(devices)
    .set({ lastSeenAt: new Date() })
    .where(eq(devices.id, device.id))
    .catch(() => undefined);

  return device;
}

function tokenIsPlausible(token: string): boolean {
  return token.length >= 32 && token.length <= 256;
}
