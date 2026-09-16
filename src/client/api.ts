export type Status = {
  agentId: string | null;
  voiceId: string | null;
  phoneNumberId: string | null;
  twilioPhoneNumber: string | null;
  twilioConfigured: boolean;
  twilioSidPrefill?: string;
  twilioPhonePrefill?: string;
};

export type Voice = {
  voice_id: string;
  name: string;
  category?: string | null;
  labels: Record<string, string>;
  preview_url: string | null;
};

export type Device = {
  id: number;
  name: string;
  model: string | null;
  sourceUrl: string | null;
  status: string;
  errorMsg: string | null;
  createdAt: number;
};

export type Call = {
  id: string;
  startedAt: number | null;
  durationSecs: number | null;
  summary: string | null;
  caller: string | null;
  sentiment: string | null;
  latencyMs: number | null;
  success: string | null;
  surveyRating: number | null;
  transcript: { speaker: string; text: string }[];
};

export type SampleTurn = { idx: number; speaker: string; text: string };

export type Health = {
  elevenlabs: boolean;
  brave: boolean;
  llm: boolean;
  twilioAccountSid: boolean;
  twilioAuth: boolean;
  twilioPhoneNumber: boolean;
  twilioApiKey: boolean;
  twilioApiSecret: boolean;
  twilioSidLooksLikeApiKey: boolean;
  publicBaseUrl: boolean;
  publicBaseUrlReachable: boolean;
  notes: string[];
  origin?: string;
};

export async function api(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
