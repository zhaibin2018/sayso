-- NULL preserves the original protocol for existing private test phones.
-- Selection is immutable for the entire session, including lease replacement.
ALTER TABLE sb_sessions ADD COLUMN event_clock TEXT;
ALTER TABLE sb_mouse_commands ADD COLUMN event_clock TEXT;

ALTER TABLE sb_clock_probes ADD COLUMN event_clock TEXT;
