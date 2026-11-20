export const privacyStorageReadySQL =
  "(SELECT count(*)=3 FROM sqlite_master WHERE type='trigger' AND name IN ('sb_mouse_terminal_text_update','sb_mouse_terminal_text_insert','sb_mouse_text_digest_required'))";
import type { BridgeEngine } from "./bridge-engine.ts";

export function expiredPrivateData(service: BridgeEngine, now: number) {
  return [
    service.stmt(
      "UPDATE sb_mouse_commands SET state=CASE WHEN state='executing' OR input_attempted=1 THEN 'outcome_unknown' ELSE 'cancelled' END,error=COALESCE(error,'PRIVACY_RETENTION_EXPIRED') WHERE kind='keyboard.type_text' AND expires_at<? AND state IN ('queued','claimed','executing','embedded')",
      now - 300000,
    ),
    service.stmt(
      "UPDATE sb_mouse_commands SET payload=json_set(CASE WHEN kind='keyboard.type_text' THEN json_remove(payload,'$.text') ELSE '{}' END,'$.details_redacted',json('true')),receipt=NULL WHERE expires_at<? AND state NOT IN ('queued','claimed','executing','embedded') AND json_extract(payload,'$.details_redacted') IS NOT 1",
      now - 7 * 86400000,
    ),
    service.stmt("DELETE FROM sb_manual_requests WHERE expires_at<?", now - 86400000),
    service.stmt(
      "DELETE FROM sb_sessions WHERE state='stopped' AND blocked=0 AND COALESCE(stopped_at,created_at)<? AND NOT EXISTS(SELECT 1 FROM sb_mouse_commands c WHERE c.session_id=sb_sessions.id) AND NOT EXISTS(SELECT 1 FROM sb_led_commands c WHERE c.session_id=sb_sessions.id)",
      now - 7 * 86400000,
    ),
  ];
}

export function revokedDeviceData(service: BridgeEngine, owner: string, device: string) {
  return [
    "sb_mouse_commands",
    "sb_led_commands",
    "sb_manual_requests",
    "sb_released_system_search_field_proofs",
    "sb_browse_runs",
    "sb_app_search_queries",
    "sb_sessions",
  ].map((table) =>
    service.stmt(
      `DELETE FROM ${table} WHERE owner_id=? AND device_id=? AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=? AND d.owner_id=? AND d.revoked=1)`,
      owner,
      device,
      device,
      owner,
    ),
  );
}

export function publicCommandPayload(kind: string, payload: string) {
  const value = JSON.parse(payload);
  if (kind === "keyboard.type_text" && Object.hasOwn(value, "text")) {
    delete value.text;
    value.text_omitted = true;
  }
  return value;
}

export function metadataRetentionStatements(service: BridgeEngine, now: number) {
  return [
    ...expiredPrivateData(service, now),
    service.stmt("DELETE FROM sb_clock_probes WHERE expires_at<?", now),
    service.stmt("DELETE FROM sb_rate_windows WHERE expires_at<?", now),
    service.stmt("DELETE FROM sb_observations WHERE created_at<?", now - 86400000),
    service.stmt("DELETE FROM sb_metrics WHERE created_at<?", now - 86400000),
    service.stmt("DELETE FROM sb_voice_bench WHERE created_at<?", now - 86400000),
    service.stmt("DELETE FROM sb_refreshes WHERE expires_at<?", now - 60000),
    service.stmt(
      "UPDATE sb_devices SET revoked=1 WHERE confirmed_at IS NULL AND created_at<?",
      now - 300000,
    ),
    service.stmt("DELETE FROM sb_led_commands WHERE expires_at<?", now - 86400000),
    service.stmt("DELETE FROM sb_screen_texts WHERE expires_at<?", now),
    service.stmt(`DELETE FROM sb_released_system_search_field_proofs AS p WHERE NOT EXISTS(
        SELECT 1 FROM sb_devices d WHERE d.id=p.device_id AND d.owner_id=p.owner_id AND d.revoked=0)`),
  ];
}
