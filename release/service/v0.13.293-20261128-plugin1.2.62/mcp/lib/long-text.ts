import { need, record, text, uuid, type BridgeEngine, type User } from "./bridge-engine.ts";

export const candidateTextLimit=150;
export function deviceTextLimit(capabilities:Record<string,unknown>,clear=false) {
  const n=capabilities.max_text_len;
  return typeof n==="number"&&Number.isSafeInteger(n)&&n>=1&&n<=candidateTextLimit?n:clear?60:64;
}
export function checkTextLimit(value:string,capabilities:Record<string,unknown>,clear=false) {
  const limit=deviceTextLimit(capabilities,clear);
  need(value.length<=limit,`TEXT_TOO_LONG_MAX_${limit}`,422);
}
export function textLimitSQL(metadata:string,clear:string) {
  const n=`json_extract(${metadata},'$.capabilities.max_text_len')`;
  return `(CASE WHEN json_type(${metadata},'$.capabilities.max_text_len')='integer' AND ${n} BETWEEN 1 AND ${candidateTextLimit} THEN ${n} WHEN ${clear} THEN 60 ELSE 64 END)`;
}
export function focusedTextDispatchSQL(command:string,metadata:string,base:readonly string[],enter:readonly string[],clear:readonly string[]) {
  const advertised=(capability:string)=>`json_type(${metadata},'$.capabilities."${capability}"')='true'`;
  return `(${command}.kind!='keyboard.type_text' OR (
    json_extract(${command}.precondition,'$.field_input_validation')='no_visual_v1'
    AND json_extract(${command}.precondition,'$.spotlight_transport')='stable_usb'
    AND json_type(${command}.precondition,'$.focus_source') IS NULL
    AND ${base.map(advertised).join(" AND ")}
    AND length(json_extract(${command}.payload,'$.text')) BETWEEN 1 AND ${textLimitSQL(metadata,`json_extract(${command}.payload,'$.clear_before_input')=1`)}
    AND (json_extract(${command}.payload,'$.submit_enter') IS NOT 1 OR ${enter.map(advertised).join(" AND ")})
    AND (json_extract(${command}.payload,'$.clear_before_input') IS NOT 1 OR (${clear.map(advertised).join(" AND ")}))))`;
}
export function publicTextReceipt(raw:string|null) {
  const receipt=raw?JSON.parse(raw):null;
  if(receipt?.spotlight){delete receipt.spotlight.recovery_suffix_digest;delete receipt.spotlight.recovery_original_digest;}
  return receipt;
}
export function countedTextReceipt(body:Record<string,unknown>,receipt:Record<string,unknown>,id:string,boot:string,length:number) {
  const effect=record(receipt.effect),count=effect.typed_count;
  const integer=(n:unknown)=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0;
  need(receipt.command_id===id&&receipt.board_boot_id===boot&&receipt.subcommand_index===0&&
    ["executed","failed","outcome_unknown"].includes(String(receipt.state))&&
    integer(receipt.started_uptime_ms)&&integer(receipt.finished_uptime_ms)&&
    Number(receipt.finished_uptime_ms)>=Number(receipt.started_uptime_ms)&&
    integer(count)&&Number(count)<=length&&typeof effect.typed_count_exact==="boolean"&&
    typeof effect.all_released==="boolean"&&effect.ascii_stable===true&&
    body.input_submitted===true&&typeof body.finished_client_mono_ms==="number"&&Number.isFinite(body.finished_client_mono_ms)&&
    body.finished_client_mono_ms>=0&&body.finished_client_mono_ms<=Number.MAX_SAFE_INTEGER,"INVALID_TEXT_COUNT_RECEIPT",422);
  if(body.state==="board_acked")need(count===length&&effect.typed_count_exact===true,"INVALID_TEXT_COUNT_RECEIPT",422);
  return effect.typed_count_exact===true&&effect.all_released===true;
}

