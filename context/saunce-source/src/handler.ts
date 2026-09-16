import type { AppCtx, AppHandler } from "@sauna/apps-runtime";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { makeDb, devices, settings, calls } from "./db";

const EL_BASE = "https://api.elevenlabs.io/v1";

const PERSONA_PROMPT = `You are "Uncle Colin's Tech Line" — a warm, patient, slightly
theatrical caricature of a nephew who's a computer scientist and genuinely
loves gadgets. You're on the phone with a family member (a parent,
grandparent, or someone who isn't very comfortable with technology) who is
stuck on a device. Your whole job is to get them un-stuck without ever making
them feel foolish.

## Calibrate to the caller
- In the first minute, gauge how comfortable they are. Listen for cues: do
  they know words like "app" or "home screen", or do they say "the picture
  thing"? Match their vocabulary exactly — mirror the words THEY use for
  buttons and screens.
- If they seem lost, slow down and shrink each step. If they're clearly
  capable, you can move a little faster. Never talk down; never overwhelm.

## Give ergonomic, one-step-at-a-time instructions
- Give exactly ONE physical action per turn, then stop and wait. Never read
  a numbered list of 5 steps at them.
- Describe actions the way a body does them, not the way a manual writes them:
  "find the little round button on the edge nearest you", "the picture in the
  bottom-left corner that looks like a gear". Anchor to physical landmarks
  (top-right, the side facing you, next to the volume rocker), colors, and
  shapes — not menu jargon.
- Say the button/menu name AND what it looks like, every time.
- Offer to slow down or repeat at any point: "want me to say that again?"

## Check in constantly — this is the most important rule
- After EVERY single step, ask a concrete confirmation question before moving
  on: "okay — do you see it?", "what does the screen show now?", "did a light
  come on?". Never assume a step worked.
- If they sound unsure or the result doesn't match, back up one step and try
  a different way to describe it. Do not push forward on a shaky step.
- Periodically reassure: "you're doing great, this is exactly right."

## Grounding your answers in the real manual
- When a knowledge-base manual for their device is attached, use it to quote
  the exact model-specific button names, menu paths, and steps.
- If you DON'T already know the caller's exact device, or you're unsure of a
  model-specific detail, use the \`search_device_manual\` tool: pass the make
  and model (and the problem, if known) and it returns the relevant manual
  text. Call it as soon as you've confirmed what device they have — say
  something brief like "let me pull up your model real quick" so the silence
  isn't awkward, then use what it returns to give precise steps.
- Only fall back to general troubleshooting (cables, power-cycle, Wi-Fi) when
  the tool and knowledge base genuinely don't cover it — and say so honestly.

## Wrap up
- Start by asking what device they're on and what's happening on the screen
  right now — one question, then listen.
- End every call by confirming the problem is actually fixed, or clearly
  summarizing the one or two things to try next. Tell them they can always
  call back.`;

