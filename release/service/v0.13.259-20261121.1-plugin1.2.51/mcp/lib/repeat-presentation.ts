import {finite,integer,need,record,uuid} from "./bridge-engine.ts";
import {staticProofKey,type CaptureFreshness} from "./static-screen-freshness.ts";

export type RepeatPresentation={frame:string|null;captureMono:number|null;phoneMono:number;sequence:number;probe:string;offset:number;knownFrame:string|null;contentHash:string|null;
  source:{capture:number;width:number;height:number;orientation:string;epoch:number}|null};
export function repeatPresentation(body:unknown,heartbeatSequence:number|null):RepeatPresentation|null {
  if(body==null)return null;
  const value=record(body);
  need(value.is_repeated===true&&heartbeatSequence!==null,"INVALID_REPEAT_PRESENTATION",422);
  const sequence=integer(value.presentation_seq,1);
  need(sequence===heartbeatSequence,"INVALID_REPEAT_PRESENTATION",422);
  need(value.resolution==null||value.resolution==="latest_accepted","INVALID_REPEAT_PRESENTATION",422);
  const latest=value.resolution==="latest_accepted";
  const captureMono=latest?null:finite(value.capture_mono_ms,0,Number.MAX_SAFE_INTEGER);
  const phoneMono=finite(value.presentation_mono_ms,captureMono??0,Number.MAX_SAFE_INTEGER);
  const quiet=finite(value.source_quiet_ms,1000,Number.MAX_SAFE_INTEGER);
  finite(value.clock_rtt_ms,0,2000);
  const frame=latest?null:uuid(value.frame_id),knownFrame=value.known_frame_id==null?frame:uuid(value.known_frame_id);
  const contentHash=value.source_content_sha256==null?null:String(value.source_content_sha256);
  need(contentHash===null||/^[a-f0-9]{64}$/.test(contentHash),"INVALID_REPEAT_SOURCE_CONTENT",422);
  let source:RepeatPresentation["source"]=null;
  if(latest){
    const capture=finite(value.source_capture_mono_ms,0,phoneMono);
    need(phoneMono-capture>=1000&&Math.abs(phoneMono-capture-quiet)<0.1,"INVALID_REPEAT_SOURCE_CLOCK",422);
    const orientation=String(value.source_orientation);
    need(["portrait","portrait_upside_down","landscape_left","landscape_right"].includes(orientation),"INVALID_ORIENTATION",422);
    source={capture,width:integer(value.source_width,2,8192),height:integer(value.source_height,2,8192),orientation,epoch:integer(value.source_orientation_epoch,0)};
  }
  return {frame,captureMono,phoneMono,sequence,probe:uuid(value.clock_probe_id),offset:finite(value.presentation_offset_ms,0,60000),knownFrame,source,contentHash};
}

export function repeatPresentationQuery(o:{repeat:RepeatPresentation;device:string;owner:string;session:string;worker:string;lease:number;nonce:string;now:number;freshness?:CaptureFreshness|null},databaseNowSQL:string){
  const r=o.repeat;
  const match=(r.source?"AND json_extract(metadata,'$.capture_mono_ms')<=?+0.01 AND json_extract(metadata,'$.native_width_px')=? AND json_extract(metadata,'$.native_height_px')=? AND json_extract(metadata,'$.orientation')=? AND json_extract(metadata,'$.orientation_epoch')=? ":
    "AND frame_id=? AND json_extract(metadata,'$.capture_mono_ms')=? ")+(r.contentHash===null?"":"AND json_extract(metadata,'$.content_sha256')=? ");
  const matchValues=r.source?[r.source.capture,r.source.width,r.source.height,r.source.orientation,r.source.epoch]:[r.frame,r.captureMono];
  if(r.contentHash!==null)matchValues.push(r.contentHash);
  return {sql:"WITH anchor AS (SELECT created_at+?-50 AS lower_bound FROM sb_clock_probes WHERE id=? AND device_id=? AND expires_at>? AND expires_at>"+databaseNowSQL+") "+
    "UPDATE sb_frames SET metadata=json_set(metadata,'$."+staticProofKey+"',json(?)),repeat_presented_at=(SELECT lower_bound FROM anchor),repeat_received_at=?,repeat_phone_mono_ms=?,repeat_sequence=?,expires_at=? "+
    "WHERE device_id=? AND owner_id=? AND session_id=? AND lease_epoch=? AND expires_at>? AND length(inline_jpeg)>0 AND capture_lower IS NOT NULL "+
    "AND json_extract(metadata,'$.capture_clock_verified')=1 AND json_extract(metadata,'$.capture_mono_ms')<=? "+match+
    "AND ?>repeat_sequence AND (repeat_phone_mono_ms IS NULL OR ?>repeat_phone_mono_ms) "+
    "AND EXISTS(SELECT 1 FROM anchor WHERE lower_bound<=? AND lower_bound>"+databaseNowSQL+"-1500) "+
    "AND EXISTS(SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session WHERE d.id=sb_frames.device_id AND d.owner_id=? AND d.revoked=0 "+
    "AND d.current_session=sb_frames.session_id AND d.worker_id=? AND d.lease_epoch=sb_frames.lease_epoch AND d.worker_expires>? AND d.heartbeat_write_token=? "+
    "AND s.owner_id=d.owner_id AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active') "+
    "RETURNING image_key,frame_id,repeat_presented_at,repeat_received_at,CASE WHEN frame_id=? THEN NULL ELSE metadata END AS reference_metadata",
    values:[r.offset,r.probe,o.device,o.now,JSON.stringify(o.freshness??null),o.now,r.phoneMono,r.sequence,o.now+30000,o.device,o.owner,o.session,o.lease,o.now,
      r.phoneMono,...matchValues,r.sequence,r.phoneMono,o.now+100,o.owner,o.worker,o.now,o.nonce,r.knownFrame]};
}
