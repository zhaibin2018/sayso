CREATE TABLE `sb_voice_bench` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`scenario` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`first_response_ms` real,
	`total_ms` real
);
--> statement-breakpoint
CREATE INDEX `sb_voice_bench_owner_time_idx` ON `sb_voice_bench` (`owner_id`,`created_at`);