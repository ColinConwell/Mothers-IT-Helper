import type { Sql } from "./sql";
import { normalizeE164 } from "../shared/phone";
import type { AppEnv } from "./env";

export type SettingsRow = {
  id: number;
  agentId: string | null;
  voiceId: string | null;
  twilioSid: string | null;
  twilioToken: string | null;
  twilioPhoneNumber: string | null;
  phoneNumberId: string | null;
  updatedAt: number | null;
};

export function getSettingsRow(sql: Sql): SettingsRow | null {
  const rows = sql.query<{
    id: number;
    agent_id: string | null;
    voice_id: string | null;
    twilio_sid: string | null;
    twilio_token: string | null;
    twilio_phone_number: string | null;
    phone_number_id: string | null;
    updated_at: number;
  }>("SELECT id, agent_id, voice_id, twilio_sid, twilio_token, twilio_phone_number, phone_number_id, updated_at FROM settings WHERE id = 1");
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    agentId: r.agent_id,
    voiceId: r.voice_id,
    twilioSid: r.twilio_sid,
    twilioToken: r.twilio_token,
    twilioPhoneNumber: r.twilio_phone_number,
    phoneNumberId: r.phone_number_id,
    updatedAt: r.updated_at,
  };
}

export function upsertSettings(sql: Sql, patch: Record<string, unknown>): SettingsRow | null {
  const existing = getSettingsRow(sql);
  const now = Date.now();
  const current = existing ?? {
    id: 1,
    agentId: null,
    voiceId: null,
    twilioSid: null,
    twilioToken: null,
    twilioPhoneNumber: null,
    phoneNumberId: null,
    updatedAt: null,
  };
  const merged = { ...current, ...patch, id: 1, updatedAt: now } as SettingsRow;
  sql.exec(
    "INSERT INTO settings (id, agent_id, voice_id, twilio_sid, twilio_token, twilio_phone_number, phone_number_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET agent_id = excluded.agent_id, voice_id = excluded.voice_id, twilio_sid = excluded.twilio_sid, twilio_token = excluded.twilio_token, twilio_phone_number = excluded.twilio_phone_number, phone_number_id = excluded.phone_number_id, updated_at = excluded.updated_at",
    [merged.id, merged.agentId, merged.voiceId, merged.twilioSid, merged.twilioToken, merged.twilioPhoneNumber, merged.phoneNumberId, merged.updatedAt],
  );
  return getSettingsRow(sql);
}

export function seedSettingsFromEnv(sql: Sql, env: AppEnv) {
  const row = getSettingsRow(sql);
  const patch: Record<string, unknown> = {};
  if (!row?.twilioSid && env.twilioSid) patch.twilioSid = env.twilioSid;
  if (!row?.twilioToken && env.twilioToken) patch.twilioToken = env.twilioToken;
  if (!row?.twilioPhoneNumber && env.twilioPhoneNumber) patch.twilioPhoneNumber = normalizeE164(env.twilioPhoneNumber);
  if (Object.keys(patch).length) upsertSettings(sql, patch);
}
