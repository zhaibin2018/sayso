CREATE TABLE `sb_pointer_ready` (
	`device_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`session_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`lease_epoch` integer NOT NULL,
	`control_epoch` integer NOT NULL,
	`calibration_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`source_generation` integer NOT NULL,
	`scope_json` text NOT NULL,
	`expires_at` integer NOT NULL
);
