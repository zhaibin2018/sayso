import {frameAcceptanceEvidenceSQL} from "./frame-acceptance-evidence.ts";
type Options={tokenHash:string;now:number;meta:Record<string,unknown>|undefined;eligible:boolean};
type Query={sql:string;values:unknown[]};

/** All normal observation authority, reference and clock checks share one D1
 * transaction. No device/owner identifier is trusted from the JSON body. */
export function authenticatedObservationPlan(o:Options,databaseNowSQL:string):Query[]{
  const auth="SELECT id,owner_id,token_expires,confirmed_at FROM sb_devices WHERE token_hash=? AND revoked=0 AND token_expires>? AND token_expires>"+databaseNowSQL+" LIMIT 1";
  const query=(tail:string,...values:unknown[]):Query=>({sql:"WITH auth AS ("+auth+") "+tail,values:[o.tokenHash,o.now,...values]});
  const plan=[query("SELECT id,owner_id,token_expires,confirmed_at FROM auth"),
    query("UPDATE sb_devices SET confirmed_at=? WHERE id=(SELECT id FROM auth) AND confirmed_at IS NULL",o.now)];
  if(!o.eligible || !o.meta)return plan;
  const m=o.meta;
  plan.push(query("SELECT id FROM sb_observations WHERE id=(SELECT id FROM auth)||':'||?",m.frame_id));
  plan.push(query(
    ", anchor AS (SELECT p.created_at+?-50 AS lower_bound FROM sb_clock_probes p JOIN auth a ON a.id=p.device_id WHERE p.id=? AND p.expires_at>? AND p.expires_at>"+databaseNowSQL+")"+
    ", checked AS (SELECT lower_bound,CASE WHEN ?<=2000 AND ABS(?-lower_bound)<=30000 THEN lower_bound ELSE NULL END AS verified_lower FROM anchor)"+
    " UPDATE sb_frames SET frame_id=?,frame_seq=?,lease_epoch=?,metadata=?,repeat_presented_at=NULL,repeat_received_at=NULL,repeat_phone_mono_ms=NULL,repeat_sequence=0,capture_lower=(SELECT verified_lower FROM checked),received_at=?,expires_at=?"+
    " WHERE device_id=(SELECT id FROM auth) AND owner_id=(SELECT owner_id FROM auth) AND session_id=? AND sha256=? AND expires_at>? AND expires_at>"+databaseNowSQL+
    " AND length(inline_jpeg)>0 AND frame_seq<? AND json_extract(metadata,'$.capture_mono_ms')<? AND json_extract(metadata,'$.orientation_epoch')<=? AND json_extract(metadata,'$.width')=? AND json_extract(metadata,'$.height')=?"+
    " AND NOT EXISTS(SELECT 1 FROM sb_observations o WHERE o.id=sb_frames.device_id||':'||?)"+
    " AND EXISTS(SELECT 1 FROM checked c JOIN sb_devices d ON d.id=sb_frames.device_id JOIN sb_sessions s ON s.id=d.current_session JOIN auth a ON a.id=d.id AND a.owner_id=d.owner_id"+
    " WHERE c.lower_bound<=? AND c.verified_lower>"+databaseNowSQL+"-1500 AND s.owner_id=a.owner_id AND d.current_session=? AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND d.worker_expires>"+databaseNowSQL+
    " AND s.id=sb_frames.session_id AND s.broadcast_id=? AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active')",
    m.capture_offset_ms,m.clock_probe_id,o.now,m.clock_rtt_ms,Date.parse(String(m.captured_at)),m.frame_id,m.frame_seq,m.lease_epoch,JSON.stringify(m),o.now,o.now+30_000,
    m.bridge_session_id,m.content_sha256,o.now,m.frame_seq,m.capture_mono_ms,m.orientation_epoch,m.width,m.height,m.frame_id,o.now+100,m.bridge_session_id,m.worker_id,m.lease_epoch,o.now,m.broadcast_id));
  // Insert only after an authorized UPDATE succeeded. A miss/invalid token
  // cannot erase a pre-existing replay marker. This bookkeeping completes the
  // same already-authorized write even if its token expires a moment later.
  plan.push({sql:"INSERT INTO sb_observations(id,device_id,frame_id,created_at) SELECT device_id||':'||frame_id,device_id,frame_id,? FROM sb_frames WHERE changes()=1 AND frame_id=? AND device_id=(SELECT id FROM sb_devices WHERE token_hash=? LIMIT 1)",values:[o.now,m.frame_id,o.tokenHash]});
  plan.push(query("SELECT f.device_id,f.owner_id,f.image_key,f.capture_lower,f.storage_ready FROM sb_frames f JOIN auth a ON a.id=f.device_id AND a.owner_id=f.owner_id WHERE f.session_id=? AND f.frame_id=?",m.bridge_session_id,m.frame_id));
  // Scope is derived from the authenticated frame just written, never an
  // unauthenticated JSON device ID. A failed UPDATE has no matching marker.
  plan.push(query(frameAcceptanceEvidenceSQL(databaseNowSQL).replace("WHERE id=?","WHERE id=(SELECT id FROM auth)||':'||?"),m.frame_id));
  return plan;
}
