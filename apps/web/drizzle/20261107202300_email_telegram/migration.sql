ALTER TABLE `business_profile` ADD `email_address` text;--> statement-breakpoint
ALTER TABLE `business_profile` ADD `email_on` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `business_profile` ADD `telegram_chat_id` text;--> statement-breakpoint
ALTER TABLE `business_profile` ADD `telegram_name` text;--> statement-breakpoint
ALTER TABLE `business_profile` ADD `telegram_link_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `business_profile_telegram_link_idx` ON `business_profile` (`telegram_link_token`);