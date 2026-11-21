ALTER TABLE `sb_devices` ADD `heartbeat_seq` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sb_devices` ADD `heartbeat_write_token` text;--> statement-breakpoint
ALTER TABLE `sb_frames` ADD `repeat_presented_at` real;--> statement-breakpoint
ALTER TABLE `sb_frames` ADD `repeat_received_at` integer;--> statement-breakpoint
ALTER TABLE `sb_frames` ADD `repeat_phone_mono_ms` real;--> statement-breakpoint
ALTER TABLE `sb_frames` ADD `repeat_sequence` integer DEFAULT 0 NOT NULL;