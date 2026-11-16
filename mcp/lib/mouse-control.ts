import {pairedClickShadow,type ShadowTicket,type ShadowProjection} from "./paired-click-shadow.ts";
import {background} from "./bridge-context.ts";
import { absoluteMouseRequest } from "./absolute-mouse.ts";
import type { Region } from "./browse-contract.ts";
import {scopeBoundFieldCapability,scopeBoundFieldProtocol,scopeBoundLinkedPointCapability,scopeBoundLinkedPointProtocol,scopeBoundSystemSearchFieldCapability,scopeBoundSystemSearchFieldProtocol,
  visualReadPointCapability,visualReadPointLedgerKey,type ParkedMovePointProof,type ReviewedPointProof,type ReleasedFieldViewProof,type VisualReadPointProof} from "./compound-query-view-proof.ts";
import { absoluteDragRequest,DRAG_APP_CAPABILITY,DRAG_CAPABILITY,DRAG_CAPTURE_GAP_MS,DRAG_KIND,DRAG_CALIBRATED_DURATION_MS,DRAG_RELATIVE_APP_CAPABILITY,DRAG_RELATIVE_CAPABILITY,DRAG_CLOUD_SOURCE_CAPABILITY,DRAG_CLOUD_SOURCE_CONFIRMATION,isDragNoInputPreflightError,validateDragReceipt } from "./absolute-drag.ts";
import { BridgeEngine, BridgeError, ClickAfterImageTiming, databaseNowSQL, deviceTokenHash, need, uuid, integer, finite, record, text, uid, hash, iso, visualPointEvidence, type ActionAfterImageInput, type Device, type LiveSession, type User } from "./bridge-engine.ts";
import { POINTER_PREFETCH, pointerPrefetchQuery, pointerPrefetchEnvelope, pointerPrefetchEnvelopes, type PrefetchCommand } from "./pointer-prefetch-query.ts";
import {PAIRED_MOUSE_POINT,pointSpec,validatePointResult} from "./mouse-point.ts";
import {pointReceiptProofHeader} from "./point-receipt-proof.ts";
import {beforeImageObservationDeadline,actionAfterImageAgeLimitMS,clickRelookMaxGapMS,liveFrameAge,liveFrameAgeLimitMS,nextPollDelayMS,type ImageObservationDeadline} from "./read-policy.ts";
import type { McpPerformance } from "./mcp-performance.ts";
import {APP_SEARCH_KIND,APP_SEARCH_CLAIM,APP_SEARCH_CAPABILITY} from "./app-search-contract.ts";
import { authorizedFieldText, extendedModelReviewedFieldAgeMS, extendedModelReviewedFieldCapability, extendedModelReviewedFieldProtocol, focusedTextCapability, focusedTextClearCapabilities, focusedTextClearMaxLength, focusedTextEnterCapabilities, focusedTextLinkedAfterEnterCapabilities, focusedTextLinkedAfterEnterCapability, focusedTextKind, focusedTextPayload, modelReviewedFieldCapability, modelReviewedFieldProtocol, noVisualFieldCapability, noVisualFieldProtocol, spotlightCapability, spotlightKind, spotlightPayload, spotlightProbeCapability, spotlightReceipt, spotlightStableCapability, stableASCIICapability } from "./spotlight-command.ts";
import {DRAG_MODEL_DECISION_CAPABILITY,DRAG_MODEL_DECISION_MODE,allOf,confirmedSystemSearchReceiptSQL,diagnosticJSONSQL,dispatchViewFenceSQL,dragDispatchViewFenceSQL,dragReviewedHeadSQL,dragReviewJoinsSQL,reviewedPointHeadAcceptanceSQL,reviewedPointHeadSQL,reviewedPointSourceHashSQL,freshHeadViewSQL,noLaterSearchInputSQL,sourceViewMatchesHeadSQL,sourceViewSuccessorSQL} from "./source-view-proof.ts";
import {logPairedClickDiagnostic,PairedClickPhaseTiming,pairedClickTiming} from "./paired-click-timing.ts";
import {d1Timing} from "./d1-timing.ts";
import {dragAdmissionRejectionSQL,logDragAdmissionRejection,type DragAdmissionRejection} from "./drag-admission-diagnostic.ts";
import {focusedFieldAdmissionRejectionSQL,logFocusedFieldAdmissionRejection,type FocusedFieldAdmissionRejection} from "./focused-field-admission-diagnostic.ts";
import {hasPacedWheelEvidence,validatePacedWheelReceipt} from "./wheel-receipt.ts";
import {extendedRawClaimTTLMS,ordinaryRawClaimTTLMS,reviewedPointTTLCapability,reviewedPointTTLProfile,
  scopedSearchTTLCapability,scopedSearchTTLProfile} from "./raw-claim-ttl.ts";
import {failedReviewedPairSQL,isParkedPressSelector,reviewedPressCapability,reviewedPressLandingTolerancePX,
  reviewedPressKeyPrefix,reviewedPressOriginalLifetimeMS,reviewedPressProtocol} from "./reviewed-press.ts";

export class InputAdmissionError extends BridgeError {
  readonly diagnostic: Record<string,unknown>;
  constructor(code:string,diagnostic:Record<string,unknown>) {
    super(code);
    this.diagnostic=diagnostic;
  }
}

export const SYSTEM_SEARCH_KIND="keyboard.open_search";
export const POINTER_SCROLL_KIND="pointer.scroll";
export const SYSTEM_SEARCH_BOARD_CAPABILITY="hid.keyboard.system_search";
export const SYSTEM_SEARCH_CAPABILITY="sayso.system_search";
export const SYSTEM_SEARCH_SCOPE_ONLY_CAPABILITY="sayso.system_search.scope_only.v1";
const systemSearchScopeOnlyMode="scope_only.v1";
const capabilities: Record<string, string> = { "pointer.move_relative": "hid.mouse.relative", "pointer.click": "hid.mouse.click", "pointer.scroll": "hid.mouse.scroll", "pointer.move_absolute": "hid.mouse.absolute",[SYSTEM_SEARCH_KIND]:SYSTEM_SEARCH_BOARD_CAPABILITY };
export const RAW_MOUSE_DISPATCH="raw_mouse_claim_start.v1";
export const SPOTLIGHT_CLAIM_START="spotlight_claim_start.v1";
const pending = new Set(["queued", "claimed", "executing", "embedded"]);
const pairedClickAfterImageWaitMS = 5000;
const directAfterImageWaitMS = 5000;
const textEnterSettleMS = 300;
const systemSearchTextAfterGapMS = 300;
const legacyScrollAfterGapMS = 300;
const reviewedPointProtocol = "reviewed_point.v1";
const reviewedPointCropProtocol = "reviewed_point_crop.v2";
const reviewedPointCompoundProtocol = "reviewed_point_crop.v3";
const ordinaryPointMotionPolicy = "geometry_only.v1";
const exactHeadCenterPolicy = "exact_head.v1";
export const REVIEWED_POINT_CAPABILITY = "sayso.reviewed_point.v1";
export const REVIEWED_POINT_CROP_CAPABILITY = "sayso.reviewed_point_crops.v2";
export const REVIEWED_POINT_COMPOUND_CAPABILITY = "sayso.reviewed_point_crops.v3";
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const clickAtKey = async (value:unknown) => "click-at:"+await hash(text(value,120));
const pointColumns=["id","owner_id","device_id","session_id","hardware_id","board_boot_id","kind","payload","precondition","digest","state","worker_id","lease_epoch","control_epoch","created_at","expires_at","receipt","result_digest","error","phone_ack_mono_ms","predecessor_id","input_attempted"];
const pointChildSnapshot="(SELECT json_object("+pointColumns.map(k=>"'"+k+"',k."+k).join(",")+") FROM sb_mouse_commands k WHERE k.predecessor_id=c.id AND k.owner_id=c.owner_id AND k.device_id=c.device_id AND k.session_id=c.session_id AND c.kind='pointer.move_absolute' AND json_extract(c.precondition,'$.point.protocol')='"+PAIRED_MOUSE_POINT+"' LIMIT 1) AS point_child_json";
const resultColumns="c.*,"+pointChildSnapshot+",s.id AS live_session,s.state AS live_state,s.mode AS live_mode,s.broadcast_id AS live_broadcast,d.worker_id AS live_worker,d.lease_epoch AS live_epoch,d.worker_expires AS live_expires";
const resultSessionJoin=" LEFT JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id";
const admittedCompanion = Symbol("admittedCompanion");
const mouseAdmissionJoin = " FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id";
const mouseAdmissionAuthority = (clock="?") => "d.revoked=0 AND d.worker_expires>"+clock+" AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.mouse_until>"+clock+" AND h.usb_connected=1";
const mouseAdmissionFences={
  pending_input_clear:"NOT EXISTS(SELECT 1 FROM sb_mouse_commands c WHERE c.device_id=d.id AND c.state IN ('queued','claimed','executing','embedded'))",
  browse_lock_clear:"NOT EXISTS(SELECT 1 FROM sb_browse_runs b WHERE b.device_id=d.id AND b.session_id=s.id AND b.control_epoch=s.control_epoch AND b.state IN ('active','outcome_unknown','halted'))",
  unresolved_input_clear:`NOT EXISTS(SELECT 1 FROM sb_mouse_commands c WHERE c.device_id=d.id AND c.owner_id=d.owner_id AND c.session_id=s.id AND c.control_epoch=s.control_epoch AND c.board_boot_id=h.board_boot_id AND c.state='outcome_unknown' AND (c.kind IN ('app.search_prepare','pointer.drag_absolute') OR (c.kind='${focusedTextKind}' AND json_extract(c.precondition,'$.field_input_validation')='${noVisualFieldProtocol}')))`,
  keyboard_restore_clear:"((json_extract(h.metadata,'$.capabilities.\"sayso.spotlight_wired\"') IS NOT 1 AND json_extract(h.metadata,'$.capabilities.\"sayso.spotlight_wired_probe\"') IS NOT 1 AND json_extract(h.metadata,'$.capabilities.\"sayso.focused_text\"') IS NOT 1) OR NOT EXISTS(SELECT 1 FROM sb_mouse_commands c WHERE c.device_id=d.id AND c.owner_id=d.owner_id AND c.session_id=s.id AND c.control_epoch=s.control_epoch AND c.hardware_id=h.hardware_id AND c.board_boot_id=h.board_boot_id AND c.kind IN ('spotlight.type_google_map','keyboard.type_text') AND c.state='board_acked' AND c.expires_at>"+databaseNowSQL+" AND json_extract(c.receipt,'$.spotlight.mouse_mode_confirmed')=1 AND json_extract(c.receipt,'$.spotlight.transport') IS NOT 'stable_usb'))",
};
const mouseAdmissionAvailable=Object.values(mouseAdmissionFences).map(fence=>" AND "+fence).join("");
const pairedAdmission = "EXISTS(SELECT 1 FROM sb_mouse_point_ready q WHERE q.device_id=d.id AND q.owner_id=d.owner_id AND q.session_id=s.id AND q.worker_id=d.worker_id AND q.lease_epoch=d.lease_epoch AND q.control_epoch=s.control_epoch AND q.protocol=?) AND json_type(h.metadata,'$.capabilities.\"hid.mouse.click\"')='true'";
const geometryRows = (owner:string,device:string,session:string,lease:string,clock=["?","?","?"]) =>
  "SELECT metadata,capture_lower FROM (SELECT metadata,capture_lower,expires_at,owner_id,device_id,session_id,lease_epoch FROM sb_screen_texts UNION ALL SELECT metadata,capture_lower,expires_at,owner_id,device_id,session_id,lease_epoch FROM sb_frames) WHERE owner_id="+owner+" AND device_id="+device+" AND session_id="+session+" AND lease_epoch="+lease+" AND expires_at>"+clock[0]+" AND capture_lower BETWEEN "+clock[1]+" AND "+clock[2]+" ORDER BY capture_lower DESC LIMIT 2";
const latestGeometry = (rows:string) => "SELECT metadata FROM ("+rows+") ORDER BY CAST(json_extract(metadata,'$.orientation_epoch') AS INTEGER) DESC,capture_lower DESC LIMIT 1";
const systemSearchLiveCapabilities=" AND json_extract(h.metadata,'$.capabilities.\"hid.keyboard.system_search\"')=1 AND json_extract(h.metadata,'$.capabilities.\"sayso.system_search\"')=1";
const systemSearchScopeOnlyCapabilitySQL="json_extract(h.metadata,'$.capabilities.\""+SYSTEM_SEARCH_SCOPE_ONLY_CAPABILITY+"\"')=1";
const systemSearchDispatchGate=(command:string)=>{
  const mode="json_extract("+command+".precondition,'$.system_search_mode')";
  return "(("+mode+"='"+systemSearchScopeOnlyMode+"' AND "+systemSearchScopeOnlyCapabilitySQL+
    " AND "+command+".worker_id=d.worker_id AND "+command+".lease_epoch=d.lease_epoch) OR ("+
    mode+" IS NULL AND "+dispatchViewFenceSQL(command,databaseNowSQL)+"))";
};
function rawClaimTTLProjection(profiles:ReadonlySet<unknown>,paired:boolean) {
  const search=profiles.has(scopedSearchTTLProfile);
  const point=paired&&profiles.has(reviewedPointTTLProfile);
  if(!search&&!point)return "";
  const command="sb_mouse_commands";
  const precondition=(key:string)=>`json_extract(${command}.precondition,'$.${key}')`;
  const searchKind=`${command}.kind='${SYSTEM_SEARCH_KIND}'`,pointKind=`${command}.kind='pointer.move_absolute'`;
  const allowedKind=[...(search?[searchKind]:[]),...(point?[pointKind]:[])].join(" OR ");
  const searchProfile=search?`WHEN ${searchKind} AND ${command}.payload='{}'
    AND ${precondition("system_search_mode")}='${systemSearchScopeOnlyMode}'
    AND json_type(${command}.precondition,'$.system_search_frame_id') IS NULL
    AND json_type(${command}.precondition,'$.point') IS NULL
    AND json_type(h.metadata,'$.capabilities."${scopedSearchTTLCapability}"')='true' THEN '${scopedSearchTTLProfile}'`:"";
  const pointProfile=point?`WHEN ${pointKind} AND ${precondition("point.protocol")}='${PAIRED_MOUSE_POINT}'
    AND ${precondition("point_motion_policy")} IS NOT '${ordinaryPointMotionPolicy}'
    AND ${precondition("point_source.protocol")}='${scopeBoundLinkedPointProtocol}'
    AND ${precondition("point_source.origin")}=${precondition("point_query_origin.origin")}
    AND ((
      ${precondition("point_source.origin")} IN ('linked_text','typed')
      AND json_type(${command}.precondition,'$.point_query_origin.scopeBoundPoint')='true'
    ) OR (${precondition("point_source.origin")}='visual_read'
      AND json_type(h.metadata,'$.capabilities."${visualReadPointCapability}"')='true'))
    AND json_type(h.metadata,'$.capabilities."${reviewedPointTTLCapability}"')='true' THEN '${reviewedPointTTLProfile}'`:"";
  // Project the already-won command's current authority from the same claim
  // transaction. The longer envelope never extends any saved deadline.
  return `,CASE WHEN ${allowedKind} THEN (
    SELECT json_object('profile',CASE ${searchProfile} ${pointProfile} END,
      'expires_at',min(${command}.expires_at,s.mouse_until,d.worker_expires))
    FROM sb_devices d
    JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id
    JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
    WHERE d.id=${command}.device_id AND d.owner_id=${command}.owner_id AND d.revoked=0
      AND s.id=${command}.session_id AND s.control_epoch=${command}.control_epoch AND s.mouse_enabled=1
      AND d.worker_id=${command}.worker_id AND d.lease_epoch=${command}.lease_epoch
      AND h.hardware_id=${command}.hardware_id AND h.board_boot_id=${command}.board_boot_id AND h.usb_connected=1
  ) END AS raw_claim_ttl_grant`;
}
const dragCapabilities=["hid.mouse.absolute",DRAG_CAPABILITY,DRAG_APP_CAPABILITY] as const;
const dragReady=(board:Record<string,unknown>)=>dragCapabilities.every(capability=>board[capability]===true);
const dragLiveCapabilities=dragCapabilities
  .map(capability=>`json_extract(h.metadata,'$.capabilities."${capability}"')=1`).join(" AND ");
// Keep drag evidence out of the main claim/start expression tree. D1 limits
// depth to 100 even when the queue contains no drag. Joining materialized IDs
// preserves the same-transaction checks without weakening any input gate.
function dragDispatchCTE(caller:string,state:"queued"|"claimed") {
  return `drag_dispatch AS MATERIALIZED (
    SELECT c.id FROM sb_mouse_commands c
    JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id
    JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id
    JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
    WHERE ${caller} AND c.state='${state}' AND c.kind='${DRAG_KIND}'
      AND (${dragLiveCapabilities}) AND ${dragDispatchViewFenceSQL("c",databaseNowSQL)}
  )`;
}
const textEnterReady=(board:Record<string,unknown>)=>focusedTextEnterCapabilities.every(capability=>board[capability]===true);
const textEnterCapabilitiesSQL=(metadata:string)=>focusedTextEnterCapabilities
  .map(capability=>`json_extract(${metadata},'$.capabilities."${capability}"')=1`).join(" AND ");
const linkedAfterEnterReady=(board:Record<string,unknown>)=>
  focusedTextLinkedAfterEnterCapabilities.every(capability=>board[capability]===true);
const noVisualFieldReady=(board:Record<string,unknown>)=>
  [focusedTextCapability,stableASCIICapability,noVisualFieldCapability].every(capability=>board[capability]===true);
const textClearReady=(board:Record<string,unknown>)=>
  noVisualFieldReady(board)&&focusedTextClearCapabilities.every(capability=>board[capability]===true);
const fieldDispatchCapabilitiesSQL=(command:string,metadata:string)=>{
  const typeOnly=`json_extract(${command}.payload,'$.submit_enter') IS NOT 1`;
  const advertised=(capability:string)=>`json_type(${metadata},'$.capabilities."${capability}"')='true'`;
  return allOf(
    `(${command}.kind!='${focusedTextKind}' OR json_extract(${command}.payload,'$.clear_before_input') IS NOT 1 OR (
      json_extract(${command}.precondition,'$.field_input_validation')='${noVisualFieldProtocol}'
      AND length(json_extract(${command}.payload,'$.text')) BETWEEN 1 AND ${focusedTextClearMaxLength}
      AND ${focusedTextClearCapabilities.map(advertised).join(" AND ")}))`,
    `(${command}.kind!='${focusedTextKind}' OR ${typeOnly} OR (${textEnterCapabilitiesSQL(metadata)}))`,
    `(json_type(${command}.precondition,'$.field_input_validation') IS NULL OR (
      ${command}.kind='${focusedTextKind}' AND json_extract(${command}.precondition,'$.field_input_validation')='${noVisualFieldProtocol}'
      AND json_extract(${command}.precondition,'$.spotlight_transport')='stable_usb'
      AND json_type(${command}.precondition,'$.focus_source') IS NULL
      AND ${advertised(noVisualFieldCapability)} AND ${advertised(focusedTextCapability)} AND ${advertised(stableASCIICapability)}))`,
    `(json_type(${command}.precondition,'$.focus_source') IS NULL OR
      CASE json_extract(${command}.precondition,'$.focus_source.protocol')
        WHEN '${modelReviewedFieldProtocol}' THEN ${advertised(modelReviewedFieldCapability)} AND ${typeOnly}
        WHEN '${extendedModelReviewedFieldProtocol}' THEN ${advertised(extendedModelReviewedFieldCapability)}
          AND (${typeOnly} OR ${advertised(focusedTextLinkedAfterEnterCapability)})
        WHEN '${scopeBoundSystemSearchFieldProtocol}' THEN ${advertised(scopeBoundSystemSearchFieldCapability)}
          AND ${typeOnly} AND json_extract(${command}.precondition,'$.focus_source.origin')='system_search'
        WHEN '${scopeBoundFieldProtocol}' THEN ${advertised(scopeBoundFieldCapability)} AND (
          (json_extract(${command}.precondition,'$.focus_source.origin')='system_search' AND ${typeOnly}) OR
          (json_extract(${command}.precondition,'$.focus_source.origin')='paired_click'
            AND (${typeOnly} OR ${advertised(focusedTextLinkedAfterEnterCapability)})) OR
          (json_extract(${command}.precondition,'$.focus_source.origin')='parked_press' AND ${advertised(reviewedPressCapability)}
            AND (${typeOnly} OR ${advertised(focusedTextLinkedAfterEnterCapability)})))
        ELSE 0 END)`);
};
const reviewedPointCapSQL=(capability:string)=>"json_type(h.metadata,'$.capabilities."+JSON.stringify(capability)+"')='true'";
function pointSearchOriginSQL(id:string,excluding:string[]=[],checkCapture=true){
  const original="origin_search",capture="json_extract(a.acceptance_json,'$.metadata.capture_mono_ms')";
  const settle="json_extract("+original+".precondition,'$.capture_min_gap_ms')";
  const captureProof=checkCapture?" AND "+capture+">"+original+".phone_ack_mono_ms+"+settle+
    " AND "+capture+"<="+original+".phone_ack_mono_ms+5000":"";
  return "EXISTS(SELECT 1 FROM sb_mouse_commands "+original+" WHERE "+original+".id="+id+
    " AND "+confirmedSystemSearchReceiptSQL(original)+
    " AND "+original+".owner_id=d.owner_id AND "+original+".device_id=d.id AND "+original+".session_id=s.id"+
    " AND "+original+".worker_id=d.worker_id AND "+original+".lease_epoch=d.lease_epoch AND "+original+".control_epoch=s.control_epoch"+
    " AND "+original+".hardware_id=h.hardware_id AND "+original+".board_boot_id=h.board_boot_id"+
    " AND json_type("+original+".precondition,'$.capture_min_gap_ms')='integer' AND "+settle+" BETWEEN 0 AND 2000"+
    captureProof+" AND "+noLaterSearchInputSQL(original,excluding)+")";
}
function compoundQueryOriginSQL(origin:string,clock:string,excluding:string[]=[],scopeBoundReview?:string){
  const v=(key:string)=>"json_extract("+origin+",'$."+key+"')";
  const accepted=(key:string)=>"json_extract(a.acceptance_json,'$."+key+"')";
  const c="query_input",gap="json_extract("+c+".precondition,'$.capture_min_gap_ms')";
  const receipt=(key:string)=>"json_extract("+c+".receipt,'$."+key+"')";
  const typed=allOf(
    c+".kind='keyboard.type_text'",c+".state='board_acked'",
    c+".result_digest IS NOT NULL",c+".error IS NULL",c+".input_attempted IS NOT 0","json_extract("+c+".payload,'$.submit_enter') IS NOT 1",
    receipt("command_id")+"="+c+".id",receipt("board_boot_id")+"=h.board_boot_id",receipt("state")+"='executed'",
    receipt("subcommand_index")+"=0",receipt("error")+" IS NULL",receipt("spotlight.transport")+"='stable_usb'",
    receipt("spotlight.restored_mouse_boot_id")+"=h.board_boot_id",
    ...["spotlight.mouse_mode_confirmed","effect.hid_reports_sent","effect.ascii_stable","effect.all_released"]
      .map(field=>"json_type("+c+".receipt,'$."+field+"')='true'"));
  const compound=allOf("q.id="+v("preparation"),"q.owner_id=d.owner_id","q.device_id=d.id","q.finished_at IS NOT NULL");
  const retained=allOf(compound,"q.reason='SPOTLIGHT_QUERY_ALREADY_VISIBLE'",
    c+".idempotency_key='app-search-query:'||q.id||':shortcut'",confirmedSystemSearchReceiptSQL(c));
  const compoundTyped=allOf(compound,c+".idempotency_key='app-search-query:'||q.id||':text'",typed);
  const linkedText=allOf(v("preparation")+" IS NULL","json_type("+c+".precondition,'$.linked_field_click')='true'",
    "json_extract("+c+".precondition,'$.focus_source.protocol') IN ('"+extendedModelReviewedFieldProtocol+"','"+
      scopeBoundSystemSearchFieldProtocol+"','"+scopeBoundFieldProtocol+"')",typed);
  const upperGap=v("captureMono")+"<="+c+".phone_ack_mono_ms+5000";
  const age=v("expires")+">"+clock;
  const released=scopeBoundReview?allOf(v("scopeBoundPoint")+"=1",v("origin")+" IN ('linked_text','typed')",
    reviewedPointCapSQL(scopeBoundLinkedPointCapability),
    `EXISTS(SELECT 1 FROM sb_released_system_search_field_proofs p
      WHERE p.owner_id=d.owner_id AND p.device_id=d.id AND p.command_id=${v("command")}
      AND p.frame_id=${v("frame")} AND p.expires_at=${v("expires")})`):undefined;
  const originGate=allOf(
    c+".id="+v("command"),c+".owner_id=d.owner_id",c+".device_id=d.id",c+".session_id=s.id",
    c+".worker_id=d.worker_id",c+".lease_epoch=d.lease_epoch",c+".control_epoch=s.control_epoch",
    c+".hardware_id=h.hardware_id",c+".board_boot_id=h.board_boot_id",c+".phone_ack_mono_ms>=0",
    "json_type("+c+".precondition,'$.capture_min_gap_ms')='integer'",gap+" BETWEEN 0 AND 2000",
    v("captureMono")+">"+c+".phone_ack_mono_ms+"+gap,
    scopeBoundReview?"(("+scopeBoundReview+" AND "+v("scopeBoundOnly")+"=1) OR "+upperGap+")":upperGap,
    "CASE "+v("origin")+" WHEN 'typed' THEN "+compoundTyped+" WHEN 'retained' THEN "+retained+
      " WHEN 'linked_text' THEN "+linkedText+" ELSE 0 END",noLaterSearchInputSQL(c,excluding));
  return allOf(v("device")+"=d.id",v("session")+"=s.id",v("broadcast")+"=s.broadcast_id",v("worker")+"=d.worker_id",
    v("lease")+"=d.lease_epoch",v("control")+"=s.control_epoch",v("issued")+"<="+clock,
    released?"(CASE WHEN "+scopeBoundReview+" THEN "+released+" ELSE "+age+" END)":age,
    v("frame")+"=a.frame_id",v("frameSeq")+"="+accepted("frame_seq"),
    v("sourceSeq")+"="+accepted("metadata.source_seq"),v("captureMono")+"="+accepted("metadata.capture_mono_ms"),
    v("captureLower")+"="+accepted("capture_lower_ms"),v("sha256")+"="+reviewedPointSourceHashSQL,
    "EXISTS(SELECT 1 FROM sb_mouse_commands "+c+" LEFT JOIN sb_app_search_queries q ON q.id="+v("preparation")+
    " AND q.owner_id=d.owner_id WHERE "+originGate+")");
}
function visualReadPointOriginFences(origin:string,clock:string,excluding:string[]=[]) {
  const v=(key:string)=>"json_extract("+origin+",'$."+key+"')";
  const accepted=(key:string)=>"json_extract(a.acceptance_json,'$."+key+"')";
  const exceptions=excluding.length?" AND later.id NOT IN ("+excluding.join(",")+")":"";
  return {
    visual_capability:allOf(reviewedPointCapSQL(scopeBoundLinkedPointCapability),reviewedPointCapSQL(visualReadPointCapability)),
    original_scope:allOf(v("origin")+"='visual_read'",v("command")+"='"+visualReadPointLedgerKey+"'",
      v("device")+"=d.id",v("session")+"=s.id",v("broadcast")+"=s.broadcast_id",v("worker")+"=d.worker_id",
      v("lease")+"=d.lease_epoch",v("control")+"=s.control_epoch",v("hardware")+"=h.hardware_id",v("boot")+"=h.board_boot_id"),
    original_expiry:allOf(v("issued")+"<="+clock,v("expires")+">"+clock),
    original_jpeg:allOf(v("frame")+"=a.frame_id",v("frameSeq")+"="+accepted("frame_seq"),v("sourceSeq")+"="+accepted("metadata.source_seq"),
      v("captureMono")+"="+accepted("metadata.capture_mono_ms"),v("captureLower")+"="+accepted("capture_lower_ms"),
      v("sha256")+"="+reviewedPointSourceHashSQL),
    released_frame:`EXISTS(SELECT 1 FROM sb_released_system_search_field_proofs p
      WHERE p.owner_id=d.owner_id AND p.device_id=d.id AND p.command_id='${visualReadPointLedgerKey}'
      AND p.frame_id=${v("frame")} AND p.expires_at>=${v("expires")})`,
    no_later_input:`NOT EXISTS(SELECT 1 FROM sb_mouse_commands later WHERE later.owner_id=d.owner_id AND later.device_id=d.id
      AND later.session_id=s.id AND later.control_epoch=s.control_epoch
      AND (CASE WHEN later.worker_id=d.worker_id AND later.lease_epoch=d.lease_epoch AND later.phone_ack_mono_ms>=0
        THEN later.phone_ack_mono_ms>=${v("captureMono")} ELSE later.created_at>=${v("captureLower")} END)${exceptions}
      AND (later.input_attempted=1 OR later.state IN ('queued','claimed','executing','embedded','board_acked','outcome_unknown','succeeded')))`,
    no_later_browse_input:`NOT EXISTS(SELECT 1 FROM sb_browse_runs later JOIN sb_browse_leases lease ON lease.run_id=later.id
      WHERE later.owner_id=d.owner_id AND later.device_id=d.id AND later.session_id=s.id AND later.broadcast_id=s.broadcast_id
      AND later.worker_id=d.worker_id AND later.lease_epoch=d.lease_epoch AND later.control_epoch=s.control_epoch
      AND later.hardware_id=h.hardware_id AND later.board_boot_id=h.board_boot_id AND lease.expires_at>=${v("captureLower")})`,
  };
}
function visualReadPointOriginSQL(origin:string,clock:string,excluding:string[]=[]) {
  return allOf(...Object.values(visualReadPointOriginFences(origin,clock,excluding)));
}
function pointProofCapability(proof:ReviewedPointProof|undefined) {
  if(proof?.origin==="visual_read")return visualReadPointCapability;
  if(proof&&proof.origin!=="retained"&&proof.scopeBoundPoint===true)return scopeBoundLinkedPointCapability;
  return proof?REVIEWED_POINT_COMPOUND_CAPABILITY:undefined;
}
function reviewedPressClaimCTE(caller:string) {
  const raw="json_extract(c.precondition,'$.reviewed_press_origin')";
  const p=(key:string)=>"json_extract("+raw+",'$."+key+"')";
  const wire=(key:string)=>"json_extract(c.precondition,'$.reviewed_press."+key+"')";
  return `reviewed_press_claims AS MATERIALIZED (
    SELECT c.id FROM sb_mouse_commands c
    JOIN sb_mouse_commands k ON k.id=c.predecessor_id
    JOIN sb_mouse_commands m ON m.id=k.predecessor_id
    JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id
    JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id
    JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
    JOIN sb_frames f ON f.device_id=d.id
    JOIN sb_observations a ON a.id=d.id||':'||${p("frame")}
    JOIN sb_observations n ON n.id=d.id||':'||f.frame_id
    WHERE ${caller} AND c.kind='pointer.click' AND c.state='queued' AND c.session_id=s.id AND c.worker_id=d.worker_id
      AND c.lease_epoch=d.lease_epoch AND c.control_epoch=s.control_epoch AND c.hardware_id=h.hardware_id AND c.board_boot_id=h.board_boot_id
      AND ${wire("protocol")}='${reviewedPressProtocol}'
      AND ${wire("original_move_id")}=m.id AND ${wire("original_click_id")}=k.id
      AND ${wire("point_source.frame_id")}=${p("frame")} AND ${wire("point_source.content_sha256")}=${p("sha256")}
      AND ${reviewedPressOriginSQL(raw,databaseNowSQL,["c.id"])}
      AND ${reviewedPointHeadSQL(databaseNowSQL,"json_extract(c.precondition,'$.reviewed_press_geometry')",true,"1","1","1")}
  )`;
}
function reviewedPressOriginSQL(origin:string,clock:string,excluding:string[]=[]) {
  const v=(key:string)=>"json_extract("+origin+",'$."+key+"')";
  const a=(key:string)=>"json_extract(a.acceptance_json,'$."+key+"')";
  return allOf(failedReviewedPairSQL("m","k"),reviewedPointCapSQL(reviewedPressCapability),
    v("origin")+"='parked_move'",v("command")+"=k.id",v("move")+"=m.id",v("moveAck")+"=m.phone_ack_mono_ms",
    v("device")+"=d.id",v("session")+"=s.id",v("broadcast")+"=s.broadcast_id",v("worker")+"=d.worker_id",
    v("lease")+"=d.lease_epoch",v("control")+"=s.control_epoch",v("hardware")+"=h.hardware_id",v("boot")+"=h.board_boot_id",
    "m.owner_id=d.owner_id","m.device_id=d.id","m.session_id=s.id","m.worker_id=d.worker_id",
    "m.lease_epoch=d.lease_epoch","m.control_epoch=s.control_epoch","m.hardware_id=h.hardware_id","m.board_boot_id=h.board_boot_id",
    "m.created_at>"+clock+"-"+reviewedPressOriginalLifetimeMS,v("issued")+"<="+clock,v("expires")+">"+clock,
    v("frame")+"=a.frame_id",v("frameSeq")+"="+a("frame_seq"),v("sourceSeq")+"="+a("metadata.source_seq"),
    v("captureMono")+"="+a("metadata.capture_mono_ms"),v("captureLower")+"="+a("capture_lower_ms"),
    v("captureMono")+">m.phone_ack_mono_ms",v("captureMono")+"<m.phone_ack_mono_ms+"+reviewedPressOriginalLifetimeMS,
    v("sha256")+"="+reviewedPointSourceHashSQL,
    `EXISTS(SELECT 1 FROM sb_released_system_search_field_proofs p WHERE p.owner_id=d.owner_id AND p.device_id=d.id
      AND p.command_id=k.id AND p.frame_id=${v("frame")} AND p.expires_at=${v("expires")})`,
    noLaterSearchInputSQL("m",["k.id",...excluding]),
    `NOT EXISTS(SELECT 1 FROM sb_browse_runs r JOIN sb_browse_leases l ON l.run_id=r.id WHERE r.owner_id=d.owner_id
      AND r.device_id=d.id AND r.session_id=s.id AND r.control_epoch=s.control_epoch AND l.expires_at>=m.created_at)`);
}
function reviewedPointDispatchCTE(caller:string){
  const intent="c.precondition",point="json_extract("+intent+",'$.point_source.protocol')";
  const frame="json_extract("+intent+",'$.point_source.frame_id')";
  const origin="json_extract("+intent+",'$.point_search_origin')";
  const child="json_extract("+intent+",'$.point.click_command_id')";
  const scopeBoundReview=point+"='"+scopeBoundLinkedPointProtocol+"'";
  const compoundReview=point+" IN ('"+reviewedPointCompoundProtocol+"','"+scopeBoundLinkedPointProtocol+"')";
  const compoundOrigin="json_extract("+intent+",'$.point_query_origin')";
  const visualOrigin=`json_extract(${compoundOrigin},'$.origin')='visual_read'`;
  const cropReview=point+" IN ('"+reviewedPointCropProtocol+"','"+reviewedPointCompoundProtocol+"','"+scopeBoundLinkedPointProtocol+"')";
  const geometryOnlyReview="json_extract("+intent+",'$.point_motion_policy')='"+ordinaryPointMotionPolicy+"'";
  const scope=`JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id
    JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id
    JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id`;
  // Materialize origin and image proofs separately. The main D1 claim
  // joins the exact admitted IDs without inheriting their expression depth.
  return `WITH reviewed_point_claims AS MATERIALIZED (
    SELECT c.* FROM sb_mouse_commands c ${scope}
    WHERE ${caller} AND c.session_id=s.id AND s.id=? AND s.broadcast_id=?
      AND c.worker_id=d.worker_id AND d.worker_id=? AND c.lease_epoch=d.lease_epoch AND d.lease_epoch=?
      AND c.control_epoch=s.control_epoch AND s.control_epoch=? AND d.revoked=0
      AND c.kind='pointer.move_absolute' AND c.state='queued' AND json_type(c.precondition,'$.point_source')='object'
  ), reviewed_compound_query_dispatch AS MATERIALIZED (
    SELECT c.id FROM reviewed_point_claims c ${scope}
    JOIN sb_observations a ON a.id=d.id||':'||json_extract(${intent},'$.source_frame_id')
    WHERE ${compoundReview} AND CASE WHEN ${visualOrigin}
      THEN ${scopeBoundReview} AND ${visualReadPointOriginSQL(compoundOrigin,databaseNowSQL,["c.id",child])}
      ELSE ${compoundQueryOriginSQL(compoundOrigin,databaseNowSQL,["c.id",child],scopeBoundReview)} END
  ), reviewed_point_dispatch AS MATERIALIZED (
    SELECT c.id FROM reviewed_point_claims c ${scope}
    JOIN sb_frames f ON f.device_id=d.id
    ${dragReviewJoinsSQL(intent)}
    LEFT JOIN reviewed_compound_query_dispatch compound ON compound.id=c.id
    WHERE CASE ${point} WHEN '${reviewedPointProtocol}' THEN ${reviewedPointCapSQL(REVIEWED_POINT_CAPABILITY)}
        WHEN '${reviewedPointCropProtocol}' THEN ${reviewedPointCapSQL(REVIEWED_POINT_CROP_CAPABILITY)}
        WHEN '${reviewedPointCompoundProtocol}' THEN ${reviewedPointCapSQL(REVIEWED_POINT_COMPOUND_CAPABILITY)}
        WHEN '${scopeBoundLinkedPointProtocol}' THEN ${reviewedPointCapSQL(scopeBoundLinkedPointCapability)}
          AND json_extract(${intent},'$.point_source.origin')=json_extract(${compoundOrigin},'$.origin') ELSE 0 END
      AND json_extract(${intent},'$.point.protocol')='${PAIRED_MOUSE_POINT}'
      AND ${frame}=json_extract(${intent},'$.source_frame_id')
      AND (${geometryOnlyReview} OR json_extract(${intent},'$.point_center_policy') IS NOT '${exactHeadCenterPolicy}' OR
        f.frame_id=${frame} OR f.sha256=json_extract(${intent},'$.point_source.content_sha256'))
      AND ${reviewedPointHeadSQL(databaseNowSQL,intent,true,cropReview,compoundReview,scopeBoundReview,geometryOnlyReview)}
      AND CASE WHEN ${compoundReview} THEN compound.id IS NOT NULL
        ELSE (${origin} IS NULL OR ${pointSearchOriginSQL(origin,["c.id",child])}) END
  ) `;
}
const sourceClock="(SELECT now FROM source_clock)";
const sourceView="(SELECT proof FROM source_clock)";
const fieldAncestorCapture="json_extract(a.acceptance_json,'$.capture_lower_ms')";
const reviewedFieldCaptureMS="json_extract(a.acceptance_json,'$.metadata.capture_mono_ms')";
const reviewedFieldGeometryKeys=["native_width_px","native_height_px","orientation","transform_version",
  "content_rect.x","content_rect.y","content_rect.width","content_rect.height"];
