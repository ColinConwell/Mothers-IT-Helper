import { createElement as h, Fragment, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";


type Status = {
  agentId: string | null;
  voiceId: string | null;
  phoneNumberId: string | null;
  twilioPhoneNumber: string | null;
  twilioConfigured: boolean;
};

type Voice = { voice_id: string; name: string; category?: string; labels: Record<string, string>; preview_url: string | null };
type Device = { id: number; name: string; model: string | null; sourceUrl: string | null; status: string; errorMsg: string | null; createdAt: number };
type Call = { id: string; startedAt: number | null; durationSecs: number | null; summary: string | null; caller: string | null; sentiment: string | null; latencyMs: number | null; success: string | null; surveyRating: number | null; transcript: { speaker: string; text: string }[] };
type SampleTurn = { idx: number; speaker: string; text: string };

// +14782760110 -> "+1 (478) 276-0110"; non-US or odd inputs pass through.
function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/[^\d]/g, "");
  if (raw.startsWith("+1") && d.length === 11) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}
function isPhone(raw: string | null | undefined): boolean {
  return !!raw && /^\+?\d[\d\s()-]{6,}$/.test(raw);
}

const colors = {
  bg: "#f7f5f2",
  card: "#ffffff",
  border: "#e7e2da",
  accent: "#c1694f",
  accentSoft: "#f3e3dc",
  ink: "#2b2b2b",
  muted: "#7a736a",
  ok: "#4c7a5a",
  warn: "#b4823d",
  err: "#b3462f",
};

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "phone":
      return h("svg", p, h("path", { d: "M5 4h4l2 5-2.5 2.5a11 11 0 0 0 6 6L17 15l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" }));
    case "device":
      return h("svg", p, h("rect", { x: 3, y: 4, width: 18, height: 12, rx: 2 }), h("path", { d: "M8 20h8M12 16v4" }));
    case "call":
      return h("svg", p, h("circle", { cx: 12, cy: 12, r: 9 }), h("path", { d: "M12 7v5l3 3" }));
    case "check":
      return h("svg", p, h("path", { d: "M5 12l4 4 10-10" }));
    case "alert":
      return h("svg", p, h("path", { d: "M12 3l9 16H3z" }), h("path", { d: "M12 10v4M12 17h.01" }));
    case "demo":
      return h("svg", p, h("circle", { cx: 12, cy: 12, r: 9 }), h("path", { d: "M10 9l5 3-5 3z" }));
    case "edit":
      return h("svg", p, h("path", { d: "M12 20h9" }), h("path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" }));
    case "waveform":
      return h("svg", p, h("path", { d: "M4 12v0M8 8v8M12 4v16M16 8v8M20 12v0" }));
    default:
      return null;
  }
}

function Card({ children, style = {} }: any) {
  return h("div", { style: { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 22, boxShadow: "0 1px 2px rgba(43,43,43,0.04), 0 6px 20px rgba(43,43,43,0.05)", ...style } }, children);
}

function Button({ children, onClick, disabled, variant = "primary" }: any) {
  const base: any = {
    padding: "10px 16px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid transparent",
    opacity: disabled ? 0.55 : 1,
    transition: "opacity 0.15s",
  };
  const variants: any = {
    primary: { background: colors.accent, color: "#fff", boxShadow: "0 1px 2px rgba(193,105,79,0.25), 0 4px 12px rgba(193,105,79,0.18)" },
    secondary: { background: colors.accentSoft, color: colors.accent },
    ghost: { background: "transparent", color: colors.muted, border: `1px solid ${colors.border}` },
  };
  return h("button", { onClick, disabled, style: { ...base, ...variants[variant] } }, children);
}

function Input({ value, onChange, placeholder, type = "text" }: any) {
  return h("input", {
    value,
    type,
    placeholder,
    onInput: (e: any) => onChange(e.target.value),
    style: { padding: "10px 12px", borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 14, width: "100%" },
  });
}

function StatusPill({ status }: { status: string }) {
  const map: any = {
    ready: { c: colors.ok, icon: "check", label: "ready" },
    pending: { c: colors.warn, icon: "alert", label: "working…" },
    error: { c: colors.err, icon: "alert", label: "error" },
  };
  const s = map[status] ?? map.pending;
  return h(
    "span",
    { style: { display: "inline-flex", alignItems: "center", gap: 6, color: s.c, fontSize: 13, fontWeight: 600 } },
    h(Icon, { name: s.icon, size: 14 }),
    s.label,
  );
}