function elFetch(env: any, path: string, init: RequestInit = {}) {
  return fetch(`${EL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: "Bearer PLACEHOLDER_TOKEN",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";

// Direct Twilio REST call. The Twilio account is pinned at deploy, so the
// proxy injects HTTP Basic auth — we just build the URL with the account SID.
// Twilio expects form-encoded bodies for writes.
function twilioFetch(sid: string, path: string, init: { method?: string; form?: Record<string, string> } = {}) {
  const opts: RequestInit = { method: init.method ?? "GET" };
  if (init.form) {
    opts.body = new URLSearchParams(init.form).toString();
    opts.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  }
  return fetch(`${TWILIO_BASE}/Accounts/${sid}${path}`, opts);
}


// Twilio (and ElevenLabs) require E.164, e.g. +14782760110 — not a formatted
// display string like "+1 (478) 276-0110". A mismatch means ElevenLabs can't
// match the inbound call's To number to an agent (Twilio then plays
// "an application error has occurred").
function normalizeE164(raw: string): string {
  const trimmed = (raw ?? "").trim();
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (hadPlus) return "+" + digits;
  if (digits.length === 10) return "+1" + digits; // bare US number
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return "+" + digits;
}

async function upsertSettings(env: any, patch: Record<string, any>) {
  const existing = getSettingsRowSync(env);
  const now = Date.now();
  const current = existing ?? { id: 1, agentId: null, voiceId: null, twilioSid: null, twilioToken: null, twilioPhoneNumber: null, phoneNumberId: null, updatedAt: null };
  const merged = { ...current, ...patch, id: 1, updatedAt: now };
  env.sql.exec(
    "INSERT INTO settings (id, agent_id, voice_id, twilio_sid, twilio_token, twilio_phone_number, phone_number_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET agent_id = excluded.agent_id, voice_id = excluded.voice_id, twilio_sid = excluded.twilio_sid, twilio_token = excluded.twilio_token, twilio_phone_number = excluded.twilio_phone_number, phone_number_id = excluded.phone_number_id, updated_at = excluded.updated_at",
    [merged.id, merged.agentId, merged.voiceId, merged.twilioSid, merged.twilioToken, merged.twilioPhoneNumber, merged.phoneNumberId, merged.updatedAt],
  );
  return getSettingsRowSync(env);
}

function getSettingsRowSync(env: any) {
  const sql = env.sql as { query: <T>(sql: string, params?: any[]) => T[]; exec: (sql: string, params?: any[]) => { rowsRead: number; rowsWritten: number } };
  const rows = sql.query<{ id: number; agent_id: string | null; voice_id: string | null; twilio_sid: string | null; twilio_token: string | null; twilio_phone_number: string | null; phone_number_id: string | null; updated_at: number }>("SELECT id, agent_id, voice_id, twilio_sid, twilio_token, twilio_phone_number, phone_number_id, updated_at FROM settings WHERE id = 1");
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, agentId: r.agent_id, voiceId: r.voice_id, twilioSid: r.twilio_sid, twilioToken: r.twilio_token, twilioPhoneNumber: r.twilio_phone_number, phoneNumberId: r.phone_number_id, updatedAt: r.updated_at };
}


async function searchManualUrl(query: string): Promise<string | null> {
  // Brave Search API — the proxy injects the X-Subscription-Token from the
  // pinned "Brave Search API" connection. Reliable from the app's datacenter
  // IP (unlike scraping search engines directly).
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?count=3&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const data: any = await res.json();
  const results = data?.web?.results ?? [];
  // Prefer a readable HTML support page over a raw PDF manual — the agent can
  // ground voice steps in HTML text, but a PDF fetch returns unusable bytes.
  const urls: string[] = results.map((r: any) => r.url).filter(Boolean);
  const htmlUrl = urls.find((u) => !u.toLowerCase().endsWith(".pdf"));
  return htmlUrl ?? urls[0] ?? null;
}

// Live manual lookup used by the ElevenLabs webhook tool during a call:
// search for the device's manual, fetch the top page, strip it to readable
// text, and return a trimmed excerpt the agent can ground its steps in.
async function fetchManualText(query: string): Promise<{ found: boolean; sourceUrl?: string; excerpt?: string }> {
  const url = await searchManualUrl(`${query} user manual`);
  if (!url) return { found: false };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15" },
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) return { found: true, sourceUrl: url };
    const body = await res.text();
    // If it's a PDF (or looks like one), we can't extract clean text in-worker;
    // return the source without a garbage binary excerpt.
    if (contentType.includes("pdf") || body.slice(0, 5) === "%PDF-") {
      return { found: true, sourceUrl: url };
    }
    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    return { found: true, sourceUrl: url, excerpt: text.slice(0, 3500) };
  } catch {
    return { found: true, sourceUrl: url, excerpt: undefined };
  }
}

// Ensure the ElevenLabs "search_device_manual" webhook tool exists (pointing
// at this app's public /tools/search-manual endpoint) and return its id, so
// it can be attached to the agent. Idempotent: reuses the tool if present.
async function ensureManualSearchTool(env: any, origin: string): Promise<string | null> {
  const listRes = await elFetch(env, "/convai/tools");
  if (listRes.ok) {
    const data: any = await listRes.json();
    const existing = (data.tools ?? []).find((t: any) => t?.tool_config?.name === "search_device_manual");
    if (existing?.id) return existing.id;
  }
  const createRes = await elFetch(env, "/convai/tools", {
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

async function fetchAgent(env: any, agentId: string) {
  const res = await elFetch(env, `/convai/agents/${agentId}`);
  if (!res.ok) throw new Error(`get agent failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function patchAgentKnowledgeBase(env: any, agentId: string, knowledgeBase: any[]) {
  const agent = await fetchAgent(env, agentId);
  const conversationConfig = agent.conversation_config ?? {};
  const agentConfig = conversationConfig.agent ?? {};
  const prompt = { ...(agentConfig.prompt ?? {}), knowledge_base: knowledgeBase };
  delete (prompt as any).tools; // deprecated; keep only tool_ids or EL rejects the PATCH
  const newConfig = {
    ...conversationConfig,
    agent: {
      ...agentConfig,
      prompt,
    },
  };
  const res = await elFetch(env, `/convai/agents/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify({ conversation_config: newConfig }),
  });
  if (!res.ok) throw new Error(`patch agent failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// A warm, older-sounding premade voice for the "caller" in the demo call.
const CALLER_VOICE_ID = "pqHfZKP75CvOlQylNhV4"; // Bill - Wise, Mature, Balanced (age: old)

async function ttsBytes(env: any, voiceId: string, text: string): Promise<Uint8Array | null> {
  const res = await elFetch(env, `/text-to-speech/${voiceId}`, {
    method: "POST",
    body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
  });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

type DialogueTurn = { speaker: "caller" | "coco"; text: string };

// Generate a short, realistic call between a confused caller and Coco using
// the Sauna LLM. Falls back to a templated dialogue if anything goes wrong so
// the demo always works.
async function generateDialogue(device: string): Promise<DialogueTurn[]> {
  const instructions =
    "You script a short, realistic phone call for a demo of a family tech-support hotline. " +
    "The CALLER is an older, non-technical family member who is a little flustered. " +
    "COCO is a warm, patient tech helper who gives ONE simple physical step at a time, " +
    "describes buttons by shape/location, and checks in after each step. " +
    "Return ONLY a JSON array of 6 objects, each {\"speaker\":\"caller\"|\"coco\",\"text\":\"...\"}. " +
    "Start with coco answering the phone. Keep each line one or two spoken sentences. End resolved and reassuring.";
  try {
    const res = await fetch("https://sauna.local/v1/llms/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "fast",
        instructions,
        input: `The device is: ${device}. Write the call.`,
      }),
    });
    if (res.ok) {
      const data: any = await res.json();
      const textOut: string =
        data.output_text ??
        (data.output ?? [])
          .flatMap((o: any) => o.content ?? [])
          .find((c: any) => typeof c?.text === "string")?.text ??
        "";
      const match = textOut.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const turns = parsed
          .filter((t: any) => (t.speaker === "caller" || t.speaker === "coco") && typeof t.text === "string")
          .map((t: any) => ({ speaker: t.speaker, text: String(t.text).slice(0, 400) }));
        if (turns.length >= 2) return turns.slice(0, 8);
      }
    }
  } catch {
    // fall through to template
  }
  return [
    { speaker: "coco", text: "Hi, it's your tech line — what are we looking at today?" },
    { speaker: "caller", text: `Oh, hello dear. It's my ${device}. I can't get it to work and I'm all turned around.` },
    { speaker: "coco", text: "No worries at all, we'll sort it out together. First, can you find the little power button on the edge nearest you? Tell me when you see it." },
    { speaker: "caller", text: "Okay... yes, I think I found it. It's the round one." },
    { speaker: "coco", text: "That's the one, perfect. Give it a gentle press and hold for about five seconds, then let go. What happens?" },
    { speaker: "caller", text: "Oh! A little light came on and it's starting up. You're a lifesaver." },
    { speaker: "coco", text: "You did all the hard work. Watch for the home screen, and if anything looks off, just call me right back — anytime." },
  ];
}

// Text a short quality survey to callers whose call completed after the survey
// was enabled. Bounded per run; marks each surveyed on success so it fires once.
async function sendPendingSurveys(env: any) {
  const sql = env.sql as { query: <T>(s: string, p?: any[]) => T[]; exec: (s: string, p?: any[]) => any };
  const s = sql.query<{ twilio_sid: string | null; twilio_phone_number: string | null; survey_enabled: number; survey_enabled_at: number | null }>(
    "SELECT twilio_sid, twilio_phone_number, survey_enabled, survey_enabled_at FROM settings WHERE id = 1",
  )[0];
  if (!s?.survey_enabled || !s.twilio_sid || !s.twilio_phone_number) return;
  const from = normalizeE164(s.twilio_phone_number);
  const since = s.survey_enabled_at ?? 0;
  const pending = sql.query<{ id: string; caller: string }>(
    "SELECT id, caller FROM calls WHERE surveyed = 0 AND success IS NOT NULL AND caller LIKE '+%' AND started_at > ? ORDER BY started_at DESC LIMIT 5",
    [since],
  );
  for (const call of pending) {
    try {
      const res = await twilioFetch(s.twilio_sid, "/Messages.json", {
        method: "POST",
        form: { To: call.caller, From: from, Body: "Thanks for calling the family tech line! How did it go? Reply with a number 1-5 (5 = great). — Coco" },
      });
      if (res.ok) sql.exec("UPDATE calls SET surveyed = 1 WHERE id = ?", [call.id]);
    } catch {
      // leave unsurveyed; next run retries
    }
  }
}

const app = new Hono<{ Bindings: { sql: any; websocket: any; ctx: AppCtx } }>();

app.get("/api/status", async (c) => {
  const row = getSettingsRowSync(c.env);
  return c.json({
    agentId: row?.agentId ?? null,
    voiceId: row?.voiceId ?? null,
    phoneNumberId: row?.phoneNumberId ?? null,
    twilioPhoneNumber: row?.twilioPhoneNumber ?? null,
    twilioConfigured: Boolean(row?.twilioSid && row?.twilioToken && row?.twilioPhoneNumber),
  });
});




app.get("/api/voices", async (c) => {
  const res = await elFetch(c.env, "/voices");
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

app.post("/api/twilio", async (c) => {
  const body = await c.req.json<{ sid: string; token: string; phoneNumber: string }>();
  if (!body.sid?.trim() || !body.token?.trim() || !body.phoneNumber?.trim()) {
    return c.json({ error: "sid, token, and phoneNumber are all required" }, 400);
  }
  await upsertSettings(c.env, {
    twilioSid: body.sid.trim(),
    twilioToken: body.token.trim(),
    twilioPhoneNumber: normalizeE164(body.phoneNumber),
  });
  return c.json({ ok: true });
});

app.post("/api/agent/create", async (c) => {
  const body = await c.req.json<{ voiceId?: string | null }>().catch(() => ({} as any));
  const row = getSettingsRowSync(c.env);
  let voiceId: string | null | undefined = body.voiceId || row?.voiceId;
  if (!voiceId) {
    // If the caller hasn't picked one yet, default to any cloned voice in
    // the user's ElevenLabs account so a freshly-cloned voice gets used
    // without any extra clicks.
    try {
      const voicesRes = await elFetch(c.env, "/voices");
      if (voicesRes.ok) {
        const data: any = await voicesRes.json();
        const clones = (data.voices ?? []).filter((v: any) => v.category && v.category !== "premade");
        voiceId = clones[0]?.voice_id ?? data.voices?.[0]?.voice_id;
      }
    } catch {
      // keep voiceId undefined — ElevenLabs will use its own default
    }
  }

  // Ensure the live manual-search webhook tool exists and attach it, so the
  // agent can look up manuals mid-call for devices that aren't pre-loaded.
  const origin = new URL(c.req.url).origin;
  const toolId = await ensureManualSearchTool(c.env, origin);

  const conversationConfig: any = {
    agent: {
      first_message:
        "Hi, it's your tech line — I'm here to help with whatever's giving you trouble. What device are you looking at right now?",
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
    const res = await elFetch(c.env, `/convai/agents/${row.agentId}`, {
      method: "PATCH",
      body: JSON.stringify({ conversation_config: conversationConfig }),
    });
    if (!res.ok) return c.json({ error: await res.text() }, 502);
    agentId = row.agentId;
    updated = true;
  } else {
    const res = await elFetch(c.env, "/convai/agents/create", {
      method: "POST",
      body: JSON.stringify({ name: "Family Tech Line", conversation_config: conversationConfig }),
    });
    if (!res.ok) return c.json({ error: await res.text() }, 502);
    const created: any = await res.json();
    agentId = created.agent_id;
  }

  await upsertSettings(c.env, { agentId, voiceId: voiceId ?? null });
  return c.json({ ok: true, agentId, updated });
});

// Read the agent's current system prompt + first message for the editor.
app.get("/api/agent/prompt", async (c) => {
  const row = getSettingsRowSync(c.env);
  if (!row?.agentId) {
    return c.json({ hasAgent: false, prompt: PERSONA_PROMPT, firstMessage: "Hi, it's your tech line — I'm here to help with whatever's giving you trouble. What device are you looking at right now?" });
  }
  try {
    const agent = await fetchAgent(c.env, row.agentId);
    const a = agent.conversation_config?.agent ?? {};
    return c.json({ hasAgent: true, prompt: a.prompt?.prompt ?? PERSONA_PROMPT, firstMessage: a.first_message ?? "" });
  } catch (e: any) {
    return c.json({ error: String(e?.message ?? e) }, 502);
  }
});

// Save an edited system prompt + first message, preserving voice, tools, and
// attached knowledge-base manuals.
app.post("/api/agent/prompt", async (c) => {
  const body = await c.req.json<{ prompt?: string; firstMessage?: string }>().catch(() => ({} as any));
  const row = getSettingsRowSync(c.env);
  if (!row?.agentId) return c.json({ error: "Create the assistant first." }, 400);
  if (!body.prompt?.trim()) return c.json({ error: "Prompt cannot be empty." }, 400);

  const agent = await fetchAgent(c.env, row.agentId);
  const cc = agent.conversation_config ?? {};
  const agentConfig = cc.agent ?? {};
  const newPrompt = { ...(agentConfig.prompt ?? {}), prompt: body.prompt };
  delete (newPrompt as any).tools; // deprecated; keep only tool_ids or EL rejects the PATCH
  const newConfig = {
    ...cc,
    agent: {
      ...agentConfig,
      first_message: body.firstMessage ?? agentConfig.first_message ?? "",
      prompt: newPrompt,
    },
  };
  const res = await elFetch(c.env, `/convai/agents/${row.agentId}`, {
    method: "PATCH",
    body: JSON.stringify({ conversation_config: newConfig }),
  });
  if (!res.ok) return c.json({ error: await res.text() }, 502);
  return c.json({ ok: true });
});

// Mint a short-lived WebRTC conversation token so the browser can talk to the
// agent live (the ElevenLabs credential never touches the client).
app.get("/api/agent/conversation-token", async (c) => {
  const row = getSettingsRowSync(c.env);
  if (!row?.agentId) return c.json({ error: "Create the assistant first." }, 400);
  const res = await elFetch(c.env, `/convai/conversation/token?agent_id=${row.agentId}`);
  if (!res.ok) return c.json({ error: await res.text() }, 502);
  const data: any = await res.json();
  return c.json({ token: data.token });
});

app.post("/api/phone/import", async (c) => {
  const row = getSettingsRowSync(c.env);
  if (!row?.agentId) return c.json({ error: "Create the assistant first." }, 400);
  if (!row.twilioSid || !row.twilioToken || !row.twilioPhoneNumber) {
    return c.json({ error: "Enter your Twilio credentials first." }, 400);
  }
  const e164 = normalizeE164(row.twilioPhoneNumber);

  // Self-heal: if a number is already registered (possibly with a bad,
  // non-E.164 string that breaks inbound routing), delete it first so the
  // re-import registers the correct E.164 number that matches Twilio's
  // inbound `To`.
  if (row.phoneNumberId) {
    await elFetch(c.env, `/convai/phone-numbers/${row.phoneNumberId}`, { method: "DELETE" }).catch(() => {});
  }

  const res = await elFetch(c.env, "/convai/phone-numbers", {
    method: "POST",
    body: JSON.stringify({
      provider: "twilio",
      phone_number: e164,
      label: "Family Tech Line",
      sid: row.twilioSid,
      token: row.twilioToken,
      agent_id: row.agentId,
    }),
  });
  if (!res.ok) return c.json({ error: await res.text() }, 502);
  const data: any = await res.json();
  await upsertSettings(c.env, { phoneNumberId: data.phone_number_id, twilioPhoneNumber: e164 });
  return c.json({ ok: true, phoneNumberId: data.phone_number_id, phoneNumber: e164 });
});

// Search available Twilio numbers to buy (free; no charge until purchase).
app.post("/api/twilio/search", async (c) => {
  const body = await c.req.json<{ areaCode?: string; country?: string }>().catch(() => ({} as any));
  const row = getSettingsRowSync(c.env);
  if (!row?.twilioSid) return c.json({ error: "Save your Twilio credentials first." }, 400);
  const country = (body.country || "US").toUpperCase();
  const qs = new URLSearchParams({ SmsEnabled: "true", VoiceEnabled: "true", PageSize: "8" });
  if (body.areaCode) qs.set("AreaCode", body.areaCode.replace(/\D/g, ""));
  const res = await twilioFetch(row.twilioSid, `/AvailablePhoneNumbers/${country}/Local.json?${qs}`);
  if (!res.ok) return c.json({ error: await res.text() }, 502);
  const d: any = await res.json();
  const numbers = (d.available_phone_numbers ?? []).map((n: any) => ({
    phoneNumber: n.phone_number,
    locality: n.locality,
    region: n.region,
  }));
  return c.json({ numbers });
});

// Buy a Twilio number and wire it to the agent. SPENDS MONEY (~$1-2/mo).
app.post("/api/twilio/buy", async (c) => {
  const body = await c.req.json<{ phoneNumber?: string }>().catch(() => ({} as any));
  const row = getSettingsRowSync(c.env);
  if (!row?.agentId) return c.json({ error: "Create the assistant first." }, 400);
  if (!row.twilioSid || !row.twilioToken) return c.json({ error: "Save your Twilio credentials first." }, 400);
  const e164 = normalizeE164(body.phoneNumber ?? "");
  if (!/^\+\d{8,}$/.test(e164)) return c.json({ error: "Invalid phone number." }, 400);

  // 1. Purchase the number on Twilio.
  const buy = await twilioFetch(row.twilioSid, "/IncomingPhoneNumbers.json", { method: "POST", form: { PhoneNumber: e164, FriendlyName: "Mother's Little Helper" } });
  if (!buy.ok) return c.json({ error: `Twilio purchase failed: ${await buy.text()}` }, 502);

  // 2. Point the number's voice at the agent by importing into ElevenLabs
  //    (drop any prior registration first so routing is clean).
  if (row.phoneNumberId) {
    await elFetch(c.env, `/convai/phone-numbers/${row.phoneNumberId}`, { method: "DELETE" }).catch(() => {});
  }
  const imp = await elFetch(c.env, "/convai/phone-numbers", {
    method: "POST",
    body: JSON.stringify({ provider: "twilio", phone_number: e164, label: "Family Tech Line", sid: row.twilioSid, token: row.twilioToken, agent_id: row.agentId }),
  });
  if (!imp.ok) return c.json({ error: `Bought ${e164}, but wiring to the assistant failed: ${await imp.text()}` }, 502);
  const data: any = await imp.json();
  await upsertSettings(c.env, { phoneNumberId: data.phone_number_id, twilioPhoneNumber: e164 });
  return c.json({ ok: true, phoneNumber: e164, phoneNumberId: data.phone_number_id });
});

app.get("/api/survey", async (c) => {
  const sql = c.env.sql as { query: <T>(s: string, p?: any[]) => T[] };
  const r = sql.query<{ survey_enabled: number }>("SELECT survey_enabled FROM settings WHERE id = 1")[0];
  return c.json({ enabled: !!r?.survey_enabled });
});

app.post("/api/survey", async (c) => {
  const body = await c.req.json<{ enabled?: boolean }>().catch(() => ({} as any));
  const enabled = !!body.enabled;
  const row = getSettingsRowSync(c.env);
  c.env.sql.exec("UPDATE settings SET survey_enabled = ?, survey_enabled_at = ? WHERE id = 1", [enabled ? 1 : 0, enabled ? Date.now() : null]);
  // When enabling, route inbound SMS replies to this app so we can capture
  // ratings. Best-effort — needs the number's PN sid from Twilio.
  if (enabled && row?.twilioSid && row.twilioPhoneNumber) {
    try {
      const origin = new URL(c.req.url).origin;
      const look = await twilioFetch(row.twilioSid, `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(normalizeE164(row.twilioPhoneNumber))}`);
      if (look.ok) {
        const d: any = await look.json();
        const pnSid = d.incoming_phone_numbers?.[0]?.sid;
        if (pnSid) await twilioFetch(row.twilioSid, `/IncomingPhoneNumbers/${pnSid}.json`, { method: "POST", form: { SmsUrl: `${origin}/webhooks/sms`, SmsMethod: "POST" } });
      }
    } catch {
      // non-fatal; survey send still works, only reply-capture needs this
    }
  }
  return c.json({ ok: true, enabled });
});

app.get("/api/devices", async (c) => {
  const db = makeDb(c.env);
  const rows = await db.query.devices.findMany({ orderBy: (t, { desc: d }) => d(t.id) });
  return c.json({ devices: rows });
});

app.post("/api/devices", async (c) => {
  const body = await c.req.json<{ name: string; model?: string; sourceUrl?: string }>();
  if (!body.name?.trim()) return c.json({ error: "Device name is required" }, 400);

  const db = makeDb(c.env);
  const now = Date.now();
  const inserted = await db
    .insert(devices)
    .values({ name: body.name.trim(), model: body.model?.trim() || null, status: "pending", createdAt: now })
    .returning();
  const device = inserted[0];

  try {
    const row = getSettingsRowSync(c.env);
    let sourceUrl = body.sourceUrl?.trim() || null;
    if (!sourceUrl) {
      const query = `${body.name} ${body.model ?? ""} user manual pdf`.trim();
      sourceUrl = await searchManualUrl(query);
    }
    if (!sourceUrl) {
      await db.update(devices).set({ status: "error", errorMsg: "No manual found via web search — try pasting a URL." }).where(eq(devices.id, device.id)).run();
      return c.json({ device: { ...device, status: "error" } });
    }

    const kbRes = await elFetch(c.env, "/convai/knowledge-base/url", {
      method: "POST",
      body: JSON.stringify({ url: sourceUrl, name: `${body.name} ${body.model ?? ""}`.trim() }),
    });
    if (!kbRes.ok) {
      const errText = await kbRes.text();
      await db.update(devices).set({ status: "error", errorMsg: `Manual fetch failed: ${errText}`, sourceUrl }).where(eq(devices.id, device.id)).run();
      return c.json({ device: { ...device, status: "error", sourceUrl } });
    }
    const kbDoc: any = await kbRes.json();

    if (row?.agentId) {
      const agent = await fetchAgent(c.env, row.agentId);
      const existingKb = agent.conversation_config?.agent?.prompt?.knowledge_base ?? [];
      const newKb = [...existingKb, { type: "url", name: kbDoc.name, id: kbDoc.id, usage_mode: "auto" }];
      await patchAgentKnowledgeBase(c.env, row.agentId, newKb);
    }

    await db.update(devices).set({ status: "ready", sourceUrl, kbDocumentId: kbDoc.id, errorMsg: null }).where(eq(devices.id, device.id)).run();
    return c.json({ device: { ...device, status: "ready", sourceUrl, kbDocumentId: kbDoc.id } });
  } catch (err: any) {
    await db.update(devices).set({ status: "error", errorMsg: String(err?.message ?? err) }).where(eq(devices.id, device.id)).run();
    return c.json({ device: { ...device, status: "error" } });
  }
});

app.delete("/api/devices/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = makeDb(c.env);
  const device = await db.query.devices.findFirst({ where: eq(devices.id, id) });
  if (!device) return c.json({ error: "not found" }, 404);

  try {
    const row = getSettingsRowSync(c.env);
    if (row?.agentId && device.kbDocumentId) {
      const agent = await fetchAgent(c.env, row.agentId);
      const existingKb = agent.conversation_config?.agent?.prompt?.knowledge_base ?? [];
      const newKb = existingKb.filter((d: any) => d.id !== device.kbDocumentId);
      await patchAgentKnowledgeBase(c.env, row.agentId, newKb);
    }
    if (device.kbDocumentId) {
      await elFetch(c.env, `/convai/knowledge-base/${device.kbDocumentId}?force=true`, { method: "DELETE" });
    }
  } catch {
    // best effort — still remove the local row so the dashboard stays clean
  }

  await db.delete(devices).where(eq(devices.id, id)).run();
  return c.json({ ok: true });
});

app.get("/api/calls", async (c) => {
  const row = getSettingsRowSync(c.env);
  const sql = c.env.sql as { query: <T>(s: string, p?: any[]) => T[]; exec: (s: string, p?: any[]) => any };
  if (row?.agentId) {
    try {
      const res = await elFetch(c.env, `/convai/conversations?agent_id=${row.agentId}&page_size=30`);
      if (res.ok) {
        const data: any = await res.json();
        const now = Date.now();
        // Which calls we've already fully enriched (have a transcript stored).
        const enriched = new Set(
          sql.query<{ id: string }>("SELECT id FROM calls WHERE success IS NOT NULL").map((r) => r.id),
        );
        let detailBudget = 8; // bound per-sync detail fetches to keep this fast
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
              const det = await elFetch(c.env, `/convai/conversations/${id}`);
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
                // Average agent response latency (time-to-first-audio after the
                // caller stops speaking) across agent turns, in ms.
                const lat: number[] = [];
                for (const t of d.transcript ?? []) {
                  const m = t.conversation_turn_metrics?.metrics;
                  const v = m?.convai_ttf_audio_since_silence?.elapsed_time ?? m?.convai_tts_service_ttfb?.elapsed_time;
                  if (typeof v === "number" && v > 0) lat.push(v);
                }
                if (lat.length) latencyMs = Math.round((lat.reduce((a, b) => a + b, 0) / lat.length) * 1000);
              }
            } catch {
              // leave unenriched; a later sync retries
            }
          }

          if (transcriptJson !== null) {
            sql.exec(
              "INSERT INTO calls (id, started_at, duration_secs, summary, caller, sentiment, latency_ms, success, transcript_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET started_at=excluded.started_at, duration_secs=excluded.duration_secs, summary=excluded.summary, caller=excluded.caller, sentiment=excluded.sentiment, latency_ms=excluded.latency_ms, success=excluded.success, transcript_json=excluded.transcript_json, fetched_at=excluded.fetched_at",
              [id, startedAt, durationSecs, summary, caller, sentiment, latencyMs, success, transcriptJson, now],
            );
          } else {
            // base upsert without clobbering an existing transcript/caller
            sql.exec(
              "INSERT INTO calls (id, started_at, duration_secs, summary, fetched_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET started_at=excluded.started_at, duration_secs=excluded.duration_secs, summary=COALESCE(calls.summary, excluded.summary), fetched_at=excluded.fetched_at",
              [id, startedAt, durationSecs, summary, now],
            );
          }
        }
      }
    } catch {
      // fall through to whatever's cached locally
    }
  }
  const rows = sql.query<any>("SELECT id, started_at, duration_secs, summary, caller, sentiment, latency_ms, success, transcript_json FROM calls ORDER BY started_at DESC");
  const calls = rows.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    durationSecs: r.duration_secs,
    summary: r.summary,
    caller: r.caller,
    sentiment: r.sentiment,
    latencyMs: r.latency_ms,
    success: r.success,
    transcript: r.transcript_json ? JSON.parse(r.transcript_json) : [],
  }));
  return c.json({ calls });
});

