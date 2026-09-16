import { describe, expect, it } from "vitest";
import { readEnv } from "../../src/server/env";
import { resolveTwilioAuth, twilioFetch } from "../../src/server/twilio";

describe("resolveTwilioAuth", () => {
  it("prefers API key and secret for REST Basic auth", () => {
    const env = readEnv({
      TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      TWILIO_AUTH_TOKEN: "auth-token",
      TWILIO_API_KEY: "SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      TWILIO_API_SECRET: "api-secret",
    });
    const auth = resolveTwilioAuth(env);
    expect(auth).toMatchObject({
      accountSid: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      restUser: "SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      restPass: "api-secret",
      importToken: "auth-token",
    });
  });

  it("falls back to account SID and auth token", () => {
    const env = readEnv({
      TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      TWILIO_AUTH_TOKEN: "auth-token",
    });
    const auth = resolveTwilioAuth(env);
    expect(auth?.restUser).toBe("ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(auth?.restPass).toBe("auth-token");
  });
});

describe("twilioFetch", () => {
  it("puts the Account SID in the URL and the API key in Basic auth", async () => {
    const env = readEnv({
      TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      TWILIO_AUTH_TOKEN: "auth-token",
      TWILIO_API_KEY: "SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      TWILIO_API_SECRET: "api-secret",
    });
    const auth = resolveTwilioAuth(env)!;
    const calls: { url: string; authorization: string }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), authorization: headers.get("Authorization") ?? "" });
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    await twilioFetch(fetchImpl, auth, "/Messages.json");
    expect(calls[0].url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Messages.json");
    const decoded = Buffer.from(calls[0].authorization.replace(/^Basic\s+/i, ""), "base64").toString();
    expect(decoded).toBe("SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:api-secret");
  });
});
