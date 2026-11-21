import { need, record, uuid, integer, type BridgeEngine, type Device } from "./bridge-engine.ts";
export async function saveCancellationReceipt(
  e: BridgeEngine,
  device: Device,
  body: Record<string, unknown>,
) {
  const session = await e.session(device, body),
    release = body.release_evidence == null ? null : record(body.release_evidence);
  const receipt = release
    ? { command_id: uuid(body.command_id), cancellation_release: release }
    : record(body.board_receipt);
  const effect: Record<string, unknown> = release ? {} : record(receipt.effect);
  const id = uuid(receipt.command_id),
    boot = uuid(release?.board_boot_id ?? receipt.board_boot_id);
  if (release)
    need(
      release.all_released === true &&
        ["verified_local_stop", "verified_command_cancel"].includes(String(release.source)),
      "CANCEL_RELEASE_UNCONFIRMED",
      422,
    );
  else {
    need(
      ["executed", "failed", "outcome_unknown"].includes(String(receipt.state)) &&
        effect.all_released === true,
      "CANCEL_RELEASE_UNCONFIRMED",
      422,
    );
    const started = integer(receipt.started_uptime_ms, 0);
    integer(receipt.finished_uptime_ms, started);
    need(receipt.subcommand_index === 0, "INVALID_CANCEL_RECEIPT", 422);
  }
  const row = await e
    .stmt(
      "SELECT precondition,cancel_receipt FROM sb_mouse_commands WHERE id=? AND device_id=? AND owner_id=? AND session_id=? AND worker_id=? AND lease_epoch=? AND control_epoch=? AND board_boot_id=? AND cancel_requested=1",
      id,
      device.id,
      device.owner_id,
      session.id,
      body.worker_id,
      body.lease_epoch,
      session.control_epoch,
      boot,
    )
    .first<{ precondition: string | null; cancel_receipt: string | null }>();
  need(row, "STALE_CANCEL_RECEIPT", 409);
  if (effect.typed_count !== undefined) {
    integer(effect.typed_count, 0, Number(JSON.parse(row.precondition ?? "{}").text_length ?? 150));
    need(typeof effect.typed_count_exact === "boolean", "INVALID_CANCEL_RECEIPT", 422);
  }
  if (row.cancel_receipt !== null) return { accepted: true, original_receipt_retained: true };
  const encoded = JSON.stringify(receipt);
  const saved = await e
    .stmt(
      "UPDATE sb_mouse_commands SET state='cancelled',cancel_receipt=?,error='OPERATION_CANCELLED' WHERE id=? AND device_id=? AND owner_id=? AND session_id=? AND worker_id=? AND lease_epoch=? AND control_epoch=? AND board_boot_id=? AND cancel_requested=1 AND cancel_receipt IS NULL AND EXISTS(SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id WHERE h.hardware_id=sb_mouse_commands.hardware_id AND h.board_boot_id=sb_mouse_commands.board_boot_id AND h.usb_connected=1 AND d.id=sb_mouse_commands.device_id AND d.owner_id=sb_mouse_commands.owner_id AND d.revoked=0 AND d.token_hash=? AND d.token_expires>? AND d.worker_expires>? AND d.worker_id=sb_mouse_commands.worker_id AND d.lease_epoch=sb_mouse_commands.lease_epoch AND s.id=sb_mouse_commands.session_id AND s.state='active' AND s.control_epoch=sb_mouse_commands.control_epoch AND s.mouse_enabled=1)",
      encoded,
      id,
      device.id,
      device.owner_id,
      session.id,
      body.worker_id,
      body.lease_epoch,
      session.control_epoch,
      boot,
      device.token_hash,
      e.now(),
      e.now(),
    )
    .run();
  need(saved.meta.changes === 1, "STALE_CANCEL_RECEIPT", 409);
  return {
    accepted: true,
    command_id: id,
    all_released: true,
    typed_count: effect.typed_count ?? null,
    typed_count_exact: effect.typed_count_exact ?? null,
  };
}