const reviewedFieldOriginalCTE=`reviewed_field_request AS (SELECT ? AS id), reviewed_field_original AS MATERIALIZED (
  SELECT c.*,c.rowid AS original_rowid,json_extract(m.precondition,'$.point_capture_min_gap_ms') AS original_settle,
    m.precondition AS point_parent_precondition,m.receipt AS point_parent_receipt,m.result_digest AS point_parent_digest,
    m.input_attempted AS point_parent_attempted,m.phone_ack_mono_ms AS point_parent_ack
  FROM sb_mouse_commands c JOIN sb_mouse_commands m ON m.id=c.predecessor_id
  WHERE c.id=(SELECT id FROM reviewed_field_request) AND c.kind='pointer.click' AND c.state='board_acked' AND c.result_digest IS NOT NULL
    AND m.owner_id=c.owner_id AND m.device_id=c.device_id AND m.session_id=c.session_id
    AND m.worker_id=c.worker_id AND m.lease_epoch=c.lease_epoch AND m.control_epoch=c.control_epoch
    AND m.hardware_id=c.hardware_id AND m.board_boot_id=c.board_boot_id AND m.expires_at=c.expires_at
    AND m.kind='pointer.move_absolute' AND m.state='board_acked' AND m.result_digest IS NOT NULL
    AND json_extract(m.precondition,'$.point.protocol')='${PAIRED_MOUSE_POINT}'
    AND json_extract(m.precondition,'$.point.click_command_id')=c.id
    AND json_type(m.precondition,'$.point_capture_min_gap_ms')='integer'
    AND json_extract(m.precondition,'$.point_capture_min_gap_ms') BETWEEN 0 AND 2000
  UNION ALL
  SELECT c.*,c.rowid AS original_rowid,json_extract(c.precondition,'$.capture_min_gap_ms') AS original_settle,
    NULL,NULL,NULL,NULL,NULL
  FROM sb_mouse_commands c
  WHERE c.id=(SELECT id FROM reviewed_field_request) AND ${confirmedSystemSearchReceiptSQL("c")}
    AND json_type(c.precondition,'$.capture_min_gap_ms')='integer'
    AND json_extract(c.precondition,'$.capture_min_gap_ms') BETWEEN 0 AND 2000
  UNION ALL
  SELECT c.*,c.rowid AS original_rowid,json_extract(c.precondition,'$.capture_min_gap_ms') AS original_settle,
    NULL,NULL,NULL,NULL,NULL
  FROM sb_mouse_commands c JOIN sb_mouse_commands k ON k.id=c.predecessor_id JOIN sb_mouse_commands m ON m.id=k.predecessor_id
  WHERE c.id=(SELECT id FROM reviewed_field_request) AND ${failedReviewedPairSQL("m","k")}
    AND c.kind='pointer.click' AND c.state='board_acked' AND c.error IS NULL AND c.input_attempted=1 AND c.result_digest IS NOT NULL
    AND c.owner_id=k.owner_id AND c.device_id=k.device_id AND c.session_id=k.session_id AND c.worker_id=k.worker_id
    AND c.lease_epoch=k.lease_epoch AND c.control_epoch=k.control_epoch AND c.hardware_id=k.hardware_id AND c.board_boot_id=k.board_boot_id
    AND c.phone_ack_mono_ms>m.phone_ack_mono_ms
    AND json_extract(c.precondition,'$.reviewed_press.protocol')='${reviewedPressProtocol}'
    AND json_extract(c.precondition,'$.reviewed_press.original_move_id')=m.id
    AND json_extract(c.precondition,'$.reviewed_press.original_click_id')=k.id
    AND json_type(c.precondition,'$.capture_min_gap_ms')='integer'
    AND json_extract(c.precondition,'$.capture_min_gap_ms') BETWEEN 0 AND 2000
    AND json_extract(c.receipt,'$.command_id')=c.id AND json_extract(c.receipt,'$.board_boot_id')=c.board_boot_id
    AND json_extract(c.receipt,'$.state')='executed' AND json_extract(c.receipt,'$.error') IS NULL
    AND json_extract(c.receipt,'$.subcommand_index')=0 AND json_type(c.receipt,'$.effect.hid_reports_sent')='true'
)`;
function reviewedFieldAfterActionSQL(clock:string) {
  const geometry=reviewedFieldGeometryKeys.map(key=>
    `json_extract(a.acceptance_json,'$.metadata.${key}')=json_extract(f.metadata,'$.${key}')`).join(" AND ");
  // The older accepted row anchors only the reviewed regions. Its exact
  // input receipt and the newer live head must still share input authority.
  return `(${fieldAncestorCapture}>${clock}-4000 AND ${fieldAncestorCapture}<${clock}-2000
    AND a.device_id=d.id AND a.frame_id<>f.frame_id
    AND json_extract(a.acceptance_json,'$.metadata.frame_id')=a.frame_id
    AND json_extract(a.acceptance_json,'$.owner_id')=d.owner_id
    AND json_extract(a.acceptance_json,'$.control_epoch')=s.control_epoch
    AND json_extract(a.acceptance_json,'$.metadata.capture_clock_verified')=1
    AND json_extract(f.metadata,'$.capture_clock_verified')=1
    AND json_type(a.acceptance_json,'$.metadata.capture_mono_ms') IN ('integer','real')
    AND json_type(f.metadata,'$.capture_mono_ms') IN ('integer','real')
    AND json_type(a.acceptance_json,'$.metadata.source_seq')='integer'
    AND json_type(f.metadata,'$.source_seq')='integer'
    AND json_type(a.acceptance_json,'$.frame_seq')='integer'
    AND f.frame_seq>json_extract(a.acceptance_json,'$.frame_seq')
    AND json_extract(f.metadata,'$.source_seq')>json_extract(a.acceptance_json,'$.metadata.source_seq')
    AND json_extract(f.metadata,'$.capture_mono_ms')>${reviewedFieldCaptureMS}
    AND ${geometry}
    AND c.expires_at>${clock}-4000 AND c.created_at<=${fieldAncestorCapture}
    AND c.phone_ack_mono_ms>=0 AND ${reviewedFieldCaptureMS}<=c.phone_ack_mono_ms+2000
    AND ${reviewedFieldCaptureMS}>c.phone_ack_mono_ms+max(300,c.original_settle))`;
}
function strictPairedFieldReceiptSQL(){
  const signedReceipt=(receipt:string,id:string)=>allOf("json_extract("+receipt+",'$.command_id')="+id,
    "json_extract("+receipt+",'$.board_boot_id')=c.board_boot_id",
    "json_extract("+receipt+",'$.state')='executed'","json_extract("+receipt+",'$.subcommand_index')=0",
    "json_extract("+receipt+",'$.error') IS NULL","json_type("+receipt+",'$.effect.hid_reports_sent')='true'");
  return allOf("c.kind='pointer.click'","c.error IS NULL","c.input_attempted=1","c.point_parent_attempted=1",
    "c.result_digest=c.point_parent_digest","c.point_parent_ack>=0","c.phone_ack_mono_ms>=c.point_parent_ack",
    signedReceipt("c.point_parent_receipt","c.predecessor_id"),signedReceipt("c.receipt","c.id"));
}
function strictSearchClearSQL(){
  const origin="(SELECT shortcut FROM reviewed_clear_shortcut)";
  const parentProof="json_extract(c.point_parent_precondition,'$.point_source')";
  return allOf(strictPairedFieldReceiptSQL(),"json_extract(c.point_parent_precondition,'$.point_search_origin')="+origin,
    "json_extract("+parentProof+",'$.protocol') IN ('"+reviewedPointProtocol+"','"+reviewedPointCropProtocol+"')",
    pointSearchOriginSQL(origin,["c.id","c.predecessor_id"],false));
}
function releasedFieldAnchorSQL(clock:string,scopeBound:boolean){
  const p=(field:string)=>"json_extract((SELECT view FROM released_field_view),'$."+field+"')";
  const a=(field:string)=>"json_extract(a.acceptance_json,'$."+field+"')";
  return allOf(p("device")+"=d.id",p("session")+"=s.id",p("broadcast")+"=s.broadcast_id",p("worker")+"=d.worker_id",
    p("lease")+"=d.lease_epoch",p("control")+"=s.control_epoch",p("issued")+"<="+clock,
    ...(scopeBound?[]:[p("expires")+">"+clock]),
    p("frame")+"=a.frame_id",p("frameSeq")+"="+a("frame_seq"),p("sourceSeq")+"="+a("metadata.source_seq"),
    p("captureMono")+"="+a("metadata.capture_mono_ms"),p("captureLower")+"="+a("capture_lower_ms"),
    p("sha256")+"="+a("metadata.content_sha256"),a("metadata.provenance")+"='device_capture'");
}
function strictSystemSearchFieldSQL(clock:string,afterClear:boolean,sourceAge:string|null,linkedFieldSource?:ReleasedFieldViewProof) {
  const accepted=(alias:string,field:string)=>`json_extract(${alias}.acceptance_json,'$.${field}')`;
  const capture=(field:string)=>`json_extract(f.metadata,'$.${field}')`;
  const scope=(alias:string)=>[
    `${alias}.device_id=d.id`, `${accepted(alias,"owner_id")}=d.owner_id`,
    `${accepted(alias,"control_epoch")}=s.control_epoch`, `${accepted(alias,"metadata.frame_id")}=${alias}.frame_id`,
    `${accepted(alias,"metadata.bridge_session_id")}=s.id`, `${accepted(alias,"metadata.broadcast_id")}=s.broadcast_id`,
    `${accepted(alias,"metadata.worker_id")}=d.worker_id`, `${accepted(alias,"metadata.lease_epoch")}=d.lease_epoch`,
    `${accepted(alias,"metadata.capture_clock_verified")}=1`,
  ].join(" AND ");
  const geometry=(alias:string)=>[...reviewedFieldGeometryKeys,"width","height","orientation_epoch"].map(
    key=>`${accepted(alias,"metadata."+key)}=${capture(key)}`).join(" AND ");
  const lateScopeBoundRelook=linkedFieldSource?.scopeBound===true&&linkedFieldSource.scopeBoundOnly===true&&
    (linkedFieldSource.origin==="system_search"||linkedFieldSource.scopeBoundField===true);
  return `c.kind='${afterClear||linkedFieldSource?.origin==="paired_click"||linkedFieldSource?.origin==="parked_press"?"pointer.click":SYSTEM_SEARCH_KIND}' AND ${freshHeadViewSQL(clock,2000)}
    AND ${capture("provenance")}='device_capture' AND (${scope("a")}) AND (${scope("n")})
    AND a.id=d.id||':'||a.frame_id AND n.frame_id=f.frame_id
    AND ${fieldAncestorCapture}<=f.capture_lower AND c.created_at<=${fieldAncestorCapture}
    ${sourceAge===null?"":`AND ${fieldAncestorCapture}>${clock}-${sourceAge} AND c.expires_at>${clock}-${sourceAge}`}
    AND c.phone_ack_mono_ms>=0 AND ${reviewedFieldCaptureMS}>c.phone_ack_mono_ms+c.original_settle
    ${lateScopeBoundRelook?"":`AND ${reviewedFieldCaptureMS}<=c.phone_ack_mono_ms+5000`}
    AND json_type(a.acceptance_json,'$.metadata.capture_mono_ms') IN ('integer','real')
    AND json_type(a.acceptance_json,'$.metadata.source_seq')='integer' AND json_type(a.acceptance_json,'$.frame_seq')='integer'
    AND (${geometry("a")}) AND (${geometry("n")})
    AND ${accepted("n","capture_lower_ms")}=f.capture_lower AND ${accepted("n","frame_seq")}=f.frame_seq
    AND ${accepted("n","metadata.content_sha256")}=f.sha256
    AND ${accepted("n","metadata.source_seq")}=${capture("source_seq")}
    AND ${accepted("n","metadata.capture_mono_ms")}=${capture("capture_mono_ms")}
    AND (a.frame_id=f.frame_id OR (f.frame_seq>${accepted("a","frame_seq")} AND f.capture_lower>${fieldAncestorCapture}
      AND ${capture("source_seq")}>${accepted("a","metadata.source_seq")}
      AND ${capture("capture_mono_ms")}>${reviewedFieldCaptureMS}))
    ${afterClear?"":"AND "+noLaterSearchInputSQL("c",[],"c.original_rowid")}`;
}
const systemSearchSourceGate=" AND "+freshHeadViewSQL(sourceClock)+
  " AND ("+sourceView+" IS NULL OR json_extract("+sourceView+",'$.expires')>"+sourceClock+") AND ((f.frame_id=? AND ("+
  sourceView+" IS NULL OR ("+sourceViewMatchesHeadSQL(sourceView)+"))) OR ("+sourceViewSuccessorSQL(sourceClock,sourceView)+"))";
type Ready = Device & { session_id: string; session_state: string; capture_state: string; mode: string; broadcast_id: string; mouse_enabled: number; mouse_until: number; mouse_grant_request: string | null; control_epoch: number; hardware_id: string; board_boot_id: string; metadata: string; usb_connected: number; geometry_rows?: string; prior_id?: string | null; prior_digest?: string | null; point_protocol?:string|null };
type Command = { id: string; owner_id: string; device_id: string; session_id: string; hardware_id: string; board_boot_id: string; kind: string; payload: string; precondition: string | null; digest: string; state: string; worker_id: string; lease_epoch: number; control_epoch: number; created_at: number; expires_at: number; receipt: string | null; result_digest: string | null; error: string | null;phone_ack_mono_ms:number|null;predecessor_id:string|null;input_attempted:number|null;paired_dispatch_probe_id?:string|null;raw_claim_ttl_grant?:string|null };
type Admission = Command & {point_child_json?:string|null;queued_worker?:string|null;queued_lease?:number};
type ReadyCue = {text:string;region:{x:number;y:number;width:number;height:number};wait_ms:number;mode?:"loader_disappears"|"maps_tiles"};
export type ReviewedPointOrigin={systemSearchCommandID:string};
type ReviewedPointCrops={target_region:Region;landmark_region:Region};
type PointAdmission = {clickKey:string;captureMinGapMS:number;readyCue?:ReadyCue;phase?:PairedClickPhaseTiming;
  sourceFrameID?:string;searchOriginID?:string;signal?:AbortSignal;crops?:ReviewedPointCrops;queryProof?:ReviewedPointProof;
  geometryOnly?:true;exactHeadCenter?:true};
type AfterImageReplacement = {observation_state:string;after_screen:Record<string,unknown>;image:string};
export type ClickAfterReleaseRecovery = {withinDeadline:()=>boolean;retry?:(afterSerialization?:boolean)=>Promise<AfterImageReplacement|null>;enforceDeadline?:true;observationDeadline?:ImageObservationDeadline};
export const clickAfterImageTiming = Symbol("paired_click_after_image_timing");
type RegisterClickAfterRelease = (recovery:ClickAfterReleaseRecovery)=>void;
type ModelReviewedFieldSource={frameID:string;contentSHA256:string};
type SearchAdmissionOptions={signal?:AbortSignal;onExtendedModelField?:()=>void};
type ObservationRequestOptions={signal?:AbortSignal;snapshotOnly?:true;searchFocusOnly?:boolean;registerRelease?:RegisterClickAfterRelease;independent?:boolean;afterCommandMinGapMS?:number;requireOriginalSystemSearch?:true;
  requireOriginalSearchClear?:{shortcutID:string};modelReviewedFieldSource?:ModelReviewedFieldSource;cancelSystemSearchBeforeAdmission?:true;
  linkedFieldSource?:ReleasedFieldViewProof;
  authorizedSearch?:{preparationID:string;shortcutID:string;until:number};
  onExtendedModelField?:()=>void};
type ActionObservationOptions={snapshotOnly?:true;strictDeadline?:boolean;action?:boolean;signal?:AbortSignal;currentInput?:ActionAfterImageInput};
type ClaimIdentity = {session:string;broadcast:string;worker:string;lease:number};
type PointClaimScope = {owner:string;device:string;session:string;worker:string;lease:number;control:number};
type ScopeFence = {sql:string;values:unknown[]};
type ExpirationScope = {device:string;owner?:string} | {command:string;owner:string} | {claimFence:ScopeFence};
type PairedPollRow = Command & {needs_expiry?:number;receipt_read_at_utc_ms?:number};
type ResultContext = Command & { live_session: string | null; live_state: string | null; live_mode: string | null; live_broadcast: string | null; live_worker: string | null; live_epoch: number; live_expires: number;point_child_json?:string|null };
type ResultDevice = Pick<Device,"id"|"owner_id">;
type ResultIdentity = Pick<ClaimIdentity,"session"|"worker"|"lease">;
type ResultAuthRow = ResultContext & {auth_device_id:string;auth_owner_id:string;auth_expires:number;auth_confirmed:number|null};
type ResultIngress={receivedAt:number;authenticatedAt:number};
type PreparedResult = {context:ResultContext|null;tokenHash:string;ingress:ResultIngress};
type ClaimedReceipt = {move:Command;click:Command;broadcast:string;expires:number};
type ReceiptPreparationSource = "same_isolate_hint"|"signed_receipt_proof";
type ValidatedPair = {move:Command;click:Command;parts:ReturnType<typeof validatePointResult>};
type AfterImageRead = (waitMS:number,requestID:string,report:boolean,signal?:AbortSignal)=>ReturnType<BridgeEngine["readScreen"]>;

// A completed enqueue can move one existing claim query earlier in this
// process. Keep timing data only. The normal D1 claim still grants authority.
export class PointClaimHints {
  private marks = new Map<string,{at:number;expires:number}>();
  private key(scope:PointClaimScope) {
    return JSON.stringify([scope.owner,scope.device,scope.session,scope.worker,scope.lease,scope.control]);
  }
  record(scope:PointClaimScope,at:number,commandExpires:number) {
    const expires=Math.min(commandExpires,at+250);
    if(expires<=at)return;
    const key=this.key(scope);
    this.marks.delete(key);
    if(this.marks.size>=64)this.marks.delete(this.marks.keys().next().value!);
    this.marks.set(key,{at,expires});
  }
  hasNewCommit(scope:PointClaimScope,since:number,now:number) {
    const mark=this.marks.get(this.key(scope));
    return mark!==undefined&&mark.at>since&&mark.at<=now&&now<mark.expires;
  }
}
export const livePointClaimHints=new PointClaimHints();

// An authenticated grant supplies the immutable rows for a short same-
// process receipt fast path. It never substitutes for the live write fence.
export class PointReceiptHints {
  private claims=new Map<string,ClaimedReceipt>();
  private key(tokenHash:string,command:string) {return JSON.stringify([tokenHash,command]);}
  record(tokenHash:string,move:Command,click:Command,broadcast:string,now:number,tokenExpires:number) {
    const expires=Math.min(move.expires_at,click.expires_at,tokenExpires,now+2000);
    if(expires<=now||move.state!=="executing"||click.state!=="executing"||move.result_digest||click.result_digest)return;
    const key=this.key(tokenHash,move.id);
    this.claims.delete(key);
    if(this.claims.size>=64)this.claims.delete(this.claims.keys().next().value!);
    this.claims.set(key,{move:{...move},click:{...click},broadcast,expires});
  }
  take(tokenHash:string,command:string,now:number) {
    const key=this.key(tokenHash,command),claim=this.claims.get(key);
    this.claims.delete(key);
    return claim&&claim.expires>now?claim:undefined;
  }
}
export const livePointReceiptHints=new PointReceiptHints();

function reviewedPointRegion(raw:unknown):Region {
  const value=record(raw);
  need(Object.keys(value).length===4,"INVALID_REVIEWED_POINT_REGION",422);
  const x=finite(value.x,0,1),y=finite(value.y,0,1);
  const width=finite(value.width,Number.EPSILON,1),height=finite(value.height,Number.EPSILON,1);
  need(x+width<=1&&y+height<=1,"INVALID_REVIEWED_POINT_REGION",422);
  return {x,y,width,height};
}
function reviewedPointCrops(args:Record<string,unknown>,sourceFrameID?:string):ReviewedPointCrops|undefined {
  if(args.target_region===undefined&&args.landmark_region===undefined)return undefined;
  need(sourceFrameID!==undefined&&args.target_region!==undefined&&args.landmark_region!==undefined,
    "REVIEWED_POINT_CROP_SOURCE_REQUIRED",422);
  const target=reviewedPointRegion(args.target_region),landmark=reviewedPointRegion(args.landmark_region);
  need(target.x+target.width<=landmark.x||landmark.x+landmark.width<=target.x||
    target.y+target.height<=landmark.y||landmark.y+landmark.height<=target.y,"REVIEWED_POINT_REGIONS_OVERLAP",422);
  return {target_region:target,landmark_region:landmark};
}
function reviewedPressTargetMargin(target:Region,width:number,height:number,x:number,y:number) {
  return Math.min(x-target.x*(width-1),(target.x+target.width)*(width-1)-x,
    y-target.y*(height-1),(target.y+target.height)*(height-1)-y);
}
function readyCue(raw:unknown):ReadyCue|undefined {
  if(raw===undefined)return undefined;
  const cue=record(raw),region=record(cue.region);
  const mode=cue.mode;
  need((mode===undefined||mode==="loader_disappears"||mode==="maps_tiles")&&Object.keys(cue).every(key=>["text","region","wait_ms","mode"].includes(key))&&
    Object.keys(region).length===4,"INVALID_READY_CUE",422);
  const expected=text(cue.text,80).normalize("NFC").replace(/\s+/gu,"");
  const x=finite(region.x,0,1),y=finite(region.y,0,1),width=finite(region.width,0.08,1),height=finite(region.height,0.03,1);
  need(expected.length>0&&x+width<=1&&y+height<=1&&width*height<=0.35,"INVALID_READY_CUE",422);
  if(mode==="maps_tiles")need(expected==="GoogleMaps"&&x<=0.12&&width>=0.18&&x+width<=0.55&&
    y>=0.50&&height<=0.20&&y+height<=0.90,"INVALID_READY_CUE",422);
  return {text:expected,region:{x,y,width,height},wait_ms:integer(cue.wait_ms??1000,100,1200),...(mode===undefined?{}:{mode})};
}
function readyCueCapability(cue?:ReadyCue) {
  if(cue?.mode==="loader_disappears")return "loading_cue_supported";
  if(cue?.mode==="maps_tiles")return "maps_tiles_cue_supported";
  return "ready_cue_supported";
}

