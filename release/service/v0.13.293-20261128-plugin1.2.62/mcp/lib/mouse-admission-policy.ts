import { unresolvedTextFence } from "./long-text.ts";
export const mouseAdmissionJoin =
  " FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id";
export const mouseAdmissionAuthority = (clock = "?") =>
  "d.revoked=0 AND d.worker_expires>" +
  clock +
  " AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.input_end>" +
  clock +
  " AND h.usb_connected=1";
export const mouseAdmissionFences = {
  pending_input_clear:
    "NOT EXISTS(SELECT 1 FROM sb_mouse_commands c WHERE c.device_id=d.id AND c.state IN ('queued','claimed','executing','embedded'))",
  unresolved_input_clear: unresolvedTextFence(),
};
export const mouseAdmissionAvailable = Object.values(mouseAdmissionFences)
  .map((fence) => " AND " + fence)
  .join("");
