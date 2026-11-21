import { type BridgeEngine, type User } from "./bridge-engine.ts";
import { stopSelector, stopSelectorNotice } from "./stop-selector.ts";
import { stopDeviceScopeSQL } from "./control-stop.ts";

/** The transaction defines the cancellation boundary; later commands are untouched. */
export async function cancelCurrentOperation(
  e: BridgeEngine,
  user: User,
  id?: unknown,
  sessionID?: unknown,
  waitMS = 0,
) {
  let sessionNotice: ReturnType<typeof stopSelectorNotice> | undefined;
  if (sessionID !== undefined) {
    const parsed = stopSelector(sessionID),
      s = parsed.selected;
    const row = s
      ? await e
          .stmt(
            "SELECT device_id FROM sb_sessions WHERE id=? AND owner_id=? AND state='active'",
            s,
            user.id,
          )
          .first<{ device_id: string }>()
      : null;
    id = row?.device_id;
    sessionNotice = stopSelectorNotice(
      !row,
      "sessions",
      parsed.fallback ? "invalid_id" : "not_found",
    );
  }
  const selector = stopSelector(id),
    selected = selector.selected;
  const capable = (table: string) =>
    `EXISTS(SELECT 1 FROM sb_hardware h WHERE h.device_id=${table}.device_id AND h.owner_id=${table}.owner_id AND json_extract(h.metadata,'$.capabilities."sayso.cancel_current.v1"')=1)`;
  const current =
    "EXISTS(SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id WHERE d.id=sb_mouse_commands.device_id AND s.id=sb_mouse_commands.session_id AND s.state='active' AND d.worker_id=sb_mouse_commands.worker_id AND d.lease_epoch=sb_mouse_commands.lease_epoch AND s.control_epoch=sb_mouse_commands.control_epoch AND h.board_boot_id=sb_mouse_commands.board_boot_id)";
  const results = await e.db.batch([
    e.stmt(
      "UPDATE sb_mouse_commands SET cancel_requested=1,error='OPERATION_CANCELLED',state=CASE WHEN state IN ('executing','outcome_unknown') OR input_attempted=1 THEN 'outcome_unknown' ELSE 'cancelled' END WHERE owner_id=? AND " +
        stopDeviceScopeSQL("sb_mouse_commands") +
        " AND " +
        capable("sb_mouse_commands") +
        " AND state IN ('queued','claimed','executing','embedded','outcome_unknown') AND (state<>'outcome_unknown' OR " +
        current +
        ") RETURNING id,device_id,state,input_attempted",
      user.id,
      selected,
      selected,
      selected,
      user.id,
    ),
    e.stmt(
      "UPDATE sb_browse_runs SET state=CASE WHEN lease_seq>0 AND queue_json!='[]' THEN 'outcome_unknown' ELSE 'cancelled' END,error='OPERATION_CANCELLED',revision=revision+1 WHERE owner_id=? AND " +
        stopDeviceScopeSQL("sb_browse_runs") +
        " AND " +
        capable("sb_browse_runs") +
        " AND state='active' RETURNING id,device_id,state",
      user.id,
      selected,
      selected,
      selected,
      user.id,
    ),
    e.stmt("SELECT d.id,d.name FROM sb_devices d LEFT JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id WHERE d.owner_id=? AND (d.id=? OR (? IS NULL AND s.mode='broadcast' AND s.state='active'))", user.id,selected,selected),
    e.stmt(
      "SELECT DISTINCT device_id FROM sb_mouse_commands WHERE owner_id=? AND " +
        stopDeviceScopeSQL("sb_mouse_commands") +
        " AND NOT " +
        capable("sb_mouse_commands") +
        " AND state IN ('queued','claimed','executing','embedded','outcome_unknown') AND (state<>'outcome_unknown' OR " +
        current +
        ")",
      user.id,
      selected,
      selected,
      selected,
      user.id,
    ),
  ]);
  const rows = results[0].results as {
    id: string;
    device_id: string;
    state: string;
    input_attempted: number | null;
  }[];
  // Receipts remain attached to the original ID, including typed_count. No guessed zero for attempted input.
  const deadline = performance.now() + waitMS;
  let originals: {
    id: string;
    state: string;
    receipt: string | null;
    cancel_receipt: string | null;
  }[] = [];
  while (rows.some((row) => row.state === "outcome_unknown")) {
    originals = (
      await e
        .stmt(
          "SELECT id,state,receipt,cancel_receipt FROM sb_mouse_commands WHERE owner_id=? AND id IN (SELECT value FROM json_each(?))",
          user.id,
          JSON.stringify(rows.map((row) => row.id)),
        )
        .all<{ id: string; state: string; receipt: string | null; cancel_receipt: string | null }>()
    ).results;
    if (
      originals.every((row) => row.state === "cancelled" || row.cancel_receipt !== null) ||
      performance.now() >= deadline
    )
      break;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(100, deadline - performance.now())),
    );
  }
  const commands = rows.map((row) => ({
    command_id: row.id,
    device_id: row.device_id,
    state: row.state,
    typed_count: row.state === "cancelled" ? 0 : null,
    typed_count_exact: row.state === "cancelled" ? true : null,
  }));
  for (const command of commands) {
    const original = originals.find((row) => row.id === command.command_id);
    if (!original) continue;
    command.state = original.state;
    const receipt = original.cancel_receipt
      ? JSON.parse(original.cancel_receipt)
      : original.receipt
        ? JSON.parse(original.receipt)
        : null;
    const effect =
      receipt?.effect ?? (original.receipt ? JSON.parse(original.receipt).effect : null);
    command.typed_count = effect?.typed_count ?? command.typed_count;
    command.typed_count_exact = effect?.typed_count_exact ?? command.typed_count_exact;
  }
  const released = commands.every(
    (command) =>
      command.state === "cancelled" &&
      (command.typed_count === 0 ||
        originals.some(
          (row) =>
            row.id === command.command_id &&
            (row.cancel_receipt || row.receipt) &&
            (JSON.parse(row.cancel_receipt ?? row.receipt!).effect?.all_released === true ||
              JSON.parse(row.cancel_receipt ?? row.receipt!).cancellation_release?.all_released ===
                true),
        )),
  );
  return {
    ...(results[2].results.length===1?{device_name:(results[2].results[0] as {name:string}).name}:{}),
    phones:results[2].results.map(row=>({device_id:(row as {id:string}).id,name:(row as {name:string}).name})),
    ...(sessionNotice ??
      stopSelectorNotice(
        selector.fallback || (selected !== null && !results[2].results.length),
        "devices",
        selector.fallback ? "invalid_id" : "not_found",
      )),
    ...(results[3].results.length
      ? { error: "APP_CANCEL_UPDATE_REQUIRED", unsupported_devices: results[3].results }
      : {}),
    stopped: results[3].results.length === 0,
    already_stopped:
      commands.length === 0 && results[1].results.length === 0 && results[3].results.length === 0,
    scope: selected && results[2].results.length ? "selected_device" : "all_owned_devices",
    cancelled_commands: commands,
    cancelled_runs: results[1].results,
    requires_firmware_update: originals.some(
      (row) =>
        row.cancel_receipt &&
        JSON.parse(row.cancel_receipt).cancellation_release?.source === "verified_local_stop",
    ),
    authorization_changed: false,
    screen_sharing_stopped: false,
    board_release_confirmed: released && results[3].results.length === 0,
    cancellation_state: results[3].results.length
      ? "unsupported_app"
      : commands.some((c) => c.state === "outcome_unknown")
        ? "awaiting_original_receipt"
        : "cancelled",
  };
}
export async function operationCancelDirective(e: BridgeEngine, device: string, session: string) {
  const rows = await e
    .stmt(
      "SELECT id,state FROM sb_mouse_commands WHERE device_id=? AND session_id=? AND cancel_requested=1 AND cancel_receipt IS NULL AND (state='outcome_unknown' OR expires_at>" +
        e.now() +
        ") AND control_epoch=(SELECT control_epoch FROM sb_sessions WHERE id=sb_mouse_commands.session_id) AND worker_id=(SELECT worker_id FROM sb_devices WHERE id=sb_mouse_commands.device_id) AND lease_epoch=(SELECT lease_epoch FROM sb_devices WHERE id=sb_mouse_commands.device_id) AND board_boot_id=(SELECT board_boot_id FROM sb_hardware WHERE device_id=sb_mouse_commands.device_id) ORDER BY (state='outcome_unknown') DESC,created_at DESC LIMIT 64",
      device,
      session,
    )
    .all<{ id: string; state: string }>();
  return {
    cancel_command_ids: rows.results.map((row) => row.id),
    cancel_receipt_ids: rows.results
      .filter((row) => row.state === "outcome_unknown")
      .map((row) => row.id),
  };
}
