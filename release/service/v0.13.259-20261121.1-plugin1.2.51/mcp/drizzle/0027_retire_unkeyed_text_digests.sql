-- Old plaintext has already been erased: it cannot be re-HMACed safely.
-- Preserve the unique request key as a non-replayable tombstone. Do not compare
-- new requests to legacy SHA digests or execute an old pending text command.
UPDATE sb_mouse_commands
SET state=CASE WHEN state IN ('queued','claimed','executing','embedded')
 THEN CASE WHEN state='executing' OR input_attempted=1 THEN 'outcome_unknown' ELSE 'cancelled' END ELSE state END,
 error=CASE WHEN state IN ('queued','claimed','executing','embedded') THEN 'TEXT_DIGEST_RETIRED' ELSE error END,
 digest='retired-unkeyed-text',
 payload=json_set(json_remove(payload,'$.text'),'$.text_redacted',json('true'))
WHERE kind='keyboard.type_text' AND digest NOT LIKE 'hmac-v1:%';
--> statement-breakpoint
CREATE TRIGGER sb_mouse_text_digest_required
BEFORE INSERT ON sb_mouse_commands
WHEN NEW.kind='keyboard.type_text' AND
 (length(NEW.digest)<>72 OR substr(NEW.digest,1,8)<>'hmac-v1:' OR substr(NEW.digest,9) GLOB '*[^0-9a-f]*')
BEGIN
 SELECT RAISE(ABORT,'TEXT_DIGEST_REQUIRED');
END;
