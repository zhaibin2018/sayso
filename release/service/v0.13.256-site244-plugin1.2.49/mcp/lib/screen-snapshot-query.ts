import {staticScreenSQL} from "./static-screen-freshness.ts";
import {confirmedSystemSearchReceiptSQL} from "./source-view-proof.ts";
import {visualReadPointCapability} from "./compound-query-view-proof.ts";

export const databaseNowSQL = "CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)";
type Options={owner:string;selected:string|null;now:number;maxAge:number;hints:string[];conditionalHint:string|null;afterCommand:string|null;afterMinGapMS?:number;allowRepeated?:boolean;staticFreshness?:boolean;pointerPlan?:string|null;pointerCompletedOnly?:boolean;readyCueCommandID?:string;includeReadTime?:boolean;strictAgeCutoff?:boolean;visualPoint?:boolean;currentInput?:"focused_text"|"scroll"|"drag"|"click"|"system_search"|"parked_move"};
export type ScreenSnapshotRoute={candidate_id:string;candidate_name:string;candidate_session:string;candidate_capture_state:string;candidate_expires:number;candidate_lease_epoch:number;candidate_worker_id:string;candidate_control_epoch:number;
  after_id?:string|null;after_device_id?:string|null;after_session_id?:string|null;after_worker_id?:string|null;after_lease_epoch?:number|null;after_control_epoch?:number|null;after_state?:string|null;after_ack_mono_ms?:number|null;after_expires_at?:number|null;after_live_input?:string|null;d1_read_at_utc_ms?:number;visual_point_scope?:string|null;static_eligible?:number};

/** Same snapshot as the frame, only for an opted-in current input scope. */
export function visualPointScopeSQL(device:string,session:string,owner:string,clock:string) {
  return `(SELECT json_object('hardware',h.hardware_id,'boot',h.board_boot_id,'mouseUntil',s.mouse_until,
       'broadcast',s.broadcast_id,'control',s.control_epoch)
    FROM sb_sessions s JOIN sb_hardware h ON h.device_id=s.device_id AND h.owner_id=s.owner_id
    WHERE s.id=${session} AND s.device_id=${device} AND s.owner_id=${owner}
      AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active'
      AND s.mouse_enabled=1 AND s.mouse_until>${clock} AND h.usb_connected=1
      AND json_type(h.metadata,'$.capabilities."${visualReadPointCapability}"')='true')`;
}

