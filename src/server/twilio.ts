import type { AppEnv } from "./env";

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";

export type TwilioAuth = {
  accountSid: string;
  restUser: string;
  restPass: string;
  importToken: string;
};

export function resolveTwilioAuth(
  env: AppEnv,
  row?: { twilioSid: string | null; twilioToken: string | null } | null,
): TwilioAuth | null {
  const accountSid = (row?.twilioSid || env.twilioSid || "").trim();
  const authToken = (row?.twilioToken || env.twilioToken || "").trim();
  if (!accountSid) return null;
  const restUser = env.twilioApiKey || accountSid;
  const restPass = env.twilioApiSecret || authToken;
  if (!restPass) return null;
  return { accountSid, restUser, restPass, importToken: authToken };
}

export async function twilioFetch(
  fetchImpl: typeof fetch,
  auth: TwilioAuth,
  path: string,
  init: { method?: string; form?: Record<string, string> } = {},
): Promise<Response> {
  const headers = new Headers();
  headers.set("Authorization", `Basic ${Buffer.from(`${auth.restUser}:${auth.restPass}`).toString("base64")}`);
  const opts: RequestInit = { method: init.method ?? "GET", headers };
  if (init.form) {
    opts.body = new URLSearchParams(init.form).toString();
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  }
  return fetchImpl(`${TWILIO_BASE}/Accounts/${auth.accountSid}${path}`, opts);
}