function PhoneDisplay({ number, big }: { number: string; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  const e164 = "+" + number.replace(/[^\d]/g, "").replace(/^\+?/, "");
  async function copy() {
    try { await navigator.clipboard.writeText(e164); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  }
  return h("span", { style: { display: "inline-flex", alignItems: "center", gap: 8 } },
    h("a", { href: `tel:${e164}`, style: { fontWeight: 700, fontSize: big ? 18 : 14, color: colors.accent, textDecoration: "none", letterSpacing: "0.01em", fontVariantNumeric: "tabular-nums" } }, formatPhone(number)),
    h("button", { onClick: copy, title: "Copy number", style: { border: `1px solid ${colors.border}`, background: colors.card, borderRadius: 8, padding: "3px 8px", fontSize: 12, fontWeight: 600, color: copied ? colors.ok : colors.muted, cursor: "pointer" } }, copied ? "Copied" : "Copy"),
  );
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function SetupTab({ status, refresh }: { status: Status | null; refresh: () => void }) {
  const [sid, setSid] = useState("");
  const [token, setToken] = useState("");
  const [phone, setPhone] = useState(status?.twilioPhoneNumber ?? "");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState(status?.voiceId ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [areaCode, setAreaCode] = useState("");
  const [results, setResults] = useState<{ phoneNumber: string; locality: string; region: string }[]>([]);
  const [surveyOn, setSurveyOn] = useState(false);

  useEffect(() => { api("/api/survey").then((d) => setSurveyOn(!!d.enabled)).catch(() => {}); }, []);

  async function searchNumbers() {
    setBusy("search");
    setMsg(null);
    try {
      const d = await api("/api/twilio/search", { method: "POST", body: JSON.stringify({ areaCode }) });
      setResults(d.numbers ?? []);
      if (!(d.numbers ?? []).length) setMsg("No numbers found for that area code — try another.");
    } catch (e: any) { setMsg(e.message); } finally { setBusy(null); }
  }
  async function buyNumber(phoneNumber: string) {
    setBusy("buy");
    setMsg(null);
    try {
      const d = await api("/api/twilio/buy", { method: "POST", body: JSON.stringify({ phoneNumber }) });
      setMsg(`Bought ${formatPhone(d.phoneNumber)} and wired it to Coco.`);
      setResults([]);
      refresh();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(null); }
  }
  async function toggleSurvey(next: boolean) {
    setSurveyOn(next);
    try { await api("/api/survey", { method: "POST", body: JSON.stringify({ enabled: next }) }); }
    catch (e: any) { setMsg(e.message); setSurveyOn(!next); }
  }

  useEffect(() => {
    api("/api/voices")
      .then((d) => {
        const list: Voice[] = d.voices ?? [];
        setVoices(list);
        setVoiceId((current) => {
          if (current) return current;
          const clone = list.find((v) => v.category && v.category !== "premade");
          return clone?.voice_id ?? list[0]?.voice_id ?? "";
        });
      })
      .catch(() => {});
  }, []);
  async function saveTwilio() {
    setBusy("twilio");
    setMsg(null);
    try {
      await api("/api/twilio", { method: "POST", body: JSON.stringify({ sid, token, phoneNumber: phone }) });
      setMsg("Twilio credentials saved.");
      refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function createAgent() {
    setBusy("agent");
    setMsg(null);
    try {
      const d = await api("/api/agent/create", { method: "POST", body: JSON.stringify({ voiceId: voiceId || undefined }) });
      setMsg(d.updated ? "Assistant updated." : "Assistant created.");
      refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function importPhone() {
    setBusy("phone");
    setMsg(null);
    try {
      await api("/api/phone/import", { method: "POST" });
      setMsg("Phone number connected to the assistant.");
      refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  return h(
    Fragment,
    null,
    h(
      "div",
      { style: { display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" } },
      h(
        Card,
        null,
        h("h3", { style: { margin: "0 0 4px" } }, "1. Twilio number"),
        status?.phoneNumberId
          ? h(
              Fragment,
              null,
              h("p", { style: { color: colors.ok, fontSize: 14, fontWeight: 600, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 6 } }, h(Icon, { name: "check", size: 15 }), `Connected: ${formatPhone(status.twilioPhoneNumber)}`),
              h("p", { style: { color: colors.muted, fontSize: 13, margin: "0 0 10px" } }, "Family can call this number now. You usually won't need to touch this again."),
              h(
                "details",
                null,
                h("summary", { style: { cursor: "pointer", fontSize: 13, color: colors.accent, fontWeight: 600 } }, "Change or reconnect number"),
                h("div", { style: { display: "grid", gap: 10, marginTop: 12 } },
                  h(Input, { value: sid, onChange: setSid, placeholder: "Account SID (AC…)" }),
                  h(Input, { value: token, onChange: setToken, placeholder: "Auth Token", type: "password" }),
                  h(Input, { value: phone, onChange: setPhone, placeholder: "+15551234567" }),
                  h(Button, { onClick: saveTwilio, disabled: busy === "twilio" }, busy === "twilio" ? "Saving…" : "Save Twilio credentials"),
                ),
              ),
            )
          : h(
              Fragment,
              null,
              h("p", { style: { color: colors.muted, fontSize: 13, margin: "0 0 14px" } }, "Paste the Account SID, Auth Token, and phone number from your Twilio console."),
              h("div", { style: { display: "grid", gap: 10 } },
                h(Input, { value: sid, onChange: setSid, placeholder: "Account SID (AC…)" }),
                h(Input, { value: token, onChange: setToken, placeholder: "Auth Token", type: "password" }),
                h(Input, { value: phone, onChange: setPhone, placeholder: "+15551234567" }),
                h(Button, { onClick: saveTwilio, disabled: busy === "twilio" }, busy === "twilio" ? "Saving…" : "Save Twilio credentials"),
              ),
            ),
      ),
      h(
        Card,
        null,
        h("h3", { style: { margin: "0 0 4px" } }, "2. Assistant voice & persona"),
        h("p", { style: { color: colors.muted, fontSize: 13, margin: "0 0 14px" } }, "Pick a voice — any clone you've made in ElevenLabs is auto-selected."),
        h("div", { style: { display: "grid", gap: 10 } },
          h(
            "select",
            { value: voiceId, onChange: (e: any) => setVoiceId(e.target.value), style: { padding: "10px 12px", borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 14 } },
            h("option", { value: "" }, "Use ElevenLabs default"),
            voices.map((v: Voice) =>
              h("option", { value: v.voice_id, key: v.voice_id }, `${v.name}${v.category && v.category !== "premade" ? " (your clone)" : ""}`),
            ),
          ),

          h(Button, { onClick: createAgent, disabled: busy === "agent" }, busy === "agent" ? "Working…" : status?.agentId ? "Update assistant" : "Create assistant"),
        ),
      ),
    ),
    h(
      Card,
      { style: { marginTop: 16 } },
      h("h3", { style: { margin: "0 0 4px" } }, "3. Go live"),
      h("p", { style: { color: colors.muted, fontSize: 13, margin: "0 0 14px" } },
        status?.phoneNumberId
          ? "Your Twilio number is connected — family can call it now."
          : "Once the assistant exists and Twilio is saved, connect the number.",
      ),
      h(Button, { onClick: importPhone, disabled: busy === "phone" || !status?.agentId }, busy === "phone" ? "Connecting…" : "Connect phone number"),
    ),
    h(
      Card,
      { style: { marginTop: 16 } },
      h("h3", { style: { margin: "0 0 4px" } }, "Buy a new number"),
      h("p", { style: { color: colors.muted, fontSize: 13, margin: "0 0 12px" } }, "Provision a fresh Twilio number right here and wire it straight to Coco — no console trip. Purchasing costs about $1–2/month on your Twilio account."),
      h("div", { style: { display: "flex", gap: 10, alignItems: "center" } },
        h(Input, { value: areaCode, onChange: setAreaCode, placeholder: "Area code (e.g. 617) — optional" }),
        h(Button, { variant: "secondary", onClick: searchNumbers, disabled: busy === "search" }, busy === "search" ? "Searching…" : "Search"),
      ),
      results.length > 0 && h("div", { style: { display: "grid", gap: 8, marginTop: 12 } },
        results.map((n) =>
          h("div", { key: n.phoneNumber, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", border: `1px solid ${colors.border}`, borderRadius: 10 } },
            h("div", null,
              h("div", { style: { fontWeight: 700, fontSize: 14, color: colors.ink, fontVariantNumeric: "tabular-nums" } }, formatPhone(n.phoneNumber)),
              h("div", { style: { fontSize: 12, color: colors.muted } }, [n.locality, n.region].filter(Boolean).join(", ")),
            ),
            h(Button, { onClick: () => buyNumber(n.phoneNumber), disabled: busy === "buy" }, busy === "buy" ? "Buying…" : "Buy & connect"),
          ),
        ),
      ),
    ),
    h(
      Card,
      { style: { marginTop: 16 } },
      h("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 } },
        h("div", null,
          h("h3", { style: { margin: "0 0 4px" } }, "SMS quality survey"),
          h("p", { style: { color: colors.muted, fontSize: 13, margin: 0, maxWidth: 460 } }, "After each call, text the caller a quick 1–5 rating request; replies show up in History. Off by default. Each text costs a few cents on your Twilio account."),
        ),
        h("button", {
          onClick: () => toggleSurvey(!surveyOn),
          role: "switch",
          "aria-checked": surveyOn,
          style: { flexShrink: 0, width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", background: surveyOn ? colors.ok : colors.border, position: "relative", transition: "background 0.15s" },
        },
          h("span", { style: { position: "absolute", top: 3, left: surveyOn ? 23 : 3, width: 20, height: 20, borderRadius: 999, background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" } }),
        ),
      ),
    ),
    msg && h("p", { style: { color: colors.ink, fontSize: 13, marginTop: 12 } }, msg),
  );
}

function DevicesTab() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const d = await api("/api/devices");
    setDevices(d.devices ?? []);
  }
  useEffect(() => { load(); }, []);

  async function addDevice() {
    if (!name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/devices", { method: "POST", body: JSON.stringify({ name, model, sourceUrl: url || undefined }) });
      setName(""); setModel(""); setUrl("");
      await load();
      setMsg("Device added — check its status below.");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeDevice(id: number) {
    await api(`/api/devices/${id}`, { method: "DELETE" });
    await load();
  }

  return h(
    Fragment,
    null,
    h(
      Card,
      null,
      h("h3", { style: { margin: "0 0 4px" } }, "Add a device"),
      h("p", { style: { color: colors.muted, fontSize: 13, margin: "0 0 14px" } }, "We'll search for the manual automatically — paste a URL yourself if the search picks the wrong page."),
      h("div", { style: { display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr auto" } },
        h(Input, { value: name, onChange: setName, placeholder: "Device (e.g. Samsung TV)" }),
        h(Input, { value: model, onChange: setModel, placeholder: "Model (optional)" }),
        h(Input, { value: url, onChange: setUrl, placeholder: "Manual URL (optional)" }),
        h(Button, { onClick: addDevice, disabled: busy }, busy ? "Adding…" : "Add"),
      ),
      msg && h("p", { style: { color: colors.ink, fontSize: 13, marginTop: 10 } }, msg),
    ),
    h(
      "div",
      { style: { display: "grid", gap: 10, marginTop: 16 } },
      devices.length === 0 && h("p", { style: { color: colors.muted } }, "No devices yet."),
      devices.map((d: Device) =>
        h(
          Card,
          { key: d.id, style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          h(
            "div",
            null,
            h("div", { style: { fontWeight: 600 } }, [d.name, d.model].filter(Boolean).join(" — ")),
            h("div", { style: { marginTop: 4 } }, h(StatusPill, { status: d.status })),
            d.errorMsg && h("div", { style: { color: colors.err, fontSize: 12, marginTop: 4, maxWidth: 480 } }, d.errorMsg),
            d.sourceUrl && h("a", { href: d.sourceUrl, target: "_blank", style: { fontSize: 12, color: colors.muted } }, d.sourceUrl),
          ),
          h(Button, { variant: "ghost", onClick: () => removeDevice(d.id) }, "Remove"),
        ),
      ),
    ),
  );
}

function CallsTab() {
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

  // Group calls by caller phone number, most-recent caller first.
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
  function chipStyle(color: string) {
    return { fontSize: 11, fontWeight: 700, color, background: "rgba(0,0,0,0.03)", border: `1px solid ${colors.border}`, borderRadius: 999, padding: "2px 9px", textTransform: "capitalize" as const };
  }
  function stat(label: string, val: string) {
    return h("div", null,
      h("div", { style: { fontSize: 22, fontWeight: 700, color: colors.ink } }, val),
      h("div", { style: { fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: colors.muted, marginTop: 2 } }, label),
    );
  }
  const withLat = calls.filter((c) => c.latencyMs != null);
  const avgLat = withLat.length ? Math.round(withLat.reduce((a, c) => a + (c.latencyMs || 0), 0) / withLat.length) : null;
  const withSucc = calls.filter((c) => c.success);
  const resolved = withSucc.filter((c) => c.success === "success").length;
  const withDur = calls.filter((c) => c.durationSecs != null);
  const avgDur = withDur.length ? Math.round(withDur.reduce((a, c) => a + (c.durationSecs || 0), 0) / withDur.length) : null;
  const uniqueCallers = new Set(calls.map((c) => c.caller || "Unknown")).size;

  return h(
    Fragment,
    null,
    h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
      h("p", { style: { color: colors.muted, fontSize: 13, margin: 0 } }, "Every call, grouped by who rang in. Tap a call to read the full transcript."),
      h(Button, { variant: "secondary", onClick: load, disabled: loading }, loading ? "Refreshing…" : "Refresh"),
    ),
    calls.length > 0 && h(Card, { style: { marginBottom: 16 } },
      h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12 } },
        stat("Calls", String(calls.length)),
        stat("Callers", String(uniqueCallers)),
        stat("Avg latency", avgLat == null ? "—" : (avgLat < 1000 ? avgLat + "ms" : (avgLat / 1000).toFixed(1) + "s")),
        stat("Resolved", withSucc.length ? Math.round((resolved / withSucc.length) * 100) + "%" : "—"),
        stat("Avg length", avgDur == null ? "—" : fmtDuration(avgDur)),
      ),
    ),
    calls.length === 0 && h(Card, null, h("p", { style: { color: colors.muted, margin: 0 } }, "No calls yet — they'll appear here after your family starts calling.")),
    h(
      "div",
      { style: { display: "grid", gap: 16 } },
      groups.map((g) =>
        h(Card, { key: g.caller },
          h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 } },
            isPhone(g.caller)
              ? h(PhoneDisplay, { number: g.caller })
              : h("span", { style: { fontWeight: 700, fontSize: 14, color: colors.ink } }, g.caller),
            h("span", { style: { fontSize: 12, color: colors.muted } }, `${g.calls.length} call${g.calls.length === 1 ? "" : "s"}`),
          ),
          h("div", { style: { display: "grid", gap: 8 } },
            g.calls.map((c) => {
              const isOpen = !!open[c.id];
              return h("div", { key: c.id, style: { border: `1px solid ${colors.border}`, borderRadius: 12, overflow: "hidden" } },
                h("button", {
                  onClick: () => setOpen((p) => ({ ...p, [c.id]: !p[c.id] })),
                  style: { width: "100%", textAlign: "left", background: isOpen ? colors.accentSoft : "transparent", border: "none", padding: "11px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" },
                },
                  h("div", { style: { minWidth: 0, flex: 1 } },
                    h("div", { style: { fontWeight: 600, fontSize: 14, color: colors.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, c.summary || "Call"),
                    h("div", { style: { fontSize: 12, color: colors.muted, marginTop: 2 } },
                      (c.startedAt ? new Date(c.startedAt).toLocaleString() : "") + (c.durationSecs != null ? ` · ${fmtDuration(c.durationSecs)}` : "") + (c.transcript?.length ? ` · ${c.transcript.length} turns` : "")),
                    (c.latencyMs != null || c.success || c.sentiment) && h("div", { style: { display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" } },
                      c.latencyMs != null && h("span", { style: chipStyle(colors.muted) }, `⚡ ${c.latencyMs < 1000 ? c.latencyMs + "ms" : (c.latencyMs / 1000).toFixed(1) + "s"} avg`),
                      c.success && h("span", { style: chipStyle(c.success === "success" ? colors.ok : colors.warn) }, c.success === "success" ? "Resolved" : c.success),
                      c.sentiment && h("span", { style: chipStyle(colors.muted) }, c.sentiment),
                      c.surveyRating != null && h("span", { style: chipStyle(colors.accent) }, `★ ${c.surveyRating}/5`),
                    ),
                  ),
                  h("span", { style: { color: colors.accent, fontSize: 13, fontWeight: 700, flexShrink: 0 } }, isOpen ? "Hide" : "Read"),
                ),
                isOpen && h("div", { style: { padding: "12px 14px", display: "grid", gap: 8, background: "#fbf8f5" } },
                  (c.transcript && c.transcript.length)
                    ? c.transcript.map((t, i) =>
                        h("div", { key: i, style: { display: "flex", justifyContent: t.speaker === "coco" ? "flex-end" : "flex-start" } },
                          h("div", { style: { maxWidth: "78%", padding: "8px 12px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.4, background: t.speaker === "coco" ? colors.accent : colors.card, color: t.speaker === "coco" ? "#fff" : colors.ink, border: t.speaker === "coco" ? "none" : `1px solid ${colors.border}` } },
                            h("div", { style: { fontSize: 10, fontWeight: 700, opacity: 0.7, marginBottom: 2 } }, t.speaker === "coco" ? "Coco" : "Caller"),
                            t.text),
                        ))
                    : h("p", { style: { color: colors.muted, fontSize: 13, margin: 0 } }, "Transcript still processing — hit Refresh in a moment."),
                ),
              );
            }),
          ),
        ),
      ),
    ),
  );
}

function DemoTab() {
  const [device, setDevice] = useState("Samsung QN90A TV");
  const [turns, setTurns] = useState<SampleTurn[]>([]);
  const [sampleDevice, setSampleDevice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const d = await api("/api/sample-call");
    if (d.exists) { setTurns(d.turns ?? []); setSampleDevice(d.device ?? null); }
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

  return h(
    Fragment,
    null,
    h(
      Card,
      null,
      h("h3", { style: { margin: "0 0 4px" } }, "Simulated demo call"),
      h("p", { style: { color: colors.muted, fontSize: 13, margin: "0 0 14px" } }, "Hear a mock call between a flustered family member and Coco. Pick a device and generate — two ElevenLabs voices, one of them your clone."),
      h("div", { style: { display: "grid", gap: 10, gridTemplateColumns: "1fr auto auto" } },
        h(Input, { value: device, onChange: setDevice, placeholder: "Device for the demo (e.g. Roku Ultra)" }),
        h(Button, { onClick: generate, disabled: busy }, busy ? "Generating…" : "Generate call"),
        turns.length > 0 && h(Button, { variant: "secondary", onClick: playAll, disabled: busy || playingIdx !== null }, playingIdx !== null ? "Playing…" : "▶ Play the call"),
      ),
      msg && h("p", { style: { color: colors.ink, fontSize: 13, marginTop: 10 } }, msg),
      sampleDevice && h("p", { style: { color: colors.muted, fontSize: 12, marginTop: 8 } }, `Demo about: ${sampleDevice}`),
    ),
    h(
      "div",
      { style: { display: "grid", gap: 10, marginTop: 16 } },
      turns.map((t) =>
        h(
          "div",
          {
            key: t.idx,
            style: {
              display: "flex",
              justifyContent: t.speaker === "coco" ? "flex-end" : "flex-start",
            },
          },
          h(
            "div",
            {
              style: {
                maxWidth: "75%",
                padding: "10px 14px",
                borderRadius: 14,
                fontSize: 14,
                lineHeight: 1.4,
                background: t.speaker === "coco" ? colors.accent : colors.card,
                color: t.speaker === "coco" ? "#fff" : colors.ink,
                border: t.speaker === "coco" ? "none" : `1px solid ${colors.border}`,
                outline: playingIdx === t.idx ? `2px solid ${colors.warn}` : "none",
              },
            },
            h("div", { style: { fontSize: 11, fontWeight: 700, opacity: 0.7, marginBottom: 2 } }, t.speaker === "coco" ? "Coco" : "Caller"),
            t.text,
          ),
        ),
      ),
    ),
  );
}

function PromptTab() {
  const [prompt, setPrompt] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api("/api/agent/prompt")
      .then((d) => { setPrompt(d.prompt ?? ""); setFirstMessage(d.firstMessage ?? ""); setLoaded(true); })
      .catch((e) => { setMsg(e.message); setLoaded(true); });
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/agent/prompt", { method: "POST", body: JSON.stringify({ prompt, firstMessage }) });
      setMsg("Saved — the assistant will use this on the next call.");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const labelStyle = { fontSize: 13, fontWeight: 600, color: colors.ink, marginBottom: 6, display: "block" };
  const areaStyle = { width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${colors.border}`, fontSize: 14, lineHeight: 1.5, fontFamily: "inherit", resize: "vertical" as const, background: colors.card, color: colors.ink };

  return h(
    Card,
    null,
    h("h3", { style: { margin: "0 0 4px" } }, "Edit the assistant"),
    h("p", { style: { color: colors.muted, fontSize: 13, margin: "0 0 16px" } }, "Tune how Coco greets callers and how it coaches them. Changes apply to the live agent on the next call — voice, tools, and manuals stay attached."),
    !loaded
      ? h("p", { style: { color: colors.muted } }, "Loading…")
      : h(
          "div",
          { style: { display: "grid", gap: 16 } },
          h("div", null,
            h("label", { style: labelStyle }, "First message (what Coco says when they pick up)"),
            h("textarea", { value: firstMessage, onInput: (e: any) => setFirstMessage(e.target.value), rows: 2, style: areaStyle }),
          ),
          h("div", null,
            h("label", { style: labelStyle }, "System prompt (Coco's personality & rules)"),
            h("textarea", { value: prompt, onInput: (e: any) => setPrompt(e.target.value), rows: 18, style: { ...areaStyle, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 } }),
          ),
          h("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
            h(Button, { onClick: save, disabled: busy }, busy ? "Saving…" : "Save changes"),
            msg && h("span", { style: { fontSize: 13, color: colors.ink } }, msg),
          ),
        ),
  );
}

function LiveTab() {
  const [state, setState] = useState<"idle" | "connecting" | "live">("idle");
  const [mode, setMode] = useState<"speaking" | "listening">("listening");
  const [msgs, setMsgs] = useState<{ source: string; text: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const convoRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const barsRef = useRef<{ cur: number[]; vel: number[] }>({ cur: [], vel: [] });
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => { stop(); }, []);
  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [msgs]);

  const BARS = 56;

  function draw() {
    const canvas = canvasRef.current;
    const convo = convoRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = hgt * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);

    let out: Uint8Array | null = null, inp: Uint8Array | null = null;
    try { out = convo?.getOutputByteFrequencyData?.() ?? null; } catch {}
    try { inp = convo?.getInputByteFrequencyData?.() ?? null; } catch {}

    const st = barsRef.current;
    if (st.cur.length !== BARS) { st.cur = new Array(BARS).fill(0); st.vel = new Array(BARS).fill(0); }
    const src = (out && out.length) ? out : inp;
    const speaking = !!(out && out.some((v) => v > 8));
    for (let i = 0; i < BARS; i++) {
      let target = 0;
      if (src && src.length) {
        const idx = Math.floor((i / BARS) * (src.length * 0.7));
        target = (src[idx] ?? 0) / 255;
      }
      // idle shimmer so the waveform feels alive between turns
      if (!src || !src.length || target < 0.02) target = 0.03 + 0.02 * Math.sin(Date.now() / 320 + i * 0.5);
      // spring physics toward target
      const stiffness = 0.22, damping = 0.72;
      st.vel[i] += (target - st.cur[i]) * stiffness;
      st.vel[i] *= damping;
      st.cur[i] += st.vel[i];
      if (st.cur[i] < 0) st.cur[i] = 0;
    }

    const mid = hgt / 2;
    const gap = 3;
    const bw = (w - gap * (BARS - 1)) / BARS;
    const accent = speaking ? [193, 105, 79] : [90, 122, 100];
    for (let i = 0; i < BARS; i++) {
      const bh = Math.max(2, st.cur[i] * (hgt * 0.9));
      const x = i * (bw + gap);
      const t = i / BARS;
      const alpha = 0.55 + 0.45 * Math.sin(t * Math.PI);
      ctx.fillStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${alpha})`;
      const r = Math.min(bw / 2, 4);
      roundRect(ctx, x, mid - bh / 2, bw, bh, r);
      ctx.fill();
    }
    rafRef.current = requestAnimationFrame(draw);
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function start() {
    setErr(null);
    setMsgs([]);
    setState("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { token } = await api("/api/agent/conversation-token");
      // Loaded from CDN at runtime (variable specifier) so the heavy LiveKit/
      // WebRTC SDK never enters the app bundle and can't blow the deploy limit.
      const sdkUrl = "https://esm.sh/@elevenlabs/client@0.9.0";
      // @ts-ignore - runtime module, no local types
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
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const convo = convoRef.current;
    convoRef.current = null;
    if (convo) { try { await convo.endSession(); } catch {} }
    setState("idle");
  }

  return h(
    Fragment,
    null,
    h(
      Card,
      null,
      h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } },
        h("h3", { style: { margin: 0 } }, "Talk to Coco (live test call)"),
        state === "live" && h("span", { style: { fontSize: 12, fontWeight: 700, color: mode === "speaking" ? colors.accent : colors.ok, display: "inline-flex", alignItems: "center", gap: 6 } },
          h("span", { style: { width: 8, height: 8, borderRadius: 8, background: mode === "speaking" ? colors.accent : colors.ok, display: "inline-block" } }),
          mode === "speaking" ? "Coco speaking" : "Listening"),
      ),
      h("p", { style: { color: colors.muted, fontSize: 13, margin: "0 0 14px" } }, "Speak to the assistant right from your browser — same agent, voice, and manuals as the phone line. This runs peer-to-peer via WebRTC, so it won't affect real call quality."),
      h("canvas", { ref: canvasRef, style: { width: "100%", height: 120, display: "block", borderRadius: 12, background: "linear-gradient(180deg, #fbf8f5 0%, #f4f0ea 100%)", border: `1px solid ${colors.border}` } }),
      h("div", { style: { display: "flex", gap: 10, marginTop: 14 } },
        state === "idle" && h(Button, { onClick: start }, "● Start call"),
        state === "connecting" && h(Button, { disabled: true }, "Connecting…"),
        state === "live" && h(Button, { variant: "ghost", onClick: stop }, "End call"),
      ),
      err && h("p", { style: { color: colors.err, fontSize: 13, marginTop: 10 } }, err),
    ),
    msgs.length > 0 && h(
      Card,
      { style: { marginTop: 16 } },
      h("div", { ref: transcriptRef, style: { display: "grid", gap: 8, maxHeight: 320, overflowY: "auto" } },
        msgs.map((m, i) =>
          h("div", { key: i, style: { display: "flex", justifyContent: m.source === "coco" ? "flex-end" : "flex-start" } },
            h("div", { style: { maxWidth: "75%", padding: "9px 13px", borderRadius: 13, fontSize: 14, lineHeight: 1.4, animation: "none", background: m.source === "coco" ? colors.accent : colors.card, color: m.source === "coco" ? "#fff" : colors.ink, border: m.source === "coco" ? "none" : `1px solid ${colors.border}` } },
              h("div", { style: { fontSize: 11, fontWeight: 700, opacity: 0.7, marginBottom: 2 } }, m.source === "coco" ? "Coco" : "You"),
              m.text),
          ),
        ),
      ),
    ),
  );
}

function MonitorTab() {
  const [device, setDevice] = useState("a smart TV");
  const [status, setStatus] = useState<string>("idle");
  const [caller, setCaller] = useState<string | null>(null);
  const [turns, setTurns] = useState<{ speaker: string; text: string }[]>([]);
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<{ speaking: boolean }>({ speaking: false });
  const barsRef = useRef<{ cur: number[]; vel: number[] }>({ cur: [], vel: [] });
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  async function poll() {
    try {
      const d = await api("/api/monitor/live");
      setStatus(d.status ?? "idle");
      setCaller(d.caller ?? null);
      setTurns(d.turns ?? []);
      setSpeaker(d.currentSpeaker ?? null);
      stateRef.current.speaking = !!d.currentSpeaker;
    } catch {}
  }

  useEffect(() => {
    poll();
    const iv = setInterval(poll, 1200);
    rafRef.current = requestAnimationFrame(draw);
    return () => { clearInterval(iv); if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, []);
  useEffect(() => { if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight; }, [turns]);

  const BARS = 56;
  function draw() {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth, hgt = canvas.clientHeight;
        if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = hgt * dpr; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, hgt);
        const st = barsRef.current;
        if (st.cur.length !== BARS) { st.cur = new Array(BARS).fill(0); st.vel = new Array(BARS).fill(0); }
        const speaking = stateRef.current.speaking;
        const now = Date.now();
        for (let i = 0; i < BARS; i++) {
          let target: number;
          if (speaking) {
            // synthetic voice envelope: layered sines + position falloff
            const env = 0.5 + 0.5 * Math.sin(now / 140 + i * 0.6) * Math.sin(now / 373 + i * 0.21);
            target = (0.25 + 0.6 * Math.abs(env)) * (0.6 + 0.4 * Math.sin((i / BARS) * Math.PI));
          } else {
            target = 0.03 + 0.02 * Math.sin(now / 320 + i * 0.5);
          }
          const stiffness = 0.22, damping = 0.72;
          st.vel[i] += (target - st.cur[i]) * stiffness;
          st.vel[i] *= damping;
          st.cur[i] += st.vel[i];
          if (st.cur[i] < 0) st.cur[i] = 0;
        }
        const mid = hgt / 2, gap = 3, bw = (w - gap * (BARS - 1)) / BARS;
        const accent = speaking ? [193, 105, 79] : [122, 115, 106];
        for (let i = 0; i < BARS; i++) {
          const bh = Math.max(2, st.cur[i] * (hgt * 0.9));
          const x = i * (bw + gap);
          const alpha = 0.5 + 0.45 * Math.sin((i / BARS) * Math.PI);
          ctx.fillStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${alpha})`;
          const r = Math.min(bw / 2, 4);
          ctx.beginPath();
          ctx.moveTo(x + r, mid - bh / 2);
          ctx.arcTo(x + bw, mid - bh / 2, x + bw, mid + bh / 2, r);
          ctx.arcTo(x + bw, mid + bh / 2, x, mid + bh / 2, r);
          ctx.arcTo(x, mid + bh / 2, x, mid - bh / 2, r);
          ctx.arcTo(x, mid - bh / 2, x + bw, mid - bh / 2, r);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    rafRef.current = requestAnimationFrame(draw);
  }

  async function simulate() {
    setBusy(true);
    setTurns([]);
    try { await api("/api/monitor/simulate", { method: "POST", body: JSON.stringify({ device }) }); await poll(); }
    finally { setBusy(false); }
  }
  async function end() { await api("/api/monitor/stop", { method: "POST" }); await poll(); }

  const live = status === "ringing" || status === "in-progress";
  const statusLabel = status === "ringing" ? "Ringing…" : status === "in-progress" ? "On the line" : status === "ended" ? "Call ended" : "No active call";
  const statusColor = status === "in-progress" ? colors.ok : status === "ringing" ? colors.warn : colors.muted;

  return h(
    Fragment,
    null,
    h(
      Card,
      null,
      h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } },
        h("h3", { style: { margin: 0 } }, "Live call monitor"),
        h("span", { style: { fontSize: 12, fontWeight: 700, color: statusColor, display: "inline-flex", alignItems: "center", gap: 6 } },
          h("span", { style: { width: 8, height: 8, borderRadius: 8, background: statusColor, display: "inline-block", opacity: live ? 1 : 0.5 } }),
          statusLabel + (caller && live ? ` · ${formatPhone(caller)}` : "")),
      ),
      h("p", { style: { color: colors.muted, fontSize: 13, margin: "0 0 14px" } }, "Watch a call unfold in real time — transcript streams in as it's spoken. Real phone calls appear here automatically; use the simulator below to see it in action right now."),
      h("canvas", { ref: canvasRef, style: { width: "100%", height: 110, display: "block", borderRadius: 12, background: "linear-gradient(180deg, #fbf8f5 0%, #f4f0ea 100%)", border: `1px solid ${colors.border}` } }),
      h("div", { style: { display: "flex", gap: 10, marginTop: 14, alignItems: "center" } },
        h(Input, { value: device, onChange: setDevice, placeholder: "Device the caller is stuck on" }),
        !live
          ? h(Button, { onClick: simulate, disabled: busy }, busy ? "Starting…" : "Simulate incoming call")
          : h(Button, { variant: "ghost", onClick: end }, "End call"),
      ),
    ),
    turns.length > 0 && h(
      Card,
      { style: { marginTop: 16 } },
      h("div", { ref: transcriptRef, style: { display: "grid", gap: 8, maxHeight: 340, overflowY: "auto" } },
        turns.map((t, i) =>
          h("div", { key: i, style: { display: "flex", justifyContent: t.speaker === "coco" ? "flex-end" : "flex-start" } },
            h("div", { style: { maxWidth: "75%", padding: "9px 13px", borderRadius: 13, fontSize: 14, lineHeight: 1.4, background: t.speaker === "coco" ? colors.accent : colors.card, color: t.speaker === "coco" ? "#fff" : colors.ink, border: t.speaker === "coco" ? "none" : `1px solid ${colors.border}`, outline: speaker && i === turns.length - 1 && ((speaker === "coco") === (t.speaker === "coco")) ? `2px solid ${colors.warn}` : "none" } },
              h("div", { style: { fontSize: 11, fontWeight: 700, opacity: 0.7, marginBottom: 2 } }, t.speaker === "coco" ? "Coco" : "Caller"),
              t.text),
          ),
        ),
      ),
    ),
  );
}

function App() {
  const [tab, setTab] = useState<"setup" | "devices" | "prompt" | "live" | "monitor" | "demo" | "calls">("setup");
  const [status, setStatus] = useState<Status | null>(null);

  async function refresh() {
    const d = await api("/api/status");
    setStatus(d);
  }
  useEffect(() => { refresh(); }, []);

  const groups: { label: string; items: [string, string, string][] }[] = [
    { label: "Configure", items: [
      ["setup", "phone", "Setup"],
      ["devices", "device", "Devices"],
      ["prompt", "edit", "Prompt"],
    ] },
    { label: "Calls", items: [
      ["live", "waveform", "Live call"],
      ["monitor", "call", "Monitor"],
      ["demo", "demo", "Demo call"],
      ["calls", "call", "History"],
    ] },
  ];

  return h(
    "div",
    { style: { maxWidth: 960, margin: "0 auto", padding: "32px 20px 60px" } },
    h(
      "div",
      { style: { marginBottom: 24 } },
      h("h1", { style: { margin: 0, fontSize: 26 } }, "Mother's Little Helper"),
      h("p", { style: { color: colors.ink, margin: "8px 0 0", fontSize: 15, maxWidth: 620, lineHeight: 1.45 } }, "A personalized assistant for family members seeking your IT assistance when they get lost in the latest product sauce."),
      status?.phoneNumberId
        ? h("div", { style: { display: "flex", alignItems: "center", gap: 12, margin: "12px 0 0", flexWrap: "wrap" } },
            h("span", { style: { fontSize: 13, color: colors.ok, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 } }, h(Icon, { name: "check", size: 15 }), "Live — family can call"),
            h(PhoneDisplay, { number: status.twilioPhoneNumber ?? "", big: true }),
          )
        : h("p", { style: { color: colors.muted, margin: "6px 0 0" } }, "Not live yet — finish Setup so family can call in."),
    ),
    h(
      "div",
      { style: { display: "flex", gap: 22, marginBottom: 22, flexWrap: "wrap", alignItems: "flex-end" } },
      groups.map((g) =>
        h("div", { key: g.label, style: { display: "flex", flexDirection: "column", gap: 6 } },
          h("span", { style: { fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: colors.muted, paddingLeft: 4 } }, g.label),
          h("div", { style: { display: "flex", gap: 6, padding: 4, borderRadius: 14, background: "rgba(255,255,255,0.6)", border: `1px solid ${colors.border}` } },
            g.items.map(([id, icon, label]) =>
              h("button", {
                key: id,
                onClick: () => setTab(id as any),
                style: {
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 13px", borderRadius: 10, fontSize: 14, fontWeight: 600,
                  border: "1px solid transparent",
                  background: tab === id ? colors.accent : "transparent",
                  color: tab === id ? "#fff" : colors.ink,
                  boxShadow: tab === id ? "0 1px 2px rgba(193,105,79,0.25), 0 3px 8px rgba(193,105,79,0.16)" : "none",
                  cursor: "pointer",
                },
              }, h(Icon, { name: icon, size: 15 }), label),
            ),
          ),
        ),
      ),
    ),
    tab === "setup" && h(SetupTab, { status, refresh }),
    tab === "devices" && h(DevicesTab, null),
    tab === "prompt" && h(PromptTab, null),
    tab === "live" && h(LiveTab, null),
    tab === "monitor" && h(MonitorTab, null),
    tab === "demo" && h(DemoTab, null),
    tab === "calls" && h(CallsTab, null),
  );
}

createRoot(document.getElementById("root")!).render(h(App, null));
