ALTER TABLE `calls` ADD `surveyed` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `calls` ADD `survey_rating` integer;
--> statement-breakpoint
ALTER TABLE `settings` ADD `survey_enabled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `settings` ADD `survey_enabled_at` integer;