/** Owner-granted single inputs. Absolute axes and system Search require reviewed current capture evidence. */
export class MouseControl {
  private e: BridgeEngine;
  private waitNow:()=>number;
  private waitSleep:(milliseconds:number)=>Promise<void>;
  private claimHints?:PointClaimHints;
  private receiptHints?:PointReceiptHints;
  private readonly ordinaryClickGeometryOnly:boolean;
  private shadowEnabled=false;
  private shadowSignal?:AbortSignal;
  private shadowTicket?:ShadowTicket;
  constructor(engine: BridgeEngine, timing:{now?:()=>number;sleep?:(milliseconds:number)=>Promise<void>;
    claimHints?:PointClaimHints;receiptHints?:PointReceiptHints;ordinaryClickGeometryOnly?:true}={}) {
    this.e=engine;
    this.waitNow=timing.now??(()=>performance.now());
    this.waitSleep=timing.sleep??delay;
    this.claimHints=timing.claimHints;
    this.receiptHints=timing.receiptHints;
    this.ordinaryClickGeometryOnly=timing.ordinaryClickGeometryOnly===true;
  }
  private readyStatement(user:User,device:string|null,includeGeometry:boolean,key?:string,onlyIfNoCommand=false,now=this.e.now()) {
    const geometry = includeGeometry ? ",(SELECT json_group_array(json_object('metadata',g.metadata,'capture_lower',g.capture_lower)) FROM ("+geometryRows("d.owner_id","d.id","s.id","d.lease_epoch")+") g) AS geometry_rows" : "";
    const prior = key === undefined ? "" : ",c.id AS prior_id,c.digest AS prior_digest";
    const join = key === undefined ? "" : " LEFT JOIN sb_mouse_commands c ON c.owner_id=d.owner_id AND c.device_id=d.id AND c.idempotency_key=?";
    const point=",(SELECT p.protocol FROM sb_mouse_point_ready p WHERE p.device_id=d.id AND p.owner_id=d.owner_id AND p.session_id=s.id AND p.worker_id=d.worker_id AND p.lease_epoch=d.lease_epoch AND p.control_epoch=s.control_epoch) AS point_protocol";
    const skipSaved=onlyIfNoCommand&&key!==undefined?" AND c.id IS NULL":"";
    return this.e.stmt("SELECT d.*,s.id AS session_id,s.state AS session_state,s.capture_state,s.mode,s.broadcast_id,s.mouse_enabled,s.mouse_until,s.mouse_grant_request,s.control_epoch,h.hardware_id,h.board_boot_id,h.metadata,h.usb_connected" + geometry + prior + point + " FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id" + join + " WHERE d.owner_id=? AND d.revoked=0 AND (? IS NULL OR d.id=?) AND s.state='active'" + skipSaved + " ORDER BY d.created_at DESC LIMIT 2", ...(includeGeometry ? [now,now-2000,now+100] : []), ...(key === undefined ? [] : [key]), user.id, device, device);
  }
  private async ready(user: User, deviceID?: unknown, includeGeometry = false, key?: string) {
    const device=deviceID==null?null:uuid(deviceID);
    const rows=await this.readyStatement(user,device,includeGeometry,key).all<Ready>();
    need(rows.results.length === 1, rows.results.length ? "CHOOSE_DEVICE" : "START_MOUSE_SHARING");
    return rows.results[0];
  }
  private geometrySnapshot(rows: { metadata: string; capture_lower: number }[]) {
    const candidates = rows.map(row => ({ meta: JSON.parse(row.metadata), age: Math.max(0,this.e.now()-row.capture_lower) })).filter(row => row.age <= 2000);
    if (!candidates.length) return null;
    const epoch = Math.max(...candidates.map(row => Number(row.meta.orientation_epoch)));
    const current = candidates.find(row => row.meta.orientation_epoch === epoch)!;
    const m = current.meta;
    return { frame_id:m.frame_id,image_width:m.width,image_height:m.height,capture_width:m.native_width_px,capture_height:m.native_height_px,orientation_epoch:m.orientation_epoch,orientation:m.orientation,age_ms:current.age,
      ...(m.ready_cue_supported===true?{ready_cue_supported:true}:{}),...(m.loading_cue_supported===true?{loading_cue_supported:true}:{}),
      ...(m.maps_tiles_cue_supported===true?{maps_tiles_cue_supported:true}:{}) };
  }
  async status(user: User, args: Record<string, unknown>) {
    const r = await this.ready(user, args.device_id, true), now = this.e.now(), board = JSON.parse(r.metadata);
    const allowed = r.mode === "broadcast" && r.capture_state === "active" && r.worker_expires > now && r.usb_connected === 1 && r.mouse_enabled === 1 && r.mouse_until > now;
    const systemSearchReady=allowed&&board.capabilities[SYSTEM_SEARCH_BOARD_CAPABILITY]===true&&board.capabilities[SYSTEM_SEARCH_CAPABILITY]===true;
    const focusedTextReady=allowed&&board.capabilities[focusedTextCapability]===true;
    return { device_id: r.id, bridge_session_id: r.session_id, enabled: allowed, control_epoch: r.control_epoch, usb_connected: r.worker_expires > now && r.usb_connected === 1, last_reported_usb_connected: r.usb_connected === 1, online: r.worker_expires > now, grant_remaining_ms: allowed ? r.mouse_until - now : 0, capabilities: board.capabilities, descriptor_version: board.descriptor_version, control_scope: allowed ? Object.values(capabilities).filter(x => board.capabilities[x] === true) : [], point_protocol: allowed ? r.point_protocol??null:null, absolute_supported: board.capabilities["hid.mouse.absolute"] === true, screen_geometry: this.geometrySnapshot(JSON.parse(r.geometry_rows ?? "[]")),
      ...(allowed && board.capabilities[spotlightCapability]===true ? {spotlight_wired_ready:true,board_boot_id:r.board_boot_id} : {}),
      ...(systemSearchReady?{system_search_ready:true,board_boot_id:r.board_boot_id}:{}),
      ...(systemSearchReady&&board.capabilities[SYSTEM_SEARCH_SCOPE_ONLY_CAPABILITY]===true?{system_search_scope_only_ready:true}:{}),
      ...(allowed&&board.capabilities[APP_SEARCH_CAPABILITY]===true&&board.capabilities[SYSTEM_SEARCH_BOARD_CAPABILITY]===true&&board.capabilities[stableASCIICapability]===true
        ?{app_search_preparation_ready:true,board_boot_id:r.board_boot_id}:{}),
      ...(focusedTextReady ? {focused_text_ready:true,board_boot_id:r.board_boot_id,
        focused_text_transport:board.capabilities[stableASCIICapability]===true?"stable_usb":"keyboard_window"} : {}),
      ...(allowed&&noVisualFieldReady(board.capabilities)?{focused_text_no_visual_ready:true}:{}),
      ...(focusedTextReady&&systemSearchReady?{focused_text_system_search_handoff_ready:true}:{}),
      ...(focusedTextReady&&this.e.releasedFieldViewProofAvailable&&board.capabilities[stableASCIICapability]===true&&
        board.capabilities[extendedModelReviewedFieldCapability]===true?{focused_text_linked_after_ready:true}:{}),
      ...(focusedTextReady&&this.e.releasedFieldViewProofAvailable&&board.capabilities[stableASCIICapability]===true&&
        board.capabilities[scopeBoundSystemSearchFieldCapability]===true?{focused_text_scope_bound_after_ready:true}:{}),
      ...(focusedTextReady&&this.e.releasedFieldViewProofAvailable&&board.capabilities[stableASCIICapability]===true&&
        board.capabilities[scopeBoundFieldCapability]===true?{focused_text_scope_bound_field_ready:true}:{}),
      ...(allowed&&textEnterReady(board.capabilities)?{focused_text_submit_enter_ready:true}:{}),
      ...(allowed&&textClearReady(board.capabilities)?{focused_text_clear_before_input_ready:true}:{}),
      ...(allowed&&this.e.releasedFieldViewProofAvailable&&linkedAfterEnterReady(board.capabilities)?
        {focused_text_linked_after_enter_ready:true}:{}),
      ...(allowed&&dragReady(board.capabilities)?{drag_at_ready:true,board_boot_id:r.board_boot_id,
        ...(board.capabilities[DRAG_RELATIVE_APP_CAPABILITY]===true&&board.capabilities[DRAG_RELATIVE_CAPABILITY]===true?
          {drag_calibrated_duration_ms:DRAG_CALIBRATED_DURATION_MS}:{} )}:{}),
      ...(allowed&&r.point_protocol===PAIRED_MOUSE_POINT&&board.capabilities[REVIEWED_POINT_CAPABILITY]===true?{reviewed_point_ready:true}:{}),
      ...(allowed&&r.point_protocol===PAIRED_MOUSE_POINT&&board.capabilities[REVIEWED_POINT_CROP_CAPABILITY]===true?{reviewed_point_crops_ready:true}:{}),
      ...(allowed&&r.point_protocol===PAIRED_MOUSE_POINT&&board.capabilities[REVIEWED_POINT_COMPOUND_CAPABILITY]===true?{reviewed_point_compound_ready:true}:{}),
      ...(allowed&&r.point_protocol===PAIRED_MOUSE_POINT&&board.capabilities[scopeBoundLinkedPointCapability]===true?{reviewed_point_scope_bound_ready:true}:{}),
      ...(allowed&&r.point_protocol===PAIRED_MOUSE_POINT&&board.capabilities[scopeBoundLinkedPointCapability]===true&&
        board.capabilities[visualReadPointCapability]===true?{reviewed_point_visual_read_ready:true}:{}),
      ...(allowed&&r.point_protocol===PAIRED_MOUSE_POINT&&board.capabilities[reviewedPressCapability]===true?{reviewed_press_after_move_ready:true}:{}),
      ...(allowed && board.capabilities[spotlightProbeCapability]===true ? {spotlight_wired_probe_ready:true,board_boot_id:r.board_boot_id} : {}) };
  }
  async grant(device: Device, body: Record<string, unknown>) {
    if (body.control_enabled === false) {
      need(body.bridge_session_id!=null&&body.expected_control_epoch!=null,"REVOKE_SCOPE_REQUIRED",422);
      return this.stopScoped({id:device.owner_id,label:""},device.id,uuid(body.bridge_session_id),integer(body.expected_control_epoch,0));
    }
    need(body.control_enabled === true, "INVALID_GRANT", 422);
    const session = uuid(body.bridge_session_id), request = uuid(body.request_id), r = await this.ready({ id: device.owner_id, label: "" }, device.id), now = this.e.now();
    need(r.session_id === session && r.mode === "broadcast" && r.capture_state === "active" && r.worker_expires > now && r.usb_connected === 1, "MOUSE_NOT_CONNECTED");
    need(Object.values(capabilities).some(x => JSON.parse(r.metadata).capabilities[x] === true), "MOUSE_NOT_SUPPORTED");
    if(body.automatic_connected===true){
      const expected=integer(body.expected_control_epoch,0),worker=uuid(body.worker_id),lease=integer(body.lease_epoch,1),
        hardware=uuid(body.hardware_id),boot=uuid(body.board_boot_id),renew=body.renewal===true;
      need(r.worker_id===worker&&r.lease_epoch===lease&&r.hardware_id===hardware&&r.board_boot_id===boot,"AUTOMATIC_GRANT_SCOPE_CHANGED");
      need(r.control_epoch===expected||(!renew&&r.mouse_grant_request===request&&r.control_epoch===expected+1),"STALE_CONTROL_EPOCH");
      if(renew)need(r.mouse_enabled===1&&r.mouse_until>now,"AUTOMATIC_RENEWAL_EXPIRED");
      const changed=await this.e.stmt("UPDATE sb_sessions SET mouse_enabled=1,mouse_until=CASE WHEN ?=0 AND mouse_grant_request=? THEN mouse_until ELSE ? END,control_epoch=CASE WHEN ?=1 OR mouse_grant_request=? THEN control_epoch ELSE control_epoch+1 END,mouse_grant_request=CASE WHEN ?=1 THEN mouse_grant_request ELSE ? END WHERE id=? AND owner_id=? AND mode='broadcast' AND state='active' AND capture_state='active' AND (control_epoch=? OR (?=0 AND mouse_grant_request=? AND control_epoch=?)) AND (?=0 OR (mouse_enabled=1 AND mouse_until>?)) AND EXISTS(SELECT 1 FROM sb_devices d JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id WHERE d.id=sb_sessions.device_id AND d.owner_id=sb_sessions.owner_id AND d.current_session=sb_sessions.id AND d.revoked=0 AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND h.usb_connected=1 AND h.hardware_id=? AND h.board_boot_id=?)",
        renew?1:0,request,now+600_000,renew?1:0,request,renew?1:0,request,session,device.owner_id,expected,renew?1:0,request,expected+1,renew?1:0,now,worker,lease,now,hardware,boot).run();
      need(changed.meta.changes===1,"AUTOMATIC_GRANT_SCOPE_CHANGED");
      return this.status({id:device.owner_id,label:""},{device_id:device.id});
    }
    await this.e.stmt("UPDATE sb_sessions SET mouse_enabled=1,mouse_until=CASE WHEN mouse_grant_request=? THEN mouse_until ELSE ? END,control_epoch=CASE WHEN mouse_grant_request=? THEN control_epoch ELSE control_epoch+1 END,mouse_grant_request=? WHERE id=? AND owner_id=? AND state='active' AND capture_state='active' AND mode='broadcast' AND EXISTS(SELECT 1 FROM sb_devices d JOIN sb_hardware h ON h.device_id=d.id WHERE d.id=sb_sessions.device_id AND d.current_session=sb_sessions.id AND d.revoked=0 AND d.worker_expires>? AND h.usb_connected=1 AND h.hardware_id=? AND h.board_boot_id=?)", request, now + 600_000, request, request, session, device.owner_id, now, r.hardware_id, r.board_boot_id).run();
    return this.status({ id: device.owner_id, label: "" }, { device_id: device.id });
  }
  private expirationPredicate(scope:ExpirationScope,now:number,fence?:ScopeFence):ScopeFence {
    const ownerGate = "device" in scope && scope.owner !== undefined;
    const selector = ("claimFence" in scope ? scope.claimFence.sql : "device" in scope ? "device_id=?" : "device_id=(SELECT c.device_id FROM sb_mouse_commands c JOIN sb_devices d ON d.id=c.device_id WHERE c.id=? AND c.owner_id=? AND d.owner_id=c.owner_id AND d.revoked=0)")+
      (ownerGate ? " AND owner_id=? AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=sb_mouse_commands.device_id AND d.owner_id=sb_mouse_commands.owner_id AND d.revoked=0)" : "")+
      (fence?" AND "+fence.sql:"");
    const values = "claimFence" in scope ? scope.claimFence.values : "device" in scope ? [scope.device,...(ownerGate?[scope.owner]:[])] : [scope.command,scope.owner];
    return {
      sql: selector + " AND state IN ('queued','claimed','executing','embedded') AND (expires_at<=? OR NOT EXISTS(SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session JOIN sb_hardware h ON h.device_id=d.id WHERE d.id=sb_mouse_commands.device_id AND d.revoked=0 AND d.worker_expires>? AND s.id=sb_mouse_commands.session_id AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.mouse_until>? AND s.control_epoch=sb_mouse_commands.control_epoch AND h.usb_connected=1 AND h.hardware_id=sb_mouse_commands.hardware_id AND h.board_boot_id=sb_mouse_commands.board_boot_id))",
      values:[...values,...(fence?.values??[]),now,now,now],
    };
  }
  private expireMatching(predicate:ScopeFence) {
    return this.e.stmt("UPDATE sb_mouse_commands SET state=CASE WHEN state='executing' THEN 'outcome_unknown' ELSE 'expired' END,error='EXPIRED_OR_CONTROL_CHANGED' WHERE "+predicate.sql,...predicate.values);
  }
  private expiration(scope:ExpirationScope,now:number,fence?:ScopeFence) {
    return this.expireMatching(this.expirationPredicate(scope,now,fence));
  }
  private async expire(device: string, owner?:string, fence?:ScopeFence) {
    await this.expiration({device,owner},this.e.now(),fence).run();
  }
  private output(c: Command) {
    const receipt=c.receipt?JSON.parse(c.receipt):null;
    const point=pointSpec(c.precondition);
    const noInput=c.input_attempted===0||(c.state==="failed"&&c.error==="MOUSE_DISPATCH_BUDGET_EXPIRED"&&receipt!==null&&!Array.isArray(receipt)&&Object.keys(receipt).length===0);
    const mono=typeof c.phone_ack_mono_ms==="number"&&Number.isFinite(c.phone_ack_mono_ms)&&c.phone_ack_mono_ms>=0&&c.phone_ack_mono_ms<=Number.MAX_SAFE_INTEGER?c.phone_ack_mono_ms:null;
    const clockScopeKnown=typeof c.worker_id==="string"&&c.worker_id.length>0&&Number.isSafeInteger(c.lease_epoch)&&c.lease_epoch>0;
    return { command_id: c.id, device_id: c.device_id, bridge_session_id: c.session_id, hardware_id: c.hardware_id, board_boot_id: c.board_boot_id, kind: c.kind, payload: JSON.parse(c.payload), precondition: c.precondition ? JSON.parse(c.precondition) : null, state: c.state, control_epoch: c.control_epoch, expires_at: iso(c.expires_at), board_receipt: receipt, error: c.error, input_not_submitted:noInput, verification: c.state === "board_acked" ? "phone_verified_board_ack" : "not_confirmed", app_effect_observed: false,
      ...(point?{point_protocol:point.protocol,paired_click_command_id:point.click_command_id}:{}),
      ...(c.kind===spotlightKind?{spotlight:receipt?.spotlight??null}:{}),
      ...(c.kind===focusedTextKind?{text_input:receipt?.spotlight??null}:{}),
      ...(c.predecessor_id?{predecessor_command_id:c.predecessor_id}:{}),...(c.input_attempted==null?{}:{input_attempted:c.input_attempted===1}),
      receipt_observation:{phone_clock:"iphone_system_uptime_ms",phone_ack_mono_ms:mono,valid_for_capture_order:c.state==="board_acked"&&mono!==null&&clockScopeKnown,
        scope:{device_id:c.device_id,bridge_session_id:c.session_id,worker_id:c.worker_id,lease_epoch:c.lease_epoch},app_effect_observed:false}};
  }
  private dispatchOutput(command:Command) {
    const result=this.output(command);
    const siteOnly=command.kind===focusedTextKind?["capture_min_gap_ms","linked_field_click"]:
      ["point_search_origin","point_query_origin","reviewed_press_origin","reviewed_press_geometry","point_motion_policy","point_center_policy"];
    if(command.kind==="pointer.move_absolute"&&result.point_protocol===PAIRED_MOUSE_POINT&&
      result.precondition?.point_motion_policy===ordinaryPointMotionPolicy)siteOnly.push("point_source");
    if(result.precondition?.reviewed_press)siteOnly.push("capture_min_gap_ms");
    if(!siteOnly.some(key=>result.precondition?.[key]!==undefined))return result;
    // These saved values only qualify Sites admission or image observation.
    // In particular older Apps expect the exact stable field wire precondition.
    const precondition={...result.precondition};
    for(const key of siteOnly)delete precondition[key];
    return {...result,precondition:Object.keys(precondition).length?precondition:null};
  }
  async get(user: User, id: string, reportOriginalKey = false) {
    const command = await this.ownedCommand(user,id);
    const result = this.output(command);
    if (!reportOriginalKey || command.kind !== "pointer.click" || !command.predecessor_id) return result;
    // This owner-scoped row already stores the hash of the raw click_at key.
    const digest = /^click-at:([0-9a-f]{64}):click$/.exec(command.idempotency_key)?.[1];
    const recovery=command.state==="failed"&&command.input_attempted===0&&command.error==="MOUSE_PRECONDITION_FAILED"?
      await this.e.stmt(`SELECT id FROM sb_mouse_commands WHERE predecessor_id=? AND idempotency_key=?
        AND owner_id=? AND device_id=? AND json_extract(precondition,'$.reviewed_press.protocol')=?`,
        command.id,reviewedPressKeyPrefix+command.id,user.id,command.device_id,reviewedPressProtocol).first<{id:string}>():null;
    return {...result,...(digest?{click_at_idempotency_key_sha256:digest}:{}),
      ...(recovery?{recovery_click_command_id:recovery.id}:{})};
  }
  async getClickAtByKey(user:User,deviceID:unknown,idempotencyKey:unknown) {
    const device=uuid(deviceID),key=await clickAtKey(idempotencyKey);
    const moveKey=key+":move",clickKey=key+":click";
    // A lost tool response may follow a real click. This lookup never advances
    // state, expires commands or dispatches another input.
    const {results}=await this.e.stmt(`SELECT c.* FROM sb_mouse_commands c
      JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id
      WHERE c.owner_id=? AND c.device_id=? AND c.idempotency_key IN (?,?) AND d.revoked=0`,
      user.id,device,moveKey,clickKey).all<Command & {idempotency_key:string}>();
    const move=results.find(row=>row.idempotency_key===moveKey&&row.kind==="pointer.move_absolute");
    const click=results.find(row=>row.idempotency_key===clickKey&&row.kind==="pointer.click");
    // Legacy clicks do not persist the relationship. Matching two key strings
    // alone cannot establish that the click was submitted by the paired action.
    const matched=move&&click&&click.predecessor_id===move.id&&
      pointSpec(move.precondition)?.click_command_id===click.id&&
      (["session_id","worker_id","lease_epoch","control_epoch","hardware_id","board_boot_id","expires_at"] as const)
        .every(field=>move[field]===click[field]);
    if(!matched)return {state:"outcome_unknown",reason:"CLICK_AT_RECEIPT_NOT_FOUND",
      device_id:device,command_id:null,move_command_id:null,click_command_id:null,
      click_submitted:null,input_not_submitted:null,lookup_found:false,
      move_record_found:!!move,click_record_found:!!click};
    const saved=this.output(click),stillPending=pending.has(saved.state);
    return {...saved,move_command_id:move.id,click_command_id:click.id,lookup_found:true,
      click_submitted:stillPending?null:saved.input_attempted??(saved.input_not_submitted?false:null),
      ...(stillPending?{input_attempted:null,input_not_submitted:null}:{})};
  }
  async enqueueSpotlight(user: User, args: Record<string, unknown>, waitDeadline?:number,focused=false,
    requireOriginalSystemSearch?:true,strictSignal?:AbortSignal,requireOriginalSearchClear?:{shortcutID:string},
    modelReviewedFieldSource?:ModelReviewedFieldSource,linkedFieldSource?:ReleasedFieldViewProof,requestID=uid()) {
    const clearShortcutID=requireOriginalSearchClear===undefined?undefined:uuid(requireOriginalSearchClear.shortcutID);
    need(!(clearShortcutID!==undefined&&requireOriginalSystemSearch)&&
      !(linkedFieldSource&&(clearShortcutID!==undefined||requireOriginalSystemSearch||modelReviewedFieldSource)),"INVALID_ARGUMENTS",422);
    const strictSearchSource=requireOriginalSystemSearch===true||clearShortcutID!==undefined||linkedFieldSource!==undefined;
    if(strictSearchSource)need(focused&&(linkedFieldSource!==undefined||args.submit===undefined)&&args.source_after_command_id!==undefined,
      linkedFieldSource?"FIELD_AFTER_HANDOFF_REQUIRED":"SYSTEM_SEARCH_FIELD_HANDOFF_REQUIRED",422);
    const payload=focused?focusedTextPayload(args):spotlightPayload(args),serialized=JSON.stringify(payload);
    const sourceAction=focused&&args.source_after_command_id!==undefined?uuid(args.source_after_command_id):null;
    const device=uuid(args.device_id);
    if(linkedFieldSource){
      need(linkedFieldSource.device===device&&linkedFieldSource.frame===payload.source_frame_id&&linkedFieldSource.command===sourceAction,
        "FIELD_AFTER_IMAGE_PROOF_INVALID");
      modelReviewedFieldSource={frameID:linkedFieldSource.frame,contentSHA256:linkedFieldSource.sha256};
    }
    if(modelReviewedFieldSource)need(strictSearchSource&&modelReviewedFieldSource.frameID===payload.source_frame_id&&
      /^[0-9a-f]{64}$/.test(modelReviewedFieldSource.contentSHA256),"MODEL_REVIEWED_FIELD_SOURCE_INVALID",422);
    const submitEnter=focused&&"submit_enter" in payload&&payload.submit_enter===true;
    const v4=linkedFieldSource?.scopeBoundField===true;
    const scopeBoundSource=linkedFieldSource?.scopeBound===true&&(v4||linkedFieldSource.origin==="system_search");
    need(!scopeBoundSource||linkedFieldSource?.origin!=="system_search"||!submitEnter,"INVALID_ARGUMENTS",422);
    const linkedEnter=linkedFieldSource!==undefined&&submitEnter;
    const kind=focused?focusedTextKind:spotlightKind;
    const key = text(args.idempotency_key,120), wait = integer(args.wait_ms ?? (focused?8000:2000),0,focused?12000:3000);
    const deadline = waitDeadline??this.waitNow()+wait;
    const defaultSettle = strictSearchSource?systemSearchTextAfterGapMS:submitEnter?textEnterSettleMS:0;
    const settle = focused&&args.settle_ms!==undefined?Math.max(defaultSettle,integer(args.settle_ms,0,2000)):defaultSettle;
    const raisesSettle = settle>defaultSettle;
    const searchDigest=linkedFieldSource?":field-after:"+linkedFieldSource.origin+":"+sourceAction:
      clearShortcutID!==undefined?":search-clear:"+clearShortcutID+":"+sourceAction:
      requireOriginalSystemSearch?":system-search:"+sourceAction:"";
    const modelFocusDigest=modelReviewedFieldSource?":focus-sha:"+modelReviewedFieldSource.contentSHA256:"";
    const digest = await hash(kind+":"+serialized+searchDigest+modelFocusDigest+(raisesSettle?":settle:"+settle:""));
    const now=this.e.now(),id=uid();
    const probe="probe_keyboard" in payload&&payload.probe_keyboard===true;
    const capability = focused?focusedTextCapability:probe?spotlightProbeCapability:spotlightCapability;
    const at="clock.now";
    const transportPrecondition="CASE WHEN json_extract(h.metadata,?)=1 THEN '{\"spotlight_transport\":\"stable_usb\"}' END";
    const settlePrecondition=strictSearchSource||raisesSettle?
      "json_set(COALESCE("+transportPrecondition+",'{}'),'$.capture_min_gap_ms',"+settle+")":
      transportPrecondition;
    const modelFocusProof=modelReviewedFieldSource&&JSON.stringify({
      frame_id:modelReviewedFieldSource.frameID,content_sha256:modelReviewedFieldSource.contentSHA256,
    });
    const stableASCII=reviewedPointCapSQL(stableASCIICapability);
    const extendedModelField=allOf(stableASCII,reviewedPointCapSQL(extendedModelReviewedFieldCapability));
    const scopeBoundCapability=v4?scopeBoundFieldCapability:scopeBoundSystemSearchFieldCapability;
    const scopeBoundProtocol=v4?scopeBoundFieldProtocol:scopeBoundSystemSearchFieldProtocol;
    const scopeBoundModelField=allOf(stableASCII,reviewedPointCapSQL(scopeBoundCapability));
    const legacyModelField=allOf(stableASCII,reviewedPointCapSQL(modelReviewedFieldCapability));
    const sourceAge=scopeBoundSource?null:linkedFieldSource?String(extendedModelReviewedFieldAgeMS):
      modelFocusProof?`(CASE WHEN ${extendedModelField} THEN ${extendedModelReviewedFieldAgeMS} ELSE 4000 END)`:"4000";
    const modelPrecondition=scopeBoundSource?
      `json_patch(${settlePrecondition},json_object('focus_source',json_set(json(?),'$.protocol',
        '${scopeBoundProtocol}','$.origin','${linkedFieldSource?.origin}')))`:modelFocusProof?
      `json_patch(${settlePrecondition},CASE WHEN ${extendedModelField} OR ${legacyModelField}
        THEN json_object('focus_source',json_set(json(?),'$.protocol',
          CASE WHEN ${extendedModelField} THEN '${extendedModelReviewedFieldProtocol}' ELSE '${modelReviewedFieldProtocol}' END))
        ELSE '{}' END)`:
      settlePrecondition;
    const typedPrecondition=linkedFieldSource&&!submitEnter?
      "json_set("+modelPrecondition+",'$.linked_field_click',json('true'))":modelPrecondition;
    const reviewedJPEGFence=modelFocusProof?
      " AND json_extract(a.acceptance_json,'$.metadata.provenance')='device_capture'"+
      " AND json_extract(a.acceptance_json,'$.metadata.content_sha256')=?":"";
    const currentFrameAge=focused?"f.capture_lower>"+at+"-2000 AND f.capture_lower<="+at+"+100":
      "f.capture_lower BETWEEN "+at+"-2000 AND "+at+"+100";
    // Materialize the receipt chain and frame proof separately in the same
    // INSERT snapshot. Nested SELECT expressions inherit D1's depth limit.
    const clearProof=clearShortcutID===undefined?"":`, reviewed_clear_chain AS MATERIALIZED (
      SELECT c.* ${mouseAdmissionJoin}
      JOIN reviewed_field_original c ON c.owner_id=d.owner_id AND c.device_id=d.id AND c.session_id=s.id
        AND c.worker_id=d.worker_id AND c.lease_epoch=d.lease_epoch AND c.control_epoch=s.control_epoch
        AND c.hardware_id=h.hardware_id AND c.board_boot_id=h.board_boot_id
      WHERE d.id=? AND d.owner_id=? AND ${strictSearchClearSQL()}
    )`;
    const linkedProof=linkedFieldSource?`, released_field_view AS (SELECT ? AS view), released_field_anchor AS MATERIALIZED (
      SELECT a.id ${mouseAdmissionJoin}
      JOIN sb_observations a ON a.id=d.id||':'||json_extract((SELECT view FROM released_field_view),'$.frame')
      CROSS JOIN clock WHERE d.id=? AND d.owner_id=? AND ${releasedFieldAnchorSQL(at,scopeBoundSource)}
    ), released_field_origin AS MATERIALIZED (
      SELECT c.* FROM reviewed_field_original c WHERE ${linkedFieldSource.origin==="paired_click"?strictPairedFieldReceiptSQL():
        linkedFieldSource.origin==="parked_press"?"json_extract(c.precondition,'$.reviewed_press.protocol')='"+reviewedPressProtocol+"'":"c.kind='keyboard.open_search'"}
    )`:"";
    const originalSource=linkedFieldSource?"released_field_origin":clearShortcutID===undefined?"reviewed_field_original":"reviewed_clear_chain";
    const protectedSource=sourceAction?`${clearShortcutID===undefined?"":", reviewed_clear_shortcut AS (SELECT ? AS shortcut)"}, ${reviewedFieldOriginalCTE}${clearProof}${linkedProof}, protected_field_source AS MATERIALIZED (
      SELECT a.id AS reviewed_id,f.frame_id AS head_id ${mouseAdmissionJoin}
      JOIN sb_frames f ON f.device_id=d.id
      JOIN sb_observations a ON a.id=d.id||':'||?
      ${linkedFieldSource?"JOIN released_field_anchor anchor ON anchor.id=a.id":""}
      ${strictSearchSource?"JOIN sb_observations n ON n.id=d.id||':'||f.frame_id":""}
      JOIN ${originalSource} c ON c.owner_id=d.owner_id AND c.device_id=d.id AND c.session_id=s.id
        AND c.worker_id=d.worker_id AND c.lease_epoch=d.lease_epoch AND c.control_epoch=s.control_epoch
        AND c.hardware_id=h.hardware_id AND c.board_boot_id=h.board_boot_id
      CROSS JOIN clock
      WHERE d.id=? AND d.owner_id=? AND ${strictSearchSource?strictSystemSearchFieldSQL(at,clearShortcutID!==undefined,sourceAge,linkedFieldSource):reviewedFieldAfterActionSQL(at)}${reviewedJPEGFence}
    )`:"";
    const ancestorJoin=sourceAction?" LEFT JOIN protected_field_source p ON p.reviewed_id=a.id AND p.head_id=f.frame_id":"";
    const ancestorAge="("+fieldAncestorCapture+" BETWEEN "+at+"-2000 AND f.capture_lower"+
      (sourceAction?" OR p.reviewed_id IS NOT NULL":"")+")";
    const strictHeadJoin=strictSearchSource?" JOIN protected_field_source p ON p.head_id=f.frame_id":"";
    const ordinarySource=(frame:string)=>
      "(f.frame_id="+frame+" OR EXISTS(SELECT 1 FROM sb_observations a"+ancestorJoin+" WHERE a.id=d.id||':'||"+frame+
      " AND "+ancestorAge+
      " AND json_extract(a.acceptance_json,'$.metadata.bridge_session_id')=s.id"+
      " AND json_extract(a.acceptance_json,'$.metadata.broadcast_id')=s.broadcast_id"+
      " AND json_extract(a.acceptance_json,'$.metadata.worker_id')=d.worker_id"+
      " AND json_extract(a.acceptance_json,'$.metadata.lease_epoch')=d.lease_epoch"+
      " AND json_extract(a.acceptance_json,'$.metadata.orientation_epoch')=json_extract(f.metadata,'$.orientation_epoch')"+
      " AND json_extract(a.acceptance_json,'$.metadata.width')=json_extract(f.metadata,'$.width')"+
      " AND json_extract(a.acceptance_json,'$.metadata.height')=json_extract(f.metadata,'$.height')))";
    const reviewedSourceGate=strictSearchSource?"":" AND "+ordinarySource("?");
    const headEligible=allOf("f.device_id=d.id","f.owner_id=d.owner_id","f.session_id=s.id","f.lease_epoch=d.lease_epoch",
      "f.expires_at>"+at,"json_extract(f.metadata,'$.worker_id')=d.worker_id","json_extract(f.metadata,'$.broadcast_id')=s.broadcast_id",
      currentFrameAge,"(f.storage_ready=1 OR length(f.inline_jpeg)>0)");
    const capabilityEligible=allOf("json_extract(h.metadata,'$.capabilities.\""+capability+"\"')=1",
      ...(submitEnter?[textEnterCapabilitiesSQL("h.metadata")]:[]),
      ...(linkedFieldSource?[scopeBoundSource?scopeBoundModelField:extendedModelField]:[]),
      ...(linkedFieldSource?.origin==="parked_press"?[reviewedPointCapSQL(reviewedPressCapability)]:[]),
      ...(linkedEnter?[reviewedPointCapSQL(focusedTextLinkedAfterEnterCapability)]:[]));
    const protectedBindings=[
      ...(clearShortcutID===undefined?[]:[clearShortcutID]),...(sourceAction?[sourceAction]:[]),
      ...(clearShortcutID===undefined?[]:[device,user.id]),...(linkedFieldSource?[JSON.stringify(linkedFieldSource),device,user.id]:[]),
      ...(sourceAction?[payload.source_frame_id,device,user.id]:[]),
      ...(modelReviewedFieldSource?[modelReviewedFieldSource.contentSHA256]:[]),
    ];
    const rejection=focused?this.e.stmt(focusedFieldAdmissionRejectionSQL(databaseNowSQL,{
      authority:mouseAdmissionAuthority(at),head:headEligible,headFresh:currentFrameAge,
      source:strictSearchSource?"EXISTS(SELECT 1 FROM protected_field_source p WHERE p.head_id=f.frame_id)":ordinarySource("r.source_frame_id"),
      protectedSourceCTE:protectedSource,capabilities:capabilityEligible,fences:mouseAdmissionFences,
    }),now,...protectedBindings,device,user.id,key,payload.source_frame_id):
      this.readyStatement(user,device,false,key,true,now);
    if(strictSearchSource)need(!strictSignal?.aborted,"APP_SEARCH_QUERY_CANCELLED",409);
    const saved=await this.e.db.batch<Admission|Ready|FocusedFieldAdmissionRejection>([
      this.expiration({device,owner:user.id},now),
      this.e.stmt("WITH clock AS MATERIALIZED (SELECT max(?, "+databaseNowSQL+") AS now)"+protectedSource+" "+
        "INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,precondition,state,control_epoch,created_at,expires_at,worker_id,lease_epoch) " +
        "SELECT ?,d.owner_id,d.id,s.id,h.hardware_id,h.board_boot_id,?,?,?,?,"+typedPrecondition+",'queued',s.control_epoch,"+at+",min("+at+"+15000,s.mouse_until),"+
        (clearShortcutID===undefined&&!modelFocusProof?"NULL,NULL":"d.worker_id,d.lease_epoch")+mouseAdmissionJoin+" CROSS JOIN clock"+
        " WHERE d.id=? AND d.owner_id=? AND "+mouseAdmissionAuthority(at)+" AND "+capabilityEligible+
        " AND EXISTS(SELECT 1 FROM sb_frames f"+strictHeadJoin+" WHERE "+headEligible+reviewedSourceGate+")"+
        mouseAdmissionAvailable+" ON CONFLICT(owner_id,device_id,idempotency_key) DO NOTHING",
        now,...protectedBindings,
        id,kind,serialized,digest,key,'$.capabilities."'+(focused?stableASCIICapability:spotlightStableCapability)+'"',
        ...(modelFocusProof?[modelFocusProof]:[]),device,user.id,
        ...(strictSearchSource?[]:[payload.source_frame_id,payload.source_frame_id])),
      this.admissionReadback(user,device,key,false,true),
      rejection,
    ]);
    const command=saved[2].results[0] as Admission|undefined;
    if(!command) {
      const missed=saved[3].results[0] as FocusedFieldAdmissionRejection|Ready|undefined;
      if(focused&&missed&&"diagnostic_json" in missed)
        logFocusedFieldAdmissionRejection(requestID,payload.source_frame_id,missed.diagnostic_json);
      const ready=missed&&(!("ready" in missed)||missed.ready===1)?missed:undefined;
      need(ready&&typeof ready.metadata==="string","START_MOUSE_SHARING");
      const advertised=JSON.parse(ready.metadata).capabilities;
      if(linkedEnter)need(linkedAfterEnterReady(advertised),"FOCUSED_TEXT_LINKED_AFTER_ENTER_NOT_READY");
      else if(submitEnter)need(textEnterReady(advertised),"FOCUSED_TEXT_ENTER_NOT_READY");
      need(advertised[capability]===true,
        focused?"FOCUSED_TEXT_NOT_READY":probe?"SPOTLIGHT_WIRED_PROBE_NOT_READY":"SPOTLIGHT_WIRED_NOT_READY");
      if(linkedFieldSource)need(advertised[scopeBoundSource?scopeBoundCapability:extendedModelReviewedFieldCapability]===true&&advertised[stableASCIICapability]===true,
        "FOCUSED_TEXT_LINKED_AFTER_NOT_READY");
      throw new BridgeError(focused?"FIELD_FRAME_OR_CONTROL_CHANGED":"SPOTLIGHT_FRAME_OR_CONTROL_CHANGED");
    }
    need(command.digest===digest,"IDEMPOTENCY_CONFLICT");
    return command.id===id?this.awaitNewCommand(user,command,deadline):this.output(command);
  }
  async enqueueSpotlightObserved(user:User,args:Record<string,unknown>,requestID=uid(),focused=false,options:ObservationRequestOptions={}) {
    const requested=args.observe_after===undefined?true:args.observe_after;
    need(typeof requested==="boolean","INVALID_ARGUMENTS",422);
    const wait=integer(args.wait_ms??(focused?8000:2000),0,focused?12000:3000),deadline=this.waitNow()+wait;
    const result=await this.enqueueSpotlight(user,args,deadline,focused,options.requireOriginalSystemSearch,options.signal,
      options.requireOriginalSearchClear,options.modelReviewedFieldSource,options.linkedFieldSource,requestID);
    const independent=focused&&args.wait_ms===undefined&&this.waitNow()<deadline;
    return this.observeSpotlight(user,result,requested,deadline,requestID,{...options,independent});
  }

