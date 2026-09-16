import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Card } from "../ui";

export function PromptTab() {
  const [prompt, setPrompt] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api("/api/agent/prompt")
      .then((d) => {
        setPrompt(d.prompt ?? "");
        setFirstMessage(d.firstMessage ?? "");
        setLoaded(true);
      })
      .catch((e) => {
        setMsg(e.message);
        setLoaded(true);
      });
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

  return (
    <Card>
      <h3 style={{ margin: "0 0 4px" }}>Edit the assistant</h3>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>
        Tune how Coco greets callers and how it coaches them. Changes apply to the live agent on the next call — voice, tools, and manuals stay attached.
      </p>
      {!loaded ? (
        <p className="muted">Loading…</p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label htmlFor="first-message" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>First message (what Coco says when they pick up)</label>
            <textarea id="first-message" className="textarea" value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} rows={2} />
          </div>
          <div>
            <label htmlFor="system-prompt" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>System prompt (Coco's personality & rules)</label>
            <textarea id="system-prompt" className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={18} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
            {msg && <span style={{ fontSize: 13 }}>{msg}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
