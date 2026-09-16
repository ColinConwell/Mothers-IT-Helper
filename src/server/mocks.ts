const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const text = (body: string, status = 200, contentType = "text/plain") =>
  new Response(body, { status, headers: { "Content-Type": contentType } });

export type MockCall = { url: string; method: string; body?: string };

const TINY_MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]);

export function createMockFetch(log: MockCall[] = []): typeof fetch {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : undefined;
    log.push({ url, method, body });

    if (url.includes("api.search.brave.com")) {
      return json({
        web: {
          results: [
            { url: "https://support.example.com/samsung-qn90a" },
            { url: "https://cdn.example.com/manual.pdf" },
          ],
        },
      });
    }
    if (url.startsWith("https://support.example.com/")) {
      return text("<html><body><h1>User Manual</h1><p>Press the power button on the bottom edge.</p></body></html>", 200, "text/html");
    }

    if (url.startsWith("https://api.twilio.com")) {
      if (url.includes("AvailablePhoneNumbers")) {
        return json({
          available_phone_numbers: [
            { phone_number: "+16175550100", locality: "Boston", region: "MA" },
            { phone_number: "+16175550101", locality: "Cambridge", region: "MA" },
          ],
        });
      }
      if (url.includes("IncomingPhoneNumbers") && method === "GET") {
        return json({ incoming_phone_numbers: [{ sid: "PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }] });
      }
      if (url.includes("IncomingPhoneNumbers") && method === "POST") {
        return json({ sid: "PNyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy", phone_number: "+16175550100" });
      }
      if (url.includes("Messages.json") && method === "POST") {
        return json({ sid: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", status: "queued" });
      }
      return json({ ok: true });
    }

    const el = url.replace("https://api.elevenlabs.io/v1", "");

    if (method === "GET" && el === "/voices") {
      return json({
        voices: [
          { voice_id: "premade-bill", name: "Bill", category: "premade", labels: { age: "old" }, preview_url: "https://example.com/bill.mp3" },
          { voice_id: "clone-coco", name: "Coco", category: "cloned", labels: {}, preview_url: null },
        ],
      });
    }
    if (method === "POST" && el === "/voices/add") {
      return json({ voice_id: "clone-new", requires_verification: false });
    }
    if (method === "POST" && el === "/text-to-voice/design") {
      return json({
        previews: [
          { generated_voice_id: "gen-1", audio_base_64: Buffer.from("preview1").toString("base64"), media_type: "audio/mpeg", duration_secs: 1.2, language: "en" },
          { generated_voice_id: "gen-2", audio_base_64: Buffer.from("preview2").toString("base64"), media_type: "audio/mpeg", duration_secs: 1.1, language: "en" },
        ],
        text: "Hello from the designed voice.",
      });
    }
    if (method === "POST" && el === "/text-to-voice") {
      return json({ voice_id: "designed-voice" });
    }
    if (method === "DELETE" && el.startsWith("/voices/")) {
      return json({ status: "ok" });
    }
    if (method === "GET" && el === "/convai/tools") {
      return json({ tools: [] });
    }
    if (method === "POST" && el === "/convai/tools") {
      return json({ id: "tool_manual" });
    }
    if (method === "POST" && el === "/convai/agents/create") {
      return json({ agent_id: "agent_1" });
    }
    if (el.startsWith("/convai/agents/") && method === "GET") {
      return json({
        conversation_config: {
          agent: {
            first_message: "Hi, it's your tech line.",
            prompt: { prompt: "Be helpful.", knowledge_base: [], tool_ids: ["tool_manual"] },
          },
        },
      });
    }
    if (el.startsWith("/convai/agents/") && method === "PATCH") {
      return json({ agent_id: "agent_1" });
    }
    if (el.startsWith("/convai/conversation/token")) {
      return json({ token: "test-conversation-token" });
    }
    if (el === "/convai/phone-numbers" && method === "POST") {
      return json({ phone_number_id: "pn_1" });
    }
    if (el.startsWith("/convai/phone-numbers/") && method === "DELETE") {
      return json({ status: "ok" });
    }
    if (el === "/convai/knowledge-base/url" && method === "POST") {
      const parsed = body ? JSON.parse(body) : {};
      return json({ id: "kb_1", name: parsed.name ?? "manual" });
    }
    if (el.startsWith("/convai/knowledge-base/") && method === "DELETE") {
      return json({ status: "ok" });
    }
    if (el.startsWith("/convai/conversations?") || el === "/convai/conversations") {
      return json({
        conversations: [
          {
            conversation_id: "conv_done",
            start_time_unix_secs: 1_700_000_000,
            call_duration_secs: 42,
            call_summary_title: "TV power issue",
            status: "done",
          },
        ],
      });
    }
    if (el.startsWith("/convai/conversations/") && method === "GET") {
      return json({
        metadata: { phone_call: { external_number: "+16105550142" } },
        transcript: [
          { role: "agent", message: "Hi, it's your tech line.", conversation_turn_metrics: { metrics: { convai_ttf_audio_since_silence: { elapsed_time: 0.42 } } } },
          { role: "user", message: "The TV will not turn on." },
        ],
        analysis: { transcript_summary: "Helped with TV power.", call_successful: "success", sentiment_analysis: { overall_sentiment: "positive" } },
      });
    }
    if (el.startsWith("/text-to-speech/") && method === "POST") {
      return new Response(TINY_MP3, { status: 200, headers: { "Content-Type": "audio/mpeg" } });
    }

    return json({ error: `unmocked ${method} ${url}` }, 501);
  }) as typeof fetch;

  return fetchImpl;
}
