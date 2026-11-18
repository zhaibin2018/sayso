import { BridgeError, type BridgeEngine, type Device, type User } from "./bridge-engine.ts";
import { stopSelector, stopSelectorNotice } from "./stop-selector.ts";

/** Stop a captured owner-scoped set; one cleanup failure must not skip other phones. */
export async function stopOwnedSessions(service: BridgeEngine, user: User, id?: unknown) {
  const { selected, fallback } = stopSelector(id);
  const rows = await service
    .stmt(
      "SELECT d.*,s.id AS target_session_id FROM sb_sessions s JOIN sb_devices d ON d.id=s.device_id AND d.owner_id=s.owner_id WHERE s.owner_id=? AND " +
        (selected === null ? "s.state<>'stopped'" : "s.id=?"),
      user.id,
      ...(selected === null ? [] : [selected]),
    )
    .all<Device & { target_session_id: string }>();
  if (selected !== null && !rows.results.length) throw new BridgeError("NOT_FOUND", 404);
  const stopped: string[] = [],
    failed: { bridge_session_id: string; error: string }[] = [];
  await Promise.all(
    rows.results.map(async (device) => {
      try {
        await service.stop(device, device.target_session_id, true);
        stopped.push(device.target_session_id);
      } catch (error) {
        failed.push({
          bridge_session_id: device.target_session_id,
          error: error instanceof BridgeError ? error.code : "SESSION_CLEANUP_FAILED",
        });
      }
    }),
  );
  return {
    ...stopSelectorNotice(fallback, "sessions"),
    stopped: failed.length === 0,
    already_stopped: rows.results.length === 0,
    scope: selected === null ? "all_owned_sessions" : "selected_session",
    stopped_sessions: stopped,
    failed_sessions: failed,
    input_control_enabled: failed.length ? null : false,
    cloud_image_cleared: rows.results.length ? failed.length === 0 : null,
    system_broadcast_stop_confirmed: false,
  };
}