  async enqueueAuthorizedFieldObserved(user:User,args:Record<string,unknown>,requestID=uid(),options:ObservationRequestOptions={}) {
    const device=uuid(args.device_id),key=text(args.idempotency_key,120),payload=authorizedFieldText(args);
    const requested=args.observe_after===undefined?true:args.observe_after;
    need(typeof requested==="boolean","INVALID_ARGUMENTS",422);
    const wait=integer(args.wait_ms??8000,0,12000),deadline=this.waitNow()+wait;
    const settle=Math.max(payload.submit_enter?textEnterSettleMS:0,integer(args.settle_ms??300,0,2000));
    const serialized=JSON.stringify(payload),precondition=JSON.stringify({spotlight_transport:"stable_usb",
      field_input_validation:noVisualFieldProtocol,capture_min_gap_ms:settle});
    const search=options.authorizedSearch;
    const digest=await hash(focusedTextKind+":"+serialized+":"+precondition+(search?":"+search.shortcutID:""));
    const now=this.e.now(),id=uid(),at="clock.now";
    const supported=[focusedTextCapability,stableASCIICapability,noVisualFieldCapability,
      ...(payload.clear_before_input?focusedTextClearCapabilities:[])].map(reviewedPointCapSQL).join(" AND ");
    const searchFence=search?`AND ${at}<? AND EXISTS(SELECT 1 FROM sb_app_search_queries q
      JOIN sb_mouse_commands original ON original.owner_id=q.owner_id AND original.device_id=q.device_id
        AND original.idempotency_key='app-search-query:'||q.id||':shortcut'
      WHERE q.id=? AND q.owner_id=d.owner_id AND q.device_id=d.id AND q.finished_at IS NULL
        AND q.native_review_state='host:consumed' AND original.id=? AND ${confirmedSystemSearchReceiptSQL("original")}
        AND original.session_id=s.id AND original.worker_id=d.worker_id AND original.lease_epoch=d.lease_epoch
        AND original.control_epoch=s.control_epoch AND original.hardware_id=h.hardware_id AND original.board_boot_id=h.board_boot_id
        AND ${noLaterSearchInputSQL("original")})`:"";
    if(options.signal?.aborted)throw new BridgeError("FIELD_INPUT_CANCELLED");
    const saved=await this.e.db.batch<Command|Ready>([
      this.expiration({device,owner:user.id},now),
      this.e.stmt(`WITH authorized_field_clock AS MATERIALIZED (SELECT max(?,${databaseNowSQL}) AS now)
        INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,precondition,state,control_epoch,created_at,expires_at,worker_id,lease_epoch)
        SELECT ?,d.owner_id,d.id,s.id,h.hardware_id,h.board_boot_id,?,?,?,?,?,'queued',s.control_epoch,${at},min(${at}+15000,s.mouse_until),d.worker_id,d.lease_epoch
        ${mouseAdmissionJoin} CROSS JOIN authorized_field_clock AS clock
        WHERE d.id=? AND d.owner_id=? AND ${mouseAdmissionAuthority(at)} AND ${supported}
        ${payload.submit_enter?"AND "+textEnterCapabilitiesSQL("h.metadata"):""}${mouseAdmissionAvailable} ${searchFence}
        ON CONFLICT(owner_id,device_id,idempotency_key) DO NOTHING`,now,id,focusedTextKind,serialized,digest,key,precondition,device,user.id,
        ...(search?[search.until,search.preparationID,search.shortcutID]:[])),
      this.admissionReadback(user,device,key,false),
      this.readyStatement(user,device,false,key,true,now),
    ]);
    const command=saved[2].results[0] as Command|undefined;
    if(!command){
      const ready=saved[3].results[0] as Ready|undefined;
      const caps=ready?JSON.parse(ready.metadata).capabilities:undefined;
      if(payload.clear_before_input)need(caps&&textClearReady(caps),"FOCUSED_TEXT_CLEAR_NOT_READY");
      if(!caps||!noVisualFieldReady(caps))return null;
      if(payload.submit_enter)need(textEnterReady(caps),"FOCUSED_TEXT_ENTER_NOT_READY");
      throw new BridgeError(search?"APP_SEARCH_ORIGINAL_CONTROL_CHANGED":"FIELD_CONTROL_CHANGED_OR_BUSY");
    }
    if(!payload.clear_before_input&&command.kind===focusedTextKind&&
       JSON.parse(command.precondition??"{}").field_input_validation!==noVisualFieldProtocol)return null;
    need(command.digest===digest,"IDEMPOTENCY_CONFLICT");
    const result=command.id===id?await this.awaitNewCommand(user,command,deadline):this.output(command);
    return await this.observeSpotlight(user,result,requested,deadline,requestID,{...options,independent:args.wait_ms===undefined&&this.waitNow()<deadline});
  }
  async getSpotlightObserved(user:User,id:string,requestID=uid(),options:ObservationRequestOptions={}) {
    const deadline=this.waitNow()+850;
    // Confirmed-click observation is strictly read-only. The old status
    // lookup can expire pending commands, so do not call it on this path.
    const original=await this.e.stmt(`SELECT c.*,m.precondition AS click_parent_precondition,
        (SELECT r.id FROM sb_mouse_commands r WHERE c.kind='pointer.click' AND c.state='failed' AND c.input_attempted=0
          AND c.error='MOUSE_PRECONDITION_FAILED' AND r.predecessor_id=c.id AND r.owner_id=c.owner_id AND r.device_id=c.device_id
          AND r.idempotency_key=?||c.id AND json_extract(r.precondition,'$.reviewed_press.protocol')=?) AS recovery_click_command_id
      FROM sb_mouse_commands c JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id
      LEFT JOIN sb_mouse_commands m ON c.kind='pointer.click' AND m.id=c.predecessor_id
        AND m.kind='pointer.move_absolute' AND m.state='board_acked' AND m.result_digest=c.result_digest
        AND m.owner_id=c.owner_id AND m.device_id=c.device_id AND m.session_id=c.session_id
        AND m.worker_id=c.worker_id AND m.lease_epoch=c.lease_epoch AND m.control_epoch=c.control_epoch
        AND m.hardware_id=c.hardware_id AND m.board_boot_id=c.board_boot_id
      WHERE c.id=? AND c.owner_id=? AND d.revoked=0`,reviewedPressKeyPrefix,reviewedPressProtocol,uuid(id),user.id)
      .first<Command&{click_parent_precondition:string|null;recovery_click_command_id:string|null}>();
    need(original,"NOT_FOUND",404);
    need(!options.searchFocusOnly||original.kind===SYSTEM_SEARCH_KIND,"INVALID_ARGUMENTS",422);
    if(original.kind==="pointer.click"){
      if(original.recovery_click_command_id)return {...this.output(original),recovery_click_command_id:original.recovery_click_command_id,
        observation_state:"unavailable",after_screen:{state:"unavailable",reason:"REVIEWED_PRESS_ALREADY_RESERVED",app_effect_observed:false},
        image:undefined};
      const parked=await this.observeFailedReviewedPair(user,this.output(original),requestID,options);
      return parked??this.observeOriginalClick(user,original,requestID,options);
    }
    if(original.kind===SYSTEM_SEARCH_KIND){
      const result=this.output(original);
      const savedGap=integer(result.precondition?.capture_min_gap_ms??300,0,2000);
      const requestedGap=integer(options.afterCommandMinGapMS??0,0,clickRelookMaxGapMS);
      return this.observeDirectInput(user,result,true,Infinity,requestID,Math.max(savedGap,requestedGap),"system_search",options);
    }
    need(original.kind===focusedTextKind||options.afterCommandMinGapMS===undefined,"INVALID_ARGUMENTS",422);
    if(original.kind===POINTER_SCROLL_KIND){
      const result=this.output(original),receipt=result.board_receipt;
      if(result.state==="board_acked"&&(original.result_digest===null||original.input_attempted===0||
        receipt?.command_id!==result.command_id||receipt?.board_boot_id!==result.board_boot_id||
        receipt?.state!=="executed"||(receipt?.subcommand_index!=null&&receipt.subcommand_index!==0)||
        receipt?.error!=null||receipt?.effect?.hid_reports_sent!==true)){
        return {...result,observation_state:"unavailable",
          after_screen:{state:"unavailable",reason:"AFTER_IMAGE_PROOF_MISSING",app_effect_observed:false},image:undefined};
      }
      const minGap=integer(result.precondition?.capture_min_gap_ms??legacyScrollAfterGapMS,0,2000);
      return this.observeDirectInput(user,result,true,Infinity,requestID,minGap,"scroll",options);
    }
    // Preserve the existing expiry behavior for pending nonclick commands.
    const result=pending.has(original.state)?await this.get(user,id):this.output(original);
    const independent=result.kind===focusedTextKind||result.kind===DRAG_KIND;
    if(result.kind===DRAG_KIND)return this.observeDrag(user,result,true,deadline,requestID,{...options,independent});
    return this.observeSpotlight(user,result,true,deadline,requestID,{...options,independent});
  }
  async readUnsubmittedPointReview(user:User,id:string,requestID:string,signal:AbortSignal) {
    // A failed preflight can leave the selected pixels obsolete without any
    // device input. Reuse the ordinary live view and its standard proof gate.
    const previous=await this.e.stmt(`SELECT m.*,s.broadcast_id FROM sb_mouse_commands k
      JOIN sb_mouse_commands m ON m.id=k.predecessor_id
      JOIN sb_devices d ON d.id=m.device_id AND d.owner_id=m.owner_id
      JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id
      JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
      WHERE k.id=? AND k.owner_id=? AND k.kind='pointer.click' AND m.kind='pointer.move_absolute'
        AND k.state='failed' AND k.error='POINT_CLICK_NOT_SUBMITTED' AND k.input_attempted=0
        AND m.state='failed' AND m.error='MOUSE_PRECONDITION_FAILED' AND m.input_attempted=0
        AND k.result_digest=m.result_digest AND m.result_digest IS NOT NULL
        AND k.owner_id=m.owner_id AND k.device_id=m.device_id AND k.session_id=m.session_id
        AND k.worker_id=m.worker_id AND k.lease_epoch=m.lease_epoch AND k.control_epoch=m.control_epoch
        AND k.hardware_id=m.hardware_id AND k.board_boot_id=m.board_boot_id
        AND json_extract(m.precondition,'$.point.protocol')='${PAIRED_MOUSE_POINT}'
        AND json_extract(m.precondition,'$.point.click_command_id')=k.id
        AND json_extract(m.precondition,'$.point_source.protocol')='${scopeBoundLinkedPointProtocol}'
        AND json_extract(m.precondition,'$.point_source.origin') IN ('visual_read','linked_text','typed')
        AND m.created_at>max(?,${databaseNowSQL})-${reviewedPressOriginalLifetimeMS}
        AND ${mouseAdmissionAuthority(databaseNowSQL)} AND ${reviewedPointCapSQL(visualReadPointCapability)}
        AND m.session_id=s.id AND m.control_epoch=s.control_epoch
        AND m.worker_id=d.worker_id AND m.lease_epoch=d.lease_epoch
        AND m.hardware_id=h.hardware_id AND m.board_boot_id=h.board_boot_id
        AND ${noLaterSearchInputSQL("m",["k.id"])}`,id,user.id,this.e.now()).first<Command&{broadcast_id:string}>();
    if(!previous||signal.aborted)return;
    const request=record(JSON.parse(previous.precondition!)),origin=record(request.point_query_origin??{});
    if(typeof origin.frame!=="string"||typeof origin.captureLower!=="number"||typeof origin.sourceSeq!=="number")return;
    const {result}=await this.e.readScreenWithReleaseRetry(user,{device_id:previous.device_id,wait_for_new_ms:0},requestID);
    if(signal.aborted)return;
    const source=result[visualPointEvidence]?.source;
    if(!source||result.state!=="available"||!result.image||source.frame===origin.frame||
      source.captureLower<=Math.max(origin.captureLower,previous.created_at)||source.sourceSeq<=origin.sourceSeq||
      source.device!==previous.device_id||source.session!==previous.session_id||source.broadcast!==previous.broadcast_id||
      source.worker!==previous.worker_id||source.lease!==previous.lease_epoch||source.control!==previous.control_epoch||
      source.hardware!==previous.hardware_id||source.boot!==previous.board_boot_id||
      result.metadata?.orientation_epoch!==request.orientation_epoch)return;
    return {result,move:{command_id:previous.id,state:previous.state,error:previous.error,input_attempted:false}};
  }
  private async observeFailedReviewedPair(user:User,failed:ReturnType<MouseControl["output"]>,requestID:string,
    options:ObservationRequestOptions,deadline=this.waitNow()+directAfterImageWaitMS) {
    if(failed.state!=="failed"||failed.error!=="MOUSE_PRECONDITION_FAILED"||failed.input_not_submitted!==true||
       !failed.predecessor_command_id||options.signal?.aborted||this.waitNow()>=deadline)return;
    const now=this.e.now();
    const original=await this.e.stmt(`SELECT m.* FROM sb_mouse_commands k
      JOIN sb_mouse_commands m ON m.id=k.predecessor_id
      JOIN sb_devices d ON d.id=k.device_id AND d.owner_id=k.owner_id
      JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id
      JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
      WHERE k.id=? AND k.owner_id=? AND m.created_at>max(?,${databaseNowSQL})-${reviewedPressOriginalLifetimeMS}
        AND ${failedReviewedPairSQL("m","k")} AND ${mouseAdmissionAuthority(databaseNowSQL)}
        AND ${reviewedPointCapSQL(reviewedPressCapability)} AND m.session_id=s.id AND m.control_epoch=s.control_epoch
        AND m.worker_id=d.worker_id AND m.lease_epoch=d.lease_epoch AND m.hardware_id=h.hardware_id AND m.board_boot_id=h.board_boot_id
        AND ${noLaterSearchInputSQL("m",["k.id"])}
        AND NOT EXISTS(SELECT 1 FROM sb_mouse_commands recovery WHERE recovery.predecessor_id=k.id)
        AND NOT EXISTS(SELECT 1 FROM sb_browse_runs r JOIN sb_browse_leases l ON l.run_id=r.id
          WHERE r.owner_id=d.owner_id AND r.device_id=d.id AND r.session_id=s.id AND r.control_epoch=s.control_epoch
          AND l.expires_at>=m.created_at)`,failed.command_id,user.id,now).first<Command>();
    if(!original)return;
    const observed=await this.observe(user,this.output(original),true,deadline,requestID,
      options.afterCommandMinGapMS??0,directAfterImageWaitMS,undefined,options.registerRelease,false,undefined,
      {strictDeadline:true,action:true,signal:options.signal,currentInput:{kind:"parked_move",hardware:original.hardware_id,boot:original.board_boot_id}});
    return {...failed,move_command_id:original.id,parked_move_observed:true,
      after_screen:observed.after_screen,observation_state:observed.observation_state,image:observed.image};
  }
  private observeOriginalClick(user:User,original:Command&{click_parent_precondition:string|null},
    requestID:string,options:ObservationRequestOptions){
    const result=this.output(original);
    const requestedGap=integer(options.afterCommandMinGapMS??0,0,clickRelookMaxGapMS);
    let originalGap=0;
    if(result.state==="board_acked"){
      const receipt=result.board_receipt,parent=original.click_parent_precondition;
      const press=record(result.precondition?.reviewed_press??{});
      const recovered=press.protocol===reviewedPressProtocol&&press.original_click_id===original.predecessor_id;
      const validPair=recovered||!original.predecessor_id||pointSpec(parent)?.click_command_id===result.command_id;
      if(!validPair||original.result_digest===null||original.input_attempted===0||
        receipt?.command_id!==result.command_id||receipt?.board_boot_id!==result.board_boot_id||
        receipt?.state!=="executed"||(receipt?.subcommand_index!=null&&receipt.subcommand_index!==0)||receipt?.error!=null||
        receipt?.effect?.hid_reports_sent!==true){
        return {...result,observation_state:"unavailable",
          after_screen:{state:"unavailable",reason:"AFTER_IMAGE_PROOF_MISSING",app_effect_observed:false},image:undefined};
      }
      if(recovered)originalGap=integer(press.capture_min_gap_ms,0,2000);
      else if(parent)originalGap=integer(JSON.parse(parent).point_capture_min_gap_ms??0,0,2000);
    }
    return this.observe(user,result,true,this.waitNow()+directAfterImageWaitMS,requestID,
      Math.max(originalGap,requestedGap),directAfterImageWaitMS,undefined,options.registerRelease,false,undefined,
      {strictDeadline:true,action:true,signal:options.signal,snapshotOnly:options.snapshotOnly,currentInput:{kind:"click",hardware:result.hardware_id,boot:result.board_boot_id}});
  }
  async enqueueDragObserved(user:User,args:Record<string,unknown>,requestID=uid(),options:ObservationRequestOptions={}){
    const requested=args.observe_after===undefined?true:args.observe_after;
    need(typeof requested==="boolean","INVALID_ARGUMENTS",422);
    need(!options.signal?.aborted,"DRAG_REQUEST_ABORTED");
    const wait=integer(args.wait_ms??6000,0,10000),deadline=this.waitNow()+wait;
    const now=this.e.now(),expires=now+5000;
    const drag=absoluteDragRequest(args),key=text(args.idempotency_key,120),id=uid();
    const serialized=JSON.stringify(drag.payload),intentJSON=JSON.stringify(drag.intent);
    const digest=await hash(DRAG_KIND+":"+serialized+":"+intentJSON);
    const at="(SELECT now FROM request)",intent="(SELECT intent FROM request)",device=drag.device;
    const saved=await this.e.db.batch<Admission|DragAdmissionRejection>([
      this.expiration({device,owner:user.id},now),
      this.e.stmt(`WITH request AS (SELECT max(?,${databaseNowSQL}) AS now,? AS intent)
        INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,precondition,state,control_epoch,created_at,expires_at)
        SELECT ?,d.owner_id,d.id,s.id,h.hardware_id,h.board_boot_id,'${DRAG_KIND}',?,?,?,
          json_patch(json_patch(json_patch(${intent},json_object('capture_width',json_extract(f.metadata,'$.native_width_px'),
            'capture_height',json_extract(f.metadata,'$.native_height_px'),'orientation',json_extract(f.metadata,'$.orientation'))),
            CASE WHEN json_type(h.metadata,'$.capabilities."${DRAG_MODEL_DECISION_CAPABILITY}"')='true'
              THEN json_object('drag_review_mode','${DRAG_MODEL_DECISION_MODE}') ELSE '{}' END),
            CASE WHEN json_type(h.metadata,'$.capabilities."${DRAG_CLOUD_SOURCE_CAPABILITY}"')='true'
              AND json_type(h.metadata,'$.capabilities."${DRAG_MODEL_DECISION_CAPABILITY}"')='true'
              THEN json_object('drag_source_confirmation','${DRAG_CLOUD_SOURCE_CONFIRMATION}',
                'drag_source_sha256',CASE WHEN f.frame_id=json_extract(${intent},'$.source_frame_id')
                  THEN f.sha256 ELSE ${reviewedPointSourceHashSQL} END) ELSE '{}' END),
          'queued',s.control_epoch,${at},min(?,s.mouse_until)
        ${mouseAdmissionJoin} JOIN sb_frames f ON f.device_id=d.id${dragReviewJoinsSQL(intent)}
        WHERE d.id=? AND d.owner_id=? AND ${at}<? AND ${mouseAdmissionAuthority(at)}
          AND (${dragLiveCapabilities}) AND ${dragReviewedHeadSQL(at,intent)}${mouseAdmissionAvailable}
        ON CONFLICT(owner_id,device_id,idempotency_key) DO NOTHING`,
        now,intentJSON,id,serialized,digest,key,expires,device,user.id,expires),
      this.admissionReadback(user,device,key,false,true),
      this.e.stmt(dragAdmissionRejectionSQL(databaseNowSQL,mouseAdmissionAuthority,dragCapabilities,mouseAdmissionFences),
        now,intentJSON,device,user.id,key,expires),
    ]);
    const command=saved[2].results[0] as Admission|undefined;
    if(!command){
      const rejection=saved[3].results[0] as DragAdmissionRejection|undefined;
      if(rejection)logDragAdmissionRejection(requestID,device,drag.intent.source_frame_id,rejection.diagnostic_json);
      need(rejection?.ready===1,"START_MOUSE_SHARING");
      need(rejection.capabilities_ready===1,"DRAG_NOT_READY");
      let snapshot:Record<string,unknown>|null=null;
      try { snapshot=JSON.parse(rejection.diagnostic_json); } catch {}
      throw new InputAdmissionError("DRAG_FRAME_OR_CONTROL_CHANGED",{
        diagnostic_timing:"admission_batch",source_frame_id:drag.intent.source_frame_id,
        coordinate_space:drag.intent.coordinate_space,
        coordinates:{from_x:drag.intent.source_from_x,from_y:drag.intent.source_from_y,
          to_x:drag.intent.source_to_x,to_y:drag.intent.source_to_y},
        snapshot,
      });
    }
    need(command.digest===digest,"IDEMPOTENCY_CONFLICT");
    const result=command.id===id?await this.awaitNewCommand(user,command,deadline):this.output(command);
    return this.observeDrag(user,result,requested,deadline,requestID,
      {...options,independent:args.wait_ms===undefined&&this.waitNow()<deadline});
  }
  private observeDrag(user:User,result:Awaited<ReturnType<MouseControl["get"]>>,requested:boolean,
    deadline:number,requestID:string,options:ObservationRequestOptions){
    const afterDeadline=Math.min(options.independent?Infinity:deadline,this.waitNow()+directAfterImageWaitMS);
    return this.observe(user,result,requested,afterDeadline,requestID,
      integer(result.precondition?.capture_min_gap_ms??DRAG_CAPTURE_GAP_MS,0,2000),directAfterImageWaitMS,undefined,
      options.registerRelease,false,undefined,{strictDeadline:true,action:true,signal:options.signal,
        currentInput:{kind:"drag",hardware:result.hardware_id,boot:result.board_boot_id}});
  }
  private async observeSpotlight(user:User,result:Awaited<ReturnType<MouseControl["get"]>>,requested:boolean,deadline:number,requestID:string,options:ObservationRequestOptions) {
    if(requested&&result.state==="board_acked"&&result.kind===focusedTextKind){
      const submitEnter=result.payload.submit_enter===true,typed=result.text_input,boot=typed?.restored_mouse_boot_id;
      if(submitEnter&&(typed?.transport!=="stable_usb"||typed?.enter_sent!==true||boot!==result.board_boot_id)){
        return {...result,observation_state:"unavailable",
          after_screen:{state:"unavailable",reason:"SAME_BOOT_TEXT_ENTER_RELEASE_REQUIRED",app_effect_observed:false},image:undefined};
      }
      if(result.payload.clear_before_input===true&&
         (typed?.transport!=="stable_usb"||typed?.clear_sent!==true||boot!==result.board_boot_id)){
        return {...result,observation_state:"unavailable",
          after_screen:{state:"unavailable",reason:"SAME_BOOT_TEXT_CLEAR_RELEASE_REQUIRED",app_effect_observed:false},image:undefined};
      }
      if(typed?.mouse_mode_confirmed!==true||typeof boot!=="string")return {...result,observation_state:"unavailable",
        after_screen:{state:"unavailable",reason:"MOUSE_RESTORE_RECHECK_REQUIRED",app_effect_observed:false},image:undefined};
      // The screenshot transaction checks that the authenticated receipt's
      // restored board and control scope are still current.
      const afterDeadline=Math.min(options.independent?Infinity:deadline,this.waitNow()+directAfterImageWaitMS);
      const savedGap=integer(result.precondition?.capture_min_gap_ms??0,0,2000);
      const requestedGap=integer(options.afterCommandMinGapMS??0,0,clickRelookMaxGapMS);
      const minGap=Math.max(submitEnter?textEnterSettleMS:0,savedGap,requestedGap);
      return this.observe(user,result,true,afterDeadline,requestID,minGap,
        directAfterImageWaitMS,undefined,options.registerRelease,false,undefined,
        {strictDeadline:true,action:true,signal:options.signal,snapshotOnly:options.snapshotOnly,currentInput:{kind:"focused_text",hardware:result.hardware_id,boot}});
    }
    if(requested&&result.state==="board_acked"&&
       (result.kind!==spotlightKind||result.spotlight?.transport!=="stable_usb"||result.spotlight?.mouse_mode_confirmed!==true)) {
      return {...result,observation_state:"unavailable",
        after_screen:{state:"unavailable",reason:"SAME_BOOT_MOUSE_RELEASE_REQUIRED",app_effect_observed:false},image:undefined};
    }
    return this.observe(user,result,requested,deadline,requestID,0,850);
  }
  /** One owner-checked expiry+snapshot transaction, shared by typed plan reads. */
  ownedCommandStatements(user:User,id:string) {
    const command=uuid(id),now=this.e.now();
    return [
      this.expiration({command,owner:user.id},now),
      this.e.stmt("SELECT c.* FROM sb_mouse_commands c JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id WHERE c.id=? AND c.owner_id=? AND d.revoked=0",command,user.id),
    ];
  }
  async ownedCommand(user: User, id: string) {
    const result=await this.e.db.batch<Command & {idempotency_key:string}>(this.ownedCommandStatements(user,id));
    const current=result[1].results[0];need(current,"NOT_FOUND",404);
    return current;
  }
  ownedDeviceExpiration(user:User,device:string){return this.expiration({device:uuid(device),owner:user.id},this.e.now());}
  async enqueueObserved(user:User,kind:string,args:Record<string,unknown>,requestID=uid(),options:ObservationRequestOptions={}){
    const requested=args.observe_after===undefined?true:args.observe_after;
    need(typeof requested==="boolean","INVALID_ARGUMENTS",422);
    const wait=integer(args.wait_ms??2000,0,3000),deadline=this.waitNow()+wait;
    const input={...args};delete input.observe_after;
    const minGap=integer(args.settle_ms??(kind===SYSTEM_SEARCH_KIND?300:0),0,2000);
    delete input.settle_ms;
    if(kind===SYSTEM_SEARCH_KIND||kind===POINTER_SCROLL_KIND)input.capture_min_gap_ms=minGap;
    const admission=kind===SYSTEM_SEARCH_KIND&&options.cancelSystemSearchBeforeAdmission?
      {signal:options.signal,onExtendedModelField:options.onExtendedModelField}:undefined;
    const result=await this.enqueue(user,kind,input,deadline,undefined,undefined,admission);
    if(kind===POINTER_SCROLL_KIND||kind===SYSTEM_SEARCH_KIND){
      const independent=args.wait_ms===undefined&&(kind===SYSTEM_SEARCH_KIND?
        result.state==="board_acked":this.waitNow()<deadline);
      return this.observeDirectInput(user,result,requested,independent?Infinity:deadline,requestID,minGap,
        kind===SYSTEM_SEARCH_KIND?"system_search":"scroll",options);
    }
    return this.observe(user,result,requested,deadline,requestID,minGap);
  }
  private observeDirectInput(user:User,result:Awaited<ReturnType<MouseControl["get"]>>,requested:boolean,deadline:number,
    requestID:string,minGap:number,kind:"scroll"|"system_search",options:ObservationRequestOptions){
    return this.observe(user,result,requested,Math.min(deadline,this.waitNow()+directAfterImageWaitMS),requestID,
      minGap,directAfterImageWaitMS,undefined,options.registerRelease,false,undefined,
      {strictDeadline:true,action:true,signal:options.signal,snapshotOnly:options.snapshotOnly,currentInput:{kind,hardware:result.hardware_id,boot:result.board_boot_id}});
  }
  private async observe(user:User,result:Awaited<ReturnType<MouseControl["enqueue"]>>,requested:boolean,deadline:number,requestID:string,minGap:number,limit=600,readSnapshot?:AfterImageRead,registerRelease?:RegisterClickAfterRelease,recoverTimeout=false,afterTiming?:ClickAfterImageTiming,options:ActionObservationOptions={}){
    const strictObservationDeadline=options.strictDeadline===true,actionObservation=options.action===true;
    const ageLimit=actionObservation?actionAfterImageAgeLimitMS:liveFrameAgeLimitMS;
    const finish=(observation:{state:string;[key:string|symbol]:unknown},image?:string)=>({...result,observation_state:observation.state,
      after_screen:{...observation,app_effect_observed:false} as {state:string;app_effect_observed:false;[key:string]:unknown},image});
    if(!requested)return finish({state:"not_requested"});
    if(pending.has(result.state))return finish({state:"pending_input",reason:"WAITING_COMMAND_RESULT"});
    if(result.state!=="board_acked")return finish({state:"unavailable",reason:"INPUT_NOT_CONFIRMED"});
    if(!result.receipt_observation.valid_for_capture_order)return finish({state:"unavailable",reason:"COMMAND_CLOCK_UNAVAILABLE"});
    const observationStarted=this.waitNow(),remaining=Math.max(0,Math.floor(deadline-observationStarted));
    const signal=options.signal??this.shadowSignal;
    let observationExpired=false;
    const observationOpen=()=>!observationExpired&&this.waitNow()<deadline&&!signal?.aborted;
    const strictDeadline=strictObservationDeadline?{remainingMS:()=>observationOpen()?deadline-this.waitNow():0,
      signal,expire:()=>{observationExpired=true;}}:undefined;
    const unavailableTiming=()=>{
      const attempt_timing=afterTiming?.snapshot(false);
      return attempt_timing?{recovery:{attempt_timing}}:{};
    };
    const exhausted=()=>finish({state:"budget_exhausted",reason:"OBSERVATION_BUDGET_EXHAUSTED",...unavailableTiming()});
    if((remaining===0&&!readSnapshot)||(strictObservationDeadline&&!observationOpen()))return exhausted();
    const observationBudget=options.snapshotOnly?0:Math.min(limit,remaining);
    const args={device_id:result.device_id,after_command_id:result.command_id,after_command_min_gap_ms:minGap,wait_for_new_ms:observationBudget};
    const render=(screen:Awaited<ReturnType<BridgeEngine["readScreen"]>>)=>{
      const proof=screen.after_command && typeof screen.after_command==="object"&&!Array.isArray(screen.after_command)?screen.after_command as Record<string,unknown>:null;
      const metadata=screen.metadata,scope=result.receipt_observation.scope,age=metadata?.age_ms,capture=metadata?.capture_lower_phone_mono_ms;
      const exactActionProof=(options.currentInput?.kind!=="click"&&options.currentInput?.kind!=="system_search"&&options.currentInput?.kind!=="parked_move")||
        (proof?.command_state==="board_acked"&&proof?.phone_ack_mono_ms===result.receipt_observation.phone_ack_mono_ms&&
          proof?.capture_lower_phone_mono_ms===capture&&proof?.minimum_gap_ms===minGap);
      const qualified=typeof screen.image==="string"&&proof?.command_id===result.command_id&&proof?.relation==="capture_after_phone_board_ack"&&proof?.scope_matches_at_snapshot===true&&proof?.app_effect_observed===false&&
        exactActionProof&&
        typeof age==="number"&&age>=0&&age<ageLimit&&metadata?.device_id===result.device_id&&metadata?.bridge_session_id===result.bridge_session_id&&
        metadata?.worker_id===scope.worker_id&&metadata?.worker_id_at_read===scope.worker_id&&metadata?.lease_epoch===scope.lease_epoch&&metadata?.control_epoch_at_read===result.control_epoch&&metadata?.capture_clock_verified===true&&
        typeof capture==="number"&&Number.isFinite(capture)&&capture>result.receipt_observation.phone_ack_mono_ms!+minGap;
      if(screen.state==="unchanged"||(screen.state==="available"&&!qualified)){
        return finish({state:"unavailable",reason:"AFTER_IMAGE_PROOF_MISSING",wait_budget_ms:observationBudget,...unavailableTiming()});
      }
      // Only a terminal same-scope transient miss may expose the frame
      // identifiers seen earlier. Scope or authorization loss redacts them.
      const transient=["frame_too_old","frame_expired","before_command_receipt","no_frame","no_newer_capture"];
      const showFrames=screen.trace?.retry_budget_exhausted===true&&transient.includes(String(screen.trace.miss))&&
        (screen.trace.timeout_successor_result==null||transient.includes(String(screen.trace.timeout_successor_result)));
      const attempt_timing=screen.state==="available"?undefined:afterTiming?.snapshot(showFrames);
      return finish({state:screen.state,reason:screen.reason??null,image_ref:screen.image_ref??null,metadata:screen.metadata??null,
        [visualPointEvidence]:screen[visualPointEvidence],
        after_command:proof,wait_budget_ms:observationBudget,...(actionObservation?{age_limit_ms:ageLimit}:{}),
        recovery:{lookups:screen.trace?.lookups??0,retry_count:screen.trace?.retry_count??0,retry_trigger:screen.trace?.retry_trigger??null,failure:screen.trace?.miss??null,retry_wait_ms:screen.trace?.retry_wait_ms??0,budget_exhausted:screen.trace?.retry_budget_exhausted??false,
          ...(screen.trace?.timeout_successor_result?{timeout_successor_result:screen.trace.timeout_successor_result}:{}),
          ...(attempt_timing?{attempt_timing}:{}),
          ...(screen.trace?.frame_commit_advance_ms?{frame_commit_advance_ms:screen.trace.frame_commit_advance_ms}:{})}},
        screen.state==="available"?screen.image:undefined);
    };
    try{
      // A read-only barrier: never asks for capture, resubmits an action or
      // clicks after movement. A remote lookup already started may finish late.
      const read=(readSignal?:AbortSignal)=>readSnapshot?readSnapshot(observationBudget,requestID,true,readSignal):
        actionObservation?this.e.readActionAfterScreen(user,args,requestID,{timing:afterTiming,signal:readSignal,currentInput:options.currentInput}):this.e.readScreen(user,args,1,true,requestID);
      const screen=await (strictDeadline?beforeImageObservationDeadline(strictDeadline,read):read());
      if(!screen)return exhausted();
      if(strictObservationDeadline&&screen.state==="available"&&!observationOpen())return exhausted();
      if(remaining===0&&screen.state!=="available")return exhausted();
      const original=render(screen);
      if(recoverTimeout&&original.after_screen.state==="unavailable"){
        const receipt=result.receipt_observation;
        const recovery=await this.e.recoverPairedClickAfterTimeout(user,args,requestID,screen,
          {...receipt.scope,control_epoch:result.control_epoch,phone_ack_mono_ms:receipt.phone_ack_mono_ms,
            hardware_id:result.hardware_id,board_boot_id:result.board_boot_id},()=>deadline-this.waitNow(),afterTiming);
        if(recovery){
          const replacement=render(recovery.screen);
          if(recovery.withinDeadline&&replacement.image)registerRelease?.({withinDeadline:recovery.withinDeadline,enforceDeadline:true});
          return replacement;
        }
      }
      if(registerRelease&&original.after_screen.state==="available"){
        const observationDeadline=options.snapshotOnly?deadline:Math.min(deadline,observationStarted+observationBudget);
        const observationRemaining=()=>strictDeadline&&strictDeadline.remainingMS()<=0?0:observationDeadline-this.waitNow();
        const paired=recoverTimeout||strictObservationDeadline?{overallRemainingMS:strictDeadline?.remainingMS??(()=>deadline-this.waitNow()),hardware:result.hardware_id,
          boot:options.currentInput?.boot??result.board_boot_id,signal,timing:afterTiming,currentInput:options.currentInput}:undefined;
        const {retry,withinDeadline}=this.e.prepareActionAfterReleaseRetry(user,args,requestID,screen,observationRemaining,paired);
        if(retry||strictObservationDeadline)registerRelease({
          withinDeadline:strictObservationDeadline?()=>observationOpen()&&withinDeadline():withinDeadline,
          enforceDeadline:strictObservationDeadline?true:undefined,observationDeadline:strictDeadline,retry:retry?async(afterSerialization)=>{
          const recover=()=>retry(afterSerialization);
          const next=await (strictDeadline?beforeImageObservationDeadline(strictDeadline,recover):recover());
          if(!next||record(next.after_command??{}).phone_ack_mono_ms!==result.receipt_observation.phone_ack_mono_ms)return null;
          const {after_screen,observation_state,image}=render(next);
          return after_screen.state==="available"&&image?{after_screen,observation_state,image}:null;
        }:undefined});
      }
      return original;
    }catch(error){
      // Input may already have happened. Losing its receipt because a later
      // read failed would encourage a duplicate action; retain the exact result.
      return finish({state:"error",reason:error instanceof BridgeError?error.code:"OBSERVATION_UNAVAILABLE",command_result_retained:true,wait_budget_ms:observationBudget,...unavailableTiming()});
    }
  }
  async clickAt(user:User,args:Record<string,unknown>,requestID=uid(),timing?:Pick<McpPerformance,"measure">,registerRelease?:RegisterClickAfterRelease,signal?:AbortSignal,
    reviewedPointOrigin?:ReviewedPointOrigin){
    this.shadowEnabled=args.observe_after!==false&&args.after_ready_cue===undefined&&(args.settle_ms??300)===300&&(args.wait_ms??6000)===6000;
    this.shadowSignal=signal;
    try{return await this.clickAtCore(user,args,requestID,timing,registerRelease,reviewedPointOrigin);}
    finally{try{this.shadowTicket?.close();}catch{}this.shadowTicket=undefined;this.shadowEnabled=false;this.shadowSignal=undefined;}
  }
  private async clickAtCore(user:User,args:Record<string,unknown>,requestID=uid(),timing?:Pick<McpPerformance,"measure">,registerRelease?:RegisterClickAfterRelease,
    reviewedPointOrigin?:ReviewedPointOrigin){
    // This is one model/tool handoff, but two existing phone commands. No
    // local vision gate or extra decision is silently represented as complete.
    const requested=args.observe_after===undefined?true:args.observe_after;need(typeof requested==="boolean","INVALID_ARGUMENTS",422);
    const cue=readyCue(args.after_ready_cue);
    need(!cue||requested,"INVALID_READY_CUE",422);
    if(args.resume_failed_click_command_id!==undefined){
      need(!cue&&reviewedPointOrigin===undefined&&args.source_query_proof===undefined,"INVALID_ARGUMENTS",422);
      need(!isParkedPressSelector(uuid(args.source_frame_id)),"INVALID_PARKED_PRESS_CONTINUATION",422);
      return this.resumeReviewedPress(user,args,requested,requestID,registerRelease);
    }
    need(args.resume_cursor_x===undefined&&args.resume_cursor_y===undefined,"INVALID_ARGUMENTS",422);
    const minGap=integer(args.settle_ms??300,0,2000),wait=integer(args.wait_ms??6000,0,10000),deadline=this.waitNow()+wait;
    const sourceFrameID=args.source_frame_id===undefined?undefined:uuid(args.source_frame_id);
    const crops=reviewedPointCrops(args,sourceFrameID);
    if(sourceFrameID&&isParkedPressSelector(sourceFrameID)){
      need(!cue&&crops&&reviewedPointOrigin===undefined&&args.source_query_proof===undefined&&args.source_point_proof===undefined,
        "INVALID_PARKED_PRESS_CONTINUATION",422);
      const device=uuid(args.device_id);
      const saved=await this.e.resolveParkedPressSelector(user,device,sourceFrameID);
      need(saved,"REVIEWED_PRESS_SOURCE_PROOF_INVALID");
      const original=absoluteMouseRequest({x:saved.geometry.source_x,y:saved.geometry.source_y,
        image_width:saved.geometry.source_width,image_height:saved.geometry.source_height,orientation_epoch:saved.geometry.orientation_epoch}).intent;
      const input=absoluteMouseRequest(args).intent;
      need(input.source_width===original.source_width&&input.source_height===original.source_height&&
        input.orientation_epoch===original.orientation_epoch,"REVIEWED_PRESS_FRAME_OR_CONTROL_CHANGED");
      const normalized=input.source_x>0&&input.source_x<1&&input.source_y>0&&input.source_y<1;
      const cursorX=normalized?input.source_x*(input.source_width-1):input.source_x;
      const cursorY=normalized?input.source_y*(input.source_height-1):input.source_y;
      const target=reviewedPointRegion(record(saved.geometry.point_source).target_region);
      return this.resumeReviewedPress(user,{...args,source_frame_id:saved.proof.frame,resume_failed_click_command_id:saved.proof.command,
        resume_cursor_x:cursorX,resume_cursor_y:cursorY,x:original.source_x,y:original.source_y},
        requested,requestID,registerRelease,{proof:saved.proof,target,normalized});
    }
    const searchOriginID=reviewedPointOrigin===undefined?undefined:uuid(reviewedPointOrigin.systemSearchCommandID);
    if(sourceFrameID!==undefined)uuid(args.device_id);
    need(searchOriginID===undefined||sourceFrameID!==undefined,"REVIEWED_POINT_SOURCE_REQUIRED",422);
    const requestVisualProof=args.source_point_proof!==undefined;
    const coordinateProof=this.ordinaryClickGeometryOnly&&!!sourceFrameID&&searchOriginID===undefined;
    need(!requestVisualProof||args.source_query_proof===undefined,"INVALID_ARGUMENTS",422);
    let queryProof:ReviewedPointProof|undefined;
    let visualLookup:Awaited<ReturnType<BridgeEngine["resolveVisualReadPointProof"]>>|undefined;
    if(args.source_query_proof!==undefined){
      need((crops||coordinateProof)&&sourceFrameID&&searchOriginID===undefined,"COMPOUND_QUERY_POINT_SOURCE_REQUIRED",422);
      const verified=await this.e.resolveReleasedPointProof(user,text(args.source_query_proof,2048));
      need(verified&&verified.frame===sourceFrameID&&verified.device===uuid(args.device_id),"COMPOUND_QUERY_VIEW_PROOF_INVALID");
      queryProof=verified;
    }else if((crops||coordinateProof)&&sourceFrameID&&searchOriginID===undefined){
      const device=uuid(args.device_id),explicit=requestVisualProof?text(args.source_point_proof,2048):undefined;
      visualLookup=await this.e.resolveVisualReadPointProof(user,device,sourceFrameID,explicit,this.shadowSignal);
      const verified=visualLookup.proof;
      if(coordinateProof&&!requestVisualProof&&!verified&&
        !["released_frame_not_found","capability_missing","signer_unavailable"].includes(visualLookup.reason)) {
        throw new InputAdmissionError("VISUAL_READ_POINT_PROOF_INVALID",{
          source_frame_id:sourceFrameID,source_age_ms:visualLookup.sourceAgeMS??null,
          visual_proof_resolved:false,visual_proof_lookup:visualLookup.reason,
          diagnostic_timing:"proof_resolution",conditions:null,
        });
      }
      if(requestVisualProof&&!verified)logPairedClickDiagnostic({event:"reviewed_point_admission_rejected",
        request_id:requestID,source_frame_id:sourceFrameID,source_age_ms:visualLookup.sourceAgeMS??null,explicit_visual_proof:true,
        visual_proof_resolved:false,visual_proof_lookup:visualLookup.reason,reason:"VISUAL_READ_POINT_PROOF_INVALID"});
      need(!requestVisualProof||verified,"VISUAL_READ_POINT_PROOF_INVALID");
      queryProof=verified??undefined;
    }else if(requestVisualProof){
      throw new BridgeError("VISUAL_READ_POINT_SOURCE_REQUIRED",422);
    }
    let moveArgs=args,exactHeadCenter=false;
    const reportCenterRejection=(reason:string)=>logPairedClickDiagnostic({event:"reviewed_point_center_rejected",
      request_id:requestID,source_frame_id:sourceFrameID??null,reason,
      visual_proof_lookup:visualLookup?.reason??"not_requested"});
    if(crops&&args.x===0&&args.y===0&&searchOriginID===undefined){
      if(!queryProof){
        // A missing implicit ledger entry can use only the exact live frame.
        // Expired or rejected proofs retain their original refusal.
        exactHeadCenter=this.ordinaryClickGeometryOnly&&!requestVisualProof&&visualLookup?.reason==="released_frame_not_found";
        if(!exactHeadCenter){
          reportCenterRejection("released_proof_required");
          throw new BridgeError("REVIEWED_TARGET_CENTER_REQUIRES_RELEASED_IMAGE");
        }
      }
      const {source_width:width,source_height:height}=absoluteMouseRequest(args).intent;
      const target=crops.target_region;
      moveArgs={...args,x:(target.x+target.width/2)*(width-1),y:(target.y+target.height/2)*(height-1)};
    }
    const key=await clickAtKey(args.idempotency_key);
    const phase=requested&&!cue&&minGap===300&&wait===6000?new PairedClickPhaseTiming(this.e.now()):undefined;
    const enqueueMove=async()=>{
      try{
        return await this.enqueue(user,"pointer.move_absolute",{...moveArgs,idempotency_key:key+":move",wait_ms:Math.min(3000,wait)},deadline,undefined,
          {clickKey:key+":click",captureMinGapMS:requested?minGap:0,readyCue:cue,phase,sourceFrameID,searchOriginID,signal:this.shadowSignal,crops,queryProof,
            ...(this.ordinaryClickGeometryOnly&&sourceFrameID&&searchOriginID===undefined?{geometryOnly:true as const}:{}),
            ...(exactHeadCenter?{exactHeadCenter:true as const}:{})});
      }catch(error){
        if(error instanceof BridgeError&&error.code==="REVIEWED_TARGET_CENTER_REQUIRES_RELEASED_IMAGE")
          reportCenterRejection("exact_accepted_head_unavailable");
        if(error instanceof BridgeError&&error.code==="REVIEWED_POINT_TARGET_MARGIN"&&crops&&sourceFrameID){
          const {source_x:x,source_y:y,source_width:width,source_height:height}=absoluteMouseRequest(moveArgs).intent;
          const target=crops.target_region;
          const dx=width-1,dy=height-1;
          logPairedClickDiagnostic({event:"reviewed_point_admission_rejected",request_id:requestID,
            source_frame_id:sourceFrameID,reason:error.code,center_requested:moveArgs!==args,image_width:width,image_height:height,
            minimum_margin_px:Math.min(x-target.x*dx,(target.x+target.width)*dx-x,y-target.y*dy,(target.y+target.height)*dy-y)});
        }
        if(error instanceof BridgeError&&["REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED","REVIEWED_POINT_NOT_READY"].includes(error.code)&&sourceFrameID){
          const code=error.code;
          const device=uuid(args.device_id);
          const report=async()=>{
            const now=this.e.now();
            const verified=queryProof?.origin==="visual_read"?queryProof:undefined;
            // Bare reviewed coordinates also need a rejection snapshot. They
            // have no crop/proof lookup, but still pass the legacy frame gate.
            const ordinary=!queryProof;
            const snapshot=verified||ordinary?
              await this.reviewedPointRejection(user,device,sourceFrameID,moveArgs,now,verified,!!crops,coordinateProof).catch(()=>null):null;
            const diagnostic={
              source_frame_id:sourceFrameID,source_age_ms:verified?now-verified.captureLower:snapshot?.source_age_ms??null,
              current_head_age_ms:snapshot?.current_head_age_ms??null,diagnostic_timing:"after_rejection",
              visual_proof_resolved:!!verified,visual_proof_lookup:visualLookup?.reason??"not_requested",
              conditions:snapshot?.conditions??null};
            logPairedClickDiagnostic({event:"reviewed_point_admission_rejected",request_id:requestID,
              ...diagnostic,explicit_visual_proof:requestVisualProof,reason:code});
            return diagnostic;
          };
          const until=this.waitNow()+350;
          const diagnostic=await beforeImageObservationDeadline({
            remainingMS:()=>until-this.waitNow(),expire:()=>{},signal:this.shadowSignal,
          },()=>report()).catch(()=>undefined);
          throw new InputAdmissionError(code,diagnostic??{
            diagnostic_timing:"unavailable",source_frame_id:sourceFrameID,conditions:null,
          });
        }
        throw error;
      }
    };
    const move=timing?await timing.measure("move_enqueue",enqueueMove):await enqueueMove();
    phase?.admissionReturned(this.e.now());
    if(pointSpec(move.precondition))return this.observePaired(user,move,requested,deadline,requestID,minGap,cue?undefined:registerRelease,
      !cue&&minGap===120,!cue&&minGap===300&&wait===6000,phase,args.wait_ms===undefined&&!cue);
    const base={workflow:"move_click_observe.v1",move_command_id:move.command_id,move_result:move,intermediate_landing_verified:false,settle_ms:minGap};
    if(move.state!=="board_acked")return {...await this.observe(user,move,false,deadline,requestID,minGap),...base,workflow_stage:"move",click_submitted:false};
    // The original move expiry gates first click admission. An admitted click
    // keeps its own immutable command deadline; retries read that saved row.
    let click:Awaited<ReturnType<MouseControl["enqueue"]>>;
    try{click=await this.enqueue(user,"pointer.click",{device_id:move.device_id,idempotency_key:key+":click",button:"left",wait_ms:Math.min(3000,Math.max(0,Math.floor(deadline-this.waitNow())))},deadline,move);}
    catch(error){
      const reason=error instanceof BridgeError?error.code:"CLICK_ADMISSION_UNKNOWN";
      const noClick=["COMPOUND_DISPATCH_EXPIRED","COMPOUND_SCOPE_CHANGED","COMPOUND_GEOMETRY_CHANGED","MOVE_NOT_CONFIRMED","ALLOW_MOUSE_ON_PHONE","MOUSE_ACTION_UNSUPPORTED","MOUSE_BUSY_OR_CONTROL_CHANGED"].includes(reason);
      return {...await this.observe(user,move,false,deadline,requestID,minGap),...base,workflow_stage:"click_admission",click_submitted:noClick?false:null,workflow_error:reason};
    }
    return {...await this.observe(user,click,requested,deadline,requestID,minGap,2000,undefined,undefined,false,undefined,{action:true}),...base,workflow_stage:"click",click_submitted:true};
  }

