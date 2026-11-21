CREATE TABLE `sb_browse_calibrations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`request_id` text NOT NULL,
	`digest` text NOT NULL,
	`hardware_id` text NOT NULL,
	`board_boot_id` text NOT NULL,
	`descriptor` text NOT NULL,
	`settings_hash` text NOT NULL,
	`orientation_epoch` integer NOT NULL,
	`source_width` integer NOT NULL,
	`source_height` integer NOT NULL,
	`proof` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sb_browse_calibration_request` ON `sb_browse_calibrations` (`device_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `sb_browse_journal` (
	`step_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`step_index` integer NOT NULL,
	`input_digest` text NOT NULL,
	`observation_digest` text NOT NULL,
	`evidence` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sb_browse_journal_run` ON `sb_browse_journal` (`run_id`,`step_index`);--> statement-breakpoint
CREATE TABLE `sb_browse_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`seq` integer NOT NULL,
	`request_id` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sb_browse_lease_seq` ON `sb_browse_leases` (`run_id`,`seq`);--> statement-breakpoint
CREATE TABLE `sb_browse_ready` (
	`device_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`session_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`lease_epoch` integer NOT NULL,
	`control_epoch` integer NOT NULL,
	`protocol` text NOT NULL,
	`calibration_id` text NOT NULL,
	`settings_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sb_browse_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`intent_key` text NOT NULL,
	`intent_digest` text NOT NULL,
	`session_id` text NOT NULL,
	`broadcast_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`lease_epoch` integer NOT NULL,
	`control_epoch` integer NOT NULL,
	`hardware_id` text NOT NULL,
	`board_boot_id` text NOT NULL,
	`hardware_metadata` text NOT NULL,
	`calibration_id` text NOT NULL,
	`settings_hash` text NOT NULL,
	`orientation_epoch` integer NOT NULL,
	`state` text NOT NULL,
	`queue_json` text NOT NULL,
	`plan_keys_json` text NOT NULL,
	`tail_step_id` text,
	`next_index` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`lease_seq` integer DEFAULT 0 NOT NULL,
	`lease_request_id` text,
	`last_lease_id` text,
	`input_json` text,
	`checkpoint_seq` integer DEFAULT 0 NOT NULL,
	`checkpoint_json` text,
	`error` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`head_expires_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sb_browse_run_intent` ON `sb_browse_runs` (`owner_id`,`device_id`,`intent_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `sb_browse_run_active_device` ON `sb_browse_runs` (`device_id`) WHERE "sb_browse_runs"."state" = 'active';