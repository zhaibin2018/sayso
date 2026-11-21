CREATE TABLE `sb_mouse_point_ready` (
	`device_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`session_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`lease_epoch` integer NOT NULL,
	`control_epoch` integer NOT NULL,
	`protocol` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sb_mouse_commands` ADD `input_attempted` integer;