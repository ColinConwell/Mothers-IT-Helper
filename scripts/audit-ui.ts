import fs from "node:fs";
import path from "node:path";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { loadEnvFile, readEnv } from "../src/server/env";

loadEnvFile();

const RUBRIC = `You are auditing screenshots of a family tech-support dashboard.
For each image, list only concrete UI issues using this rubric:
- overflow or clipped labels
- poor contrast between text and background
- inconsistent spacing or misaligned controls
- unreadable type
Reply with a short markdown bullet list. If nothing is wrong, say "No material issues."`;

async function main() {
  const env = readEnv();
  const outDir = path.resolve("tests/visual");
  fs.mkdirSync(outDir, { recursive: true });
  const shotsDir = path.resolve("test-results");
  const report: string[] = ["# UI visual audit", ""];

  const screenshotFiles: string[] = [];
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(png|jpg|jpeg)$/i.test(ent.name)) screenshotFiles.push(p);
    }
  }
  walk(path.resolve("tests/e2e"));
  walk(shotsDir);

  report.push(`Found ${screenshotFiles.length} screenshot files.`);
  report.push("");
  report.push("Accessibility: see Playwright axe results in the HTML report (`playwright-report/`).");
  report.push("Screenshot diffs fail CI when pixels change beyond maxDiffPixelRatio.");
  report.push("");

  if (!env.llmApiKey) {
    report.push("LLM visual notes skipped — no OPENROUTER_API_KEY or OPENAI_API_KEY.");
    fs.writeFileSync(path.join(outDir, "audit-report.md"), report.join("\n"));
    console.log(path.join(outDir, "audit-report.md"));
    return;
  }

  const openai = createOpenAI({ apiKey: env.llmApiKey, baseURL: env.llmBaseUrl });
  const sample = screenshotFiles.slice(0, 8);
  for (const file of sample) {
    try {
      const buf = fs.readFileSync(file);
      const { text } = await generateText({
        model: openai.chat(env.llmModel),
        system: RUBRIC,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Screenshot: ${path.basename(file)}` },
              { type: "image", image: buf },
            ],
          },
        ],
      });
      report.push(`## ${path.basename(file)}`, "", text, "");
    } catch (err: any) {
      report.push(`## ${path.basename(file)}`, "", `Could not audit: ${err?.message ?? err}`, "");
    }
  }

  fs.writeFileSync(path.join(outDir, "audit-report.md"), report.join("\n"));
  console.log(path.join(outDir, "audit-report.md"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
