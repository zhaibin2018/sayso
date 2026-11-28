CREATE TABLE `sb_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_expires` integer NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	`current_session` text,
	`lease_epoch` integer DEFAULT 0 NOT NULL,
	`worker_id` text,
	`worker_expires` integer DEFAULT 0 NOT NULL,
	`last_seen` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sb_devices_token_hash_unique` ON `sb_devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sb_devices_owner_idx` ON `sb_devices` (`owner_id`);--> statement-breakpoint
CREATE TABLE `sb_frames` (
	`device_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`session_id` text NOT NULL,
	`frame_id` text NOT NULL,
	`frame_seq` integer NOT NULL,
	`lease_epoch` integer NOT NULL,
	`image_key` text NOT NULL,
	`sha256` text NOT NULL,
	`metadata` text NOT NULL,
	`capture_lower` real,
	`received_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sb_manual_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`message` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sb_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`kind` text NOT NULL,
	`frame_id` text,
	`bytes` integer NOT NULL,
	`duration_ms` real NOT NULL,
	`decode_ms` real,
	`store_ms` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sb_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`frame_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sb_pair_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`owner_label` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`request_id` text,
	`device_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sb_pair_codes_code_hash_unique` ON `sb_pair_codes` (`code_hash`);--> statement-breakpoint
CREATE TABLE `sb_clock_probes` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sb_rate_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sb_refreshes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`session_id` text NOT NULL,
	`broadcast_id` text NOT NULL,
	`state` text NOT NULL,
	`worker_id` text,
	`lease_epoch` integer,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`min_seq` integer NOT NULL,
	`min_capture_mono` real NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `sb_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`device_id` text NOT NULL,
	`broadcast_id` text NOT NULL,
	`request_id` text NOT NULL,
	`body_hash` text NOT NULL,
	`state` text NOT NULL,
	`capture_state` text NOT NULL,
	`created_at` integer NOT NULL
);
