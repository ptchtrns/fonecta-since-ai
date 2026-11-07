CREATE TABLE `business_profile` (
	`entity_id` text PRIMARY KEY,
	`edits` text NOT NULL,
	`whatsapp_phone` text,
	`whatsapp_language` text DEFAULT 'en' NOT NULL,
	`whatsapp_on` integer DEFAULT false NOT NULL,
	`standing_permission` integer DEFAULT false NOT NULL,
	`last_inbound_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `business_source` (
	`entity_id` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`status` text NOT NULL,
	`findings` text NOT NULL,
	`checked_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT `business_source_pk` PRIMARY KEY(`entity_id`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `suggestion_state` (
	`entity_id` text NOT NULL,
	`suggestion_key` text NOT NULL,
	`token` text NOT NULL UNIQUE,
	`status` text DEFAULT 'pending' NOT NULL,
	`hours` text,
	`via` text,
	`snapshot` text NOT NULL,
	`sent_at` integer,
	`decided_at` integer,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT `suggestion_state_pk` PRIMARY KEY(`entity_id`, `suggestion_key`)
);
--> statement-breakpoint
ALTER TABLE `user` ADD `entity_id` text;