import {commandReplayKey} from "./replay-key-retention.ts";
import { BridgeEngine, BridgeError, databaseNowSQL, need, record, text, uuid, uid, integer, finite, hash, iso, type Device, type User } from "./bridge-engine.ts";
import { browseSteps, canonical, calibrationGeometry, exact, type Region } from "./browse-contract.ts";
import { MouseControl } from "./mouse-control.ts";
import { POINTER_PREFETCH } from "./pointer-prefetch-query.ts";
import { pointerQueueGate } from "./pointer-queue-gate.ts";
import { pointerResultSnapshotQuery, pointerResultAuthoritySQL, type PointerResultContext } from "./pointer-result-query.ts";
import { pointerAdmissionSnapshotQuery } from "./pointer-admission-query.ts";
import { nextPollDelayMS } from "./read-policy.ts";

export const POINTER_PROTOCOL = "pointer_actions.v1";
type Step = { id:string; before:unknown; after:unknown; target:unknown; click_region:Region;approach_point?:{x:number;y:number} };
export function pointerSteps(raw:unknown):Step[] {
  need(Array.isArray(raw)&&raw.length>=1&&raw.length<=5,"POINTER_STEP_LIMIT",422);
  const ids=new Set<string>();
  return raw.map(value=>{
    const s=record(value);exact(s,["id","before","after","target","click_region","approach_point"]);
    const id=uuid(s.id);need(!ids.has(id),"POINTER_DUPLICATE_STEP",422);ids.add(id);
    const b=browseSteps([{before:s.before,after:s.after,action:{kind:"click",target:s.target}}])[0];
    const r=record(s.click_region);exact(r,["x","y","width","height"]);
    const region={x:finite(r.x,0,1),y:finite(r.y,0,1),width:finite(r.width,Number.EPSILON,1),height:finite(r.height,Number.EPSILON,1)};
    need(region.x+region.width<=1&&region.y+region.height<=1&&region.width*region.height<=0.25,"POINTER_CLICK_REGION",422);
    need(b.action.kind==="click","POINTER_NAVIGATION_ONLY",422);
    let approach:{x:number;y:number}|undefined;
    if(s.approach_point!=null){
      const p=record(s.approach_point);exact(p,["x","y"]);approach={x:finite(p.x,0.1,0.9),y:finite(p.y,0.1,0.9)};
      need(!(approach.x>=region.x&&approach.x<=region.x+region.width&&approach.y>=region.y&&approach.y<=region.y+region.height)&&Math.hypot(approach.x-(region.x+region.width/2),approach.y-(region.y+region.height/2))>=0.2,"POINTER_APPROACH_POINT",422);
    }
    return {id,before:b.before,after:b.after,target:b.action.target,click_region:region,...(approach?{approach_point:approach}:{})};
  });
}
type Row={id:string;owner_id:string;device_id:string;session_id:string;hardware_id:string;board_boot_id:string;kind:string;payload:string;digest:string;state:string;worker_id:string|null;lease_epoch:number|null;control_epoch:number;expires_at:number;receipt:string|null;result_digest:string|null;error:string|null;predecessor_id:string|null};
type Live=Device&{sid:string;broadcast_id:string;control_epoch:number;mouse_until:number;hardware_id:string;board_boot_id:string;hardware_metadata:string;ready_json?:string|null};
type Ready={device_id:string;owner_id:string;session_id:string;worker_id:string;lease_epoch:number;control_epoch:number;calibration_id:string;profile_id:string;source_generation:number;scope_json:string;expires_at:number;prefetch_protocol:string|null};
const liveFrom="FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id";
const liveWhere="d.id=? AND d.owner_id=? AND d.revoked=0 AND d.worker_expires>? AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.mouse_until>? AND h.usb_connected=1";
const liveClockWhere=liveWhere+" AND d.token_expires>"+databaseNowSQL+" AND d.worker_expires>"+databaseNowSQL+" AND s.mouse_until>"+databaseNowSQL;
const pendingPlanStates=new Set(["queued","claimed","executing"]);
/** One parent in the existing exclusive mouse queue. A caller can explicitly
 * wait on that same plan without issuing another action. */
