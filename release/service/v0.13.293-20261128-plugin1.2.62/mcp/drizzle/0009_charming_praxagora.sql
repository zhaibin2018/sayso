CREATE TABLE `sb_screen_texts` (
	`device_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`session_id` text NOT NULL,
	`frame_id` text NOT NULL,
	`frame_seq` integer NOT NULL,
	`lease_epoch` integer NOT NULL,
	`capture_mono` real NOT NULL,
	`orientation_epoch` integer NOT NULL,
	`metadata` text NOT NULL,
	`payload` text NOT NULL,
	`capture_lower` real,
	`received_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
