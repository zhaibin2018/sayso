import { integer, need, uuid, type BridgeEngine, type Device } from "./bridge-engine.ts";
import { databaseNowSQL as clock } from "./screen-snapshot-query.ts";

export const shareProtocol = "share.v1";
export const stopMarker = "00000000-0000-4000-8000-000000000000";
const ledger = "owner_id=? AND device_id=? AND broadcast_id=?";

export async function grantShare(e:BridgeEngine,d:Device,b:Record<string,unknown>,metadata:string) {
  need(b.control_protocol===shareProtocol && b.renewal!==true,"SHARE_CONTROL_UPGRADE_REQUIRED");
  const broadcast=uuid(b.broadcast_id),session=uuid(b.bridge_session_id),worker=uuid(b.worker_id),
    lease=integer(b.lease_epoch,1),hardware=uuid(b.hardware_id),boot=uuid(b.board_boot_id),
    expected=integer(b.expected_control_epoch),request=uuid(b.request_id),automatic=b.automatic_connected===true,
    intent=integer(b.intent_seq,automatic?0:1),now=e.now(),scope=[d.owner_id,d.id,broadcast];
  const gate = automatic ? "automatic=1 AND stopped=0 AND intent_seq=?" : "intent_seq<?";
  const retry="mouse_enabled=1 AND mouse_grant_request=? AND control_epoch=?";
  const live=`SELECT CASE WHEN sb_sessions.idle_seconds>0 THEN min(d.worker_expires,max(sb_sessions.created_at,sb_sessions.last_tool_at)+sb_sessions.idle_seconds*1000) ELSE d.worker_expires END FROM sb_devices d JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
    WHERE d.id=sb_sessions.device_id AND d.owner_id=sb_sessions.owner_id AND d.current_session=sb_sessions.id
    AND d.worker_id=? AND d.lease_epoch=? AND d.revoked=0 AND d.worker_expires>max(?,${clock})
    AND d.token_expires>max(?,${clock}) AND h.usb_connected=1 AND h.hardware_id=? AND h.board_boot_id=? AND h.metadata=?`;
  const bindings=[worker,lease,now,now,hardware,boot,metadata];
  const results=await e.batch([
    e.stmt(`UPDATE sb_sessions SET mouse_enabled=1,input_end=CASE WHEN ui_blocked=1 THEN 0 ELSE (${live}) END,
      control_epoch=CASE WHEN mouse_enabled=1 AND mouse_grant_request=? THEN control_epoch ELSE control_epoch+1 END,
      mouse_grant_request=?,grant_source=? WHERE id=? AND owner_id=? AND device_id=? AND broadcast_id=? AND state='active'
      AND control_protocol='share.v1' AND blocked=0 AND (idle_seconds=0 OR max(created_at,last_tool_at)+idle_seconds*1000>max(?,${clock}))
      AND capture_state='active' AND mode='broadcast' AND EXISTS(${live}) AND
      ((control_epoch=? AND (?=0 OR mouse_enabled=0) AND EXISTS(SELECT 1 FROM sb_share_control WHERE ${ledger} AND ${gate}))
      OR (${retry} AND EXISTS(SELECT 1 FROM sb_share_control WHERE ${ledger} AND intent_seq=? AND stopped=0)))`,
      ...bindings,request,request,automatic?"automatic":"manual",session,...scope,now,...bindings,expected,automatic?1:0,...scope,intent,request,expected+1,...scope,intent),
    e.stmt(`UPDATE sb_share_control SET stopped=0,intent_seq=?,automatic=CASE WHEN ? THEN 1 ELSE automatic END
      WHERE ${ledger} AND intent_seq<? AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=? AND mouse_enabled=1
      AND mouse_grant_request=? AND control_epoch=?) AND changes()=1`,
      intent,!automatic&&b.first_choice_automatic===true?1:0,...scope,intent,session,request,expected+1),
  ]);
  need(results[0].meta.changes===1,"STALE_CONTROL_EPOCH");
}

