-- No content, credentials, user-supplied error messages or target parameters in execution records.
CREATE TABLE sb_maintenance_state (
 id INTEGER PRIMARY KEY CHECK(id=1), due_at INTEGER NOT NULL DEFAULT 0,
 lock_token TEXT, lock_until INTEGER NOT NULL DEFAULT 0,
 prefix TEXT NOT NULL DEFAULT 'screens/', cursor TEXT,
 last_success_at INTEGER, last_attempt_at INTEGER, failures INTEGER NOT NULL DEFAULT 0,
 backlog INTEGER NOT NULL DEFAULT 0, overloaded INTEGER NOT NULL DEFAULT 0
);
INSERT INTO sb_maintenance_state(id) VALUES(1);
CREATE TABLE sb_maintenance_runs (
 id TEXT PRIMARY KEY, source TEXT NOT NULL CHECK(source IN ('owner','request','legacy')),
 started_at INTEGER NOT NULL, finished_at INTEGER,
 state TEXT NOT NULL CHECK(state IN ('running','success','partial','failed')),
 d1_changes INTEGER NOT NULL DEFAULT 0, deleted_objects INTEGER NOT NULL DEFAULT 0,
 backlog INTEGER NOT NULL DEFAULT 0, backlog_capped INTEGER NOT NULL DEFAULT 0,
 error TEXT
);
CREATE INDEX sb_maintenance_run_time ON sb_maintenance_runs(started_at);
-- Preserve an opaque key retirement fence after a successful GC delete. A late
-- retry of an older DELETE can never race a new PUT of the same retired key.
CREATE TRIGGER sb_storage_retired BEFORE INSERT ON sb_storage_writes
 WHEN NEW.is_gc=0 AND EXISTS(SELECT 1 FROM sb_storage_writes WHERE image_key=NEW.image_key AND is_gc=2)
 BEGIN SELECT RAISE(ABORT,'STORAGE_KEY_RETIRED'); END;
-- Acknowledgement is an immediate content lifecycle, independent of maintenance.
CREATE TRIGGER sb_manual_terminal AFTER UPDATE OF state ON sb_manual_requests
 WHEN NEW.state IN ('ready','declined') AND NEW.message<>''
 BEGIN UPDATE sb_manual_requests SET message='' WHERE id=NEW.id; END;
UPDATE sb_manual_requests SET message='' WHERE state IN ('ready','declined');

CREATE INDEX sb_mouse_replay_key_version ON sb_mouse_commands(replay_key_version);
CREATE INDEX sb_led_replay_key_version ON sb_led_commands(replay_key_version);

CREATE TRIGGER sb_mouse_replay_key_insert AFTER INSERT ON sb_mouse_commands
 WHEN substr(NEW.idempotency_key,1,4)='rk1:' AND length(NEW.idempotency_key)=68
 BEGIN UPDATE sb_mouse_commands SET replay_key_version=1 WHERE id=NEW.id; END;
CREATE TRIGGER sb_led_replay_key_insert AFTER INSERT ON sb_led_commands
 WHEN substr(NEW.idempotency_key,1,4)='rk1:' AND length(NEW.idempotency_key)=68
 BEGIN UPDATE sb_led_commands SET replay_key_version=1 WHERE id=NEW.id; END;

-- Refuse late D1 publication after orphan GC has acquired/retired this key.
CREATE TRIGGER sb_frame_gc_insert BEFORE INSERT ON sb_frames
 WHEN EXISTS(SELECT 1 FROM sb_storage_writes WHERE image_key=NEW.image_key AND is_gc>0)
 BEGIN SELECT RAISE(ABORT,'STORAGE_KEY_RETIRED'); END;
CREATE TRIGGER sb_browse_image_gc_insert BEFORE INSERT ON sb_browse_images
 WHEN EXISTS(SELECT 1 FROM sb_storage_writes WHERE image_key=NEW.image_key AND is_gc>0)
 BEGIN SELECT RAISE(ABORT,'STORAGE_KEY_RETIRED'); END;
CREATE TRIGGER sb_frame_gc_update BEFORE UPDATE ON sb_frames
 WHEN (NEW.image_key<>OLD.image_key OR NEW.expires_at>OLD.expires_at OR NEW.storage_ready>OLD.storage_ready)
 AND EXISTS(SELECT 1 FROM sb_storage_writes WHERE image_key=NEW.image_key AND is_gc>0)
 BEGIN SELECT RAISE(ABORT,'STORAGE_KEY_RETIRED'); END;
CREATE TRIGGER sb_browse_image_gc_update BEFORE UPDATE ON sb_browse_images
 WHEN (NEW.image_key<>OLD.image_key OR NEW.expires_at>OLD.expires_at)
 AND EXISTS(SELECT 1 FROM sb_storage_writes WHERE image_key=NEW.image_key AND is_gc>0)
 BEGIN SELECT RAISE(ABORT,'STORAGE_KEY_RETIRED'); END;

-- Circuit breaker: stop adding content when the measured expiry backlog is over
-- budget. Existing stop/revoke and maintenance paths remain available.
CREATE TRIGGER sb_frames_backlog BEFORE INSERT ON sb_frames
 WHEN (SELECT overloaded FROM sb_maintenance_state WHERE id=1)=1
 BEGIN SELECT RAISE(ABORT,'MAINTENANCE_BACKLOG_LIMIT'); END;
CREATE TRIGGER sb_commands_backlog BEFORE INSERT ON sb_mouse_commands
 WHEN (SELECT overloaded FROM sb_maintenance_state WHERE id=1)=1
 BEGIN SELECT RAISE(ABORT,'MAINTENANCE_BACKLOG_LIMIT'); END;
CREATE TRIGGER sb_metrics_backlog BEFORE INSERT ON sb_metrics
 WHEN (SELECT overloaded FROM sb_maintenance_state WHERE id=1)=1
 BEGIN SELECT RAISE(IGNORE); END;
UPDATE sb_metrics SET detail_json=NULL WHERE detail_json IS NOT NULL;

CREATE INDEX sb_browse_replay_key_version ON sb_browse_runs(replay_key_version);

CREATE INDEX sb_storage_pending_gc ON sb_storage_writes(image_key) WHERE is_gc=1;
