import { useEffect, useState } from "react";
import { api, type Voice } from "../api";
import { Button, Card, Input } from "../ui";

type Preview = { generated_voice_id: string; audio_base_64: string; media_type?: string; duration_secs?: number };

export function VoicesTab({ refresh }: { refresh: () => void }) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [denoise, setDenoise] = useState(false);
  const [designPrompt, setDesignPrompt] = useState("A warm, patient nephew with a slightly theatrical, reassuring tone");
  const [designText, setDesignText] = useState("");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [saveName, setSaveName] = useState("Coco");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const d = await api("/api/voices");
    setVoices(d.voices ?? []);
  }
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, []);

  async function clone() {
    if (!name.trim() || !files.length) {
      setMsg("Name and at least one audio sample are required.");
      return;
    }
    setBusy("clone");
    setMsg(null);
    try {
      const form = new FormData();
      form.set("name", name.trim());
      if (description.trim()) form.set("description", description.trim());
      if (denoise) form.set("removeBackgroundNoise", "true");
      for (const f of files) form.append("files", f, f.name);
      const d = await api("/api/voices/clone", { method: "POST", body: form });
      setMsg(`Cloned voice ${d.voice_id}${d.requires_verification ? " (verification required)" : ""}.`);
      setFiles([]);
      await load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function design() {
    setBusy("design");
    setMsg(null);
    try {
      const d = await api("/api/voices/design", {
        method: "POST",
        body: JSON.stringify({ voiceDescription: designPrompt, text: designText || undefined }),
      });
      setPreviews(d.previews ?? []);
      setMsg("Previews ready — listen and save the one you like.");
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function savePreview(generatedVoiceId: string) {
    setBusy("save");
    setMsg(null);
    try {
      const d = await api("/api/voices/design/save", {
        method: "POST",
        body: JSON.stringify({ voiceName: saveName, voiceDescription: designPrompt, generatedVoiceId }),
      });
      setMsg(`Saved designed voice ${d.voice_id}.`);
      setPreviews([]);
      await load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function useVoice(id: string) {
    setBusy("use");
    try {
      await api(`/api/voices/${id}/use`, { method: "POST" });
      setMsg("Assistant will use this voice.");
      refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy("del");
    try {
      await api(`/api/voices/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Card>
        <h3 style={{ margin: "0 0 4px" }}>Instant clone from audio</h3>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
          Upload about 30 seconds of clean speech. This spends ElevenLabs voice credits.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <Input value={name} onChange={setName} placeholder="Voice name (e.g. Coco clone)" />
          <Input value={description} onChange={setDescription} placeholder="Description (optional)" />
          <input
            type="file"
            accept="audio/*"
            multiple
            aria-label="Voice sample files"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} />
            Remove background noise
          </label>
          <Button onClick={clone} disabled={busy === "clone"}>{busy === "clone" ? "Cloning…" : "Clone voice"}</Button>
        </div>
      </Card>
      <Card style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 4px" }}>Voice Design from a description</h3>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
          Generate previews with ElevenLabs Voice Design (`eleven_ttv_v3`), then save the one that sounds right.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <textarea className="textarea" rows={3} aria-label="Voice description" value={designPrompt} onChange={(e) => setDesignPrompt(e.target.value)} />
          <Input value={designText} onChange={setDesignText} placeholder="Preview line (optional, 100–1000 chars)" />
          <Button onClick={design} disabled={busy === "design"}>{busy === "design" ? "Designing…" : "Generate previews"}</Button>
        </div>
        {previews.length > 0 && (
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            <Input value={saveName} onChange={setSaveName} placeholder="Name to save as" />
            {previews.map((p, i) => (
              <div key={p.generated_voice_id} style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Preview {i + 1}</span>
                <audio controls src={`data:audio/mpeg;base64,${p.audio_base_64}`} style={{ flex: 1 }} />
                <Button onClick={() => savePreview(p.generated_voice_id)} disabled={busy === "save"}>Save</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 12px" }}>Your voices</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {voices.map((v) => (
            <div key={v.voice_id} style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{v.name}{v.category && v.category !== "premade" ? " (your clone)" : ""}</div>
                <div className="muted" style={{ fontSize: 12 }}>{v.voice_id}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {v.preview_url && <audio controls src={v.preview_url} style={{ height: 32 }} />}
                <Button variant="secondary" onClick={() => useVoice(v.voice_id)} disabled={busy === "use"}>Use for assistant</Button>
                {v.category && v.category !== "premade" && (
                  <Button variant="ghost" onClick={() => remove(v.voice_id)} disabled={busy === "del"}>Delete</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
      {msg && <p style={{ fontSize: 13, marginTop: 12 }}>{msg}</p>}
    </>
  );
}
