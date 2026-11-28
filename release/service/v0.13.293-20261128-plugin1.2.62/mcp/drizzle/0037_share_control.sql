-- Pin each broadcast to the protocol negotiated at creation. Old Worker binaries
-- still see zero deadlines after migration and during a read-only rollback.
CREATE TABLE sb_share_control (
  owner_id TEXT NOT NULL, device_id TEXT NOT NULL, broadcast_id TEXT NOT NULL,
  control_protocol TEXT NOT NULL DEFAULT 'legacy',
  automatic INTEGER NOT NULL DEFAULT 0, stopped INTEGER NOT NULL DEFAULT 0,
  intent_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(owner_id,device_id,broadcast_id)
);
--> statement-breakpoint
ALTER TABLE sb_sessions ADD COLUMN input_end INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sb_sessions ADD COLUMN grant_source TEXT;
--> statement-breakpoint
ALTER TABLE sb_sessions ADD COLUMN idle_seconds INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sb_sessions ADD COLUMN ui_generation TEXT;
--> statement-breakpoint
ALTER TABLE sb_sessions ADD COLUMN ui_blocked INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE sb_sessions ADD COLUMN control_protocol TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
INSERT OR IGNORE INTO sb_share_control(owner_id,device_id,broadcast_id,stopped)
 SELECT owner_id,device_id,broadcast_id,mouse_grant_request IS '00000000-0000-4000-8000-000000000000'
 FROM sb_sessions WHERE mode='broadcast' ORDER BY created_at DESC, rowid DESC;
--> statement-breakpoint
UPDATE sb_sessions SET input_end=CASE WHEN mouse_enabled=1 THEN mouse_until ELSE 0 END,mouse_until=0
 WHERE mode='broadcast';
--> statement-breakpoint
CREATE TRIGGER sb_no_legacy_grant BEFORE UPDATE OF mouse_until ON sb_sessions WHEN NEW.mouse_until<>0
 BEGIN SELECT RAISE(ABORT,'SHARE_CONTROL_UPGRADE_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_share_device_deleted AFTER DELETE ON sb_devices BEGIN
 DELETE FROM sb_share_control WHERE owner_id=OLD.owner_id AND device_id=OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER sb_control_scope_change AFTER UPDATE OF worker_id,lease_epoch,current_session,revoked,worker_expires ON sb_devices
 WHEN OLD.current_session IS NOT NULL BEGIN
 UPDATE sb_sessions SET mouse_enabled=0,input_end=0,control_epoch=control_epoch+1
 WHERE id=OLD.current_session AND mouse_enabled=1 AND (OLD.worker_id IS NOT NEW.worker_id OR OLD.lease_epoch<>NEW.lease_epoch
 OR OLD.current_session IS NOT NEW.current_session OR NEW.revoked<>0 OR OLD.worker_expires<=NEW.last_seen OR NEW.worker_expires<=NEW.last_seen);
 UPDATE sb_sessions SET input_end=CASE WHEN idle_seconds>0 THEN min(NEW.worker_expires,max(created_at,last_tool_at)+idle_seconds*1000)
 ELSE NEW.worker_expires END WHERE id=NEW.current_session AND control_protocol='share.v1' AND mouse_enabled=1 AND ui_blocked=0;
END;
--> statement-breakpoint
CREATE TRIGGER sb_control_board_change AFTER UPDATE ON sb_hardware
 WHEN NEW.usb_connected=0 OR OLD.hardware_id IS NOT NEW.hardware_id OR OLD.board_boot_id IS NOT NEW.board_boot_id BEGIN
 UPDATE sb_sessions SET mouse_enabled=0,input_end=0,control_epoch=control_epoch+1
 WHERE device_id=OLD.device_id AND owner_id=OLD.owner_id AND state='active' AND mouse_enabled=1;
END;
--> statement-breakpoint
CREATE TRIGGER sb_control_invalidated AFTER UPDATE OF control_epoch ON sb_sessions WHEN OLD.control_epoch<>NEW.control_epoch BEGIN
 UPDATE sb_mouse_commands SET state=CASE WHEN state='executing' OR input_attempted=1 THEN 'outcome_unknown' ELSE 'cancelled' END,
 input_attempted=CASE WHEN state IN ('queued','embedded') AND input_attempted IS NOT 1 THEN 0 ELSE input_attempted END,
 error='EXPIRED_OR_CONTROL_CHANGED' WHERE session_id=OLD.id AND control_epoch=OLD.control_epoch AND state IN ('queued','claimed','executing','embedded');
 UPDATE sb_browse_runs SET state=CASE WHEN lease_seq>0 THEN 'outcome_unknown' ELSE 'cancelled' END,revision=revision+1,error='CONTROL_CHANGED'
 WHERE session_id=OLD.id AND control_epoch=OLD.control_epoch AND state='active';
END;
--> statement-breakpoint
UPDATE sb_erasure_jobs SET phase=phase+1 WHERE phase>=27;
--> statement-breakpoint
CREATE TRIGGER sb_expired_idle_activity BEFORE UPDATE OF last_tool_at ON sb_sessions
 WHEN OLD.idle_seconds>0 AND NEW.last_tool_at>=max(OLD.created_at,OLD.last_tool_at)+OLD.idle_seconds*1000
 BEGIN SELECT RAISE(IGNORE); END;

--> statement-breakpoint
CREATE TRIGGER sb_control_board_deleted AFTER DELETE ON sb_hardware BEGIN
 UPDATE sb_sessions SET mouse_enabled=0,input_end=0,control_epoch=control_epoch+1
 WHERE owner_id=OLD.owner_id AND device_id=OLD.device_id AND state='active' AND mouse_enabled=1;
END;
--> statement-breakpoint
CREATE TRIGGER sb_control_capture_ended AFTER UPDATE OF state,capture_state ON sb_sessions
 WHEN NEW.mouse_enabled=1 AND (NEW.state<>'active' OR NEW.capture_state<>'active') BEGIN
 UPDATE sb_sessions SET mouse_enabled=0,input_end=0,control_epoch=control_epoch+1 WHERE id=NEW.id;
END;
