import { loadEnvFile, readEnv } from "../src/server/env";
import { elFetch } from "../src/server/elevenlabs";

loadEnvFile();

async function main() {
  const env = readEnv();
  if (!env.elevenlabsKey) {
    console.log("skip: no ElevenLabs key");
    return;
  }
  const res = await elFetch(env, fetch, "/voices");
  if (!res.ok) {
    console.error("ElevenLabs voices failed:", res.status, await res.text());
    process.exit(1);
  }
  const data: any = await res.json();
  console.log(`ok: ${(data.voices ?? []).length} voices`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
