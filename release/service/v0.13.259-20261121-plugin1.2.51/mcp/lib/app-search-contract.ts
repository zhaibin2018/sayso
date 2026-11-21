import {need,record,text,uuid,integer,finite} from "./bridge-engine.ts";
import {canonical,exact} from "./browse-contract.ts";
import {focusedTextPayload,focusedFieldEvidence} from "./spotlight-command.ts";

export const APP_SEARCH_KIND="app.search_prepare";
export const APP_SEARCH_PROTOCOL="app_search_preparation.v1";
export const APP_SEARCH_CLAIM="app_search_prepare_claim_start.v1";
export const APP_SEARCH_CAPABILITY="sayso.app_search_prepare";
export const SOURCE_KEYS=["device_id","bridge_session_id","broadcast_id","worker_id","worker_id_at_read","lease_epoch",
  "control_epoch_at_read","width","height","native_width_px","native_height_px","orientation","orientation_epoch"] as const;

export function searchPreparationRequest(args:Record<string,unknown>){
  exact(args,["preparation_id","device_id","source_image_ref","source_scope","source_allows_search","query","target_labels","capture_min_gap_ms","wait_ms"]);
  const id=uuid(args.preparation_id),device=uuid(args.device_id),imageRef=uuid(args.source_image_ref),scope={...record(args.source_scope)};
  exact(scope,[...SOURCE_KEYS]);
  for(const key of SOURCE_KEYS.slice(0,5))scope[key]=uuid(scope[key]);
  need(scope.device_id===device&&scope.worker_id===scope.worker_id_at_read,"SEARCH_PREPARATION_SOURCE_SCOPE",422);
  integer(scope.lease_epoch,1);integer(scope.control_epoch_at_read,1);integer(scope.orientation_epoch,0);
  for(const key of ["width","height","native_width_px","native_height_px"])integer(scope[key],1,8192);
  need(scope.orientation==="portrait","SEARCH_PREPARATION_ORIENTATION",422);
  need(typeof args.source_allows_search==="boolean","SEARCH_PREPARATION_SCENE_REQUIRED",422);
  const query=args.query==null?null:text(args.query,64);
  need(query===null||/^[\x20-\x7e]{1,64}$/.test(query),"SEARCH_PREPARATION_ASCII_QUERY",422);
  need(Array.isArray(args.target_labels)&&args.target_labels.length>=1&&args.target_labels.length<=4,"SEARCH_PREPARATION_TARGETS",422);
  const targets=args.target_labels.map(value=>text(value,80));
  need(new Set(targets).size===targets.length,"SEARCH_PREPARATION_TARGETS",422);
  const gap=integer(args.capture_min_gap_ms??300,0,2000),wait=integer(args.wait_ms??6000,0,10000);
  const request={protocol:APP_SEARCH_PROTOCOL,preparation_id:id,device_id:device,source_image_ref:imageRef,
    source_scope:scope,source_allows_search:args.source_allows_search,query,target_labels:targets,capture_min_gap_ms:gap};
  return {id,device,imageRef,scope,query,targets,gap,wait,request,digestInput:canonical(request)};
}

export type SearchPreparationRow={id:string;owner_id:string;device_id:string;session_id:string;hardware_id:string;
  board_boot_id:string;kind:string;payload:string;precondition:string|null;digest:string;state:string;worker_id:string|null;
  lease_epoch:number|null;control_epoch:number;created_at:number;expires_at:number;receipt:string|null;result_digest:string|null;
  error:string|null;input_attempted:number|null;phone_ack_mono_ms:number|null;predecessor_id:string|null};
export type SearchPart={command_id:string;state:"not_submitted"|"board_acked"|"outcome_unknown";input_submitted:boolean;
  board_receipt:Record<string,unknown>|null;finished_client_mono_ms:number|null;error:string|null};