  private async resumeReviewedPress(user:User,args:Record<string,unknown>,requested:boolean,requestID:string,
    registerRelease?:RegisterClickAfterRelease,selected?:{proof:ParkedMovePointProof;target:Region;normalized:boolean}) {
    const original=uuid(args.resume_failed_click_command_id),device=uuid(args.device_id),frame=uuid(args.source_frame_id);
    const crops=reviewedPointCrops(args,frame);
    need(crops,"REVIEWED_POINT_CROP_SOURCE_REQUIRED",422);
    const {intent,payload}=absoluteMouseRequest(args);
    const {source_x:x,source_y:y,source_width:width,source_height:height}=intent;
    const cx=finite(args.resume_cursor_x,0,width-1),cy=finite(args.resume_cursor_y,0,height-1);
    const minMargin=(target:Region)=>Math.min(reviewedPressTargetMargin(target,width,height,x,y),
      reviewedPressTargetMargin(target,width,height,cx,cy));
    const newMargin=minMargin(crops.target_region),originalMargin=selected?minMargin(selected.target):null;
    const distance=Math.hypot(cx-x,cy-y);
    if(width>1280||height>1280||newMargin<2||originalMargin!==null&&originalMargin<2||distance>reviewedPressLandingTolerancePX){
      logPairedClickDiagnostic({event:"reviewed_parked_press",request_id:requestID,stage:"geometry",
        reason:"REVIEWED_PRESS_LANDING_INVALID",path:selected?"selector":"explicit",normalized:selected?.normalized??false,
        image_width:width,image_height:height,original_minimum_margin_px:originalMargin,new_minimum_margin_px:newMargin,
        cursor_delta_px:distance});
      throw new BridgeError("REVIEWED_PRESS_LANDING_INVALID",422);
    }
    const gap=integer(args.settle_ms??300,0,2000),wait=integer(args.wait_ms??6000,0,10000),deadline=this.waitNow()+wait;
    const callerKey=text(args.idempotency_key,120);
    const report=(reason:string)=>logPairedClickDiagnostic({event:"reviewed_parked_press",request_id:requestID,
      stage:"admission",reason,original_click_command_id:original,source_frame_id:frame});
    const proof=selected?.proof??await this.e.resolveParkedMovePointProof(user,device,original,frame,text(args.source_point_proof,2048));
    if(!proof)report("source_proof_invalid_or_missing");
    need(proof,"REVIEWED_PRESS_SOURCE_PROOF_INVALID");
    const key=reviewedPressKeyPrefix+original,id=uid(),now=this.e.now(),at="clock.now";
    const digest=await hash(JSON.stringify([callerKey,frame,proof.sha256,intent,crops,cx,cy,gap]));
    const geometry=JSON.stringify({...intent,source_frame_id:frame,point_source:{content_sha256:proof.sha256}});
    const wire=JSON.stringify({protocol:reviewedPressProtocol,original_move_id:proof.move,original_click_id:original,
      move_ack_phone_mono_ms:proof.moveAck,capture_min_gap_ms:gap,
      point_source:{protocol:scopeBoundLinkedPointProtocol,origin:"parked_move",frame_id:frame,content_sha256:proof.sha256,...crops},
      ...intent,cursor_x:cx,cursor_y:cy});
    need(!this.shadowSignal?.aborted,"REVIEWED_PRESS_CANCELLED");
    const rows=await this.e.db.batch<Command>([
      this.expiration({device,owner:user.id},now),
      this.e.stmt(`WITH clock AS MATERIALIZED (SELECT max(?,${databaseNowSQL}) AS now),
        i AS (SELECT ? AS geometry,? AS origin,? AS wire)
        INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,
          precondition,state,control_epoch,created_at,expires_at,input_attempted,worker_id,lease_epoch,predecessor_id)
        SELECT ?,d.owner_id,d.id,s.id,h.hardware_id,h.board_boot_id,'pointer.click','{"button":"left"}',?,?,
          json_object('reviewed_press',json_patch(json(i.wire),json_object('capture_width',json_extract(f.metadata,'$.native_width_px'),
            'capture_height',json_extract(f.metadata,'$.native_height_px'),'orientation',json_extract(f.metadata,'$.orientation'))),
            'reviewed_press_origin',json(i.origin),'reviewed_press_geometry',json_patch(json(i.geometry),json_object(
              'capture_width',json_extract(f.metadata,'$.native_width_px'),'capture_height',json_extract(f.metadata,'$.native_height_px'),
              'orientation',json_extract(f.metadata,'$.orientation'))),'capture_min_gap_ms',CAST(? AS INTEGER)),
          'queued',s.control_epoch,${at},min(${at}+5000,s.mouse_until,d.worker_expires),0,d.worker_id,d.lease_epoch,k.id
        ${mouseAdmissionJoin} CROSS JOIN clock CROSS JOIN i
        JOIN sb_mouse_commands k ON k.id=? JOIN sb_mouse_commands m ON m.id=k.predecessor_id
        JOIN sb_frames f ON f.device_id=d.id ${dragReviewJoinsSQL("i.geometry")}
        WHERE d.id=? AND d.owner_id=? AND ${mouseAdmissionAuthority(at)}${mouseAdmissionAvailable}
          AND json_type(h.metadata,'$.capabilities."hid.mouse.click"')='true'
          AND ${reviewedPressOriginSQL("i.origin",at)}
          AND ${reviewedPointHeadSQL(at,"i.geometry",false,"1","1","1")}
          AND ${["source_x","source_y","source_width","source_height","orientation_epoch"].map(k=>
            "json_extract(m.precondition,'$."+k+"')=json_extract(i.geometry,'$."+k+"')").join(" AND ")}
          AND json_extract(m.payload,'$.x')=? AND json_extract(m.payload,'$.y')=?
          AND json_extract(m.precondition,'$.capture_width')=json_extract(f.metadata,'$.native_width_px')
          AND json_extract(m.precondition,'$.capture_height')=json_extract(f.metadata,'$.native_height_px')
          AND json_extract(m.precondition,'$.orientation')=json_extract(f.metadata,'$.orientation')
        ON CONFLICT DO NOTHING`,now,geometry,JSON.stringify(proof),wire,id,digest,key,gap,original,device,user.id,payload.x,payload.y),
      this.e.stmt("SELECT * FROM sb_mouse_commands WHERE owner_id=? AND device_id=? AND predecessor_id=? AND idempotency_key=?",
        user.id,device,original,key),
    ]);
    const saved=rows[2].results[0];
    report(!saved?"frame_or_authority_changed":saved.digest!==digest?"idempotency_conflict":saved.id===id?"reserved":"original_readback");
    need(saved,"REVIEWED_PRESS_FRAME_OR_CONTROL_CHANGED");
    need(saved.digest===digest,"IDEMPOTENCY_CONFLICT");
    const result=saved.id===id?await this.awaitNewCommand(user,saved,deadline):this.output(saved);
    const observed=await this.observe(user,result,requested,Math.min(args.wait_ms===undefined?Infinity:deadline,this.waitNow()+directAfterImageWaitMS),
      requestID,gap,directAfterImageWaitMS,undefined,registerRelease,false,undefined,
      {strictDeadline:true,action:true,signal:this.shadowSignal,currentInput:{kind:"click",hardware:result.hardware_id,boot:result.board_boot_id}});
    return {...observed,workflow:"reviewed_press_after_move.v1",move_command_id:proof.move,click_command_id:result.command_id,
      original_click_command_id:original,workflow_stage:pending.has(result.state)?"point_pending":"click",
      settle_ms:gap,move_result:undefined,intermediate_landing_verified:result.state==="board_acked",
      click_submitted:pending.has(result.state)?null:result.input_attempted??(result.input_not_submitted?false:null)};
  }
  private async observePaired(user:User,admission:Awaited<ReturnType<MouseControl["get"]>> & {[admittedCompanion]?: Command},requested:boolean,deadline:number,requestID:string,minGap:number,registerRelease?:RegisterClickAfterRelease,shortSettleRequested=false,recoverTimeout=false,phase?:PairedClickPhaseTiming,extendAfterImage=false){
    const {[admittedCompanion]: companion, ...original} = admission;
    const spec=pointSpec(original.precondition);need(spec,"INVALID_POINT_SPEC");
    const base={workflow:"phone_move_click_observe.v1",move_command_id:original.command_id,click_command_id:spec.click_command_id,
      point_protocol:PAIRED_MOUSE_POINT,settle_ms:minGap,intermediate_landing_verified:false};
    const cue=readyCue(original.precondition?.point_capture_ready_cue),gapMatches=original.precondition?.point_capture_min_gap_ms===minGap;
    const shortSettle=!cue&&gapMatches&&shortSettleRequested;
    const afterTiming=requested?new ClickAfterImageTiming():undefined;
    let bundleAfterImage=requested;
    const poll=async(persistExpiry:boolean)=>{
      const expiry=this.expirationPredicate({command:original.command_id,owner:user.id},this.e.now());
      const expiryCheck=persistExpiry?"":",EXISTS(SELECT 1 FROM sb_mouse_commands WHERE "+expiry.sql+") AS needs_expiry";
      const receiptClock=phase?","+databaseNowSQL+" AS receipt_read_at_utc_ms":"";
      const receipt=this.e.stmt("SELECT c.*"+expiryCheck+receiptClock+" FROM sb_mouse_commands c JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id WHERE c.owner_id=? AND c.device_id=? AND c.id IN (?,?) AND d.revoked=0",
        ...(persistExpiry?[]:expiry.values),user.id,original.device_id,original.command_id,spec.click_command_id);
      const statements=persistExpiry?[this.expireMatching(expiry),receipt]:[receipt];
      const bundle=bundleAfterImage&&this.waitNow()<deadline;
      const bundleDispatched=phase&&bundle?this.e.now():undefined;
      const screen=bundle?await this.e.readPairedResultSnapshot<PairedPollRow>(user,original.device_id,spec.click_command_id,minGap,statements,shortSettle,afterTiming).catch(error=>{
        // The result may already be durable. Fall back to reading the same
        // receipts if the optional image snapshot fails, without new input.
        bundleAfterImage=false;
        console.info(JSON.stringify({event:"paired_observation_snapshot_failed",request_id:requestID,reason:error instanceof BridgeError?error.code:"SNAPSHOT_UNAVAILABLE"}));
        return null;
      }):null;
      let readTiming=bundleDispatched===undefined?undefined:phase!.readReturned(bundleDispatched,this.e.now());
      // An optional snapshot that used the remaining budget can fail in
      // flight. Preserve the previous receipt rather than start a fallback.
      if(!screen&&(persistExpiry||(!bundleAfterImage&&requested))&&this.waitNow()>=deadline)return null;
      let results=screen?.results;
      if(!results){
        const dispatched=phase&&this.e.now();
        results=await this.e.db.batch<PairedPollRow>(statements);
        if(dispatched!==undefined)readTiming=phase!.readReturned(dispatched,this.e.now());
      }
      return {rows:results[persistExpiry?1:0].results,read:screen?.read,readTiming,shadowBroadcast:screen?.shadowBroadcast};
    };
    const repairUnavailable=Symbol("paired_expiry_repair_unavailable");
    const exactPair=(rows:PairedPollRow[])=>{
      const move=rows.find(r=>r.id===original.command_id),click=rows.find(r=>r.id===spec.click_command_id);
      return move&&click&&click.predecessor_id===move.id?{move,click}:null;
    };
    const snapshot=async()=>{
      const first=await poll(false);
      if(!first)return null;
      const originalPair=exactPair(first.rows);
      const terminal=originalPair&&!pending.has(originalPair.move.state)&&!pending.has(originalPair.click.state);
      if(originalPair)phase?.paired(first.readTiming,originalPair.click.receipt_read_at_utc_ms,originalPair.move.state,originalPair.click.state,!!terminal);
      // A terminal pair and its frame are already sealed in the same read.
      // Leave expiry of other commands to normal admission and claim cleanup.
      const current=!terminal&&first.rows.some(row=>row.needs_expiry===1)?await poll(true):first;
      if(!current)return repairUnavailable;
      const exact=current===first?originalPair:exactPair(current.rows);
      need(exact,"POINT_CHILD_MISMATCH");
      this.observeShadowReceipt(exact.move,exact.click,current.shadowBroadcast);
      if(current!==first)phase?.paired(current.readTiming,exact.click.receipt_read_at_utc_ms,exact.move.state,exact.click.state,
        !pending.has(exact.move.state)&&!pending.has(exact.click.state));
      return {move:this.output(exact.move),click:this.output(exact.click),read:current.read};
    };
    const unresolved=()=>{
      if(afterTiming)afterTiming.receiptTiming=phase?.output()?.receipt;
      return {...original,...base,command_id:spec.click_command_id,move_result:original,kind:"pointer.click",payload:{button:"left"},
        precondition:null,paired_click_command_id:undefined,predecessor_command_id:original.command_id,state:"outcome_unknown",
        board_receipt:null,input_not_submitted:false,input_attempted:undefined,error:"PAIRED_RESULT_SNAPSHOT_UNAVAILABLE",
        verification:"not_confirmed",receipt_observation:{...original.receipt_observation,phone_ack_mono_ms:null,valid_for_capture_order:false,
          scope:{device_id:original.device_id,bridge_session_id:original.bridge_session_id,worker_id:null,lease_epoch:null}},
        workflow_stage:"point_pending",click_submitted:null,observation_state:"budget_exhausted",
        after_screen:{state:"budget_exhausted",reason:"OBSERVATION_BUDGET_EXHAUSTED",app_effect_observed:false} as {state:string;reason:string;app_effect_observed:false;[key:string]:unknown},
        [clickAfterImageTiming]:!cue?afterTiming:undefined,image:undefined};
    };
    let attemptStarted=this.waitNow();
    let pair=companion?{move:original,click:this.output(companion),read:undefined}:await snapshot();
    if(!pair||pair===repairUnavailable)return unresolved();
    while(pending.has(pair.click.state)&&this.waitNow()<deadline){
      const delay=nextPollDelayMS(150,attemptStarted,this.waitNow(),deadline);
      if(delay>0)await this.waitSleep(delay);
      if(this.waitNow()>=deadline)break;
      attemptStarted=this.waitNow();
      const current=await snapshot();
      if(current===repairUnavailable)return unresolved();
      if(!current)break;
      pair=current;
    }
    const submitted=pending.has(pair.click.state)?null:pair.click.input_not_submitted?false:pair.click.input_attempted===true?true:null;
    const receiptObserved=this.waitNow();
    const parked=requested&&receiptObserved<deadline&&!cue?
      await this.observeFailedReviewedPair(user,pair.click,requestID,{signal:this.shadowSignal,registerRelease},
        extendAfterImage?receiptObserved+directAfterImageWaitMS:deadline).catch(()=>undefined):undefined;
    // Only a confirmed click seen within its original deadline can open the
    // independent read-only window. No input deadline is renewed.
    const useAfterWindow=extendAfterImage&&requested&&gapMatches&&receiptObserved<deadline&&
      pair.click.state==="board_acked"&&pair.click.receipt_observation.valid_for_capture_order;
    const recoverRelease=!cue&&gapMatches&&(useAfterWindow||minGap===300||shortSettle)?registerRelease:undefined;
    const afterDeadline=useAfterWindow?receiptObserved+pairedClickAfterImageWaitMS:deadline;
    const first=parked??await this.observe(user,pair.click,requested,afterDeadline,requestID,minGap,
      useAfterWindow?pairedClickAfterImageWaitMS:2000,pair.read,recoverRelease,
      !useAfterWindow&&recoverTimeout&&!cue&&gapMatches&&minGap===300,afterTiming,{strictDeadline:useAfterWindow,action:true});
    let observed=first;
    if(cue&&first.after_screen.state==="available"){
      const metadata=record(first.after_screen.metadata);
      if(cue.mode!=="loader_disappears"||metadata.loading_cue_command_id===pair.click.command_id||metadata.ready_cue_command_id===pair.click.command_id){
        observed=await this.waitForReadyCue(user,pair.click,first,cue,deadline,requestID,minGap);
      }
    }
    let phaseTiming;
    const timings=phase?.output();
    if(afterTiming)afterTiming.receiptTiming=timings?.receipt;
    if(timings){
      const after=observed.after_screen,failure=record(after.recovery??{}),successor=failure.timeout_successor_result;
      const sameScopeMissing=(after.reason==="NO_FRESH_FRAME"&&["no_frame","frame_expired","frame_too_old"].includes(String(failure.failure))||
        after.reason==="WAITING_POST_COMMAND_FRAME"&&failure.failure==="before_command_receipt")&&
        (successor==null||successor==="frame_too_old");
      if(observed.image||sameScopeMissing)phaseTiming=timings;
    }
    let shadow:ShadowProjection|undefined;
    try{if(observed.image)shadow=this.shadowTicket?.freeze();}catch{}
    return {...observed,...base,[pairedClickShadow]:shadow,[clickAfterImageTiming]:!cue?afterTiming:undefined,
      [pairedClickTiming]:phaseTiming,
      workflow_stage:pending.has(pair.click.state)?"point_pending":"click",click_submitted:submitted,move_result:pair.move};
  }
  private async waitForReadyCue(user:User,click:Awaited<ReturnType<MouseControl["get"]>>,
    first:Awaited<ReturnType<MouseControl["observe"]>>,cue:ReadyCue,deadline:number,requestID:string,minGap:number){
    const metadata=record(first.after_screen.metadata);
    const withCue=(value:typeof first,state:"matched"|"not_seen"):typeof first=>({...value,after_screen:{...value.after_screen,ready_cue_state:state}});
    if(metadata.ready_cue_command_id===click.command_id)return withCue(first,"matched");
    const proof=record(first.after_screen.after_command);
    const laterGap=Math.max(minGap,Math.ceil(Number(proof.lower_gap_ms)));
    if(laterGap>=2000||this.waitNow()>=deadline)return withCue(first,"not_seen");
    const receipt=click.receipt_observation;
    const loaderTiming=cue.mode==="loader_disappears"&&metadata.loading_cue_command_id===click.command_id&&
      receipt.valid_for_capture_order&&typeof receipt.phone_ack_mono_ms==="number"&&
      typeof receipt.scope.worker_id==="string"&&typeof receipt.scope.lease_epoch==="number"?
      {owner:user.id,device:click.device_id,session:click.bridge_session_id,worker:receipt.scope.worker_id,
        lease:receipt.scope.lease_epoch,captureAfter:receipt.phone_ack_mono_ms+laterGap,readyCueCommandID:click.command_id}:undefined;
    const later=await this.observe(user,click,true,deadline,requestID,laterGap,cue.wait_ms,
      (waitMS,rid,report)=>this.e.readActionAfterScreen(user,{device_id:click.device_id,after_command_id:click.command_id,
        after_command_min_gap_ms:laterGap,wait_for_new_ms:waitMS},rid,{report,readyCueCommandID:click.command_id,loaderTiming}),
      undefined,false,undefined,{action:true});
    if(later.after_screen.state==="available"&&record(later.after_screen.metadata).ready_cue_command_id===click.command_id){
      return withCue(later,"matched");
    }
    // Keep the original reviewed candidate only when the live scope was not
    // lost and it is still fresh at the end of the extra observation.
    const age=liveFrameAge(this.e.now(),metadata.capture_lower_server_utc_ms,actionAfterImageAgeLimitMS,actionAfterImageAgeLimitMS);
    if(["WAITING_READY_CUE","WAITING_POST_COMMAND_FRAME"].includes(String(later.after_screen.reason))&&age!==null){
      return withCue({...first,after_screen:{...first.after_screen,metadata:{...metadata,age_ms:age}}},"not_seen");
    }
    return withCue(later,"not_seen");
  }
  private async reviewedPointRejection(user:User,device:string,frame:string,args:Record<string,unknown>,now:number,proof?:VisualReadPointProof,cropReview=true,geometryOnly=false) {
    const at="clock.now",intent="i.intent",origin="i.origin";
    const {intent:geometry}=absoluteMouseRequest(args);
    const acceptedSourceAge="("+at+"-json_extract(a.acceptance_json,'$.capture_lower_ms'))";
    const sourceAge="CASE WHEN json_extract(a.acceptance_json,'$.owner_id')=d.owner_id THEN "+acceptedSourceAge+" ELSE NULL END";
    const flags=diagnosticJSONSQL({},{
      authority:mouseAdmissionAuthority(at),input_clear:allOf(...Object.values(mouseAdmissionFences)),
      worker_live:"d.worker_expires>"+at,sharing_active:"s.state='active' AND s.capture_state='active'",
      control_enabled:"s.mouse_enabled=1",control_unexpired:"s.mouse_until>"+at,usb_connected:"h.usb_connected=1",
      ...mouseAdmissionFences,
      ...(proof?visualReadPointOriginFences(origin,at):{
        original_acceptance:"a.acceptance_json IS NOT NULL",ordinary_source_younger_than_4s:acceptedSourceAge+"<4000",
      }),
      original_control_equal:"json_extract(a.acceptance_json,'$.control_epoch')=s.control_epoch",
      original_session_equal:"json_extract(a.acceptance_json,'$.metadata.bridge_session_id')=s.id",
      original_broadcast_equal:"json_extract(a.acceptance_json,'$.metadata.broadcast_id')=s.broadcast_id",
      original_worker_equal:"json_extract(a.acceptance_json,'$.metadata.worker_id')=d.worker_id",
      original_lease_equal:"json_extract(a.acceptance_json,'$.metadata.lease_epoch')=d.lease_epoch",
      pixel_hash_equal:"f.sha256="+reviewedPointSourceHashSQL,
      exact_source_frame:"f.frame_id=json_extract(i.intent,'$.source_frame_id')",
      crop_review_path:cropReview?"1":"0",
      geometry_only_path:geometryOnly?"1":"0",
      legacy_source_age_required:geometryOnly?"0":"1",
      whole_image_equality_required:geometryOnly||cropReview?"0":"1",
      current_head:freshHeadViewSQL(at,2000),
      current_head_acceptance_present:"n.acceptance_json IS NOT NULL",
      current_head_acceptance_exact:reviewedPointHeadAcceptanceSQL(),
      current_geometry_and_order:reviewedPointHeadSQL(at,intent,false,cropReview?"1":undefined,proof?"1":undefined,proof?"1":undefined,geometryOnly?"1":undefined),
    });
    const row=await this.e.stmt(`WITH clock AS (SELECT max(?,${databaseNowSQL}) AS now),
      i AS (SELECT ? AS intent, ? AS origin) SELECT ${flags} AS flags,${sourceAge} AS source_age_ms,
      clock.now-f.capture_lower AS current_head_age_ms ${mouseAdmissionJoin}
      CROSS JOIN clock CROSS JOIN i LEFT JOIN sb_frames f ON f.device_id=d.id
      ${dragReviewJoinsSQL(intent)} WHERE d.id=? AND d.owner_id=? AND d.revoked=0`,
      now,JSON.stringify({...geometry,source_frame_id:frame}),proof?JSON.stringify(proof):null,device,user.id)
      .first<{flags:string;source_age_ms:number|null;current_head_age_ms:number|null}>();
    return row?{conditions:JSON.parse(row.flags) as Record<string,number>,source_age_ms:row.source_age_ms,
      current_head_age_ms:row.current_head_age_ms}:null;
  }

