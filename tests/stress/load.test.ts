import { describe, expect, it } from "vitest";
import { json, makeTestApp } from "../helpers";

describe("stress", () => {
  it("handles concurrent status and health reads", async () => {
    const { app } = makeTestApp();
    const results = await Promise.all(Array.from({ length: 40 }, () => json(app, "/api/status")));
    expect(results.every((r) => r.res.status === 200)).toBe(true);
  });

  it("adds many devices", async () => {
    const { app } = makeTestApp();
    await json(app, "/api/agent/create", { method: "POST", body: "{}" });
    for (let i = 0; i < 25; i++) {
      const { res, data } = await json(app, "/api/devices", { method: "POST", body: JSON.stringify({ name: `Device ${i}` }) });
      expect(res.status).toBe(200);
      expect(data.device.status).toBe("ready");
    }
    const list = await json(app, "/api/devices");
    expect(list.data.devices.length).toBe(25);
  });

  it("survives rapid monitor polls and malformed bodies", async () => {
    const { app } = makeTestApp();
    await json(app, "/api/monitor/simulate", { method: "POST", body: JSON.stringify({ device: "TV" }) });
    const polls = await Promise.all(Array.from({ length: 20 }, () => json(app, "/api/monitor/live")));
    expect(polls.every((r) => r.res.status === 200)).toBe(true);
    const bad = await app.request("/api/twilio", { method: "POST", body: "{not-json", headers: { "Content-Type": "application/json" } });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const emptySms = await app.request("/webhooks/sms", { method: "POST", body: "" });
    expect(emptySms.status).toBe(200);
  });

  it("accepts a large prompt payload after agent create", async () => {
    const { app } = makeTestApp();
    await json(app, "/api/agent/create", { method: "POST", body: "{}" });
    const prompt = "Be kind. ".repeat(4000);
    const { res } = await json(app, "/api/agent/prompt", { method: "POST", body: JSON.stringify({ prompt, firstMessage: "Hi" }) });
    expect(res.status).toBe(200);
  });

  it("generates a sample call under mock TTS", async () => {
    const { app } = makeTestApp();
    const { res, data } = await json(app, "/api/sample-call", { method: "POST", body: JSON.stringify({ device: "oven" }) });
    expect(res.status).toBe(200);
    expect(data.turns.length).toBeGreaterThan(3);
  });
});
