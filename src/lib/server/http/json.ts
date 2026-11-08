import { error } from "@sveltejs/kit";

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    error(415, "Se esperaba application/json");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    error(413, "Solicitud demasiado grande");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    error(413, "Solicitud demasiado grande");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    error(400, "JSON inválido");
  }
}
