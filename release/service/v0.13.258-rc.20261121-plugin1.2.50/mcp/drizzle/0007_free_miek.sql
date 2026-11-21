CREATE TABLE `sb_hardware` (
	`device_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`hardware_id` text NOT NULL,
	`board_boot_id` text NOT NULL,
	`metadata` text NOT NULL,
	`usb_connected` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sb_led_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`session_id` text NOT NULL,
	`hardware_id` text NOT NULL,
	`board_boot_id` text NOT NULL,
	`requested_on` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`state` text NOT NULL,
	`worker_id` text,
	`lease_epoch` integer,
	`control_epoch` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`receipt` text,
	`result_digest` text,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sb_led_idempotency_idx` ON `sb_led_commands` (`owner_id`,`device_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `sb_led_claim_idx` ON `sb_led_commands` (`device_id`,`session_id`,`state`,`expires_at`);--> statement-breakpoint
ALTER TABLE `sb_sessions` ADD `mode` text DEFAULT 'broadcast' NOT NULL;--> statement-breakpoint
ALTER TABLE `sb_sessions` ADD `diagnostic_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sb_sessions` ADD `control_epoch` integer DEFAULT 0 NOT NULL;