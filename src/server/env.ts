import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { looksLikeTwilioAccountSid, looksLikeTwilioApiKeySid } from "../shared/phone";
import { parseListenPort } from "./listen";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function loadEnvFile() {
  config({ path: path.join(root, ".env.local") });
}

function first(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

export type AppEnv = {
  root: string;
  elevenlabsKey: string;
  ttsModel: string;
  braveKey: string;
  twilioSid: string;
  twilioToken: string;
  twilioApiKey: string;
  twilioApiSecret: string;
  twilioPhoneNumber: string;
  publicBaseUrl: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  mockExternal: boolean;
  port: number;
  isProd: boolean;
};

export function readEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): AppEnv {
  const env = { ...process.env, ...overrides };
  const openrouter = first(env.OPENROUTER_API_KEY);
  const openai = first(env.OPENAI_API_KEY);
  const xai = first(env.XAI_API_KEY);

  let llmApiKey = "";
  let llmBaseUrl = "https://api.openai.com/v1";
  let llmModel = first(env.LLM_MODEL);

  if (openrouter) {
    llmApiKey = openrouter;
    llmBaseUrl = "https://openrouter.ai/api/v1";
    llmModel = llmModel || "openai/gpt-5.6-luna";
  } else if (openai) {
    llmApiKey = openai;
    llmBaseUrl = "https://api.openai.com/v1";
    llmModel = llmModel || "gpt-5.6-luna";
  } else if (xai) {
    llmApiKey = xai;
    llmBaseUrl = "https://api.x.ai/v1";
    llmModel = llmModel || "grok-4-1-fast";
  }

  return {
    root,
    elevenlabsKey: first(env.ELEVENLABS_API_KEY, env.ELEVEN_LABS_API_KEY),
    ttsModel: first(env.ELEVENLABS_TTS_MODEL) || "eleven_flash_v2_5",
    braveKey: first(env.BRAVE_SEARCH_API_KEY),
    twilioSid: first(env.TWILIO_ACCOUNT_SID),
    twilioToken: first(env.TWILIO_AUTH_TOKEN, env.TWILIO_CLIENT_SECRET),
    twilioApiKey: first(env.TWILIO_API_KEY),
    twilioApiSecret: first(env.TWILIO_API_SECRET),
    twilioPhoneNumber: first(env.TWILIO_PHONE_NUMBER),
    publicBaseUrl: first(env.PUBLIC_BASE_URL),
    llmApiKey,
    llmBaseUrl,
    llmModel,
    mockExternal: env.MOCK_EXTERNAL === "1" || env.MOCK_EXTERNAL === "true",
    port: parseListenPort(env.PORT),
    isProd: env.NODE_ENV === "production",
  };
}

export function publicOrigin(reqUrl: string, env: AppEnv): string {
  if (env.publicBaseUrl) return env.publicBaseUrl.replace(/\/$/, "");
  return new URL(reqUrl).origin;
}

export function originIsPublic(origin: string): boolean {
  try {
    const u = new URL(origin);
    return !["localhost", "127.0.0.1", "::1"].includes(u.hostname) && !u.hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

export type HealthReport = {
  elevenlabs: boolean;
  brave: boolean;
  llm: boolean;
  twilioAccountSid: boolean;
  twilioAuth: boolean;
  twilioApiKey: boolean;
  twilioApiSecret: boolean;
  twilioPhoneNumber: boolean;
  twilioSidLooksLikeApiKey: boolean;
  publicBaseUrl: boolean;
  publicBaseUrlReachable: boolean;
  notes: string[];
};

export function credentialHealth(env: AppEnv): HealthReport {
  const notes: string[] = [];
  const twilioAccountSid = looksLikeTwilioAccountSid(env.twilioSid);
  const twilioSidLooksLikeApiKey = looksLikeTwilioApiKeySid(env.twilioSid);
  const twilioApiKey = looksLikeTwilioApiKeySid(env.twilioApiKey) || Boolean(env.twilioApiKey);
  if (twilioSidLooksLikeApiKey) {
    notes.push("TWILIO_ACCOUNT_SID starts with SK (API Key SID). Put the Account SID (AC…) in TWILIO_ACCOUNT_SID and the SK value in TWILIO_API_KEY.");
  } else if (env.twilioSid && !twilioAccountSid) {
    notes.push("TWILIO_ACCOUNT_SID is set but does not look like an Account SID (AC…).");
  }
  if (!env.elevenlabsKey) notes.push("ElevenLabs API key is missing (ELEVENLABS_API_KEY).");
  if (!env.braveKey) notes.push("Brave Search API key is missing (BRAVE_SEARCH_API_KEY). Manual auto-search will fail.");
  if (!env.llmApiKey) notes.push("No LLM key found (OPENROUTER_API_KEY or OPENAI_API_KEY). Demo/monitor scripts will use the built-in fallback dialogue.");
  if (!env.twilioToken && !(env.twilioApiKey && env.twilioApiSecret)) {
    notes.push("Twilio REST auth is missing — set TWILIO_AUTH_TOKEN and/or TWILIO_API_KEY + TWILIO_API_SECRET.");
  }
  if (!env.twilioToken) {
    notes.push("TWILIO_AUTH_TOKEN is unset. ElevenLabs phone import still needs the account Auth Token even if an API key is present.");
  }
  if (env.twilioApiKey && !env.twilioApiSecret) notes.push("TWILIO_API_KEY is set but TWILIO_API_SECRET is missing.");
  if (env.twilioApiSecret && !env.twilioApiKey) notes.push("TWILIO_API_SECRET is set but TWILIO_API_KEY is missing.");
  if (!env.twilioPhoneNumber) notes.push("TWILIO_PHONE_NUMBER is unset — you can still paste a number in Setup or buy one.");
  const reachable = originIsPublic(env.publicBaseUrl || "");
  if (!reachable) {
    notes.push("No public PUBLIC_BASE_URL. Run `just live` (Cloudflare quick tunnel) so ElevenLabs can call /tools/search-manual.");
  }
  return {
    elevenlabs: Boolean(env.elevenlabsKey),
    brave: Boolean(env.braveKey),
    llm: Boolean(env.llmApiKey),
    twilioAccountSid,
    twilioAuth: Boolean(env.twilioToken),
    twilioApiKey,
    twilioApiSecret: Boolean(env.twilioApiSecret),
    twilioPhoneNumber: Boolean(env.twilioPhoneNumber),
    twilioSidLooksLikeApiKey,
    publicBaseUrl: Boolean(env.publicBaseUrl),
    publicBaseUrlReachable: reachable,
    notes,
  };
}