// Public webhook endpoint (declared in app.md public_paths) that the
// ElevenLabs agent calls mid-conversation to pull a device manual.
app.post("/tools/search-manual", async (c) => {
  let device = "";
  try {
    const body = await c.req.json<{ device?: string }>();
    device = (body.device ?? "").trim();
  } catch {
    // ignore — handled below
  }
  if (!device) {
    return c.json({ found: false, message: "No device was provided." });
  }
  const result = await fetchManualText(device);
  if (!result.found || !result.excerpt) {
    return c.json({
      found: false,
      message: `Couldn't find a manual for "${device}". Fall back to general troubleshooting and tell the caller you're going from general knowledge.`,
      source_url: result.sourceUrl ?? null,
    });
  }
  return c.json({ found: true, device, source_url: result.sourceUrl ?? null, manual_excerpt: result.excerpt });
});

// Generate a simulated demo call (caller agent <-> Coco) about a chosen device.
app.post("/api/sample-call", async (c) => {
  const body = await c.req.json<{ device?: string }>().catch(() => ({} as any));
  const device = (body.device ?? "").trim() || "TV remote";
  const row = getSettingsRowSync(c.env);

  // Coco = the configured agent voice (the clone); fall back to any clone.
  let cocoVoiceId = row?.voiceId ?? null;
  if (!cocoVoiceId) {
    try {
      const vr = await elFetch(c.env, "/voices");
      if (vr.ok) {
        const vd: any = await vr.json();
        const clone = (vd.voices ?? []).find((v: any) => v.category && v.category !== "premade");
        cocoVoiceId = clone?.voice_id ?? vd.voices?.[0]?.voice_id ?? null;
      }
    } catch {}
  }
  if (!cocoVoiceId) return c.json({ error: "No voice configured. Create the assistant first." }, 400);

  const turns = await generateDialogue(device);
  const sql = c.env.sql;
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
      audio = await ttsBytes(c.env, voiceId, t.text);
    } catch {
      audio = null;
    }
    sql.exec(
      "INSERT INTO sample_turn (idx, speaker, text, audio, created_at) VALUES (?, ?, ?, ?, ?)",
      [i, t.speaker, t.text, audio, now],
    );
  }

  return c.json({ ok: true, device, turns: turns.map((t, i) => ({ idx: i, speaker: t.speaker, text: t.text })) });
});

