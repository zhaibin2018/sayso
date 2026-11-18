import {compoundQueryViewLifetimeMS} from "./compound-query-view-proof.ts";

export const sourceViewLifetimeMS=2000;
export const sourceViewPreviousAgeMS=4000;
export const viewGeometryKeys=["width","height","native_width_px","native_height_px","orientation","orientation_epoch",
  "content_rect.x","content_rect.y","content_rect.width","content_rect.height","transform_version"];

/** Short proof of a fresh JPEG delivered in an authorized tool response. The
 * owner is bound in the HMAC domain, not carried in the public token body. */
export type SourceViewProof={
  device:string;session:string;broadcast:string;worker:string;lease:number;control:number;
  frame:string;frameSeq:number;sourceSeq:number;captureMono:number;captureLower:number;
  sha256:string;geometry:unknown[];issued:number;expires:number;
};

const isUUID=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const safe=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
const positiveInt=(value:unknown)=>safe(value)&&Number.isInteger(value)&&value>0;

export function validSourceViewProof(value:unknown,now:number):value is SourceViewProof {
  if(!value||typeof value!=="object"||!safe(now))return false;
  const v=value as SourceViewProof;
  if(![v.device,v.session,v.broadcast,v.worker,v.frame].every(isUUID)||
     ![v.lease,v.control,v.frameSeq,v.sourceSeq].every(positiveInt)||
     !safe(v.captureMono)||!safe(v.captureLower)||!safe(v.issued)||!safe(v.expires)||
     v.captureLower>v.issued||v.issued-v.captureLower>1499||v.issued>now||v.expires<=now||
     v.expires!==Math.min(v.issued+sourceViewLifetimeMS,v.captureLower+sourceViewPreviousAgeMS)||
     typeof v.sha256!=="string"||!/^[0-9a-f]{64}$/.test(v.sha256)||!Array.isArray(v.geometry)||v.geometry.length!==11)return false;
  const [width,height,nativeWidth,nativeHeight,orientation,epoch,x,y,rectWidth,rectHeight,transform]=v.geometry;
  return [width,height,nativeWidth,nativeHeight,rectWidth,rectHeight].every(positiveInt)&&
    typeof orientation==="string"&&["portrait","portrait_upside_down","landscape_left","landscape_right"].includes(orientation)&&
    safe(epoch)&&Number.isInteger(epoch)&&x===0&&y===0&&rectWidth===width&&rectHeight===height&&transform==="1";
}

export function viewGeometrySQL(metadata:string) {
  return "json_array("+viewGeometryKeys.map(k=>"json_extract("+metadata+",'$."+k+"')").join(",")+")";
}

// D1 allows a much shallower expression tree than the local Node SQLite
// fixture. Keep these inlined fences balanced when added to claim/start SQL.
export function allOf(...conditions:string[]):string {
  if(conditions.length===1)return conditions[0];
  const mid=Math.floor(conditions.length/2);
  return "("+allOf(...conditions.slice(0,mid))+" AND "+allOf(...conditions.slice(mid))+")";
}

// These fragments are used inside the existing admission / dispatch D1
// statements. Aliases d/s/f mean the authorized device, live session and head.
export function freshHeadViewSQL(at:string,strictAgeMS?:number) {
  const age=strictAgeMS===undefined?"f.capture_lower BETWEEN "+at+"-1499 AND "+at+"+100":
    allOf("f.capture_lower>"+at+"-"+strictAgeMS,"f.capture_lower<="+at);
  return allOf("f.device_id=d.id","f.owner_id=d.owner_id","f.session_id=s.id","f.lease_epoch=d.lease_epoch","f.expires_at>"+at,
    "json_extract(f.metadata,'$.worker_id')=d.worker_id","json_extract(f.metadata,'$.broadcast_id')=s.broadcast_id",
    "json_extract(f.metadata,'$.capture_clock_verified')=1",age,
    "(f.storage_ready=1 OR length(f.inline_jpeg)>0)");
}

