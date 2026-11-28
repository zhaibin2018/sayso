import type { BridgeEngine, User } from "./bridge-engine.ts";
import { stoppedInputStatements, stopDeviceScopeSQL } from "./control-stop.ts";
import { stopSelector, stopSelectorNotice } from "./stop-selector.ts";

/** One D1 batch: stop first; report the resolved scope from the same transaction. */
export async function stopOwnedMouse(service: BridgeEngine, user: User, id?: unknown) {
  const selector = stopSelector(id),
    selected = selector.selected;
  const results = await service.db.batch([
    service.stmt(
      "UPDATE sb_sessions SET mouse_enabled=0,input_end=0,control_epoch=control_epoch+1,mouse_grant_request='00000000-0000-4000-8000-000000000000' WHERE owner_id=? AND " +
        stopDeviceScopeSQL("sb_sessions") +
        " AND state='active' AND (mouse_enabled!=0 OR input_end!=0 OR mouse_grant_request IS NOT '00000000-0000-4000-8000-000000000000') AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=sb_sessions.device_id AND d.owner_id=sb_sessions.owner_id) RETURNING device_id",
      user.id,
      selected,
      selected,
      selected,
      user.id,
    ),
    service.stmt(
      "UPDATE sb_share_control SET stopped=1,intent_seq=intent_seq+1 WHERE stopped=0 AND owner_id=? AND "+
      "(? IS NULL OR device_id=? OR NOT EXISTS(SELECT 1 FROM sb_devices WHERE id=? AND owner_id=?)) AND EXISTS "+
      "(SELECT 1 FROM sb_sessions s WHERE s.owner_id=sb_share_control.owner_id AND s.device_id=sb_share_control.device_id "+
      "AND s.broadcast_id=sb_share_control.broadcast_id AND (s.state='active' OR s.stop_reason='offline_timeout'))",
      user.id,selected,selected,selected,user.id),
    ...stoppedInputStatements(service, user.id, selected, null, "USER_STOPPED", null, true),
    service.stmt(
      "SELECT CASE WHEN EXISTS(SELECT 1 FROM sb_devices WHERE id=? AND owner_id=?) THEN ? ELSE NULL END AS selected_device_id",
      selected,
      user.id,
      selected,
    ),
  ]);
  const device = (results.at(-1)!.results[0] as { selected_device_id: string | null })
    .selected_device_id;
  const missing = selected !== null && device === null;
  return {
    ...stopSelectorNotice(
      selector.fallback || missing,
      "devices",
      missing ? "not_found" : "invalid_id",
    ),
    device_id: device,
    stopped: true,
    already_stopped:
      results[0].results.length === 0 &&
      results.slice(1, -1).every((result) => Number(result.meta.changes ?? 0) === 0),
    scope: device === null ? "all_owned_devices" : "selected_device",
    screen_sharing_stopped: false,
    board_release_confirmed: false,
  };
}
