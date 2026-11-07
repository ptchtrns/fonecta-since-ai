PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_business_source` (
	`entity_id` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`status` text NOT NULL,
	`findings` text NOT NULL,
	`checked_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT `business_source_pk` PRIMARY KEY(`entity_id`, `url`)
);
--> statement-breakpoint
INSERT INTO `__new_business_source`(`entity_id`, `kind`, `url`, `status`, `findings`, `checked_at`, `created_at`, `updated_at`) SELECT `entity_id`, `kind`, `url`, `status`, `findings`, `checked_at`, `created_at`, `updated_at` FROM `business_source`;--> statement-breakpoint
DROP TABLE `business_source`;--> statement-breakpoint
ALTER TABLE `__new_business_source` RENAME TO `business_source`;--> statement-breakpoint
PRAGMA foreign_keys=ON;