const accepted=(alias:string,field:string)=>"json_extract("+alias+".acceptance_json,'$."+field+"')";
const captured=(field:string)=>"json_extract(f.metadata,'$."+field+"')";
export function confirmedSystemSearchReceiptSQL(command:string) {
  return allOf(command+".kind='keyboard.open_search'",command+".state='board_acked'",
    command+".result_digest IS NOT NULL",command+".predecessor_id IS NULL",command+".input_attempted IS NOT 0",
    "json_extract("+command+".receipt,'$.command_id')="+command+".id",
    "json_extract("+command+".receipt,'$.board_boot_id')="+command+".board_boot_id",
    "json_extract("+command+".receipt,'$.state')='executed'",
    "json_extract("+command+".receipt,'$.subcommand_index')=0",
    "json_extract("+command+".receipt,'$.error') IS NULL",command+".error IS NULL",
    ...["hid_reports_sent","system_search_stable","all_released"].map(
      field=>"json_type("+command+".receipt,'$.effect."+field+"')='true'"));
}
function acceptedScopeSQL(alias:string) {
  return allOf(alias+".device_id=d.id",accepted(alias,"owner_id")+"=d.owner_id",accepted(alias,"control_epoch")+"=s.control_epoch",
    accepted(alias,"metadata.frame_id")+"="+alias+".frame_id",
    accepted(alias,"metadata.bridge_session_id")+"=s.id",accepted(alias,"metadata.broadcast_id")+"=s.broadcast_id",
    accepted(alias,"metadata.worker_id")+"=d.worker_id",accepted(alias,"metadata.lease_epoch")+"=d.lease_epoch",
    accepted(alias,"metadata.capture_clock_verified")+"=1");
}
function acceptedHeadMatchSQL() {
  return allOf("n.frame_id=f.frame_id",acceptedScopeSQL("n"),
    accepted("n","frame_seq")+"=f.frame_seq",accepted("n","capture_lower_ms")+"=f.capture_lower",
    accepted("n","metadata.capture_mono_ms")+"="+captured("capture_mono_ms"),
    accepted("n","metadata.source_seq")+"="+captured("source_seq"),
    accepted("n","metadata.content_sha256")+"=f.sha256",
    viewGeometrySQL("json_extract(n.acceptance_json,'$.metadata')")+"="+viewGeometrySQL("f.metadata"));
}
export const reviewedPointHeadAcceptanceSQL=acceptedHeadMatchSQL;
function newerMatchingHeadSQL(at:string,frame:string,frameSeq:string,sourceSeq:string,captureMono:string,captureLower:string,sha:string,geometry:string,
  pixelFence="f.sha256="+sha) {
  return allOf("f.frame_id<>"+frame,"f.frame_seq>"+frameSeq,captured("source_seq")+">"+sourceSeq,
    captured("capture_mono_ms")+">"+captureMono,"f.capture_lower>"+captureLower,"f.capture_lower<="+at,
    pixelFence,viewGeometrySQL("f.metadata")+"="+geometry);
}

export function sourceViewMatchesHeadSQL(proof:string) {
  const p=(field:string)=>"json_extract("+proof+",'$."+field+"')";
  return allOf("f.frame_id="+p("frame"),"f.frame_seq="+p("frameSeq"),captured("source_seq")+"="+p("sourceSeq"),
    captured("capture_mono_ms")+"="+p("captureMono"),"f.capture_lower="+p("captureLower"),
    "f.sha256="+p("sha256"),viewGeometrySQL("f.metadata")+"="+p("geometry"));
}

/** Prove a successor for a source view whose bytes actually left read_screen. */
export function sourceViewSuccessorSQL(at:string,proof:string) {
  const p=(field:string)=>"json_extract("+proof+",'$."+field+"')";
  return allOf(p("device")+"=d.id",p("session")+"=s.id",p("broadcast")+"=s.broadcast_id",
    p("worker")+"=d.worker_id",p("lease")+"=d.lease_epoch",p("control")+"=s.control_epoch",
    p("issued")+"<="+at,p("expires")+">"+at,
    newerMatchingHeadSQL(at,p("frame"),p("frameSeq"),p("sourceSeq"),p("captureMono"),p("captureLower"),p("sha256"),p("geometry")),
    "EXISTS(SELECT 1 FROM sb_observations n WHERE n.id=d.id||':'||f.frame_id AND "+acceptedHeadMatchSQL()+")",
    "EXISTS(SELECT 1 FROM sb_observations a WHERE "+allOf("a.id=d.id||':'||"+p("frame"),"a.frame_id="+p("frame"),
      acceptedScopeSQL("a"),accepted("a","frame_seq")+"="+p("frameSeq"),
      accepted("a","capture_lower_ms")+"="+p("captureLower"),accepted("a","metadata.capture_mono_ms")+"="+p("captureMono"),
      accepted("a","metadata.source_seq")+"="+p("sourceSeq"),accepted("a","metadata.content_sha256")+"="+p("sha256"),
      viewGeometrySQL("json_extract(a.acceptance_json,'$.metadata')")+"="+p("geometry"))+")");
}

