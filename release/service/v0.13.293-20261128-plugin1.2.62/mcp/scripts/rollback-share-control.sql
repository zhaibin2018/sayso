-- Run as one D1 batch while all writers are stopped. Retain the schema
-- and sb_no_legacy_grant for a read-only T112 rollback.
UPDATE sb_share_control SET stopped=1,automatic=0,intent_seq=intent_seq+1;
UPDATE sb_sessions SET mouse_enabled=0,input_end=0,mouse_until=0,
 control_epoch=control_epoch+1,mouse_grant_request='00000000-0000-4000-8000-000000000000'
 WHERE state='active' AND mode='broadcast';
UPDATE sb_mouse_commands SET state=CASE WHEN state='executing' OR input_attempted=1 THEN 'outcome_unknown' ELSE 'cancelled' END,
 error='CONTROL_ROLLBACK' WHERE state IN ('queued','claimed','executing','embedded');
UPDATE sb_browse_runs SET state=CASE WHEN lease_seq>0 THEN 'outcome_unknown' ELSE 'cancelled' END,
 revision=revision+1,error='CONTROL_ROLLBACK' WHERE state='active';
