import { describe, expect, it } from "vitest";
import { looksLikeTwilioAccountSid, looksLikeTwilioApiKeySid, normalizeE164 } from "../../src/shared/phone";
import { fallbackDialogue, turnDurationMs } from "../../src/shared/persona";
import { PALETTES, THEME_TOKEN_KEYS } from "../../src/shared/themes";
import { credentialHealth, originIsPublic, publicOrigin, readEnv } from "../../src/server/env";
import { fetchManualText } from "../../src/server/brave";
import { createMockFetch } from "../../src/server/mocks";

describe("normalizeE164", () => {
  it("adds +1 to 10-digit US numbers", () => {
    expect(normalizeE164("4782760110")).toBe("+14782760110");
  });
  it("keeps explicit plus", () => {
    expect(normalizeE164("+44 7700 900123")).toBe("+447700900123");
  });
  it("handles 11-digit leading 1", () => {
    expect(normalizeE164("14782760110")).toBe("+14782760110");
  });
});

describe("twilio sid shapes", () => {
  it("detects AC account sids", () => {
    expect(looksLikeTwilioAccountSid("ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(true);
    expect(looksLikeTwilioApiKeySid("SKaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(true);
    expect(looksLikeTwilioAccountSid("SKaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
  });
});

describe("monitor timing", () => {
  it("enforces a minimum turn duration", () => {
    expect(turnDurationMs("Hi")).toBeGreaterThanOrEqual(2200);
    expect(turnDurationMs("one two three four five six seven eight nine ten")).toBeGreaterThan(turnDurationMs("Hi"));
  });
});

describe("dialogue fallback", () => {
  it("mentions the device", () => {
    const turns = fallbackDialogue("Samsung TV");
    expect(turns.some((t: { text: string }) => t.text.includes("Samsung TV"))).toBe(true);
    expect(turns[0].speaker).toBe("coco");
  });
});

describe("theme tokens", () => {
  it("defines four palettes and required token names", () => {
    expect(PALETTES).toEqual(["clay", "forest", "linen", "dusk"]);
    expect(THEME_TOKEN_KEYS).toContain("--accent");
    expect(THEME_TOKEN_KEYS).toContain("--accent-rgb");
  });
});

describe("public origin", () => {
  it("prefers PUBLIC_BASE_URL and ignores PORTLESS_URL", () => {
    const env = readEnv({ PUBLIC_BASE_URL: "https://tunnel.example", PORTLESS_URL: "https://app.localhost" });
    expect(publicOrigin("http://127.0.0.1:8787/api/x", env)).toBe("https://tunnel.example");
    expect(originIsPublic("https://app.localhost")).toBe(false);
    expect(originIsPublic("https://tunnel.example")).toBe(true);
    expect(originIsPublic("http://127.0.0.1:8787")).toBe(false);
    const noPublic = readEnv({ PORTLESS_URL: "https://app.localhost" });
    expect(publicOrigin("http://127.0.0.1:8788/api/x", noPublic)).toBe("http://127.0.0.1:8788");
  });
});

describe("credential health", () => {
  it("flags SK twilio sids", () => {
    const env = readEnv({
      TWILIO_ACCOUNT_SID: "SKaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      TWILIO_AUTH_TOKEN: "x",
      ELEVENLABS_API_KEY: "k",
      BRAVE_SEARCH_API_KEY: "b",
    });
    const h = credentialHealth(env);
    expect(h.twilioSidLooksLikeApiKey).toBe(true);
    expect(h.twilioAccountSid).toBe(false);
    expect(h.notes.join(" ")).toMatch(/SK/);
  });

  it("treats AC sid plus API key pair as complete REST auth", () => {
    const env = readEnv({
      TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      TWILIO_AUTH_TOKEN: "tok",
      TWILIO_API_KEY: "SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      TWILIO_API_SECRET: "sec",
      ELEVENLABS_API_KEY: "k",
      BRAVE_SEARCH_API_KEY: "b",
    });
    const h = credentialHealth(env);
    expect(h.twilioAccountSid).toBe(true);
    expect(h.twilioSidLooksLikeApiKey).toBe(false);
    expect(h.twilioApiKey).toBe(true);
    expect(h.twilioApiSecret).toBe(true);
    expect(h.twilioAuth).toBe(true);
    expect(h.notes.join(" ")).not.toMatch(/REST auth is missing/);
    expect(h.notes.join(" ")).not.toMatch(/TWILIO_AUTH_TOKEN is unset/);
  });
});

describe("manual fetch", () => {
  it("strips HTML and skips PDFs", async () => {
    const env = readEnv({ BRAVE_SEARCH_API_KEY: "b", MOCK_EXTERNAL: "1" });
    const html = await fetchManualText(env, createMockFetch(), "Samsung QN90A");
    expect(html.found).toBe(true);
    expect(html.excerpt).toMatch(/power button/i);
    expect(html.sourceUrl).not.toMatch(/\.pdf$/);
  });
});
