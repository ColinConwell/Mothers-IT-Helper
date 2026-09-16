import { describe, expect, it } from "vitest";
import { json, makeTestApp } from "../helpers";
import { upsertSettings } from "../../src/server/settings";
import { makeSql } from "../../src/server/sql";

describe("health and status", () => {
  it("reports credentials without leaking keys", async () => {
    const { app } = makeTestApp();
    const { res, data } = await json(app, "/api/health");
    expect(res.status).toBe(200);
    expect(data.elevenlabs).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/test-el/);
    expect(data.twilioAccountSid).toBe(true);
    expect(data.twilioAuth).toBe(true);
  });

  it("searches Twilio numbers using an API key pair without an auth token", async () => {
    const { app } = makeTestApp({
      TWILIO_AUTH_TOKEN: "",
      TWILIO_API_KEY: "SKcccccccccccccccccccccccccccccccc",
      TWILIO_API_SECRET: "api-secret",
    });
    const { res, data } = await json(app, "/api/twilio/search", { method: "POST", body: JSON.stringify({ areaCode: "617" }) });
    expect(res.status).toBe(200);
    expect(data.numbers[0].phoneNumber).toMatch(/^\+1/);
  });

  it("status starts with env-prefilled twilio phone", async () => {
    const { app } = makeTestApp();
    const { data } = await json(app, "/api/status");
    expect(data.twilioPhonePrefill).toBe("+15551234567");
    expect(data.agentId).toBeNull();
  });
});

describe("twilio save validation", () => {
  it("rejects missing fields", async () => {
    const { app } = makeTestApp();
    const { res } = await json(app, "/api/twilio", { method: "POST", body: JSON.stringify({ sid: "AC1" }) });
    expect(res.status).toBe(400);
  });

  it("saves credentials", async () => {
    const { app } = makeTestApp();
    const { res, data } = await json(app, "/api/twilio", {
      method: "POST",
      body: JSON.stringify({ sid: "ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", token: "tok", phoneNumber: "6175550100" }),
    });
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    const status = await json(app, "/api/status");
    expect(status.data.twilioPhoneNumber).toBe("+16175550100");
  });
});

describe("agent lifecycle", () => {
  it("creates then updates an assistant", async () => {
    const { app, log } = makeTestApp();
    const created = await json(app, "/api/agent/create", { method: "POST", body: "{}" });
    expect(created.res.status).toBe(200);
    expect(created.data.agentId).toBe("agent_1");
    expect(created.data.updated).toBe(false);
    const updated = await json(app, "/api/agent/create", { method: "POST", body: JSON.stringify({ voiceId: "clone-coco" }) });
    expect(updated.data.updated).toBe(true);
    expect(log.some((c) => c.url.includes("/convai/agents/create"))).toBe(true);
  });

  it("returns default prompt before an agent exists", async () => {
    const { app } = makeTestApp();
    const { data } = await json(app, "/api/agent/prompt");
    expect(data.hasAgent).toBe(false);
    expect(data.prompt).toMatch(/Uncle Colin/);
  });

  it("rejects empty prompt saves", async () => {
    const { app } = makeTestApp();
    await json(app, "/api/agent/create", { method: "POST", body: "{}" });
    const { res } = await json(app, "/api/agent/prompt", { method: "POST", body: JSON.stringify({ prompt: "   " }) });
    expect(res.status).toBe(400);
  });

  it("saves a prompt", async () => {
    const { app } = makeTestApp();
    await json(app, "/api/agent/create", { method: "POST", body: "{}" });
    const { res } = await json(app, "/api/agent/prompt", { method: "POST", body: JSON.stringify({ prompt: "Be kind.", firstMessage: "Hi" }) });
    expect(res.status).toBe(200);
  });

  it("mints a conversation token", async () => {
    const { app } = makeTestApp();
    const missing = await json(app, "/api/agent/conversation-token");
    expect(missing.res.status).toBe(400);
    await json(app, "/api/agent/create", { method: "POST", body: "{}" });
    const { data } = await json(app, "/api/agent/conversation-token");
    expect(data.token).toBe("test-conversation-token");
  });
});

describe("phone import and buy", () => {
  it("imports a number after agent + twilio exist", async () => {
    const { app } = makeTestApp();
    await json(app, "/api/agent/create", { method: "POST", body: "{}" });
    const { data } = await json(app, "/api/phone/import", { method: "POST" });
    expect(data.phoneNumberId).toBe("pn_1");
  });

  it("searches and buys numbers", async () => {
    const { app } = makeTestApp();
    await json(app, "/api/agent/create", { method: "POST", body: "{}" });
    const search = await json(app, "/api/twilio/search", { method: "POST", body: JSON.stringify({ areaCode: "617" }) });
    expect(search.data.numbers.length).toBeGreaterThan(0);
    const buy = await json(app, "/api/twilio/buy", { method: "POST", body: JSON.stringify({ phoneNumber: search.data.numbers[0].phoneNumber }) });
    expect(buy.res.status).toBe(200);
    expect(buy.data.phoneNumber).toMatch(/^\+/);
  });
});

