import { openDatabase } from "../src/db/index";
import { createApp } from "../src/server/app";
import { readEnv, type AppEnv } from "../src/server/env";
import { createMockFetch, type MockCall } from "../src/server/mocks";

export function makeTestEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): AppEnv {
  const env = readEnv({
    MOCK_EXTERNAL: "1",
    ELEVENLABS_API_KEY: "test-el",
    BRAVE_SEARCH_API_KEY: "test-brave",
    TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    TWILIO_AUTH_TOKEN: "twilio-token",
    TWILIO_PHONE_NUMBER: "+15551234567",
    PUBLIC_BASE_URL: "https://example.test",
    OPENROUTER_API_KEY: "",
    OPENAI_API_KEY: "",
    ...overrides,
  });
  env.mockExternal = true;
  env.llmApiKey = "";
  return env;
}

export function makeTestApp(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  const sqlite = openDatabase(":memory:");
  const log: MockCall[] = [];
  const env = makeTestEnv(overrides);
  const fetchImpl = createMockFetch(log);
  const app = createApp({ sqlite, env, fetchImpl });
  return { app, sqlite, log, env };
}

export async function json(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await app.request(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}