/** One authorization/pixel/optional-command snapshot; no separate routing read. */
export function screenSnapshotQuery(o:Options){
  const after=o.afterCommand!==null;
  const staticGate=o.staticFreshness?staticScreenSQL(databaseNowSQL,after):"0";
  const pointer=o.pointerPlan??null,routed=after||pointer!==null;
  const routing=routed?" AND d.id=(SELECT device_id FROM sb_mouse_commands WHERE id=? AND owner_id=?"+(pointer!==null?" AND kind='pointer.local_plan'":"")+")":"";
  const pointerTerminalGate=o.pointerCompletedOnly?" AND pc.state='succeeded' AND pc.result_digest IS NOT NULL":"";
  const pointerGate=pointer===null?"":" AND EXISTS(SELECT 1 FROM sb_mouse_commands pc WHERE pc.id=? AND pc.owner_id=? AND pc.kind='pointer.local_plan' AND pc.device_id=c.candidate_id AND pc.session_id=c.candidate_session AND pc.worker_id=c.candidate_worker_id AND pc.lease_epoch=c.lease_epoch AND pc.control_epoch=c.candidate_control_epoch"+pointerTerminalGate+" AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(pc.receipt) THEN json_extract(pc.receipt,'$.events') ELSE '[]' END) e WHERE e.type='object' AND json_extract(e.value,'$.phase')='click_acked' AND json_type(e.value,'$.phone_ack_mono_s') IN ('integer','real') AND json_extract(e.value,'$.phone_ack_mono_s')>=0))";
  const liveInputKind=o.currentInput==="focused_text"?"a.kind='keyboard.type_text' AND json_extract(a.receipt,'$.spotlight.mouse_mode_confirmed')=1":
    o.currentInput==="scroll"?"a.kind='pointer.scroll' AND a.result_digest IS NOT NULL":
    o.currentInput==="system_search"?confirmedSystemSearchReceiptSQL("a"):
    o.currentInput==="click"?"a.kind='pointer.click' AND a.result_digest IS NOT NULL":
    o.currentInput==="drag"?"a.kind='pointer.drag_absolute'":
    o.currentInput==="parked_move"?"a.kind='pointer.move_absolute' AND a.result_digest IS NOT NULL":
    "a.kind='pointer.click' AND a.predecessor_id IS NOT NULL";
  const liveInputBoot=o.currentInput==="focused_text"?"json_extract(a.receipt,'$.spotlight.restored_mouse_boot_id')":"a.board_boot_id";
  const afterFields=after?",a.id AS after_id,a.device_id AS after_device_id,a.session_id AS after_session_id,a.worker_id AS after_worker_id,a.lease_epoch AS after_lease_epoch,a.control_epoch AS after_control_epoch,a.state AS after_state,a.phone_ack_mono_ms AS after_ack_mono_ms,a.expires_at AS after_expires_at"+
    ",(SELECT json_object('mouseUntil',s.mouse_until,'broadcast',s.broadcast_id,'hardware',h.hardware_id,'boot',h.board_boot_id) FROM sb_sessions s JOIN sb_hardware h ON h.device_id=s.device_id AND h.owner_id=s.owner_id WHERE "+liveInputKind+" AND a.state='board_acked' AND s.id=c.candidate_session AND s.device_id=c.candidate_id AND s.owner_id=a.owner_id AND s.state='active' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.control_epoch=a.control_epoch AND h.usb_connected=1 AND h.hardware_id=a.hardware_id AND h.board_boot_id="+liveInputBoot+") AS after_live_input":"";
  const scope="a.device_id=c.candidate_id AND a.session_id=c.candidate_session AND a.worker_id=c.candidate_worker_id AND a.lease_epoch=c.lease_epoch AND a.control_epoch=c.candidate_control_epoch";
  const postGate=after?" AND "+scope+" AND a.state='board_acked' AND a.phone_ack_mono_ms>=0 AND json_extract(f.metadata,'$.capture_clock_verified')=1 AND json_type(f.metadata,'$.capture_mono_ms') IN ('integer','real') AND json_extract(f.metadata,'$.worker_id')=a.worker_id AND (json_extract(f.metadata,'$.capture_mono_ms')>a.phone_ack_mono_ms+? OR "+staticGate+")":"";
  // Keep the latest frame metadata for readiness and scope checks. Only
  // return its JPEG bytes when the requested command's cue is present.
  const cueGate=o.readyCueCommandID===undefined?"":" AND (json_extract(f.metadata,'$.ready_cue_command_id')=? OR "+staticGate+")";
  // An explicit command produces a metadata-only row even when its current
  // session is absent, so unknown/foreign commands cannot masquerade as a
  // request to start broadcasting. The owner guard still hides revoked rows.
  const from=after?"FROM counts n LEFT JOIN candidates c ON 1=1":"FROM candidates c CROSS JOIN counts n";
  const join=after?" LEFT JOIN sb_mouse_commands a ON a.id=? AND a.owner_id=? AND EXISTS(SELECT 1 FROM sb_devices ad WHERE ad.id=a.device_id AND ad.owner_id=a.owner_id AND ad.revoked=0)":"";
  // A pending or mismatched receipt has no usable frame metadata or pixels.
  const frameJoin=" LEFT JOIN sb_frames f ON f.device_id=c.candidate_id AND f.owner_id=? AND f.session_id=c.candidate_session AND f.lease_epoch=c.lease_epoch"+(after?" AND a.state='board_acked' AND "+scope:"");
  const diagnosticTime=o.includeReadTime?","+databaseNowSQL+" AS d1_read_at_utc_ms":"";
  const visualScope=o.visualPoint&&pointer===null?",CASE WHEN n.active_count=1 AND c.candidate_capture_state='active' THEN "+
    visualPointScopeSQL("c.candidate_id","c.candidate_session","f.owner_id",databaseNowSQL)+" END AS visual_point_scope":"";
  const sql="WITH candidates AS (SELECT d.id AS candidate_id,d.name AS candidate_name,d.current_session AS candidate_session,d.worker_expires AS candidate_expires,d.lease_epoch,d.worker_id AS candidate_worker_id,s.control_epoch AS candidate_control_epoch,s.broadcast_id AS candidate_broadcast_id,d.heartbeat_seq AS candidate_heartbeat_seq,s.capture_state AS candidate_capture_state FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id WHERE d.owner_id=? AND s.owner_id=? AND d.revoked=0 AND (s.capture_state='paused' OR d.worker_expires>?) AND s.state='active' AND s.mode='broadcast' AND s.capture_state IN ('active','paused') AND (? IS NULL OR d.id=?)"+routing+" ORDER BY (s.capture_state='active') DESC,d.created_at DESC LIMIT 2), counts AS (SELECT count(*) AS active_count FROM candidates WHERE candidate_capture_state='active') SELECT c.candidate_id,c.candidate_name,c.candidate_session,c.candidate_expires,c.candidate_capture_state,c.lease_epoch AS candidate_lease_epoch,c.candidate_worker_id,c.candidate_control_epoch,f.device_id,f.owner_id,f.session_id,f.frame_id,f.frame_seq,f.lease_epoch,f.image_key,f.sha256,f.metadata,f.capture_lower,f.received_at,f.expires_at,f.storage_ready,f.repeat_presented_at,f.repeat_received_at,f.repeat_phone_mono_ms,f.repeat_sequence,"+(o.staticFreshness?"CASE WHEN "+staticGate+" THEN 1 ELSE 0 END AS static_eligible,":"")+"CASE WHEN n.active_count=1 AND c.candidate_capture_state='active' AND ((f.capture_lower"+(o.strictAgeCutoff?">":">=")+"? AND f.capture_lower<=?) OR (?=1 AND f.repeat_presented_at>=? AND f.repeat_presented_at<=? AND f.repeat_phone_mono_ms>=json_extract(f.metadata,'$.capture_mono_ms')) OR "+staticGate+") AND f.expires_at>? AND NOT EXISTS(SELECT 1 FROM json_each(?) h WHERE h.value=f.image_key) AND (? IS NULL OR substr(f.sha256,1,8)<>?)"+postGate+cueGate+pointerGate+" THEN f.inline_jpeg ELSE NULL END AS inline_jpeg"+afterFields+diagnosticTime+visualScope+" "+from+join+frameJoin;
  return {sql,values:[o.owner,o.owner,o.now,o.selected,o.selected,...(routed?[after?o.afterCommand:pointer,o.owner]:[]),o.now-o.maxAge,o.now+250,!after&&o.allowRepeated?1:0,o.now-o.maxAge,o.now+100,o.now,JSON.stringify(o.hints),o.conditionalHint,o.conditionalHint,...(after?[o.afterMinGapMS??0]:[]),...(o.readyCueCommandID===undefined?[]:[o.readyCueCommandID]),...(pointer===null?[]:[pointer,o.owner]),...(after?[o.afterCommand,o.owner]:[]),o.owner]};
}
