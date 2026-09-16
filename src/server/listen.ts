import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export const LOCAL_HOST = "127.0.0.1";

export function parseListenPort(raw: string | undefined): number {
  if (!raw || !raw.trim()) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export async function listenOnLocalhost(server: Server, port = 0, host = LOCAL_HOST): Promise<number> {
  const requested = Number.isFinite(port) && port >= 0 ? Math.floor(port) : 0;
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("listening", onListen);
      reject(err);
    };
    const onListen = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListen);
    server.listen(requested, host);
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error(`Failed to bind ${host}:${requested}`);
  return (addr as AddressInfo).port;
}

export async function allocateLocalPort(host = LOCAL_HOST): Promise<number> {
  const server = createServer();
  const port = await listenOnLocalhost(server, 0, host);
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  return port;
}

export function localUrl(port: number, host = LOCAL_HOST): string {
  return `http://${host}:${port}`;
}
