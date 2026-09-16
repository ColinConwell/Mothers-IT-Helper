export const PALETTES = ["clay", "forest", "linen", "dusk"] as const;
export type PaletteId = (typeof PALETTES)[number];

export const APPEARANCES = ["system", "light", "dark"] as const;
export type AppearancePref = (typeof APPEARANCES)[number];

export const THEME_TOKEN_KEYS = [
  "--bg",
  "--bg-glow-a",
  "--bg-glow-b",
  "--card",
  "--border",
  "--ink",
  "--muted",
  "--accent",
  "--accent-rgb",
  "--accent-soft",
  "--ok",
  "--warn",
  "--err",
  "--canvas-top",
  "--canvas-bot",
  "--transcript-bg",
  "--tab-rail",
] as const;

export const PALETTE_LABELS: Record<PaletteId, string> = {
  clay: "Clay",
  forest: "Forest",
  linen: "Linen",
  dusk: "Dusk",
};
