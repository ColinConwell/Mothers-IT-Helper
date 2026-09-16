# Mother's IT Helper

Owner dashboard for an agentic family tech-support line (powered by ElevenLabs Conversational AI + Twilio), and prize-winning entry in the July 2026 [ElevenLabs x Sauna Hack Night](https://hackersquad.io/builders/dashboard/events/cmrjm6v0v000qn20kyk2j3yfv/builder#tools), hosted by [HackerSquad.io](https://hackersquad.io)

As described in their writeup for the Builders Collective Newsletter (lightly edited by me):

```markdown
Every family has that one person who becomes free tech support the moment something goes wrong — for Colin and his mother, that IT support system is him. Of course, Colin loves his Mom very much, but he loves being her tech support far less. So he built a voice clone of himself she can call instead: an ElevenLabs Instant Voice Clone, reachable through its own Twilio phone line, that searches user manuals via a BraveSearch MCP and calibrates its answers to her specific setup and ability with natural language processing and a Bayesian ideal observer algorithm from cognitive psychology, "built with tender digital love, togetherness, and Finnish hospitality at Sauna AI."
```

You can watch the original hackathon demo at [this YouTube link](https://www.youtube.com/watch?v=6ZpZhqIFQyg&t=145s).

## Run the App

```bash
cp .env.example .env.local   # fill keys
just install                 # npm install + Playwright Chromium
just dev                     # dashboard on 127.0.0.1 (OS-assigned port)
just live                    # same, plus a Cloudflare quick tunnel (PUBLIC_BASE_URL for this process)
just url                     # print the running local URL
```

`just live` installs `cloudflared` via Homebrew if needed (`just live -- --yes` skips the prompt). Quick-tunnel URLs change every session — create/update the assistant on Setup after it starts. If `PUBLIC_BASE_URL` is already a public HTTPS origin in the shell or `.env.local`, `just live` uses that and skips cloudflared.

## Environment

Copy [`.env.example`](.env.example) to `.env.local` (gitignored). Names only:

- `ELEVENLABS_API_KEY` (alias `ELEVEN_LABS_API_KEY`) — assistant, voices, live call, demo TTS
- `BRAVE_SEARCH_API_KEY` — automatic manual search
- `TWILIO_ACCOUNT_SID` — must be `AC…` (Account SID). Put `SK…` API Key SIDs in `TWILIO_API_KEY`, not here
- `TWILIO_AUTH_TOKEN` — required for ElevenLabs phone import
  - (`TWILIO_CLIENT_SECRET` accepted as an alias)
- `TWILIO_API_KEY` + `TWILIO_API_SECRET` — used for Twilio REST Basic auth when both are set
- `TWILIO_PHONE_NUMBER` — optional; can also be pasted or bought in Setup
- `PUBLIC_BASE_URL` — optional stable origin. For local live-phone testing prefer `just live`, which sets this on the process instead of in `.env.local`
- `PORT` — optional. Unset = bind an OS-assigned free port on `127.0.0.1`
- `OPENROUTER_API_KEY` or `OPENAI_API_KEY` — demo/monitor dialogue (otherwise a built-in script is used). Override model with `LLM_MODEL` (default `openai/gpt-5.6-luna` on OpenRouter, `gpt-5.6-luna` on OpenAI)

Railway, Porkbun, Hugging Face, and Cursor keys are unused at runtime.

Setup shows a credential-health card (booleans only).

## Voices

Tab **Voices** (and `just voices-*`): instant clone from audio, Voice Design previews (`eleven_ttv_v3`), save, use for the assistant, delete.

## Themes

Header: System | Dark | Light, plus Clay / Forest / Linen / Dusk palettes. Stored in `localStorage`.

## Tests

```bash
just test          # typecheck + unit/API/stress (mocked vendors)
just test-e2e      # Playwright + screenshots + axe
just test-visual   # screenshot grid
just audit-ui      # screenshots + axe + optional LLM notes in tests/visual/audit-report.md
just test-live     # real ElevenLabs voice list; skips without a key
```