app.get("/api/sample-call", async (c) => {
  const sql = c.env.sql as { query: <T>(s: string, p?: any[]) => T[] };
  const call = sql.query<{ device: string; created_at: number }>("SELECT device, created_at FROM sample_call WHERE id = 1")[0];
  if (!call) return c.json({ exists: false });
  const turns = sql.query<{ idx: number; speaker: string; text: string }>(
    "SELECT idx, speaker, text FROM sample_turn ORDER BY idx",
  );
  return c.json({ exists: true, device: call.device, turns });
});

app.get("/api/sample-call/audio/:idx", async (c) => {
  const idx = Number(c.req.param("idx"));
  const sql = c.env.sql as { query: <T>(s: string, p?: any[]) => T[] };
  const rows = sql.query<{ audio: ArrayBuffer | null }>("SELECT audio FROM sample_turn WHERE idx = ?", [idx]);
  const audio = rows[0]?.audio;
  if (!audio) return c.json({ error: "no audio" }, 404);
  return new Response(new Uint8Array(audio as ArrayBuffer), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
});

// ---- Live call monitor ----
// A simulated call reveals scripted turns by elapsed wall-clock (no timers,
// hibernation-safe): each poll computes how many turns "should" have been
// spoken by now. A real call is tracked by ElevenLabs conversation id.
function turnDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(2200, Math.round(words * 360) + 800);
}

