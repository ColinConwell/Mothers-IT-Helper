import { sqliteTable, integer, text, blob } from "drizzle-orm/sqlite-core";

// Single-row table (id is always 1) holding the ElevenLabs agent + Twilio
// phone configuration. Twilio credentials are entered once via the admin
// Setup tab and forwarded to ElevenLabs' phone-number-import endpoint —
// this app never calls the Twilio API directly.
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  agentId: text("agent_id"),
  voiceId: text("voice_id"),
  twilioSid: text("twilio_sid"),
  twilioToken: text("twilio_token"),
  twilioPhoneNumber: text("twilio_phone_number"),
  phoneNumberId: text("phone_number_id"),
  updatedAt: integer("updated_at").notNull(),
  surveyEnabled: integer("survey_enabled").notNull().default(0),
  surveyEnabledAt: integer("survey_enabled_at"),
});

export const devices = sqliteTable("devices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  model: text("model"),
  sourceUrl: text("source_url"),
  kbDocumentId: text("kb_document_id"),
  status: text("status").notNull().default("pending"),
  errorMsg: text("error_msg"),
  createdAt: integer("created_at").notNull(),
});

export const calls = sqliteTable("calls", {
  id: text("id").primaryKey(),
  startedAt: integer("started_at"),
  durationSecs: integer("duration_secs"),
  summary: text("summary"),
  caller: text("caller"),
  sentiment: text("sentiment"),
  latencyMs: integer("latency_ms"),
  success: text("success"),
  transcriptJson: text("transcript_json"),
  fetchedAt: integer("fetched_at").notNull(),
  surveyed: integer("surveyed").notNull().default(0),
  surveyRating: integer("survey_rating"),
});

// A simulated demo call between a "caller" agent (a confused family member)
// and the Coco Co-Clone tech assistant, rendered turn-by-turn to audio.
// Single latest sample lives at id = 1.
export const sampleCall = sqliteTable("sample_call", {
  id: integer("id").primaryKey(),
  device: text("device").notNull(),
  callerVoiceId: text("caller_voice_id"),
  cocoVoiceId: text("coco_voice_id"),
  createdAt: integer("created_at").notNull(),
});

export const sampleTurn = sqliteTable("sample_turn", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  idx: integer("idx").notNull(),
  speaker: text("speaker").notNull(), // 'caller' | 'coco'
  text: text("text").notNull(),
  audio: blob("audio"),
  createdAt: integer("created_at").notNull(),
});

// Single-row (id = 1) state for the live call monitor. For a simulated call we
// store the scripted turns + start time and reveal them by elapsed wall-clock;
// for a real call we track the ElevenLabs conversation id.
export const monitor = sqliteTable("monitor", {
  id: integer("id").primaryKey(),
  mode: text("mode"), // 'sim' | 'live' | null
  active: integer("active").notNull().default(0),
  caller: text("caller"),
  startedAt: integer("started_at"),
  turnsJson: text("turns_json"),
  conversationId: text("conversation_id"),
});