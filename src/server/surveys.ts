import type { Sql } from "./sql";
import type { AppEnv } from "./env";
import { normalizeE164 } from "../shared/phone";
import { resolveTwilioAuth, twilioFetch } from "./twilio";

export async function sendPendingSurveys(sql: Sql, fetchImpl: typeof fetch, env: AppEnv) {
  const s = sql.query<{
    twilio_sid: string | null;
    twilio_token: string | null;
    twilio_phone_number: string | null;
    survey_enabled: number;
    survey_enabled_at: number | null;
  }>("SELECT twilio_sid, twilio_token, twilio_phone_number, survey_enabled, survey_enabled_at FROM settings WHERE id = 1")[0];
  const auth = resolveTwilioAuth(env, s ? { twilioSid: s.twilio_sid, twilioToken: s.twilio_token } : null);
  if (!s?.survey_enabled || !auth || !s.twilio_phone_number) return { sent: 0 };
  const from = normalizeE164(s.twilio_phone_number);
  const since = s.survey_enabled_at ?? 0;
  const pending = sql.query<{ id: string; caller: string }>(
    "SELECT id, caller FROM calls WHERE surveyed = 0 AND success IS NOT NULL AND caller LIKE '+%' AND started_at > ? ORDER BY started_at DESC LIMIT 5",
    [since],
  );
  let sent = 0;
  for (const call of pending) {
    try {
      const res = await twilioFetch(fetchImpl, auth, "/Messages.json", {
        method: "POST",
        form: { To: call.caller, From: from, Body: "Thanks for calling the family tech line! How did it go? Reply with a number 1-5 (5 = great). — Coco" },
      });
      if (res.ok) {
        sql.exec("UPDATE calls SET surveyed = 1 WHERE id = ?", [call.id]);
        sent += 1;
      }
    } catch {
      // leave unsurveyed
    }
  }
  return { sent };
}
