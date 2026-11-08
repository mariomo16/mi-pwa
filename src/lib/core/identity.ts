export type DeviceIdentity = {
  deviceId: string;
  token: string;
  name: string;
  ownerId: string | null;
};

const STORAGE_KEY = "core:identity:v1";

let cached: DeviceIdentity | null = null;

function readStorage(): DeviceIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeviceIdentity>;
    if (
      typeof parsed.deviceId !== "string" ||
      typeof parsed.token !== "string" ||
      typeof parsed.name !== "string"
    ) {
      return null;
    }
    return {
      deviceId: parsed.deviceId,
      token: parsed.token,
      name: parsed.name,
      ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : null,
    };
  } catch {
    return null;
  }
}

function writeStorage(identity: DeviceIdentity): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Private mode or blocked storage: keep the identity in memory.
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function deviceLabel(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Navegador";
  const system = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "este dispositivo";
  return `${browser} en ${system}`;
}

function createIdentity(): DeviceIdentity {
  return {
    deviceId: randomId(),
    token: randomToken(),
    name: deviceLabel(),
    ownerId: null,
  };
}

async function withIdentityLock<T>(task: () => Promise<T>): Promise<T> {
  if (
    typeof navigator !== "undefined" &&
    "locks" in navigator &&
    navigator.locks
  ) {
    return navigator.locks.request("core:identity", task);
  }
  return task();
}

export function getStoredIdentity(): DeviceIdentity | null {
  if (cached) return cached;
  const stored = readStorage();
  if (stored) cached = stored;
  return stored;
}

export async function ensureIdentity(): Promise<DeviceIdentity> {
  const existing = getStoredIdentity();
  if (existing) return existing;

  const proposed = createIdentity();

  return withIdentityLock(async () => {
    const stored = readStorage();
    if (stored) {
      cached = stored;
      return stored;
    }
    writeStorage(proposed);
    cached = proposed;
    return proposed;
  });
}

export function saveIdentity(identity: DeviceIdentity): void {
  cached = identity;
  writeStorage(identity);
}

export function clearIdentity(): void {
  cached = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}

export function importIdentity(identity: DeviceIdentity): void {
  saveIdentity({
    deviceId: identity.deviceId,
    token: identity.token,
    name: identity.name,
    ownerId: identity.ownerId ?? null,
  });
}
