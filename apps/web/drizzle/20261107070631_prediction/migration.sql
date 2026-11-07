CREATE TABLE `prediction` (
	`entity_id` text NOT NULL,
	`date` text NOT NULL,
	`day_key` text NOT NULL,
	`action` text NOT NULL,
	`shown_hours` text NOT NULL,
	`hours` text,
	`confidence` real,
	`reasons` text NOT NULL,
	CONSTRAINT `prediction_pk` PRIMARY KEY(`entity_id`, `date`),
	CONSTRAINT `fk_prediction_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`) ON DELETE CASCADE
);
