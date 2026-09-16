import type { AppEnv } from "./env";

export const EL_BASE = "https://api.elevenlabs.io/v1";

export async function elFetch(
  env: AppEnv,
  fetchImpl: typeof fetch,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("xi-api-key")) headers.set("xi-api-key", env.elevenlabsKey);
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!headers.has("Content-Type") && init.body && !isForm && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  return fetchImpl(`${EL_BASE}${path}`, { ...init, headers });
}
