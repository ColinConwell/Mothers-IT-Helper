import { useEffect, useRef, useState } from "react";
import { formatPhone } from "../../shared/phone";
import { api } from "../api";
import { Button, Card, Input } from "../ui";
import { drawWaveform, type Bars } from "../waveform";

export function MonitorTab() {
  const [device, setDevice] = useState("a smart TV");
  const [status, setStatus] = useState<string>("idle");
  const [caller, setCaller] = useState<string | null>(null);
  const [turns, setTurns] = useState<{ speaker: string; text: string }[]>([]);
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<{ speaking: boolean }>({ speaking: false });
  const barsRef = useRef<Bars>({ cur: [], vel: [] });
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  async function poll() {
    try {
      const d = await api("/api/monitor/live");
      setStatus(d.status ?? "idle");
      setCaller(d.caller ?? null);
      setTurns(d.turns ?? []);
      setSpeaker(d.currentSpeaker ?? null);
      stateRef.current.speaking = !!d.currentSpeaker;
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    poll();
    const iv = setInterval(poll, 1200);
    const loop = () => {
      if (canvasRef.current) drawWaveform(canvasRef.current, barsRef.current, { speaking: stateRef.current.speaking });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      clearInterval(iv);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);
  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [turns]);

  async function simulate() {
    setBusy(true);
    setTurns([]);
    try {
      await api("/api/monitor/simulate", { method: "POST", body: JSON.stringify({ device }) });
      await poll();
    } finally {
      setBusy(false);
    }
  }
  async function end() {
    await api("/api/monitor/stop", { method: "POST" });
    await poll();
  }

  const live = status === "ringing" || status === "in-progress";
  const statusLabel = status === "ringing" ? "Ringing…" : status === "in-progress" ? "On the line" : status === "ended" ? "Call ended" : "No active call";
  const statusColor = status === "in-progress" ? "var(--ok)" : status === "ringing" ? "var(--warn)" : "var(--muted)";

  return (
    <>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Live call monitor</h3>
          <span style={{ fontSize: 12, fontWeight: 700, color: statusColor, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 8, background: statusColor, display: "inline-block", opacity: live ? 1 : 0.5 }} />
            {statusLabel + (caller && live ? ` · ${formatPhone(caller)}` : "")}
          </span>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
          Watch a call unfold in real time — transcript streams in as it's spoken. Real phone calls appear here automatically; use the simulator below to see it in action right now.
        </p>
        <canvas ref={canvasRef} className="wave" style={{ height: 110 }} />
        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
          <Input value={device} onChange={setDevice} placeholder="Device the caller is stuck on" />
          {!live
            ? <Button onClick={simulate} disabled={busy}>{busy ? "Starting…" : "Simulate incoming call"}</Button>
            : <Button variant="ghost" onClick={end}>End call</Button>}
        </div>
      </Card>
      {turns.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div ref={transcriptRef} style={{ display: "grid", gap: 8, maxHeight: 340, overflowY: "auto" }}>
            {turns.map((t, i) => (
              <div key={i} style={{ display: "flex", justifyContent: t.speaker === "coco" ? "flex-end" : "flex-start" }}>
                <div
                  className={`bubble ${t.speaker === "coco" ? "coco" : "caller"}`}
                  style={{ outline: speaker && i === turns.length - 1 && ((speaker === "coco") === (t.speaker === "coco")) ? "2px solid var(--warn)" : "none" }}
                >
                  <div className="who">{t.speaker === "coco" ? "Coco" : "Caller"}</div>
                  {t.text}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
