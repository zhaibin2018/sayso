// Server-only evidence in the existing repeated-presentation row. A normal
// frame/observation replaces metadata; each newer heartbeat clears this proof.
export const staticProofKey = "_static_freshness";
// Heartbeats run every 2.5 s and each request takes about 1 s, so successful
// receipts are often over 3 s apart. Five seconds allows about two cycles.
// max_age_ms describes capture age; it must not tighten this proof lifetime.
export const staticHeartbeatLimitMS = 5000;
export const staticAfterWaitMS = 1500;
export function staticConditions(...conditions:string[]):string {
  if(conditions.length===1)return conditions[0];
  const mid=Math.floor(conditions.length/2);
  return `(${staticConditions(...conditions.slice(0,mid))} AND ${staticConditions(...conditions.slice(mid))})`;
}
export type CaptureFreshness = {sharing_state:"active";last_callback_age_ms:number;last_callback_source_seq:number};
export function captureFreshness(value:unknown):CaptureFreshness|null {
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const v=value as Record<string,unknown>,age=v.last_callback_age_ms,seq=v.last_callback_source_seq;
  return v.sharing_state==="active"&&typeof age==="number"&&Number.isFinite(age)&&age>=1000&&age<=Number.MAX_SAFE_INTEGER&&
    typeof seq==="number"&&Number.isSafeInteger(seq)&&seq>0?
    {sharing_state:"active",last_callback_age_ms:age,last_callback_source_seq:seq}:null;
}

export function clearStaticProofQuery(device:{id:string;owner_id:string},session:string,body:Record<string,unknown>,nonce:string) {
  return {sql:`UPDATE sb_frames SET metadata=json_remove(metadata,'$.${staticProofKey}')
    WHERE device_id=? AND owner_id=? AND session_id=? AND lease_epoch=?
    AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=sb_frames.device_id AND d.worker_id=? AND d.heartbeat_write_token=?)`,
    values:[device.id,device.owner_id,session,Number(body.lease_epoch),String(body.worker_id),nonce]};
}
type RepeatedFrame = {capture_lower:number|null;repeat_received_at?:number|null;repeat_presented_at?:number|null;repeat_phone_mono_ms?:number|null};
export function staticFrameEligible(frame:RepeatedFrame&{static_eligible?:number},now:number,freshCapture=false) {
  return !freshCapture&&frame.static_eligible===1&&staticScreenAtRelease(staticReleaseMetadata(frame),now)!==null;
}
export function staticReleaseMetadata(frame:RepeatedFrame) {
  return {usable_for_input:false,is_repeated:true,capture_lower_server_utc_ms:frame.capture_lower,
    static_screen:{proven:true,heartbeat_received_at_server_utc_ms:frame.repeat_received_at,
      presentation_lower_server_utc_ms:frame.repeat_presented_at}};
}
export function staticScreenResult(value:Record<string,unknown>,compact:Record<string,unknown>,
  frame:RepeatedFrame,freshness:CaptureFreshness,now:number,command?:{id:string;state:unknown;ack:unknown}) {
  const after=command?{command_id:command.id,command_state:command.state,
    relation:"no_callback_after_phone_board_ack",scope_matches_at_snapshot:true,
    phone_ack_mono_ms:command.ack,app_effect_observed:false}:undefined;
  return {...value,state:"repeated",image_ref:undefined,
    metadata:{...compact,stale:true,is_repeated:true,current_screen_confirmed:true,usable_for_input:!command,
      static_screen:{...staticReleaseMetadata(frame).static_screen,...freshness,
        unchanged_for_ms:freshness.last_callback_age_ms+Math.max(0,now-frame.repeat_received_at!)}},
    ...(after?{after_command:after,warning:"ACTION_NO_SCREEN_CHANGE"}:{}),
    note:after?"动作后画面没有变化，可能没有点中或没有生效；这不是成功确认。 No screen change after the action; it may have missed or had no effect. This does not confirm success.":
      "画面自最后一次视频回调起没有变化，可照常操作；执行前会复核，收到 SCREEN_CHANGED_SINCE_IMAGE 请重新读屏。 Heartbeat-proven static pixels may be used for input; re-read on SCREEN_CHANGED_SINCE_IMAGE. Original capture time is preserved.",
  };
}

export function legacyRepeatedResult(value:Record<string,unknown>,compact:Record<string,unknown>,
  metadata:Record<string,unknown>,frame:RepeatedFrame,now:number) {
  return {...value,state:"repeated",image_ref:undefined,
    metadata:{...compact,stale:true,is_repeated:true,original_captured_at:metadata.captured_at,
      presentation_lower_server_utc_ms:frame.repeat_presented_at,presentation_received_at_ms:frame.repeat_received_at,
      presentation_phone_mono_ms:frame.repeat_phone_mono_ms,presentation_age_ms:Math.max(0,now-frame.repeat_presented_at!),
      presented_at:new Date(frame.repeat_received_at!).toISOString(),current_screen_confirmed:false,usable_for_input:false},
    note:"Repeated last captured image, not a new capture. Original capture time is preserved; the presentation timestamp is current. Do not use this image for input targeting or post-command confirmation."};
}