/** Recheck the already admitted execution frame at the current D1 head. An
 * equally fresh same-pixel successor need not mutate the phone precondition. */
export function dispatchViewFenceSQL(command:string,databaseNow:string) {
  const at="view_clock.now",reviewed="json_extract("+command+".precondition,'$.system_search_frame_id')";
  const successor=allOf("a.frame_id="+reviewed,acceptedScopeSQL("a"),accepted("a","capture_lower_ms")+">="+at+"-1499",
    newerMatchingHeadSQL(at,reviewed,accepted("a","frame_seq"),accepted("a","metadata.source_seq"),accepted("a","metadata.capture_mono_ms"),
      accepted("a","capture_lower_ms"),accepted("a","metadata.content_sha256"),viewGeometrySQL("json_extract(a.acceptance_json,'$.metadata')")),
    acceptedHeadMatchSQL());
  // The observation IDs are primary keys. LEFT JOIN keeps the exact-frame
  // path independent of newer acceptance records and avoids nested EXISTS
  // inside D1's already deep atomic claim expression.
  return "EXISTS(SELECT 1 FROM (SELECT max(?,"+databaseNow+") AS now) view_clock JOIN sb_frames f"+
    " LEFT JOIN sb_observations a ON a.id=d.id||':'||"+reviewed+
    " LEFT JOIN sb_observations n ON n.id=d.id||':'||f.frame_id WHERE "+
    allOf(freshHeadViewSQL(at),"(f.frame_id="+reviewed+" OR "+successor+")")+")";
}

const dragSourceFrame=(intent:string)=>"json_extract("+intent+",'$.source_frame_id')";
const dragHeadAgeMS=2000;
const dragReviewedAncestorAgeMS=4000;
export const DRAG_STATUS_MASK_CAPABILITY="sayso.drag_status_mask.v1";
export const DRAG_MODEL_DECISION_CAPABILITY="sayso.drag_model_decision.v1";
export const DRAG_MODEL_DECISION_MODE="model_decision.v1";
const dragModelDecisionSupported="json_type(h.metadata,'$.capabilities.\""+DRAG_MODEL_DECISION_CAPABILITY+"\"')='true'";
export const DRAG_EXTENDED_REFERENCE_CAPABILITY="sayso.drag_reference_10s.v1";
const dragReferenceAgeSQL="CASE WHEN json_type(h.metadata,'$.capabilities.\""+DRAG_EXTENDED_REFERENCE_CAPABILITY+"\"')='true' THEN 10000 ELSE 4000 END";
const dragStatusMaskSupported="json_type(h.metadata,'$.capabilities.\""+DRAG_STATUS_MASK_CAPABILITY+"\"')='true'";
const dragSourceSHA=accepted("a","metadata.content_sha256");
const dragSameSHA="f.sha256="+dragSourceSHA;
const dragPortrait=captured("orientation")+"='portrait'";
const dragPoint=(intent:string,key:string)=>"json_extract("+intent+",'$."+key+"')";
const dragSHAFormat=(value:string)=>allOf("length("+value+")=64",value+" NOT GLOB '*[^0-9a-f]*'");
const dragMaskLowerEdge="(("+captured("height")+"*6+99)/100)";
const dragBelowStatusMask=(intent:string,key:string)=>dragPoint(intent,key)+">="+dragMaskLowerEdge;

function dragStatusMaskCandidateSQL(intent:string) {
  // A different complete JPEG is eligible for local App review only. The
  // App verifies both actual JPEGs and exact pixels outside its status mask
  // before handing the original command to HID.
  return allOf(dragStatusMaskSupported,dragPortrait,
    dragBelowStatusMask(intent,"source_from_y"),dragBelowStatusMask(intent,"source_to_y"),
    dragSHAFormat("f.sha256"),dragSHAFormat(dragSourceSHA));
}

/** The two immutable acceptance lookups are scoped to primary keys. */
export function dragReviewJoinsSQL(intent:string) {
  return " LEFT JOIN sb_observations a ON a.id=d.id||':'||"+dragSourceFrame(intent)+
    " LEFT JOIN sb_observations n ON n.id=d.id||':'||f.frame_id";
}

