import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearRuntime, readRuntime, writeRuntime } from "../../src/server/runtime";

const tmp = path.join(os.tmpdir(), `mith-runtime-${process.pid}.json`);

afterEach(() => {
  delete process.env.RUNTIME_PATH;
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
});

describe("runtime file", () => {
  it("round-trips local and public URLs", () => {
    process.env.RUNTIME_PATH = tmp;
    writeRuntime({ localUrl: "http://127.0.0.1:5555", publicBaseUrl: "https://example.trycloudflare.com", pid: 42 });
    expect(readRuntime()).toEqual({
      localUrl: "http://127.0.0.1:5555",
      publicBaseUrl: "https://example.trycloudflare.com",
      pid: 42,
    });
    clearRuntime();
    expect(readRuntime()).toBeNull();
  });
});
