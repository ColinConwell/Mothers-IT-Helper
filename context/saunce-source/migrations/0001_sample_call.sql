CREATE TABLE `sample_call` (
	`id` integer PRIMARY KEY NOT NULL,
	`device` text NOT NULL,
	`caller_voice_id` text,
	`coco_voice_id` text,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `sample_turn` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idx` integer NOT NULL,
	`speaker` text NOT NULL,
	`text` text NOT NULL,
	`audio` blob,
	`created_at` integer NOT NULL
);

