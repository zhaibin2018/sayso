import { integer, need, uuid, type BridgeEngine, type Device } from "./bridge-engine.ts";
import { databaseNowSQL as clock } from "./screen-snapshot-query.ts";

type AccessoryScope = {
  worker_id: string | null; lease_epoch: number; hardware_id: string;
  board_boot_id: string; metadata: string;
};

// A legacy grant owns a fixed deadline. Only an explicit App renewal may move it.
export async function grantLegacy(e: BridgeEngine, device: Device, body: Record<string, unknown>, scope: AccessoryScope) {
  need(body.control_protocol == null, "SHARE_CONTROL_UPGRADE_REQUIRED");
  const session = uuid(body.bridge_session_id), request = uuid(body.request_id);
  const automatic = body.automatic_connected === true, renewal = body.renewal === true;
  need(!renewal || automatic, "INVALID_GRANT");
  const now = e.now(), expected = automatic ? integer(body.expected_control_epoch) : null;
  if (automatic) {
    need(uuid(body.worker_id) === scope.worker_id && integer(body.lease_epoch, 1) === scope.lease_epoch
      && uuid(body.hardware_id) === scope.hardware_id && uuid(body.board_boot_id) === scope.board_boot_id,
      "AUTOMATIC_GRANT_SCOPE_CHANGED");
  }
  const ledger = "owner_id=sb_sessions.owner_id AND device_id=sb_sessions.device_id AND broadcast_id=sb_sessions.broadcast_id";
  const results = await e.batch([
    e.stmt(`UPDATE sb_sessions SET mouse_enabled=1,
      input_end=CASE WHEN ?=0 AND mouse_grant_request=? THEN input_end ELSE ? END,
      control_epoch=CASE WHEN ?=1 OR mouse_grant_request=? THEN control_epoch ELSE control_epoch+1 END,
      mouse_grant_request=CASE WHEN ?=1 THEN mouse_grant_request ELSE ? END
      WHERE id=? AND owner_id=? AND device_id=? AND control_protocol='legacy'
      AND mode='broadcast' AND state='active' AND capture_state='active' AND blocked=0
      AND (? IS NULL OR control_epoch=? OR (?=0 AND mouse_grant_request=? AND control_epoch=?+1))
      AND (?=0 OR (mouse_enabled=1 AND input_end>max(?,${clock})))
      AND EXISTS(SELECT 1 FROM sb_share_control WHERE ${ledger} AND control_protocol='legacy' AND (?=0 OR stopped=0))
      AND EXISTS(SELECT 1 FROM sb_devices d JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
        WHERE d.id=sb_sessions.device_id AND d.owner_id=sb_sessions.owner_id AND d.current_session=sb_sessions.id
        AND d.revoked=0 AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>max(?,${clock})
        AND d.token_expires>max(?,${clock}) AND h.usb_connected=1 AND h.hardware_id=? AND h.board_boot_id=? AND h.metadata=?) RETURNING control_epoch`,
      Number(renewal),request,now+600_000,Number(renewal),request,Number(renewal),request,
      session,device.owner_id,device.id,expected,expected,Number(renewal),request,expected,
      Number(renewal),now,Number(automatic),scope.worker_id,scope.lease_epoch,now,now,scope.hardware_id,scope.board_boot_id,scope.metadata),
    e.stmt(`UPDATE sb_share_control SET stopped=0 WHERE changes()=1 AND ?=0 AND owner_id=? AND device_id=?
      AND broadcast_id=(SELECT broadcast_id FROM sb_sessions WHERE id=?)`, Number(automatic),device.owner_id,device.id,session),
  ]);
  need(results[0].results.length === 1, renewal ? "AUTOMATIC_RENEWAL_EXPIRED" : "STALE_CONTROL_EPOCH");
  return results[0].results[0].control_epoch;
}
