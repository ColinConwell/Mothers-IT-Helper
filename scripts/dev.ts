import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile, originIsPublic } from "../src/server/env";
import { allocateLocalPort, localUrl, parseListenPort } from "../src/server/listen";
import { parseCloudflaredQuickUrl } from "../src/server/tunnel";
import { pidAlive, readRuntime } from "../src/server/runtime";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const live = args.includes("--live");
const yes = args.includes("--yes");

function usage() {
  console.log(`Usage:
  just dev              # dashboard on 127.0.0.1, OS-assigned port unless PORT is set
  just live             # same, plus a Cloudflare quick tunnel; PUBLIC_BASE_URL is injected for this process
  just live -- --yes    # skip install prompts

PUBLIC_BASE_URL can also be set in the shell or .env.local. If it is already a public HTTPS origin, \`just live\` will use it and skip cloudflared.
`);
}

async function confirm(question: string, defaultYes = true): Promise<boolean> {
  if (yes || !input.isTTY) return defaultYes;
  const rl = createInterface({ input, output });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`${question} [${defaultYes ? "Y/n" : "y/N"}] `, resolve);
  });
  rl.close();
  const t = answer.trim().toLowerCase();
  if (!t) return defaultYes;
  return t === "y" || t === "yes";
}

function hasBin(name: string): boolean {
  return spawnSync("command", ["-v", name], { encoding: "utf8" }).status === 0;
}

async function ensureCloudflared() {
  if (hasBin("cloudflared")) return;
  console.log("cloudflared is not installed (needed for a public HTTPS URL).");
  if (process.platform === "darwin" && hasBin("brew")) {
    if (!(await confirm("Install cloudflared with Homebrew?"))) {
      console.error("Install cloudflared, then re-run `just live`.");
      process.exit(1);
    }
    const r = spawnSync("brew", ["install", "cloudflared"], { cwd: root, stdio: "inherit" });
    if (r.status !== 0 || !hasBin("cloudflared")) throw new Error("cloudflared install failed.");
    return;
  }
  console.error("Install cloudflared from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ then re-run `just live`.");
  process.exit(1);
}

function startCloudflared(port: number): Promise<{ url: string; child: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const child = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", localUrl(port)], {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      const url = parseCloudflaredQuickUrl(buf);
      if (url) {
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        resolve({ url, child });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (!parseCloudflaredQuickUrl(buf)) {
        const hint = /failed to request quick tunnel|1015|429/i.test(buf)
          ? "Cloudflare rate-limited the quick tunnel. Wait a minute and try again."
          : `cloudflared exited before printing a URL (${code ?? "?"}).`;
        reject(new Error(hint));
      }
    });
    setTimeout(() => {
      if (!parseCloudflaredQuickUrl(buf)) {
        reject(new Error("Timed out waiting for a trycloudflare.com URL from cloudflared."));
      }
    }, 45_000).unref();
  });
}

async function waitForRuntime(timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = readRuntime();
    if (info && pidAlive(info.pid) && info.localUrl) return info;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for the dashboard to write data/runtime.json.");
}

function refuseIfAlreadyRunning() {
  const existing = readRuntime();
  if (existing && pidAlive(existing.pid)) {
    console.error(`Dashboard already running at ${existing.localUrl} (pid ${existing.pid}). Stop it first.`);
    process.exit(1);
  }
}

async function main() {
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  loadEnvFile();
  refuseIfAlreadyRunning();

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  const extras: ChildProcess[] = [];
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of extras) {
      try {
        child.kill("SIGTERM");
      } catch {
        // gone
      }
    }
  };
  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });

  let publicBaseUrl = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (publicBaseUrl && !originIsPublic(publicBaseUrl)) {
    console.warn(`Ignoring PUBLIC_BASE_URL=${publicBaseUrl} (not a public origin).`);
    publicBaseUrl = "";
    delete childEnv.PUBLIC_BASE_URL;
  }

  if (live && !publicBaseUrl) {
    await ensureCloudflared();
    const port = parseListenPort(process.env.PORT) || (await allocateLocalPort());
    childEnv.PORT = String(port);
    console.log(`Starting a Cloudflare quick tunnel to ${localUrl(port)}…`);
    const tunnel = await startCloudflared(port);
    extras.push(tunnel.child);
    publicBaseUrl = tunnel.url;
    childEnv.PUBLIC_BASE_URL = publicBaseUrl;
  } else if (live && publicBaseUrl) {
    console.log(`Using PUBLIC_BASE_URL=${publicBaseUrl}`);
    childEnv.PUBLIC_BASE_URL = publicBaseUrl;
  }

  const tsx = path.join(root, "node_modules", ".bin", "tsx");
  const app = spawn(tsx, ["src/server/index.ts"], {
    cwd: root,
    env: childEnv,
    stdio: ["inherit", "pipe", "pipe"],
  });
  extras.push(app);
  app.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  app.stderr?.on("data", (chunk) => process.stderr.write(chunk));

  const info = await waitForRuntime();
  console.log("");
  console.log(`Local dashboard:  ${info.localUrl}`);
  if (info.publicBaseUrl) {
    console.log(`Public origin:    ${info.publicBaseUrl}`);
    console.log("On Setup, create or update the assistant so ElevenLabs registers this webhook URL.");
  } else if (live) {
    console.log("Public origin was not set. Check cloudflared output above.");
  } else {
    console.log("Live phone tools: just live");
  }
  console.log("");

  const code: number = await new Promise((resolve) => {
    app.on("exit", (exitCode, signal) => {
      shutdown();
      if (signal) resolve(1);
      else resolve(exitCode ?? 0);
    });
  });
  process.exit(code);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
