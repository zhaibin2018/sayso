CREATE TABLE `sb_timing_journal` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `record_key` text NOT NULL UNIQUE,
  `received_utc_ms` integer NOT NULL,
  `data_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sb_timing_journal_received` ON `sb_timing_journal` (`received_utc_ms`);
