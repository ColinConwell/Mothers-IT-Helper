import fs from "node:fs";
import path from "node:path";
import { loadEnvFile, readEnv } from "../src/server/env";
import { elFetch } from "../src/server/elevenlabs";

loadEnvFile();

function usage() {
  console.error(`Usage:
  voices list
  voices clone <name> <file> [file...]
  voices design <description>
  voices save <generated_voice_id> <name> [description]
  voices delete <voice_id>
`);
  process.exit(1);
}

async function main() {
  const env = readEnv();
  if (!env.elevenlabsKey) {
    console.error("ELEVENLABS_API_KEY (or ELEVEN_LABS_API_KEY) is required.");
    process.exit(1);
  }
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) usage();

  if (cmd === "list") {
    const res = await elFetch(env, fetch, "/voices");
    if (!res.ok) throw new Error(await res.text());
    const data: any = await res.json();
    for (const v of data.voices ?? []) {
      console.log(`${v.voice_id}\t${v.name}\t${v.category ?? ""}`);
    }
    return;
  }

  if (cmd === "clone") {
    const name = rest[0];
    const files = rest.slice(1);
    if (!name || !files.length) usage();
    const form = new FormData();
    form.set("name", name);
    for (const f of files) {
      const buf = fs.readFileSync(f);
      form.append("files", new Blob([buf]), path.basename(f));
    }
    const res = await elFetch(env, fetch, "/voices/add", { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    console.log(JSON.stringify(await res.json(), null, 2));
    return;
  }

  if (cmd === "design") {
    const description = rest.join(" ").trim();
    if (!description) usage();
    const res = await elFetch(env, fetch, "/text-to-voice/design", {
      method: "POST",
      body: JSON.stringify({ voice_description: description, model_id: "eleven_ttv_v3", auto_generate_text: true }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data: any = await res.json();
    for (const p of data.previews ?? []) {
      console.log(`${p.generated_voice_id}\t${p.duration_secs ?? ""}s`);
    }
    return;
  }

  if (cmd === "save") {
    const [generated, name, ...desc] = rest;
    if (!generated || !name) usage();
    const res = await elFetch(env, fetch, "/text-to-voice", {
      method: "POST",
      body: JSON.stringify({
        generated_voice_id: generated,
        voice_name: name,
        voice_description: desc.join(" "),
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    console.log(JSON.stringify(await res.json(), null, 2));
    return;
  }

  if (cmd === "delete") {
    const id = rest[0];
    if (!id) usage();
    const res = await elFetch(env, fetch, `/voices/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    console.log("deleted", id);
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
