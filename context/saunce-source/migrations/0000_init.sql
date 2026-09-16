CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer,
	`duration_secs` integer,
	`summary` text,
	`transcript_json` text,
	`fetched_at` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`model` text,
	`source_url` text,
	`kb_document_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_msg` text,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`agent_id` text,
	`voice_id` text,
	`twilio_sid` text,
	`twilio_token` text,
	`twilio_phone_number` text,
	`phone_number_id` text,
	`updated_at` integer NOT NULL
);

