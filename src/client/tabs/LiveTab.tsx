import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Button, Card } from "../ui";
import { drawWaveform, type Bars } from "../waveform";

export function LiveTab() {
  const [state, setState] = useState<"idle" | "connecting" | "live">("idle");
  const [mode, setMode] = useState<"speaking" | "listening">("listening");
  const [msgs, setMsgs] = useState<{ source: string; text: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const convoRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const barsRef = useRef<Bars>({ cur: [], vel: [] });
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => { stop(); }, []);
  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [msgs]);

  function draw() {
    const canvas = canvasRef.current;
    const convo = convoRef.current;
    if (canvas) {
      let out: Uint8Array | null = null;
      let inp: Uint8Array | null = null;
      try { out = convo?.getOutputByteFrequencyData?.() ?? null; } catch { /* ignore */ }
      try { inp = convo?.getInputByteFrequencyData?.() ?? null; } catch { /* ignore */ }
      const src = (out && out.length) ? out : inp;
      const speaking = !!(out && out.some((v) => v > 8));
      drawWaveform(canvas, barsRef.current, { speaking, src, idleRgb: [90, 122, 100] });
    }
    rafRef.current = requestAnimationFrame(draw);
  }

  async function start() {
    setErr(null);
    setMsgs([]);
    setState("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { token } = await api("/api/agent/conversation-token");
      const sdkUrl = "https://esm.sh/@elevenlabs/client@0.9.0";
      const mod: any = await import(/* @vite-ignore */ sdkUrl);
      const Conversation: any = mod.Conversation;
      const convo = await Conversation.startSession({
        conversationToken: token,
        onConnect: () => setState("live"),
        onDisconnect: () => { setState("idle"); },
        onError: (e: any) => setErr(typeof e === "string" ? e : (e?.message ?? "Connection error")),
        onModeChange: (m: any) => setMode(m?.mode === "speaking" ? "speaking" : "listening"),
        onMessage: (m: any) => {
          if (m?.message) setMsgs((prev) => [...prev, { source: m.source === "ai" ? "coco" : "caller", text: m.message }]);
        },
      });
      convoRef.current = convo;
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(draw);
    } catch (e: any) {
      setErr(e?.message ?? "Could not start the call (microphone permission?)");
      setState("idle");
    }
  }

  async function stop() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const convo = convoRef.current;
    convoRef.current = null;
    if (convo) {
      try { await convo.endSession(); } catch { /* ignore */ }
    }
    setState("idle");
  }

  return (
    <>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Talk to Coco (live test call)</h3>
          {state === "live" && (
            <span style={{ fontSize: 12, fontWeight: 700, color: mode === "speaking" ? "var(--accent)" : "var(--ok)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: mode === "speaking" ? "var(--accent)" : "var(--ok)", display: "inline-block" }} />
              {mode === "speaking" ? "Coco speaking" : "Listening"}
            </span>
          )}
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
          Speak to the assistant right from your browser — same agent, voice, and manuals as the phone line. This runs peer-to-peer via WebRTC, so it won't affect real call quality.
        </p>
        <canvas ref={canvasRef} className="wave" />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {state === "idle" && <Button onClick={start}>Start call</Button>}
          {state === "connecting" && <Button disabled>Connecting…</Button>}
          {state === "live" && <Button variant="ghost" onClick={stop}>End call</Button>}
        </div>
        {err && <p className="err" style={{ fontSize: 13, marginTop: 10 }}>{err}</p>}
      </Card>
      {msgs.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div ref={transcriptRef} style={{ display: "grid", gap: 8, maxHeight: 320, overflowY: "auto" }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.source === "coco" ? "flex-end" : "flex-start" }}>
                <div className={`bubble ${m.source === "coco" ? "coco" : "caller"}`}>
                  <div className="who">{m.source === "coco" ? "Coco" : "You"}</div>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