describe("devices", () => {
  it("requires a name", async () => {
    const { app } = makeTestApp();
    const { res } = await json(app, "/api/devices", { method: "POST", body: JSON.stringify({}) });
    expect(res.status).toBe(400);
  });

  it("adds and removes a device with knowledge-base attach", async () => {
    const { app } = makeTestApp();
    await json(app, "/api/agent/create", { method: "POST", body: "{}" });
    const add = await json(app, "/api/devices", { method: "POST", body: JSON.stringify({ name: "Samsung TV", model: "QN90A" }) });
    expect(add.data.device.status).toBe("ready");
    expect(add.data.device.kbDocumentId).toBe("kb_1");
    const list = await json(app, "/api/devices");
    expect(list.data.devices).toHaveLength(1);
    const id = list.data.devices[0].id;
    const del = await json(app, `/api/devices/${id}`, { method: "DELETE" });
    expect(del.data.ok).toBe(true);
    const empty = await json(app, "/api/devices");
    expect(empty.data.devices).toHaveLength(0);
  });
});

describe("calls sync", () => {
  it("upserts conversations and transcripts", async () => {
    const { app } = makeTestApp();
    await json(app, "/api/agent/create", { method: "POST", body: "{}" });
    const { data } = await json(app, "/api/calls");
    expect(data.calls[0].id).toBe("conv_done");
    expect(data.calls[0].success).toBe("success");
    expect(data.calls[0].transcript.length).toBeGreaterThan(0);
  });
});

describe("search-manual tool", () => {
  it("returns an excerpt", async () => {
    const { app } = makeTestApp();
    const empty = await json(app, "/tools/search-manual", { method: "POST", body: JSON.stringify({}) });
    expect(empty.data.found).toBe(false);
    const hit = await json(app, "/tools/search-manual", { method: "POST", body: JSON.stringify({ device: "Samsung QN90A" }) });
    expect(hit.data.found).toBe(true);
    expect(hit.data.manual_excerpt).toMatch(/power button/i);
  });
});

describe("sample call and monitor", () => {
  it("generates a sample call with audio", async () => {
    const { app } = makeTestApp();
    const { data } = await json(app, "/api/sample-call", { method: "POST", body: JSON.stringify({ device: "Roku" }) });
    expect(data.turns.length).toBeGreaterThan(2);
    const audio = await app.request("/api/sample-call/audio/0");
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toBe("audio/mpeg");
  });

  it("simulates a monitor call", async () => {
    const { app } = makeTestApp();
    await json(app, "/api/monitor/simulate", { method: "POST", body: JSON.stringify({ device: "TV" }) });
    const live = await json(app, "/api/monitor/live");
    expect(["ringing", "in-progress", "ended"]).toContain(live.data.status);
    await json(app, "/api/monitor/stop", { method: "POST" });
    const idle = await json(app, "/api/monitor/live");
    expect(idle.data.active).toBe(false);
  });
});

describe("voices", () => {
  it("lists, designs, saves, uses, and deletes", async () => {
    const { app } = makeTestApp();
    const list = await json(app, "/api/voices");
    expect(list.data.voices.length).toBeGreaterThan(0);
    const design = await json(app, "/api/voices/design", { method: "POST", body: JSON.stringify({ voiceDescription: "warm nephew" }) });
    expect(design.data.previews[0].generated_voice_id).toBeTruthy();
    const save = await json(app, "/api/voices/design/save", {
      method: "POST",
      body: JSON.stringify({ voiceName: "Coco", generatedVoiceId: "gen-1" }),
    });
    expect(save.data.voice_id).toBe("designed-voice");
    await json(app, "/api/agent/create", { method: "POST", body: "{}" });
    const use = await json(app, "/api/voices/clone-coco/use", { method: "POST" });
    expect(use.data.ok).toBe(true);
    const del = await json(app, "/api/voices/clone-coco", { method: "DELETE" });
    expect(del.data.ok).toBe(true);
  });

  it("clones from multipart files", async () => {
    const { app } = makeTestApp();
    const form = new FormData();
    form.set("name", "Coco");
    form.append("files", new File([new Uint8Array([1, 2, 3])], "sample.wav", { type: "audio/wav" }));
    const { res, data } = await json(app, "/api/voices/clone", { method: "POST", body: form });
    expect(res.status).toBe(200);
    expect(data.voice_id).toBe("clone-new");
  });
});

describe("sms survey webhook", () => {
  it("stores a 1-5 rating on the latest surveyed call", async () => {
    const { app, sqlite } = makeTestApp();
    const sql = makeSql(sqlite);
    sql.exec(
      "INSERT INTO calls (id, started_at, duration_secs, summary, caller, success, fetched_at, surveyed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ["c1", Date.now(), 10, "ok", "+16105550142", "success", Date.now(), 1],
    );
    const res = await app.request("/webhooks/sms", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "From=%2B16105550142&Body=I+would+give+it+a+5",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/xml/);
    const row = sql.query<{ survey_rating: number }>("SELECT survey_rating FROM calls WHERE id = 'c1'")[0];
    expect(row.survey_rating).toBe(5);
  });
});

describe("survey toggle", () => {
  it("enables survey and can run pending sends", async () => {
    const { app, sqlite } = makeTestApp();
    await json(app, "/api/agent/create", { method: "POST", body: "{}" });
    const sql = makeSql(sqlite);
    upsertSettings(sql, {
      twilioSid: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      twilioToken: "twilio-token",
      twilioPhoneNumber: "+15551234567",
    });
    await json(app, "/api/survey", { method: "POST", body: JSON.stringify({ enabled: true }) });
    const get = await json(app, "/api/survey");
    expect(get.data.enabled).toBe(true);
    sql.exec(
      "INSERT INTO calls (id, started_at, duration_secs, summary, caller, success, fetched_at, surveyed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ["c2", Date.now() + 10_000, 10, "ok", "+16105550199", "success", Date.now(), 0],
    );
    const run = await json(app, "/api/survey/run", { method: "POST" });
    expect(run.data.sent).toBeGreaterThanOrEqual(0);
  });
});