/** Aliases f/c/(optional) a belong to the same atomic screen snapshot. */
export function staticScreenSQL(clock:string,after=false,inputExclusions?:string[]) {
  const p=(key:string)=>`json_extract(f.metadata,'$.${staticProofKey}.${key}')`;
  const capture="json_extract(f.metadata,'$.capture_mono_ms')";
  const commandClock="m.phone_ack_mono_ms";
  // An in-flight/unknown action may already have executed. Terminal records
  // without an authenticated phone time also cannot prove capture ordering.
  const action=`NOT EXISTS(SELECT 1 FROM sb_mouse_commands m WHERE m.owner_id=f.owner_id AND m.device_id=f.device_id
    AND m.session_id=f.session_id ${inputExclusions?"":"AND m.kind<>'pointer.move_absolute'"}
    AND m.state NOT IN ('queued','cancelled','expired','embedded')
    AND NOT(m.state='failed' AND COALESCE(m.error,'')='SCREEN_CHANGED_SINCE_IMAGE' AND m.input_attempted IS 0)
    ${after?"AND m.id<>a.id":""}
    ${inputExclusions?.map(id=>`AND m.id<>COALESCE(${id},'')`).join(" ")??""}
    AND (m.state IN ('claimed','executing','outcome_unknown') OR ${commandClock} IS NULL OR ${commandClock}>=${capture}))`;
  const base=staticConditions("f.capture_lower IS NOT NULL",`f.capture_lower<=${clock}`,`f.expires_at>${clock}`,
    "json_extract(f.metadata,'$.provenance')='device_capture'","json_extract(f.metadata,'$.capture_clock_verified')=1",
    "json_extract(f.metadata,'$.worker_id')=c.candidate_worker_id","json_extract(f.metadata,'$.bridge_session_id')=c.candidate_session",
    "json_extract(f.metadata,'$.lease_epoch')=c.lease_epoch","json_extract(f.metadata,'$.broadcast_id')=c.candidate_broadcast_id",
    `${p("sharing_state")}='active'`,`${p("last_callback_source_seq")}=json_extract(f.metadata,'$.source_seq')`,
    `${p("last_callback_source_seq")}>0`,`${p("last_callback_age_ms")}>=1000`,"f.repeat_sequence=c.candidate_heartbeat_seq",
    `f.repeat_received_at<=${clock}`,`f.repeat_received_at>${clock}-${staticHeartbeatLimitMS}`,
    `f.repeat_presented_at<=${clock}`,`f.repeat_presented_at>${clock}-${staticHeartbeatLimitMS}`,
    `f.repeat_phone_mono_ms-${p("last_callback_age_ms")}>=${capture}`,action);
  const sql=`(${base}${after?` AND a.state='board_acked' AND a.worker_id=c.candidate_worker_id
    AND a.lease_epoch=c.lease_epoch AND a.control_epoch=c.candidate_control_epoch
    AND a.phone_ack_mono_ms>=${capture}
    AND f.repeat_phone_mono_ms-a.phone_ack_mono_ms>=${staticAfterWaitMS}
    AND ${p("last_callback_age_ms")}>=f.repeat_phone_mono_ms-a.phone_ack_mono_ms`:""})`;
  return inputExclusions?sql.replaceAll("c.candidate_worker_id","d.worker_id").replaceAll("c.candidate_session","s.id")
    .replaceAll("c.lease_epoch","d.lease_epoch").replaceAll("c.candidate_broadcast_id","s.broadcast_id")
    .replaceAll("c.candidate_heartbeat_seq","d.heartbeat_seq"):sql;
}

/** Called again after image serialization; never substitutes presentation age
 * for the original capture age. Only server-created metadata opts in. */
export function staticScreenAtRelease(metadata:Record<string,unknown>,now:number) {
  const proof=metadata.static_screen;
  if(!proof||typeof proof!=="object"||Array.isArray(proof)||metadata.is_repeated!==true||typeof metadata.usable_for_input!=="boolean")return null;
  const p=proof as Record<string,unknown>;
  const received=p.heartbeat_received_at_server_utc_ms,presented=p.presentation_lower_server_utc_ms,captured=metadata.capture_lower_server_utc_ms;
  if(p.proven!==true||![received,presented,captured,now].every(v=>typeof v==="number"&&Number.isFinite(v)))return null;
  const age=now-Number(received),presentedAge=now-Number(presented),captureAge=now-Number(captured);
  return age>=0&&age<staticHeartbeatLimitMS&&presentedAge>=0&&presentedAge<staticHeartbeatLimitMS&&captureAge>=0?captureAge:null;
}

/** Recheck current authority and the action barrier after serialization. */
export async function staticReleaseAuthorized(db:D1Database,owner:string,metadata:Record<string,unknown>,commandID:string|null) {
  if(typeof metadata.device_id!=="string"||typeof metadata.frame_id!=="string"||typeof metadata.frame_seq!=="number")return false;
  const after=commandID!==null;
  const sql=`WITH c AS (SELECT d.id,d.lease_epoch,d.worker_id AS candidate_worker_id,
    d.heartbeat_seq AS candidate_heartbeat_seq,s.id AS candidate_session,s.broadcast_id AS candidate_broadcast_id,
    s.control_epoch AS candidate_control_epoch FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session
    AND s.device_id=d.id AND s.owner_id=d.owner_id WHERE d.owner_id=? AND d.id=? AND d.revoked=0
    AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND d.worker_expires>${releaseClock})
    SELECT 1 AS valid FROM c JOIN sb_frames f ON f.device_id=c.id AND f.owner_id=?
    AND f.session_id=c.candidate_session AND f.lease_epoch=c.lease_epoch
    ${after?"JOIN sb_mouse_commands a ON a.id=? AND a.device_id=f.device_id AND a.owner_id=f.owner_id AND a.session_id=f.session_id":""}
    WHERE f.frame_id=? AND f.frame_seq=? AND ${staticScreenSQL(releaseClock,after)}`;
  const values=[owner,metadata.device_id,owner,...(after?[commandID!]:[]),metadata.frame_id,metadata.frame_seq];
  return (await db.prepare(sql).bind(...values).first<{valid:number}>())?.valid===1;
}
const releaseClock="CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)";
