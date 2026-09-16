import { describe, expect, it } from "vitest";
import { parseCloudflaredQuickUrl, parseListeningUrl } from "../../src/server/tunnel";

describe("parseCloudflaredQuickUrl", () => {
  it("extracts a trycloudflare origin from log noise", () => {
    const log = `
INF |  Your quick Tunnel has been created! Visit it at:
INF |  https://random-words-here.trycloudflare.com
INF |`;
    expect(parseCloudflaredQuickUrl(log)).toBe("https://random-words-here.trycloudflare.com");
  });

  it("returns null when no tunnel URL is present", () => {
    expect(parseCloudflaredQuickUrl("starting tunnel")).toBeNull();
  });
});

describe("parseListeningUrl", () => {
  it("reads the bound URL from the server log line", () => {
    expect(parseListeningUrl("Mother's Little Helper listening on http://127.0.0.1:52341")).toBe(
      "http://127.0.0.1:52341",
    );
  });
});
