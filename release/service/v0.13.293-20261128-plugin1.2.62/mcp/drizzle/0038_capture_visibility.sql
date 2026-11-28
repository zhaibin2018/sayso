ALTER TABLE sb_sessions ADD COLUMN capture_generation TEXT;
--> statement-breakpoint
ALTER TABLE sb_sessions ADD COLUMN capture_hidden INTEGER;
--> statement-breakpoint
CREATE TRIGGER sb_capture_visibility_changed AFTER UPDATE OF capture_generation,capture_hidden ON sb_sessions
 WHEN OLD.capture_generation IS NOT NEW.capture_generation OR OLD.capture_hidden IS NOT NEW.capture_hidden BEGIN
 DELETE FROM sb_frames WHERE device_id=NEW.device_id AND owner_id=NEW.owner_id AND session_id=NEW.id;
 DELETE FROM sb_screen_texts WHERE device_id=NEW.device_id AND owner_id=NEW.owner_id AND session_id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER sb_frames_visibility_insert BEFORE INSERT ON sb_frames
 WHEN EXISTS(SELECT 1 FROM sb_sessions s WHERE s.id=NEW.session_id AND
 (s.capture_hidden<>0 OR s.capture_generation IS NOT (CASE WHEN json_valid(NEW.metadata) THEN json_extract(NEW.metadata,'$.capture_visibility_generation') END)))
 BEGIN SELECT RAISE(ABORT,'STALE_CAPTURE_GENERATION'); END;
--> statement-breakpoint
CREATE TRIGGER sb_frames_visibility_update BEFORE UPDATE OF metadata ON sb_frames
 WHEN EXISTS(SELECT 1 FROM sb_sessions s WHERE s.id=NEW.session_id AND
 (s.capture_hidden<>0 OR s.capture_generation IS NOT (CASE WHEN json_valid(NEW.metadata) THEN json_extract(NEW.metadata,'$.capture_visibility_generation') END)))
 BEGIN SELECT RAISE(ABORT,'STALE_CAPTURE_GENERATION'); END;
--> statement-breakpoint
CREATE TRIGGER sb_screen_texts_visibility_insert BEFORE INSERT ON sb_screen_texts
 WHEN EXISTS(SELECT 1 FROM sb_sessions s WHERE s.id=NEW.session_id AND
 (s.capture_hidden<>0 OR s.capture_generation IS NOT (CASE WHEN json_valid(NEW.metadata) THEN json_extract(NEW.metadata,'$.capture_visibility_generation') END)))
 BEGIN SELECT RAISE(ABORT,'STALE_CAPTURE_GENERATION'); END;
--> statement-breakpoint
CREATE TRIGGER sb_screen_texts_visibility_update BEFORE UPDATE OF metadata ON sb_screen_texts
 WHEN EXISTS(SELECT 1 FROM sb_sessions s WHERE s.id=NEW.session_id AND
 (s.capture_hidden<>0 OR s.capture_generation IS NOT (CASE WHEN json_valid(NEW.metadata) THEN json_extract(NEW.metadata,'$.capture_visibility_generation') END)))
 BEGIN SELECT RAISE(ABORT,'STALE_CAPTURE_GENERATION'); END;