export class PointerActionControl {
  private e:BridgeEngine;
  private waitNow:()=>number;
  private waitSleep:(ms:number)=>Promise<void>;
  constructor(e:BridgeEngine,timing:{now?:()=>number;sleep?:(ms:number)=>Promise<void>}={}) {
    this.e=e;
    this.waitNow=timing.now??(()=>performance.now());
    this.waitSleep=timing.sleep??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
  }
  private validateLive(r:Live|null|undefined) {
    need(r&&r.sid&&r.hardware_id&&typeof r.hardware_metadata==="string"&&r.worker_expires>this.e.now()&&r.mouse_until>this.e.now(),"ALLOW_MOUSE_ON_PHONE");const b=record(JSON.parse(r.hardware_metadata)),caps=record(b.capabilities);
    need(caps["hid.mouse.absolute"]===true&&caps["hid.mouse.click"]===true,"POINTER_MOUSE_UNSUPPORTED");return r;
  }
  private async live(owner:string,device:string) {
    const now=this.e.now(),r=await this.e.stmt("SELECT d.*,s.id AS sid,s.broadcast_id,s.control_epoch,s.mouse_until,h.hardware_id,h.board_boot_id,h.metadata AS hardware_metadata "+liveFrom+" WHERE "+liveClockWhere,device,owner,now,now).first<Live>();
    return this.validateLive(r);
  }
  private scope(r:Live,calibration:string,settings:string,g:{width:number;height:number;orientation_epoch:number},approach:unknown=null) {
    return {protocol:POINTER_PROTOCOL,device_id:r.id,bridge_session_id:r.sid,broadcast_id:r.broadcast_id,worker_id:r.worker_id,lease_epoch:r.lease_epoch,control_epoch:r.control_epoch,
      hardware_id:r.hardware_id,board_boot_id:r.board_boot_id,descriptor_version:record(JSON.parse(r.hardware_metadata)).descriptor_version,calibration_id:calibration,pointer_settings_hash:settings,
      capture_width:g.width,capture_height:g.height,orientation_epoch:g.orientation_epoch,...(approach?{pointer_approach_protocol:approach}:{})};
  }
  async ready(device:Device,body:Record<string,unknown>) {
    const session=uuid(body.bridge_session_id),worker=uuid(body.worker_id),lease=integer(body.lease_epoch,1),control=integer(body.control_epoch,1);
    if(body.ready===false) {
      await this.e.stmt("DELETE FROM sb_pointer_ready WHERE device_id=? AND owner_id=? AND session_id=? AND worker_id=? AND lease_epoch=? AND control_epoch=?",device.id,device.owner_id,session,worker,lease,control).run();return {ready:false};
    }
    await this.e.session(device,body);const r=await this.live(device.owner_id,device.id),now=this.e.now();
    need(r.sid===session&&r.broadcast_id===uuid(body.broadcast_id)&&r.worker_id===worker&&r.lease_epoch===lease&&r.control_epoch===control,"POINTER_SCOPE_CHANGED");
    need(body.protocol===POINTER_PROTOCOL&&body.source_kind==="replaykit_jpeg_v1"&&body.profile_samples===36&&body.profile_cells===9,"POINTER_PERCEPTION_NOT_READY",422);
    const calibration=uuid(body.calibration_id),profile=uuid(body.profile_id),generation=integer(body.source_generation,1),settings=text(body.pointer_settings_hash,64);
    need(/^[0-9a-f]{64}$/.test(settings),"POINTER_SETTINGS",422);
    const c=await this.e.stmt("SELECT * FROM sb_browse_calibrations WHERE id=? AND owner_id=? AND device_id=? AND expires_at>?",calibration,device.owner_id,device.id,now).first<{hardware_id:string;board_boot_id:string;descriptor:string;settings_hash:string;orientation_epoch:number;source_width:number;source_height:number}>();
    const f=await this.e.stmt("SELECT metadata,capture_lower FROM sb_frames WHERE device_id=? AND owner_id=? AND session_id=? AND lease_epoch=? AND expires_at>?",device.id,device.owner_id,session,lease,now).first<{metadata:string;capture_lower:number|null}>();
    need(f&&f.capture_lower!==null&&f.capture_lower<=now+100&&now-f.capture_lower<1500,"POINTER_FRESH_JPEG_REQUIRED");
    const g=calibrationGeometry(record(JSON.parse(f.metadata)));
    need(c&&c.hardware_id===r.hardware_id&&c.board_boot_id===r.board_boot_id&&c.descriptor===record(JSON.parse(r.hardware_metadata)).descriptor_version&&c.settings_hash===settings&&c.orientation_epoch===g.orientation_epoch&&c.source_width===g.width&&c.source_height===g.height,"POINTER_CALIBRATION_CHANGED");
    need(body.capture_width===g.width&&body.capture_height===g.height&&body.orientation_epoch===g.orientation_epoch,"POINTER_GEOMETRY_CHANGED");
    const approach=body.pointer_approach_protocol??null;need(approach===null||approach==="pointer_approach.v1","INVALID_APPROACH_PROTOCOL",422);
    const scope=canonical(this.scope(r,calibration,settings,g,approach)),prefetch=body.prefetch_protocol==null?null:body.prefetch_protocol;
    need(prefetch===null||prefetch===POINTER_PREFETCH,"INVALID_PREFETCH_PROTOCOL",422);
    const changed=await this.e.stmt("INSERT INTO sb_pointer_ready(device_id,owner_id,session_id,worker_id,lease_epoch,control_epoch,calibration_id,profile_id,source_generation,scope_json,expires_at,prefetch_protocol) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 "+liveFrom+" WHERE "+liveWhere+" AND d.worker_id=? AND d.lease_epoch=? AND s.id=? AND s.broadcast_id=? AND s.control_epoch=? AND h.hardware_id=? AND h.board_boot_id=? AND h.metadata=?) AND EXISTS(SELECT 1 FROM sb_browse_calibrations WHERE id=? AND expires_at>?) ON CONFLICT(device_id) DO UPDATE SET owner_id=excluded.owner_id,session_id=excluded.session_id,worker_id=excluded.worker_id,lease_epoch=excluded.lease_epoch,control_epoch=excluded.control_epoch,calibration_id=excluded.calibration_id,profile_id=excluded.profile_id,source_generation=excluded.source_generation,scope_json=excluded.scope_json,expires_at=excluded.expires_at,prefetch_protocol=excluded.prefetch_protocol",
      device.id,device.owner_id,session,worker,lease,control,calibration,profile,generation,scope,Math.min(now+30000,r.mouse_until),prefetch,device.id,device.owner_id,now,now,worker,lease,session,r.broadcast_id,control,r.hardware_id,r.board_boot_id,r.hardware_metadata,calibration,now).run();
    need(changed.meta.changes===1,"POINTER_SCOPE_CHANGED");return {ready:true,expires_in_ms:30000};
  }
  private output(r:Row) {
    const receipt=r.receipt?record(JSON.parse(r.receipt)):null;
    return {plan_id:r.id,device_id:r.device_id,bridge_session_id:r.session_id,predecessor_plan_id:r.predecessor_id,state:r.state,expires_at:iso(r.expires_at),error:r.error,
      execution:receipt,verification:r.state==="succeeded"?"phone_pixel_effect_and_sites_acceptance":"not_complete",model_observed_effect:false};
  }
  async enqueue(user:User,args:Record<string,unknown>) {
    const device=uuid(args.device_id),key=await commandReplayKey(this.e.db,"sb_mouse_commands",user.id,args.device_id,text(args.idempotency_key,120)),steps=pointerSteps(args.steps),predecessor=args.predecessor_plan_id==null?null:uuid(args.predecessor_plan_id),digest=await hash(POINTER_PROTOCOL+":"+canonical(predecessor?{predecessor_plan_id:predecessor,steps}:steps));
    const query=pointerAdmissionSnapshotQuery({owner:user.id,device,key},databaseNowSQL);
    const owned=await this.e.stmt(query.sql,...query.values).first<Live&{prior_id:string|null;prior_kind:string|null;prior_digest:string|null}>();
    need(owned,"NOT_FOUND",404);
    if(owned.prior_id){need(owned.prior_kind==="pointer.local_plan"&&owned.prior_digest===digest,"IDEMPOTENCY_CONFLICT");return this.get(user,owned.prior_id);}
    const r=this.validateLive(owned),now=this.e.now(),w=r.ready_json?JSON.parse(r.ready_json) as Ready:null;
    need(w,"POINTER_APP_NOT_READY");const s=record(JSON.parse(w.scope_json));
    if(steps.some(step=>step.approach_point))need(s.pointer_approach_protocol==="pointer_approach.v1","POINTER_APPROACH_APP_UPDATE_REQUIRED");
    if(predecessor)need(w.prefetch_protocol===POINTER_PREFETCH,"POINTER_PREFETCH_APP_UPDATE_REQUIRED");
    need(w.session_id===r.sid&&w.worker_id===r.worker_id&&w.lease_epoch===r.lease_epoch&&w.control_epoch===r.control_epoch&&s.broadcast_id===r.broadcast_id&&s.hardware_id===r.hardware_id&&s.board_boot_id===r.board_boot_id&&s.descriptor_version===record(JSON.parse(r.hardware_metadata)).descriptor_version,"POINTER_SCOPE_CHANGED");
    const id=uid(),payload=canonical({protocol:POINTER_PROTOCOL,scope:s,profile_id:w.profile_id,source_generation:w.source_generation,predecessor_plan_id:predecessor,steps}),expires=Math.min(now+15000,r.mouse_until);
    const gate=pointerQueueGate({predecessor,device,owner:user.id,session:r.sid,control:r.control_epoch,now,scope:w.scope_json,profile:w.profile_id,generation:w.source_generation,count:steps.length,before:canonical(steps[0].before)},databaseNowSQL);
    const results=await this.e.db.batch<Row>([
      this.e.stmt("UPDATE sb_mouse_commands SET state=CASE WHEN state='executing' THEN 'outcome_unknown' ELSE 'expired' END,error='EXPIRED_OR_CONTROL_CHANGED' WHERE device_id=? AND owner_id=? AND expires_at<="+databaseNowSQL+" AND state IN ('queued','claimed','executing') AND EXISTS(SELECT 1 FROM sb_devices own WHERE own.id=sb_mouse_commands.device_id AND own.owner_id=sb_mouse_commands.owner_id AND own.revoked=0)",device,user.id),
      this.e.stmt("INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,control_epoch,created_at,expires_at,predecessor_id) SELECT ?,?,?,?,?,?,'pointer.local_plan',?,?,?,'queued',?,?,?,? WHERE EXISTS(SELECT 1 "+liveFrom+" JOIN sb_pointer_ready w ON w.device_id=d.id AND w.owner_id=d.owner_id JOIN sb_browse_calibrations c ON c.id=w.calibration_id AND c.owner_id=d.owner_id AND c.device_id=d.id WHERE "+liveClockWhere+" AND d.worker_id=? AND d.lease_epoch=? AND s.id=? AND s.broadcast_id=? AND s.control_epoch=? AND h.hardware_id=? AND h.board_boot_id=? AND h.metadata=? AND w.scope_json=? AND w.profile_id=? AND w.source_generation=? AND w.expires_at>? AND w.expires_at>"+databaseNowSQL+" AND c.expires_at>? AND c.expires_at>"+databaseNowSQL+" AND ?>"+databaseNowSQL+") AND "+gate.sql+" AND NOT EXISTS(SELECT 1 FROM sb_browse_runs WHERE device_id=? AND session_id=? AND control_epoch=? AND state IN ('active','outcome_unknown','halted')) ON CONFLICT DO NOTHING",
        id,user.id,device,r.sid,r.hardware_id,r.board_boot_id,payload,digest,key,r.control_epoch,now,expires,predecessor,device,user.id,now,now,r.worker_id,r.lease_epoch,r.sid,r.broadcast_id,r.control_epoch,r.hardware_id,r.board_boot_id,r.hardware_metadata,w.scope_json,w.profile_id,w.source_generation,now,now,expires,...gate.values,device,r.sid,r.control_epoch),
      this.e.stmt("SELECT c.* FROM sb_mouse_commands c JOIN sb_devices own ON own.id=c.device_id AND own.owner_id=c.owner_id WHERE c.owner_id=? AND c.device_id=? AND c.idempotency_key=? AND own.revoked=0",user.id,device,key),
    ]);
    const saved=results[2].results[0];need(saved&&saved.kind==="pointer.local_plan"&&saved.digest===digest,saved?"IDEMPOTENCY_CONFLICT":"POINTER_BUSY_OR_SCOPE_CHANGED");return this.output(saved);
  }
  async enqueueObserved(user:User,args:Record<string,unknown>) {
    const wait=integer(args.wait_ms??0,0,6000),deadline=this.waitNow()+wait;
    const queued=await this.enqueue(user,args);
    if(wait===0)return {...queued,image:undefined};
    if(!pendingPlanStates.has(queued.state)&&queued.state!=="succeeded")return {...queued,
      after_screen:{state:"not_requested",reason:"PLAN_NOT_COMPLETED"},image:undefined};
    let latest=queued;
    while(this.waitNow()<deadline) {
      const attempt=this.waitNow();
      try {
        const observed=await this.get(user,queued.plan_id,true,true);
        if(!pendingPlanStates.has(observed.state))return observed;
        latest=observed;
      }catch(error){
        // The plan may already have sent input. Keep its original identifier
        // and latest known state even when the optional read fails.
        return {...latest,after_screen:{state:"unavailable",
          reason:error instanceof BridgeError?error.code:"PLAN_OBSERVATION_UNAVAILABLE"},image:undefined};
      }
      const delay=nextPollDelayMS(350,attempt,this.waitNow(),deadline);
      if(delay>0)await this.waitSleep(delay);
    }
    return {...latest,after_screen:{state:pendingPlanStates.has(latest.state)?"pending":"not_requested",
      reason:"PLAN_WAIT_BUDGET_EXHAUSTED"},image:undefined};
  }
  async get(user:User,id:unknown,includeImage=false,completedOnly=false) {
    const plan=uuid(id),mouse=new MouseControl(this.e);
    const snapshot=includeImage?await this.e.readPointerPlanSnapshot<Row>(user,plan,mouse.ownedCommandStatements(user,plan),completedOnly):null;
    const r=snapshot?snapshot.results[1].results[0]:await mouse.ownedCommand(user,plan);need(r,"NOT_FOUND",404);
    need(r.kind==='pointer.local_plan',"NOT_FOUND",404);
    const output=this.output(r);
    if(!includeImage)return {...output,after_screen:{state:"not_requested",reason:null},image:undefined};
    if(completedOnly&&r.state!=="succeeded")return {...output,
      after_screen:{state:pendingPlanStates.has(r.state)?"pending":"not_requested",reason:"PLAN_NOT_COMPLETED"},image:undefined};
    const report=r.receipt?record(JSON.parse(r.receipt)):null,events=Array.isArray(report?.events)?report.events.map(record):[],click=events.filter(e=>e.phase==="click_acked").at(-1);
    const ack=click?.phone_ack_mono_s;
    if(!click||typeof ack!=="number"||!Number.isFinite(ack)||ack<0)return {...output,after_screen:{state:"not_requested",reason:"NO_CONFIRMED_CLICK"},image:undefined};
    // One authoritative snapshot includes pixels even on a cold isolate; no
    // RAM-cache miss followed by another D1 lookup inside a zero-wait read.
    const screen=await snapshot!.read();
    const m=screen.metadata,s=record(record(JSON.parse(r.payload)).scope);
    const checkpoint=completedOnly?events.filter(e=>e.phase==="observed_at_sites").at(-1):undefined;
    const capture=m?.capture_lower_phone_mono_ms, checkpointTime=checkpoint?.capture_mono_s;
    const afterFinalCheckpoint=!completedOnly||(typeof capture==="number"&&typeof checkpointTime==="number"&&Number.isFinite(checkpointTime)&&
      (capture>checkpointTime*1000||(m?.frame_id===checkpoint?.frame_id&&Math.abs(capture-checkpointTime*1000)<0.01)));
    const qualified=afterFinalCheckpoint&&screen.state==="available"&&typeof screen.image==="string"&&m!=null&&m.bridge_session_id===s.bridge_session_id&&m.worker_id===s.worker_id&&m.worker_id_at_read===s.worker_id&&m.lease_epoch===s.lease_epoch&&m.control_epoch_at_read===s.control_epoch&&m.capture_clock_verified===true&&typeof capture==="number"&&capture>ack*1000;
    return {...output,after_screen:{state:qualified?"available":"unavailable",metadata:qualified?m:null,reason:qualified?null:"NO_FRESH_AFTER_IMAGE"},image:qualified?screen.image:undefined};
  }
  async result(device:Device,id:string,body:Record<string,unknown>) {
    const plan=uuid(id);
    need(Array.isArray(body.events)&&body.events.length<=64,"POINTER_RESULT_LIMIT",422);
    const events=body.events.map(record),status=record(body.status),completed=integer(status.completed_steps,0,5),terminal=status.finished===true||status.halted===true;
    const frameIDs=[...new Set(events.filter(e=>e.phase==="observed_at_sites").map(e=>uuid(e.frame_id)))];need(frameIDs.length<=5,"POINTER_RESULT_LIMIT",422);
    const snapshot=pointerResultSnapshotQuery({plan,device:device.id,owner:device.owner_id,tokenHash:device.token_hash,frames:frameIDs},databaseNowSQL);
    const r=await this.e.stmt(snapshot.sql,...snapshot.values).first<Row&PointerResultContext>();need(r,"NOT_FOUND",404);
    const payload=record(JSON.parse(r.payload)),scope=record(payload.scope);
    for(const key of ["bridge_session_id","broadcast_id","worker_id","lease_epoch","control_epoch"])need(body[key]===scope[key],"POINTER_RESULT_SCOPE");
    need(!(status.finished===true&&status.halted===true),"POINTER_RESULT_CONFLICT",422);
    events.forEach((event,index)=>need(event.sequence===index+1&&event.schema==="pointer_action_event.v1"&&event.plan_id===plan,"POINTER_EVENT_ORDER",422));
    const digest=await hash(canonical({events,status})),old=r.receipt?record(JSON.parse(r.receipt)):null,prior=Array.isArray(old?.events)?old.events:[];
    need(events.length>=prior.length&&canonical(events.slice(0,prior.length))===canonical(prior),"POINTER_EVIDENCE_CONFLICT");
    if(r.result_digest){need(r.result_digest===digest,"RESULT_CONFLICT");return this.output(r);}
    const noInput=body.no_input_submitted===true&&events.length===0&&completed===0&&status.phase==="rejected"&&status.halted===true&&status.finished===false;
    need(["executing","outcome_unknown",...(noInput?["claimed"]:[])].includes(r.state),"POINTER_NOT_EXECUTING");
    let eligible=r.live_at_snapshot===1&&["executing",...(noInput?["claimed"]:[])].includes(r.state),previous:PointerPreviousClick|undefined;
    if(r.predecessor_id&&!noInput){
      const parent=r.parent_json?record(JSON.parse(r.parent_json)):null;
      if(parent?.state==="succeeded"&&parent.result_digest&&parent.receipt){
        const parentPayload=record(parent.payload),parentEvidence=record(parent.receipt),parentEvents=(parentEvidence.events as unknown[]).map(record),lastClick=parentEvents.filter(e=>e.phase==="click_acked").at(-1),lastAfter=parentEvents.filter(e=>e.phase==="observed_at_sites").at(-1);
        const matches=canonical(parentPayload.scope)===canonical(scope)&&parentPayload.profile_id===payload.profile_id&&parentPayload.source_generation===payload.source_generation&&lastClick&&lastAfter;
        if(eligible)need(matches,"POINTER_PREDECESSOR_SCOPE_CHANGED");
        if(matches)previous={plan:String(parent.id),receipt:record(lastClick!.receipt),submit:finite(lastClick!.phone_submit_mono_s,0,Number.MAX_SAFE_INTEGER),ack:finite(lastClick!.phone_ack_mono_s,0,Number.MAX_SAFE_INTEGER),afterCapture:finite(lastAfter!.capture_mono_s,0,Number.MAX_SAFE_INTEGER),sitesAck:finite(lastAfter!.sites_ack_mono_s,0,Number.MAX_SAFE_INTEGER)};
      }
      if(!previous){
        const pending=parent&&["queued","claimed","executing"].includes(String(parent.state))&&Number(parent.expires_at)>this.e.now();
        if(eligible&&pending)need(false,"POINTER_PREDECESSOR_NOT_CONFIRMED");
        // An irreversibly unknown/ended parent cannot be made successful by a
        // successor. Retain the successor as unknown so metadata replay drains.
        eligible=false;
      }
    }
    const proof=noInput?{frames:[] as Record<string,unknown>[]} :verifyPointerEvents(events,payload,completed,status.finished===true,previous);
    const accepted=(JSON.parse(r.accepted_json||"[]") as unknown[]).map(record);let independentSites=true;
    for(const frame of proof.frames){
      const found=accepted.some(m=>{const evidence=record(m.acceptance),d=record(evidence.metadata),age=Number(evidence.commit_server_ms)-Number(evidence.capture_lower_ms);return m.frame_id===frame.frame_id&&d.bridge_session_id===scope.bridge_session_id&&d.broadcast_id===scope.broadcast_id&&d.worker_id===scope.worker_id&&d.lease_epoch===scope.lease_epoch&&d.content_sha256===frame.content_sha256&&d.source_seq===frame.source_seq&&Math.abs(Number(d.capture_mono_ms)-Number(frame.capture_mono_s)*1000)<0.01&&Number.isFinite(age)&&age>=-100&&age<1500;});
      if(!found){if(eligible)need(false,"POINTER_SITES_ACCEPTANCE_MISSING",422);independentSites=false;}
    }
    const now=this.e.now(),state=eligible&&now<r.expires_at?(noInput?"failed":status.finished===true?"succeeded":status.halted===true?"halted":"executing"):"outcome_unknown";
    const evidence=canonical({status,events,proof:{completed_steps:completed,local_pixels_observed:completed>0,sites_confirmed:completed>0&&independentSites,independent_sites_evidence_state:proof.frames.length===0?"not_requested":independentSites?"verified":"unavailable",predecessor_confirmed:!r.predecessor_id||previous!==undefined,model_observed_effect:false}});
    const live=pointerResultAuthoritySQL("sb_mouse_commands",databaseNowSQL);
    const saved=await this.e.stmt("UPDATE sb_mouse_commands SET state=?,receipt=?,result_digest=?,error=? WHERE id=? AND owner_id=? AND state=? AND result_digest IS NULL AND COALESCE(receipt,'')=? AND EXISTS(SELECT 1 FROM sb_devices own WHERE own.id=sb_mouse_commands.device_id AND own.owner_id=sb_mouse_commands.owner_id AND own.revoked=0 AND own.token_hash=? AND own.token_expires>"+databaseNowSQL+") AND (?=1 OR "+live+") RETURNING *",state,evidence,terminal?digest:null,state==="outcome_unknown"?"LATE_OR_SCOPE_CHANGED":status.halted===true?text(status.reason??"POINTER_HALTED",120):null,plan,device.owner_id,r.state,r.receipt??"",device.token_hash,state==="outcome_unknown"?1:0).first<Row>();
    need(saved,"POINTER_RESULT_RACE");return this.output(saved);
  }
}

