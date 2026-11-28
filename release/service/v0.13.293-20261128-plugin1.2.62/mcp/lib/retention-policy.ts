import {diagnosticsEnabled} from "./build-profile.ts";
/** Server-owned TTLs. No caller may supply a target, clock, TTL or force flag. */
export const DAY = 86_400_000;
export const RETENTION_PAGE_SIZE = 100;
export type RetentionPolicy = { table: string; where: string; values: number[]; set?: string };
export function retentionPolicies(now: number): RetentionPolicy[] {
  const remove = (table: string, where: string, ...values: number[]) => ({table, where, values});
  const update = (table: string, set: string, where: string, ...values: number[]) => ({table, set, where, values});
  const terminal = "state NOT IN ('queued','claimed','executing','embedded')";
  return [
    remove('sb_pair_codes','expires_at<=?',now),
    remove('sb_pairing_requests','expires_at<=?',now),
    remove('sb_clock_probes','expires_at<=?',now),
    remove('sb_rate_windows','expires_at<=?',now),
    ...['sb_observations','sb_metrics','sb_voice_bench'].map(t=>remove(t,'created_at<=?',now-DAY)),
    ...(!diagnosticsEnabled?[update('sb_metrics','detail_json=NULL','detail_json IS NOT NULL')]:[]),
    remove('sb_timing_journal','received_utc_ms<=?',now-DAY),
    remove('sb_screen_texts','expires_at<=?',now),
    remove('sb_refreshes',"expires_at<=? OR state IN ('completed','failed','cancelled')",now),
    remove('sb_manual_requests',"expires_at<=? OR state IN ('ready','declined')",now),
    remove('sb_released_system_search_field_proofs',`expires_at<=? OR NOT EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=sb_released_system_search_field_proofs.device_id AND d.owner_id=sb_released_system_search_field_proofs.owner_id AND d.revoked=0)`,now),
    update('sb_devices',"revoked=1,worker_expires=0","confirmed_at IS NULL AND revoked=0 AND created_at<=?",now-300_000),
    update('sb_mouse_commands',"state=CASE WHEN state='executing' OR input_attempted=1 THEN 'outcome_unknown' ELSE 'cancelled' END,error='PRIVACY_RETENTION_EXPIRED'", "kind='keyboard.type_text' AND expires_at<=? AND state IN ('queued','claimed','executing','embedded')",now-300_000),
    update('sb_led_commands',"state=CASE WHEN state='executing' THEN 'outcome_unknown' ELSE 'cancelled' END", "expires_at<=? AND state IN ('queued','claimed','executing')",now),
    update('sb_mouse_commands',`payload='{"details_redacted":true}',precondition=NULL,receipt=NULL,error=NULL,result_digest=NULL`,`${terminal} AND min(created_at,expires_at)<=? AND (payload<>'{"details_redacted":true}' OR precondition IS NOT NULL OR receipt IS NOT NULL OR error IS NOT NULL OR result_digest IS NOT NULL)`,now-7*DAY),
    update('sb_led_commands',"receipt=NULL,result_digest=NULL,error=NULL","state NOT IN ('queued','claimed','executing') AND min(created_at,expires_at)<=? AND (receipt IS NOT NULL OR result_digest IS NOT NULL OR error IS NOT NULL)",now-7*DAY),
    // Keep the recoverable timeout marker until another phone takes over or the App stops it.
    update('sb_sessions',"stop_reason=CASE WHEN blocked=0 AND stop_reason='offline_timeout' THEN stop_reason END,mouse_grant_request=NULL,event_clock=NULL","state='stopped' AND COALESCE(stopped_at,created_at)<=? AND ((stop_reason IS NOT NULL AND (blocked=1 OR stop_reason<>'offline_timeout')) OR mouse_grant_request IS NOT NULL OR event_clock IS NOT NULL)",now-7*DAY),
    update('sb_browse_runs',"state='expired',input_json=NULL,checkpoint_json=NULL,queue_json='[]',plan_keys_json='{}',hardware_metadata='{}',error=NULL","expires_at<=? AND (state='active' OR input_json IS NOT NULL OR checkpoint_json IS NOT NULL OR queue_json<>'[]' OR plan_keys_json<>'{}' OR hardware_metadata<>'{}' OR error IS NOT NULL)",now-300_000),
    update('sb_browse_journal',"evidence='{}',input_digest='retired',observation_digest='retired'","created_at<=? AND (evidence<>'{}' OR input_digest<>'retired' OR observation_digest<>'retired') AND NOT EXISTS(SELECT 1 FROM sb_browse_runs r WHERE r.id=run_id AND r.state='active' AND r.expires_at>?)",now-7*DAY,now),
    remove('sb_browse_leases',"expires_at<=? AND NOT EXISTS(SELECT 1 FROM sb_browse_runs r WHERE r.id=run_id AND r.state='active' AND r.expires_at>?)",now-7*DAY,now),
    update('sb_browse_calibrations',"proof='{}'","expires_at<=? AND proof<>'{}'",now),
    update('sb_app_search_queries',"native_review_state=NULL,reason=NULL","COALESCE(finished_at,created_at)<=? AND (native_review_state IS NOT NULL OR reason IS NOT NULL)",now-7*DAY),
    remove('sb_pointer_ready','expires_at<=?',now),
    ...['sb_mouse_point_ready','sb_browse_ready'].map(t=>remove(t,`NOT EXISTS(SELECT 1 FROM sb_sessions s JOIN sb_devices d ON d.current_session=s.id WHERE s.id=${t}.session_id AND d.id=${t}.device_id AND s.state='active' AND d.revoked=0 AND d.worker_expires>?)`,now)),
    remove('sb_frames',"expires_at<=? OR NOT EXISTS(SELECT 1 FROM sb_sessions s WHERE s.id=sb_frames.session_id AND s.state='active')",now),
    remove('sb_browse_images',"expires_at<=? OR NOT EXISTS(SELECT 1 FROM sb_sessions s WHERE s.id=sb_browse_images.session_id AND s.state='active')",now),
  ];
}
