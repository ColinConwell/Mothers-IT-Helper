import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import { makeDb, devices } from "../db/index";
import { PERSONA_PROMPT, DEFAULT_FIRST_MESSAGE, CALLER_VOICE_ID, turnDurationMs } from "../shared/persona";
import { normalizeE164, looksLikeTwilioAccountSid } from "../shared/phone";
import { credentialHealth, publicOrigin, type AppEnv } from "./env";
import { makeSql } from "./sql";
import { elFetch } from "./elevenlabs";
import { resolveTwilioAuth, twilioFetch } from "./twilio";
import { searchManualUrl, fetchManualText } from "./brave";
import { generateDialogue } from "./llm";
import { getSettingsRow, upsertSettings, seedSettingsFromEnv } from "./settings";
import { sendPendingSurveys } from "./surveys";

export type CreateAppOpts = {
  sqlite: Database.Database;
  env: AppEnv;
  fetchImpl?: typeof fetch;
};

export function createApp(opts: CreateAppOpts) {
  const sqlite = opts.sqlite;
  const env = opts.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sql = makeSql(sqlite);
  seedSettingsFromEnv(sql, env);

  const el = (path: string, init?: RequestInit) => elFetch(env, fetchImpl, path, init);
  const db = () => makeDb(sqlite);

  const app = new Hono();
  app.onError((err, c) => c.json({ error: err.message || String(err) }, 400));

  async function fetchAgent(agentId: string) {
    const res = await el(`/convai/agents/${agentId}`);
    if (!res.ok) throw new Error(`get agent failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async function patchAgentKnowledgeBase(agentId: string, knowledgeBase: any[]) {
    const agent = await fetchAgent(agentId);
    const conversationConfig = agent.conversation_config ?? {};
    const agentConfig = conversationConfig.agent ?? {};
    const prompt = { ...(agentConfig.prompt ?? {}), knowledge_base: knowledgeBase };
    delete (prompt as any).tools;
    const newConfig = { ...conversationConfig, agent: { ...agentConfig, prompt } };
    const res = await el(`/convai/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify({ conversation_config: newConfig }),
    });
    if (!res.ok) throw new Error(`patch agent failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async function ensureManualSearchTool(origin: string): Promise<string | null> {
    const listRes = await el("/convai/tools");
    if (listRes.ok) {
      const data: any = await listRes.json();
      const existing = (data.tools ?? []).find((t: any) => t?.tool_config?.name === "search_device_manual");
      if (existing?.id) return existing.id;
    }
    const createRes = await el("/convai/tools", {
      method: "POST",
      body: JSON.stringify({
        tool_config: {
          type: "webhook",
          name: "search_device_manual",
          description:
            "Look up the user manual for a consumer device (TV, router, phone, printer, etc.) when you don't already have it. Call this as soon as you know the make and model. Returns manual text you should use to give precise, model-specific steps.",
          response_timeout_secs: 20,
          api_schema: {
            url: `${origin}/tools/search-manual`,
            method: "POST",
            request_body_schema: {
              type: "object",
              required: ["device"],
              properties: {
                device: {
                  type: "string",
                  description: "The device make and model, e.g. 'Samsung QN90A TV' or 'Netgear Nighthawk R7000 router'. Include the problem if known.",
                },
              },
            },
          },
        },
      }),
    });
    if (!createRes.ok) return null;
    const created: any = await createRes.json();
    return created.id ?? null;
  }

  async function ttsBytes(voiceId: string, text: string): Promise<Uint8Array | null> {
    const res = await el(`/text-to-speech/${voiceId}`, {
      method: "POST",
      body: JSON.stringify({ text, model_id: env.ttsModel }),
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }

  app.get("/api/health", (c) => {
    const row = getSettingsRow(sql);
    const health = credentialHealth(env);
    const origin = publicOrigin(c.req.url, env);
    return c.json({
      ...health,
      origin,
      storedTwilioSid: Boolean(row?.twilioSid),
      storedTwilioPhone: Boolean(row?.twilioPhoneNumber),
      storedTwilioSidIsAccount: looksLikeTwilioAccountSid(row?.twilioSid ?? env.twilioSid),
    });
  });

  app.get("/api/status", (c) => {
    const row = getSettingsRow(sql);
    return c.json({
      agentId: row?.agentId ?? null,
      voiceId: row?.voiceId ?? null,
      phoneNumberId: row?.phoneNumberId ?? null,
      twilioPhoneNumber: row?.twilioPhoneNumber ?? env.twilioPhoneNumber ?? null,
      twilioConfigured: Boolean(resolveTwilioAuth(env, row) && (row?.twilioPhoneNumber || env.twilioPhoneNumber)),
      twilioSidPrefill: row?.twilioSid || env.twilioSid || "",
      twilioPhonePrefill: row?.twilioPhoneNumber || env.twilioPhoneNumber || "",
    });
  });

  app.get("/api/voices", async (c) => {
    const res = await el("/voices");
    if (!res.ok) return c.json({ error: await res.text() }, 502);
    const data: any = await res.json();
    const voices = (data.voices ?? []).map((v: any) => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category ?? null,
      labels: v.labels ?? {},
      preview_url: v.preview_url ?? null,
    }));
    return c.json({ voices });
  });

  app.post("/api/voices/clone", async (c) => {
    const form = await c.req.formData();
    const name = String(form.get("name") ?? "").trim();
    if (!name) return c.json({ error: "name is required" }, 400);
    const files = form.getAll("files").filter((f) => f instanceof File) as File[];
    if (!files.length) return c.json({ error: "at least one audio file is required" }, 400);
    const out = new FormData();
    out.append("name", name);
    const description = String(form.get("description") ?? "").trim();
    if (description) out.append("description", description);
    if (String(form.get("removeBackgroundNoise") ?? "") === "true") out.append("remove_background_noise", "true");
    for (const f of files) out.append("files", f, f.name);
    const res = await el("/voices/add", { method: "POST", body: out });
    if (!res.ok) return c.json({ error: await res.text() }, 502);
    return c.json(await res.json());
  });

  app.post("/api/voices/design", async (c) => {
    const body = await c.req.json<{ voiceDescription?: string; text?: string }>().catch(() => ({} as any));
    if (!body.voiceDescription?.trim()) return c.json({ error: "voiceDescription is required" }, 400);
    const payload: Record<string, unknown> = {
      voice_description: body.voiceDescription.trim(),
      model_id: "eleven_ttv_v3",
      auto_generate_text: !body.text?.trim(),
    };
    if (body.text?.trim()) payload.text = body.text.trim();
    const res = await el("/text-to-voice/design", { method: "POST", body: JSON.stringify(payload) });
    if (!res.ok) return c.json({ error: await res.text() }, 502);
    return c.json(await res.json());
  });

  app.post("/api/voices/design/save", async (c) => {
    const body = await c.req.json<{ voiceName?: string; voiceDescription?: string; generatedVoiceId?: string }>().catch(() => ({} as any));
    if (!body.voiceName?.trim() || !body.generatedVoiceId?.trim()) {
      return c.json({ error: "voiceName and generatedVoiceId are required" }, 400);
    }
    const res = await el("/text-to-voice", {
      method: "POST",
      body: JSON.stringify({
        voice_name: body.voiceName.trim(),
        voice_description: body.voiceDescription ?? "",
        generated_voice_id: body.generatedVoiceId.trim(),
      }),
    });
    if (!res.ok) return c.json({ error: await res.text() }, 502);
    return c.json(await res.json());
  });

  app.delete("/api/voices/:id", async (c) => {
    const id = c.req.param("id");
    const res = await el(`/voices/${id}`, { method: "DELETE" });
    if (!res.ok) return c.json({ error: await res.text() }, 502);
    const row = getSettingsRow(sql);
    if (row?.voiceId === id) upsertSettings(sql, { voiceId: null });
    return c.json({ ok: true });
  });

  app.post("/api/voices/:id/use", async (c) => {
    const voiceId = c.req.param("id");
    const row = getSettingsRow(sql);
    if (!row?.agentId) {
      upsertSettings(sql, { voiceId });
      return c.json({ ok: true, voiceId, updatedAgent: false });
    }
    const agent = await fetchAgent(row.agentId);
    const cc = agent.conversation_config ?? {};
    const newConfig = { ...cc, tts: { ...(cc.tts ?? {}), voice_id: voiceId } };
    const res = await el(`/convai/agents/${row.agentId}`, {
      method: "PATCH",
      body: JSON.stringify({ conversation_config: newConfig }),
    });
    if (!res.ok) return c.json({ error: await res.text() }, 502);
    upsertSettings(sql, { voiceId });
    return c.json({ ok: true, voiceId, updatedAgent: true });
  });

  app.post("/api/twilio", async (c) => {
    const body = await c.req.json<{ sid: string; token: string; phoneNumber: string }>();
    if (!body.sid?.trim() || !body.token?.trim() || !body.phoneNumber?.trim()) {
      return c.json({ error: "sid, token, and phoneNumber are all required" }, 400);
    }
    await upsertSettings(sql, {
      twilioSid: body.sid.trim(),
      twilioToken: body.token.trim(),
      twilioPhoneNumber: normalizeE164(body.phoneNumber),
    });
    return c.json({ ok: true });
  });

  app.post("/api/agent/create", async (c) => {
    const body = await c.req.json<{ voiceId?: string | null }>().catch(() => ({} as any));
    const row = getSettingsRow(sql);
    let voiceId: string | null | undefined = body.voiceId || row?.voiceId;
    if (!voiceId) {
      try {
        const voicesRes = await el("/voices");
        if (voicesRes.ok) {
          const data: any = await voicesRes.json();
          const clones = (data.voices ?? []).filter((v: any) => v.category && v.category !== "premade");
          voiceId = clones[0]?.voice_id ?? data.voices?.[0]?.voice_id;
        }
      } catch {
        // keep undefined
      }
    }

    const origin = publicOrigin(c.req.url, env);
    const toolId = await ensureManualSearchTool(origin);

    const conversationConfig: any = {
      agent: {
        first_message: DEFAULT_FIRST_MESSAGE,
        language: "en",
        prompt: {
          prompt: PERSONA_PROMPT,
          ...(toolId ? { tool_ids: [toolId] } : {}),
        },
      },
    };
    if (voiceId) conversationConfig.tts = { voice_id: voiceId };

    let agentId: string;
    let updated = false;
    if (row?.agentId) {
      const res = await el(`/convai/agents/${row.agentId}`, {
        method: "PATCH",
        body: JSON.stringify({ conversation_config: conversationConfig }),
      });
      if (!res.ok) return c.json({ error: await res.text() }, 502);
      agentId = row.agentId;
      updated = true;
    } else {
      const res = await el("/convai/agents/create", {
        method: "POST",
        body: JSON.stringify({ name: "Family Tech Line", conversation_config: conversationConfig }),
      });
      if (!res.ok) return c.json({ error: await res.text() }, 502);
      const created: any = await res.json();
      agentId = created.agent_id;
    }

    upsertSettings(sql, { agentId, voiceId: voiceId ?? null });
    return c.json({ ok: true, agentId, updated });
  });

  app.get("/api/agent/prompt", async (c) => {
    const row = getSettingsRow(sql);
    if (!row?.agentId) {
      return c.json({ hasAgent: false, prompt: PERSONA_PROMPT, firstMessage: DEFAULT_FIRST_MESSAGE });
    }
    try {
      const agent = await fetchAgent(row.agentId);
      const a = agent.conversation_config?.agent ?? {};
      return c.json({ hasAgent: true, prompt: a.prompt?.prompt ?? PERSONA_PROMPT, firstMessage: a.first_message ?? "" });
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, 502);
    }
  });

  app.post("/api/agent/prompt", async (c) => {
    const body = await c.req.json<{ prompt?: string; firstMessage?: string }>().catch(() => ({} as any));
    const row = getSettingsRow(sql);
    if (!row?.agentId) return c.json({ error: "Create the assistant first." }, 400);
    if (!body.prompt?.trim()) return c.json({ error: "Prompt cannot be empty." }, 400);

    const agent = await fetchAgent(row.agentId);
    const cc = agent.conversation_config ?? {};
    const agentConfig = cc.agent ?? {};
    const newPrompt = { ...(agentConfig.prompt ?? {}), prompt: body.prompt };
    delete (newPrompt as any).tools;
    const newConfig = {
      ...cc,
      agent: {
        ...agentConfig,
        first_message: body.firstMessage ?? agentConfig.first_message ?? "",
        prompt: newPrompt,
      },
    };
    const res = await el(`/convai/agents/${row.agentId}`, {
      method: "PATCH",
      body: JSON.stringify({ conversation_config: newConfig }),
    });
    if (!res.ok) return c.json({ error: await res.text() }, 502);
    return c.json({ ok: true });
  });

  app.get("/api/agent/conversation-token", async (c) => {
    const row = getSettingsRow(sql);
    if (!row?.agentId) return c.json({ error: "Create the assistant first." }, 400);
    const res = await el(`/convai/conversation/token?agent_id=${row.agentId}`);
    if (!res.ok) return c.json({ error: await res.text() }, 502);
    const data: any = await res.json();
    return c.json({ token: data.token });
  });

  app.post("/api/phone/import", async (c) => {
    const row = getSettingsRow(sql);
    if (!row?.agentId) return c.json({ error: "Create the assistant first." }, 400);
    const auth = resolveTwilioAuth(env, row);
    const phone = row.twilioPhoneNumber || env.twilioPhoneNumber;
    if (!auth || !phone) {
      return c.json({ error: "Enter your Twilio credentials first." }, 400);
    }
    if (!auth.importToken) {
      return c.json({ error: "ElevenLabs phone import needs TWILIO_AUTH_TOKEN (the account Auth Token), not only an API key." }, 400);
    }
    const e164 = normalizeE164(phone);
    if (row.phoneNumberId) {
      await el(`/convai/phone-numbers/${row.phoneNumberId}`, { method: "DELETE" }).catch(() => {});
    }
    const res = await el("/convai/phone-numbers", {
      method: "POST",
      body: JSON.stringify({
        provider: "twilio",
        phone_number: e164,
        label: "Family Tech Line",
        sid: auth.accountSid,
        token: auth.importToken,
        agent_id: row.agentId,
      }),
    });
    if (!res.ok) return c.json({ error: await res.text() }, 502);
    const data: any = await res.json();
    upsertSettings(sql, { phoneNumberId: data.phone_number_id, twilioPhoneNumber: e164 });
    return c.json({ ok: true, phoneNumberId: data.phone_number_id, phoneNumber: e164 });
  });

  app.post("/api/twilio/search", async (c) => {
    const body = await c.req.json<{ areaCode?: string; country?: string }>().catch(() => ({} as any));
    const row = getSettingsRow(sql);
    const auth = resolveTwilioAuth(env, row);
    if (!auth) return c.json({ error: "Save your Twilio credentials first." }, 400);
    const country = (body.country || "US").toUpperCase();
    const qs = new URLSearchParams({ SmsEnabled: "true", VoiceEnabled: "true", PageSize: "8" });
    if (body.areaCode) qs.set("AreaCode", body.areaCode.replace(/\D/g, ""));
    const res = await twilioFetch(fetchImpl, auth, `/AvailablePhoneNumbers/${country}/Local.json?${qs}`);
    if (!res.ok) return c.json({ error: await res.text() }, 502);
    const d: any = await res.json();
    const numbers = (d.available_phone_numbers ?? []).map((n: any) => ({
      phoneNumber: n.phone_number,
      locality: n.locality,
      region: n.region,
    }));
    return c.json({ numbers });
  });

  app.post("/api/twilio/buy", async (c) => {
    const body = await c.req.json<{ phoneNumber?: string }>().catch(() => ({} as any));
    const row = getSettingsRow(sql);
    if (!row?.agentId) return c.json({ error: "Create the assistant first." }, 400);
    const auth = resolveTwilioAuth(env, row);
    if (!auth) return c.json({ error: "Save your Twilio credentials first." }, 400);
    const e164 = normalizeE164(body.phoneNumber ?? "");
    if (!/^\+\d{8,}$/.test(e164)) return c.json({ error: "Invalid phone number." }, 400);

    const buy = await twilioFetch(fetchImpl, auth, "/IncomingPhoneNumbers.json", {
      method: "POST",
      form: { PhoneNumber: e164, FriendlyName: "Mother's Little Helper" },
    });
    if (!buy.ok) return c.json({ error: `Twilio purchase failed: ${await buy.text()}` }, 502);
    if (!auth.importToken) {
      upsertSettings(sql, { twilioPhoneNumber: e164, twilioSid: auth.accountSid });
      return c.json({ error: `Bought ${e164}, but ElevenLabs import needs TWILIO_AUTH_TOKEN.` }, 502);
    }

    if (row.phoneNumberId) {
      await el(`/convai/phone-numbers/${row.phoneNumberId}`, { method: "DELETE" }).catch(() => {});
    }
    const imp = await el("/convai/phone-numbers", {
      method: "POST",
      body: JSON.stringify({
        provider: "twilio",
        phone_number: e164,
        label: "Family Tech Line",
        sid: auth.accountSid,
        token: auth.importToken,
        agent_id: row.agentId,
      }),
    });
    if (!imp.ok) return c.json({ error: `Bought ${e164}, but wiring to the assistant failed: ${await imp.text()}` }, 502);
    const data: any = await imp.json();
    upsertSettings(sql, { phoneNumberId: data.phone_number_id, twilioPhoneNumber: e164, twilioSid: auth.accountSid, twilioToken: auth.importToken });
    return c.json({ ok: true, phoneNumber: e164, phoneNumberId: data.phone_number_id });
  });

  app.get("/api/survey", (c) => {
    const r = sql.query<{ survey_enabled: number }>("SELECT survey_enabled FROM settings WHERE id = 1")[0];
    return c.json({ enabled: !!r?.survey_enabled });
  });

  app.post("/api/survey", async (c) => {
    const body = await c.req.json<{ enabled?: boolean }>().catch(() => ({} as any));
    const enabled = !!body.enabled;
    const row = getSettingsRow(sql);
    sql.exec("UPDATE settings SET survey_enabled = ?, survey_enabled_at = ? WHERE id = 1", [enabled ? 1 : 0, enabled ? Date.now() : null]);
    const auth = resolveTwilioAuth(env, row);
    const phone = row?.twilioPhoneNumber || env.twilioPhoneNumber;
    if (enabled && auth && phone) {
      try {
        const origin = publicOrigin(c.req.url, env);
        const look = await twilioFetch(
          fetchImpl,
          auth,
          `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(normalizeE164(phone))}`,
        );
        if (look.ok) {
          const d: any = await look.json();
          const pnSid = d.incoming_phone_numbers?.[0]?.sid;
          if (pnSid) {
            await twilioFetch(fetchImpl, auth, `/IncomingPhoneNumbers/${pnSid}.json`, {
              method: "POST",
              form: { SmsUrl: `${origin}/webhooks/sms`, SmsMethod: "POST" },
            });
          }
        }
      } catch {
        // non-fatal
      }
    }
    return c.json({ ok: true, enabled });
  });

  app.get("/api/devices", (c) => {
    const rows = db().query.devices.findMany({ orderBy: (t, { desc: d }) => d(t.id) }).sync();
    return c.json({ devices: rows });
  });

  app.post("/api/devices", async (c) => {
    const body = await c.req.json<{ name: string; model?: string; sourceUrl?: string }>();
    if (!body.name?.trim()) return c.json({ error: "Device name is required" }, 400);

    const now = Date.now();
    const inserted = db()
      .insert(devices)
      .values({ name: body.name.trim(), model: body.model?.trim() || null, status: "pending", createdAt: now })
      .returning()
      .all();
    const device = inserted[0];

    try {
      const row = getSettingsRow(sql);
      let sourceUrl = body.sourceUrl?.trim() || null;
      if (!sourceUrl) {
        const query = `${body.name} ${body.model ?? ""} user manual pdf`.trim();
        sourceUrl = await searchManualUrl(env, fetchImpl, query);
      }
      if (!sourceUrl) {
        db().update(devices).set({ status: "error", errorMsg: "No manual found via web search — try pasting a URL." }).where(eq(devices.id, device.id)).run();
        return c.json({ device: { ...device, status: "error" } });
      }

      const kbRes = await el("/convai/knowledge-base/url", {
        method: "POST",
        body: JSON.stringify({ url: sourceUrl, name: `${body.name} ${body.model ?? ""}`.trim() }),
      });
      if (!kbRes.ok) {
        const errText = await kbRes.text();
        db().update(devices).set({ status: "error", errorMsg: `Manual fetch failed: ${errText}`, sourceUrl }).where(eq(devices.id, device.id)).run();
        return c.json({ device: { ...device, status: "error", sourceUrl } });
      }
      const kbDoc: any = await kbRes.json();

      if (row?.agentId) {
        const agent = await fetchAgent(row.agentId);
        const existingKb = agent.conversation_config?.agent?.prompt?.knowledge_base ?? [];
        const newKb = [...existingKb, { type: "url", name: kbDoc.name, id: kbDoc.id, usage_mode: "auto" }];
        await patchAgentKnowledgeBase(row.agentId, newKb);
      }

      db().update(devices).set({ status: "ready", sourceUrl, kbDocumentId: kbDoc.id, errorMsg: null }).where(eq(devices.id, device.id)).run();
      return c.json({ device: { ...device, status: "ready", sourceUrl, kbDocumentId: kbDoc.id } });
    } catch (err: any) {
      db().update(devices).set({ status: "error", errorMsg: String(err?.message ?? err) }).where(eq(devices.id, device.id)).run();
      return c.json({ device: { ...device, status: "error" } });
    }
  });

  app.delete("/api/devices/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const device = db().query.devices.findFirst({ where: eq(devices.id, id) }).sync();
    if (!device) return c.json({ error: "not found" }, 404);

    try {
      const row = getSettingsRow(sql);
      if (row?.agentId && device.kbDocumentId) {
        const agent = await fetchAgent(row.agentId);
        const existingKb = agent.conversation_config?.agent?.prompt?.knowledge_base ?? [];
        const newKb = existingKb.filter((d: any) => d.id !== device.kbDocumentId);
        await patchAgentKnowledgeBase(row.agentId, newKb);
      }
      if (device.kbDocumentId) {
        await el(`/convai/knowledge-base/${device.kbDocumentId}?force=true`, { method: "DELETE" });
      }
    } catch {
      // best effort
    }

    db().delete(devices).where(eq(devices.id, id)).run();
    return c.json({ ok: true });
  });

  app.get("/api/calls", async (c) => {
    const row = getSettingsRow(sql);
    if (row?.agentId) {
      try {
        const res = await el(`/convai/conversations?agent_id=${row.agentId}&page_size=30`);
        if (res.ok) {
          const data: any = await res.json();
          const now = Date.now();
          const enriched = new Set(sql.query<{ id: string }>("SELECT id FROM calls WHERE success IS NOT NULL").map((r) => r.id));
          let detailBudget = 8;
          for (const conv of data.conversations ?? []) {
            const id = conv.conversation_id;
            const startedAt = conv.start_time_unix_secs ? conv.start_time_unix_secs * 1000 : null;
            const durationSecs = conv.call_duration_secs ?? null;
            let summary = conv.call_summary_title ?? conv.status ?? null;
            let caller: string | null = null;
            let sentiment: string | null = null;
            let transcriptJson: string | null = null;
            let latencyMs: number | null = null;
            let success: string | null = null;

            const needsDetail = conv.status === "done" && !enriched.has(id) && detailBudget > 0;
            if (needsDetail) {
              detailBudget--;
              try {
                const det = await el(`/convai/conversations/${id}`);
                if (det.ok) {
                  const d: any = await det.json();
                  const pc = d.metadata?.phone_call;
                  caller = pc?.external_number ?? "Web test call";
                  const turns = (d.transcript ?? [])
                    .map((t: any) => ({ speaker: t.role === "agent" ? "coco" : "caller", text: t.message ?? "" }))
                    .filter((t: any) => t.text.trim());
                  transcriptJson = JSON.stringify(turns);
                  summary = d.analysis?.transcript_summary ?? d.analysis?.call_summary_title ?? summary;
                  const sa = d.analysis?.sentiment_analysis;
                  sentiment = typeof sa?.overall_sentiment === "string" ? sa.overall_sentiment : null;
                  success = typeof d.analysis?.call_successful === "string" ? d.analysis.call_successful : "unknown";
                  const lat: number[] = [];
                  for (const t of d.transcript ?? []) {
                    const m = t.conversation_turn_metrics?.metrics;
                    const v = m?.convai_ttf_audio_since_silence?.elapsed_time ?? m?.convai_tts_service_ttfb?.elapsed_time;
                    if (typeof v === "number" && v > 0) lat.push(v);
                  }
                  if (lat.length) latencyMs = Math.round((lat.reduce((a, b) => a + b, 0) / lat.length) * 1000);
                }
              } catch {
                // retry later
              }
            }

            if (transcriptJson !== null) {
              sql.exec(
                "INSERT INTO calls (id, started_at, duration_secs, summary, caller, sentiment, latency_ms, success, transcript_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET started_at=excluded.started_at, duration_secs=excluded.duration_secs, summary=excluded.summary, caller=excluded.caller, sentiment=excluded.sentiment, latency_ms=excluded.latency_ms, success=excluded.success, transcript_json=excluded.transcript_json, fetched_at=excluded.fetched_at",
                [id, startedAt, durationSecs, summary, caller, sentiment, latencyMs, success, transcriptJson, now],
              );
            } else {
              sql.exec(
                "INSERT INTO calls (id, started_at, duration_secs, summary, fetched_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET started_at=excluded.started_at, duration_secs=excluded.duration_secs, summary=COALESCE(calls.summary, excluded.summary), fetched_at=excluded.fetched_at",
                [id, startedAt, durationSecs, summary, now],
              );
            }
          }
        }
      } catch {
        // cached
      }
    }
    const rows = sql.query<any>("SELECT id, started_at, duration_secs, summary, caller, sentiment, latency_ms, success, survey_rating, transcript_json FROM calls ORDER BY started_at DESC");
    const callRows = rows.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      durationSecs: r.duration_secs,
      summary: r.summary,
      caller: r.caller,
      sentiment: r.sentiment,
      latencyMs: r.latency_ms,
      success: r.success,
      surveyRating: r.survey_rating ?? null,
      transcript: r.transcript_json ? JSON.parse(r.transcript_json) : [],
    }));
    return c.json({ calls: callRows });
  });

  app.post("/tools/search-manual", async (c) => {
    let device = "";
    try {
      const body = await c.req.json<{ device?: string }>();
      device = (body.device ?? "").trim();
    } catch {
      // ignore
    }
    if (!device) return c.json({ found: false, message: "No device was provided." });
    const result = await fetchManualText(env, fetchImpl, device);
    if (!result.found || !result.excerpt) {
      return c.json({
        found: false,
        message: `Couldn't find a manual for "${device}". Fall back to general troubleshooting and tell the caller you're going from general knowledge.`,
        source_url: result.sourceUrl ?? null,
      });
    }
    return c.json({ found: true, device, source_url: result.sourceUrl ?? null, manual_excerpt: result.excerpt });
  });

  app.post("/api/sample-call", async (c) => {
    const body = await c.req.json<{ device?: string }>().catch(() => ({} as any));
    const device = (body.device ?? "").trim() || "TV remote";
    const row = getSettingsRow(sql);

    let cocoVoiceId = row?.voiceId ?? null;
    if (!cocoVoiceId) {
      try {
        const vr = await el("/voices");
        if (vr.ok) {
          const vd: any = await vr.json();
          const clone = (vd.voices ?? []).find((v: any) => v.category && v.category !== "premade");
          cocoVoiceId = clone?.voice_id ?? vd.voices?.[0]?.voice_id ?? null;
        }
      } catch {
        // ignore
      }
    }
    if (!cocoVoiceId) return c.json({ error: "No voice configured. Create the assistant first." }, 400);

    const turns = await generateDialogue(env, device);
    const now = Date.now();
    sql.exec("DELETE FROM sample_turn");
    sql.exec(
      "INSERT INTO sample_call (id, device, caller_voice_id, coco_voice_id, created_at) VALUES (1, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET device = excluded.device, caller_voice_id = excluded.caller_voice_id, coco_voice_id = excluded.coco_voice_id, created_at = excluded.created_at",
      [device, CALLER_VOICE_ID, cocoVoiceId, now],
    );

    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      const voiceId = t.speaker === "coco" ? cocoVoiceId : CALLER_VOICE_ID;
      let audio: Uint8Array | null = null;
      try {
        audio = await ttsBytes(voiceId, t.text);
      } catch {
        audio = null;
      }
      sql.exec("INSERT INTO sample_turn (idx, speaker, text, audio, created_at) VALUES (?, ?, ?, ?, ?)", [
        i,
        t.speaker,
        t.text,
        audio ? Buffer.from(audio) : null,
        now,
      ]);
    }

    return c.json({ ok: true, device, turns: turns.map((t, i) => ({ idx: i, speaker: t.speaker, text: t.text })) });
  });

  app.get("/api/sample-call", (c) => {
    const call = sql.query<{ device: string; created_at: number }>("SELECT device, created_at FROM sample_call WHERE id = 1")[0];
    if (!call) return c.json({ exists: false });
    const turns = sql.query<{ idx: number; speaker: string; text: string }>("SELECT idx, speaker, text FROM sample_turn ORDER BY idx");
    return c.json({ exists: true, device: call.device, turns });
  });

  app.get("/api/sample-call/audio/:idx", (c) => {
    const idx = Number(c.req.param("idx"));
    const rows = sql.query<{ audio: Buffer | null }>("SELECT audio FROM sample_turn WHERE idx = ?", [idx]);
    const audio = rows[0]?.audio;
    if (!audio) return c.json({ error: "no audio" }, 404);
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  });

  app.post("/api/monitor/simulate", async (c) => {
    const body = await c.req.json<{ device?: string }>().catch(() => ({} as any));
    const device = (body.device ?? "").trim() || "a smart TV";
    const turns = await generateDialogue(env, device);
    const caller = "+1 (610) 555-0142";
    sql.exec(
      "INSERT INTO monitor (id, mode, active, caller, started_at, turns_json, conversation_id) VALUES (1, 'sim', 1, ?, ?, ?, NULL) ON CONFLICT (id) DO UPDATE SET mode='sim', active=1, caller=excluded.caller, started_at=excluded.started_at, turns_json=excluded.turns_json, conversation_id=NULL",
      [caller, Date.now(), JSON.stringify(turns)],
    );
    return c.json({ ok: true, caller, device });
  });

  app.post("/api/monitor/stop", (c) => {
    sql.exec("UPDATE monitor SET active = 0 WHERE id = 1");
    return c.json({ ok: true });
  });

  app.get("/api/monitor/live", async (c) => {
    const row = sql.query<{
      mode: string | null;
      active: number;
      caller: string | null;
      started_at: number | null;
      turns_json: string | null;
      conversation_id: string | null;
    }>("SELECT mode, active, caller, started_at, turns_json, conversation_id FROM monitor WHERE id = 1")[0];

    if (row?.active && row.mode === "sim" && row.turns_json && row.started_at) {
      const turns: { speaker: string; text: string }[] = JSON.parse(row.turns_json);
      const elapsed = Date.now() - row.started_at;
      const RING = 1600;
      let offset = RING;
      let speakingUntil = 0;
      const out: { speaker: string; text: string }[] = [];
      for (let i = 0; i < turns.length; i++) {
        const dur = turnDurationMs(turns[i].text);
        if (elapsed >= offset) {
          out.push(turns[i]);
          speakingUntil = offset + dur;
        }
        offset += dur;
      }
      const totalEnd = offset + 1500;
      let status: string;
      if (elapsed < RING) status = "ringing";
      else if (elapsed >= totalEnd) status = "ended";
      else status = "in-progress";
      const last = out[out.length - 1];
      const currentSpeaker = status === "in-progress" && elapsed < speakingUntil && last ? last.speaker : null;
      return c.json({ active: status !== "ended", mode: "sim", caller: row.caller, status, currentSpeaker, turns: out });
    }

    const settings = getSettingsRow(sql);
    if (settings?.agentId) {
      try {
        const res = await el(`/convai/conversations?agent_id=${settings.agentId}&page_size=3`);
        if (res.ok) {
          const data: any = await res.json();
          const live = (data.conversations ?? []).find((cv: any) => cv.status === "in-progress" || cv.status === "processing");
          if (live) {
            const det = await el(`/convai/conversations/${live.conversation_id}`);
            let turns: { speaker: string; text: string }[] = [];
            if (det.ok) {
              const dd: any = await det.json();
              turns = (dd.transcript ?? [])
                .map((t: any) => ({ speaker: t.role === "agent" ? "coco" : "caller", text: t.message ?? "" }))
                .filter((t: any) => t.text);
            }
            return c.json({ active: true, mode: "live", caller: live.metadata?.phone_number ?? "caller", status: "in-progress", currentSpeaker: null, turns });
          }
        }
      } catch {
        // idle
      }
    }
    return c.json({ active: false, status: "idle", turns: [] });
  });

  app.post("/webhooks/sms", async (c) => {
    let from = "";
    let bodyText = "";
    try {
      const form = await c.req.parseBody();
      from = String(form.From ?? "");
      bodyText = String(form.Body ?? "");
    } catch {
      // ignore
    }
    const m = bodyText.match(/[1-5]/);
    if (from && m) {
      const rating = Number(m[0]);
      const target = sql.query<{ id: string }>("SELECT id FROM calls WHERE caller = ? AND surveyed = 1 ORDER BY started_at DESC LIMIT 1", [from])[0];
      if (target) sql.exec("UPDATE calls SET survey_rating = ? WHERE id = ?", [rating, target.id]);
    }
    return c.text("<Response></Response>", 200, { "Content-Type": "text/xml" });
  });

  app.post("/api/survey/run", async (c) => {
    const result = await sendPendingSurveys(sql, fetchImpl, env);
    return c.json({ ok: true, ...result });
  });

  return app;
}
