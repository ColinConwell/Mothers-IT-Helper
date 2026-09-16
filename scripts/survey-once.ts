import { pidAlive, readRuntime } from "../src/server/runtime";

const info = readRuntime();
if (!info || !pidAlive(info.pid)) {
  console.error("No running dashboard. Start `just dev` or `just live` first.");
  process.exit(1);
}
const res = await fetch(`${info.localUrl}/api/survey/run`, { method: "POST" });
const body = await res.text();
if (!res.ok) {
  console.error(body || `survey/run failed (${res.status})`);
  process.exit(1);
}
process.stdout.write(body.endsWith("\n") ? body : `${body}\n`);
