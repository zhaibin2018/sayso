CREATE TABLE sb_pairing_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  owner_label TEXT NOT NULL,
  public_key TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  issued_at INTEGER,
  code_hash TEXT UNIQUE,
  gate_hash TEXT,
  used_at INTEGER,
  device_id TEXT UNIQUE
);
--> statement-breakpoint
ALTER TABLE sb_devices ADD COLUMN pairing_gate_hash TEXT;