  private async insertCompanion(user:User,parent:string,child:string,clickKey:string) {
    const digest = await hash('pointer.click:{"button":"left"}');
    return this.e.stmt(`INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,precondition,state,control_epoch,created_at,expires_at,predecessor_id,input_attempted)
      SELECT ?,p.owner_id,p.device_id,p.session_id,p.hardware_id,p.board_boot_id,'pointer.click','{"button":"left"}',?,?,json_remove(p.precondition,'$.point','$.point_capture_min_gap_ms','$.point_capture_ready_cue','$.point_source','$.point_search_origin','$.point_query_origin','$.point_motion_policy','$.point_center_policy'),'embedded',p.control_epoch,p.created_at,p.expires_at,p.id,0
      FROM sb_mouse_commands p WHERE p.id=? AND p.owner_id=? AND p.kind='pointer.move_absolute' AND p.state='queued' AND json_extract(p.precondition,'$.point.protocol')=? AND json_extract(p.precondition,'$.point.click_command_id')=?`,
      child,digest,text(clickKey,120),parent,user.id,PAIRED_MOUSE_POINT,child);
  }
  private admissionReadback(user:User,device:string,key:string,withCompanion:boolean,requireActive=false) {
    const active = requireActive ? " AND EXISTS(SELECT 1 FROM sb_sessions s JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id WHERE s.id=d.current_session AND s.owner_id=d.owner_id AND s.state='active')" : "";
    const point=withCompanion?","+pointChildSnapshot+",d.worker_id AS queued_worker,d.lease_epoch AS queued_lease":"";
    return this.e.stmt("SELECT c.*"+point+" FROM sb_mouse_commands c JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id WHERE c.owner_id=? AND c.device_id=? AND c.idempotency_key=? AND d.revoked=0"+active,user.id,device,key);
  }
  private noteQueuedPoint(point:Admission) {
    if(!this.claimHints||point.state!=="queued"||!point.queued_worker||typeof point.queued_lease!=="number")return;
    this.claimHints.record({owner:point.owner_id,device:point.device_id,session:point.session_id,worker:point.queued_worker,
      lease:point.queued_lease,control:point.control_epoch},this.e.now(),point.expires_at);
  }
  private logQueuedPoint(point:Admission,source:"fast"|"geometry"|"standard_fallback",startedAt:number,observedAt:number,results:unknown,elapsed:number,statements:number) {
    const spec=pointSpec(point.precondition);
    if(!spec||point.state!=="queued")return;
    logPairedClickDiagnostic({event:"paired_click_enqueue",move_command_id:point.id,click_command_id:spec.click_command_id,
      source,enqueue_d1_started_at_server_utc_ms:startedAt,enqueue_commit_observed_at_server_utc_ms:observedAt,
      d1_timing:d1Timing("paired_enqueue",results,elapsed,statements)});
  }
  private async admitSelectedPoint(user:User,device:string,absolute:ReturnType<typeof absoluteMouseRequest>,key:string,digest:string,point:PointAdmission,
    geometryRetry?:{original:Ready;deadline:number}) {
    const parent=uid(),child=uid();
    need(parent!==child,"POINT_ID_COLLISION");
    const companion=await this.insertCompanion(user,parent,child,point.clickKey),now=this.e.now();
    const original=geometryRetry?.original;
    const cutoff=geometryRetry?now+Math.floor(geometryRetry.deadline-this.waitNow()):now+5000;
    const scope=original?" AND s.id=? AND s.broadcast_id=? AND d.worker_id=? AND d.lease_epoch=? AND s.control_epoch=? AND h.hardware_id=? AND h.board_boot_id=?":"";
    const scopeValues=original?[original.session_id,original.broadcast_id,original.worker_id,original.lease_epoch,original.control_epoch,original.hardware_id,original.board_boot_id]:[];
    const {intent,payload}=absolute;
    const at="(SELECT now FROM clock)";
    const reviewed=point.sourceFrameID!==undefined,cropReview=point.crops!==undefined,compoundReview=point.queryProof!==undefined;
    const visualOrigin=point.queryProof?.origin==="visual_read";
    const proofCapability=pointProofCapability(point.queryProof);
    const scopeBoundReview=proofCapability&&proofCapability!==REVIEWED_POINT_COMPOUND_CAPABILITY?"1":undefined;
    const pointCapability=proofCapability??(cropReview?REVIEWED_POINT_CROP_CAPABILITY:REVIEWED_POINT_CAPABILITY);
    const pointProtocol=scopeBoundReview?scopeBoundLinkedPointProtocol:compoundReview?reviewedPointCompoundProtocol:
      cropReview?reviewedPointCropProtocol:reviewedPointProtocol;
    const originGate=visualOrigin?visualReadPointOriginSQL("i.query_origin",at):
      compoundReview?compoundQueryOriginSQL("i.query_origin",at,[],scopeBoundReview):"(i.origin IS NULL OR "+pointSearchOriginSQL("i.origin")+")";
    const intentJSON=JSON.stringify({...intent,coordinate_space:"full_screen_image_pixels",...(reviewed?{source_frame_id:point.sourceFrameID}:{})});
    const geometry=reviewed?`SELECT f.metadata,${reviewedPointSourceHashSQL} AS source_sha256 FROM live l CROSS JOIN review_intent i
      JOIN sb_devices d ON d.id=l.device_id JOIN sb_sessions s ON s.id=l.session_id
      JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id JOIN sb_frames f ON f.device_id=d.id
      ${dragReviewJoinsSQL("i.value")} WHERE l.paired AND ${reviewedPointCapSQL(pointCapability)}
      AND ${reviewedPointHeadSQL(at,"i.value",false,cropReview?"1":undefined,compoundReview?"1":undefined,scopeBoundReview,point.geometryOnly?"1":undefined)} AND ${originGate}
      ${point.exactHeadCenter&&!point.geometryOnly?"AND f.frame_id=json_extract(i.value,'$.source_frame_id')":""}`
      :latestGeometry(geometryRows("(SELECT owner_id FROM live)","(SELECT device_id FROM live)","(SELECT session_id FROM live)","(SELECT lease_epoch FROM live)",[at,at+"-2000",at+"+100"]));
    const selectedSource=reviewed?"(SELECT json_extract(value,'$.source_frame_id') FROM review_intent)":"json_extract(g.metadata,'$.frame_id')";
    const cueCapability=readyCueCapability(point.readyCue);
    const pairedPatch=point.readyCue
      ?`CASE WHEN l.paired THEN json_patch(?,CASE WHEN json_type(g.metadata,'$.${cueCapability}')='true' THEN ? ELSE '{}' END) ELSE '{}' END`
      :"CASE WHEN l.paired THEN ? ELSE '{}' END";
    const cropFields=cropReview?",'target_region',json_extract((SELECT crops FROM review_intent),'$.target_region')"+
      ",'landmark_region',json_extract((SELECT crops FROM review_intent),'$.landmark_region')":"";
    const queryOrigin=compoundReview?",'point_query_origin',json((SELECT query_origin FROM review_intent))":"";
    const pointOrigin=scopeBoundReview?",'origin',json_extract((SELECT query_origin FROM review_intent),'$.origin')":"";
    const reviewPatch=reviewed?`json_object('point_source',json_object('protocol','${pointProtocol}',
      'frame_id',${selectedSource},'content_sha256',g.source_sha256${cropFields}${pointOrigin}),'point_search_origin',(SELECT origin FROM review_intent)${queryOrigin})`:"'{}'";
    const reviewIntent=reviewed?", review_intent AS (SELECT ? AS value,? AS origin"+(cropReview?",? AS crops":"")+
      (compoundReview?",? AS query_origin":"")+")":"";
    const insert=this.e.stmt(`WITH clock AS (SELECT max(?,${databaseNowSQL}) AS now)${reviewIntent}, live AS (
        SELECT d.owner_id,d.id AS device_id,s.id AS session_id,d.worker_id,d.lease_epoch,h.hardware_id,h.board_boot_id,s.control_epoch,s.mouse_until,
          (${pairedAdmission}) AS paired
        ${mouseAdmissionJoin}
        WHERE d.id=? AND d.owner_id=? AND ${mouseAdmissionAuthority(at)} AND ${at}<? AND json_type(h.metadata,'$.capabilities."hid.mouse.absolute"')='true'${mouseAdmissionAvailable}${scope}
      ), geometry AS (${geometry})
      INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,precondition,state,control_epoch,created_at,expires_at,input_attempted,worker_id,lease_epoch)
      SELECT ?,l.owner_id,l.device_id,l.session_id,l.hardware_id,l.board_boot_id,'pointer.move_absolute',?,?,?,
        json_patch(json_patch(json_patch(?,json_object('capture_width',json_extract(g.metadata,'$.native_width_px'),
          'capture_height',json_extract(g.metadata,'$.native_height_px'),'orientation',json_extract(g.metadata,'$.orientation'),
          'source_frame_id',${selectedSource})),${pairedPatch}),${reviewPatch}),
        'queued',l.control_epoch,?,min(?,l.mouse_until),CASE WHEN l.paired THEN 0 ELSE NULL END,
        ${reviewed?"l.worker_id,l.lease_epoch":"NULL,NULL"}
      FROM live l CROSS JOIN geometry g
      WHERE json_extract(g.metadata,'$.width')=? AND json_extract(g.metadata,'$.height')=? AND json_extract(g.metadata,'$.orientation_epoch')=?
        AND json_type(g.metadata,'$.native_width_px')='integer' AND json_type(g.metadata,'$.native_height_px')='integer'
        AND json_extract(g.metadata,'$.native_width_px') BETWEEN 2 AND 8192 AND json_extract(g.metadata,'$.native_height_px') BETWEEN 2 AND 8192
        AND json_extract(g.metadata,'$.orientation') IN ('portrait','portrait_upside_down','landscape_left','landscape_right')
         AND json_type(g.metadata,'$.frame_id')='text'${original?" AND l.paired":""}
      ON CONFLICT(owner_id,device_id,idempotency_key) DO NOTHING`,
       now,...(reviewed?[intentJSON,point.searchOriginID??null]:[]),...(cropReview?[JSON.stringify(point.crops)]:[]),
       ...(compoundReview?[JSON.stringify(point.queryProof)]:[]),PAIRED_MOUSE_POINT,device,user.id,cutoff,...scopeValues,
      parent,JSON.stringify(payload),digest,key,intentJSON,
      JSON.stringify({point_capture_min_gap_ms:point.captureMinGapMS,point:{protocol:PAIRED_MOUSE_POINT,click_command_id:child},
        ...(reviewed&&point.geometryOnly?{point_motion_policy:ordinaryPointMotionPolicy}:{}),
        ...(point.exactHeadCenter?{point_center_policy:exactHeadCenterPolicy}:{})}),
      ...(point.readyCue?[JSON.stringify({point_capture_ready_cue:point.readyCue})]:[]),
      now,now+5000,intent.source_width,intent.source_height,intent.orientation_epoch);
    // Only a completed batch with no saved row may fall back to preflight.
    // An uncertain database error must never trigger a replacement admission.
    // An optional recheck can admit only inside the original scope and tool
    // deadline. Keep the recheck free of unrelated expiry writes on a miss.
    const cleanup=geometryRetry?[]:[this.expiration({device,owner:user.id},now)];
    const readback=this.admissionReadback(user,device,key,true,true),readiness=this.readyStatement(user,device,true,key,true,now);
    if(geometryRetry)need(this.waitNow()<geometryRetry.deadline,"ABSOLUTE_GEOMETRY_UNAVAILABLE");
    const statements=[...cleanup,insert,companion,readback,readiness];
    if(reviewed)need(!point.signal?.aborted,"REVIEWED_POINT_CANCELLED",409);
    const startedAt=this.e.now(),started=performance.now();
    const rows=await this.e.db.batch<Admission|Ready>(statements);
    const observedAt=this.e.now(),elapsed=performance.now()-started;
    const current=rows.at(-2)!.results[0] as Admission|undefined;
    if (!current) {
      // Geometry recovery retains the scope seen by the failed admission.
      const ready=rows.at(-1)!.results[0] as Ready|undefined;
      need(ready,"START_MOUSE_SHARING");
      return {ready};
    }
    need(current.digest===digest,"IDEMPOTENCY_CONFLICT");
    if(current.id===parent)this.logQueuedPoint(current,geometryRetry?"geometry":"fast",startedAt,observedAt,rows,elapsed,statements.length);
    return {current,created:current.id===parent};
  }
  private pairedAdmissionOutput(current:Admission) {
    const spec=pointSpec(current.precondition);
    if (!spec) return null;
    if (current.expires_at<=this.e.now()) return this.output(current);
    const click=current.point_child_json?JSON.parse(current.point_child_json) as Command:null;
    need(click?.id===spec.click_command_id&&click.predecessor_id===current.id,"POINT_CHILD_MISMATCH");
    return {...this.output(current),[admittedCompanion]:click};
  }
  private registerShadow(current:Admission,created:boolean,deadline:number) {
    try {
      const spec=pointSpec(current.precondition),worker=current.queued_worker??current.worker_id,lease=current.queued_lease??current.lease_epoch;
      if(!this.shadowEnabled||!created||!spec||this.shadowTicket||!this.e.pairedShadow)return;
      this.shadowTicket=this.e.pairedShadow.register({owner:current.owner_id,device:current.device_id,session:current.session_id,
        worker:worker!,lease:lease!,control:current.control_epoch,hardware:current.hardware_id,boot:current.board_boot_id,
        move:current.id,click:spec.click_command_id},deadline,this.shadowSignal);
    }catch{/* Shadow availability never changes admission. */}
  }
  private observeShadowReceipt(move:Command,click:Command,broadcast:string|undefined) {
    if(!broadcast||move.state!=="board_acked"||click.state!=="board_acked"||click.phone_ack_mono_ms===null)return;
    try{this.shadowTicket?.observedReceipt({owner:move.owner_id,device:move.device_id,session:move.session_id,broadcast,
      worker:move.worker_id,lease:move.lease_epoch,control:move.control_epoch,hardware:move.hardware_id,boot:move.board_boot_id,
      move:move.id,click:click.id,ack:click.phone_ack_mono_ms});}catch{}
  }
  private selectedPointResult(user:User,current:Admission,created:boolean,deadline:number) {
    const pair=this.pairedAdmissionOutput(current);
    if(pair&&created){this.noteQueuedPoint(current);this.registerShadow(current,created,deadline);}
    return pair??(created?this.awaitNewCommand(user,current,deadline):this.output(current));
  }
  private async awaitNewCommand(user:User,current:Command,deadline:number) {
    let result=pending.has(current.state)&&current.expires_at<=this.e.now()?await this.get(user,current.id):this.output(current);
    while(pending.has(result.state)&&this.waitNow()<deadline){
      await this.waitSleep(Math.min(150,Math.max(0,deadline-this.waitNow())));
      if(this.waitNow()>=deadline)break;
      result=await this.get(user,current.id);
    }
    return result;
  }
  async enqueue(user: User, kind: string, args: Record<string, unknown>,waitingDeadline?:number,moveDependency?:Awaited<ReturnType<MouseControl["get"]>>,
    point?:PointAdmission,searchAdmission?:SearchAdmissionOptions) {
    need(capabilities[kind], "MOUSE_ONLY", 422);
    const systemSearch=kind===SYSTEM_SEARCH_KIND;
    const sourceFrame=systemSearch&&args.source_frame_id!==undefined?uuid(args.source_frame_id):undefined;
    const scopeOnly=systemSearch&&sourceFrame===undefined,withSearchSource=systemSearch&&!scopeOnly;
    const searchPrecondition=systemSearch?{
      ...(scopeOnly?{system_search_mode:systemSearchScopeOnlyMode}:{system_search_frame_id:sourceFrame}),
      capture_min_gap_ms:integer(args.capture_min_gap_ms??300,0,2000)
    }:undefined;
    const scrollPrecondition=kind===POINTER_SCROLL_KIND&&args.capture_min_gap_ms!==undefined?
      {capture_min_gap_ms:integer(args.capture_min_gap_ms,0,2000)}:undefined;
    if(systemSearch)uuid(args.device_id);
    let payload: Record<string, unknown>;
    let absolute: ReturnType<typeof absoluteMouseRequest> | undefined;
    if(systemSearch)payload={};
    else if (kind === "pointer.move_absolute") { absolute = absoluteMouseRequest(args); payload = absolute.payload; }
    else if (kind === "pointer.move_relative") { payload = { dx: integer(args.dx, -127, 127), dy: integer(args.dy, -127, 127) }; need(payload.dx !== 0 || payload.dy !== 0, "EMPTY_MOVE", 422); }
    else if (kind === "pointer.scroll") { payload = { steps: integer(args.steps, -8, 8) }; need(payload.steps !== 0, "EMPTY_SCROLL", 422); }
    else { need(args.button == null || args.button === "left", "LEFT_BUTTON_ONLY", 422); payload = { button: "left" }; }
    if(point?.crops&&absolute){
      const {source_x,source_y,source_width,source_height}=absolute.intent;
      const target=point.crops.target_region,dx=source_width-1,dy=source_height-1;
      const x=source_x/dx,y=source_y/dy;
      need(x>=target.x+2/dx&&x<=target.x+target.width-2/dx&&
        y>=target.y+2/dy&&y<=target.y+target.height-2/dy,"REVIEWED_POINT_TARGET_MARGIN",422);
    }
    const key = text(args.idempotency_key, 120), wait = integer(args.wait_ms ?? 2000, 0, 3000), serialized = JSON.stringify(payload),
      digest = await hash(kind + ":" + (absolute ? JSON.stringify(absolute.intent) : serialized)+(searchPrecondition?":"+JSON.stringify(searchPrecondition):"")+(point?.readyCue?":"+JSON.stringify(point.readyCue):"")+
         (point?.sourceFrameID?":reviewed:"+point.sourceFrameID+":"+(point.searchOriginID??""):"")+
         (point?.crops?":reviewed-crops:"+JSON.stringify(point.crops):"")+
         (point?.queryProof&&point.queryProof.origin!=="visual_read"?
           ":compound-query:"+JSON.stringify([point.queryProof.preparation,point.queryProof.command,point.queryProof.origin,point.queryProof.sha256]):""));
    // One total waiting budget, measured monotonically. An in-flight DB call
    // may finish later, but no new retry or receipt poll starts after deadline.
    const deadline=waitingDeadline??this.waitNow()+wait;
    let r:Ready;
    if (point&&absolute&&args.device_id!=null&&!moveDependency) {
      const admitted=await this.admitSelectedPoint(user,uuid(args.device_id),absolute,key,digest,point);
      if(admitted.current){
        point.phase?.admitted("fast",null,!admitted.created);
        return this.selectedPointResult(user,admitted.current,admitted.created,deadline);
      }
      r=admitted.ready;
      if(point.sourceFrameID!==undefined){
        const capability=pointProofCapability(point.queryProof)??(point.crops?REVIEWED_POINT_CROP_CAPABILITY:REVIEWED_POINT_CAPABILITY);
        need(r.point_protocol===PAIRED_MOUSE_POINT&&JSON.parse(r.metadata).capabilities[capability]===true,
          "REVIEWED_POINT_NOT_READY");
        throw new BridgeError(point.exactHeadCenter?"REVIEWED_TARGET_CENTER_REQUIRES_RELEASED_IMAGE":"REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED");
      }
    } else {
      r=await this.ready(user,args.device_id,!!absolute||!!moveDependency,key);
    }
    if (r.prior_id) {
      need(r.prior_digest === digest, "IDEMPOTENCY_CONFLICT");
      point?.phase?.admitted("saved_readback",null,true);
      return this.get(user, r.prior_id);
    }
    const suppliedProof=systemSearch&&args.source_view_proof!==undefined;
    if(suppliedProof)need(withSearchSource,"SYSTEM_SEARCH_PROOF_REQUIRES_SOURCE_FRAME",422);
    const reviewedProof=suppliedProof?await this.e.verifySourceViewProof(user,text(args.source_view_proof,2048)):null;
    if(suppliedProof)need(reviewedProof&&reviewedProof.frame===sourceFrame&&reviewedProof.device===r.id&&
      reviewedProof.session===r.session_id&&reviewedProof.broadcast===r.broadcast_id&&reviewedProof.worker===r.worker_id&&
      reviewedProof.lease===r.lease_epoch&&reviewedProof.control===r.control_epoch,"SYSTEM_SEARCH_SOURCE_VIEW_PROOF_INVALID");
    const assertReady=()=>{
      const now=this.e.now();
      need(r.mode === "broadcast" && r.capture_state === "active" && r.worker_expires > now && r.usb_connected === 1 && r.mouse_enabled === 1 && r.mouse_until > now, "ALLOW_MOUSE_ON_PHONE");
      need(JSON.parse(r.metadata).capabilities[capabilities[kind]] === true, "MOUSE_ACTION_UNSUPPORTED");
      if(systemSearch)need(JSON.parse(r.metadata).capabilities[SYSTEM_SEARCH_CAPABILITY]===true,"SYSTEM_SEARCH_NOT_READY");
      if(scopeOnly)need(JSON.parse(r.metadata).capabilities[SYSTEM_SEARCH_SCOPE_ONLY_CAPABILITY]===true,"SYSTEM_SEARCH_SCOPE_ONLY_NOT_READY");
    };
    assertReady();
    const paired=point!==undefined&&kind==="pointer.move_absolute"&&r.point_protocol===PAIRED_MOUSE_POINT&&JSON.parse(r.metadata).capabilities["hid.mouse.click"]===true;
    const companion=paired?uid():null;
    const dependencyExpiry=moveDependency?Date.parse(moveDependency.expires_at):Infinity;
    if(moveDependency){
      need(kind==="pointer.click"&&moveDependency.kind==="pointer.move_absolute"&&moveDependency.state==="board_acked"&&moveDependency.receipt_observation.valid_for_capture_order,"MOVE_NOT_CONFIRMED");
      need(this.waitNow()<deadline&&dependencyExpiry>this.e.now(),"COMPOUND_DISPATCH_EXPIRED");
      need(moveDependency.device_id===r.id&&moveDependency.bridge_session_id===r.session_id&&moveDependency.control_epoch===r.control_epoch&&moveDependency.hardware_id===r.hardware_id&&moveDependency.board_boot_id===r.board_boot_id&&moveDependency.receipt_observation.scope.worker_id===r.worker_id&&moveDependency.receipt_observation.scope.lease_epoch===r.lease_epoch,"COMPOUND_SCOPE_CHANGED");
    }
    let precondition: Record<string,unknown> | null = null, readyCueSupported=false, geometrySlot=0;
    if(searchPrecondition)precondition=searchPrecondition;
    if(moveDependency){
      const prior=moveDependency.precondition,g=this.geometrySnapshot(JSON.parse(r.geometry_rows??"[]"));
      need(prior&&g&&g.image_width===prior.source_width&&g.image_height===prior.source_height&&g.orientation_epoch===prior.orientation_epoch&&g.capture_width===prior.capture_width&&g.capture_height===prior.capture_height&&g.orientation===prior.orientation,"COMPOUND_GEOMETRY_CHANGED");
      precondition=prior;
    }
    if (absolute) {
      let g = this.geometrySnapshot(JSON.parse(r.geometry_rows ?? "[]"));
      if (!g && this.waitNow()<deadline) {
        const original=r;
        // Static-screen publication is about once per second. A 150ms-only
        // retry can read the same stale row before the next upload commits.
        // Larger budgets allow up to 600ms; short calls retain the quick path.
        const sourceWait=Math.min(600,Math.max(150,wait-200));
        // The selected click batch proved no command was admitted. Allow one
        // more read for a late publication under the original scope and budget.
        const rechecks=point&&args.device_id!=null&&wait>=1000?[sourceWait,300]:[sourceWait];
        for(const delay of rechecks){
          const remaining=deadline-this.waitNow();
          if(g||remaining<=0)break;
          await this.waitSleep(Math.min(delay,remaining));
          if(this.waitNow()>=deadline)break;
          geometrySlot++;
          const rechecked=paired&&point&&args.device_id!=null?
            await this.admitSelectedPoint(user,original.id,absolute,key,digest,point,{original,deadline}):null;
          if(rechecked?.current){
            point?.phase?.admitted("geometry",geometrySlot,!rechecked.created);
            return this.selectedPointResult(user,rechecked.current,rechecked.created,deadline);
          }
          r=rechecked?.ready??await this.ready(user,original.id,true,key);
          if(r.prior_id){
            need(r.prior_digest===digest,"IDEMPOTENCY_CONFLICT");
            point?.phase?.admitted("saved_readback",geometrySlot,true);
            return this.get(user,r.prior_id);
          }
          if(this.waitNow()>=deadline)break;
          need(r.session_id===original.session_id&&r.broadcast_id===original.broadcast_id&&r.worker_id===original.worker_id&&r.lease_epoch===original.lease_epoch&&r.control_epoch===original.control_epoch&&r.hardware_id===original.hardware_id&&r.board_boot_id===original.board_boot_id,"MOUSE_CONTROL_CHANGED_DURING_GEOMETRY_WAIT");
          assertReady();
          g=this.geometrySnapshot(JSON.parse(r.geometry_rows??"[]"));
        }
      }
      need(g, "ABSOLUTE_GEOMETRY_UNAVAILABLE");
      need(g.image_width === absolute.intent.source_width && g.image_height === absolute.intent.source_height && g.orientation_epoch === absolute.intent.orientation_epoch, "ABSOLUTE_GEOMETRY_CHANGED");
      precondition = { ...absolute.intent, coordinate_space:"full_screen_image_pixels", capture_width:g.capture_width, capture_height:g.capture_height, orientation:g.orientation, source_frame_id:g.frame_id };
      readyCueSupported=g[readyCueCapability(point?.readyCue)]===true;
    }
    if(paired)precondition={...precondition,point_capture_min_gap_ms:point.captureMinGapMS,point:{protocol:PAIRED_MOUSE_POINT,click_command_id:companion},
      ...(readyCueSupported&&point.readyCue?{point_capture_ready_cue:point.readyCue}:{})};
    const id = uid(), now=this.e.now();
    need(companion!==id,"POINT_ID_COLLISION");
    // Expiration, exclusion/authority CAS and idempotency readback share one
    // transaction. The current capture is checked again for absolute input.
    const geometryGate = precondition&&!systemSearch ? " AND EXISTS(SELECT 1 FROM ("+latestGeometry(geometryRows("?","?","?","?"))+") g WHERE json_extract(g.metadata,'$.width')=? AND json_extract(g.metadata,'$.height')=? AND json_extract(g.metadata,'$.orientation_epoch')=? AND json_extract(g.metadata,'$.native_width_px')=? AND json_extract(g.metadata,'$.native_height_px')=? AND json_extract(g.metadata,'$.orientation')=?)" : "";
    // Atomic at the click admission point: no other queued, executing,
    // confirmed or uncertain input may have followed this exact move.
    const dependencyGate=moveDependency?" AND EXISTS(SELECT 1 FROM sb_mouse_commands p WHERE p.id=? AND p.owner_id=d.owner_id AND p.device_id=d.id AND p.session_id=s.id AND p.worker_id=d.worker_id AND p.lease_epoch=d.lease_epoch AND p.control_epoch=s.control_epoch AND p.hardware_id=h.hardware_id AND p.board_boot_id=h.board_boot_id AND p.kind='pointer.move_absolute' AND p.state='board_acked' AND p.phone_ack_mono_ms>=0 AND p.expires_at>? AND NOT EXISTS(SELECT 1 FROM sb_mouse_commands n WHERE n.device_id=p.device_id AND n.owner_id=p.owner_id AND n.rowid>p.rowid AND n.state IN ('queued','claimed','executing','board_acked','outcome_unknown')))":"";
    const pointGate=paired?" AND "+pairedAdmission:"";
    // The scroll settle interval is observation evidence only. It does not
    // add a geometry check or change the physical input's idempotency digest.
    const savedPrecondition=precondition??scrollPrecondition;
    // Movement's remaining lifetime gates admission above and in the same
    // transaction below. It is not the newly admitted click's dispatch budget:
    // borrowing it can exhaust the click before the phone receives /start.
    // Each saved command gets its ordinary fixed five-second window, bounded
    // by the current grant. Idempotent readback never renews that deadline.
    const pairedInsert=paired?[await this.insertCompanion(user,id,companion!,point.clickKey)]:[];
    if(geometrySlot)need(this.waitNow()<deadline,"ABSOLUTE_GEOMETRY_UNAVAILABLE");
    const statements = [
      this.expiration({device:r.id},now),
      this.e.stmt((withSearchSource?"WITH source_clock AS (SELECT max(?,"+databaseNowSQL+") AS now,? AS proof) ":"")+"INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,precondition,state,control_epoch,created_at,expires_at,input_attempted,worker_id,lease_epoch) SELECT ?,?,?,?,?,?,?,?,?,?,"+(withSearchSource?"json_set(?,'$.system_search_frame_id',f.frame_id)":"?")+",'queued',s.control_epoch,?,?,?,?,?" + mouseAdmissionJoin +
        (withSearchSource?" JOIN sb_frames f ON f.device_id=d.id":"")+
        " WHERE d.id=? AND d.owner_id=? AND " + mouseAdmissionAuthority() + " AND d.worker_id=? AND d.lease_epoch=? AND s.id=? AND s.broadcast_id=? AND s.control_epoch=? AND h.hardware_id=? AND h.board_boot_id=? AND json_extract(h.metadata,?)=1" +
        geometryGate + (systemSearch?systemSearchLiveCapabilities:"") +
        (withSearchSource?systemSearchSourceGate:scopeOnly?" AND "+systemSearchScopeOnlyCapabilitySQL:"")+
        dependencyGate + pointGate + mouseAdmissionAvailable + " ON CONFLICT(owner_id,device_id,idempotency_key) DO NOTHING",
        ...(withSearchSource?[now,reviewedProof?JSON.stringify(reviewedProof):null]:[]),
        id,user.id,r.id,r.session_id,r.hardware_id,r.board_boot_id,kind,serialized,digest,key,savedPrecondition?JSON.stringify(savedPrecondition):null,
        now,Math.min(now+5000,r.mouse_until),paired?0:null,scopeOnly?r.worker_id:null,scopeOnly?r.lease_epoch:null,
        r.id,user.id,now,now,r.worker_id,r.lease_epoch,r.session_id,r.broadcast_id,r.control_epoch,r.hardware_id,r.board_boot_id,
        '$.capabilities."'+capabilities[kind]+'"',
        ...(precondition&&!systemSearch?[user.id,r.id,r.session_id,r.lease_epoch,now,now-2000,now+100,precondition.source_width,precondition.source_height,precondition.orientation_epoch,precondition.capture_width,precondition.capture_height,precondition.orientation]:[]),
        ...(withSearchSource?[sourceFrame]:[]),
        ...(moveDependency?[moveDependency.command_id,now]:[]),...(paired?[PAIRED_MOUSE_POINT]:[])),
      ...pairedInsert,
      this.admissionReadback(user,r.id,key,point!==undefined),
    ];
    // Original idempotent readback happens before this new-input admission gate.
    const startedAt=this.e.now(),started=performance.now();
    need(!searchAdmission?.signal?.aborted,"APP_SEARCH_QUERY_CANCELLED",409);
    const batch=await this.e.db.batch<Admission>(statements);
    const observedAt=this.e.now(),elapsed=performance.now()-started;
    const current=batch[batch.length-1].results[0];
    need(current&&current.digest===digest,current?"IDEMPOTENCY_CONFLICT":systemSearch?"SYSTEM_SEARCH_FRAME_OR_CONTROL_CHANGED":"MOUSE_BUSY_OR_CONTROL_CHANGED");
    if(systemSearch&&current.id===id&&searchAdmission?.onExtendedModelField){
      const capabilities=JSON.parse(r.metadata).capabilities;
      if(capabilities[extendedModelReviewedFieldCapability]===true&&capabilities[stableASCIICapability]===true)
        searchAdmission.onExtendedModelField();
    }
    const pair=point?this.pairedAdmissionOutput(current):null;
    if(pair)point?.phase?.admitted("standard_fallback",geometrySlot||null,current.id!==id);
    if(pair&&current.id===id){
      this.noteQueuedPoint(current);
      this.registerShadow(current,true,deadline);
      this.logQueuedPoint(current,"standard_fallback",startedAt,observedAt,batch,elapsed,statements.length);
    }
    return pair??this.awaitNewCommand(user,current,deadline);
  }
  private rawClaimIdentity(body:Record<string,unknown>):ClaimIdentity|null {
    try {
      return {session:uuid(body.bridge_session_id),broadcast:uuid(body.broadcast_id),worker:uuid(body.worker_id),lease:integer(body.lease_epoch,1)};
    } catch {
      // Keep the legacy validation order for invalid or foreground requests.
      return null;
    }
  }
  private claimScopeFence(caller:ScopeFence,identity:ClaimIdentity,now:number,correlateCommand:boolean):ScopeFence {
    return {
      sql:`EXISTS(SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id
        WHERE ${caller.sql} AND d.revoked=0 AND s.id=? AND s.broadcast_id=? AND s.mode='broadcast'
          ${correlateCommand?"AND d.id=sb_mouse_commands.device_id AND d.owner_id=sb_mouse_commands.owner_id":""}
          AND s.state='active' AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND d.worker_expires>${databaseNowSQL})`,
      values:[...caller.values,identity.session,identity.broadcast,identity.worker,identity.lease,now],
    };
  }