/** Authenticated phone assertions are checked for chronology, actual board
 * intervals and exact Sites uploads. Never accepts finished=true alone. */
export type PointerPreviousClick={plan:string;receipt:Record<string,unknown>;submit:number;ack:number;afterCapture:number;sitesAck:number};
export function verifyPointerEvents(events:Record<string,unknown>[],payload:Record<string,unknown>,completed:number,finished:boolean,previous?:PointerPreviousClick) {
  const steps=payload.steps as Step[],scope=record(payload.scope),frames:Record<string,unknown>[]=[];
  need(events.length>0&&events[0].phase==="run_started","POINTER_START_EVIDENCE",422);
  need(completed<=steps.length&&(!finished||completed===steps.length),"POINTER_COMPLETION_CONFLICT",422);
  const phasesFor=(step:Step)=>[...(step.approach_point?["approach_prepared","approach_acked"]:[]),"move_prepared","move_acked","click_prepared","click_acked","observed_at_sites"];
  const order=steps.flatMap(step=>phasesFor(step).map(phase=>({phase,step_id:step.id})));
  const tail=events.at(-1)?.phase==="halted"?events.slice(1,-1):events.slice(1);
  need(tail.length<=order.length&&tail.every((event,i)=>event.phase===order[i].phase&&event.step_id===order[i].step_id)&&(!finished||(tail.length===order.length&&events.at(-1)?.phase!=="halted")),"POINTER_EVENT_GRAMMAR",422);
  let previousBoard:Record<string,unknown>|undefined=previous?.receipt,previousSubmit:number|undefined=previous?.submit;
  for(let i=0;i<completed;i++){
    const step=steps[i],phases=phasesFor(step),rows=events.filter(e=>e.step_id===step.id&&phases.includes(String(e.phase)));
    need(rows.length===phases.length&&rows.every((r,n)=>r.phase===phases[n]),"POINTER_STEP_EVIDENCE",422);
    const [before,move,landing,click,after]=step.approach_point?rows.slice(2):rows,m=record(move.receipt),c=record(click.receipt),t=(r:Record<string,unknown>,key:string)=>finite(r[key],0,Number.MAX_SAFE_INTEGER);
    const approach=step.approach_point?record(rows[1].receipt):null,moveSub=approach?1:0,clickSub=approach?2:1;
    for(const [raw,sub] of [...(approach?[[approach,0] as const]:[]),[m,moveSub] as const,[c,clickSub] as const])need(raw.command_id===step.id&&raw.subcommand_index===sub&&raw.board_boot_id===scope.board_boot_id&&raw.state==="executed"&&raw.error==null&&record(raw.effect).hid_reports_sent===true&&Number.isSafeInteger(raw.started_uptime_ms)&&Number.isSafeInteger(raw.finished_uptime_ms)&&Number(raw.started_uptime_ms)>=0&&Number(raw.finished_uptime_ms)>=Number(raw.started_uptime_ms)&&Number(raw.finished_uptime_ms)-Number(raw.started_uptime_ms)<=2000,"POINTER_BOARD_EVIDENCE",422);
    need(Number(c.started_uptime_ms)>=Number(m.finished_uptime_ms),"POINTER_BOARD_ORDER",422);
    const moveSubmit=t(move,"phone_submit_mono_s"),moveAck=t(move,"phone_ack_mono_s"),clickSubmit=t(click,"phone_submit_mono_s"),clickAck=t(click,"phone_ack_mono_s"),captured=t(after,"capture_mono_s"),accepted=t(after,"sites_ack_mono_s"),start=t(after,"action_started_mono_s"),deadline=t(after,"cycle_deadline_mono_s");
    need(t(before,"capture_mono_s")<=moveSubmit&&start<=moveSubmit&&moveSubmit<=moveAck&&moveAck<t(landing,"capture_mono_s")&&t(landing,"capture_mono_s")<=clickSubmit&&clickSubmit<=clickAck&&clickAck<captured&&captured<=accepted&&accepted<deadline&&deadline<=start+3&&accepted-start<3,"POINTER_PHONE_ORDER_OR_BUDGET",422);
    if(i===0&&previous)need(before.predecessor_plan_id===previous.plan&&before.predecessor_click_id===previous.receipt.command_id&&before.predecessor_phone_submit_mono_s===previous.submit&&t(before,"capture_mono_s")>=previous.afterCapture&&start>=previous.sitesAck,"POINTER_HANDOFF_EVIDENCE",422);
    need(click.source_frame_id===landing.frame_id&&before.frame_id!==after.frame_id&&before.content_sha256!==after.content_sha256&&/^[0-9a-f]{64}$/.test(String(after.content_sha256))&&t(after,"server_age_ms")<1500,"POINTER_AFTER_FRAME_EVIDENCE",422);
    // Axes must match the declared safe click region in full-screen geometry.
    const region=step.click_region,effect=record(m.effect),axis=(v:number)=>Math.floor(v*32767+0.5);
    if(approach){
      const point=step.approach_point!,a=record(approach.effect),submitted=t(rows[1],"phone_submit_mono_s"),ack=t(rows[1],"phone_ack_mono_s");
      need(a.absolute_requested_x===axis(point.x)&&a.absolute_requested_y===axis(point.y)&&Number(approach.finished_uptime_ms)<=Number(m.started_uptime_ms),"POINTER_APPROACH_BOARD_EVIDENCE",422);
      need(start<=submitted&&t(rows[0],"capture_mono_s")<=submitted&&submitted<=ack&&ack<t(before,"capture_mono_s"),"POINTER_APPROACH_PHONE_ORDER",422);
    }
    need(effect.absolute_requested_x===axis(region.x+region.width/2)&&effect.absolute_requested_y===axis(region.y+region.height/2),"POINTER_AXES_MISMATCH",422);
    if(previousBoard)need(Number((approach??m).started_uptime_ms)>=Number(previousBoard.finished_uptime_ms)&&Number(c.finished_uptime_ms)-Number(previousBoard.started_uptime_ms)<3000&&clickSubmit-previousSubmit!<3,"POINTER_CLICK_GAP",422);
    previousBoard=c;previousSubmit=clickSubmit;frames.push(after);
  }
  need(events.filter(e=>e.phase==="observed_at_sites").length===completed,"POINTER_COMPLETION_CONFLICT",422);
  return {frames};
}
