-- Preserve existing five-minute L06 records; install-created timestamps are immutable.
ALTER TABLE sb_pairing_requests ADD COLUMN created_at INTEGER;
--> statement-breakpoint
ALTER TABLE sb_pairing_requests ADD COLUMN code_expires_at INTEGER;
