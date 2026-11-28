import { allOf, reviewedPointSourceHashSQL } from "./source-view-proof.ts";
import {
  visualReadPointCapability,
  visualReadPointLedgerKey,
} from "./compound-query-view-proof.ts";
const reviewedPointCapSQL = (capability: string) =>
  "json_type(h.metadata,'$.capabilities." + JSON.stringify(capability) + "')='true'";
export function visualReadPointOriginFences(
  origin: string,
  clock: string,
  excluding: string[] = [],
) {
  const v = (key: string) => "json_extract(" + origin + ",'$." + key + "')";
  const accepted = (key: string) => "json_extract(a.acceptance_json,'$." + key + "')";
  const exceptions = excluding.length ? " AND later.id NOT IN (" + excluding.join(",") + ")" : "";
  return {
    visual_capability: reviewedPointCapSQL(visualReadPointCapability),
    original_scope: allOf(
      v("origin") + "='visual_read'",
      v("command") + "='" + visualReadPointLedgerKey + "'",
      v("device") + "=d.id",
      v("session") + "=s.id",
      v("broadcast") + "=s.broadcast_id",
      v("worker") + "=d.worker_id",
      v("lease") + "=d.lease_epoch",
      v("control") + "=s.control_epoch",
      v("hardware") + "=h.hardware_id",
      v("boot") + "=h.board_boot_id",
    ),
    original_issued: v("issued") + "<=" + clock,
    original_jpeg:
      "(a.id IS NULL OR " +
      allOf(
        accepted("owner_id") + "=d.owner_id",
        accepted("control_epoch") + "=s.control_epoch",
        accepted("metadata.bridge_session_id") + "=s.id",
        accepted("metadata.broadcast_id") + "=s.broadcast_id",
        accepted("metadata.worker_id") + "=d.worker_id",
        accepted("metadata.lease_epoch") + "=d.lease_epoch",
        v("frame") + "=a.frame_id",
        v("frameSeq") + "=" + accepted("frame_seq"),
        v("sourceSeq") + "=" + accepted("metadata.source_seq"),
        v("captureMono") + "=" + accepted("metadata.capture_mono_ms"),
        v("captureLower") + "=" + accepted("capture_lower_ms"),
        v("sha256") + "=" + reviewedPointSourceHashSQL,
      ) +
      ")",
    no_later_input: `NOT EXISTS(SELECT 1 FROM sb_mouse_commands later WHERE later.owner_id=d.owner_id AND later.device_id=d.id
      AND later.session_id=s.id AND later.control_epoch=s.control_epoch
      AND (CASE WHEN later.worker_id=d.worker_id AND later.lease_epoch=d.lease_epoch AND later.phone_ack_mono_ms>=0
        THEN later.phone_ack_mono_ms>=${v("captureMono")} ELSE later.created_at>=${v("captureLower")} END)${exceptions}
      AND (later.input_attempted=1 OR later.state IN ('queued','claimed','executing','embedded','board_acked','outcome_unknown','succeeded')))`,
  };
}
export function visualReadPointOriginSQL(origin: string, clock: string, excluding: string[] = []) {
  return allOf(...Object.values(visualReadPointOriginFences(origin, clock, excluding)));
}
