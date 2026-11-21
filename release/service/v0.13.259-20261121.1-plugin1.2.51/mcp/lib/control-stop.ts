import type { BridgeEngine } from "./bridge-engine.ts";

/** Resolve missing/foreign device selectors inside the mutation transaction, never by readiness. */
type StopTable = "sb_sessions" | "sb_mouse_commands" | "sb_browse_runs";
export const stopDeviceScopeSQL = (table: StopTable) =>
  `(? IS NULL OR ${table}.device_id=? OR NOT EXISTS(SELECT 1 FROM sb_devices selected WHERE selected.id=? AND selected.owner_id=?))`;

/** Terminalize original records without deleting receipts or replaying input. */
export function stoppedInputStatements(
  service: BridgeEngine,
  owner: string,
  device: string | null,
  session: string | null,
  reason: string,
  epoch: number | null = null,
  fallbackMissingDevice = false,
) {
  const scope = (table: StopTable) =>
    "owner_id=? AND " +
    (fallbackMissingDevice ? stopDeviceScopeSQL(table) : "(? IS NULL OR device_id=?)") +
    " AND (? IS NULL OR session_id=?) AND (? IS NULL OR control_epoch=?) AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=" +
    table +
    ".device_id AND d.owner_id=" +
    table +
    ".owner_id)";
  const values = [
    owner,
    device,
    device,
    ...(fallbackMissingDevice ? [device, owner] : []),
    session,
    session,
    epoch,
    epoch,
  ];
  return [
    service.stmt(
      "UPDATE sb_mouse_commands SET state=CASE WHEN state='executing' OR input_attempted=1 THEN 'outcome_unknown' ELSE 'cancelled' END,error=? WHERE " +
        scope("sb_mouse_commands") +
        " AND state IN ('queued','claimed','executing','embedded')",
      reason,
      ...values,
    ),
    service.stmt(
      "UPDATE sb_browse_runs SET state=CASE WHEN lease_seq>0 AND queue_json!='[]' THEN 'outcome_unknown' ELSE 'cancelled' END,error=?,revision=revision+1 WHERE " +
        scope("sb_browse_runs") +
        " AND state='active'",
      reason,
      ...values,
    ),
  ];
}
