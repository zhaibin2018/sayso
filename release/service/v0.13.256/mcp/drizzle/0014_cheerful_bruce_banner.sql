CREATE TABLE `sb_browse_images` (
	`run_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`session_id` text NOT NULL,
	`step_id` text NOT NULL,
	`frame_id` text NOT NULL,
	`checkpoint_seq` integer NOT NULL,
	`image_key` text NOT NULL,
	`sha256` text NOT NULL,
	`image_digest` text NOT NULL,
	`metadata` text NOT NULL,
	`capture_lower` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sb_browse_image_expiry` ON `sb_browse_images` (`expires_at`);