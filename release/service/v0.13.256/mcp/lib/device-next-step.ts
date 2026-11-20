export type DeviceNextStep =
  | "OPEN_SAYSO_APP"
  | "START_SAYSO_BROADCAST"
  | "CAPTURE_PAUSED"
  | "ALLOW_CONTROL_IN_SAYSO"
  | "UNLOCK_IN_SAYSO_APP"
  | null;

/** Presentation only; never an authorization check. No App unlock signal exists yet. */
export function deviceNextStep(
  online: boolean,
  session: { mode: string; capture_state: string; control_enabled: boolean } | null,
  controlUnlocked?: boolean,
): DeviceNextStep {
  // online tracks the broadcast lease, not pairing or revocation.
  if (!online) return "START_SAYSO_BROADCAST";
  if (!session || session.mode !== "broadcast" || session.capture_state === "stopped")
    return "START_SAYSO_BROADCAST";
  if (session.capture_state !== "active") return "CAPTURE_PAUSED";
  if (controlUnlocked === false) return "UNLOCK_IN_SAYSO_APP";
  return session.control_enabled ? null : "ALLOW_CONTROL_IN_SAYSO";
}
