-- Plaintext is not needed to reconcile a terminal result or its idempotency digest.
CREATE TRIGGER sb_mouse_terminal_text_update
AFTER UPDATE OF state,payload ON sb_mouse_commands
WHEN NEW.kind='keyboard.type_text'
 AND NEW.state NOT IN ('queued','claimed','executing','embedded')
 AND json_type(NEW.payload,'$.text') IS NOT NULL
BEGIN
 UPDATE sb_mouse_commands SET payload=json_set(json_remove(payload,'$.text'),'$.text_redacted',json('true')) WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER sb_mouse_terminal_text_insert
AFTER INSERT ON sb_mouse_commands
WHEN NEW.kind='keyboard.type_text'
 AND NEW.state NOT IN ('queued','claimed','executing','embedded')
 AND json_type(NEW.payload,'$.text') IS NOT NULL
BEGIN
 UPDATE sb_mouse_commands SET payload=json_set(json_remove(payload,'$.text'),'$.text_redacted',json('true')) WHERE id=NEW.id;
END;
--> statement-breakpoint
UPDATE sb_mouse_commands SET payload=json_set(json_remove(payload,'$.text'),'$.text_redacted',json('true'))
 WHERE kind='keyboard.type_text' AND state NOT IN ('queued','claimed','executing','embedded') AND json_type(payload,'$.text') IS NOT NULL;
