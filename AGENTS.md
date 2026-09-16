# AGENTS.md for Mother's IT Helper

Owner dashboard for a family phone-based tech helper. `context/Source/` is the untouched Sauna snapshot. The runnable local app lives at the repo root.

## Directory structure

```
.
├── JUSTFile                  # just install | dev | live | url | test | voices-* | audit-ui
├── package.json
├── index.html                # Vite entry
├── public/favicon.png
├── .env.example              # committed names-only template
├── .env.local                # gitignored secrets
├── data/app.sqlite           # local DB (gitignored)
├── data/runtime.json         # bound local URL + pid while the server is up (gitignored)

├── context/Source/           # original Sauna package — do not edit
│   ├── app.md
│   ├── src/{handler,client,db,schema}.ts
│   └── migrations/
├── src/
│   ├── shared/               # phone, persona, theme ids
│   ├── db/                   # Drizzle schema + better-sqlite3
│   ├── server/               # Hono API, vendor clients, mocks, Node entry
│   └── client/               # React UI + CSS variable palettes
├── scripts/                  # dev/live supervisor, app-url, survey-once, voices CLI, test-live, audit-ui
└── tests/
    ├── unit/
    ├── api/
    ├── stress/
    ├── e2e/                  # Playwright + visual snapshots
    └── visual/               # LLM audit report (generated)
```

## Runtime substitutions (vs Sauna)

- SQLite: `better-sqlite3` at `data/app.sqlite` (`SQLITE_PATH` or `:memory:` when `MOCK_EXTERNAL=1`)
- ElevenLabs: `xi-api-key` from `ELEVENLABS_API_KEY` (Sauna used a Bearer placeholder)
- Brave: `X-Subscription-Token`
- Twilio: REST URL uses the Account SID (`AC…`). HTTP Basic is `TWILIO_API_KEY:TWILIO_API_SECRET` when both are set, otherwise `sid:auth-token`. ElevenLabs phone import still needs the account Auth Token.
- Demo dialogue: AI SDK against OpenRouter/OpenAI (`gpt-5.6-luna`); fallback script if no key or `MOCK_EXTERNAL=1`
- Hourly SMS surveys: `setInterval` in `src/server/index.ts`; `POST /api/survey/run` or `just survey-once`
- Public origin: `PUBLIC_BASE_URL` (from the process env / `.env.local`). `just live` injects a Cloudflare quick-tunnel URL for that process. ElevenLabs cannot hit `127.0.0.1`
- Listen: `127.0.0.1`. `PORT` if set, otherwise OS-assigned (`listen(0)`). Bound URL is written to `data/runtime.json`

Single process: Hono handles `/api`, `/tools`, `/webhooks`; Vite middleware serves the SPA in dev. `just dev` / `just live` run `scripts/dev.ts`, which spawns `src/server/index.ts`.

## Credential gotchas

- Twilio Account SID must start with `AC`. A value starting with `SK` is an API key SID; put it in `TWILIO_API_KEY` instead. Setup/health will flag an SK in `TWILIO_ACCOUNT_SID`.
- REST auth prefers `TWILIO_API_KEY` + `TWILIO_API_SECRET`; `TWILIO_CLIENT_SECRET` is accepted as an alias for `TWILIO_AUTH_TOKEN`.
- Live phone tools: `just live` (or a stable `PUBLIC_BASE_URL`).
- Voice clone/design spends ElevenLabs credits; default tests mock all vendors.

## Tests

Vendors are mocked (`createMockFetch`, `MOCK_EXTERNAL=1`). Playwright walks every tab, runs axe (fail on serious+), and screenshots each tab × palette × light/dark. `just audit-ui` writes advisory LLM notes when a vision-capable key exists.

## UI notes

Tabs: Setup, Devices, Prompt, Voices, Live call, Monitor, Demo call, History. Themes use `data-palette` + `data-appearance` on `:root`. Live call still loads `@elevenlabs/client` from esm.sh.
