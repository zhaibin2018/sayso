CREATE TABLE `sb_released_system_search_field_proofs` (
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`command_id` text NOT NULL,
	`frame_id` text NOT NULL,
	`proof` text NOT NULL,
	`expires_at` real NOT NULL,
	PRIMARY KEY(`owner_id`, `device_id`, `command_id`, `frame_id`)
);
--> statement-breakpoint
CREATE INDEX `sb_released_system_search_field_expiry` ON `sb_released_system_search_field_proofs` (`expires_at`);