function part(raw:unknown,id:string,boot:string,stage:"search"|"type"):SearchPart {
  const value=record(raw);
  exact(value,["command_id","state","input_submitted","board_receipt","finished_client_mono_ms","error"]);
  need(uuid(value.command_id)===id&&typeof value.input_submitted==="boolean","SEARCH_PREPARATION_PART",422);
  need(["not_submitted","board_acked","outcome_unknown"].includes(String(value.state)),"SEARCH_PREPARATION_PART",422);
  const state=value.state as SearchPart["state"],submitted=value.input_submitted;
  const receipt=value.board_receipt==null?null:record(value.board_receipt);
  const error=value.error==null?null:text(value.error,240);
  let ack:number|null=null;
  if(state==="not_submitted")need(!submitted&&receipt===null&&value.finished_client_mono_ms==null,"SEARCH_NO_INPUT_PROOF",422);
  if(state==="outcome_unknown")need(submitted&&receipt===null&&value.finished_client_mono_ms==null&&error!==null,"SEARCH_UNKNOWN_PROOF",422);
  if(state==="board_acked"){
    // Failure to archive an already verified ACK does not erase that ACK.
    need(submitted&&receipt!==null,"SEARCH_PREPARATION_ACK",422);
    const r=receipt!,effect=record(r.effect);
    need(uuid(r.command_id)===id&&uuid(r.board_boot_id)===boot&&r.state==="executed"&&r.subcommand_index===0&&r.error==null,
      "SEARCH_PREPARATION_RECEIPT_IDENTITY",422);
    integer(r.started_uptime_ms,0);integer(r.finished_uptime_ms,Number(r.started_uptime_ms));
    need(effect.hid_reports_sent===true&&effect.all_released===true&&effect[stage==="search"?"system_search_stable":"ascii_stable"]===true,
      "SEARCH_PREPARATION_RELEASE_REQUIRED",422);
    ack=finite(value.finished_client_mono_ms,0,Number.MAX_SAFE_INTEGER);
  }
  return {command_id:id,state,input_submitted:submitted,board_receipt:receipt,finished_client_mono_ms:ack,error};
}

