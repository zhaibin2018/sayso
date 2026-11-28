import {storedReplayKey} from "./replay-key-retention.ts";
import { BridgeEngine, BridgeError, finite, hash, integer, iso, need, probeCaptureLower, record, text, uid, uuid, type Device, type User } from "./bridge-engine.ts";
import { absoluteMouseRequest } from "./absolute-mouse.ts";
import { validateDocument } from "./screen-text.ts";
import { Buffer } from "node:buffer";
import { browseImageCache, decodeBrowseImage, type BrowseImageRow } from "./browse-image.ts";
import { BROWSE_PROTOCOL, browseSteps, calibrationRequest, calibrationGeometry, canonical, exact, key, sceneMatches, targetPoint, verifyCalibration, type CalibrationCommand, type QueuedStep } from "./browse-contract.ts";

type Live = Device & { sid: string; broadcast_id: string; session_state: string; capture_state: string; mode: string; control_epoch: number; mouse_enabled: number; input_end: number; hardware_id: string; board_boot_id: string; hardware_metadata: string; usb_connected: number };
type Calibration = { id: string; owner_id: string; device_id: string; digest: string; hardware_id: string; board_boot_id: string; descriptor: string; settings_hash: string; orientation_epoch: number; source_width: number; source_height: number; proof: string; expires_at: number };
type CalibrationSnapshot = Omit<Calibration,"proof"|"digest">;
type Ready = { device_id: string; owner_id: string; session_id: string; worker_id: string; lease_epoch: number; control_epoch: number; protocol: string; calibration_id: string; settings_hash: string };
type Run = { id: string; owner_id: string; device_id: string; intent_key: string; intent_digest: string; session_id: string; broadcast_id: string; worker_id: string; lease_epoch: number; control_epoch: number; hardware_id: string; board_boot_id: string; hardware_metadata: string; calibration_id: string; settings_hash: string; orientation_epoch: number; state: string; queue_json: string; plan_keys_json: string; tail_step_id: string | null; next_index: number; revision: number; lease_seq: number; lease_request_id: string | null; last_lease_id: string | null; input_json: string | null; checkpoint_seq: number; checkpoint_json: string | null; error: string | null; expires_at: number; head_expires_at: number | null };
type RunContext = Run & {live:number;image_row?:string|null};
const imageColumns: (keyof BrowseImageRow)[] = ["run_id","owner_id","device_id","session_id","step_id","frame_id","checkpoint_seq","image_key","sha256","image_digest","metadata","capture_lower","expires_at"];
const imageProjection = `,(SELECT json_object(${imageColumns.map(key=>`'${key}',i.${key}`).join(",")}) FROM sb_browse_images i WHERE i.run_id=sb_browse_runs.id AND i.owner_id=sb_browse_runs.owner_id AND i.device_id=sb_browse_runs.device_id AND i.session_id=sb_browse_runs.session_id) AS image_row`;
type Lease = { id: string; run_id: string; seq: number; request_id: string; issued_at: number; expires_at: number };
type Snapshot = { metadata: Record<string, unknown>; ocr: Record<string, unknown>; lower: number; signature: string };
type CheckpointReply={step_id:string;state:string;app_effect_observed:boolean;replayed:boolean;checkpoint_seq:number;latency_deadline_missed:boolean;image_state?:string;image_error?:string;image_frame_id?:string};
type InputProof = { step_id: string; digest: string; before: Record<string, unknown>; before_signature: string; receipts: Record<string, unknown>[]; started_mono_ms: number; finished_mono_ms: number; lease_id: string };

// Bound to the current phone-approved session at every atomic write/lease.
// The old view-only frame contract is deliberately unchanged.
const liveRun = `EXISTS(SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session JOIN sb_hardware h ON h.device_id=d.id JOIN sb_browse_ready w ON w.device_id=d.id JOIN sb_browse_calibrations c ON c.id=w.calibration_id
 WHERE d.id=sb_browse_runs.device_id AND d.owner_id=sb_browse_runs.owner_id AND d.revoked=0 AND d.worker_id=sb_browse_runs.worker_id AND d.lease_epoch=sb_browse_runs.lease_epoch AND d.worker_expires>?
 AND s.id=sb_browse_runs.session_id AND s.broadcast_id=sb_browse_runs.broadcast_id AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.input_end>? AND s.control_epoch=sb_browse_runs.control_epoch
 AND h.owner_id=d.owner_id AND h.hardware_id=sb_browse_runs.hardware_id AND h.board_boot_id=sb_browse_runs.board_boot_id AND h.metadata=sb_browse_runs.hardware_metadata AND h.usb_connected=1
 AND w.owner_id=d.owner_id AND w.session_id=s.id AND w.worker_id=d.worker_id AND w.lease_epoch=d.lease_epoch AND w.control_epoch=s.control_epoch AND w.protocol='bounded_browse.v1' AND w.calibration_id=sb_browse_runs.calibration_id AND w.settings_hash=sb_browse_runs.settings_hash
 AND c.owner_id=d.owner_id AND c.device_id=d.id AND c.hardware_id=h.hardware_id AND c.board_boot_id=h.board_boot_id AND c.settings_hash=w.settings_hash AND c.orientation_epoch=sb_browse_runs.orientation_epoch AND c.expires_at>?)`;
const times = (now: number) => [now, now, now];