  async claimRequest(request:Request,readBody:()=>Promise<{body:Record<string,unknown>;waitMS:number}>) {
    const began=this.waitNow(),tokenHash=await deviceTokenHash(request);
    let input:Awaited<ReturnType<typeof readBody>>;
    try {input=await readBody();}
    catch(error){
      // Only bounded claim metadata can be parsed early. Keep its errors
      // behind the existing authenticated response boundary.
      await this.e.authenticate(request);
      // App64 already treats this code as a transient claim-read failure.
      // No command was selected before the metadata deadline expired.
      if(error instanceof BridgeError&&error.code==="METADATA_TIMEOUT")throw new BridgeError("GATEWAY_TIMEOUT",504);
      throw error;
    }
    const {body,waitMS}=input,control=body.control_epoch;
    if(body.raw_dispatch_protocol===RAW_MOUSE_DISPATCH&&body.point_protocol===PAIRED_MOUSE_POINT&&
       typeof control==="number"&&Number.isSafeInteger(control)&&control>=1&&this.rawClaimIdentity(body)){
      return this.claimWithAuthority({tokenHash},body,waitMS,began);
    }
    return this.claim(await this.e.authenticate(request),body,waitMS);
  }

  async claim(device: Device, body: Record<string, unknown>, waitMS: number) {
    return this.claimWithAuthority({device},body,waitMS,this.waitNow());
  }

