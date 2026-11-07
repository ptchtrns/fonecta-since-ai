-- The owner's choices move to the customer record, which becomes the one place for contact preferences.
-- Businesses without a record (from Yext) get one first, so no choice is lost.
INSERT INTO `customer_contact` (`entity_id`, `contact_first_name`, `preferred_channel`, `preferred_language`, `email`, `mobile`, `best_contact_window`, `standing_permission_holidays`, `opted_out_of_suggestions`)
SELECT p.`entity_id`, '', 'WHATSAPP', p.`whatsapp_language`, '', '', '', p.`standing_permission`, p.`opted_out`
FROM `business_profile` p
WHERE EXISTS (SELECT 1 FROM `entity` e WHERE e.`id` = p.`entity_id`)
  AND NOT EXISTS (SELECT 1 FROM `customer_contact` c WHERE c.`entity_id` = p.`entity_id`);--> statement-breakpoint
UPDATE `customer_contact` SET
  `preferred_language` = (SELECT p.`whatsapp_language` FROM `business_profile` p WHERE p.`entity_id` = `customer_contact`.`entity_id`),
  `standing_permission_holidays` = (SELECT p.`standing_permission` FROM `business_profile` p WHERE p.`entity_id` = `customer_contact`.`entity_id`),
  `opted_out_of_suggestions` = (SELECT p.`opted_out` FROM `business_profile` p WHERE p.`entity_id` = `customer_contact`.`entity_id`)
WHERE EXISTS (SELECT 1 FROM `business_profile` p WHERE p.`entity_id` = `customer_contact`.`entity_id`);--> statement-breakpoint
ALTER TABLE `business_profile` DROP COLUMN `whatsapp_language`;--> statement-breakpoint
ALTER TABLE `business_profile` DROP COLUMN `standing_permission`;--> statement-breakpoint
ALTER TABLE `business_profile` DROP COLUMN `opted_out`;
