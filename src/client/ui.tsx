import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { APPEARANCES, PALETTE_LABELS, PALETTES, type AppearancePref, type PaletteId } from "../shared/themes";

const PALETTE_KEY = "mith-palette";
const APPEARANCE_KEY = "mith-appearance";

function resolveAppearance(pref: AppearancePref): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(palette: PaletteId, pref: AppearancePref) {
  const root = document.documentElement;
  root.dataset.palette = palette;
  root.dataset.appearance = resolveAppearance(pref);
  root.dataset.appearancePref = pref;
}

export function readAccentRgb(): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim();
  const parts = raw.split(",").map((s) => Number(s.trim()));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) return [parts[0], parts[1], parts[2]];
  return [193, 105, 79];
}

export function useTheme() {
  const [palette, setPaletteState] = useState<PaletteId>(() => {
    const stored = localStorage.getItem(PALETTE_KEY) as PaletteId | null;
    return PALETTES.includes(stored as PaletteId) ? (stored as PaletteId) : "clay";
  });
  const [appearance, setAppearanceState] = useState<AppearancePref>(() => {
    const stored = localStorage.getItem(APPEARANCE_KEY) as AppearancePref | null;
    return APPEARANCES.includes(stored as AppearancePref) ? (stored as AppearancePref) : "system";
  });

  useEffect(() => {
    apply(palette, appearance);
    localStorage.setItem(PALETTE_KEY, palette);
    localStorage.setItem(APPEARANCE_KEY, appearance);
    if (appearance !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(palette, appearance);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [palette, appearance]);

  return {
    palette,
    appearance,
    setPalette: (p: PaletteId) => setPaletteState(p),
    setAppearance: (a: AppearancePref) => setAppearanceState(a),
  };
}

const CHIP_COLORS: Record<PaletteId, string> = {
  clay: "#8f3f2c",
  forest: "#2c6844",
  linen: "#6a4c28",
  dusk: "#31438c",
};

export function ThemeControls({
  palette,
  appearance,
  setPalette,
  setAppearance,
}: {
  palette: PaletteId;
  appearance: AppearancePref;
  setPalette: (p: PaletteId) => void;
  setAppearance: (a: AppearancePref) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
      <div className="seg" role="group" aria-label="Appearance">
        {APPEARANCES.map((a) => (
          <button key={a} type="button" aria-pressed={appearance === a} onClick={() => setAppearance(a)}>
            {a[0].toUpperCase() + a.slice(1)}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Palette" style={{ alignItems: "center", paddingLeft: 8, paddingRight: 8, gap: 6 }}>
        {PALETTES.map((p) => (
          <button
            key={p}
            type="button"
            className="palette-chip"
            aria-pressed={palette === p}
            aria-label={PALETTE_LABELS[p]}
            title={PALETTE_LABELS[p]}
            style={{ background: CHIP_COLORS[p] }}
            onClick={() => setPalette(p)}
          />
        ))}
      </div>
    </div>
  );
}

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "phone":
      return <svg {...p}><path d="M5 4h4l2 5-2.5 2.5a11 11 0 0 0 6 6L17 15l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>;
    case "device":
      return <svg {...p}><rect x={3} y={4} width={18} height={12} rx={2} /><path d="M8 20h8M12 16v4" /></svg>;
    case "call":
      return <svg {...p}><circle cx={12} cy={12} r={9} /><path d="M12 7v5l3 3" /></svg>;
    case "check":
      return <svg {...p}><path d="M5 12l4 4 10-10" /></svg>;
    case "alert":
      return <svg {...p}><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>;
    case "demo":
      return <svg {...p}><circle cx={12} cy={12} r={9} /><path d="M10 9l5 3-5 3z" /></svg>;
    case "edit":
      return <svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
    case "waveform":
      return <svg {...p}><path d="M4 12v0M8 8v8M12 4v16M16 8v8M20 12v0" /></svg>;
    case "voice":
      return <svg {...p}><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /></svg>;
    default:
      return null;
  }
}

export function Card({ children, style = {} }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="card" style={style}>{children}</div>;
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
}) {
  return (
    <button type={type} className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  id?: string;
}) {
  return (
    <input
      id={id}
      className="input"
      value={value}
      type={type}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: string; label: string }> = {
    ready: { cls: "ok", icon: "check", label: "ready" },
    pending: { cls: "warn", icon: "alert", label: "working…" },
    error: { cls: "err", icon: "alert", label: "error" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={s.cls} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
      <Icon name={s.icon} size={14} />
      {s.label}
    </span>
  );
}

export function PhoneDisplay({ number, big }: { number: string; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  const e164 = "+" + number.replace(/[^\d]/g, "").replace(/^\+?/, "");
  async function copy() {
    try {
      await navigator.clipboard.writeText(e164);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <a href={`tel:${e164}`} style={{ fontWeight: 700, fontSize: big ? 18 : 14, color: "var(--accent)", textDecoration: "none", letterSpacing: "0.01em", fontVariantNumeric: "tabular-nums" }}>
        {formatPhoneLocal(number)}
      </a>
      <button type="button" className="btn btn-ghost" onClick={copy} title="Copy number" style={{ padding: "3px 8px", fontSize: 12 }}>
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

function formatPhoneLocal(raw: string) {
  const d = raw.replace(/[^\d]/g, "");
  if (raw.startsWith("+1") && d.length === 11) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}
