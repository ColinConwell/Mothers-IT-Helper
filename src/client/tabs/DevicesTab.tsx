import { useEffect, useState } from "react";
import { api, type Device } from "../api";
import { Button, Card, Input, StatusPill } from "../ui";

export function DevicesTab() {
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
      setName("");
      setModel("");
      setUrl("");
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

  return (
    <>
      <Card>
        <h3 style={{ margin: "0 0 4px" }}>Add a device</h3>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>We'll search for the manual automatically — paste a URL yourself if the search picks the wrong page.</p>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr auto" }}>
          <Input value={name} onChange={setName} placeholder="Device (e.g. Samsung TV)" />
          <Input value={model} onChange={setModel} placeholder="Model (optional)" />
          <Input value={url} onChange={setUrl} placeholder="Manual URL (optional)" />
          <Button onClick={addDevice} disabled={busy}>{busy ? "Adding…" : "Add"}</Button>
        </div>
        {msg && <p style={{ fontSize: 13, marginTop: 10 }}>{msg}</p>}
      </Card>
      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {devices.length === 0 && <p className="muted">No devices yet.</p>}
        {devices.map((d) => (
          <Card key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{[d.name, d.model].filter(Boolean).join(" — ")}</div>
              <div style={{ marginTop: 4 }}><StatusPill status={d.status} /></div>
              {d.errorMsg && <div className="err" style={{ fontSize: 12, marginTop: 4, maxWidth: 480 }}>{d.errorMsg}</div>}
              {d.sourceUrl && <a href={d.sourceUrl} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12 }}>{d.sourceUrl}</a>}
            </div>
            <Button variant="ghost" onClick={() => removeDevice(d.id)}>Remove</Button>
          </Card>
        ))}
      </div>
    </>
  );
}
