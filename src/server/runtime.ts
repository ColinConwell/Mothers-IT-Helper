import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export type RuntimeInfo = {
  localUrl: string;
  publicBaseUrl: string;
  pid: number;
};

export function runtimePath(): string {
  return process.env.RUNTIME_PATH || path.join(root, "data", "runtime.json");
}

export function writeRuntime(info: RuntimeInfo): void {
  const file = runtimePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`);
}

export function readRuntime(): RuntimeInfo | null {
  const file = runtimePath();
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as RuntimeInfo;
    if (!data?.localUrl || !data.pid) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearRuntime(): void {
  const file = runtimePath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function pidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
