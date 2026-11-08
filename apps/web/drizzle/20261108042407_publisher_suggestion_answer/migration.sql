CREATE TABLE `publisher_suggestion_answer` (
	`entity_id` text NOT NULL,
	`suggestion_id` text NOT NULL,
	`status` text NOT NULL,
	`field_name` text NOT NULL,
	`suggested_content` text NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT `publisher_suggestion_answer_pk` PRIMARY KEY(`entity_id`, `suggestion_id`)
);
