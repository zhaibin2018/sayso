import {BridgeEngine,BridgeError,databaseNowSQL,need,record,uuid,uid,integer,hash,iso,type User,type Device} from "./bridge-engine.ts";
import {Buffer} from "node:buffer";
import {canonical} from "./browse-contract.ts";
import {MouseControl} from "./mouse-control.ts";
import {nextPollDelayMS} from "./read-policy.ts";
import {APP_SEARCH_KIND,APP_SEARCH_PROTOCOL,APP_SEARCH_CAPABILITY,SOURCE_KEYS,searchPreparationRequest,
  validateSearchPreparationResult,searchPreparationImagesAccepted,type SearchPreparationRow} from "./app-search-contract.ts";

const pending=new Set(["queued","claimed","executing"]);
const from=" FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id";
const capabilities=` AND json_extract(h.metadata,'$.capabilities."${APP_SEARCH_CAPABILITY}"')=1 AND json_extract(h.metadata,'$.capabilities."hid.keyboard.system_search"')=1 AND json_extract(h.metadata,'$.capabilities."hid.keyboard.ascii_stable"')=1`;
const live=`d.revoked=0 AND d.token_expires>${databaseNowSQL} AND d.worker_expires>${databaseNowSQL} AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.input_end>${databaseNowSQL} AND h.usb_connected=1`;

export function appSearchAuthoritySQL(row:string,deadline=true){
  return `EXISTS(SELECT 1${from} WHERE ${live}${capabilities} AND d.id=${row}.device_id AND d.owner_id=${row}.owner_id
    AND s.id=${row}.session_id AND s.broadcast_id=json_extract(${row}.payload,'$.scope.broadcast_id')
    AND d.worker_id=json_extract(${row}.payload,'$.scope.worker_id') AND d.lease_epoch=json_extract(${row}.payload,'$.scope.lease_epoch')
    AND s.control_epoch=${row}.control_epoch AND h.hardware_id=${row}.hardware_id AND h.board_boot_id=${row}.board_boot_id
    ${deadline?`AND ${row}.expires_at>${databaseNowSQL}`:""})`;
}

/** One exclusive parent command, two original board IDs. Never chooses an App
 * or interprets a keyboard receipt as foreground success. */
