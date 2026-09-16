import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export * from "./schema";

export function openDatabase(filePath: string): Database.Database {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

export function makeDb(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

export function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id integer PRIMARY KEY NOT NULL,
      agent_id text,
      voice_id text,
      twilio_sid text,
      twilio_token text,
      twilio_phone_number text,
      phone_number_id text,
      updated_at integer NOT NULL,
      survey_enabled integer NOT NULL DEFAULT 0,
      survey_enabled_at integer
    );

    CREATE TABLE IF NOT EXISTS devices (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text NOT NULL,
      model text,
      source_url text,
      kb_document_id text,
      status text NOT NULL DEFAULT 'pending',
      error_msg text,
      created_at integer NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calls (
      id text PRIMARY KEY NOT NULL,
      started_at integer,
      duration_secs integer,
      summary text,
      caller text,
      sentiment text,
      latency_ms integer,
      success text,
      transcript_json text,
      fetched_at integer NOT NULL,
      surveyed integer NOT NULL DEFAULT 0,
      survey_rating integer
    );

    CREATE TABLE IF NOT EXISTS sample_call (
      id integer PRIMARY KEY NOT NULL,
      device text NOT NULL,
      caller_voice_id text,
      coco_voice_id text,
      created_at integer NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sample_turn (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      idx integer NOT NULL,
      speaker text NOT NULL,
      text text NOT NULL,
      audio blob,
      created_at integer NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monitor (
      id integer PRIMARY KEY NOT NULL,
      mode text,
      active integer NOT NULL DEFAULT 0,
      caller text,
      started_at integer,
      turns_json text,
      conversation_id text
    );

    INSERT OR IGNORE INTO settings (id, updated_at, survey_enabled) VALUES (1, 0, 0);
  `);
}