// The old outcome/key remain immutable. Only a new, explicitly reviewed
// continuation can consume this command's global blocking condition.
export function textRecoveryConsumedSQL(c="c") {
  return `EXISTS(SELECT 1 FROM sb_mouse_commands n WHERE n.owner_id=${c}.owner_id AND n.device_id=${c}.device_id
    AND n.session_id=${c}.session_id AND n.worker_id=${c}.worker_id AND n.lease_epoch=${c}.lease_epoch
    AND n.control_epoch=${c}.control_epoch AND n.hardware_id=${c}.hardware_id AND n.board_boot_id=${c}.board_boot_id
    AND n.rowid>${c}.rowid AND json_extract(n.precondition,'$.text_recovery.command_id')=${c}.id)`;
}
export function recoveryAdmissionSQL(clock:string,condition:string) {
  const v=(key:string)=>`json_extract(${condition},'$.text_recovery.${key}')`;
  return `EXISTS(SELECT 1 FROM sb_mouse_commands old JOIN sb_frames f ON f.frame_id=${v("view.frame")}
    AND f.owner_id=old.owner_id AND f.device_id=old.device_id AND f.session_id=old.session_id
    WHERE old.id=${v("command_id")} AND old.kind='keyboard.type_text' AND old.state='outcome_unknown'
    AND old.result_digest IS NOT NULL AND old.phone_ack_mono_ms IS NOT NULL
    AND json_extract(old.receipt,'$.spotlight.recovery_eligible')=1
    AND old.owner_id=d.owner_id AND old.device_id=d.id AND old.session_id=s.id
    AND old.worker_id=d.worker_id AND old.lease_epoch=d.lease_epoch AND old.control_epoch=s.control_epoch
    AND old.hardware_id=h.hardware_id AND old.board_boot_id=h.board_boot_id
    AND ${v("view.device")}=d.id AND ${v("view.session")}=s.id AND ${v("view.broadcast")}=s.broadcast_id
    AND ${v("view.worker")}=d.worker_id AND ${v("view.lease")}=d.lease_epoch AND ${v("view.control")}=s.control_epoch
    AND ${v("view.hardware")}=h.hardware_id AND ${v("view.boot")}=h.board_boot_id
    AND f.lease_epoch=d.lease_epoch AND f.sha256=${v("view.sha256")} AND f.frame_seq=${v("view.frameSeq")}
    AND f.capture_lower=${v("view.captureLower")} AND f.expires_at>${clock}
    AND ${v("view.issued")}<=${clock} AND ${v("view.expires")}>${clock}
    AND f.capture_lower>${clock}-2000 AND f.capture_lower<=${clock}
    AND json_extract(f.metadata,'$.capture_mono_ms')>old.phone_ack_mono_ms
    AND json_extract(f.metadata,'$.capture_mono_ms')=${v("view.captureMono")}
    AND NOT EXISTS(SELECT 1 FROM sb_mouse_commands later WHERE later.owner_id=old.owner_id
      AND later.device_id=old.device_id AND later.rowid>old.rowid))`;
}
export function unresolvedTextFence(recoveryCondition?:string) {
  return `NOT EXISTS(SELECT 1 FROM sb_mouse_commands c WHERE c.device_id=d.id AND c.owner_id=d.owner_id AND c.session_id=s.id AND c.control_epoch=s.control_epoch AND c.board_boot_id=h.board_boot_id AND c.state='outcome_unknown' AND (c.kind IN ('app.search_prepare','pointer.drag_absolute') OR (c.kind='keyboard.type_text' AND json_extract(c.precondition,'$.field_input_validation')='no_visual_v1'
    AND NOT ${textRecoveryConsumedSQL()} ${recoveryCondition?`AND NOT (c.id=json_extract(${recoveryCondition},'$.text_recovery.command_id') AND ${recoveryAdmissionSQL("clock.now",recoveryCondition)})`:""})))`;
}
type TextPayload={text:string;submit_enter?:true;clear_before_input?:true};
export async function prepareTextRecovery(e:BridgeEngine,user:User,device:string,args:Record<string,unknown>,payload:TextPayload) {
  if(args.reviewed_input_command_id===undefined&&args.reviewed_frame_id===undefined&&args.reviewed_frame_proof===undefined)return undefined;
  const originalID=uuid(args.reviewed_input_command_id),frame=uuid(args.reviewed_frame_id);
  const proof=args.reviewed_frame_proof===undefined?undefined:text(args.reviewed_frame_proof,2048);
  const view=(await e.resolveVisualReadPointProof(user,device,frame,proof)).proof;
  need(view&&e.now()-view.captureLower<2000,"TEXT_RECOVERY_FRESH_IMAGE_REQUIRED");
  const original=await e.stmt("SELECT kind,state,receipt,payload FROM sb_mouse_commands WHERE id=? AND owner_id=? AND device_id=?",originalID,user.id,device)
    .first<{kind:string;state:string;receipt:string|null;payload:string}>();
  need(original&&original.kind==="keyboard.type_text"&&original.state==="outcome_unknown"&&original.receipt,"TEXT_RECOVERY_NOT_AVAILABLE");
  const oldReceipt=JSON.parse(original.receipt),oldPayload=JSON.parse(original.payload),count=oldReceipt.effect?.typed_count;
  const total=oldReceipt.spotlight?.original_text_len;
  need(oldReceipt.spotlight?.recovery_eligible===true&&Number.isSafeInteger(count)&&Number.isSafeInteger(total),"TEXT_RECOVERY_NOT_AVAILABLE");
  need(!payload.clear_before_input&&oldReceipt.effect?.enter_sent!==true,"TEXT_RECOVERY_APPEND_ONLY",422);
  const proposed=await e.textRequestDigest(user.id,device,"text-recovery:"+originalID,payload.text);
  need(count<total?proposed===oldReceipt.spotlight.recovery_suffix_digest&&payload.submit_enter===(oldPayload.submit_enter===true?true:undefined):
    proposed!==oldReceipt.spotlight.recovery_original_digest,"TEXT_RECOVERY_SUFFIX_REQUIRED",422);
  return {command_id:originalID,view};
}
export function originalTextLength(payload:Record<string,unknown>,condition:Record<string,unknown>,prior:string|null):number {
  return typeof payload.text==="string"?payload.text.length:Number(condition.text_length??JSON.parse(prior??"{}").spotlight?.original_text_len??64);
}
export async function retainTextRecovery(e:BridgeEngine,row:{id:string;owner_id:string;device_id:string;receipt:string|null;result_digest:string|null},
  payload:Record<string,unknown>,condition:Record<string,unknown>,receipt:Record<string,unknown>) {
  if(!Object.hasOwn(record(receipt.effect),"typed_count"))return;
  const details=record(receipt.spotlight),count=Number(record(receipt.effect).typed_count);
  details.original_text_len=originalTextLength(payload,condition,row.receipt);
  if(details.recovery_eligible===true&&typeof payload.text==="string"){
    const digest=(value:string)=>e.textRequestDigest(row.owner_id,row.device_id,"text-recovery:"+row.id,value);
    details.recovery_suffix_digest=await digest(payload.text.slice(count));
    details.recovery_original_digest=await digest(payload.text);
    if(payload.clear_before_input===true&&record(receipt.effect).clear_before_input!==true)details.recovery_eligible=false;
    if(record(receipt.effect).enter_sent===true)details.recovery_eligible=false;
  }else if(!row.result_digest)details.recovery_eligible=false;
}