export class AppSearchControl {
  private e:BridgeEngine;private now:()=>number;private sleep:(ms:number)=>Promise<void>;
  constructor(e:BridgeEngine,timing:{now?:()=>number;sleep?:(ms:number)=>Promise<void>}={}){
    this.e=e;this.now=timing.now??(()=>performance.now());this.sleep=timing.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  }
  private output(row:SearchPreparationRow){
    const execution=row.receipt?record(JSON.parse(row.receipt)):null;
    return {preparation_id:row.id,device_id:row.device_id,bridge_session_id:row.session_id,
      state:row.state==="completed"?String(execution?.state):row.state,expires_at:iso(row.expires_at),error:row.error,
      queued:true,execution,app_effect_observed:false,model_observed_effect:false};
  }
  async enqueue(user:User,args:Record<string,unknown>){
    const request=searchPreparationRequest(args),digest=await hash(request.digestInput);
    const prior=await this.e.stmt("SELECT c.* FROM sb_mouse_commands c JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id WHERE c.id=? AND c.owner_id=? AND d.revoked=0",request.id,user.id).first<SearchPreparationRow>();
    if(prior){need(prior.device_id===request.device&&prior.kind===APP_SEARCH_KIND&&prior.digest===digest,"IDEMPOTENCY_CONFLICT");return this.get(user,request.id,false);}
    const source=await this.e.revalidateCommandSource(user,request.device,request.imageRef);
    const sameScope=source.metadata&&SOURCE_KEYS.every(key=>source.metadata![key]===request.scope[key]);
    if(source.state!=="unchanged"||!sameScope)return {preparation_id:request.id,device_id:request.device,state:"review_required",
      queued:false,error:null,reason:sameScope?"SOURCE_PIXELS_CHANGED":"SOURCE_SCOPE_OR_IMAGE_UNAVAILABLE",app_effect_observed:false,
      after_screen:{state:source.state,metadata:source.metadata??null,image_ref:source.image_ref},image:source.image,image_ref:source.image_ref};
    const frame=uuid(source.metadata!.frame_id);
    type Live={id:string;sid:string;broadcast_id:string;worker_id:string;lease_epoch:number;control_epoch:number;input_end:number;hardware_id:string;board_boot_id:string;hardware_metadata:string;acceptance_json:string;sha256:string};
    const r=await this.e.stmt(`SELECT d.id,s.id AS sid,s.broadcast_id,d.worker_id,d.lease_epoch,s.control_epoch,s.input_end,h.hardware_id,h.board_boot_id,h.metadata AS hardware_metadata,a.acceptance_json,f.sha256
      ${from} JOIN sb_frames f ON f.device_id=d.id AND f.owner_id=d.owner_id AND f.session_id=s.id AND f.lease_epoch=d.lease_epoch
      JOIN sb_observations a ON a.id=d.id||':'||? AND a.device_id=d.id
      WHERE d.id=? AND d.owner_id=? AND ${live}${capabilities} AND a.acceptance_json IS NOT NULL
      AND f.expires_at>${databaseNowSQL} AND f.capture_lower BETWEEN ${databaseNowSQL}-1499 AND ${databaseNowSQL}+100`,frame,request.device,user.id).first<Live>();
    need(r,"SEARCH_PREPARATION_APP_OR_SOURCE_NOT_READY");
    need(r.sid===request.scope.bridge_session_id&&r.broadcast_id===request.scope.broadcast_id&&r.worker_id===request.scope.worker_id&&
      r.lease_epoch===request.scope.lease_epoch&&r.control_epoch===request.scope.control_epoch_at_read,"SEARCH_PREPARATION_SOURCE_SCOPE");
    const accepted=record(JSON.parse(r.acceptance_json)),m=record(accepted.metadata);
    integer(m.source_seq,1);
    need(m.frame_id===frame&&m.content_sha256===r.sha256&&(m.capture_clock_verified===true||m.capture_clock_verified===1)&&
      ["bridge_session_id","broadcast_id","worker_id","lease_epoch","width","height","native_width_px","native_height_px","orientation","orientation_epoch"].every(key=>m[key]===request.scope[key]),"SEARCH_PREPARATION_SOURCE_CHANGED");
    const scope={...request.scope,control_epoch:r.control_epoch,hardware_id:r.hardware_id,board_boot_id:r.board_boot_id,
      descriptor_version:record(JSON.parse(r.hardware_metadata)).descriptor_version};
    const payload=canonical({protocol:APP_SEARCH_PROTOCOL,scope,source_frame_id:frame,source_sha256:r.sha256,
      source_capture_mono_ms:m.capture_mono_ms,source_seq:m.source_seq,source_allows_search:request.request.source_allows_search,
      query:request.query,target_labels:request.targets,capture_min_gap_ms:request.gap,search_command_id:uid(),text_command_id:uid()});
    const now=this.e.now(),expires=now+15000,mouse=new MouseControl(this.e);
    const rows=await this.e.db.batch<SearchPreparationRow>([
      mouse.ownedDeviceExpiration(user,request.device),
      this.e.stmt(`INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,control_epoch,created_at,expires_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,'queued',?,?,? WHERE EXISTS(SELECT 1${from} JOIN sb_frames f ON f.device_id=d.id AND f.owner_id=d.owner_id AND f.session_id=s.id AND f.lease_epoch=d.lease_epoch
          WHERE d.id=? AND d.owner_id=? AND ${live}${capabilities} AND s.id=? AND s.broadcast_id=? AND d.worker_id=? AND d.lease_epoch=?
          AND s.control_epoch=? AND h.hardware_id=? AND h.board_boot_id=? AND h.metadata=? AND ?>${databaseNowSQL}
          AND f.sha256=? AND f.expires_at>${databaseNowSQL} AND f.capture_lower BETWEEN ${databaseNowSQL}-1499 AND ${databaseNowSQL}+100
          AND json_extract(f.metadata,'$.worker_id')=d.worker_id AND json_extract(f.metadata,'$.broadcast_id')=s.broadcast_id
          AND json_extract(f.metadata,'$.orientation_epoch')=? AND json_extract(f.metadata,'$.width')=? AND json_extract(f.metadata,'$.height')=?
          AND json_extract(f.metadata,'$.native_width_px')=? AND json_extract(f.metadata,'$.native_height_px')=? AND json_extract(f.metadata,'$.orientation')='portrait'
          AND NOT EXISTS(SELECT 1 FROM sb_mouse_commands c WHERE c.device_id=d.id AND (c.state IN ('queued','claimed','executing','embedded') OR
            (c.kind='${APP_SEARCH_KIND}' AND c.state='outcome_unknown' AND c.owner_id=d.owner_id AND c.session_id=s.id AND c.control_epoch=s.control_epoch AND c.board_boot_id=h.board_boot_id)))
          AND NOT EXISTS(SELECT 1 FROM sb_browse_runs b WHERE b.device_id=d.id AND b.session_id=s.id AND b.control_epoch=s.control_epoch AND b.state IN ('active','outcome_unknown','halted')))
        ON CONFLICT DO NOTHING`,request.id,user.id,request.device,r.sid,r.hardware_id,r.board_boot_id,APP_SEARCH_KIND,payload,digest,"app-search:"+request.id,r.control_epoch,now,expires,
        request.device,user.id,r.sid,r.broadcast_id,r.worker_id,r.lease_epoch,r.control_epoch,r.hardware_id,r.board_boot_id,r.hardware_metadata,expires,r.sha256,
        request.scope.orientation_epoch,request.scope.width,request.scope.height,request.scope.native_width_px,request.scope.native_height_px),
      this.e.stmt("SELECT * FROM sb_mouse_commands WHERE id=? AND owner_id=? AND device_id=?",request.id,user.id,request.device)]);
    const saved=rows[2].results[0];need(saved&&saved.kind===APP_SEARCH_KIND&&saved.digest===digest,saved?"IDEMPOTENCY_CONFLICT":"SEARCH_PREPARATION_BUSY_OR_CHANGED");
    return {...this.output(saved),image:undefined,image_ref:undefined};
  }
  async enqueueObserved(user:User,args:Record<string,unknown>){
    const wait=integer(args.wait_ms??6000,0,10000),deadline=this.now()+wait;
    const queued=await this.enqueue(user,args);
    if(!queued.queued||wait===0)return queued;
    let latest=queued;
    while(this.now()<deadline){
      const started=this.now();
      try{
        const current=await this.get(user,queued.preparation_id,true);latest=current;
        if(!pending.has(current.state))return current;
      }catch(error){return {...latest,observation_error:error instanceof BridgeError?error.code:"SEARCH_OBSERVATION_UNAVAILABLE"};}
      const remaining=nextPollDelayMS(250,started,this.now(),deadline);if(remaining>0)await this.sleep(remaining);
    }
    return {...latest,observation_error:"SEARCH_WAIT_BUDGET_EXHAUSTED"};
  }
  async get(user:User,id:unknown,includeImage=true){
    const row=await new MouseControl(this.e).ownedCommand(user,uuid(id));
    need(row&&row.kind===APP_SEARCH_KIND,"NOT_FOUND",404);
    const result=this.output(row),empty={...result,after_screen:{state:"not_requested",reason:"NO_CONFIRMED_PREPARATION"},image:undefined as string|undefined,image_ref:undefined as string|undefined};
    if(!includeImage||pending.has(row.state)||row.state==="outcome_unknown"||!row.receipt)return empty;
    const proof=validateSearchPreparationResult(row,record(JSON.parse(row.receipt))),scope=record(record(JSON.parse(row.payload)).scope);
    const screen=await this.e.readScreen(user,{device_id:row.device_id,allow_repeated:false,wait_for_new_ms:0},0,false);
    const m=screen.metadata,last=proof.observations.at(-1),ack=proof.lastInput?.finished_client_mono_ms;
    const qualified=screen.state==="available"&&typeof screen.image==="string"&&m&&last&&
      SOURCE_KEYS.every(key=>m[key]===scope[key])&&m.capture_clock_verified===true&&typeof m.capture_lower_phone_mono_ms==="number"&&
      m.capture_lower_phone_mono_ms>=last.capture_mono_ms&&Number(m.source_seq)>=last.source_seq&&
      (ack==null||m.capture_lower_phone_mono_ms>ack+(proof.lastInput?.command_id===proof.search.command_id?Number(record(JSON.parse(row.payload)).capture_min_gap_ms):0));
    const target=qualified&&proof.suggestion&&typeof screen.image==="string"&&
      await hash(Buffer.from(screen.image,"base64"))===proof.suggestion.content_sha256 ?
      {...proof.suggestion,delivered_frame_id:m!.frame_id,source_image_ref:screen.image_ref,same_pixels_revalidated_at_read:true}:null;
    return {...result,after_screen:{state:qualified?"available":"unavailable",reason:qualified?null:"NO_FRESH_PREPARATION_IMAGE",
      suggestion_target:target,
      metadata:qualified?m:null,image_ref:qualified?screen.image_ref:undefined,relation:ack==null?"current_preparation_image":"capture_after_original_child_ack",
      child_command_id:proof.lastInput?.command_id??null,phone_ack_mono_ms:ack??null,app_effect_observed:false},
      image:qualified?screen.image:undefined,image_ref:qualified?screen.image_ref:undefined};
  }
  async result(device:Device,id:string,body:Record<string,unknown>){
    const plan=uuid(id);
    need(Array.isArray(body.observations)&&body.observations.length<=8,"SEARCH_PREPARATION_IMAGE_LIMIT",422);
    const ids=body.observations.map(value=>uuid(record(value).frame_id));
    const r=await this.e.stmt(`SELECT c.*,CASE WHEN ${appSearchAuthoritySQL("c")} THEN 1 ELSE 0 END AS live_at_snapshot,
      (SELECT json_group_array(json_object('frame_id',a.frame_id,'acceptance',json(a.acceptance_json))) FROM sb_observations a
        WHERE a.device_id=c.device_id AND a.acceptance_json IS NOT NULL AND a.id IN (SELECT c.device_id||':'||value FROM json_each(?))) AS accepted_json
      FROM sb_mouse_commands c JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id
      WHERE c.id=? AND c.kind=? AND c.device_id=? AND c.owner_id=? AND d.revoked=0 AND d.token_hash=? AND d.token_expires>${databaseNowSQL}`,
      JSON.stringify(ids),plan,APP_SEARCH_KIND,device.id,device.owner_id,device.token_hash).first<SearchPreparationRow&{live_at_snapshot:number;accepted_json:string}>();
    need(r,"NOT_FOUND",404);
    const proof=validateSearchPreparationResult(r,body),encoded=canonical(body),digest=await hash(encoded);
    if(r.result_digest){need(r.result_digest===digest,"RESULT_CONFLICT");return this.output(r);}
    need(["executing","outcome_unknown"].includes(r.state),"SEARCH_PREPARATION_NOT_EXECUTING");
    const accepted=searchPreparationImagesAccepted(r,proof,JSON.parse(r.accepted_json));
    if(r.live_at_snapshot===1)need(accepted,"SEARCH_PREPARATION_SITES_EVIDENCE_MISSING",422);
    const unknown=proof.unknown||r.live_at_snapshot!==1||!accepted;
    const state=unknown?"outcome_unknown":proof.state==="stopped"?"stopped":"completed";
    const saved=await this.e.stmt(`UPDATE sb_mouse_commands SET state=?,receipt=?,result_digest=?,input_attempted=?,phone_ack_mono_ms=?,error=?
      WHERE id=? AND owner_id=? AND state=? AND result_digest IS NULL
      AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=sb_mouse_commands.device_id AND d.owner_id=sb_mouse_commands.owner_id AND d.revoked=0 AND d.token_hash=? AND d.token_expires>${databaseNowSQL})
      AND (?=1 OR ${appSearchAuthoritySQL("sb_mouse_commands")}) RETURNING *`,state,encoded,digest,proof.submitted?1:0,proof.lastInput?.finished_client_mono_ms??null,
      unknown?"ORIGINAL_PREPARATION_UNCONFIRMED":null,plan,device.owner_id,r.state,device.token_hash,unknown?1:0).first<SearchPreparationRow>();
    need(saved,"SEARCH_PREPARATION_RESULT_RACE");return this.output(saved);
  }
}