  private async claimWithAuthority(authority:{device:Device}|{tokenHash:string},body:Record<string,unknown>,waitMS:number,began:number) {
    const device="device" in authority?authority.device:null;
    const tokenHash="tokenHash" in authority?authority.tokenHash:null;
    need(body.raw_dispatch_protocol==null||body.raw_dispatch_protocol===RAW_MOUSE_DISPATCH,"INVALID_RAW_DISPATCH_PROTOCOL",422);
    const atomicRaw=body.raw_dispatch_protocol===RAW_MOUSE_DISPATCH,control=atomicRaw?integer(body.control_epoch,1):0;
    need(body.spotlight_dispatch_protocol==null||body.spotlight_dispatch_protocol===SPOTLIGHT_CLAIM_START,"INVALID_SPOTLIGHT_DISPATCH_PROTOCOL",422);
    const spotlightPregrant=body.spotlight_dispatch_protocol===SPOTLIGHT_CLAIM_START;
    need(!spotlightPregrant||atomicRaw,"SPOTLIGHT_REQUIRES_SCOPED_CLAIM",422);
    need(body.app_search_protocol==null||body.app_search_protocol===APP_SEARCH_CLAIM,"INVALID_SEARCH_PREPARATION_PROTOCOL",422);
    const searchPreparation=body.app_search_protocol===APP_SEARCH_CLAIM;
    need(!searchPreparation||atomicRaw,"SEARCH_PREPARATION_REQUIRES_SCOPED_CLAIM",422);
    need(body.point_protocol==null||body.point_protocol===PAIRED_MOUSE_POINT,"INVALID_POINT_PROTOCOL",422);
    const paired=body.point_protocol===PAIRED_MOUSE_POINT,pointDeclared=Object.hasOwn(body,"point_protocol");
    need(!pointDeclared||atomicRaw,"POINT_REQUIRES_RAW_PREGRANT",422);
    need(body.reviewed_press_protocol===undefined||atomicRaw&&paired&&body.reviewed_press_protocol===reviewedPressProtocol,
      "INVALID_REVIEWED_PRESS_PROTOCOL",422);
    const reviewedPress=body.reviewed_press_protocol===reviewedPressProtocol;
    const ttlProfiles=body.raw_dispatch_ttl_profiles;
    need(ttlProfiles===undefined||(atomicRaw&&Array.isArray(ttlProfiles)&&ttlProfiles.length<=2&&
      new Set(ttlProfiles).size===ttlProfiles.length&&ttlProfiles.every(value=>value===scopedSearchTTLProfile||value===reviewedPointTTLProfile)),
      "INVALID_RAW_DISPATCH_TTL_PROFILES",422);
    const ttlProjection=rawClaimTTLProjection(new Set(ttlProfiles as unknown[]|undefined),paired);
    const raw=atomicRaw?this.rawClaimIdentity(body):null;
    need(raw||device,"INVALID_RAW_DISPATCH_PROTOCOL",422);
    const legacy=raw?null:await this.e.session(device!,body);
    if(legacy)need(legacy.mode==="broadcast","MOUSE_BROADCAST_REQUIRED",403);
    const identity=raw??{session:legacy!.id,broadcast:legacy!.broadcast_id,worker:uuid(body.worker_id),lease:integer(body.lease_epoch,1)};
    const {session,broadcast,worker,lease}=identity;
    const deadline=this.waitNow()+waitMS;
    let checkScope=raw!==null,declarationPending=pointDeclared;
    let tokenExpires=0;
    let timingScope:PointClaimScope|undefined,advanced=false,advanceForNext=0,preserveRetryAt=0,pollCount=0;
    do {
      const attemptStarted=this.waitNow();
      const now=this.e.now();
      const advanceForThisAttempt=advanceForNext;
      advanceForNext=0;
      const caller:ScopeFence=device?{sql:"d.id=? AND d.owner_id=?",values:[device.id,device.owner_id]}:
        {sql:`d.token_hash=? AND d.token_expires>? AND d.token_expires>${databaseNowSQL}`,values:[tokenHash,now]};
      const fence=raw?this.claimScopeFence(caller,identity,now,device===null):undefined;
      const statements:D1PreparedStatement[]=[];
      if(checkScope){
        if(device)statements.push(this.e.liveSessionStatement(device,session,true));
        else {
          // The LEFT JOIN distinguishes an invalid token from a valid token
          // for a stale session. Every write below has its own scope fence.
          statements.push(this.e.stmt(`SELECT s.*,d.id AS auth_device_id,d.token_expires AS auth_expires,d.worker_id AS live_worker,d.lease_epoch AS live_epoch,
            d.worker_expires AS live_expires,${databaseNowSQL} AS checked_at_ms FROM sb_devices d
            LEFT JOIN sb_sessions s ON s.id=d.current_session AND s.id=? AND s.device_id=d.id AND s.owner_id=d.owner_id AND s.state='active'
            WHERE ${caller.sql} AND d.revoked=0`,session,...caller.values));
          statements.push(this.e.stmt(`UPDATE sb_devices AS d SET confirmed_at=? WHERE ${caller.sql} AND d.revoked=0 AND d.confirmed_at IS NULL`,now,...caller.values));
        }
      }
      statements.push(device?this.expiration(fence?{device:device.id,owner:device.owner_id}:{device:device.id},now,fence):
        this.expiration({claimFence:fence!},now));
      if(paired&&declarationPending){
        statements.push(this.e.stmt(`INSERT INTO sb_mouse_point_ready(device_id,owner_id,session_id,worker_id,lease_epoch,control_epoch,protocol,updated_at)
          SELECT d.id,d.owner_id,s.id,d.worker_id,d.lease_epoch,s.control_epoch,?,?
          FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id
          WHERE ${caller.sql} AND d.revoked=0 AND s.id=? AND s.broadcast_id=? AND s.mode='broadcast'
            AND s.state='active' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.mouse_until>? AND s.mouse_until>${databaseNowSQL}
            AND s.control_epoch=? AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND d.worker_expires>${databaseNowSQL}
          ON CONFLICT(device_id) DO UPDATE SET session_id=excluded.session_id,worker_id=excluded.worker_id,
            lease_epoch=excluded.lease_epoch,control_epoch=excluded.control_epoch,protocol=excluded.protocol,updated_at=excluded.updated_at
          WHERE sb_mouse_point_ready.owner_id=excluded.owner_id`,PAIRED_MOUSE_POINT,now,...caller.values,session,broadcast,now,control,worker,lease,now));
      } else if(declarationPending&&device) {
        statements.push(this.e.stmt("DELETE FROM sb_mouse_point_ready WHERE device_id=? AND owner_id=? AND session_id=? AND worker_id=? AND lease_epoch=? AND control_epoch=?"+
          (fence?" AND "+fence.sql:""),device.id,device.owner_id,session,worker,lease,control,...(fence?.values??[])));
      }
      const claimIndex=statements.length;
      // A locally sent, successfully observed probe necessarily precedes this
      // grant's later TTL sample. This read-only witness grants no authority.
      const dispatchProbe=atomicRaw&&paired?`,CASE WHEN kind='pointer.move_absolute' AND json_extract(precondition,'$.point.protocol')='${PAIRED_MOUSE_POINT}'
        THEN (SELECT p.id FROM sb_clock_probes p WHERE p.device_id=sb_mouse_commands.device_id
          AND p.created_at<=${databaseNowSQL} AND p.expires_at>${databaseNowSQL}
          ORDER BY p.created_at DESC,p.id DESC LIMIT 1) ELSE NULL END AS paired_dispatch_probe_id`:"";
      const liveClock=raw?` AND c.expires_at>${databaseNowSQL} AND d.worker_expires>${databaseNowSQL} AND s.mouse_until>${databaseNowSQL}`:"";
      const reviewedPointCTE=paired?reviewedPointDispatchCTE(caller.sql):"";
      const precedingCTE=reviewedPress?(paired?reviewedPointCTE+", ":"WITH ")+reviewedPressClaimCTE(caller.sql)+" ":reviewedPointCTE;
      const claimCTE=(precedingCTE?precedingCTE.trimEnd()+", ":"WITH ")+dragDispatchCTE(caller.sql,"queued")+" ";
      const pressGuard="json_type(c.precondition,'$.reviewed_press') IS NULL";
      const pressJoin=reviewedPress?" LEFT JOIN reviewed_press_claims press ON press.id=c.id":"";
      const pressAdmission=reviewedPress?"("+pressGuard+" OR press.id IS NOT NULL)":pressGuard;
      const reviewedPointGate="json_type(c.precondition,'$.point_source') IS NULL";
      // Joining the materialized rows avoids the expression depth inherited
      // by an IN (SELECT ...) predicate in the main D1 claim statement.
      const reviewedPointJoin=paired?" LEFT JOIN reviewed_point_dispatch reviewed_point ON reviewed_point.id=c.id":"";
      const reviewedPointAdmission=paired?"("+reviewedPointGate+" OR reviewed_point.id IS NOT NULL)":reviewedPointGate;
      const reviewedPointValues=paired?[...caller.values,session,broadcast,worker,lease,control]:[];
      statements.push(this.e.stmt(`${claimCTE}UPDATE sb_mouse_commands SET
        state=CASE WHEN ?=1 AND kind IN ('pointer.move_relative','pointer.move_absolute','pointer.click','pointer.scroll','keyboard.open_search','${DRAG_KIND}') THEN 'executing'
          WHEN ?=1 AND kind='app.search_prepare' THEN 'executing'
          WHEN ?=1 AND kind IN ('spotlight.type_google_map','keyboard.type_text') AND json_extract(precondition,'$.spotlight_transport')='stable_usb'
            AND EXISTS(SELECT 1 FROM sb_hardware live_board WHERE live_board.device_id=sb_mouse_commands.device_id
              AND live_board.owner_id=sb_mouse_commands.owner_id AND live_board.board_boot_id=sb_mouse_commands.board_boot_id
              AND json_extract(live_board.metadata,CASE WHEN sb_mouse_commands.kind='keyboard.type_text'
                THEN '$.capabilities."hid.keyboard.ascii_stable"' ELSE '$.capabilities."hid.keyboard.spotlight_stable"' END)=1
              AND json_extract(live_board.metadata,CASE WHEN sb_mouse_commands.kind='keyboard.type_text'
                THEN '$.capabilities."sayso.focused_text"' WHEN json_extract(sb_mouse_commands.payload,'$.probe_keyboard')=1
                THEN '$.capabilities."sayso.spotlight_wired_probe"' ELSE '$.capabilities."sayso.spotlight_wired"' END)=1) THEN 'executing'
          ELSE 'claimed' END,
        worker_id=?,lease_epoch=?,input_attempted=CASE WHEN json_extract(precondition,'$.point.protocol')=? OR json_extract(precondition,'$.field_input_validation')='${noVisualFieldProtocol}' OR
          json_type(precondition,'$.reviewed_press')='object' THEN NULL ELSE input_attempted END
        WHERE id=(
          SELECT c.id FROM sb_mouse_commands c JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id
          JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id
          JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id${reviewedPointJoin}${pressJoin} LEFT JOIN drag_dispatch drag_view ON drag_view.id=c.id
          WHERE (${caller.sql} AND c.session_id=s.id AND s.id=? AND s.broadcast_id=?
            AND s.mode='broadcast' AND (?=0 OR s.control_epoch=?))
            AND (json_extract(c.precondition,'$.point') IS NULL OR (?=1 AND json_extract(c.precondition,'$.point.protocol')=?
              AND EXISTS(SELECT 1 FROM sb_mouse_commands k WHERE k.id=json_extract(c.precondition,'$.point.click_command_id')
                AND k.predecessor_id=c.id AND k.owner_id=c.owner_id AND k.device_id=c.device_id AND k.session_id=c.session_id
                AND k.hardware_id=c.hardware_id AND k.board_boot_id=c.board_boot_id AND k.control_epoch=c.control_epoch
                AND k.expires_at=c.expires_at AND k.kind='pointer.click' AND k.payload='{"button":"left"}' AND k.state='embedded')))
            AND (c.state='queued' AND (c.predecessor_id IS NULL ${reviewedPress?"OR press.id IS NOT NULL":""} OR EXISTS(SELECT 1 FROM sb_mouse_commands p
              WHERE p.id=c.predecessor_id AND p.owner_id=c.owner_id AND p.device_id=c.device_id AND p.state='succeeded')))
            AND (c.expires_at>? AND d.revoked=0 AND d.worker_expires>? AND d.worker_id=? AND d.lease_epoch=?
            AND s.state='active' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.mouse_until>? AND s.control_epoch=c.control_epoch)
            AND (h.usb_connected=1 AND h.hardware_id=c.hardware_id AND h.board_boot_id=c.board_boot_id)
            AND ${fieldDispatchCapabilitiesSQL("c","h.metadata")}
            ${spotlightPregrant?"":"AND json_type(c.precondition,'$.field_input_validation') IS NULL"}
            AND (c.kind!='keyboard.type_text' OR c.worker_id IS NULL OR (c.worker_id=d.worker_id AND c.lease_epoch=d.lease_epoch))
            AND (c.kind!='${DRAG_KIND}' OR drag_view.id IS NOT NULL) AND ${reviewedPointAdmission} AND ${pressAdmission}
            AND (c.kind!='keyboard.open_search' OR (json_extract(h.metadata,'$.capabilities."hid.keyboard.system_search"')=1 AND json_extract(h.metadata,'$.capabilities."sayso.system_search"')=1 AND ${systemSearchDispatchGate("c")}))
            AND (c.kind!='app.search_prepare' OR (?=1 AND json_extract(h.metadata,'$.capabilities."sayso.app_search_prepare"')=1
              AND json_extract(h.metadata,'$.capabilities."hid.keyboard.system_search"')=1 AND json_extract(h.metadata,'$.capabilities."hid.keyboard.ascii_stable"')=1))
            AND (NOT EXISTS(SELECT 1 FROM sb_mouse_commands other WHERE other.device_id=d.id AND other.state IN ('claimed','executing'))${liveClock})
          ORDER BY c.created_at LIMIT 1
        ) AND state='queued' RETURNING *${dispatchProbe}${ttlProjection}`,...reviewedPointValues,...(reviewedPress?caller.values:[]),...caller.values,atomicRaw?1:0,searchPreparation?1:0,spotlightPregrant?1:0,worker,lease,PAIRED_MOUSE_POINT,...caller.values,session,broadcast,
        atomicRaw?1:0,control,paired?1:0,PAIRED_MOUSE_POINT,now,now,worker,lease,now,now,searchPreparation?1:0));
      if(paired) {
        // Only the parent won by the immediately preceding UPDATE can grant
        // its companion, under that same token and transaction. The child's
        // time fence is inherited from the successful parent transition.
        const childCaller:ScopeFence=device?{sql:"owner_id=? AND device_id=?",values:[device.owner_id,device.id]}:
          {sql:`EXISTS(SELECT 1 FROM sb_devices d WHERE d.token_hash=? AND d.revoked=0 AND
            d.id=sb_mouse_commands.device_id AND d.owner_id=sb_mouse_commands.owner_id)`,values:[tokenHash]};
        statements.push(this.e.stmt(`UPDATE sb_mouse_commands SET state='executing',worker_id=?,lease_epoch=?,input_attempted=NULL
          WHERE changes()=1 AND ${childCaller.sql} AND session_id=? AND control_epoch=? AND state='embedded'
            AND kind='pointer.click' AND payload='{"button":"left"}'
            AND EXISTS(SELECT 1 FROM sb_mouse_commands p WHERE p.id=sb_mouse_commands.predecessor_id
              AND p.owner_id=sb_mouse_commands.owner_id AND p.device_id=sb_mouse_commands.device_id AND p.session_id=sb_mouse_commands.session_id
              AND p.control_epoch=sb_mouse_commands.control_epoch AND p.hardware_id=sb_mouse_commands.hardware_id
              AND p.board_boot_id=sb_mouse_commands.board_boot_id AND p.expires_at=sb_mouse_commands.expires_at AND p.state='executing'
              AND p.worker_id=? AND p.lease_epoch=? AND p.expires_at>? AND json_extract(p.precondition,'$.point.protocol')=?
              AND json_extract(p.precondition,'$.point.click_command_id')=sb_mouse_commands.id) RETURNING *`,
          worker,lease,...childCaller.values,session,control,worker,lease,now,PAIRED_MOUSE_POINT));
      }
      const d1StartedAt=this.e.now(),d1Started=performance.now();
      const result=await this.e.db.batch<Command|LiveSession>(statements);
      const d1ObservedAt=this.e.now(),d1Elapsed=performance.now()-d1Started;
      pollCount++;
      if(checkScope) {
        const row=result[0].results[0] as (LiveSession&{auth_device_id?:string;auth_expires?:number})|undefined;
        if(!device)need(row?.auth_device_id,"UNAUTHENTICATED",401);
        const checked=this.e.checkLiveSession(row?.id?row:null,body,true,Math.max(now,row?.checked_at_ms??now));
        need(checked.mode==="broadcast","MOUSE_BROADCAST_REQUIRED",403);
        tokenExpires=row?.auth_expires??0;
        if(paired&&this.claimHints&&checked.control_epoch===control){
          timingScope={owner:checked.owner_id,device:checked.device_id,session,worker,lease,control};
        }
      }
      checkScope=false;
      declarationPending=false;
      const won=result[claimIndex].results[0] as Command|undefined;
      if(won){
        const stableSpotlightGrant=spotlightPregrant&&(won.kind===spotlightKind||won.kind===focusedTextKind);
        const searchGrant=searchPreparation&&won.kind===APP_SEARCH_KIND;
        if(atomicRaw&&won.state==="executing"&&(stableSpotlightGrant||searchGrant||won.kind===DRAG_KIND||Object.hasOwn(capabilities,won.kind))){
          // The phone deducts the transport time after this proven server prefix.
          const spec=pointSpec(won.precondition),click=spec?(result[claimIndex+1]?.results as Command[]|undefined)?.find(r=>r.id===spec.click_command_id):null;
          need(!spec||(paired&&click),"POINT_GRANT_INCOMPLETE");
          let pointReceiptProof:string|undefined;
          if(tokenHash&&click){
            const issued=this.e.now();
            this.receiptHints?.record(tokenHash,won,click,broadcast,issued,tokenExpires);
            pointReceiptProof=await this.e.issuePointReceiptProof(tokenHash,won,click,broadcast,issued,tokenExpires);
          }
          const prefix=Math.max(0,Math.floor(this.waitNow()-began));
          const dispatchProbeID=click?.state==="executing"&&click.predecessor_id===won.id&&
            typeof won.paired_dispatch_probe_id==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(won.paired_dispatch_probe_id)
            ?won.paired_dispatch_probe_id:undefined;
          const rawGrant=won.raw_claim_ttl_grant?record(JSON.parse(won.raw_claim_ttl_grant)):undefined;
          const extendedProfile=typeof rawGrant?.expires_at==="number"&&
            (rawGrant.profile===scopedSearchTTLProfile||rawGrant.profile===reviewedPointTTLProfile&&click?.state==="executing")?
              rawGrant.profile:undefined;
          const ttlCutoff=extendedProfile?Math.min(won.expires_at,Number(rawGrant?.expires_at)):won.expires_at;
          const ttlCap=stableSpotlightGrant||searchGrant?15000:extendedProfile?extendedRawClaimTTLMS:ordinaryRawClaimTTLMS;
          if(click)logPairedClickDiagnostic({event:"paired_click_claim",move_command_id:won.id,click_command_id:click.id,
            claim_poll_count:pollCount,claim_total_elapsed_ms:prefix,claim_poll_advanced:advanceForThisAttempt>=1,
            claim_d1_started_at_server_utc_ms:d1StartedAt,claim_commit_observed_at_server_utc_ms:d1ObservedAt,
            grant_prepared_at_server_utc_ms:this.e.now(),d1_timing:d1Timing("paired_claim",result,d1Elapsed,statements.length)});
          return {...this.dispatchOutput(won),...(click?{paired_click_command:this.output(click)}:{}),
            ...(dispatchProbeID?{paired_dispatch_probe_id:dispatchProbeID}:{}),
            ...(pointReceiptProof?{point_receipt_proof:pointReceiptProof}:{}),
            ...(searchGrant?{app_search_protocol:APP_SEARCH_CLAIM}:stableSpotlightGrant?{spotlight_dispatch_protocol:SPOTLIGHT_CLAIM_START}:{raw_dispatch_protocol:RAW_MOUSE_DISPATCH}),
            ...(extendedProfile?{raw_dispatch_ttl_profile:extendedProfile}:{}),
            claim_pregrant_elapsed_ms:prefix,
            ...(!stableSpotlightGrant&&advanceForThisAttempt>=1?{claim_poll_advance_ms:Math.floor(advanceForThisAttempt)}:{}),
            ttl_remaining_ms:Math.max(0,Math.min(ttlCap,ttlCutoff-this.e.now()))};
        }
        return this.dispatchOutput(won);
      }
      const afterAttempt=this.waitNow();
      if(afterAttempt>=deadline)return null;
      // A slow early miss also consumes the time its original slot would
      // have spent in D1 before another query could begin.
      if(advanceForThisAttempt>0)preserveRetryAt=Math.max(preserveRetryAt,afterAttempt+advanceForThisAttempt);
      let delay=raw?nextPollDelayMS(250,attemptStarted,afterAttempt,deadline):Math.min(250,deadline-afterAttempt);
      delay=Math.max(delay,Math.ceil(Math.min(deadline-afterAttempt,Math.max(0,preserveRetryAt-afterAttempt))));
      const scheduled=afterAttempt+delay;
      if(!advanced&&timingScope&&this.claimHints&&delay>=100&&scheduled<deadline){
        // Split an existing sleep. A miss after an early query keeps the
        // next original retry time, so the hint cannot add a D1 query.
        if(!this.claimHints.hasNewCommit(timingScope,now,this.e.now()))await this.waitSleep(Math.ceil(delay/2));
        const checkedAt=this.waitNow();
        if(checkedAt<scheduled&&this.claimHints.hasNewCommit(timingScope,now,this.e.now())){
          advanceForNext=scheduled-checkedAt;
          advanced=true;
          preserveRetryAt=scheduled+250;
          continue;
        }
        if(checkedAt<scheduled)await this.waitSleep(Math.ceil(scheduled-checkedAt));
      }else if(delay>0)await this.waitSleep(delay);
      if(this.waitNow()>=deadline)return null;
    } while (true);
  }
  async start(device: Device, id: string, body: Record<string, unknown>) {
    const session=uuid(body.bridge_session_id),broadcast=uuid(body.broadcast_id),worker=uuid(body.worker_id),lease=integer(body.lease_epoch,1),control=integer(body.control_epoch,1),now=this.e.now();
    const contextJoin=`JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id
      JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id
      JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id`;
    const gate=(name:string,condition:string)=>`${name} AS MATERIALIZED (
      SELECT c.id FROM start_context c ${contextJoin} WHERE ${condition})`;
    // Independent proof trees keep the legacy start path within D1's limit too.
    // All gates and the state transition still share one atomic statement.
    const statement = this.e.stmt(`WITH start_context AS MATERIALIZED (
      SELECT c.* FROM sb_mouse_commands c ${contextJoin}
      WHERE c.id=? AND c.device_id=? AND c.owner_id=? AND c.session_id=? AND c.state='claimed'
        AND json_type(c.precondition,'$.reviewed_press') IS NULL
        AND json_type(c.precondition,'$.field_input_validation') IS NULL
        AND (c.predecessor_id IS NULL OR EXISTS(SELECT 1 FROM sb_mouse_commands parent
          WHERE parent.id=c.predecessor_id AND parent.owner_id=c.owner_id AND parent.device_id=c.device_id AND parent.state='succeeded'))
        AND c.worker_id=? AND c.lease_epoch=? AND c.control_epoch=? AND c.expires_at>?
        AND d.revoked=0 AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>?
        AND s.id=c.session_id AND s.broadcast_id=? AND s.mode='broadcast' AND s.state='active'
        AND s.capture_state='active' AND s.mouse_enabled=1 AND s.mouse_until>? AND s.control_epoch=c.control_epoch
        AND h.usb_connected=1 AND h.hardware_id=c.hardware_id AND h.board_boot_id=c.board_boot_id
      ), ${gate("start_search",`(c.kind!='${SYSTEM_SEARCH_KIND}' OR (
        json_extract(h.metadata,'$.capabilities."hid.keyboard.system_search"')=1 AND
        json_extract(h.metadata,'$.capabilities."sayso.system_search"')=1 AND ${systemSearchDispatchGate("c")}))`)},
      ${gate("start_field",fieldDispatchCapabilitiesSQL("c","h.metadata"))},
      ${gate("start_drag",`(c.kind!='${DRAG_KIND}' OR ((${dragLiveCapabilities}) AND ${dragDispatchViewFenceSQL("c",databaseNowSQL)}))`)}
      UPDATE sb_mouse_commands SET state='executing'
      WHERE state='claimed' AND id IN (SELECT id FROM start_context)
        AND id IN (SELECT id FROM start_search) AND id IN (SELECT id FROM start_field) AND id IN (SELECT id FROM start_drag)
      RETURNING *`,uuid(id),device.id,device.owner_id,session,worker,lease,control,now,worker,lease,now,broadcast,now,now);
    need(body.pointer_prefetch_protocol==null||body.pointer_prefetch_protocol===POINTER_PREFETCH,"INVALID_PREFETCH_PROTOCOL",422);
    let row:Command|null,next:PrefetchCommand[]=[];
    if(body.pointer_prefetch_protocol===POINTER_PREFETCH){
      const prefetch=pointerPrefetchQuery({device:device.id,owner:device.owner_id,session,broadcast,worker,lease,control,parent:uuid(id)},databaseNowSQL);
      const batch=await this.e.db.batch<Command>([statement,this.e.stmt(prefetch.sql,...prefetch.values)]);
      row=batch[0].results[0]??null;next=batch[1].results;
    }else {row=await statement.first<Command>();}
    need(row, "MOUSE_EXPIRED_OR_CONTROL_CHANGED");
    const prefetched=pointerPrefetchEnvelopes(next,this.e.now(),row.id);
    return { ...this.dispatchOutput(row), ttl_remaining_ms: Math.max(0,Math.min(row.kind === "pointer.local_plan" || row.kind===spotlightKind || row.kind===focusedTextKind ? 15000 : 2500, row.expires_at - this.e.now())),prefetched_pointer_command:prefetched[0]??null,prefetched_pointer_commands:prefetched };
  }
  private async authenticatedResultContext(tokenHash:string,command:string|null) {
    const row=await this.e.stmt(
      "SELECT "+resultColumns+",d.id AS auth_device_id,d.owner_id AS auth_owner_id,d.token_expires AS auth_expires,d.confirmed_at AS auth_confirmed"+
      " FROM sb_devices d LEFT JOIN sb_mouse_commands c ON c.id=? AND c.device_id=d.id AND c.owner_id=d.owner_id"+resultSessionJoin+
      " WHERE d.token_hash=? AND d.revoked=0 AND d.token_expires>? AND d.token_expires>"+databaseNowSQL,command,tokenHash,this.e.now()).first<ResultAuthRow>();
    need(row&&row.auth_expires>this.e.now(),"UNAUTHENTICATED",401);
    return row;
  }
  async resultRequest(request:Request,id:string,readBody:()=>Promise<Record<string,unknown>>) {
    const receivedAt=this.e.now();
    const tokenHash=await deviceTokenHash(request);
    // A malformed selector cannot bypass authentication or consume the body
    // before token verification. The normal UUID check runs after parsing.
    const selector=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)?id.toLowerCase():null;
    let claim:ClaimedReceipt|undefined=selector?this.receiptHints?.take(tokenHash,selector,this.e.now()):undefined;
    const claimSource:ReceiptPreparationSource=claim?"same_isolate_hint":"signed_receipt_proof";
    const proofSupplied=request.headers.has(pointReceiptProofHeader);
    if(!claim&&selector){
      const proof=request.headers.get(pointReceiptProofHeader);
      if(proof!==null)claim=await this.e.verifyPointReceiptProof(tokenHash,selector,proof)??undefined;
    }
    let body:Record<string,unknown>|undefined;
    if(claim){
      try {body=await readBody();}
      catch(error){
        await this.authenticatedResultContext(tokenHash,selector);
        throw error;
      }
      const pair=this.validateClaimReceipt(claim,body);
      if(pair){
        const move=pair.move,device={id:move.device_id,owner_id:move.owner_id};
        const identity={session:move.session_id,worker:move.worker_id,lease:move.lease_epoch};
        // The authenticated, immutable grant only prepares the input. No
        // exception after entering the guarded write can replay that write.
        return this.commitPairedResult(device,pair,body,identity,tokenHash,claimSource,{receivedAt,authenticatedAt:this.e.now()});
      }
    }
    const authStarted=this.waitNow(),snapshot=await this.authenticatedResultContext(tokenHash,selector),authenticatedAt=this.e.now();
    if(snapshot.id&&snapshot.kind==="pointer.move_absolute"&&snapshot.point_child_json){
      // Authenticated original command only; never record proof/header values.
      const elapsed=this.waitNow()-authStarted;
      try {console.info(JSON.stringify({event:"paired_result_auth_snapshot_used",command_id:snapshot.id,
        source:claim?"prepared_receipt_ineligible":proofSupplied?"unusable_receipt_proof":"missing_receipt_proof",
        ...(Number.isFinite(elapsed)?{auth_snapshot_ms:Math.max(0,Math.round(elapsed))}:{})}));}catch{/* Diagnostics cannot change receipt handling. */}
    }
    const device={id:snapshot.auth_device_id,owner_id:snapshot.auth_owner_id};
    if(snapshot.auth_confirmed==null){
      const now=this.e.now();
      await this.e.stmt("UPDATE sb_devices SET confirmed_at=? WHERE id=? AND owner_id=? AND confirmed_at IS NULL AND revoked=0 AND token_hash=? AND token_expires>? AND token_expires>"+databaseNowSQL,
        now,device.id,device.owner_id,tokenHash,now).run();
    }
    body??=await readBody();
    need(snapshot.auth_expires>this.e.now(),"UNAUTHENTICATED",401);
    return this.applyResult(device,id,body,{context:snapshot.id?snapshot:null,tokenHash,ingress:{receivedAt,authenticatedAt}});
  }
  private validateClaimReceipt(claim:ClaimedReceipt,body:Record<string,unknown>):ValidatedPair|null {
    if(claim.expires<=this.e.now()||body.state!=="board_acked")return null;
    const {move,click}=claim;
    try {
      if(uuid(body.bridge_session_id)!==move.session_id||uuid(body.broadcast_id)!==claim.broadcast||
        uuid(body.worker_id)!==move.worker_id||integer(body.lease_epoch,1)!==move.lease_epoch)return null;
      const parts=validatePointResult(move,click,body);
      return parts.move.state==="board_acked"&&parts.click.state==="board_acked"?{move,click,parts}:null;
    } catch {
      // Re-enter the ordinary authenticated path before reporting any
      // validation error. Only a successful pair can use the fast path.
      return null;
    }
  }
  private checkResultScope(row:ResultContext|null,body:Record<string,unknown>,{session,worker,lease}:ResultIdentity) {
    need(row,"NOT_FOUND",404);
    need(row.kind!=="pointer.local_plan","POINTER_RESULT_ENDPOINT_REQUIRED",422);
    need(row.kind!==APP_SEARCH_KIND,"SEARCH_PREPARATION_RESULT_ENDPOINT_REQUIRED",422);
    need(row.live_session===session && row.live_state==="active","STALE_SESSION");
    if(row.live_mode==="broadcast")need(row.live_broadcast===uuid(body.broadcast_id),"STALE_SESSION");
    else need(row.live_mode==="foreground_diagnostic" && body.broadcast_id==null,"STALE_SESSION");
    need(row.live_worker===worker && row.live_epoch===lease && row.live_expires>this.e.now(),"STALE_LEASE");
    need(row.session_id === session && row.worker_id === worker && row.lease_epoch === lease, "STALE_LEASE");
    return row;
  }
  private async refreshResultScope(device:ResultDevice,command:string,body:Record<string,unknown>,identity:ResultIdentity,tokenHash:string) {
    const current=await this.authenticatedResultContext(tokenHash,command);
    need(current.auth_device_id===device.id&&current.auth_owner_id===device.owner_id,"UNAUTHENTICATED",401);
    return this.checkResultScope(current.id?current:null,body,identity);
  }
  private resultTokenFence(tokenHash:string|undefined,now:number):ScopeFence|undefined {
    if(!tokenHash)return undefined;
    return {sql:"EXISTS(SELECT 1 FROM sb_devices a WHERE a.id=sb_mouse_commands.device_id AND a.owner_id=sb_mouse_commands.owner_id AND a.revoked=0 AND a.token_hash=? AND a.token_expires>? AND a.token_expires>"+databaseNowSQL+")",values:[tokenHash,now]};
  }
  async result(device:Device,id:string,body:Record<string,unknown>) {
    return this.applyResult(device,id,body);
  }
  private async applyResult(device:ResultDevice,id:string,body:Record<string,unknown>,prepared?:PreparedResult) {
    const command=uuid(id),session=uuid(body.bridge_session_id),worker=uuid(body.worker_id),lease=integer(body.lease_epoch,1);
    const identity={session,worker,lease},tokenHash=prepared?.tokenHash;
    const initial=prepared?prepared.context:await this.e.stmt("SELECT "+resultColumns+" FROM sb_mouse_commands c JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id"+resultSessionJoin+
      " WHERE c.id=? AND c.device_id=? AND c.owner_id=? AND d.revoked=0",command,device.id,device.owner_id).first<ResultContext>();
    // Read-only replays and misses recheck the scope after body IO. Fresh
    // submissions use the guarded write below as their live authority check.
    const row=tokenHash&&(!initial||initial.result_digest)?await this.refreshResultScope(device,command,body,identity,tokenHash):this.checkResultScope(initial,body,identity);
    if(pointSpec(row.precondition))return this.pairedResult(device,row,body,identity,tokenHash,prepared?.ingress);
    const recoveredPress=row.kind==="pointer.click"&&row.precondition&&JSON.parse(row.precondition).reviewed_press?.protocol===reviewedPressProtocol;
    need(row.predecessor_id==null||recoveredPress,"POINT_CHILD_RESULT_REQUIRES_PARENT",422);
    need(body.point_result==null,"POINT_RESULT_UNEXPECTED",422);
    need(["board_acked", "failed", "outcome_unknown"].includes(String(body.state)), "INVALID_RESULT", 422);
    const originalReceipt = record(body.board_receipt), digest = await hash(JSON.stringify(body));
    const wiredInput=row.kind===spotlightKind||row.kind===focusedTextKind;
    const precondition=JSON.parse(row.precondition??"{}");
    const stableUSB=wiredInput&&precondition.spotlight_transport==="stable_usb";
    const focused=row.kind===focusedTextKind,payload=focused?JSON.parse(row.payload):{};
    const submitEnter=payload.submit_enter===true,clearBeforeInput=payload.clear_before_input===true;
    const noVisual=focused&&precondition.field_input_validation===noVisualFieldProtocol;
    if(noVisual)need((body.state==="failed"?body.input_submitted===false:body.input_submitted===true)||
      body.state==="outcome_unknown"&&body.input_submitted===null,"INVALID_FOCUSED_TEXT_RECEIPT",422);
    const validatedReceipt = wiredInput?spotlightReceipt(body,originalReceipt,row.id,row.board_boot_id,stableUSB,focused,submitEnter,noVisual,clearBeforeInput):originalReceipt;
    need(body.error!=="MOUSE_DISPATCH_BUDGET_EXPIRED" || (body.state==="failed" && Object.keys(originalReceipt).length===0),"NO_INPUT_PROOF_CONFLICT",422);
    const relativePreflight=row.kind===DRAG_KIND&&isDragNoInputPreflightError(body.error);
    if(relativePreflight)need(body.state==="failed"&&body.input_submitted===false&&Object.keys(originalReceipt).length===0,"NO_INPUT_PROOF_CONFLICT",422);
    const recoveredPressNoInput=recoveredPress&&body.state==="failed"&&body.input_submitted===false&&
      Object.keys(originalReceipt).length===0&&(body.error==="MOUSE_PRECONDITION_FAILED"||body.error==="MOUSE_DISPATCH_BUDGET_EXPIRED");
    if(recoveredPress){
      need(recoveredPressNoInput||body.state==="outcome_unknown"&&body.input_submitted===true||
        body.state==="board_acked"&&body.input_submitted===true&&body.error==null&&originalReceipt.error==null&&
        originalReceipt.subcommand_index===0,"INVALID_REVIEWED_PRESS_RESULT",422);
    }
    // A proven pre-input rejection has no board receipt. The optional wired
    // restoration envelope must not turn that empty receipt into input evidence.
    const noInput=relativePreflight||recoveredPressNoInput||(body.state==="failed"&&(noVisual||body.error==="MOUSE_DISPATCH_BUDGET_EXPIRED")&&Object.keys(originalReceipt).length===0);
    const receipt=noInput?originalReceipt:validatedReceipt;
    if (row.result_digest) { need(row.result_digest === digest, "RESULT_CONFLICT"); return this.output(row); }
    if (body.state === "board_acked") need((wiredInput || (originalReceipt.command_id === row.id && originalReceipt.board_boot_id === row.board_boot_id && originalReceipt.state === "executed" && record(originalReceipt.effect).hid_reports_sent === true)) && typeof body.finished_client_mono_ms === "number" && Number.isFinite(body.finished_client_mono_ms)&&body.finished_client_mono_ms>=0&&body.finished_client_mono_ms<=Number.MAX_SAFE_INTEGER, "INVALID_BOARD_RECEIPT", 422);
    if(body.state==="board_acked"&&row.kind===SYSTEM_SEARCH_KIND){
      const effect=record(originalReceipt.effect);
      need(originalReceipt.subcommand_index===0&&originalReceipt.error==null&&body.error==null&&effect.system_search_stable===true&&effect.all_released===true,"INVALID_SYSTEM_SEARCH_RECEIPT",422);
    }
    if(body.state==="board_acked"&&row.kind===DRAG_KIND){
      need(body.error==null,"INVALID_DRAG_RECEIPT",422);
      validateDragReceipt(originalReceipt,row.id,row.board_boot_id,true,JSON.parse(row.payload).duration_ms,JSON.parse(row.payload));
    }else if(row.kind===DRAG_KIND&&Object.keys(originalReceipt).length>0){
      need(body.state==="outcome_unknown"&&body.error==="USB_OUTCOME_UNKNOWN"&&body.input_submitted===true,"INVALID_DRAG_RECEIPT",422);
      validateDragReceipt(originalReceipt,row.id,row.board_boot_id,false,JSON.parse(row.payload).duration_ms,JSON.parse(row.payload));
    }
    if(row.kind===POINTER_SCROLL_KIND&&hasPacedWheelEvidence(originalReceipt)){
      const executed=body.state==="board_acked";
      need(executed?body.error==null:body.state==="outcome_unknown"&&body.error==="USB_OUTCOME_UNKNOWN"&&body.input_submitted===true,
        "INVALID_WHEEL_RECEIPT",422);
      validatePacedWheelReceipt(originalReceipt,row.id,row.board_boot_id,JSON.parse(row.payload).steps,executed);
    }
    const ackMono=body.state==="board_acked"?body.finished_client_mono_ms as number:null;
    if (body.state === "board_acked" && row.kind === "pointer.move_absolute") {
      const requested = JSON.parse(row.payload), effect = record(originalReceipt.effect);
      need(effect.absolute_requested_x === requested.x && effect.absolute_requested_y === requested.y, "ABSOLUTE_RECEIPT_MISMATCH", 422);
    }
    // Only the authenticated current phone can assert this typed, pre-USB
    // rejection. It settles failure, never an acknowledgement or authority.
    const stateGate=noInput?"(state='executing' OR (state='outcome_unknown' AND error='EXPIRED_OR_CONTROL_CHANGED' AND result_digest IS NULL))":"state='executing' AND expires_at>?";
    const now=this.e.now(),fence=this.resultTokenFence(tokenHash,now);
    const authGate=fence?" AND "+fence.sql:"",authValues=fence?.values??[];
    const noInputEvidence=relativePreflight||recoveredPressNoInput||noVisual&&body.state==="failed"?",input_attempted=0":
      recoveredPress||noVisual&&body.input_submitted===true?",input_attempted=1":"";
    const saved = await this.e.stmt("UPDATE sb_mouse_commands SET state=?,receipt=?,phone_ack_mono_ms=?,result_digest=?,error=?" + noInputEvidence + " WHERE id=? AND owner_id=? AND result_digest IS NULL AND " + stateGate + " AND EXISTS(SELECT 1 FROM sb_sessions s JOIN sb_devices d ON d.current_session=s.id AND s.owner_id=d.owner_id JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id WHERE d.id=sb_mouse_commands.device_id AND d.owner_id=sb_mouse_commands.owner_id AND d.revoked=0 AND d.worker_id=? AND d.worker_id=sb_mouse_commands.worker_id AND d.lease_epoch=? AND d.lease_epoch=sb_mouse_commands.lease_epoch AND d.worker_expires>? AND s.id=sb_mouse_commands.session_id AND s.id=? AND s.broadcast_id=? AND s.mode='broadcast' AND s.mouse_enabled=1 AND s.mouse_until>? AND s.control_epoch=sb_mouse_commands.control_epoch AND s.state='active' AND s.capture_state='active' AND h.usb_connected=1 AND h.board_boot_id=sb_mouse_commands.board_boot_id AND h.hardware_id=sb_mouse_commands.hardware_id)" + authGate + " RETURNING *", body.state, JSON.stringify(receipt), ackMono, digest, body.error == null ? null : text(body.error, 120), row.id,device.owner_id, ...(noInput?[]:[now]),worker,lease,now,session,row.live_broadcast,now,...authValues).first<Command>();
    if(saved)return this.output(saved);
    // Slow failures retain expiration/evidence handling. Successful receipts
    // do not pay for extra expiry and readback database round trips.
    if(tokenHash)await this.refreshResultScope(device,row.id,body,identity,tokenHash);
    await this.expire(device.id,tokenHash?device.owner_id:undefined,fence);
    const concurrent=await this.e.stmt("SELECT * FROM sb_mouse_commands WHERE id=? AND owner_id=?"+authGate,row.id,device.owner_id,...authValues).first<Command>();
    if(concurrent?.result_digest){need(concurrent.result_digest===digest,"RESULT_CONFLICT");return this.output(concurrent);}
    if(!noInput) {
      // Retain an expired acknowledgement/ambiguous report as evidence while
      // leaving its outcome unknown. A contradictory later no-send claim must
      // not downgrade evidence that input may already have reached USB.
      await this.e.stmt("UPDATE sb_mouse_commands SET receipt=?,phone_ack_mono_ms=?,result_digest=?,error=CASE WHEN error='EXPIRED_OR_CONTROL_CHANGED' THEN ? ELSE error END WHERE id=? AND owner_id=? AND state='outcome_unknown' AND result_digest IS NULL"+authGate,JSON.stringify(receipt),ackMono,digest,"LATE_"+String(body.state).toUpperCase()+"_UNCONFIRMED",row.id,device.owner_id,...authValues).run();
    }
    need(false,"STALE_MOUSE_RECEIPT");
  }
  private async pairedResult(device:ResultDevice,row:ResultContext,body:Record<string,unknown>,identity:ResultIdentity,tokenHash?:string,ingress?:ResultIngress){
    need(row.live_mode==="broadcast"&&row.point_child_json,"POINT_CHILD_MISMATCH",422);
    const child=JSON.parse(row.point_child_json) as Command;
    return this.commitPairedResult(device,{move:row,click:child,parts:validatePointResult(row,child,body)},body,identity,tokenHash,false,ingress);
  }
  private async commitPairedResult(device:ResultDevice,pair:ValidatedPair,body:Record<string,unknown>,
    identity:ResultIdentity,tokenHash?:string,fromClaim:ReceiptPreparationSource|false=false,ingress?:ResultIngress){
    const {move:row,click:child,parts}=pair,digest=await hash(JSON.stringify(body));
    if(row.result_digest||child.result_digest){
      need(row.result_digest===digest&&child.result_digest===digest,"RESULT_CONFLICT");return this.output(row);
    }
    const now=this.e.now(),{worker,lease,session}=identity,broadcast=uuid(body.broadcast_id);
    const fence=this.resultTokenFence(tokenHash,now),authGate=fence?" AND "+fence.sql:"",authValues=fence?.values??[];
    const stateGate=(alias:string)=>parts.noInput?"("+alias+"state='executing' OR ("+alias+"state='outcome_unknown' AND "+alias+"error='EXPIRED_OR_CONTROL_CHANGED' AND "+alias+"receipt IS NULL))":alias+"state='executing' AND "+alias+"expires_at>?";
    const live="EXISTS(SELECT 1 FROM sb_sessions s JOIN sb_devices d ON d.current_session=s.id AND s.owner_id=d.owner_id JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id WHERE d.id=sb_mouse_commands.device_id AND d.owner_id=sb_mouse_commands.owner_id AND d.revoked=0 AND d.worker_id=? AND d.worker_id=sb_mouse_commands.worker_id AND d.lease_epoch=? AND d.lease_epoch=sb_mouse_commands.lease_epoch AND d.worker_expires>? AND s.id=sb_mouse_commands.session_id AND s.id=? AND s.broadcast_id=? AND s.mode='broadcast' AND s.state='active' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.mouse_until>? AND s.control_epoch=sb_mouse_commands.control_epoch AND h.usb_connected=1 AND h.hardware_id=sb_mouse_commands.hardware_id AND h.board_boot_id=sb_mouse_commands.board_boot_id)";
    const liveValues=[worker,lease,now,session,broadcast,now];
    const childGate="EXISTS(SELECT 1 FROM sb_mouse_commands k WHERE k.id=? AND k.predecessor_id=sb_mouse_commands.id AND k.owner_id=sb_mouse_commands.owner_id AND k.device_id=sb_mouse_commands.device_id AND k.session_id=sb_mouse_commands.session_id AND k.hardware_id=sb_mouse_commands.hardware_id AND k.board_boot_id=sb_mouse_commands.board_boot_id AND k.worker_id=sb_mouse_commands.worker_id AND k.lease_epoch=sb_mouse_commands.lease_epoch AND k.control_epoch=sb_mouse_commands.control_epoch AND k.expires_at=sb_mouse_commands.expires_at AND k.kind='pointer.click' AND k.payload=? AND k.digest=? AND k.precondition=? AND k.result_digest IS NULL AND "+stateGate("k.")+")";
    const m=parts.move,c=parts.click;
    const statements=[
      this.e.stmt("UPDATE sb_mouse_commands SET state=?,receipt=?,phone_ack_mono_ms=?,result_digest=?,error=?,input_attempted=? WHERE id=? AND owner_id=? AND digest=? AND payload=? AND precondition=? AND result_digest IS NULL AND "+stateGate("")+" AND "+childGate+" AND "+live+authGate+" RETURNING *",m.state,JSON.stringify(m.receipt),m.ack,digest,m.error,m.attempted?1:0,row.id,device.owner_id,row.digest,row.payload,row.precondition,...(parts.noInput?[]:[now]),child.id,child.payload,child.digest,child.precondition,...(parts.noInput?[]:[now]),...liveValues,...authValues),
      this.e.stmt("UPDATE sb_mouse_commands SET state=?,receipt=?,phone_ack_mono_ms=?,result_digest=?,error=?,input_attempted=? WHERE id=? AND owner_id=? AND predecessor_id=? AND result_digest IS NULL AND changes()=1 AND "+stateGate("")+" AND EXISTS(SELECT 1 FROM sb_mouse_commands p WHERE p.id=sb_mouse_commands.predecessor_id AND p.owner_id=sb_mouse_commands.owner_id AND p.device_id=sb_mouse_commands.device_id AND p.session_id=sb_mouse_commands.session_id AND p.worker_id=sb_mouse_commands.worker_id AND p.lease_epoch=sb_mouse_commands.lease_epoch AND p.control_epoch=sb_mouse_commands.control_epoch AND p.hardware_id=sb_mouse_commands.hardware_id AND p.board_boot_id=sb_mouse_commands.board_boot_id AND p.expires_at=sb_mouse_commands.expires_at AND p.result_digest=?) AND "+live+" RETURNING *",c.state,JSON.stringify(c.receipt),c.ack,digest,c.error,c.attempted?1:0,child.id,device.owner_id,row.id,...(parts.noInput?[]:[now]),digest,...liveValues),
    ];
    const startedAt=this.e.now(),started=performance.now();
    const observeCommit=(outcome:"committed"|"not_observed"|"rpc_error",results:unknown)=>{
      const observedAt=this.e.now(),elapsed=performance.now()-started,committed=outcome==="committed";
      logPairedClickDiagnostic({event:"paired_click_receipt_commit",move_command_id:row.id,click_command_id:child.id,
        auth_source:fromClaim||(ingress?"authenticated_snapshot":"direct_device"),receipt_ingress_at_server_utc_ms:ingress?.receivedAt??null,
        receipt_authenticated_at_server_utc_ms:ingress?.authenticatedAt??null,receipt_d1_started_at_server_utc_ms:startedAt,
        receipt_commit_observed_at_server_utc_ms:committed?observedAt:null,receipt_d1_returned_at_server_utc_ms:observedAt,
        commit_outcome:outcome,move_state:committed?m.state:null,click_state:committed?c.state:null,
        d1_timing:d1Timing("paired_receipt_commit",results,elapsed,statements.length)});
    };
    const result=await this.e.db.batch<Command>(statements).catch(error=>{
      observeCommit("rpc_error",null);
      throw error;
    });
    observeCommit(result[0].results[0]&&result[1].results[0]?"committed":"not_observed",result);
    if(result[0].results[0]&&result[1].results[0]){
      const savedMove=result[0].results[0],savedClick=result[1].results[0];
      if(savedMove.state==="board_acked"&&savedClick.state==="board_acked"&&savedClick.phone_ack_mono_ms!==null){
        try{this.e.pairedShadow?.receiptCommitted({owner:savedMove.owner_id,device:savedMove.device_id,session:savedMove.session_id,broadcast,
          worker:savedMove.worker_id,lease:savedMove.lease_epoch,control:savedMove.control_epoch,hardware:savedMove.hardware_id,
          boot:savedMove.board_boot_id,move:savedMove.id,click:savedClick.id,ack:savedClick.phone_ack_mono_ms});}catch{}
      }
      if(fromClaim){try {console.info(JSON.stringify({event:"paired_result_claim_snapshot_used",command_id:row.id,source:fromClaim}));}catch{/* Diagnostics cannot change a committed result. */}}
      return this.output(result[0].results[0]);
    }
    if(tokenHash){
      const fresh=await this.refreshResultScope(device,row.id,body,identity,tokenHash);
      const savedChild=fresh.point_child_json?JSON.parse(fresh.point_child_json) as Command:null;
      if(fresh.state==="board_acked"&&savedChild?.state==="board_acked"&&
        fresh.result_digest===digest&&savedChild.result_digest===digest)return this.output(fresh);
      if(fromClaim){
        // A reusable preparation can meet a committed result on another
        // instance. Reuse this authenticated readback, not another write.
        if(fresh.result_digest||savedChild?.result_digest){
          need(savedChild,"POINT_CHILD_MISMATCH",422);
          need(fresh.result_digest===digest&&savedChild.result_digest===digest,"RESULT_CONFLICT");
          return this.output(fresh);
        }
      }
    }
    await this.expire(device.id,tokenHash?device.owner_id:undefined,fence);
    const current=await this.e.stmt("SELECT * FROM sb_mouse_commands WHERE owner_id=? AND device_id=? AND id IN (?,?)"+authGate,device.owner_id,device.id,row.id,child.id,...authValues).all<Command>();
    if(current.results.length===2&&current.results.every(r=>r.result_digest===digest))return this.output(current.results.find(r=>r.id===row.id)!);
    // Expired/changed-scope input stays unknown. Preserve authenticated late
    // receipts, never promote them into a successful after-image barrier.
    await this.e.db.batch([
      ...[[row.id,m],[child.id,c]].map(([id,part])=>{const p=part as typeof m;return this.e.stmt("UPDATE sb_mouse_commands SET receipt=?,phone_ack_mono_ms=?,result_digest=?,error=CASE WHEN error='EXPIRED_OR_CONTROL_CHANGED' THEN 'LATE_POINT_UNCONFIRMED' ELSE error END WHERE id=? AND owner_id=? AND state='outcome_unknown' AND result_digest IS NULL"+authGate,JSON.stringify(p.receipt),p.ack,digest,id,device.owner_id,...authValues);}),
    ]);
    need(false,"STALE_POINT_RECEIPT");
  }
  private async stopScoped(user:User,device:string,session:string,epoch:number) {
    const result=await this.e.db.batch([
      this.e.stmt("UPDATE sb_sessions SET mouse_enabled=0,mouse_until=0,control_epoch=control_epoch+1 WHERE id=? AND device_id=? AND owner_id=? AND control_epoch=? AND state='active' AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=sb_sessions.device_id AND d.owner_id=sb_sessions.owner_id AND d.current_session=sb_sessions.id AND d.revoked=0)",session,device,user.id,epoch),
      this.e.stmt("UPDATE sb_mouse_commands SET state=CASE WHEN state='executing' THEN 'outcome_unknown' ELSE 'cancelled' END,error='PHONE_SCOPE_STOPPED' WHERE device_id=? AND owner_id=? AND session_id=? AND control_epoch=? AND state IN ('queued','claimed','executing','embedded')",device,user.id,session,epoch),
      this.e.stmt("UPDATE sb_browse_runs SET state=CASE WHEN lease_seq>0 AND queue_json!='[]' THEN 'outcome_unknown' ELSE 'cancelled' END,error='PHONE_SCOPE_STOPPED',revision=revision+1 WHERE device_id=? AND owner_id=? AND session_id=? AND control_epoch=? AND state='active'",device,user.id,session,epoch),
    ]);
    return {stopped:true,scope_matched:result[0].meta.changes===1,target_bridge_session_id:session,target_control_epoch:epoch,board_release_confirmed:false};
  }
  async stop(user: User, args: Record<string, unknown>) {
    const r = await this.ready(user, args.device_id);
    await this.e.db.batch([
      this.e.stmt("UPDATE sb_sessions SET mouse_enabled=0,mouse_until=0,control_epoch=control_epoch+1,mouse_grant_request='00000000-0000-4000-8000-000000000000' WHERE id=? AND owner_id=?", r.session_id, user.id),
      this.e.stmt("UPDATE sb_mouse_commands SET state=CASE WHEN state='executing' THEN 'outcome_unknown' ELSE 'cancelled' END,error='USER_STOPPED' WHERE device_id=? AND session_id=? AND state IN ('queued','claimed','executing','embedded')", r.id, r.session_id),
      this.e.stmt("UPDATE sb_browse_runs SET state=CASE WHEN lease_seq>0 AND queue_json!='[]' THEN 'outcome_unknown' ELSE 'cancelled' END,error='USER_STOPPED',revision=revision+1 WHERE device_id=? AND session_id=? AND state='active'",r.id,r.session_id),
    ]);
    return { device_id: r.id, stopped: true, screen_sharing_stopped: false, board_release_confirmed: false };
  }
}