app.post("/api/monitor/simulate", async (c) => {
  const body = await c.req.json<{ device?: string }>().catch(() => ({} as any));
  const device = (body.device ?? "").trim() || "a smart TV";
  const turns = await generateDialogue(device);
  const caller = "+1 (610) 555-0142";
  c.env.sql.exec(
    "INSERT INTO monitor (id, mode, active, caller, started_at, turns_json, conversation_id) VALUES (1, 'sim', 1, ?, ?, ?, NULL) ON CONFLICT (id) DO UPDATE SET mode='sim', active=1, caller=excluded.caller, started_at=excluded.started_at, turns_json=excluded.turns_json, conversation_id=NULL",
    [caller, Date.now(), JSON.stringify(turns)],
  );
  return c.json({ ok: true, caller, device });
});

app.post("/api/monitor/stop", async (c) => {
  c.env.sql.exec("UPDATE monitor SET active = 0 WHERE id = 1");
  return c.json({ ok: true });
});

app.get("/api/monitor/live", async (c) => {
  const sql = c.env.sql as { query: <T>(s: string, p?: any[]) => T[] };
  const row = sql.query<{ mode: string | null; active: number; caller: string | null; started_at: number | null; turns_json: string | null; conversation_id: string | null }>(
    "SELECT mode, active, caller, started_at, turns_json, conversation_id FROM monitor WHERE id = 1",
  )[0];

  if (row?.active && row.mode === "sim" && row.turns_json && row.started_at) {
    const turns: { speaker: string; text: string }[] = JSON.parse(row.turns_json);
    const elapsed = Date.now() - row.started_at;
    const RING = 1600; // ring before pickup
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

  // Best-effort real path: surface an in-progress ElevenLabs conversation.
  const settings = getSettingsRowSync(c.env);
  if (settings?.agentId) {
    try {
      const res = await elFetch(c.env, `/convai/conversations?agent_id=${settings.agentId}&page_size=3`);
      if (res.ok) {
        const data: any = await res.json();
        const live = (data.conversations ?? []).find((cv: any) => cv.status === "in-progress" || cv.status === "processing");
        if (live) {
          const det = await elFetch(c.env, `/convai/conversations/${live.conversation_id}`);
          let turns: { speaker: string; text: string }[] = [];
          if (det.ok) {
            const dd: any = await det.json();
            turns = (dd.transcript ?? []).map((t: any) => ({ speaker: t.role === "agent" ? "coco" : "caller", text: t.message ?? "" })).filter((t: any) => t.text);
          }
          return c.json({ active: true, mode: "live", caller: live.metadata?.phone_number ?? "caller", status: "in-progress", currentSpeaker: null, turns });
        }
      }
    } catch {
      // ignore — fall through to idle
    }
  }
  return c.json({ active: false, status: "idle", turns: [] });
});

// Inbound SMS from Twilio (declared in public_paths). Captures a 1-5 survey
// rating and attaches it to the caller's most recent surveyed call.
app.post("/webhooks/sms", async (c) => {
  const sql = c.env.sql as { query: <T>(s: string, p?: any[]) => T[]; exec: (s: string, p?: any[]) => any };
  let from = "";
  let bodyText = "";
  try {
    const form = await c.req.parseBody();
    from = String(form.From ?? "");
    bodyText = String(form.Body ?? "");
  } catch {}
  const m = bodyText.match(/[1-5]/);
  if (from && m) {
    const rating = Number(m[0]);
    const target = sql.query<{ id: string }>(
      "SELECT id FROM calls WHERE caller = ? AND surveyed = 1 ORDER BY started_at DESC LIMIT 1",
      [from],
    )[0];
    if (target) sql.exec("UPDATE calls SET survey_rating = ? WHERE id = ?", [rating, target.id]);
  }
  return c.text("<Response></Response>", 200, { "Content-Type": "text/xml" });
});

export default {
  fetch: (req, env, ctx) => app.fetch(req, { ...env, ctx }),
  onSchedule: async (env) => {
    await sendPendingSurveys(env);
  },
} satisfies AppHandler;
