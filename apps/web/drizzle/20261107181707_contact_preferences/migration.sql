CREATE TABLE `outbox` (
	`id` text PRIMARY KEY,
	`entity_id` text NOT NULL,
	`channel` text NOT NULL,
	`recipient` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `business_profile` ADD `opted_out` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `outbox_entity_idx` ON `outbox` (`entity_id`,`created_at`);