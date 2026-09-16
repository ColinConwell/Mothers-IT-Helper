import { useEffect, useState } from "react";
import { api, type SampleTurn } from "../api";
import { Button, Card, Input } from "../ui";

export function DemoTab() {
  const [device, setDevice] = useState("Samsung QN90A TV");
  const [turns, setTurns] = useState<SampleTurn[]>([]);
  const [sampleDevice, setSampleDevice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const d = await api("/api/sample-call");
    if (d.exists) {
      setTurns(d.turns ?? []);
      setSampleDevice(d.device ?? null);
    }
  }
  useEffect(() => { load(); }, []);

  async function generate() {
    setBusy(true);
    setMsg(null);
    setPlayingIdx(null);
    try {
      const d = await api("/api/sample-call", { method: "POST", body: JSON.stringify({ device }) });
      setTurns(d.turns ?? []);
      setSampleDevice(d.device ?? device);
      setMsg("Sample call ready — press Play the call.");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function playAll() {
    for (const t of turns) {
      setPlayingIdx(t.idx);
      await new Promise<void>((resolve) => {
        const audio = new Audio(`/api/sample-call/audio/${t.idx}`);
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    }
    setPlayingIdx(null);
  }

  return (
    <>
      <Card>
        <h3 style={{ margin: "0 0 4px" }}>Simulated demo call</h3>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
          Hear a mock call between a flustered family member and Coco. Pick a device and generate — two ElevenLabs voices, one of them your clone.
        </p>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr auto auto" }}>
          <Input value={device} onChange={setDevice} placeholder="Device for the demo (e.g. Roku Ultra)" />
          <Button onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate call"}</Button>
          {turns.length > 0 && (
            <Button variant="secondary" onClick={playAll} disabled={busy || playingIdx !== null}>
              {playingIdx !== null ? "Playing…" : "Play the call"}
            </Button>
          )}
        </div>
        {msg && <p style={{ fontSize: 13, marginTop: 10 }}>{msg}</p>}
        {sampleDevice && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Demo about: {sampleDevice}</p>}
      </Card>
      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {turns.map((t) => (
          <div key={t.idx} style={{ display: "flex", justifyContent: t.speaker === "coco" ? "flex-end" : "flex-start" }}>
            <div className={`bubble ${t.speaker === "coco" ? "coco" : "caller"}`} style={{ outline: playingIdx === t.idx ? "2px solid var(--warn)" : "none" }}>
              <div className="who">{t.speaker === "coco" ? "Coco" : "Caller"}</div>
              {t.text}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