export function validateSearchPreparationResult(row:SearchPreparationRow,body:Record<string,unknown>){
  const payload=record(JSON.parse(row.payload)),scope=record(payload.scope);
  exact(body,["protocol","preparation_id","bridge_session_id","broadcast_id","worker_id","lease_epoch","control_epoch","state","reason",
    "app_effect_observed","search","text","observations","field_evidence","suggestion_target"]);
  need(body.protocol===APP_SEARCH_PROTOCOL&&uuid(body.preparation_id)===row.id&&body.app_effect_observed===false,
    "SEARCH_PREPARATION_RESULT",422);
  need(uuid(body.bridge_session_id)===row.session_id&&uuid(body.broadcast_id)===scope.broadcast_id&&
    uuid(body.worker_id)===row.worker_id&&integer(body.lease_epoch,1)===row.lease_epoch&&
    integer(body.control_epoch,1)===row.control_epoch,"SEARCH_PREPARATION_RESULT_SCOPE",422);
  need(["ready_for_review","review_required","stopped","outcome_unknown"].includes(String(body.state)),"SEARCH_PREPARATION_RESULT",422);
  const reason=text(body.reason,240),search=part(body.search,uuid(payload.search_command_id),row.board_boot_id,"search"),
    typed=part(body.text,uuid(payload.text_command_id),row.board_boot_id,"type");
  need(search.command_id!==typed.command_id&&search.command_id!==row.id&&typed.command_id!==row.id,"SEARCH_PREPARATION_CHILD_IDS",422);
  if(search.state==="outcome_unknown")need(typed.state==="not_submitted","SEARCH_UNKNOWN_MUST_STOP",422);
  if(typed.input_submitted)need(typeof payload.query==="string"&&/^[\x20-\x7e]{1,64}$/.test(payload.query),"SEARCH_QUERY_REQUIRED",422);
  if(search.finished_client_mono_ms!==null&&typed.finished_client_mono_ms!==null)
    need(typed.finished_client_mono_ms>=search.finished_client_mono_ms,"SEARCH_PREPARATION_ACK_ORDER",422);
  need(Array.isArray(body.observations)&&body.observations.length<=8,"SEARCH_PREPARATION_IMAGE_LIMIT",422);
  const observations=body.observations.map(value=>{
    const item=record(value);exact(item,["frame_id","content_sha256","capture_mono_ms","source_seq"]);
    const frame=uuid(item.frame_id),digest=text(item.content_sha256,64);
    need(/^[a-f0-9]{64}$/.test(digest),"SEARCH_PREPARATION_IMAGE_HASH",422);
    return {frame_id:frame,content_sha256:digest,capture_mono_ms:finite(item.capture_mono_ms,0,Number.MAX_SAFE_INTEGER),source_seq:integer(item.source_seq,1)};
  });
  const field=body.field_evidence==null?null:record(body.field_evidence);
  const seen=new Set<string>();
  observations.forEach((image,index)=>{
    need(!seen.has(image.frame_id),"SEARCH_PREPARATION_IMAGE_ORDER",422);seen.add(image.frame_id);
    if(index)need(image.capture_mono_ms>observations[index-1].capture_mono_ms&&image.source_seq>observations[index-1].source_seq,
      "SEARCH_PREPARATION_IMAGE_ORDER",422);
  });
  if(search.input_submitted||typed.input_submitted){
    need(observations.length>0&&observations[0].content_sha256===payload.source_sha256&&
      observations[0].capture_mono_ms>=Number(payload.source_capture_mono_ms)&&observations[0].source_seq>=Number(payload.source_seq),
      "SEARCH_PREPARATION_SOURCE_IMAGE",422);
  }
  if(field){
    exact(field,["frame_id","content_sha256","native_check_executed","field_conditions_verified","field","landmark","placeholder"]);
    uuid(field.frame_id);need(typeof field.content_sha256==="string"&&/^[a-f0-9]{64}$/.test(field.content_sha256),"SEARCH_FIELD_IMAGE_REQUIRED",422);
    focusedTextPayload({source_frame_id:field.frame_id,text:payload.query,field:field.field,landmark:field.landmark,placeholder:field.placeholder});
    need(["search","搜索","搜尋"].includes(String(field.placeholder).normalize("NFKC").toLowerCase().replace(/\s/g,"")),"SEARCH_SYSTEM_PLACEHOLDER_REQUIRED",422);
    const marker=String(record(field.landmark).text).normalize("NFKC").toLowerCase().replace(/\s/g,"");
    need(["siri建议","siri建議","sirisuggestions","更多内容","更多內容","more","showmore"].includes(marker),"SEARCH_SYSTEM_MARKER_REQUIRED",422);
  }
  if(typed.input_submitted){
    need(field!==null&&field.native_check_executed===true&&field.field_conditions_verified===true,"SEARCH_NATIVE_FIELD_PROOF_REQUIRED",422);
    need(observations.some(image=>image.frame_id===field!.frame_id&&image.content_sha256===field!.content_sha256),"SEARCH_FIELD_IMAGE_REQUIRED",422);
    const fieldImage=observations.find(image=>image.frame_id===field!.frame_id)!;
    if(typed.finished_client_mono_ms!==null)need(fieldImage.capture_mono_ms<typed.finished_client_mono_ms,"SEARCH_FIELD_CAPTURE_ORDER",422);
    if(search.finished_client_mono_ms!==null){
      const image=observations.find(image=>image.frame_id===field!.frame_id)!;
      need(image.capture_mono_ms>search.finished_client_mono_ms+Number(payload.capture_min_gap_ms),"SEARCH_FIELD_CAPTURE_ORDER",422);
    }
  }
  const last=typed.state==="board_acked"?typed:search.state==="board_acked"?search:null;
  if(body.state==="ready_for_review")need(typed.state==="board_acked"&&last!==null&&search.error===null&&typed.error===null&&
    observations.some(image=>image.capture_mono_ms>last.finished_client_mono_ms!),"SEARCH_READY_WITHOUT_AFTER_IMAGE",422);
  const unknown=search.state==="outcome_unknown"||typed.state==="outcome_unknown";
  need((body.state==="outcome_unknown")===unknown,"SEARCH_PREPARATION_OUTCOME_CONFLICT",422);
  const suggestion=body.suggestion_target==null?null:record(body.suggestion_target);
  if(suggestion){
    exact(suggestion,["protocol","text","requested_label","confidence","icon_region","label_region","container_region","scene_marker","sibling_count","structure",
      "input_permission","app_effect_observed","frame_id","content_sha256","native_system_field_verified","system_field"]);
    const norm=(value:unknown)=>text(value,80).normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s/g,"");
    need(body.state==="review_required"&&body.reason==="POSSIBLE_TARGET_TEXT_VISIBLE"&&typed.state==="not_submitted"&&!unknown&&
      suggestion.protocol==="system_search_suggestion_target.v1"&&suggestion.structure==="system_search_siri_app_icon_row.v1"&&
      suggestion.input_permission===false&&suggestion.app_effect_observed===false&&suggestion.native_system_field_verified===true,
      "SEARCH_SUGGESTION_PROOF",422);
    need(Array.isArray(payload.target_labels)&&payload.target_labels.includes(suggestion.requested_label)&&norm(suggestion.text)===norm(suggestion.requested_label),"SEARCH_SUGGESTION_TARGET",422);
    finite(suggestion.confidence,0.9,1);integer(suggestion.sibling_count,2,8);
    const box=(raw:unknown)=>{const r=record(raw);exact(r,["x","y","width","height"]);
      const x=finite(r.x,0,1),y=finite(r.y,0,1),width=finite(r.width,Number.EPSILON,1),height=finite(r.height,Number.EPSILON,1);
      need(x+width<=1&&y+height<=1,"SEARCH_SUGGESTION_REGION",422);return{x,y,width,height};};
    const icon=box(suggestion.icon_region),label=box(suggestion.label_region),container=box(suggestion.container_region),marker=record(suggestion.scene_marker);
    exact(marker,["text","region","confidence"]);finite(marker.confidence,0.9,1);
    need(["siri建议","siri建議","sirisuggestions"].includes(norm(marker.text)),"SEARCH_SUGGESTION_MARKER",422);
    const title=box(marker.region),inside=(r:typeof icon)=>r.x>=container.x&&r.y>=container.y&&r.x+r.width<=container.x+container.width+1e-9&&r.y+r.height<=container.y+container.height+1e-9;
    need(inside(icon)&&inside(label)&&title.y+title.height<=container.y&&icon.width*icon.height<=.08&&
      icon.y+icon.height<=label.y+2/Number(scope.height),"SEARCH_SUGGESTION_REGION",422);
    const last=observations.at(-1);
    need(last&&uuid(suggestion.frame_id)===last.frame_id&&suggestion.content_sha256===last.content_sha256,"SEARCH_SUGGESTION_IMAGE",422);
    const system=record(suggestion.system_field);exact(system,["field","landmark","placeholder"]);
    const evidence=focusedFieldEvidence({source_frame_id:suggestion.frame_id,...system});
    need(["search","搜索","搜尋"].includes(norm(evidence.placeholder))&&container.y+container.height<=evidence.field.y&&
      ["siri建议","siri建議","sirisuggestions","更多内容","更多內容","more","showmore"].includes(norm(evidence.landmark.text)),"SEARCH_SUGGESTION_FIELD",422);
  }
  return {state:String(body.state),reason,search,text:typed,observations,field,lastInput:last,unknown,
    suggestion,submitted:search.input_submitted||typed.input_submitted};
}

/** Cross-check against authenticated frame-acceptance records, not against
 * another phone-provided boolean. The caller reads these with the parent row. */
export function searchPreparationImagesAccepted(row:SearchPreparationRow,proof:ReturnType<typeof validateSearchPreparationResult>,accepted:unknown[]):boolean {
  const scope=record(record(JSON.parse(row.payload)).scope);
  return proof.observations.every(image=>accepted.some(raw=>{
    const value=record(raw),entry=record(value.acceptance),m=record(entry.metadata),age=Number(entry.commit_server_ms)-Number(entry.capture_lower_ms);
    return value.frame_id===image.frame_id&&m.frame_id===image.frame_id&&m.content_sha256===image.content_sha256&&
      m.source_seq===image.source_seq&&m.capture_mono_ms===image.capture_mono_ms&&(m.capture_clock_verified===true||m.capture_clock_verified===1)&&
      ["bridge_session_id","broadcast_id","worker_id","lease_epoch","width","height","native_width_px","native_height_px","orientation","orientation_epoch"].every(key=>m[key]===scope[key])&&
      m.transform_version==="1"&&Number.isFinite(age)&&age>=-100&&age<1500;
  }));
}
