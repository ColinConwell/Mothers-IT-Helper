import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const root = path.dirname(fileURLToPath(import.meta.url));

function allocatePortSync(): number {
  const r = spawnSync(
    process.execPath,
    [
      "-e",
      "require('node:net').createServer().listen(0,'127.0.0.1',function(){process.stdout.write(String(this.address().port));this.close()})",
    ],
    { encoding: "utf8" },
  );
  const port = Number((r.stdout || "").trim());
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Failed to allocate e2e port: ${r.stderr || r.status}`);
  }
  return port;
}

function e2ePort(): number {
  const fromEnv = Number(process.env.E2E_PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  const file = path.join(os.tmpdir(), "mothers-it-helper-e2e-port");
  try {
    const port = allocatePortSync();
    fs.writeFileSync(file, `${port}\n`, { flag: "wx" });
    process.env.E2E_PORT = String(port);
    return port;
  } catch (err: any) {
    if (err?.code !== "EEXIST") throw err;
    const n = Number(fs.readFileSync(file, "utf8").trim());
    if (n > 0) {
      process.env.E2E_PORT = String(n);
      return n;
    }
    throw err;
  }
}

const port = e2ePort();
const baseURL = `http://127.0.0.1:${port}`;
const runtimePath = path.join(root, "test-results", "e2e-runtime.json");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled" },
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: `PORT=${port} RUNTIME_PATH=${runtimePath} MOCK_EXTERNAL=1 NODE_ENV=test npx tsx src/server/index.ts`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
