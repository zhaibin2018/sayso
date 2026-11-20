CREATE TABLE `sb_mouse_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`session_id` text NOT NULL,
	`hardware_id` text NOT NULL,
	`board_boot_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`digest` text NOT NULL,
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
CREATE UNIQUE INDEX `sb_mouse_idempotency_idx` ON `sb_mouse_commands` (`owner_id`,`device_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `sb_mouse_claim_idx` ON `sb_mouse_commands` (`device_id`,`session_id`,`state`,`expires_at`);--> statement-breakpoint
ALTER TABLE `sb_sessions` ADD `mouse_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sb_sessions` ADD `mouse_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sb_sessions` ADD `mouse_grant_request` text;