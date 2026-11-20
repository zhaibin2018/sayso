import { BridgeError, type BridgeEngine, type Device, type User } from "./bridge-engine.ts";
import { stopSelector, stopSelectorNotice } from "./stop-selector.ts";

/** Stop a captured owner-scoped set; one cleanup failure must not skip other phones. */
export async function stopOwnedSessions(service: BridgeEngine, user: User, id?: unknown) {
  let { selected, fallback } = stopSelector(id);
  let reason: "invalid_id" | "not_found" | "stale_session" = "invalid_id";
  const rows = await service
    .stmt(
      `
    SELECT d.*,s.id AS target_session_id,s.state AS target_session_state
    FROM sb_sessions s JOIN sb_devices d ON d.id=s.device_id AND d.owner_id=s.owner_id
    WHERE s.owner_id=? AND (s.id=? OR (s.state<>'stopped' AND NOT EXISTS(
      SELECT 1 FROM sb_sessions requested
      JOIN sb_devices rd ON rd.id=requested.device_id AND rd.owner_id=requested.owner_id
      WHERE requested.owner_id=? AND requested.id=? AND requested.state<>'stopped'
    )))`,
      user.id,
      selected,
      user.id,
      selected,
    )
    .all<Device & { target_session_id: string; target_session_state: string }>();
  if (selected !== null) {
    const original = rows.results.find((row) => row.target_session_id === selected);
    if (!original) {
      selected = null;
      fallback = true;
      reason = "not_found";
    } else if (
      original.target_session_state === "stopped" &&
      rows.results.some((row) => row.target_session_state !== "stopped")
    ) {
      selected = null;
      fallback = true;
      reason = "stale_session";
    }
  }
  // The single owner-scoped snapshot retains the requested old row for cleanup retries.
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
    ...stopSelectorNotice(fallback, "sessions", reason),
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
