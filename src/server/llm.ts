import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { fallbackDialogue, type DialogueTurn } from "../shared/persona";
import type { AppEnv } from "./env";

const INSTRUCTIONS =
  "You script a short, realistic phone call for a demo of a family tech-support hotline. " +
  "The CALLER is an older, non-technical family member who is a little flustered. " +
  "COCO is a warm, patient tech helper who gives ONE simple physical step at a time, " +
  "describes buttons by shape/location, and checks in after each step. " +
  'Return ONLY a JSON array of 6 objects, each {"speaker":"caller"|"coco","text":"..."}. ' +
  "Start with coco answering the phone. Keep each line one or two spoken sentences. End resolved and reassuring.";

export async function generateDialogue(env: AppEnv, device: string): Promise<DialogueTurn[]> {
  if (!env.llmApiKey || env.mockExternal) return fallbackDialogue(device);
  try {
    const openai = createOpenAI({ apiKey: env.llmApiKey, baseURL: env.llmBaseUrl });
    const { text } = await generateText({
      model: openai.chat(env.llmModel),
      system: INSTRUCTIONS,
      prompt: `The device is: ${device}. Write the call.`,
    });
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const turns = parsed
        .filter((t: any) => (t.speaker === "caller" || t.speaker === "coco") && typeof t.text === "string")
        .map((t: any) => ({ speaker: t.speaker as "caller" | "coco", text: String(t.text).slice(0, 400) }));
      if (turns.length >= 2) return turns.slice(0, 8);
    }
  } catch {
    // fall through
  }
  return fallbackDialogue(device);
}
