ALTER TABLE `sb_mouse_commands` ADD `predecessor_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `sb_pointer_successor_idx` ON `sb_mouse_commands` (`owner_id`,`device_id`,`predecessor_id`) WHERE "sb_mouse_commands"."predecessor_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE `sb_pointer_ready` ADD `prefetch_protocol` text;