-- Offline L04 candidate. Apply only after evidence preservation and deployment approval.
ALTER TABLE sb_browse_runs ADD COLUMN replay_key_version INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sb_mouse_commands ADD COLUMN replay_key_version INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sb_led_commands ADD COLUMN replay_key_version INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE sb_erasure_jobs (
 id TEXT PRIMARY KEY NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('sharing','device','site')),
 owner_id TEXT, device_id TEXT, session_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('requested','processing','partial','failed','complete')),
 requested_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, fenced INTEGER NOT NULL DEFAULT 0,
 phase INTEGER NOT NULL DEFAULT 0, deleted_rows INTEGER NOT NULL DEFAULT 0, deleted_objects INTEGER NOT NULL DEFAULT 0,
 error TEXT, lock_token TEXT, lock_until INTEGER NOT NULL DEFAULT 0, r2_cursor TEXT, r2_verified_at INTEGER,
 CHECK((scope='site' AND owner_id IS NULL AND device_id IS NULL AND session_id IS NULL) OR
 (scope='device' AND owner_id IS NOT NULL AND device_id IS NOT NULL AND session_id IS NULL) OR
 (scope='sharing' AND owner_id IS NOT NULL AND device_id IS NOT NULL AND session_id IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX sb_erasure_scope ON sb_erasure_jobs(device_id,session_id);
--> statement-breakpoint
CREATE TABLE sb_storage_writes (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL,
 device_id TEXT NOT NULL, session_id TEXT NOT NULL, image_key TEXT NOT NULL, started_at INTEGER NOT NULL, is_gc INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE INDEX sb_storage_write_scope ON sb_storage_writes(device_id,session_id);
--> statement-breakpoint
CREATE INDEX sb_storage_write_key ON sb_storage_writes(image_key);
--> statement-breakpoint
CREATE TRIGGER sb_storage_gc_lock BEFORE INSERT ON sb_storage_writes
 WHEN EXISTS(SELECT 1 FROM sb_storage_writes WHERE image_key=NEW.image_key AND (is_gc=1 OR NEW.is_gc=1))
 BEGIN SELECT RAISE(ABORT,'STORAGE_KEY_BUSY'); END;
--> statement-breakpoint
CREATE TRIGGER sb_erasure_close AFTER INSERT ON sb_erasure_jobs BEGIN
 UPDATE sb_devices SET revoked=CASE WHEN NEW.scope='sharing' THEN revoked ELSE 1 END,
  worker_id=NULL,worker_expires=0,current_session=NULL,lease_epoch=lease_epoch+1
 WHERE (NEW.scope='site' OR (owner_id=NEW.owner_id AND id=NEW.device_id))
 AND (NEW.scope<>'sharing' OR current_session=NEW.session_id) AND revoked=0;
 UPDATE sb_sessions SET state='stopped',capture_state='stopped',blocked=1,mouse_enabled=0,mouse_until=0,
  control_epoch=control_epoch+1,stopped_at=COALESCE(stopped_at,NEW.requested_at),stop_reason=COALESCE(stop_reason,'data_erasure')
 WHERE (NEW.scope='site' OR (owner_id=NEW.owner_id AND device_id=NEW.device_id AND (NEW.scope='device' OR id=NEW.session_id)))
 AND (state<>'stopped' OR blocked=0);
 UPDATE sb_mouse_commands SET state=CASE WHEN state='executing' OR input_attempted=1 THEN 'outcome_unknown' ELSE 'cancelled' END
 WHERE state IN ('queued','claimed','executing','embedded') AND
 (NEW.scope='site' OR (owner_id=NEW.owner_id AND device_id=NEW.device_id AND (NEW.scope='device' OR session_id=NEW.session_id)));
 UPDATE sb_led_commands SET state=CASE WHEN state='executing' THEN 'outcome_unknown' ELSE 'cancelled' END
 WHERE state IN ('queued','claimed','executing') AND
 (NEW.scope='site' OR (owner_id=NEW.owner_id AND device_id=NEW.device_id AND (NEW.scope='device' OR session_id=NEW.session_id)));
 UPDATE sb_mouse_commands SET payload='{"details_redacted":true}',precondition=NULL,receipt=NULL,error=NULL,result_digest=NULL
 WHERE NEW.scope='sharing' AND owner_id=NEW.owner_id AND device_id=NEW.device_id AND session_id=NEW.session_id
 AND (payload<>'{"details_redacted":true}' OR precondition IS NOT NULL OR receipt IS NOT NULL OR error IS NOT NULL OR result_digest IS NOT NULL);
 UPDATE sb_led_commands SET receipt=NULL,error=NULL,result_digest=NULL
 WHERE NEW.scope='sharing' AND owner_id=NEW.owner_id AND device_id=NEW.device_id AND session_id=NEW.session_id
 AND (receipt IS NOT NULL OR error IS NOT NULL OR result_digest IS NOT NULL);
 UPDATE sb_browse_journal SET evidence='{}',input_digest='retired',observation_digest='retired'
 WHERE NEW.scope='sharing' AND evidence<>'{}' AND run_id IN
  (SELECT id FROM sb_browse_runs WHERE owner_id=NEW.owner_id AND device_id=NEW.device_id AND session_id=NEW.session_id);
 UPDATE sb_browse_runs SET state=CASE WHEN input_json IS NOT NULL OR lease_seq>0 OR state='outcome_unknown' THEN 'outcome_unknown' ELSE 'cancelled' END,queue_json='[]',plan_keys_json='{}',input_json=NULL,checkpoint_json=NULL,hardware_metadata='{}',error=NULL
 WHERE NEW.scope='sharing' AND owner_id=NEW.owner_id AND device_id=NEW.device_id AND session_id=NEW.session_id
 AND (state='active' OR queue_json<>'[]' OR plan_keys_json<>'{}' OR input_json IS NOT NULL OR checkpoint_json IS NOT NULL OR hardware_metadata<>'{}' OR error IS NOT NULL);
 UPDATE sb_erasure_jobs SET fenced=1 WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_leases_erasure_insert BEFORE INSERT ON sb_browse_leases
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=(SELECT device_id FROM sb_browse_runs WHERE id=NEW.run_id) AND (j.scope='device' OR j.session_id=(SELECT session_id FROM sb_browse_runs WHERE id=NEW.run_id)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_leases_parent_insert BEFORE INSERT ON sb_browse_leases
 WHEN NOT EXISTS(SELECT 1 FROM sb_browse_runs WHERE id=NEW.run_id)
 BEGIN SELECT RAISE(ABORT,'ERASURE_PARENT_MISSING'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_leases_erasure_update BEFORE UPDATE ON sb_browse_leases
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=(SELECT device_id FROM sb_browse_runs WHERE id=NEW.run_id) AND (j.scope='device' OR j.session_id=(SELECT session_id FROM sb_browse_runs WHERE id=NEW.run_id)))) OR (j.scope='site' OR (j.device_id=(SELECT device_id FROM sb_browse_runs WHERE id=OLD.run_id) AND (j.scope='device' OR j.session_id=(SELECT session_id FROM sb_browse_runs WHERE id=OLD.run_id))))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_leases_parent_update BEFORE UPDATE ON sb_browse_leases
 WHEN NOT EXISTS(SELECT 1 FROM sb_browse_runs WHERE id=NEW.run_id)
 BEGIN SELECT RAISE(ABORT,'ERASURE_PARENT_MISSING'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_journal_erasure_insert BEFORE INSERT ON sb_browse_journal
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=(SELECT device_id FROM sb_browse_runs WHERE id=NEW.run_id) AND (j.scope='device' OR j.session_id=(SELECT session_id FROM sb_browse_runs WHERE id=NEW.run_id)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_journal_parent_insert BEFORE INSERT ON sb_browse_journal
 WHEN NOT EXISTS(SELECT 1 FROM sb_browse_runs WHERE id=NEW.run_id)
 BEGIN SELECT RAISE(ABORT,'ERASURE_PARENT_MISSING'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_journal_erasure_update BEFORE UPDATE ON sb_browse_journal
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=(SELECT device_id FROM sb_browse_runs WHERE id=NEW.run_id) AND (j.scope='device' OR j.session_id=(SELECT session_id FROM sb_browse_runs WHERE id=NEW.run_id)))) OR (j.scope='site' OR (j.device_id=(SELECT device_id FROM sb_browse_runs WHERE id=OLD.run_id) AND (j.scope='device' OR j.session_id=(SELECT session_id FROM sb_browse_runs WHERE id=OLD.run_id)))))) AND NOT (NEW.step_id IS OLD.step_id AND NEW.run_id IS OLD.run_id AND NEW.plan_id IS OLD.plan_id AND NEW.step_index IS OLD.step_index AND (NEW.input_digest IS OLD.input_digest OR NEW.input_digest='retired') AND (NEW.observation_digest IS OLD.observation_digest OR NEW.observation_digest='retired') AND (NEW.evidence IS OLD.evidence OR NEW.evidence='{}') AND NEW.created_at IS OLD.created_at)
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_journal_parent_update BEFORE UPDATE ON sb_browse_journal
 WHEN NOT EXISTS(SELECT 1 FROM sb_browse_runs WHERE id=NEW.run_id) AND NOT (NEW.step_id IS OLD.step_id AND NEW.run_id IS OLD.run_id AND NEW.plan_id IS OLD.plan_id AND NEW.step_index IS OLD.step_index AND (NEW.input_digest IS OLD.input_digest OR NEW.input_digest='retired') AND (NEW.observation_digest IS OLD.observation_digest OR NEW.observation_digest='retired') AND (NEW.evidence IS OLD.evidence OR NEW.evidence='{}') AND NEW.created_at IS OLD.created_at)
 BEGIN SELECT RAISE(ABORT,'ERASURE_PARENT_MISSING'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_images_erasure_insert BEFORE INSERT ON sb_browse_images
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_images_erasure_update BEFORE UPDATE ON sb_browse_images
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=OLD.session_id)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_runs_erasure_insert BEFORE INSERT ON sb_browse_runs
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_runs_erasure_update BEFORE UPDATE ON sb_browse_runs
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=OLD.session_id))))) AND NOT (NEW.id IS OLD.id AND NEW.owner_id IS OLD.owner_id AND NEW.device_id IS OLD.device_id AND (NEW.intent_key IS OLD.intent_key OR (NEW.intent_key LIKE 'rk1:%' AND length(NEW.intent_key)=68)) AND NEW.intent_digest IS OLD.intent_digest AND NEW.session_id IS OLD.session_id AND NEW.broadcast_id IS OLD.broadcast_id AND NEW.worker_id IS OLD.worker_id AND NEW.lease_epoch IS OLD.lease_epoch AND NEW.control_epoch IS OLD.control_epoch AND NEW.hardware_id IS OLD.hardware_id AND NEW.board_boot_id IS OLD.board_boot_id AND NEW.hardware_metadata IS OLD.hardware_metadata AND NEW.calibration_id IS OLD.calibration_id AND NEW.settings_hash IS OLD.settings_hash AND NEW.orientation_epoch IS OLD.orientation_epoch AND NEW.state IS OLD.state AND NEW.queue_json IS OLD.queue_json AND NEW.plan_keys_json IS OLD.plan_keys_json AND NEW.tail_step_id IS OLD.tail_step_id AND NEW.next_index IS OLD.next_index AND NEW.revision IS OLD.revision AND NEW.lease_seq IS OLD.lease_seq AND NEW.lease_request_id IS OLD.lease_request_id AND NEW.last_lease_id IS OLD.last_lease_id AND NEW.input_json IS OLD.input_json AND NEW.checkpoint_seq IS OLD.checkpoint_seq AND NEW.checkpoint_json IS OLD.checkpoint_json AND NEW.error IS OLD.error AND NEW.created_at IS OLD.created_at AND NEW.expires_at IS OLD.expires_at AND NEW.head_expires_at IS OLD.head_expires_at AND (NEW.replay_key_version IS OLD.replay_key_version OR NEW.replay_key_version=1))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_released_system_search_field_proofs_erasure_insert BEFORE INSERT ON sb_released_system_search_field_proofs
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_released_system_search_field_proofs_erasure_update BEFORE UPDATE ON sb_released_system_search_field_proofs
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=NULL)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_frames_erasure_insert BEFORE INSERT ON sb_frames
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_frames_erasure_update BEFORE UPDATE ON sb_frames
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=OLD.session_id)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_screen_texts_erasure_insert BEFORE INSERT ON sb_screen_texts
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_screen_texts_erasure_update BEFORE UPDATE ON sb_screen_texts
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=OLD.session_id)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_refreshes_erasure_insert BEFORE INSERT ON sb_refreshes
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_refreshes_erasure_update BEFORE UPDATE ON sb_refreshes
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=OLD.session_id)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_clock_probes_erasure_insert BEFORE INSERT ON sb_clock_probes
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_clock_probes_erasure_update BEFORE UPDATE ON sb_clock_probes
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=NULL)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_observations_erasure_insert BEFORE INSERT ON sb_observations
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_observations_erasure_update BEFORE UPDATE ON sb_observations
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=NULL)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_metrics_erasure_insert BEFORE INSERT ON sb_metrics
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_metrics_erasure_update BEFORE UPDATE ON sb_metrics
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=NULL))))) AND NOT (NEW.id IS OLD.id AND NEW.owner_id IS OLD.owner_id AND NEW.device_id IS OLD.device_id AND NEW.kind IS OLD.kind AND NEW.frame_id IS OLD.frame_id AND NEW.bytes IS OLD.bytes AND NEW.duration_ms IS OLD.duration_ms AND NEW.decode_ms IS OLD.decode_ms AND NEW.store_ms IS OLD.store_ms AND NEW.created_at IS OLD.created_at AND (NEW.detail_json IS OLD.detail_json OR NEW.detail_json IS NULL))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_voice_bench_erasure_insert BEFORE INSERT ON sb_voice_bench
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_voice_bench_erasure_update BEFORE UPDATE ON sb_voice_bench
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=NULL)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_mouse_point_ready_erasure_insert BEFORE INSERT ON sb_mouse_point_ready
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_mouse_point_ready_erasure_update BEFORE UPDATE ON sb_mouse_point_ready
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=OLD.session_id)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_pointer_ready_erasure_insert BEFORE INSERT ON sb_pointer_ready
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_pointer_ready_erasure_update BEFORE UPDATE ON sb_pointer_ready
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=OLD.session_id)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_ready_erasure_insert BEFORE INSERT ON sb_browse_ready
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_ready_erasure_update BEFORE UPDATE ON sb_browse_ready
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=OLD.session_id)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_calibrations_erasure_insert BEFORE INSERT ON sb_browse_calibrations
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_browse_calibrations_erasure_update BEFORE UPDATE ON sb_browse_calibrations
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=NULL))))) AND NOT (NEW.id IS OLD.id AND NEW.owner_id IS OLD.owner_id AND NEW.device_id IS OLD.device_id AND NEW.request_id IS OLD.request_id AND NEW.digest IS OLD.digest AND NEW.hardware_id IS OLD.hardware_id AND NEW.board_boot_id IS OLD.board_boot_id AND NEW.descriptor IS OLD.descriptor AND NEW.settings_hash IS OLD.settings_hash AND NEW.orientation_epoch IS OLD.orientation_epoch AND NEW.source_width IS OLD.source_width AND NEW.source_height IS OLD.source_height AND (NEW.proof IS OLD.proof OR NEW.proof='{}') AND NEW.created_at IS OLD.created_at AND NEW.expires_at IS OLD.expires_at)
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_mouse_commands_erasure_insert BEFORE INSERT ON sb_mouse_commands
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_mouse_commands_erasure_update BEFORE UPDATE ON sb_mouse_commands
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=OLD.session_id))))) AND NOT (NEW.id IS OLD.id AND NEW.owner_id IS OLD.owner_id AND NEW.device_id IS OLD.device_id AND NEW.session_id IS OLD.session_id AND NEW.hardware_id IS OLD.hardware_id AND NEW.board_boot_id IS OLD.board_boot_id AND NEW.kind IS OLD.kind AND (NEW.payload IS OLD.payload OR NEW.payload='{"details_redacted":true}') AND NEW.digest IS OLD.digest AND (NEW.idempotency_key IS OLD.idempotency_key OR (NEW.idempotency_key LIKE 'rk1:%' AND length(NEW.idempotency_key)=68)) AND NEW.state IS OLD.state AND NEW.worker_id IS OLD.worker_id AND NEW.lease_epoch IS OLD.lease_epoch AND NEW.control_epoch IS OLD.control_epoch AND NEW.created_at IS OLD.created_at AND NEW.expires_at IS OLD.expires_at AND (NEW.receipt IS OLD.receipt OR NEW.receipt IS NULL) AND (NEW.result_digest IS OLD.result_digest OR NEW.result_digest IS NULL) AND (NEW.error IS OLD.error OR NEW.error IS NULL) AND (NEW.precondition IS OLD.precondition OR NEW.precondition IS NULL) AND NEW.phone_ack_mono_ms IS OLD.phone_ack_mono_ms AND NEW.predecessor_id IS OLD.predecessor_id AND NEW.input_attempted IS OLD.input_attempted AND NEW.event_clock IS OLD.event_clock AND (NEW.replay_key_version IS OLD.replay_key_version OR NEW.replay_key_version=1))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_led_commands_erasure_insert BEFORE INSERT ON sb_led_commands
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_led_commands_erasure_update BEFORE UPDATE ON sb_led_commands
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=OLD.session_id))))) AND NOT (NEW.id IS OLD.id AND NEW.owner_id IS OLD.owner_id AND NEW.device_id IS OLD.device_id AND NEW.session_id IS OLD.session_id AND NEW.hardware_id IS OLD.hardware_id AND NEW.board_boot_id IS OLD.board_boot_id AND NEW.requested_on IS OLD.requested_on AND (NEW.idempotency_key IS OLD.idempotency_key OR (NEW.idempotency_key LIKE 'rk1:%' AND length(NEW.idempotency_key)=68)) AND NEW.state IS OLD.state AND NEW.worker_id IS OLD.worker_id AND NEW.lease_epoch IS OLD.lease_epoch AND NEW.control_epoch IS OLD.control_epoch AND NEW.created_at IS OLD.created_at AND NEW.expires_at IS OLD.expires_at AND (NEW.receipt IS OLD.receipt OR NEW.receipt IS NULL) AND (NEW.result_digest IS OLD.result_digest OR NEW.result_digest IS NULL) AND (NEW.error IS OLD.error OR NEW.error IS NULL) AND (NEW.replay_key_version IS OLD.replay_key_version OR NEW.replay_key_version=1))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_manual_requests_erasure_insert BEFORE INSERT ON sb_manual_requests
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_manual_requests_erasure_update BEFORE UPDATE ON sb_manual_requests
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=NULL)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_app_search_queries_erasure_insert BEFORE INSERT ON sb_app_search_queries
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_app_search_queries_erasure_update BEFORE UPDATE ON sb_app_search_queries
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=NULL))))) AND NOT (NEW.id IS OLD.id AND NEW.owner_id IS OLD.owner_id AND NEW.device_id IS OLD.device_id AND NEW.digest IS OLD.digest AND NEW.created_at IS OLD.created_at AND NEW.finished_at IS OLD.finished_at AND (NEW.reason IS OLD.reason OR NEW.reason IS NULL) AND (NEW.native_review_state IS OLD.native_review_state OR NEW.native_review_state IS NULL))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_hardware_erasure_insert BEFORE INSERT ON sb_hardware
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_hardware_erasure_update BEFORE UPDATE ON sb_hardware
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=NULL)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_sessions_erasure_insert BEFORE INSERT ON sb_sessions
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.id))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_sessions_erasure_update BEFORE UPDATE ON sb_sessions
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.id))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=OLD.id))))) AND NOT (NEW.id IS OLD.id AND NEW.owner_id IS OLD.owner_id AND NEW.device_id IS OLD.device_id AND NEW.broadcast_id IS OLD.broadcast_id AND NEW.request_id IS OLD.request_id AND NEW.body_hash IS OLD.body_hash AND NEW.state IS OLD.state AND NEW.capture_state IS OLD.capture_state AND NEW.created_at IS OLD.created_at AND NEW.blocked IS OLD.blocked AND NEW.mode IS OLD.mode AND NEW.diagnostic_enabled IS OLD.diagnostic_enabled AND NEW.control_epoch IS OLD.control_epoch AND (NEW.stop_reason IS OLD.stop_reason OR NEW.stop_reason IS NULL) AND NEW.stopped_at IS OLD.stopped_at AND NEW.mouse_enabled IS OLD.mouse_enabled AND NEW.mouse_until IS OLD.mouse_until AND (NEW.mouse_grant_request IS OLD.mouse_grant_request OR NEW.mouse_grant_request IS NULL) AND (NEW.event_clock IS OLD.event_clock OR NEW.event_clock IS NULL))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_pair_codes_erasure_insert BEFORE INSERT ON sb_pair_codes
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_pair_codes_erasure_update BEFORE UPDATE ON sb_pair_codes
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=NULL)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_pairing_requests_erasure_insert BEFORE INSERT ON sb_pairing_requests
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_pairing_requests_erasure_update BEFORE UPDATE ON sb_pairing_requests
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NULL))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=NULL)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_devices_erasure_insert BEFORE INSERT ON sb_devices
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.id AND (j.scope='device' OR j.session_id=NULL))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_devices_erasure_update BEFORE UPDATE ON sb_devices
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.id AND (j.scope='device' OR j.session_id=NULL))) OR (j.scope='site' OR (j.device_id=OLD.id AND (j.scope='device' OR j.session_id=NULL)))))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_rate_windows_erasure_insert BEFORE INSERT ON sb_rate_windows
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site'))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_rate_windows_erasure_update BEFORE UPDATE ON sb_rate_windows
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site') OR (j.scope='site')))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_timing_journal_erasure_insert BEFORE INSERT ON sb_timing_journal
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site'))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_timing_journal_erasure_update BEFORE UPDATE ON sb_timing_journal
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site') OR (j.scope='site')))
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_storage_writes_erasure_insert BEFORE INSERT ON sb_storage_writes
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id)))) AND NEW.is_gc=0
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER sb_storage_writes_erasure_update BEFORE UPDATE ON sb_storage_writes
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND ((j.scope='site' OR (j.device_id=NEW.device_id AND (j.scope='device' OR j.session_id=NEW.session_id))) OR (j.scope='site' OR (j.device_id=OLD.device_id AND (j.scope='device' OR j.session_id=OLD.session_id))))) AND NEW.is_gc=0
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END;
