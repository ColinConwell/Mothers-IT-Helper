import { useEffect, useState } from "react";
import { isPhone } from "../../shared/phone";
import { api, type Call } from "../api";
import { Button, Card, PhoneDisplay } from "../ui";

export function CallsTab() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    try {
      const d = await api("/api/calls");
      setCalls(d.calls ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const groups: { caller: string; calls: Call[] }[] = [];
  const byCaller: Record<string, Call[]> = {};
  for (const c of calls) {
    const key = c.caller || "Unknown";
    (byCaller[key] ??= []).push(c);
  }
  for (const caller of Object.keys(byCaller)) groups.push({ caller, calls: byCaller[caller] });
  groups.sort((a, b) => (b.calls[0]?.startedAt ?? 0) - (a.calls[0]?.startedAt ?? 0));

  function fmtDuration(s: number | null) {
    if (s == null) return "";
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }
  function chip(color: string, label: string) {
    return (
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 9px", textTransform: "capitalize" }}>
        {label}
      </span>
    );
  }
  function stat(label: string, val: string) {
    return (
      <div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{val}</div>
        <div className="muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
      </div>
    );
  }

  const withLat = calls.filter((c) => c.latencyMs != null);
  const avgLat = withLat.length ? Math.round(withLat.reduce((a, c) => a + (c.latencyMs || 0), 0) / withLat.length) : null;
  const withSucc = calls.filter((c) => c.success);
  const resolved = withSucc.filter((c) => c.success === "success").length;
  const withDur = calls.filter((c) => c.durationSecs != null);
  const avgDur = withDur.length ? Math.round(withDur.reduce((a, c) => a + (c.durationSecs || 0), 0) / withDur.length) : null;
  const uniqueCallers = new Set(calls.map((c) => c.caller || "Unknown")).size;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Every call, grouped by who rang in. Tap a call to read the full transcript.</p>
        <Button variant="secondary" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>
      </div>
      {calls.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12 }}>
            {stat("Calls", String(calls.length))}
            {stat("Callers", String(uniqueCallers))}
            {stat("Avg latency", avgLat == null ? "—" : avgLat < 1000 ? avgLat + "ms" : (avgLat / 1000).toFixed(1) + "s")}
            {stat("Resolved", withSucc.length ? Math.round((resolved / withSucc.length) * 100) + "%" : "—")}
            {stat("Avg length", avgDur == null ? "—" : fmtDuration(avgDur))}
          </div>
        </Card>
      )}
      {calls.length === 0 && <Card><p className="muted" style={{ margin: 0 }}>No calls yet — they'll appear here after your family starts calling.</p></Card>}
      <div style={{ display: "grid", gap: 16 }}>
        {groups.map((g) => (
          <Card key={g.caller}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              {isPhone(g.caller) ? <PhoneDisplay number={g.caller} /> : <span style={{ fontWeight: 700, fontSize: 14 }}>{g.caller}</span>}
              <span className="muted" style={{ fontSize: 12 }}>{`${g.calls.length} call${g.calls.length === 1 ? "" : "s"}`}</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {g.calls.map((c) => {
                const isOpen = !!open[c.id];
                return (
                  <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                    <button
                      type="button"
                      onClick={() => setOpen((p) => ({ ...p, [c.id]: !p[c.id] }))}
                      style={{ width: "100%", textAlign: "left", background: isOpen ? "var(--accent-soft)" : "transparent", border: "none", padding: "11px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", color: "inherit" }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.summary || "Call"}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {(c.startedAt ? new Date(c.startedAt).toLocaleString() : "") + (c.durationSecs != null ? ` · ${fmtDuration(c.durationSecs)}` : "") + (c.transcript?.length ? ` · ${c.transcript.length} turns` : "")}
                        </div>
                        {(c.latencyMs != null || c.success || c.sentiment) && (
                          <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
                            {c.latencyMs != null && chip("var(--ink)", `${c.latencyMs < 1000 ? c.latencyMs + "ms" : (c.latencyMs / 1000).toFixed(1) + "s"} avg`)}
                            {c.success && chip("var(--ink)", c.success === "success" ? "Resolved" : c.success)}
                            {c.sentiment && chip("var(--ink)", c.sentiment)}
                            {c.surveyRating != null && chip("var(--ink)", `${c.surveyRating}/5`)}
                          </div>
                        )}
                      </div>
                      <span style={{ color: "var(--accent)", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{isOpen ? "Hide" : "Read"}</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: "12px 14px", display: "grid", gap: 8, background: "var(--transcript-bg)" }}>
                        {c.transcript && c.transcript.length
                          ? c.transcript.map((t, i) => (
                              <div key={i} style={{ display: "flex", justifyContent: t.speaker === "coco" ? "flex-end" : "flex-start" }}>
                                <div className={`bubble ${t.speaker === "coco" ? "coco" : "caller"}`}>
                                  <div className="who">{t.speaker === "coco" ? "Coco" : "Caller"}</div>
                                  {t.text}
                                </div>
                              </div>
                            ))
                          : <p className="muted" style={{ fontSize: 13, margin: 0 }}>Transcript still processing — hit Refresh in a moment.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