// Resolve the original broadcast even if T112 has already replaced its session.
export async function stopShare(e:BridgeEngine,d:Device,b:Record<string,unknown>) {
  const session=uuid(b.bridge_session_id),seq=b.intent_seq==null?null:integer(b.intent_seq,1);
  // A modern stop is authenticated for this phone and names the broadcast.
  // Its issuing session may already have been purged by T112/retention.
  const target=seq===null
    ? "(SELECT broadcast_id FROM sb_sessions WHERE id=? AND device_id=? AND owner_id=? AND state='active' AND control_epoch=?)"
    : "?";
  const keys=seq===null?[session,d.id,d.owner_id,integer(b.expected_control_epoch)]:[uuid(b.broadcast_id)];
  const result=await e.batch([
    e.stmt(`UPDATE sb_share_control SET stopped=1,intent_seq=coalesce(?,intent_seq+1)
      WHERE owner_id=? AND device_id=? AND broadcast_id=${target}
      AND (? IS NULL OR intent_seq<? OR (intent_seq=? AND stopped=0))`,
      seq,d.owner_id,d.id,...keys,seq,seq,seq),
    e.stmt(`UPDATE sb_sessions SET mouse_enabled=0,input_end=0,control_epoch=control_epoch+1,mouse_grant_request=?
      WHERE changes()=1 AND owner_id=? AND device_id=? AND state='active' AND broadcast_id=${target}`,
      stopMarker,d.owner_id,d.id,...keys),
    e.stmt(`SELECT intent_seq FROM sb_share_control WHERE owner_id=? AND device_id=? AND broadcast_id=${target}`,
      d.owner_id,d.id,...keys),
  ]);
  return {stopped:true,processed_intent_seq:result[2].results[0]?.intent_seq??null,scope_matched:result[0].meta.changes===1,target_bridge_session_id:session,
    target_control_epoch:b.expected_control_epoch,board_release_confirmed:false};
}

export function foregroundUpdate(body: Record<string,unknown>) {
  const token = typeof body.ui_generation==="string" ? uuid(body.ui_generation) : null;
  const blocked = body.control_protocol!==shareProtocol || token===null || body.ui_background!==true ? 1 : 0;
  const seconds = body.idle_timeout_seconds===1800 || body.idle_timeout_seconds===3600 ? body.idle_timeout_seconds:0;
  const expired = `(idle_seconds>0 AND max(created_at,last_tool_at)+idle_seconds*1000<=${clock})`;
  const visibility = body.capture_visibility;
  const capture = visibility === undefined ? null : uuid(body.capture_visibility_generation);
  need(!capture || (body.heartbeat_seq != null && ["hidden","protected","waiting"].includes(String(visibility))), "INVALID_CAPTURE_VISIBILITY", 422);
  const captureSQL = capture ? "capture_generation=?,capture_hidden=?," : "";
  return {sql:`${captureSQL}blocked=CASE WHEN ${expired} THEN 1 ELSE blocked END,
    idle_seconds=CASE WHEN control_protocol='legacy' THEN 0 WHEN ${expired} THEN idle_seconds ELSE ? END,
    mouse_enabled=CASE WHEN ${expired} THEN 0 ELSE mouse_enabled END,ui_generation=?,ui_blocked=?,control_epoch=control_epoch+
    CASE WHEN mouse_enabled=1 AND control_protocol='share.v1' AND (ui_generation IS NOT ? OR ui_blocked<>? OR ${expired}) THEN 1 ELSE 0 END,
    input_end=CASE WHEN control_protocol='legacy' THEN input_end WHEN ? OR ${expired} THEN 0 WHEN mouse_enabled=1 THEN
    (SELECT min(worker_expires,CASE WHEN ?>0 THEN max(sb_sessions.created_at,sb_sessions.last_tool_at)+?*1000 ELSE worker_expires END) FROM sb_devices WHERE id=sb_sessions.device_id) ELSE 0 END`,
    values:[...(capture ? [capture,visibility === "protected" ? 2 : visibility === "hidden" ? 1 : 0] : []),seconds,token,blocked,token,blocked,blocked,seconds,seconds]};
}
