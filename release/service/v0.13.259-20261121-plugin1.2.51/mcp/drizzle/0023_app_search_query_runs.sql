CREATE TABLE `sb_app_search_queries` (
	`id` text NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	`reason` text,
	PRIMARY KEY(`owner_id`, `id`)
);
