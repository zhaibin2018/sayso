import {atomicState} from "./hot-path-context.ts";
import {clockJSON} from "./event-clock.ts";
import {integer,record,uuid,uid,iso,need,type BridgeEngine,type Device} from "./bridge-engine.ts";
import {databaseNowSQL as clock} from "./screen-snapshot-query.ts";

/** Auth/clock/confirmation are prefixed by the request transaction context. */
export async function clockProbeRequest(e:BridgeEngine,body:Record<string,unknown>){
  const a=atomicState()!;
  let scope:{session:string;broadcast:string;worker:string;lease:number}|undefined;
  try{if(body.frame_permit_scope!==undefined){const s=record(body.frame_permit_scope);scope={session:uuid(s.bridge_session_id),broadcast:uuid(s.broadcast_id),worker:uuid(s.worker_id),lease:integer(s.lease_epoch,1)};}}catch{/* Optional invalid scope gets a probe, never a permit. */}
  type Probe={created_at:number;expires_at:number};
  type Authority=Probe&{id:string;owner_id:string;token_expires:number;worker_expires:number};
  const eligible=(id:string)=>e.stmt(`SELECT d.id,d.owner_id,d.token_expires,d.worker_expires,p.created_at,p.expires_at
    FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id
    JOIN sb_clock_probes p ON p.id=? AND p.device_id=d.id
    WHERE d.token_hash=? AND d.revoked=0 AND d.token_expires>${clock} AND d.worker_expires>${clock} AND p.expires_at>${clock}
      AND s.id=? AND s.broadcast_id=? AND d.worker_id=? AND d.lease_epoch=?
      AND s.mode='broadcast' AND s.state='active' AND s.capture_state='active' AND s.event_clock IS ? AND p.event_clock IS s.event_clock`,
    id,a.token,scope!.session,scope!.broadcast,scope!.worker,scope!.lease,a.clock?clockJSON(a.clock):null);
  const now=e.now(),started=performance.now(),id=uid(),eventClock=a.clock?clockJSON(a.clock):null;
  const persist=e.stmt(`INSERT INTO sb_clock_probes(id,device_id,created_at,expires_at,event_clock)
    SELECT ?,d.id,${clock},${clock}+60000,? FROM sb_devices d WHERE d.token_hash=? AND d.revoked=0 AND d.token_expires>${clock}
    RETURNING created_at,expires_at`,id,eventClock,a.token);
  const results=await e.batch<Probe|Device|Authority>([persist,e.stmt("SELECT * FROM sb_devices WHERE token_hash=? AND revoked=0",a.token),...(scope?[eligible(id)]:[])]);
  let issued=results[0].results[0] as Probe|undefined,authority=results[2]?.results[0] as Authority|undefined;
  const device=results[1].results[0] as Device|undefined;need(device&&issued,"UNAUTHENTICATED",401);
  let probe=id,anchor=issued.created_at,version="db_issue_v2";
  if(!Number.isFinite(anchor)||anchor>e.now()||anchor<now-100){
    probe=uid();anchor=e.now();version="worker_issue_v1_fallback";
    const replacement=await e.batch<Probe|Authority>([
      e.stmt("DELETE FROM sb_clock_probes WHERE id=? AND device_id=?",id,device.id),
      e.stmt("INSERT INTO sb_clock_probes(id,device_id,created_at,expires_at,event_clock) VALUES(?,?,?,?,?) RETURNING created_at,expires_at",probe,device.id,anchor,anchor+60000,eventClock),
      ...(scope?[eligible(probe)]:[]),
    ]);issued=replacement[1].results[0] as Probe;authority=replacement[2]?.results[0] as Authority|undefined;
  }
  let permit:Awaited<ReturnType<BridgeEngine["issueFramePermit"]>>;
  if(scope&&authority&&authority.created_at===anchor&&authority.expires_at===issued.expires_at){
    permit=await e.issueFramePermit(a.token,{...scope,device:authority.id,owner:authority.owner_id,probe,probeCreated:anchor,probeExpires:authority.expires_at},
      {token_expires:authority.token_expires,worker_expires:authority.worker_expires,probe_expires:authority.expires_at});
  }
  const outcome=body.frame_permit_scope===undefined?0:!scope?1:!authority?2:!permit?3:version==="db_issue_v2"?4:5;
  console.info(JSON.stringify({event:"capture_clock_probe",clock_probe_id:probe,anchor_version:version,persistence_ms:performance.now()-started,request_to_issue_ms:anchor-now,reply_after_anchor_ms:Math.max(0,e.now()-anchor),frame_permit_outcome:outcome}));
  return {clock_probe_id:probe,server_time:iso(anchor),expires_in_ms:60000,anchor_version:version,...(outcome?{frame_permit_outcome:outcome}:{}),...permit};
}