function reviewedSuccessorSQL(at:string,reviewed:string,pixelFence:string,maximumAge=String(dragReviewedAncestorAgeMS),scopeBoundReview?:string) {
  // Only immutable reviewed ancestors may be older than the live head.
  // Mode-specific pixel continuity is enforced again by the phone.
  const age=accepted("a","capture_lower_ms")+">"+at+"-("+maximumAge+")";
  return allOf("a.frame_id="+reviewed,acceptedScopeSQL("a"),
    scopeBoundReview?"("+scopeBoundReview+" OR "+age+")":age,
    newerMatchingHeadSQL(at,reviewed,accepted("a","frame_seq"),accepted("a","metadata.source_seq"),
      accepted("a","metadata.capture_mono_ms"),accepted("a","capture_lower_ms"),dragSourceSHA,
      viewGeometrySQL("json_extract(a.acceptance_json,'$.metadata')"),
      pixelFence),acceptedHeadMatchSQL());
}

function reviewedScreenHeadSQL(at:string,intent:string,storedGeometry:boolean,pixelFence:string,maximumAge?:string,scopeBoundReview?:string) {
  const point=(key:string)=>"json_extract("+intent+",'$."+key+"')";
  const reviewed=dragSourceFrame(intent);
  return allOf(freshHeadViewSQL(at,dragHeadAgeMS),
    captured("provenance")+"='device_capture'",
    captured("width")+"="+point("source_width"),captured("height")+"="+point("source_height"),
    captured("orientation_epoch")+"="+point("orientation_epoch"),
    "json_type(f.metadata,'$.native_width_px')='integer'","json_type(f.metadata,'$.native_height_px')='integer'",
    captured("native_width_px")+" BETWEEN 2 AND 8192",captured("native_height_px")+" BETWEEN 2 AND 8192",
    captured("orientation")+" IN ('portrait','portrait_upside_down','landscape_left','landscape_right')",
    captured("content_rect.x")+"=0",captured("content_rect.y")+"=0",
    captured("content_rect.width")+"="+captured("width"),captured("content_rect.height")+"="+captured("height"),
    captured("transform_version")+"='1'",
    ...(storedGeometry?[captured("native_width_px")+"="+point("capture_width"),
      captured("native_height_px")+"="+point("capture_height"),captured("orientation")+"="+point("orientation")]:[]),
    "(f.frame_id="+reviewed+" OR "+reviewedSuccessorSQL(at,reviewed,pixelFence,maximumAge,scopeBoundReview)+")");
}

const dragPixelFence=(intent:string)=>"("+dragSameSHA+" OR "+dragStatusMaskCandidateSQL(intent)+" OR "+dragModelDecisionSupported+")";
export function dragReviewedHeadSQL(at:string,intent:string,storedGeometry=false) {
  return allOf(reviewedScreenHeadSQL(at,intent,storedGeometry,"1",undefined,"1"),acceptedScopeSQL("a"),acceptedHeadMatchSQL(),
    "a.frame_id="+dragSourceFrame(intent),
    accepted("a","metadata.provenance")+"='device_capture'",
    "json_type(h.metadata,'$.capabilities.\"sayso.action_geometry.v1\"')='true'");
}

export const reviewedPointSourceHashSQL=dragSourceSHA;
/** A verified signed source remains usable after its metadata cache is pruned.
 * Current authority and current accepted geometry are still checked atomically. */
export function signedPointHeadSQL(at:string,intent:string,proof:string,storedGeometry=false) {
  const v=(key:string)=>`json_extract(${proof},'$.${key}')`;
  const p=(key:string)=>`json_extract(${intent},'$.${key}')`;
  return allOf(freshHeadViewSQL(at,2000),acceptedHeadMatchSQL(),
    captured("provenance")+"='device_capture'",
    v("frame")+"="+p("source_frame_id"),
    v("geometry")+"="+viewGeometrySQL("f.metadata"),
    captured("width")+"="+p("source_width"),captured("height")+"="+p("source_height"),
    captured("orientation_epoch")+"="+p("orientation_epoch"),
    `((f.frame_id=${v("frame")} AND f.sha256=${v("sha256")} AND f.frame_seq=${v("frameSeq")}
       AND ${captured("source_seq")}=${v("sourceSeq")} AND ${captured("capture_mono_ms")}=${v("captureMono")}) OR
      (f.frame_id<>${v("frame")} AND f.frame_seq>${v("frameSeq")} AND ${captured("source_seq")}>${v("sourceSeq")}
       AND ${captured("capture_mono_ms")}>${v("captureMono")} AND f.capture_lower>${v("captureLower")}))`,
    ...(storedGeometry?[v("sha256")+"="+p("point_source.content_sha256"),
      captured("native_width_px")+"="+p("capture_width"),captured("native_height_px")+"="+p("capture_height"),
      captured("orientation")+"="+p("orientation")]:[]));
}
export function reviewedPointHeadSQL(at:string,intent:string,storedGeometry=false,_cropReview?:string,_compoundReview?:string,_scopeBoundReview?:string,_geometryOnlyReview?:string) {
  const savedHash="json_extract("+intent+",'$.point_source.content_sha256')";
  return allOf(reviewedScreenHeadSQL(at,intent,storedGeometry,"1",undefined,"1"),acceptedHeadMatchSQL(),
    accepted("a","metadata.provenance")+"='device_capture'",dragSHAFormat("f.sha256"),dragSHAFormat(reviewedPointSourceHashSQL),
    ...(storedGeometry?[reviewedPointSourceHashSQL+"="+savedHash]:[]));
}

