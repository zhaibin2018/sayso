ALTER TABLE sb_sessions ADD COLUMN last_tool_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sb_mouse_commands ADD COLUMN cancel_requested INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sb_mouse_commands ADD COLUMN cancel_receipt TEXT;