export class BrowseControl {
  private e: BridgeEngine;
  constructor(engine: BridgeEngine) { this.e = engine; }
  private observedReplay(stepID:string,evidence:string) { const value=JSON.parse(evidence);return {step_id:stepID,state:"observed",app_effect_observed:true,replayed:true,checkpoint_seq:Number(value.checkpoint_seq),latency_deadline_missed:value.latency_deadline_missed===true}; }
  private enabled() { need(this.e.browseEnabled, "BOUNDED_BROWSE_DISABLED", 409); }
  private async cycleResult(user:User,runID:string,intentKey:string,replayed:boolean):Promise<Record<string,unknown>> {
    this.enabled();
    const run=await this.readContext(user,runID,true),plans=record(JSON.parse(run.plan_keys_json));
    need(Object.hasOwn(plans,intentKey),"BROWSE_SUBMISSION_RECEIPT_MISSING");const receipt=record(plans[intentKey]);
    return {...await this.present(user,run),submission:{idempotency_key:intentKey,plan_id:receipt.plan_id,step_ids:receipt.step_ids,replayed}};
  }
  private async readContext(user:User,runID:unknown,includeImage=false):Promise<RunContext> {
    const id=uuid(runID);
    const query=()=>this.e.stmt(`SELECT sb_browse_runs.*,d.worker_expires AS worker_until,(SELECT input_end FROM sb_sessions WHERE id=sb_browse_runs.session_id) AS grant_until,(SELECT expires_at FROM sb_browse_calibrations WHERE id=sb_browse_runs.calibration_id) AS calibration_until,CASE WHEN ${liveRun} THEN 1 ELSE 0 END AS live${includeImage?imageProjection:""} FROM sb_browse_runs JOIN sb_devices d ON d.id=sb_browse_runs.device_id WHERE sb_browse_runs.id=? AND sb_browse_runs.owner_id=? AND d.owner_id=? AND d.revoked=0`,...times(this.e.now()),id,user.id,user.id).first<RunContext & {worker_until:number;grant_until:number;calibration_until:number}>();
    const row=await query();need(row,"NOT_FOUND",404);
    if(row.state==="active" && (row.live!==1 || Math.min(row.expires_at,row.worker_until,row.grant_until,row.calibration_until,row.head_expires_at??Number.MAX_SAFE_INTEGER)<=this.e.now())){await this.expire(row.device_id);const updated=await query();need(updated,"NOT_FOUND",404);return updated;}
    return row;
  }
  private async cleanImage(runID:string,key:string) {
    const row=await this.e.stmt("SELECT image_key,expires_at FROM sb_browse_images WHERE run_id=?",runID).first<{image_key:string;expires_at:number}>();
    if(row?.image_key===key && row.expires_at>this.e.now())return;
    await this.e.stmt("DELETE FROM sb_browse_images WHERE run_id=? AND image_key=? AND expires_at<=?",runID,key,this.e.now()).run();
    await this.e.bucket.delete(key);browseImageCache.expire("browse:"+runID,key);
  }
  async image(device:Device,body:Record<string,unknown>) {
    this.enabled();exact(body,["bridge_session_id","broadcast_id","worker_id","lease_epoch","control_epoch","run_id","step_id","image_metadata","jpeg_base64"]);
    const run=await this.readContext({id:device.owner_id,label:""},body.run_id),step=uuid(body.step_id),checkpoint=run.checkpoint_json?record(JSON.parse(run.checkpoint_json)):null;
    need(run.device_id===device.id && run.session_id===uuid(body.bridge_session_id) && run.broadcast_id===uuid(body.broadcast_id) && run.worker_id===uuid(body.worker_id) && run.lease_epoch===integer(body.lease_epoch,1) && run.control_epoch===integer(body.control_epoch,1),"STALE_BROWSE_SCOPE");
    need(run.live===1 && run.state==="active" && checkpoint?.step_id===step,"BROWSE_IMAGE_CHECKPOINT_NOT_CURRENT");
    const metadata=record(checkpoint.metadata),lower=finite(checkpoint.capture_lower,0,Number.MAX_SAFE_INTEGER),now=this.e.now();
    need(now>=lower && now-lower<=1499,"BROWSE_IMAGE_STALE");
    const image=await decodeBrowseImage(body.image_metadata,body.jpeg_base64,metadata),frame=uuid(metadata.frame_id),seq=integer(checkpoint.seq,1);
    const old=await this.e.stmt("SELECT * FROM sb_browse_images WHERE run_id=?",run.id).first<BrowseImageRow>();
    if(old?.checkpoint_seq===seq){need(old.step_id===step && old.frame_id===frame && old.sha256===image.sha && old.image_digest===image.digest,"BROWSE_IMAGE_CONFLICT");return {accepted:true,run_id:run.id,step_id:step,frame_id:frame,replayed:true};}
    const key=`browse/${run.owner_id}/${run.device_id}/${run.id}/${frame}-${image.sha}.jpg`,expires=Math.min(lower+1500,run.expires_at);
    let committed=false;
    try {
      await this.e.bucket.put(key,image.bytes,{httpMetadata:{contentType:"image/jpeg",cacheControl:"private, no-store"}});
      this.e.scheduleBackground(2500,()=>this.cleanImage(run.id,key));
      const commitNow=this.e.now();need(expires>commitNow,"BROWSE_IMAGE_STALE");
      const saved=await this.e.stmt(`INSERT INTO sb_browse_images(run_id,owner_id,device_id,session_id,step_id,frame_id,checkpoint_seq,image_key,sha256,image_digest,metadata,capture_lower,expires_at)
        SELECT id,owner_id,device_id,session_id,?,?,?,?,?,?,?,?,? FROM sb_browse_runs WHERE id=? AND state='active' AND expires_at>? AND (head_expires_at IS NULL OR head_expires_at>?) AND json_extract(checkpoint_json,'$.step_id')=? AND json_extract(checkpoint_json,'$.seq')=? AND json_extract(checkpoint_json,'$.metadata.frame_id')=? AND ${liveRun}
        ON CONFLICT(run_id) DO UPDATE SET step_id=excluded.step_id,frame_id=excluded.frame_id,checkpoint_seq=excluded.checkpoint_seq,image_key=excluded.image_key,sha256=excluded.sha256,image_digest=excluded.image_digest,metadata=excluded.metadata,capture_lower=excluded.capture_lower,expires_at=excluded.expires_at
        WHERE sb_browse_images.checkpoint_seq<excluded.checkpoint_seq OR (sb_browse_images.checkpoint_seq=excluded.checkpoint_seq AND sb_browse_images.frame_id=excluded.frame_id AND sb_browse_images.sha256=excluded.sha256 AND sb_browse_images.image_digest=excluded.image_digest)`,
        step,frame,seq,key,image.sha,image.digest,canonical(image.metadata),lower,expires,run.id,commitNow,commitNow,step,seq,frame,...times(commitNow)).run();
      need(saved.meta.changes===1,"BROWSE_IMAGE_CHECKPOINT_NOT_CURRENT");committed=true;
      browseImageCache.put("browse:"+run.id,{owner:run.owner_id,session:run.session_id,frame,key,bytes:image.bytes,expires});
      if(old && old.image_key!==key && !this.e.scheduleBackground(0,()=>this.cleanImage(run.id,old.image_key)))await this.e.bucket.delete(old.image_key);
      return {accepted:true,run_id:run.id,step_id:step,frame_id:frame,replayed:false};
    } finally {if(!committed)await this.e.bucket.delete(key);}
  }
  private async imageFor(user:User,run:RunContext,checkpoint:Record<string,unknown>) {
    need(run.image_row!==undefined,"BROWSE_IMAGE_SNAPSHOT_REQUIRED");
    const row=run.image_row?JSON.parse(run.image_row) as BrowseImageRow:null;
    if(!row || row.run_id!==run.id || row.owner_id!==user.id || row.device_id!==run.device_id || row.session_id!==run.session_id)return {image_state:"pending"};
    const current=()=>row.step_id===checkpoint.step_id && row.checkpoint_seq===checkpoint.seq && row.frame_id===record(checkpoint.metadata).frame_id;
    if(!current())return {image_state:"pending"};
    if(row.expires_at<=this.e.now()||this.e.now()-row.capture_lower>1499){if(!this.e.scheduleBackground(0,()=>this.cleanImage(run.id,row.image_key)))await this.cleanImage(run.id,row.image_key);return {image_state:"stale"};}
    let bytes=browseImageCache.get("browse:"+run.id,run.owner_id,run.session_id,row.image_key);
    if(!bytes){try{const stored=await this.e.bucket.get(row.image_key);if(stored)bytes=new Uint8Array(await stored.arrayBuffer());}catch{return {image_state:"unavailable"};}}
    if(!bytes || bytes.length>262144 || await hash(bytes)!==row.sha256)return {image_state:"unavailable"};
    if(row.expires_at<=this.e.now()||this.e.now()-row.capture_lower>1499)return {image_state:"stale"};
    return {image_state:"available",image:Buffer.from(bytes).toString("base64"),image_metadata:{...record(JSON.parse(row.metadata)),capture_lower_server_utc_ms:row.capture_lower,age_ms:this.e.now()-row.capture_lower,step_id:row.step_id,checkpoint_seq:row.checkpoint_seq}};
  }
  async active(device:Device,body:Record<string,unknown>) {
    this.enabled();exact(body,["bridge_session_id","broadcast_id","worker_id","lease_epoch","control_epoch"]);
    const now=this.e.now();
    const run=await this.e.stmt(`SELECT id,lease_seq,checkpoint_seq,input_json FROM sb_browse_runs WHERE device_id=? AND owner_id=? AND session_id=? AND broadcast_id=? AND worker_id=? AND lease_epoch=? AND control_epoch=? AND state='active' AND expires_at>? AND (head_expires_at IS NULL OR head_expires_at>?) AND ${liveRun}`,device.id,device.owner_id,uuid(body.bridge_session_id),uuid(body.broadcast_id),uuid(body.worker_id),integer(body.lease_epoch,1),integer(body.control_epoch,1),now,now,...times(now)).first<{id:string;lease_seq:number;checkpoint_seq:number;input_json:string|null}>();
    return run?{run_id:run.id,lease_seq:run.lease_seq,checkpoint_seq:run.checkpoint_seq,input_pending:run.input_json!=null}:null;
  }
  private async live(user: User, deviceID?: unknown): Promise<Live> {
    const id = deviceID == null ? null : uuid(deviceID);
    const rows = await this.e.stmt("SELECT d.*,s.id AS sid,s.broadcast_id,s.state AS session_state,s.capture_state,s.mode,s.control_epoch,s.mouse_enabled,s.input_end,h.hardware_id,h.board_boot_id,h.metadata AS hardware_metadata,h.usb_connected FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id WHERE d.owner_id=? AND d.revoked=0 AND (? IS NULL OR d.id=?) LIMIT 2", user.id, id, id).all<Live>();
    need(rows.results.length === 1, rows.results.length ? "CHOOSE_DEVICE" : "START_MOUSE_SHARING");
    const row = rows.results[0], now = this.e.now(), hardware = JSON.parse(row.hardware_metadata);
    need(row.session_state === "active" && row.capture_state === "active" && row.mode === "broadcast" && row.worker_expires > now && row.usb_connected === 1 && row.mouse_enabled === 1 && row.input_end > now, "ALLOW_MOUSE_ON_PHONE");
    need(hardware.capabilities?.["hid.mouse.absolute"] === true && hardware.capabilities?.["hid.mouse.click"] === true && hardware.capabilities?.["hid.mouse.scroll"] === true, "BROWSE_MOUSE_UNSUPPORTED");
    return row;
  }
  private async geometry(row: Live) {
    const now = this.e.now();
    const raw = await this.e.stmt("SELECT metadata,capture_lower FROM (SELECT metadata,capture_lower,expires_at,owner_id,device_id,session_id,lease_epoch FROM sb_screen_texts UNION ALL SELECT metadata,capture_lower,expires_at,owner_id,device_id,session_id,lease_epoch FROM sb_frames) WHERE owner_id=? AND device_id=? AND session_id=? AND lease_epoch=? AND expires_at>? AND capture_lower BETWEEN ? AND ? ORDER BY capture_lower DESC LIMIT 1", row.owner_id, row.id, row.sid, row.lease_epoch, now, now-2000, now+100).first<{metadata: string; capture_lower: number}>();
    need(raw && this.e.now() - raw.capture_lower <= 2000, "BROWSE_FRESH_GEOMETRY_REQUIRED"); return calibrationGeometry(record(JSON.parse(raw.metadata)));
  }
  private expiration(deviceID:string,now:number) {
    return this.e.stmt(`UPDATE sb_browse_runs SET state=CASE WHEN lease_seq>0 AND queue_json!='[]' THEN 'outcome_unknown' ELSE 'cancelled' END,error='BROWSE_EXPIRED_OR_SCOPE_CHANGED',revision=revision+1 WHERE device_id=? AND state='active' AND (expires_at<=? OR (head_expires_at IS NOT NULL AND head_expires_at<=?) OR NOT ${liveRun})`, deviceID, now, now, ...times(now));
  }
  private async expire(deviceID: string) {
    await this.expiration(deviceID,this.e.now()).run();
  }
  private async owned(user: User, runID: unknown): Promise<Run> {
    const row = await this.e.stmt("SELECT * FROM sb_browse_runs WHERE id=? AND owner_id=?", uuid(runID), user.id).first<Run>(); need(row, "NOT_FOUND", 404);
    await this.e.owned(user, row.device_id); await this.expire(row.device_id);
    return (await this.e.stmt("SELECT * FROM sb_browse_runs WHERE id=? AND owner_id=?", row.id, user.id).first<Run>())!;
  }
  private async phone(device: Device, body: Record<string, unknown>) {
    this.enabled(); await this.e.session(device, body);
    const row = await this.owned({ id: device.owner_id, label: "" }, body.run_id);
    need(row.device_id === device.id && row.session_id === body.bridge_session_id && row.broadcast_id === body.broadcast_id && row.worker_id === body.worker_id && row.lease_epoch === body.lease_epoch && row.control_epoch === integer(body.control_epoch, 1), "STALE_BROWSE_SCOPE");
    return row;
  }
  async calibrate(device: Device, body: Record<string, unknown>) {
    // Authenticated evidence preparation must work before enabling execution.
    // This endpoint creates no ready worker, run, lease or input permission.
    exact(body, ["bridge_session_id", "broadcast_id", "worker_id", "lease_epoch", "control_epoch", "request_id", "proof"]);
    await this.e.session(device, body); const live = await this.live({ id: device.owner_id, label: "" }, device.id);
    need(live.control_epoch === integer(body.control_epoch, 1), "STALE_BROWSE_SCOPE");
    const requestID = uuid(body.request_id), proof = calibrationRequest(body.proof), digest = await hash(canonical(body.proof));
    const old = await this.e.stmt("SELECT * FROM sb_browse_calibrations WHERE device_id=? AND request_id=?", device.id, requestID).first<Calibration>();
    if (old) { need(old.digest === digest, "IDEMPOTENCY_CONFLICT"); return { calibration_id: old.id, evidence: JSON.parse(old.proof).result }; }
    const geometry = await this.geometry(live);
    need(geometry.width === proof.sourceWidth && geometry.height === proof.sourceHeight && geometry.orientation_epoch === proof.epoch && geometry.orientation === "portrait", "CALIBRATION_GEOMETRY_CHANGED");
    const ids = proof.samples.flatMap(s => [s.move_id, s.click_id]);
    const rows = await this.e.stmt(`SELECT * FROM sb_mouse_commands WHERE owner_id=? AND device_id=? AND id IN (${ids.map(()=>"?").join(",")})`, device.owner_id, device.id, ...ids).all<CalibrationCommand>();
    const result = verifyCalibration(proof, rows.results, { owner: device.owner_id, device: device.id, session: live.sid, hardware: live.hardware_id, boot: live.board_boot_id, control: live.control_epoch });
    const id = uid(), now = this.e.now(), descriptor = text(JSON.parse(live.hardware_metadata).descriptor_version, 160);
    const saved = await this.e.stmt("INSERT INTO sb_browse_calibrations(id,owner_id,device_id,request_id,digest,hardware_id,board_boot_id,descriptor,settings_hash,orientation_epoch,source_width,source_height,proof,created_at,expires_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session JOIN sb_hardware h ON h.device_id=d.id WHERE d.id=? AND d.owner_id=? AND d.revoked=0 AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND s.id=? AND s.state='active' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.control_epoch=? AND s.input_end>? AND h.hardware_id=? AND h.board_boot_id=? AND h.metadata=? AND h.usb_connected=1) ON CONFLICT(device_id,request_id) DO NOTHING", id, device.owner_id, device.id, requestID, digest, live.hardware_id, live.board_boot_id, descriptor, proof.settings, proof.epoch, proof.sourceWidth, proof.sourceHeight, canonical({ request: body.proof, result }), now, now+86400000, device.id, device.owner_id, live.worker_id, live.lease_epoch, now, live.sid, live.control_epoch, now, live.hardware_id, live.board_boot_id, live.hardware_metadata).run();
    const current = await this.e.stmt("SELECT * FROM sb_browse_calibrations WHERE device_id=? AND request_id=?", device.id, requestID).first<Calibration>();
    need(current && current.digest === digest, saved.meta.changes ? "IDEMPOTENCY_CONFLICT" : "STALE_CALIBRATION_SCOPE"); return { calibration_id: current.id, evidence: result };
  }
  async ready(device: Device, body: Record<string, unknown>) {
    this.enabled(); exact(body, ["bridge_session_id", "broadcast_id", "worker_id", "lease_epoch", "control_epoch", "protocol", "calibration_id", "pointer_settings_hash"]);
    await this.e.session(device, body); const live = await this.live({ id: device.owner_id, label: "" }, device.id), now = this.e.now();
    need(body.protocol === BROWSE_PROTOCOL && body.control_epoch === live.control_epoch, "UNSUPPORTED_BROWSE_WORKER");
    const c = await this.e.stmt("SELECT * FROM sb_browse_calibrations WHERE id=? AND owner_id=? AND device_id=? AND expires_at>?", uuid(body.calibration_id), device.owner_id, device.id, now).first<Calibration>();
    need(c && c.hardware_id === live.hardware_id && c.board_boot_id === live.board_boot_id && c.descriptor === JSON.parse(live.hardware_metadata).descriptor_version && c.settings_hash === body.pointer_settings_hash, "PHYSICAL_POINTER_PROOF_REQUIRED");
    const geometry = await this.geometry(live); need(geometry.width === c.source_width && geometry.height === c.source_height && geometry.orientation_epoch === c.orientation_epoch && geometry.orientation === "portrait", "CALIBRATION_GEOMETRY_CHANGED");
    await this.expire(device.id);
    const updated = await this.e.stmt("INSERT INTO sb_browse_ready(device_id,owner_id,session_id,worker_id,lease_epoch,control_epoch,protocol,calibration_id,settings_hash,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM sb_browse_runs WHERE device_id=? AND state='active' AND calibration_id!=?) ON CONFLICT(device_id) DO UPDATE SET owner_id=excluded.owner_id,session_id=excluded.session_id,worker_id=excluded.worker_id,lease_epoch=excluded.lease_epoch,control_epoch=excluded.control_epoch,protocol=excluded.protocol,calibration_id=excluded.calibration_id,settings_hash=excluded.settings_hash,created_at=excluded.created_at", device.id, device.owner_id, live.sid, live.worker_id, live.lease_epoch, live.control_epoch, BROWSE_PROTOCOL, c.id, c.settings_hash, now, device.id, c.id).run();
    need(updated.meta.changes === 1, "BROWSE_RUN_ACTIVE");
    const current=await this.live({id:device.owner_id,label:""},device.id);
    need(current.sid===live.sid && current.worker_id===live.worker_id && current.lease_epoch===live.lease_epoch && current.control_epoch===live.control_epoch,"STALE_BROWSE_SCOPE");
    await this.capability(current);
    return { ready: true, protocol: BROWSE_PROTOCOL, calibration_id: c.id, control_epoch: live.control_epoch, checkpoint_image: true };
  }
  private async capability(live: Live) {
    const now=this.e.now();
    const w=await this.e.stmt(`SELECT w.*,CASE WHEN c.id IS NULL THEN NULL ELSE json_object('id',c.id,'owner_id',c.owner_id,'device_id',c.device_id,'hardware_id',c.hardware_id,'board_boot_id',c.board_boot_id,'descriptor',c.descriptor,'settings_hash',c.settings_hash,'orientation_epoch',c.orientation_epoch,'source_width',c.source_width,'source_height',c.source_height,'expires_at',c.expires_at) END AS calibration_row,
      (SELECT json_object('metadata',g.metadata,'capture_lower',g.capture_lower) FROM (SELECT metadata,capture_lower FROM (SELECT metadata,capture_lower,expires_at,owner_id,device_id,session_id,lease_epoch FROM sb_screen_texts UNION ALL SELECT metadata,capture_lower,expires_at,owner_id,device_id,session_id,lease_epoch FROM sb_frames) WHERE owner_id=w.owner_id AND device_id=w.device_id AND session_id=w.session_id AND lease_epoch=w.lease_epoch AND expires_at>? AND capture_lower BETWEEN ? AND ? ORDER BY capture_lower DESC LIMIT 1) g) AS geometry_row
      FROM sb_browse_ready w LEFT JOIN sb_browse_calibrations c ON c.id=w.calibration_id AND c.owner_id=w.owner_id AND c.device_id=w.device_id AND c.expires_at>?
      WHERE w.device_id=? AND w.owner_id=? AND w.session_id=? AND w.worker_id=? AND w.lease_epoch=? AND w.control_epoch=? AND w.protocol=?`,now,now-2000,now+100,now,live.id,live.owner_id,live.sid,live.worker_id,live.lease_epoch,live.control_epoch,BROWSE_PROTOCOL).first<Ready&{calibration_row:string|null;geometry_row:string|null}>();
    need(w, "BROWSE_WORKER_NOT_READY");
    const c=w.calibration_row?JSON.parse(w.calibration_row) as CalibrationSnapshot:null;
    need(c && c.expires_at>this.e.now() && c.hardware_id === live.hardware_id && c.board_boot_id === live.board_boot_id && c.descriptor === JSON.parse(live.hardware_metadata).descriptor_version && c.settings_hash === w.settings_hash, "PHYSICAL_POINTER_PROOF_REQUIRED");
    const raw=w.geometry_row?JSON.parse(w.geometry_row) as {metadata:string;capture_lower:number}:null;
    need(raw && this.e.now()-raw.capture_lower<=2000,"BROWSE_FRESH_GEOMETRY_REQUIRED");const g=calibrationGeometry(record(JSON.parse(raw.metadata)));
    need(g.width === c.source_width && g.height === c.source_height && g.orientation_epoch === c.orientation_epoch && g.orientation === "portrait", "CALIBRATION_GEOMETRY_CHANGED");
    return { w, c };
  }
  async cycle(user: User, args: Record<string, unknown>) {
    this.enabled(); exact(args, ["device_id", "run_id", "idempotency_key", "after_step_id", "steps"]);
    const steps = browseSteps(args.steps), intentKey = key(args.idempotency_key), digest = await hash(canonical({steps,after_step_id:args.run_id==null?null:uuid(args.after_step_id)}));
    need(new TextEncoder().encode(canonical(steps)).length <= 16384, "BROWSE_PLAN_TOO_LARGE", 413);
    if (args.run_id != null) return this.append(user, uuid(args.run_id), args.after_step_id, intentKey, digest, steps);
    need(args.after_step_id == null, "STALE_BROWSE_BRANCH");
    const deviceID=args.device_id==null?null:uuid(args.device_id);
    const oldRows=await this.e.stmt("SELECT r.id,r.intent_digest FROM sb_browse_runs r JOIN sb_devices d ON d.id=r.device_id WHERE r.owner_id=? AND d.revoked=0 AND r.intent_key IN (?,?) AND (? IS NULL OR r.device_id=?) LIMIT 2",user.id,intentKey,storedReplayKey(intentKey),deviceID,deviceID).all<{id:string;intent_digest:string}>();
    need(oldRows.results.length<=1,"CHOOSE_DEVICE");const old=oldRows.results[0];
    if (old) { need(old.intent_digest === digest, "IDEMPOTENCY_CONFLICT"); return this.cycleResult(user,old.id,intentKey,true); }
    const live = await this.live(user, args.device_id);
    const {w,c} = await this.capability(live);
    const now = this.e.now(), id = uid(), planID = uid(), expires = now+15000, queue: QueuedStep[] = steps.map((spec,index) => ({plan_id:planID,step_id:uid(),index,expires_at:expires,spec}));
    const keys = {[intentKey]: {digest, plan_id:planID, step_ids:queue.map(s=>s.step_id)}};
    const admission=await this.e.db.batch<{id:string;intent_digest:string}>([
      this.expiration(live.id,now),
      this.e.stmt("INSERT INTO sb_browse_runs(id,owner_id,device_id,intent_key,intent_digest,session_id,broadcast_id,worker_id,lease_epoch,control_epoch,hardware_id,board_boot_id,hardware_metadata,calibration_id,settings_hash,orientation_epoch,state,queue_json,plan_keys_json,tail_step_id,next_index,created_at,expires_at,head_expires_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session JOIN sb_hardware h ON h.device_id=d.id JOIN sb_browse_ready w ON w.device_id=d.id JOIN sb_browse_calibrations c ON c.id=w.calibration_id WHERE d.id=? AND d.owner_id=? AND d.revoked=0 AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND s.id=? AND s.broadcast_id=? AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.input_end>? AND s.control_epoch=? AND h.hardware_id=? AND h.board_boot_id=? AND h.metadata=? AND h.usb_connected=1 AND s.owner_id=d.owner_id AND h.owner_id=d.owner_id AND w.owner_id=d.owner_id AND w.protocol='bounded_browse.v1' AND w.worker_id=d.worker_id AND w.session_id=s.id AND w.lease_epoch=d.lease_epoch AND w.control_epoch=s.control_epoch AND w.calibration_id=? AND w.settings_hash=? AND c.owner_id=d.owner_id AND c.device_id=d.id AND c.expires_at>?) AND NOT EXISTS(SELECT 1 FROM sb_mouse_commands WHERE device_id=? AND session_id=? AND control_epoch=? AND state IN ('queued','claimed','executing','outcome_unknown')) AND NOT EXISTS(SELECT 1 FROM sb_browse_runs b JOIN sb_devices bd ON bd.id=b.device_id JOIN sb_sessions bs ON bs.id=bd.current_session WHERE b.device_id=? AND (b.state='active' OR (b.session_id=bs.id AND b.control_epoch=bs.control_epoch AND b.state IN ('outcome_unknown','halted')))) ON CONFLICT DO NOTHING", id,user.id,live.id,intentKey,digest,live.sid,live.broadcast_id,live.worker_id,live.lease_epoch,live.control_epoch,live.hardware_id,live.board_boot_id,live.hardware_metadata,c.id,w.settings_hash,c.orientation_epoch,canonical(queue),canonical(keys),queue.at(-1)!.step_id,queue.length,now,live.input_end,expires,live.id,user.id,live.worker_id,live.lease_epoch,now,live.sid,live.broadcast_id,now,live.control_epoch,live.hardware_id,live.board_boot_id,live.hardware_metadata,c.id,w.settings_hash,now,live.id,live.sid,live.control_epoch,live.id),
      this.e.stmt("SELECT id,intent_digest FROM sb_browse_runs WHERE owner_id=? AND device_id=? AND intent_key=?", user.id,live.id,intentKey),
    ]);
    const current=admission[2].results[0];
    need(current && current.intent_digest===digest, "MOUSE_BUSY_OR_CONTROL_CHANGED"); return this.cycleResult(user,current.id,intentKey,current.id!==id);
  }
  private async append(user: User, id: string, after: unknown, intentKey: string, digest: string, steps: ReturnType<typeof browseSteps>) {
    for(let attempt=0;attempt<3;attempt++) {
      const run = await this.readContext(user,id), keys = new Map<string,{digest:string;plan_id:string;step_ids:string[]}>(Object.entries(JSON.parse(run.plan_keys_json))), old = keys.get(intentKey);
      if(old) { need(old.digest===digest,"IDEMPOTENCY_CONFLICT"); return this.cycleResult(user,id,intentKey,true); }
      need(run.state==="active","BROWSE_NOT_ACTIVE"); need(uuid(after)===run.tail_step_id,"STALE_BROWSE_BRANCH");
      const queue = JSON.parse(run.queue_json) as QueuedStep[], now=this.e.now();
      need(queue.length+steps.length<=5,"BROWSE_QUEUE_FULL"); need(keys.size<128,"BROWSE_PLAN_LIMIT");
      const planID=uid(), expires=Math.min(now+15000,run.expires_at), added=steps.map((spec,i)=>({plan_id:planID,step_id:uid(),index:run.next_index+i,expires_at:expires,spec}));
      const next=[...queue,...added]; keys.set(intentKey,{digest,plan_id:planID,step_ids:added.map(s=>s.step_id)});
      const saved=await this.e.stmt(`UPDATE sb_browse_runs SET queue_json=?,plan_keys_json=?,tail_step_id=?,next_index=?,head_expires_at=?,revision=revision+1 WHERE id=? AND revision=? AND state='active' AND expires_at>? AND ${liveRun}`,canonical(next),canonical(Object.fromEntries(keys)),added.at(-1)!.step_id,run.next_index+added.length,next[0].expires_at,id,run.revision,now,...times(now)).run();
      if(saved.meta.changes===1)return this.cycleResult(user,id,intentKey,false);
    }
    need(false,"BROWSE_CHANGED_RETRY_SAME_KEY");
  }
  async take(device: Device, body: Record<string, unknown>) {
    this.enabled();exact(body,["bridge_session_id","broadcast_id","worker_id","lease_epoch","control_epoch","run_id","request_id","lease_seq"]);
    const runID=uuid(body.run_id),seq=integer(body.lease_seq,1,2048),request=uuid(body.request_id),now=this.e.now();
    type Context=Run & {live:number;worker_until:number;grant_until:number;calibration_until:number;previous_lease:string|null;previous_request:string|null};
    const run=await this.e.stmt(`SELECT sb_browse_runs.*,CASE WHEN ${liveRun} THEN 1 ELSE 0 END AS live,d.worker_expires AS worker_until,s.input_end AS grant_until,c.expires_at AS calibration_until,old.id AS previous_lease,old.request_id AS previous_request
      FROM sb_browse_runs JOIN sb_devices d ON d.id=sb_browse_runs.device_id JOIN sb_sessions s ON s.id=sb_browse_runs.session_id JOIN sb_browse_calibrations c ON c.id=sb_browse_runs.calibration_id
      LEFT JOIN sb_browse_leases old ON old.run_id=sb_browse_runs.id AND old.seq=?
      WHERE sb_browse_runs.id=? AND sb_browse_runs.device_id=? AND sb_browse_runs.owner_id=? AND d.revoked=0`,...times(now),seq,runID,device.id,device.owner_id).first<Context>();
    need(run,"NOT_FOUND",404);
    need(run.session_id===uuid(body.bridge_session_id) && run.broadcast_id===uuid(body.broadcast_id) && run.worker_id===uuid(body.worker_id) && run.lease_epoch===integer(body.lease_epoch,1) && run.control_epoch===integer(body.control_epoch,1),"STALE_BROWSE_SCOPE");
    if(run.previous_lease){need(run.previous_request===request,"IDEMPOTENCY_CONFLICT");return {run_id:run.id,lease_id:run.previous_lease,lease_seq:seq,executable:false,retry_only:true};}
    need(run.live===1 && run.state==="active" && seq===run.lease_seq+1 && (run.head_expires_at==null || run.head_expires_at>now),"STALE_BROWSE_LEASE");
    const id=uid(),until=Math.min(now+2500,run.expires_at,run.worker_until,run.grant_until,run.calibration_until,run.head_expires_at??Number.MAX_SAFE_INTEGER);need(until>now,"STALE_BROWSE_LEASE");
    const result=await this.e.db.batch([
      this.e.stmt(`INSERT INTO sb_browse_leases(id,run_id,seq,request_id,issued_at,expires_at) SELECT ?,id,?,?,?,? FROM sb_browse_runs WHERE id=? AND lease_seq=? AND state='active' AND expires_at>? AND ${liveRun}`,id,seq,request,now,until,run.id,run.lease_seq,now,...times(now)),
      this.e.stmt("UPDATE sb_browse_runs SET lease_seq=?,lease_request_id=?,last_lease_id=? WHERE id=? AND lease_seq=? AND state='active' AND EXISTS(SELECT 1 FROM sb_browse_leases l WHERE l.id=? AND l.run_id=sb_browse_runs.id)",seq,request,id,run.id,run.lease_seq,id),
      this.e.stmt("SELECT sb_browse_runs.*,l.expires_at AS granted_until FROM sb_browse_runs JOIN sb_browse_leases l ON l.id=sb_browse_runs.last_lease_id AND l.run_id=sb_browse_runs.id WHERE sb_browse_runs.id=? AND last_lease_id=?",run.id,id),
    ]);
    need(result[0].meta.changes===1 && result[1].meta.changes===1,"STALE_BROWSE_LEASE");
    const current=result[2].results[0] as unknown as Run&{granted_until:number};
    need(current && current.state==="active" && current.last_lease_id===id && current.lease_seq===seq,"STALE_BROWSE_LEASE");
    const remaining=until-this.e.now();need(remaining>0,"STALE_BROWSE_LEASE");
    return {run_id:run.id,lease_id:id,lease_seq:seq,executable:true,expires_in_ms:remaining,issued_at:iso(now),expires_at:iso(until),scope:{protocol:BROWSE_PROTOCOL,device_id:run.device_id,bridge_session_id:run.session_id,broadcast_id:run.broadcast_id,worker_id:run.worker_id,lease_epoch:run.lease_epoch,control_epoch:run.control_epoch,hardware_id:run.hardware_id,board_boot_id:run.board_boot_id,calibration_id:run.calibration_id,pointer_settings_hash:run.settings_hash,orientation_epoch:run.orientation_epoch},queue:JSON.parse(current.queue_json),tail_step_id:current.tail_step_id,revision:current.revision};
  }
  private async lease(run: Run, id: unknown) {
    const lease=await this.e.stmt("SELECT * FROM sb_browse_leases WHERE id=? AND run_id=? AND expires_at>?",uuid(id),run.id,this.e.now()).first<Lease>(); need(lease && run.state==="active","STALE_BROWSE_LEASE"); return lease;
  }
  private async document(raw:unknown,metadata:Record<string,unknown>) {
    const {p}=validateDocument(raw,metadata);
    need(p.truncated===false && p.omitted_blocks===0,"INCOMPLETE_BROWSE_OBSERVATION");
    need(metadata.content_sha256===await hash(String(p.full_text)),"OCR_HASH_MISMATCH");
    return p;
  }
  private async snapshot(device: Device, run: Run, raw: unknown): Promise<Snapshot> {
    const value=record(raw); exact(value,["metadata","ocr"]); const metadata=this.e.validateMetadata(record(value.metadata),8192);
    need(metadata.bridge_session_id===run.session_id && metadata.broadcast_id===run.broadcast_id && metadata.worker_id===run.worker_id && metadata.lease_epoch===run.lease_epoch && metadata.orientation_epoch===run.orientation_epoch && metadata.orientation==="portrait","STALE_BROWSE_OBSERVATION");
    need(metadata.clock_probe_id && !metadata.refresh_request_id,"BROWSE_CLOCK_PROBE_REQUIRED");
    const session=await this.e.session(device,metadata), ocr=await this.document(value.ocr,metadata), lower=await this.e.frameLower(device,session,metadata);
    const calibration=await this.e.stmt("SELECT source_width,source_height FROM sb_browse_calibrations WHERE id=?",run.calibration_id).first<{source_width:number;source_height:number}>();
    need(calibration && metadata.width===calibration.source_width && metadata.height===calibration.source_height,"CALIBRATION_GEOMETRY_CHANGED");
    need(lower!=null,"CLOCK_UNCERTAIN");
    const signature=await hash(canonical({blocks:ocr.blocks,width:ocr.image_width,height:ocr.image_height})); return {metadata,ocr,lower,signature};
  }
  private async snapshotKnown(run:Run, raw:unknown, probeCreated:number|null, sourceWidth:number, sourceHeight:number):Promise<Snapshot> {
    const value=record(raw);exact(value,["metadata","ocr"]);const metadata=this.e.validateMetadata(record(value.metadata),8192);
    need(metadata.bridge_session_id===run.session_id && metadata.broadcast_id===run.broadcast_id && metadata.worker_id===run.worker_id && metadata.lease_epoch===run.lease_epoch && metadata.orientation_epoch===run.orientation_epoch && metadata.orientation==="portrait","STALE_BROWSE_OBSERVATION");
    need(metadata.width===sourceWidth && metadata.height===sourceHeight,"CALIBRATION_GEOMETRY_CHANGED");
    need(probeCreated!=null && metadata.clock_probe_id && !metadata.refresh_request_id,"BROWSE_CLOCK_PROBE_REQUIRED");
    const ocr=await this.document(value.ocr,metadata),lower=probeCaptureLower(metadata,probeCreated,this.e.now());need(lower!=null,"CLOCK_UNCERTAIN");
    return {metadata,ocr,lower,signature:await hash(canonical({blocks:ocr.blocks,width:ocr.image_width,height:ocr.image_height}))};
  }
  private inputProof(run:Run, first:QueuedStep, lease:Lease, before:Snapshot, body:Record<string,unknown>, digest:string):InputProof {
    const received=finite(body.lease_received_mono_ms,0,Number.MAX_SAFE_INTEGER),rtt=finite(body.lease_rtt_ms,0,2500),started=finite(body.input_started_mono_ms,received,Number.MAX_SAFE_INTEGER),finished=finite(body.finished_mono_ms,started,Number.MAX_SAFE_INTEGER);
    need(finished<=received+(lease.expires_at-lease.issued_at)-rtt,"EXPIRED_LOCAL_BROWSE_LEASE");
    const captured=Number(before.metadata.capture_mono_ms),uncertainty=finite(before.metadata.clock_rtt_ms,0,2000)+100;
    need(captured<=started && finished-captured<=2000,"STALE_BROWSE_OBSERVATION");
    need(before.lower+received-captured+uncertainty>=lease.issued_at && before.lower+finished-captured+uncertainty<=lease.expires_at,"BROWSE_INPUT_OUTSIDE_LEASE");
    if(run.checkpoint_json){const previous=JSON.parse(run.checkpoint_json);need(captured>=previous.metadata.capture_mono_ms && Number(before.metadata.frame_seq)>=previous.metadata.frame_seq && started>=previous.metadata.capture_mono_ms,"BROWSE_INPUT_ORDER");}
    const point=targetPoint(first.spec,before.ocr); need(Array.isArray(body.receipts) && body.receipts.length===(point?2:1),"INVALID_BROWSE_RECEIPT",422);
    const receipts=body.receipts.map(record);
    for(let index=0;index<receipts.length;index++){const receipt=receipts[index];exact(receipt,["command_id","board_boot_id","state","subcommand_index","started_uptime_ms","finished_uptime_ms","effect","error"]);need(new TextEncoder().encode(canonical(receipt)).length<=8192,"BROWSE_RECEIPT_TOO_LARGE",413);const startedBoard=finite(receipt.started_uptime_ms,0,Number.MAX_SAFE_INTEGER);finite(receipt.finished_uptime_ms,startedBoard,Number.MAX_SAFE_INTEGER);need(receipt.command_id===first.step_id && receipt.board_boot_id===run.board_boot_id && receipt.state==="executed" && receipt.subcommand_index===index && (receipt.error==null) && record(receipt.effect).hid_reports_sent===true,"INVALID_BROWSE_RECEIPT",422);}
    if(point){const axes=absoluteMouseRequest({x:point.x,y:point.y,image_width:before.metadata.width,image_height:before.metadata.height,orientation_epoch:run.orientation_epoch}).payload;const effect=record(receipts[0].effect);need(effect.absolute_requested_x===axes.x && effect.absolute_requested_y===axes.y,"ABSOLUTE_RECEIPT_MISMATCH",422);need(finite(receipts[0].finished_uptime_ms,0,Number.MAX_SAFE_INTEGER)<=finite(receipts[1].started_uptime_ms,0,Number.MAX_SAFE_INTEGER),"BROWSE_INPUT_ORDER");}
    return {step_id:first.step_id,digest,before:before.metadata,before_signature:before.signature,receipts,started_mono_ms:started,finished_mono_ms:finished,lease_id:lease.id};
  }
  private async inputDigest(stepID:string,body:Record<string,unknown>,reportLease:unknown) {
    return hash(canonical({step_id:stepID,before:body.before,receipts:body.receipts,input_started_mono_ms:body.input_started_mono_ms,finished_mono_ms:body.finished_mono_ms,execution_lease_id:uuid(body.executed_lease_id??reportLease),lease_received_mono_ms:body.lease_received_mono_ms,lease_rtt_ms:body.lease_rtt_ms}));
  }
  async input(device: Device, body: Record<string, unknown>) {
    exact(body,["bridge_session_id","broadcast_id","worker_id","lease_epoch","control_epoch","run_id","runtime_lease_id","executed_lease_id","step_id","lease_received_mono_ms","lease_rtt_ms","input_started_mono_ms","finished_mono_ms","before","receipts"]);
    const run=await this.phone(device,body), stepID=uuid(body.step_id), digest=await this.inputDigest(stepID,body,body.runtime_lease_id);
    const journal=await this.e.stmt("SELECT input_digest,evidence FROM sb_browse_journal WHERE step_id=? AND run_id=?",stepID,run.id).first<{input_digest:string;evidence:string}>();
    if(journal){need(journal.input_digest===digest,"RESULT_CONFLICT");return this.observedReplay(stepID,journal.evidence);}
    if(run.input_json){const old=JSON.parse(run.input_json) as InputProof;need(old.step_id===stepID && old.digest===digest,"RESULT_CONFLICT");return {step_id:stepID,state:"board_acked",app_effect_observed:false,replayed:true};}
    await this.lease(run,body.runtime_lease_id);
    const lease=await this.e.stmt("SELECT * FROM sb_browse_leases WHERE id=? AND run_id=?",uuid(body.executed_lease_id??body.runtime_lease_id),run.id).first<Lease>();need(lease,"STALE_EXECUTION_LEASE");
    const queue=JSON.parse(run.queue_json) as QueuedStep[], first=queue[0]; need(first?.step_id===stepID,"BROWSE_STEP_ORDER");
    const before=await this.snapshot(device,run,body.before),proof=this.inputProof(run,first,lease,before,body,digest),now=this.e.now();
    const saved=await this.e.stmt(`UPDATE sb_browse_runs SET input_json=?,revision=revision+1 WHERE id=? AND revision=? AND input_json IS NULL AND state='active' AND expires_at>? AND ${liveRun}`,canonical(proof),run.id,run.revision,now,...times(now)).run();
    need(saved.meta.changes===1,"BROWSE_CHANGED_RETRY_SAME_RESULT"); return {step_id:stepID,state:"board_acked",app_effect_observed:false,replayed:false};
  }
  async observe(device: Device, body: Record<string, unknown>) {
    exact(body,["bridge_session_id","broadcast_id","worker_id","lease_epoch","control_epoch","run_id","runtime_lease_id","step_id","after"]);
    const run=await this.phone(device,body),stepID=uuid(body.step_id),digest=await hash(canonical({step_id:stepID,after:body.after}));
    const old=await this.e.stmt("SELECT observation_digest,evidence FROM sb_browse_journal WHERE step_id=? AND run_id=?",stepID,run.id).first<{observation_digest:string;evidence:string}>();
    if(old){need(old.observation_digest===digest,"RESULT_CONFLICT");return this.observedReplay(stepID,old.evidence);}
    await this.lease(run,body.runtime_lease_id); const queue=JSON.parse(run.queue_json) as QueuedStep[],first=queue[0];
    need(first?.step_id===stepID && run.input_json,"BROWSE_STEP_ORDER"); const input=JSON.parse(run.input_json) as InputProof;
    need(input.step_id===stepID,"BROWSE_STEP_ORDER"); const after=await this.snapshot(device,run,body.after);
    return this.commitObservation(run,first,input,after,digest);
  }
  private async commitObservation(run:Run,first:QueuedStep,input:InputProof,after:Snapshot,digest:string) {
    const stepID=first.step_id,queue=JSON.parse(run.queue_json) as QueuedStep[];
    need(Number(after.metadata.capture_mono_ms)>input.finished_mono_ms && Number(after.metadata.frame_seq)>Number(input.before.frame_seq) && after.metadata.frame_id!==input.before.frame_id,"PRE_INPUT_BROWSE_FRAME");
    need(after.signature!==input.before_signature && sceneMatches(first.spec.after,after.ocr),"BROWSE_POSTCONDITION_NOT_OBSERVED");
    const previous=run.checkpoint_json?JSON.parse(run.checkpoint_json):null,click=first.spec.action.kind==="click",lastClick=previous?.last_click_started_mono_ms??null,lastBoardClick=previous?.last_board_click_uptime_ms??null;
    const currentBoardClick=click?Number(input.receipts[1].started_uptime_ms):null;
    const interval=click && lastBoardClick!=null?currentBoardClick!-Number(lastBoardClick):null,dispatchInterval=click && lastClick!=null?input.started_mono_ms-Number(lastClick):null,late=interval!=null && interval>=3000;
    need(interval==null || interval>=0,"BROWSE_INPUT_ORDER");
    const now=this.e.now(), next=queue.slice(1),checkpoint={step_id:stepID,seq:run.checkpoint_seq+1,metadata:after.metadata,ocr:after.ocr,capture_lower:after.lower,last_click_started_mono_ms:click?input.started_mono_ms:lastClick,last_board_click_uptime_ms:click?currentBoardClick:lastBoardClick};
    const evidence={input,after_metadata:after.metadata,after_signature:after.signature,observation_received_at:now,scene_guard_verified:true,board_click_interval_ms:interval,phone_dispatch_interval_ms:dispatchInterval,latency_deadline_missed:late,checkpoint_seq:run.checkpoint_seq+1};
    const saved=await this.e.db.batch([
      this.e.stmt(`INSERT INTO sb_browse_journal(step_id,run_id,plan_id,step_index,input_digest,observation_digest,evidence,created_at) SELECT ?,id,?,?,?,?,?,? FROM sb_browse_runs WHERE id=? AND revision=? AND state='active' AND expires_at>? AND ${liveRun}`,stepID,first.plan_id,first.index,input.digest,digest,canonical(evidence),now,run.id,run.revision,now,...times(now)),
      this.e.stmt("UPDATE sb_browse_runs SET queue_json=?,input_json=NULL,checkpoint_seq=checkpoint_seq+1,checkpoint_json=?,head_expires_at=?,state=?,error=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM sb_browse_journal j WHERE j.step_id=? AND j.run_id=sb_browse_runs.id AND j.observation_digest=?)",canonical(next),canonical(checkpoint),next[0]?.expires_at??null,late?"handoff":"active",late?"deadline_missed":null,run.id,run.revision,stepID,digest),
    ]);
    need(saved[0].meta.changes===1 && saved[1].meta.changes===1,"BROWSE_CHANGED_RETRY_SAME_RESULT"); return {step_id:stepID,state:"observed",app_effect_observed:true,checkpoint_seq:run.checkpoint_seq+1,latency_deadline_missed:late,replayed:false};
  }
  async checkpoint(device:Device,body:Record<string,unknown>):Promise<CheckpointReply> {
    const {feedback_image,...evidence}=body;
    const result=await this.checkpointEvidence(device,evidence);
    if(feedback_image==null)return result;
    if(result.latency_deadline_missed)return {...result,image_state:"unavailable",image_error:"CHECKPOINT_DEADLINE_MISSED"};
    // Local immutable evidence already exists. Accept the checkpoint before
    // its pixels; a failed image never changes the acknowledged input result.
    try {
      const attachment=record(feedback_image);exact(attachment,["image_metadata","jpeg_base64"]);
      const image=await this.image(device,{bridge_session_id:evidence.bridge_session_id,broadcast_id:evidence.broadcast_id,worker_id:evidence.worker_id,lease_epoch:evidence.lease_epoch,control_epoch:evidence.control_epoch,run_id:evidence.run_id,step_id:evidence.step_id,...attachment});
      return {...result,image_state:"available",image_frame_id:image.frame_id};
    } catch(error) {
      return {...result,image_state:"unavailable",image_error:error instanceof BridgeError?error.code:"BROWSE_IMAGE_FEEDBACK_UNAVAILABLE"};
    }
  }
  private async checkpointEvidence(device:Device,body:Record<string,unknown>) {
    this.enabled();exact(body,["bridge_session_id","broadcast_id","worker_id","lease_epoch","control_epoch","run_id","runtime_lease_id","step_id","input","after"]);
    const rawInput=record(body.input);exact(rawInput,["executed_lease_id","lease_received_mono_ms","lease_rtt_ms","input_started_mono_ms","finished_mono_ms","before","receipts"]);
    const inputBody={...rawInput,step_id:uuid(body.step_id)},stepID=inputBody.step_id,runID=uuid(body.run_id),leaseID=uuid(body.runtime_lease_id);
    const beforeMeta=record(record(rawInput.before).metadata),afterMeta=record(record(body.after).metadata),now=this.e.now();
    const inputDigest=await this.inputDigest(stepID,rawInput,body.runtime_lease_id),observationDigest=await hash(canonical({step_id:stepID,after:body.after}));
    const executionLeaseID=uuid(rawInput.executed_lease_id??body.runtime_lease_id);
    type Context=Run & { live:number; calibration_width:number; calibration_height:number; lease_issued_at:number|null; lease_expires_at:number|null; execution_issued_at:number|null; execution_expires_at:number|null; lease_request:string|null; lease_number:number|null; before_probe:number|null; after_probe:number|null; recorded_input:string|null; recorded_observation:string|null; recorded_evidence:string|null };
    // One context/clock/lease read and one atomic two-statement commit for the
    // normal path. No cloud round trip is needed between HID and observation.
    const context=await this.e.stmt(`SELECT sb_browse_runs.*,CASE WHEN ${liveRun} THEN 1 ELSE 0 END AS live,c.source_width AS calibration_width,c.source_height AS calibration_height,l.issued_at AS lease_issued_at,l.expires_at AS lease_expires_at,executed.issued_at AS execution_issued_at,executed.expires_at AS execution_expires_at,executed.request_id AS lease_request,executed.seq AS lease_number,pb.created_at AS before_probe,pa.created_at AS after_probe,j.input_digest AS recorded_input,j.observation_digest AS recorded_observation,j.evidence AS recorded_evidence
      FROM sb_browse_runs JOIN sb_devices d ON d.id=sb_browse_runs.device_id JOIN sb_browse_calibrations c ON c.id=sb_browse_runs.calibration_id
      LEFT JOIN sb_browse_leases l ON l.id=? AND l.run_id=sb_browse_runs.id
      LEFT JOIN sb_browse_leases executed ON executed.id=? AND executed.run_id=sb_browse_runs.id
      LEFT JOIN sb_clock_probes pb ON pb.id=? AND pb.device_id=d.id AND pb.expires_at>?
      LEFT JOIN sb_clock_probes pa ON pa.id=? AND pa.device_id=d.id AND pa.expires_at>?
      LEFT JOIN sb_browse_journal j ON j.step_id=? AND j.run_id=sb_browse_runs.id
      WHERE sb_browse_runs.id=? AND sb_browse_runs.device_id=? AND sb_browse_runs.owner_id=? AND d.revoked=0`,...times(now),leaseID,executionLeaseID,uuid(beforeMeta.clock_probe_id),now,uuid(afterMeta.clock_probe_id),now,stepID,runID,device.id,device.owner_id).first<Context>();
    need(context,"NOT_FOUND",404);
    need(context.session_id===uuid(body.bridge_session_id) && context.broadcast_id===uuid(body.broadcast_id) && context.worker_id===uuid(body.worker_id) && context.lease_epoch===integer(body.lease_epoch,1) && context.control_epoch===integer(body.control_epoch,1),"STALE_BROWSE_SCOPE");
    if(context.recorded_observation){need(context.recorded_input===inputDigest && context.recorded_observation===observationDigest,"RESULT_CONFLICT");return this.observedReplay(stepID,context.recorded_evidence!);}
    need(context.live===1 && context.state==="active" && context.expires_at>now && context.lease_expires_at!=null && context.lease_expires_at>now && (context.head_expires_at==null || context.head_expires_at>now),"STALE_BROWSE_LEASE");
    const first=(JSON.parse(context.queue_json) as QueuedStep[])[0];need(first?.step_id===stepID,"BROWSE_STEP_ORDER");
    let input:InputProof;
    if(context.input_json){input=JSON.parse(context.input_json);need(input.step_id===stepID && input.digest===inputDigest,"RESULT_CONFLICT");}
    else {
      const before=await this.snapshotKnown(context,rawInput.before,context.before_probe,context.calibration_width,context.calibration_height);
      need(context.execution_issued_at!=null && context.execution_expires_at!=null,"STALE_EXECUTION_LEASE");
      const lease:Lease={id:executionLeaseID,run_id:runID,seq:context.lease_number!,request_id:context.lease_request!,issued_at:context.execution_issued_at,expires_at:context.execution_expires_at};
      input=this.inputProof(context,first,lease,before,inputBody,inputDigest);
    }
    const after=await this.snapshotKnown(context,body.after,context.after_probe,context.calibration_width,context.calibration_height);
    return this.commitObservation(context,first,input,after,observationDigest);
  }
  async halt(device: Device, body: Record<string, unknown>) {
    exact(body,["bridge_session_id","broadcast_id","worker_id","lease_epoch","control_epoch","run_id","reason","input_outcome"]);
    const run=await this.phone(device,body),reason=text(body.reason,80);
    need(["scene_mismatch","ambiguous_target","ambiguous_transition","unknown_outcome","receipt_mismatch","stale_authority","unverified_pointer","deadline_missed","plan_starved","stopped","plan_expired","orientation_changed"].includes(reason),"INVALID_BROWSE_HALT",422);
    need(["none_pending","board_acked","outcome_unknown"].includes(String(body.input_outcome)),"INVALID_BROWSE_INPUT_OUTCOME",422);
    const revoke=run.state==="outcome_unknown" || reason==="unknown_outcome" || reason==="receipt_mismatch" || reason==="stopped" || body.input_outcome==="outcome_unknown";
    await this.e.stmt("UPDATE sb_browse_runs SET state=?,error=?,revision=revision+1 WHERE id=? AND state IN ('active','handoff')",revoke?"outcome_unknown":"handoff",reason,run.id).run();
    if(revoke)await this.e.stmt("UPDATE sb_sessions SET mouse_enabled=0,input_end=0,control_epoch=control_epoch+1 WHERE id=? AND control_epoch=? AND owner_id=?",run.session_id,run.control_epoch,run.owner_id).run();
    return {halted:true,reason,requires_new_phone_grant:revoke,board_release_confirmed:false};
  }
  async get(user: User, args: Record<string, unknown>) {
    this.enabled(); exact(args,["run_id"]); return this.present(user,await this.readContext(user,args.run_id,true));
  }
  private async present(user:User,run:RunContext) {
    const queue=JSON.parse(run.queue_json) as QueuedStep[];
    const result:Record<string,unknown>={run_id:run.id,state:run.state,error:run.error,pending_steps:run.state==="active"?queue.length:0,uncompleted_steps:queue.length,remaining_slots:run.state==="active"?5-queue.length:0,tail_step_id:run.tail_step_id,revision:run.revision,checkpoint_seq:run.checkpoint_seq,input_state:run.input_json?"board_acked":run.lease_seq>0 && queue.length>0?"not_yet_reported":"none",input_app_effect_observed:false,observation_state:"unavailable"};
    if(run.checkpoint_json && run.state==="active"){
      const checkpoint=JSON.parse(run.checkpoint_json),age=this.e.now()-checkpoint.capture_lower;
      if(age>=0 && age<=2000){const document=record(checkpoint.ocr),all=document.blocks as Record<string,unknown>[],blocks:Record<string,unknown>[]=[];let length=0;for(const b of all){const label=String(b.text);if(blocks.length>=64 || label.length>2048 || length+label.length>16384)continue;blocks.push({id:b.id,text:b.text,confidence:b.confidence,bounds:b.bounds});length+=label.length;}result.observation_state="available";result.observation={source:"actual_device_ocr_checkpoint",projection:true,step_id:checkpoint.step_id,checkpoint_seq:checkpoint.seq,metadata:{...checkpoint.metadata,age_ms:age},blocks,text:blocks.map(b=>b.text).join("\n"),omitted_blocks:all.length-blocks.length,app_effect_observed:true};}
      else result.observation_state="stale";
      if(result.observation_state==="available") {
        let imageSnapshot=run;
        // A matching image may finish uploading during the first read. Adopt
        // it once, with another post-image authority read, instead of forcing
        // an additional native MCP round trip for that arrival race.
        for(let attempt=0;attempt<2;attempt++) {
          Object.assign(result,await this.imageFor(user,imageSnapshot,record(checkpoint)));
          const current=await this.readContext(user,run.id,true),latest=current.checkpoint_json?record(JSON.parse(current.checkpoint_json)):null,age=this.e.now()-checkpoint.capture_lower;
          const latestFrame=latest?record(latest.metadata).frame_id:null;
          if(current.state!=="active" || current.live!==1 || latest?.step_id!==checkpoint.step_id || latest?.seq!==checkpoint.seq || latestFrame!==record(checkpoint.metadata).frame_id || latest?.capture_lower!==checkpoint.capture_lower || age<0 || age>2000){
            const pending=JSON.parse(current.queue_json) as QueuedStep[];
            Object.assign(result,{state:current.state,error:current.error,pending_steps:current.state==="active"?pending.length:0,uncompleted_steps:pending.length,remaining_slots:current.state==="active"?5-pending.length:0,tail_step_id:current.tail_step_id,revision:current.revision,checkpoint_seq:current.checkpoint_seq,observation_state:"stale",image_state:"stale"});
            delete result.observation;delete result.image;delete result.image_metadata;
            break;
          } else {
            const observation=record(result.observation);record(observation.metadata).age_ms=age;
            if(result.image_metadata)record(result.image_metadata).age_ms=age;
            if(result.image && age>1499){result.image_state="stale";delete result.image;delete result.image_metadata;}
          }
          if(attempt===0 && result.image_state==="pending" && current.image_row && current.image_row!==imageSnapshot.image_row){imageSnapshot=current;continue;}
          break;
        }
      }
    }
    return result;
  }
  async stop(user: User, args: Record<string, unknown>) {
    this.enabled(); exact(args,["run_id"]); const run=await this.owned(user,args.run_id);
    await this.e.db.batch([
      this.e.stmt("UPDATE sb_browse_runs SET state=CASE WHEN lease_seq>0 AND queue_json!='[]' THEN 'outcome_unknown' ELSE 'cancelled' END,error='USER_STOPPED',revision=revision+1 WHERE id=? AND owner_id=? AND state='active'",run.id,user.id),
      this.e.stmt("UPDATE sb_sessions SET mouse_enabled=0,input_end=0,control_epoch=control_epoch+1 WHERE id=? AND owner_id=? AND control_epoch=?",run.session_id,user.id,run.control_epoch),
    ]);
    return {run_id:run.id,stopped:true,screen_sharing_stopped:false,board_release_confirmed:false};
  }
}