export function dragDispatchViewFenceSQL(command:string,clock:string) {
  const intent=command+".precondition";
  return "EXISTS(SELECT 1 FROM sb_frames f"+dragReviewJoinsSQL(intent)+" WHERE "+dragReviewedHeadSQL(clock,intent,true)+")";
}

export const diagnosticFlagSQL=(condition:string)=>"(CASE WHEN "+condition+" THEN 1 ELSE 0 END)";
export function diagnosticJSONSQL(values:Record<string,string>,flags:Record<string,string>) {
  return "json_object("+[...Object.entries(values),...Object.entries(flags).map(([key,condition])=>[key,diagnosticFlagSQL(condition)])]
    .map(([key,value])=>"'"+key+"',"+value).join(",")+")";
}

/** Only safe IDs, numeric ages and 0/1 flags leave the rejection snapshot. */
export function dragReviewedDiagnosticsSQL(at:string,intent:string) {
  const requested=(key:string)=>"json_extract("+intent+",'$."+key+"')";
  const reviewed=dragSourceFrame(intent),sourceLower=accepted("a","capture_lower_ms");
  const headGeometry=viewGeometrySQL("f.metadata");
  const storedGeometry=(alias:string)=>viewGeometrySQL("json_extract("+alias+".acceptance_json,'$.metadata')");
  const proofScopeFlags=(alias:string)=>({
    row_present:alias+".id IS NOT NULL",proof_present:alias+".acceptance_json IS NOT NULL",
    metadata_frame_matches:accepted(alias,"metadata.frame_id")+"="+alias+".frame_id",
    device_matches:alias+".device_id=d.id",owner_matches:accepted(alias,"owner_id")+"=d.owner_id",
    control_matches:accepted(alias,"control_epoch")+"=s.control_epoch",
    session_matches:accepted(alias,"metadata.bridge_session_id")+"=s.id",
    broadcast_matches:accepted(alias,"metadata.broadcast_id")+"=s.broadcast_id",
    worker_matches:accepted(alias,"metadata.worker_id")+"=d.worker_id",
    lease_matches:accepted(alias,"metadata.lease_epoch")+"=d.lease_epoch",
    clock_verified:accepted(alias,"metadata.capture_clock_verified")+"=1",
    scope_matches:acceptedScopeSQL(alias),
  });
  const head=diagnosticJSONSQL({frame_id:"f.frame_id",frame_seq:"f.frame_seq",age_ms:at+"-f.capture_lower"},{
    present:"f.frame_id IS NOT NULL",
    jpeg_available:"f.storage_ready=1 OR length(f.inline_jpeg)>0",
    session_matches:"f.session_id=s.id",lease_matches:"f.lease_epoch=d.lease_epoch",
    worker_matches:captured("worker_id")+"=d.worker_id",broadcast_matches:captured("broadcast_id")+"=s.broadcast_id",
    clock_verified:captured("capture_clock_verified")+"=1",
    live_expiry:"f.expires_at>"+at,
    fresh_age:"f.capture_lower>"+at+"-"+dragHeadAgeMS+" AND f.capture_lower<="+at,
    device_capture:captured("provenance")+"='device_capture'",
    width_matches:captured("width")+"="+requested("source_width"),height_matches:captured("height")+"="+requested("source_height"),
    orientation_epoch_matches:captured("orientation_epoch")+"="+requested("orientation_epoch"),
    native_width_valid:"json_type(f.metadata,'$.native_width_px')='integer' AND "+captured("native_width_px")+" BETWEEN 2 AND 8192",
    native_height_valid:"json_type(f.metadata,'$.native_height_px')='integer' AND "+captured("native_height_px")+" BETWEEN 2 AND 8192",
    orientation_valid:captured("orientation")+" IN ('portrait','portrait_upside_down','landscape_left','landscape_right')",
    full_content_rect:allOf(captured("content_rect.x")+"=0",captured("content_rect.y")+"=0",
      captured("content_rect.width")+"="+captured("width"),captured("content_rect.height")+"="+captured("height")),
    transform_valid:captured("transform_version")+"='1'",
    fresh_scope:freshHeadViewSQL(at,dragHeadAgeMS),
  });
  const source=diagnosticJSONSQL({frame_seq:"CASE WHEN json_type(a.acceptance_json,'$.frame_seq')='integer' THEN "+
      accepted("a","frame_seq")+" END",age_ms:at+"-"+sourceLower,maximum_age_ms:"NULL"},{
    ...proofScopeFlags("a"),frame_id_matches:"a.frame_id="+reviewed,
    retained_age:sourceLower+"<="+at,
  });
  const successor=diagnosticJSONSQL({},{
    distinct_frame:"f.frame_id<>"+reviewed,
    frame_seq_newer:"f.frame_seq>"+accepted("a","frame_seq"),
    source_seq_newer:captured("source_seq")+">"+accepted("a","metadata.source_seq"),
    capture_mono_newer:captured("capture_mono_ms")+">"+accepted("a","metadata.capture_mono_ms"),
    capture_lower_newer:"f.capture_lower>"+sourceLower,
    model_decision_capability:dragModelDecisionSupported,
    sha_equal:dragSameSHA,
    geometry_equal:headGeometry+"="+storedGeometry("a"),
    status_mask_capability:dragStatusMaskSupported,portrait:dragPortrait,
    from_below_status_mask:dragBelowStatusMask(intent,"source_from_y"),
    to_below_status_mask:dragBelowStatusMask(intent,"source_to_y"),
    both_sha_formats_valid:allOf(dragSHAFormat("f.sha256"),dragSHAFormat(dragSourceSHA)),
    local_status_mask_review_available:dragStatusMaskCandidateSQL(intent),
    eligible:reviewedSuccessorSQL(at,reviewed,"1",undefined,"1"),
    original_age_limit_required:"0",whole_image_equality_required:"0",
  });
  const headProof=diagnosticJSONSQL({},{
    ...proofScopeFlags("n"),frame_id_matches:"n.frame_id=f.frame_id",
    frame_seq_equal:accepted("n","frame_seq")+"=f.frame_seq",
    capture_lower_exact:accepted("n","capture_lower_ms")+"=f.capture_lower",
    capture_mono_exact:accepted("n","metadata.capture_mono_ms")+"="+captured("capture_mono_ms"),
    source_seq_equal:accepted("n","metadata.source_seq")+"="+captured("source_seq"),
    sha_equal:accepted("n","metadata.content_sha256")+"=f.sha256",
    geometry_equal:storedGeometry("n")+"="+headGeometry,
    proof_matches:acceptedHeadMatchSQL(),
  });
  return diagnosticJSONSQL({head,source,successor,head_proof:headProof},{
    exact_source_frame:"f.frame_id="+reviewed,
    eligible:dragReviewedHeadSQL(at,intent),
  });
}

export function noLaterSearchInputSQL(original:string,excluding:string[]=[],rowID=original+".rowid"){
  const exceptions=excluding.length?" AND later.id NOT IN ("+excluding.join(",")+")":"";
  return "NOT EXISTS(SELECT 1 FROM sb_mouse_commands later WHERE later.device_id=d.id AND later.owner_id=d.owner_id"+
    " AND later.rowid>"+rowID+exceptions+" AND (later.input_attempted=1 OR later.state IN"+
    " ('queued','claimed','executing','embedded','board_acked','outcome_unknown','succeeded')))"+
    " AND NOT EXISTS(SELECT 1 FROM sb_browse_runs later WHERE later.device_id=d.id AND later.owner_id=d.owner_id"+
    " AND later.session_id=s.id AND later.control_epoch=s.control_epoch AND later.created_at>="+original+".created_at AND later.lease_seq>0)";
}
