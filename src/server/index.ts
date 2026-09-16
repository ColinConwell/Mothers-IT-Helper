import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { openDatabase } from "../db/index";
import { createApp } from "./app";
import { loadEnvFile, readEnv } from "./env";
import { createMockFetch } from "./mocks";
import { makeSql } from "./sql";
import { sendPendingSurveys } from "./surveys";
import { listenOnLocalhost, localUrl } from "./listen";
import { clearRuntime, writeRuntime } from "./runtime";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function main() {
  const env = readEnv();
  const dbPath = process.env.SQLITE_PATH || (env.mockExternal ? ":memory:" : path.join(root, "data", "app.sqlite"));
  const sqlite = openDatabase(dbPath);
  const fetchImpl = env.mockExternal ? createMockFetch() : fetch;
  const app = createApp({ sqlite, env, fetchImpl });

  if (env.isProd) {
    app.use("/*", serveStatic({ root: path.relative(process.cwd(), path.join(root, "dist")) }));
    app.get("*", serveStatic({ path: path.relative(process.cwd(), path.join(root, "dist", "index.html")) }));
  }

  const listener = getRequestListener(app.fetch);
  const server = createServer();

  let vite: Awaited<ReturnType<typeof import("vite")["createServer"]>> | null = null;
  if (!env.isProd) {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      root,
      configFile: path.join(root, "vite.config.ts"),
      server: { middlewareMode: true, hmr: { server } },
      appType: "custom",
    });
  }

  server.on("request", (req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/api") || url.startsWith("/tools") || url.startsWith("/webhooks")) {
      listener(req, res);
      return;
    }
    if (vite) {
      vite.middlewares(req, res, async () => {
        try {
          const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
          const html = await vite!.transformIndexHtml(url, index);
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        } catch (err: any) {
          if (vite) vite.ssrFixStacktrace(err);
          res.statusCode = 500;
          res.end(err?.stack ?? String(err));
        }
      });
      return;
    }
    listener(req, res);
  });

  const sql = makeSql(sqlite);
  const surveyTimer = setInterval(() => {
    sendPendingSurveys(sql, fetchImpl, env).catch(() => {});
  }, 60 * 60 * 1000);
  surveyTimer.unref?.();

  const port = await listenOnLocalhost(server, env.port);
  const url = localUrl(port);
  writeRuntime({ localUrl: url, publicBaseUrl: env.publicBaseUrl, pid: process.pid });
  const cleanup = () => {
    try {
      clearRuntime();
    } catch {
      // ignore
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  console.log(`Mother's Little Helper listening on ${url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
