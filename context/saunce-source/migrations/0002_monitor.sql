CREATE TABLE `monitor` (
	`id` integer PRIMARY KEY NOT NULL,
	`mode` text,
	`active` integer DEFAULT 0 NOT NULL,
	`caller` text,
	`started_at` integer,
	`turns_json` text,
	`conversation_id` text
);

