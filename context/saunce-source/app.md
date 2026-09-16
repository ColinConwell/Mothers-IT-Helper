---
name: Mother's Little Helper
description: A personalized assistant for family members seeking your IT assistance when they get lost in the latest product sauce.
manifest_version: 1
enabled: true
visibility: private
public_paths:
  - /tools/search-manual
  - /webhooks/sms
triggers:
  schedule:
    cron: "0 * * * *"
    timezone: America/New_York
---

# Mother's Little Helper

Owner-only control panel for a phone-based tech-support assistant aimed at
less tech-savvy family members (parents, grandparents). The assistant itself
runs on ElevenLabs Conversational AI + a Twilio phone number — this app is
the dashboard that configures it.

## How it works

1. **Setup tab** — enter your Twilio Account SID + Auth Token and the Twilio
   phone number you want to use. Click "Create assistant" to spin up an
   ElevenLabs Conversational AI agent with a warm, patient support persona,
   then "Connect phone number" to import that Twilio number into ElevenLabs
   and point it at the agent. Pick a voice from the dropdown (swap in a
   cloned voice later — it'll show up in the list once you clone one in your
   ElevenLabs account).
2. **Devices tab** — add a device (e.g. "Samsung TV", model "QN90A"). The
   backend searches the web for that device's manual, feeds the manual URL
   to ElevenLabs as a knowledge-base document, and attaches it to the agent
   so the assistant can ground its troubleshooting answers. You can also
   paste a manual URL directly if the auto-search picks the wrong page.
3. **Calls tab** — pulls recent call history from ElevenLabs so you can see
   who called and get a quick summary, without digging through the
   ElevenLabs dashboard.

## Bootstrap notes (re-create after a redeploy/share)

- The ElevenLabs agent, its knowledge-base documents, and the imported
  Twilio phone number all live in your ElevenLabs account, not in this app's
  database — a redeploy of this app does NOT recreate them. This app's
  SQLite table just remembers their ids (`agent_id`, `phone_number_id`,
  `voice_id`) and mirrors device/call data for the dashboard.
- If you ever see "no agent configured" after a fresh deploy in a new space,
  re-run Setup — it's idempotent (re-running "Create assistant" updates the
  existing agent instead of creating a duplicate once an `agent_id` is
  stored).
