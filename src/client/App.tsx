import { useEffect, useState } from "react";
import { api, type Status } from "./api";
import { Icon, PhoneDisplay, ThemeControls, useTheme } from "./ui";
import { SetupTab } from "./tabs/SetupTab";
import { DevicesTab } from "./tabs/DevicesTab";
import { PromptTab } from "./tabs/PromptTab";
import { LiveTab } from "./tabs/LiveTab";
import { MonitorTab } from "./tabs/MonitorTab";
import { DemoTab } from "./tabs/DemoTab";
import { CallsTab } from "./tabs/CallsTab";
import { VoicesTab } from "./tabs/VoicesTab";

type TabId = "setup" | "devices" | "prompt" | "voices" | "live" | "monitor" | "demo" | "calls";

export function App() {
  const [tab, setTab] = useState<TabId>("setup");
  const [status, setStatus] = useState<Status | null>(null);
  const theme = useTheme();

  async function refresh() {
    const d = await api("/api/status");
    setStatus(d);
  }
  useEffect(() => { refresh(); }, []);

  const groups: { label: string; items: [TabId, string, string][] }[] = [
    { label: "Configure", items: [
      ["setup", "phone", "Setup"],
      ["devices", "device", "Devices"],
      ["prompt", "edit", "Prompt"],
      ["voices", "voice", "Voices"],
    ] },
    { label: "Calls", items: [
      ["live", "waveform", "Live call"],
      ["monitor", "call", "Monitor"],
      ["demo", "demo", "Demo call"],
      ["calls", "call", "History"],
    ] },
  ];

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26 }}>Mother's Little Helper</h1>
            <p style={{ margin: "8px 0 0", fontSize: 15, maxWidth: 620, lineHeight: 1.45 }}>
              A personalized assistant for family members seeking your IT assistance when they get lost in the latest product sauce.
            </p>
          </div>
          <ThemeControls {...theme} />
        </div>
        {status?.phoneNumberId
          ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0 0", flexWrap: "wrap" }}>
              <span className="ok" style={{ fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="check" size={15} /> Live — family can call
              </span>
              <PhoneDisplay number={status.twilioPhoneNumber ?? ""} big />
            </div>
          )
          : <p className="muted" style={{ margin: "6px 0 0" }}>Not live yet — finish Setup so family can call in.</p>}
      </div>
      <div style={{ display: "flex", gap: 22, marginBottom: 22, flexWrap: "wrap", alignItems: "flex-end" }} role="tablist" aria-label="Main">
        {groups.map((g) => (
          <div key={g.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", paddingLeft: 4 }}>{g.label}</span>
            <div className="tab-rail">
              {g.items.map(([id, icon, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className="tab"
                  onClick={() => setTab(id)}
                >
                  <Icon name={icon} size={15} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {tab === "setup" && <SetupTab status={status} refresh={refresh} />}
      {tab === "devices" && <DevicesTab />}
      {tab === "prompt" && <PromptTab />}
      {tab === "voices" && <VoicesTab refresh={refresh} />}
      {tab === "live" && <LiveTab />}
      {tab === "monitor" && <MonitorTab />}
      {tab === "demo" && <DemoTab />}
      {tab === "calls" && <CallsTab />}
    </div>
  );
}
