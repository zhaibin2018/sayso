import { confirmedSystemSearchReceiptSQL, noLaterSearchInputSQL } from "./source-view-proof.ts";
export type AppSearchFence = {
  operation: string;
  shortcut?: string;
  frame?: string;
  sha256?: string;
  orientation?: number;
};
export function compositeSearchAvailability(source: AppSearchFence | undefined) {
  if (!source) return "";
  if (!/^[0-9a-f-]{36}$/.test(source.operation) || source.shortcut)
    throw Error("Invalid internal search fence");
  return (
    " AND " +
    appSearchFence(source, "action_clock.now").sql.replace(
      "q.id=?",
      "q.id='" + source.operation + "'",
    )
  );
}
/** d/s/h are the admission transaction's live authority, not a prior status read. */
export function appSearchFence(source: AppSearchFence | undefined, clock: string) {
  if (!source) return { sql: "1", values: [] as unknown[] };
  const fields = {
    session: "s.id",
    broadcast: "s.broadcast_id",
    worker: "d.worker_id",
    lease: "d.lease_epoch",
    control: "s.control_epoch",
    hardware: "h.hardware_id",
    boot: "h.board_boot_id",
  };
  const original = source.shortcut
    ? ` AND EXISTS(SELECT 1 FROM sb_mouse_commands original WHERE original.id=? AND original.owner_id=q.owner_id AND original.device_id=q.device_id
    AND original.session_id=s.id AND original.worker_id=d.worker_id AND original.lease_epoch=d.lease_epoch AND original.control_epoch=s.control_epoch
    AND original.hardware_id=h.hardware_id AND original.board_boot_id=h.board_boot_id AND original.cancel_requested=0
    AND ${confirmedSystemSearchReceiptSQL("original")} AND ${noLaterSearchInputSQL("original")})
    AND EXISTS(SELECT 1 FROM sb_frames f WHERE f.device_id=d.id AND f.owner_id=d.owner_id AND f.session_id=s.id
      AND f.lease_epoch=d.lease_epoch AND f.sha256=?
      AND json_extract(f.metadata,'$.orientation_epoch')=? AND f.expires_at>${clock} AND ${clock}-f.capture_lower BETWEEN 0 AND 1999)`
    : "";
  return {
    sql: `EXISTS(SELECT 1 FROM sb_app_search_queries q WHERE q.id=? AND q.owner_id=d.owner_id AND q.device_id=d.id
    AND q.reason='OPEN_APP_SEARCH_ACTIVE' AND q.finished_at IS NULL AND q.created_at+30000>${clock}
    AND ${Object.entries(fields)
      .map(([key, sql]) => `json_extract(q.native_review_state,'$.${key}')=${sql}`)
      .join(" AND ")}${original})`,
    values: [
      source.operation,
      ...(source.shortcut ? [source.shortcut, source.sha256, source.orientation] : []),
    ],
  };
}
