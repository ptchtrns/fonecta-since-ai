CREATE TABLE `copilot_audit` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`conversation_id` text,
	`preview_id` text,
	`event` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `copilot_conversation` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`summary_through` integer DEFAULT 0 NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL,
	`last_message_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT `fk_copilot_conversation_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `copilot_message` (
	`id` text PRIMARY KEY,
	`conversation_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'complete' NOT NULL,
	`client_message_id` text,
	`route` text,
	`provider` text,
	`model` text,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`latency_ms` integer,
	`context_version` text,
	`context_hash` text,
	`error_code` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT `fk_copilot_message_conversation_id_copilot_conversation_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `copilot_conversation`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `copilot_preview` (
	`id` text PRIMARY KEY,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload` text NOT NULL,
	`diff` text NOT NULL,
	`effects` text NOT NULL,
	`base_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`idempotency_key` text,
	`confirmed_at` integer,
	`committed_at` integer,
	`result_message` text,
	`error_code` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT `fk_copilot_preview_conversation_id_copilot_conversation_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `copilot_conversation`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_copilot_preview_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `copilot_tool_call` (
	`id` text PRIMARY KEY,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`tool` text NOT NULL,
	`arguments` text NOT NULL,
	`status` text NOT NULL,
	`result_summary` text DEFAULT '' NOT NULL,
	`error_code` text,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT `fk_copilot_tool_call_conversation_id_copilot_conversation_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `copilot_conversation`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `copilot_audit_entity_idx` ON `copilot_audit` (`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `copilot_audit_user_idx` ON `copilot_audit` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `copilot_conversation_owner_idx` ON `copilot_conversation` (`user_id`,`entity_id`,`last_message_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `copilot_message_seq_idx` ON `copilot_message` (`conversation_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `copilot_message_client_idx` ON `copilot_message` (`conversation_id`,`client_message_id`);--> statement-breakpoint
CREATE INDEX `copilot_preview_conversation_idx` ON `copilot_preview` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `copilot_preview_entity_status_idx` ON `copilot_preview` (`entity_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `copilot_preview_idempotency_idx` ON `copilot_preview` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `copilot_tool_call_message_idx` ON `copilot_tool_call` (`message_id`);