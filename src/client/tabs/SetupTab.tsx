import { useEffect, useState } from "react";
import { formatPhone } from "../../shared/phone";
import { api, type Health, type Status, type Voice } from "../api";
import { Button, Card, Icon, Input } from "../ui";

export function SetupTab({ status, refresh }: { status: Status | null; refresh: () => void }) {
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
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    api("/api/survey").then((d) => setSurveyOn(!!d.enabled)).catch(() => {});
    api("/api/health").then(setHealth).catch(() => {});
  }, []);

  useEffect(() => {
    if (status?.twilioPhonePrefill && !phone) setPhone(status.twilioPhonePrefill);
    if (status?.twilioSidPrefill && !sid) setSid(status.twilioSidPrefill);
  }, [status]);

  async function searchNumbers() {
    setBusy("search");
    setMsg(null);
    try {
      const d = await api("/api/twilio/search", { method: "POST", body: JSON.stringify({ areaCode }) });
      setResults(d.numbers ?? []);
      if (!(d.numbers ?? []).length) setMsg("No numbers found for that area code — try another.");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function buyNumber(phoneNumber: string) {
    setBusy("buy");
    setMsg(null);
    try {
      const d = await api("/api/twilio/buy", { method: "POST", body: JSON.stringify({ phoneNumber }) });
      setMsg(`Bought ${formatPhone(d.phoneNumber)} and wired it to Coco.`);
      setResults([]);
      refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleSurvey(next: boolean) {
    setSurveyOn(next);
    try {
      await api("/api/survey", { method: "POST", body: JSON.stringify({ enabled: next }) });
    } catch (e: any) {
      setMsg(e.message);
      setSurveyOn(!next);
    }
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

  const twilioForm = (
    <div style={{ display: "grid", gap: 10 }}>
      <Input value={sid} onChange={setSid} placeholder="Account SID (AC…)" />
      <Input value={token} onChange={setToken} placeholder="Auth Token" type="password" />
      <Input value={phone} onChange={setPhone} placeholder="+15551234567" />
      <Button onClick={saveTwilio} disabled={busy === "twilio"}>{busy === "twilio" ? "Saving…" : "Save Twilio credentials"}</Button>
    </div>
  );

  return (
    <>
      {health && (
        <Card style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 4px" }}>Credential health</h3>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>
            Keys are never shown. A live phone loop also needs a public URL ElevenLabs can reach.
          </p>
          <ul className="health-list">
            <li>ElevenLabs: {health.elevenlabs ? "present" : "missing"}</li>
            <li>Brave Search: {health.brave ? "present" : "missing"}</li>
            <li>LLM (demo scripts): {health.llm ? "present" : "missing — fallback dialogue"}</li>
            <li>Twilio Account SID (AC…): {health.twilioAccountSid ? "present" : health.twilioSidLooksLikeApiKey ? "looks like an API key (SK…)" : "missing"}</li>
            <li>Twilio Auth Token: {health.twilioAuth ? "present" : "missing"}</li>
            <li>Twilio API key (SK…): {health.twilioApiKey ? "present" : "missing"}</li>
            <li>Twilio API secret: {health.twilioApiSecret ? "present" : "missing"}</li>
            <li>Twilio phone number: {health.twilioPhoneNumber ? "present" : "missing"}</li>
            <li>Public webhook origin: {health.publicBaseUrlReachable ? "reachable" : "localhost only — run just live"}</li>
          </ul>
          {health.notes.length > 0 && (
            <ul className="health-list">
              {health.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
        <Card>
          <h3 style={{ margin: "0 0 4px" }}>1. Twilio number</h3>
          {status?.phoneNumberId ? (
            <>
              <p className="ok" style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="check" size={15} />
                {`Connected: ${formatPhone(status.twilioPhoneNumber ?? "")}`}
              </p>
              <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>Family can call this number now. You usually won't need to touch this again.</p>
              <details>
                <summary style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>Change or reconnect number</summary>
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>{twilioForm}</div>
              </details>
            </>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>Paste the Account SID, Auth Token, and phone number from your Twilio console.</p>
              {twilioForm}
            </>
          )}
        </Card>
        <Card>
          <h3 style={{ margin: "0 0 4px" }}>2. Assistant voice & persona</h3>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>Pick a voice — any clone you've made in ElevenLabs is auto-selected.</p>
          <div style={{ display: "grid", gap: 10 }}>
            <select className="select" aria-label="Assistant voice" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              <option value="">Use ElevenLabs default</option>
              {voices.map((v) => (
                <option value={v.voice_id} key={v.voice_id}>
                  {`${v.name}${v.category && v.category !== "premade" ? " (your clone)" : ""}`}
                </option>
              ))}
            </select>
            <Button onClick={createAgent} disabled={busy === "agent"}>
              {busy === "agent" ? "Working…" : status?.agentId ? "Update assistant" : "Create assistant"}
            </Button>
          </div>
        </Card>
      </div>
      <Card style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 4px" }}>3. Go live</h3>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
          {status?.phoneNumberId ? "Your Twilio number is connected — family can call it now." : "Once the assistant exists and Twilio is saved, connect the number."}
        </p>
        <Button onClick={importPhone} disabled={busy === "phone" || !status?.agentId}>
          {busy === "phone" ? "Connecting…" : "Connect phone number"}
        </Button>
      </Card>
      <Card style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 4px" }}>Buy a new number</h3>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
          Provision a fresh Twilio number right here and wire it straight to Coco — no console trip. Purchasing costs about $1–2/month on your Twilio account.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Input value={areaCode} onChange={setAreaCode} placeholder="Area code (e.g. 617) — optional" />
          <Button variant="secondary" onClick={searchNumbers} disabled={busy === "search"}>
            {busy === "search" ? "Searching…" : "Search"}
          </Button>
        </div>
        {results.length > 0 && (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {results.map((n) => (
              <div key={n.phoneNumber} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{formatPhone(n.phoneNumber)}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{[n.locality, n.region].filter(Boolean).join(", ")}</div>
                </div>
                <Button onClick={() => buyNumber(n.phoneNumber)} disabled={busy === "buy"}>
                  {busy === "buy" ? "Buying…" : "Buy & connect"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h3 style={{ margin: "0 0 4px" }}>SMS quality survey</h3>
            <p className="muted" style={{ fontSize: 13, margin: 0, maxWidth: 460 }}>
              After each call, text the caller a quick 1–5 rating request; replies show up in History. Off by default. Each text costs a few cents on your Twilio account.
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleSurvey(!surveyOn)}
            role="switch"
            aria-checked={surveyOn}
            aria-label="SMS quality survey"
            style={{
              flexShrink: 0,
              width: 46,
              height: 26,
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: surveyOn ? "var(--ok)" : "var(--border)",
              position: "relative",
            }}
          >
            <span style={{ position: "absolute", top: 3, left: surveyOn ? 23 : 3, width: 20, height: 20, borderRadius: 999, background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </button>
        </div>
      </Card>
      {msg && <p style={{ fontSize: 13, marginTop: 12 }}>{msg}</p>}
    </>
  );
}
