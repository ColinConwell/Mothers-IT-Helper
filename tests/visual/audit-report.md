# UI visual audit

Generated from Playwright (`just test-e2e` / `just audit-ui`).

- Tabs covered: Setup, Devices, Prompt, Voices, Live call, Monitor, Demo call, History
- Palettes: Clay, Forest, Linen, Dusk
- Appearances: Light, Dark
- Accessibility: axe wcag2a/wcag2aa with **no serious or critical** violations on every tab (mocked dashboard)
- Screenshot grid: `tests/e2e/visual.spec.ts-snapshots/` (64 images). Waveform canvases are masked because they animate.
- LLM notes below are optional; re-run `just audit-ui` with `OPENROUTER_API_KEY` or `OPENAI_API_KEY` to fill them in.

LLM visual notes skipped in the checked-in copy so a cold clone does not spend vision tokens. Run `just audit-ui` locally to append per-screenshot notes.
