ALTER TABLE `sb_devices` ADD `blocked_broadcast` text;--> statement-breakpoint
CREATE UNIQUE INDEX `sb_sessions_request_idx` ON `sb_sessions` (`device_id`,`request_id`);