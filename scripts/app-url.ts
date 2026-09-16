import { readRuntime, pidAlive } from "../src/server/runtime";

const info = readRuntime();
if (!info || !pidAlive(info.pid)) {
  console.error("No running dashboard. Start `just dev` or `just live` first.");
  process.exit(1);
}
const field = process.argv[2] === "public" ? "publicBaseUrl" : "localUrl";
const value = info[field];
if (!value) {
  console.error(field === "publicBaseUrl" ? "No PUBLIC_BASE_URL for this process. Use `just live`." : "Missing local URL.");
  process.exit(1);
}
process.stdout.write(`${value}\n`);
