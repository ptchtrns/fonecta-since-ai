CREATE TABLE `analytics_daily` (
	`entity_id` text NOT NULL,
	`date` text NOT NULL,
	`google_search_queries` integer NOT NULL,
	`google_search_views` integer NOT NULL,
	`google_map_views` integer NOT NULL,
	`google_customer_actions` integer NOT NULL,
	`google_phone_calls` integer NOT NULL,
	`profile_views` integer NOT NULL,
	CONSTRAINT `analytics_daily_pk` PRIMARY KEY(`entity_id`, `date`),
	CONSTRAINT `fk_analytics_daily_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`)
);
--> statement-breakpoint
CREATE TABLE `calendar_special_day` (
	`country` text NOT NULL,
	`date` text NOT NULL,
	`weekday` text NOT NULL,
	`day_key` text NOT NULL,
	`day_class` text NOT NULL,
	`day_type` text NOT NULL,
	`name_local` text NOT NULL,
	`name_en` text NOT NULL,
	`official_public_holiday` integer NOT NULL,
	CONSTRAINT `calendar_special_day_pk` PRIMARY KEY(`country`, `date`)
);
--> statement-breakpoint
CREATE TABLE `category` (
	`id` text PRIMARY KEY,
	`segment` text NOT NULL UNIQUE,
	`name_fi` text NOT NULL,
	`name_sv` text NOT NULL,
	`name_nb` text NOT NULL,
	`name_en` text NOT NULL,
	`archetype` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `city` (
	`name` text PRIMARY KEY,
	`country` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`city_tier` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customer_contact` (
	`entity_id` text PRIMARY KEY,
	`contact_first_name` text NOT NULL,
	`preferred_channel` text NOT NULL,
	`preferred_language` text NOT NULL,
	`email` text NOT NULL,
	`mobile` text NOT NULL,
	`best_contact_window` text NOT NULL,
	`standing_permission_holidays` integer NOT NULL,
	`opted_out_of_suggestions` integer NOT NULL,
	CONSTRAINT `fk_customer_contact_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`)
);
--> statement-breakpoint
CREATE TABLE `dev_label` (
	`entity_id` text NOT NULL,
	`date` text NOT NULL,
	`season` integer NOT NULL,
	`day_key` text NOT NULL,
	`event_id` text,
	`truth_hours` text NOT NULL,
	`displayed_hours_at_snapshot` text NOT NULL,
	`needs_action` integer NOT NULL,
	`expected_action` text NOT NULL,
	`mismatch_type` text,
	`expected_search_views` real NOT NULL,
	CONSTRAINT `dev_label_pk` PRIMARY KEY(`entity_id`, `date`),
	CONSTRAINT `fk_dev_label_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`),
	CONSTRAINT `fk_dev_label_event_id_local_event_id_fk` FOREIGN KEY (`event_id`) REFERENCES `local_event`(`id`)
);
--> statement-breakpoint
CREATE TABLE `dev_regular_hours_truth` (
	`entity_id` text PRIMARY KEY,
	`true_regular_hours_now` text NOT NULL,
	`listing_is_outdated` integer NOT NULL,
	`permanently_closed` integer NOT NULL,
	CONSTRAINT `fk_dev_regular_hours_truth_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`)
);
--> statement-breakpoint
CREATE TABLE `dev_truth_history` (
	`entity_id` text NOT NULL,
	`date` text NOT NULL,
	`day_key` text NOT NULL,
	`event_id` text,
	`truth_hours` text NOT NULL,
	`displayed_hours_that_day` text NOT NULL,
	CONSTRAINT `dev_truth_history_pk` PRIMARY KEY(`entity_id`, `date`),
	CONSTRAINT `fk_dev_truth_history_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`),
	CONSTRAINT `fk_dev_truth_history_event_id_local_event_id_fk` FOREIGN KEY (`event_id`) REFERENCES `local_event`(`id`)
);
--> statement-breakpoint
CREATE TABLE `entity` (
	`id` text PRIMARY KEY,
	`uid` text NOT NULL UNIQUE,
	`account_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`labels` text NOT NULL,
	`country` text NOT NULL,
	`language` text NOT NULL,
	`snapshot_at` text NOT NULL,
	`name` text NOT NULL,
	`address_line1` text NOT NULL,
	`city` text NOT NULL,
	`postal_code` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`main_phone` text NOT NULL,
	`website_url` text NOT NULL,
	`category_id` text NOT NULL,
	`segment` text NOT NULL,
	`timezone` text NOT NULL,
	`hours` text NOT NULL,
	`closed` integer NOT NULL,
	`connect_product` text NOT NULL,
	`connect_customer_since` text NOT NULL,
	`shopping_centre_id` text,
	`entity_role` text,
	`split` text NOT NULL,
	CONSTRAINT `fk_entity_city_city_name_fk` FOREIGN KEY (`city`) REFERENCES `city`(`name`),
	CONSTRAINT `fk_entity_category_id_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`),
	CONSTRAINT `fk_entity_segment_category_segment_fk` FOREIGN KEY (`segment`) REFERENCES `category`(`segment`),
	CONSTRAINT `fk_entity_shopping_centre_id_entity_id_fk` FOREIGN KEY (`shopping_centre_id`) REFERENCES `entity`(`id`)
);
--> statement-breakpoint
CREATE TABLE `evaluation_target` (
	`entity_id` text NOT NULL,
	`date` text NOT NULL,
	`season` integer NOT NULL,
	`day_key` text NOT NULL,
	`day_type` text NOT NULL,
	`event_id` text,
	`country` text NOT NULL,
	`split` text NOT NULL,
	CONSTRAINT `evaluation_target_pk` PRIMARY KEY(`entity_id`, `date`),
	CONSTRAINT `fk_evaluation_target_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`),
	CONSTRAINT `fk_evaluation_target_event_id_local_event_id_fk` FOREIGN KEY (`event_id`) REFERENCES `local_event`(`id`)
);
--> statement-breakpoint
CREATE TABLE `holiday_hours_history` (
	`entity_id` text NOT NULL,
	`date` text NOT NULL,
	`entered_at` text NOT NULL,
	`day_key` text NOT NULL,
	`holiday_hours` text NOT NULL,
	`source` text NOT NULL,
	CONSTRAINT `holiday_hours_history_pk` PRIMARY KEY(`entity_id`, `date`, `entered_at`),
	CONSTRAINT `fk_holiday_hours_history_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`)
);
--> statement-breakpoint
CREATE TABLE `listing` (
	`entity_id` text NOT NULL,
	`publisher_id` text NOT NULL,
	`publisher_name` text NOT NULL,
	`status` text NOT NULL,
	`typical_update_speed_seconds` integer NOT NULL,
	`listing_url` text NOT NULL,
	CONSTRAINT `listing_pk` PRIMARY KEY(`entity_id`, `publisher_id`),
	CONSTRAINT `fk_listing_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`)
);
--> statement-breakpoint
CREATE TABLE `local_event` (
	`id` text PRIMARY KEY,
	`name_fi` text NOT NULL,
	`name_sv` text NOT NULL,
	`name_nb` text NOT NULL,
	`name_en` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`venue_name` text NOT NULL,
	`city` text NOT NULL,
	`country` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`keywords` text NOT NULL,
	`expected_attendance` integer NOT NULL,
	CONSTRAINT `fk_local_event_city_city_name_fk` FOREIGN KEY (`city`) REFERENCES `city`(`name`)
);
--> statement-breakpoint
CREATE TABLE `peer_benchmark` (
	`country` text NOT NULL,
	`city_tier` text NOT NULL,
	`segment` text NOT NULL,
	`day_key` text NOT NULL,
	`n_entity_days` integer NOT NULL,
	`share_no_exception_entered` real NOT NULL,
	`share_entered_closed` real NOT NULL,
	`share_entered_special_hours` real NOT NULL,
	`share_entered_regular` real NOT NULL,
	`closed_share_among_entered` real,
	`median_open_special` text,
	`median_close_special` text,
	CONSTRAINT `peer_benchmark_pk` PRIMARY KEY(`country`, `city_tier`, `segment`, `day_key`),
	CONSTRAINT `fk_peer_benchmark_segment_category_segment_fk` FOREIGN KEY (`segment`) REFERENCES `category`(`segment`)
);
--> statement-breakpoint
CREATE TABLE `pilot_decision` (
	`suggestion_id` text PRIMARY KEY,
	`message_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`date` text NOT NULL,
	`day_key` text NOT NULL,
	`displayed_before` text NOT NULL,
	`suggested_hours` text NOT NULL,
	`basis` text NOT NULL,
	`channel` text NOT NULL,
	`language` text NOT NULL,
	`sent_at` text NOT NULL,
	`decision` text NOT NULL,
	`final_hours` text,
	`decided_at` text,
	`owner_comment` text,
	`standing_permission_granted` integer NOT NULL,
	CONSTRAINT `fk_pilot_decision_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`)
);
--> statement-breakpoint
CREATE TABLE `publisher_suggestion` (
	`id` text PRIMARY KEY,
	`publisher_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`date_created` text NOT NULL,
	`date_resolved` text,
	`field_name` text NOT NULL,
	`status` text NOT NULL,
	`resolved_by` text,
	`original_content` text NOT NULL,
	`suggested_content` text NOT NULL,
	CONSTRAINT `fk_publisher_suggestion_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`)
);
--> statement-breakpoint
CREATE TABLE `regular_hours_history` (
	`entity_id` text NOT NULL,
	`effective_from` text NOT NULL,
	`hours` text NOT NULL,
	CONSTRAINT `regular_hours_history_pk` PRIMARY KEY(`entity_id`, `effective_from`),
	CONSTRAINT `fk_regular_hours_history_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`)
);
--> statement-breakpoint
CREATE TABLE `review` (
	`id` integer PRIMARY KEY,
	`entity_id` text NOT NULL,
	`account_id` text NOT NULL,
	`rating` integer NOT NULL,
	`content` text,
	`author_name` text NOT NULL,
	`url` text,
	`publisher_date` integer NOT NULL,
	`publisher_id` text NOT NULL,
	`last_yext_update_time` integer NOT NULL,
	`status` text NOT NULL,
	`comments` text NOT NULL,
	CONSTRAINT `fk_review_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`)
);
--> statement-breakpoint
CREATE TABLE `school_break` (
	`country` text NOT NULL,
	`school_year_start` integer NOT NULL,
	`break_name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`note` text,
	CONSTRAINT `school_break_pk` PRIMARY KEY(`country`, `school_year_start`, `break_name`)
);
--> statement-breakpoint
CREATE TABLE `sim_persona` (
	`entity_id` text PRIMARY KEY,
	`responsiveness` real NOT NULL,
	`channel` text NOT NULL,
	CONSTRAINT `fk_sim_persona_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`)
);
--> statement-breakpoint
CREATE TABLE `sim_truth` (
	`entity_id` text NOT NULL,
	`date` text NOT NULL,
	`hours` text NOT NULL,
	CONSTRAINT `sim_truth_pk` PRIMARY KEY(`entity_id`, `date`),
	CONSTRAINT `fk_sim_truth_entity_id_entity_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entity`(`id`)
);
--> statement-breakpoint
CREATE TABLE `weather_daily` (
	`city` text NOT NULL,
	`country` text NOT NULL,
	`date` text NOT NULL,
	`tmean_c` real NOT NULL,
	`tmin_c` real NOT NULL,
	`tmax_c` real NOT NULL,
	`precip_mm` real NOT NULL,
	`snow_depth_cm` integer NOT NULL,
	`is_forecast` integer NOT NULL,
	CONSTRAINT `weather_daily_pk` PRIMARY KEY(`city`, `date`),
	CONSTRAINT `fk_weather_daily_city_city_name_fk` FOREIGN KEY (`city`) REFERENCES `city`(`name`)
);
--> statement-breakpoint
CREATE TABLE `weather_normal` (
	`city` text NOT NULL,
	`country` text NOT NULL,
	`month` integer NOT NULL,
	`day` integer NOT NULL,
	`tmean_normal_c` real NOT NULL,
	`p_snow_depth_ge_10cm` real NOT NULL,
	CONSTRAINT `weather_normal_pk` PRIMARY KEY(`city`, `month`, `day`),
	CONSTRAINT `fk_weather_normal_city_city_name_fk` FOREIGN KEY (`city`) REFERENCES `city`(`name`)
);
--> statement-breakpoint
CREATE INDEX `calendar_special_day_date_idx` ON `calendar_special_day` (`date`);--> statement-breakpoint
CREATE INDEX `dev_label_season_idx` ON `dev_label` (`season`);--> statement-breakpoint
CREATE INDEX `entity_country_idx` ON `entity` (`country`);--> statement-breakpoint
CREATE INDEX `entity_city_idx` ON `entity` (`city`);--> statement-breakpoint
CREATE INDEX `entity_segment_idx` ON `entity` (`segment`);--> statement-breakpoint
CREATE INDEX `entity_split_idx` ON `entity` (`split`);--> statement-breakpoint
CREATE INDEX `entity_shopping_centre_idx` ON `entity` (`shopping_centre_id`);--> statement-breakpoint
CREATE INDEX `evaluation_target_season_split_idx` ON `evaluation_target` (`season`,`split`);--> statement-breakpoint
CREATE INDEX `local_event_city_start_idx` ON `local_event` (`city`,`start_time`);--> statement-breakpoint
CREATE INDEX `pilot_decision_entity_idx` ON `pilot_decision` (`entity_id`,`date`);--> statement-breakpoint
CREATE INDEX `pilot_decision_message_idx` ON `pilot_decision` (`message_id`);--> statement-breakpoint
CREATE INDEX `publisher_suggestion_entity_idx` ON `publisher_suggestion` (`entity_id`,`date_created`);--> statement-breakpoint
CREATE INDEX `review_entity_date_idx` ON `review` (`entity_id`,`publisher_date`);