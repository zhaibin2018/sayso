import {replaceOtherSharingStatements,cleanReplacedSharing,replacementHeartbeat,sharingReplaced,rememberPhoneName} from "./phone-sharing.ts";
import {operationCancelDirective} from "./operation-cancel.ts";import {idleDirective} from "./tool-activity.ts";
import {diagnosticsEnabled} from "./build-profile.ts";import {journalFrame} from "./timing-journal.ts";
import {clockJSON,eventClockVersion,type EventClock} from "./event-clock.ts";
import {sessionClockDeclaration} from "./event-clock-scope.ts";
import {deleteImagePrefix} from "./image-retention.ts";
import {staticInputCurrent} from "./static-input-freshness.ts";
import {visualPointSource} from "./visual-point-source.ts";
import {erasureAwareBucket,erasureSafeSchedule} from "./erasure-storage.ts";
import {requestDeviceErasure} from "./device-erasure.ts";
import {requestSharingErasure} from "./sharing-erasure.ts";
import {runMaintenance} from "./retention-maintenance.ts";
import {stoppedInputStatements} from "./control-stop.ts";
import {currentFrameReferenceRetentionMS} from "./current-frame-reference.ts";
import {livePairedClickShadow,type PairedClickShadowRegistry} from "./paired-click-shadow.ts";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {noLaterSearchInputSQL,sourceViewLifetimeMS,sourceViewPreviousAgeMS} from "./source-view-proof.ts";
import {validatedJpegDimensions,jpegValidationProfile} from "./jpeg-validation.ts";
import {captureFreshness,staticFrameEligible,legacyRepeatedResult,clearStaticProofQuery,staticScreenResult,staticProofKey} from "./static-screen-freshness.ts";
import {databaseNowSQL,screenSnapshotQuery,visualPointScopeSQL,type ScreenSnapshotRoute} from "./screen-snapshot-query.ts";
import {authenticatedObservationPlan} from "./authenticated-observation-query.ts";
import {frameAcceptanceEvidenceSQL} from "./frame-acceptance-evidence.ts";
import {scopeBoundFieldCapability,scopeBoundLinkedPointCapability,scopeBoundSystemSearchFieldCapability,
  visualReadPointCapability,visualReadPointLedgerKey,visualReadPointLifetimeMS,type CompoundQueryViewProof,
  type ParkedMovePointProof,type ReleasedFieldViewProof,type VisualReadPointProof} from "./compound-query-view-proof.ts";
import {parkedPressSelector,parkedPressSelectorLedgerKey,reviewedPressCapability} from "./reviewed-press.ts";
import type {NativeSearchReviewState} from "./native-search-review.ts";
import {FrameUploadPermits,framePermitHeader,framePermitRenewHeader,framePermitLifetimeMS,framePermitMaxBytes,framePermitRequest,type FrameUploadPermit} from "./frame-upload-permit.ts";
import {deviceStatus,type StatusSession,type StatusFrame,type StatusHardware,type StatusDiagnostic} from "./device-status.ts";
import {mergeD1Timing,type D1Timing} from "./d1-timing.ts";
import {placementBatch,placementTiming} from "./d1-placement.ts";
import type {PairedClickTiming} from "./paired-click-timing.ts";
import {POINTER_PREFETCH,pointerPrefetchQuery,pointerPrefetchEnvelope,pointerPrefetchEnvelopes,type PrefetchCommand} from "./pointer-prefetch-query.ts";
import {repeatPresentation,repeatPresentationQuery} from "./repeat-presentation.ts";
import {advancingReadDelayMS,beforeImageObservationDeadline,type AdvancingReadFrame,actionAfterImageAgeLimitMS,clickRelookMaxGapMS,liveFrameAge,liveFrameAgeLimitMS,nextPollDelayMS,readRecoveryDefaultMS,readRecoveryMaximumMS,visualReadAgeLimitMS} from "./read-policy.ts";
import { liveFrames, screenViewReference, screenViewMatches, type FrameCommitBarrier, type LiveFrameCache } from "./live-frame-cache.ts";
import { PrivatePixelCache, type PixelEntry } from "./private-pixel-cache.ts";
import {workerFetchStartedUTC} from "./bridge-context.ts";
export class BridgeError extends Error {
  code: string; status: number;
  constructor(code: string, status = 409) { super(code); this.code = code; this.status = status; }
}
export function need(value: unknown, code: string, status = 409): asserts value { if (!value) throw new BridgeError(code, status); }
export const uid = () => crypto.randomUUID();
export const iso = (value: number) => new Date(value).toISOString();
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const uploadFreshnessMS = 1500;
const commandSourceMaxAgeMS = 1499;
export {databaseNowSQL};
export function uuid(value: unknown): string { need(typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value), "INVALID_UUID", 422); return value.toLowerCase(); }
export function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number { need(typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum, "INVALID_NUMBER", 422); return value; }
export function finite(value: unknown, minimum: number, maximum: number): number { need(typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum, "INVALID_NUMBER", 422); return value; }
export function record(value: unknown): Record<string, unknown> { need(value && typeof value === "object" && !Array.isArray(value), "INVALID_BODY", 422); return value as Record<string, unknown>; }
export function text(value: unknown, maximum: number, allowEmpty = false): string { need(typeof value === "string" && value.length <= maximum && (allowEmpty || value.length > 0), "INVALID_TEXT", 422); return value; }
export async function hash(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Buffer.from(await crypto.subtle.digest("SHA-256", bytes as BufferSource)).toString("hex");
}
export function deviceTokenHash(request:Request) {
  const match=request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,512})$/);
  need(match,"UNAUTHENTICATED",401);
  return hash(match[1]);
}
export function probeCaptureLower(meta: Record<string, unknown>, createdAt: number, now: number): number | null {
  if (meta.capture_clock_verified !== true) return null;
  const lower = createdAt + finite(meta.capture_offset_ms, -300_000, 60_000) - 50;
  need(lower <= now + 100, "CLOCK_UNCERTAIN");
  if (finite(meta.clock_rtt_ms, 0, 300_000) > 2000 || Math.abs(Date.parse(meta.captured_at as string) - lower) > 30_000) return null;
  return lower;
}
const randomToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
const codeAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const normalizeCode = (value: string) => value.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
export type User = { id: string; label: string };
export type Device = { id: string; owner_id: string; name: string; token_hash: string; token_expires: number; revoked: number; confirmed_at: number | null; created_at: number; current_session: string | null; lease_epoch: number; worker_id: string | null; worker_expires: number; last_seen: number; blocked_broadcast: string | null };
export type Session = { id: string; owner_id: string; device_id: string; broadcast_id: string; request_id: string; body_hash: string; state: string; capture_state: string; created_at: number; mode: string; diagnostic_enabled: number; control_epoch: number; mouse_enabled: number; mouse_until: number; mouse_grant_request: string | null };
export type LiveSession = Session & { live_worker: string | null; live_epoch: number; live_expires: number; checked_at_ms?: number };
type Frame = { device_id: string; owner_id: string; session_id: string; frame_id: string; frame_seq: number; lease_epoch: number; image_key: string; sha256: string; metadata: string; capture_lower: number | null; received_at: number; expires_at: number; storage_ready: number; inline_jpeg: string | null;repeat_presented_at?:number|null;repeat_received_at?:number|null;repeat_phone_mono_ms?:number|null;repeat_sequence?:number };
type DeviceListRow = Pick<Device,"id"|"name"|"worker_expires"|"last_seen"> & {
  session_json:string|null;hardware_json:string|null;diagnostic_json:string|null;
  frame_metadata:string|null;frame_capture_lower:number|null;frame_received_at:number|null;frame_expires_at:number|null;
};
type Refresh = { id: string; owner_id: string; device_id: string; session_id: string; broadcast_id: string; state: string; worker_id: string | null; lease_epoch: number | null; created_at: number; expires_at: number; min_seq: number; min_capture_mono: number; error: string | null };
type FrameDevice = Pick<Device,"id"|"owner_id">;
type FrameContext = Session & { live_worker:string;live_epoch:number;live_expires:number;existing_json:string|null;observation_id:string|null;probe_created:number|null;probe_expires:number|null;refresh_json:string|null;auth_device_id:string;auth_owner_id:string;auth_confirmed_at:number|null;auth_token_expires:number };
type CaptureRequestTiming = {request_started_perf:number;request_timing:Record<string,number>;request_timing_scope?:string};
type FrameAdmissionRow = Pick<FrameContext,"id"|"broadcast_id"|"mode"|"capture_state"|"live_worker"|"live_epoch"|"live_expires"|
  "existing_json"|"observation_id"|"probe_created"|"probe_expires"|"refresh_json">;
type FrameUploadAttemptTrace = {
  frame_id:string; admission:"signed_permit"|"authenticated_snapshot"; authority_verified_at_ms:number;
  d1_write_dispatched_at_ms?:number; d1_reply_observed_at_ms?:number; d1_frame_write_changed?:boolean;
};
type FrameUploadAttemptTraceSlot = {verified?:FrameUploadAttemptTrace};
type FrameUploadAttemptEvent = FrameUploadAttemptTrace & {
  event:"frame_upload_attempt"; worker_fetch_started_at_ms?:number; frame_handler_entry_at_ms:number;
  body_completed_at_ms?:number; frame_handler_settled_at_ms:number; outcome:"accepted"|"rejected";
  error_status?:number;
};
type PreparedFrameContext = CaptureRequestTiming & { row:FrameAdmissionRow;snapshot_ms:number;token_hash:string;observation_checked?:boolean;permitExpiresAt?:number;renewFramePermit?:FrameUploadPermit;uploadAttemptTrace?:FrameUploadAttemptTrace };
type FramePermitBounds = {token_expires:number;worker_expires:number;probe_expires:number};
type FramePermitCaptureScope=Pick<FrameUploadPermit,"session"|"broadcast"|"worker"|"lease">;
type FramePermitReply={frame_upload_permit:string;frame_upload_permit_ttl_ms:number};
const clockPermitOutcome={notRequested:0,invalidScope:1,scopeNotLive:2,notIssued:3,databaseAnchor:4,workerAnchor:5} as const;
const framePermitAdmission={ineligible:0,absent:1,bootstrap:2,invalidOrExpired:3,scopeMismatch:4,signed:5} as const;
type AcceptedObservation = {image_key:string;capture_lower:number|null;storage_ready:number};
type PairCode = { id: string; owner_id: string; owner_label: string; code_hash: string; expires_at: number; used_at: number | null; request_id: string | null; device_id: string | null };
const releaseSuccessorMiss=Symbol("authorized_release_successor_miss");
const pairedStaleWitness=Symbol("paired_stale_frame_witness");
const pairedSuccessorGrantUntil=Symbol("paired_successor_grant_until");
const pairedReadyInput=Symbol("paired_ready_input");
const actionAfterImageRead=Symbol("action_after_image");
const visualRead=Symbol("visual_read");
export const visualPointEvidence=Symbol("visual_point_evidence");
type VisualPointEvidence=Omit<VisualReadPointProof,"origin"|"command"|"issued"|"expires">;
export type VisualPointSourceEvidence={reason:"input_scope_unavailable"|"capture_identity_unavailable"|"input_scope_changed"|"eligible";
  source?:VisualPointEvidence};
export type ActionAfterImageInput={hardware:string;boot:string;kind:"focused_text"|"scroll"|"drag"|"click"|"system_search"|"parked_move"};
type ActionAfterImageReadOptions={signal?:AbortSignal;currentInput?:ActionAfterImageInput};
type ScreenReadArguments=Record<string,unknown>&{[actionAfterImageRead]?:ActionAfterImageReadOptions;[visualRead]?:true};
const actionAfterImageArgs=(args:Record<string,unknown>,options:ActionAfterImageReadOptions={}):ScreenReadArguments=>({...args,[actionAfterImageRead]:options});
const visualReadArgs=(args:Record<string,unknown>):ScreenReadArguments=>({...args,allow_repeated:false,[visualRead]:true});
const captureAgeLimit=(args:ScreenReadArguments)=>args[actionAfterImageRead]?actionAfterImageAgeLimitMS:
  args[visualRead]?visualReadAgeLimitMS:liveFrameAgeLimitMS;
type ClickAfterImagePhase="paired_snapshot"|"post_ack"|"timeout_successor"|"cache_fallback"|"release_successor";
type ClickAfterImageAttempt={
  phase:ClickAfterImagePhase;worker_dispatch_utc_ms:number;worker_return_utc_ms:number|null;d1_read_at_utc_ms:number|null;
  frame_id:string|null;frame_seq:number|null;capture_lower_server_utc_ms:number|null;inline_jpeg_chars:number;miss:string|null;
};
/** Per click. Retain the initial attempt and seven most recent attempts. */
export class ClickAfterImageTiming {
  private sampled=0;
  private readonly attempts:ClickAfterImageAttempt[]=[];
  private database?:D1Timing;
  receiptTiming?:PairedClickTiming["receipt"];
  begin(phase:ClickAfterImagePhase,workerDispatch:number) {
    const attempt:ClickAfterImageAttempt={phase,worker_dispatch_utc_ms:workerDispatch,worker_return_utc_ms:null,d1_read_at_utc_ms:null,
      frame_id:null,frame_seq:null,capture_lower_server_utc_ms:null,inline_jpeg_chars:0,miss:null};
    this.sampled++;
    if(this.attempts.length===8)this.attempts.splice(1,1);
    this.attempts.push(attempt);
    return attempt;
  }
  recordDatabase(timing:D1Timing) {
    this.database=this.database?mergeD1Timing(this.database,timing):timing;
  }
  databaseTiming() { return this.database; }
  snapshot(includeFrames:boolean) {
    if(!this.sampled)return undefined;
    return {sampled:this.sampled,dropped:this.sampled-this.attempts.length,frames_redacted:!includeFrames,
      attempts:this.attempts.map(attempt=>includeFrames?{...attempt}:
        {...attempt,frame_id:null,frame_seq:null,capture_lower_server_utc_ms:null,inline_jpeg_chars:0})};
  }
}
type OrdinaryReadPhase="initial"|"retry"|"cache_fallback"|"release_successor";
type OrdinaryReadAttempt={
  attempt:number;phase:OrdinaryReadPhase;worker_dispatch_utc_ms:number;d1_read_at_utc_ms:number|null;worker_return_utc_ms:number|null;
  frame_id:string|null;frame_seq:number|null;capture_lower_server_utc_ms:number|null;reason:string|null;
};
const ordinaryReadAttemptColumns=["attempt","phase","worker_dispatch_utc_ms","d1_read_at_utc_ms","worker_return_utc_ms",
  "frame_id","frame_seq","capture_lower_server_utc_ms","age_upper_at_d1_ms","age_upper_at_worker_return_ms","reason"] as const;
/** Server-only, request-local observations. None participate in a read decision. */
export class OrdinaryReadTiming {
  private sampled=0;
  private readonly attempts:OrdinaryReadAttempt[]=[];
  private authority?:string;
  private frameScope?:string;
  private redacted=false;
  begin(phase:OrdinaryReadPhase,dispatch:number) {
    const attempt:OrdinaryReadAttempt={attempt:++this.sampled,phase,worker_dispatch_utc_ms:dispatch,
      d1_read_at_utc_ms:null,worker_return_utc_ms:null,frame_id:null,frame_seq:null,capture_lower_server_utc_ms:null,reason:null};
    // Keep the first query plus the most recent 47, including late recovery.
    if(this.attempts.length===48)this.attempts.splice(1,1);
    this.attempts.push(attempt);
    return attempt;
  }
  observeAuthority(authority:string) {
    if(this.authority!==undefined&&this.authority!==authority)this.redact();
    this.authority=authority;
  }
  observeFrameScope(scope:string) {
    if(this.frameScope!==undefined&&this.frameScope!==scope)this.redact();
    this.frameScope=scope;
  }
  redact() { this.redacted=true; }
  snapshot() {
    const framesRedacted=this.redacted||this.authority===undefined;
    return {schema:"ordinary_read_attempts.v1",sampled:this.sampled,dropped:this.sampled-this.attempts.length,
      frames_redacted:framesRedacted,columns:ordinaryReadAttemptColumns,
      attempts:this.attempts.map(attempt=>{
        const lower=framesRedacted?null:attempt.capture_lower_server_utc_ms;
        const age=(at:number|null)=>at!==null&&lower!==null&&at>=lower?at-lower:null;
        return [attempt.attempt,attempt.phase,attempt.worker_dispatch_utc_ms,attempt.d1_read_at_utc_ms,attempt.worker_return_utc_ms,
          framesRedacted?null:attempt.frame_id,framesRedacted?null:attempt.frame_seq,lower,age(attempt.d1_read_at_utc_ms),
          age(attempt.worker_return_utc_ms),attempt.reason];
      })};
  }
}
type OrdinaryReadTimingContext={log:OrdinaryReadTiming;phase:OrdinaryReadPhase};
type LiveInputScope={mouseUntil:number;broadcast:string;hardware:string;boot:string};
type PairedStaleWitness={command:string;scope:ScreenScope;prior:ScreenSuccessor;input:LiveInputScope;lastProgressingLookupStarted?:number};
type ScreenResult = { state: string; image?: string; metadata?: Record<string, unknown>; trace?: Record<string, unknown>; [releaseSuccessorMiss]?:true; [pairedStaleWitness]?:PairedStaleWitness; [pairedSuccessorGrantUntil]?:number; [pairedReadyInput]?:LiveInputScope; [visualPointEvidence]?:VisualPointSourceEvidence; [key: string]: unknown };
type ScreenScope = {device:string;session:string;lease:number};
type ScreenSuccessor = {frame:string;frameSeq:number;sourceSeq:unknown;captureMono:number;worker:string;broadcast:string;control:number;geometry:string;afterAck?:number;input?:LiveInputScope};
type PairedObservationReceipt={device_id:string;bridge_session_id:string;worker_id:string;lease_epoch:number;control_epoch:number;phone_ack_mono_ms:number|null;hardware_id:string;board_boot_id:string};
function liveInputScope(row:ScreenSnapshotRoute,now:number):LiveInputScope|undefined {
  if(!row.after_live_input)return undefined;
  const input=JSON.parse(row.after_live_input) as LiveInputScope;
  return Number.isFinite(input.mouseUntil)&&input.mouseUntil>now&&typeof input.broadcast==="string"&&
    typeof input.hardware==="string"&&typeof input.boot==="string"?input:undefined;
}
function screenGeometry(metadata:Record<string,unknown>) {
  const rect=metadata.content_rect as Record<string,unknown>|undefined;
  return [metadata.width,metadata.height,metadata.native_width_px,metadata.native_height_px,metadata.orientation,metadata.orientation_epoch,
    rect?.x,rect?.y,rect?.width,rect?.height,metadata.transform_version];
}
const screenSnapshotSeal=Symbol("authorized_screen_snapshot");
type SnapshotSource = "d1_pointer_result_snapshot" | "d1_paired_result_snapshot";
type HostReviewRelease = {
  preparation:string; command:string; frame:string; previous:string; next:string; budgetMS:number;
};
type SnapshotRoute = Pick<Parameters<typeof screenSnapshotQuery>[0], "selected" | "afterCommand" | "afterMinGapMS" | "pointerPlan" | "pointerCompletedOnly">;
type InitialScreenSnapshot={readonly [screenSnapshotSeal]:true;owner:string;rows:D1Result<Frame&ScreenSnapshotRoute>;started:number;lookupMS:number;d1Timing:D1Timing;source:SnapshotSource;ramHints:string[];heldRam?:ReturnType<LiveFrameCache["holdHint"]>;shortSettle?:boolean;afterTiming?:{log:ClickAfterImageTiming;attempt:ClickAfterImageAttempt}};
export type Dependencies = { db: D1Database; bucket: R2Bucket; now?: () => number; schedule?: (delay: number, job: () => Promise<void>) => void; cache?: LiveFrameCache; pairedShadow?:PairedClickShadowRegistry|false; privatePixels?: PrivatePixelCache; framePermits?:FrameUploadPermits;
  frameUploadTraceDevice?:string; frameUploadTraceLog?:(event:FrameUploadAttemptEvent)=>void;
  diagnosticParallelSharing?: boolean; browseEnabled?: boolean; readTiming?:{now:()=>number;sleep:(ms:number)=>Promise<void>} };
export class BridgeEngine {
  db: D1Database; bucket: R2Bucket; now: () => number;
  readonly browseEnabled: boolean;
  readonly diagnosticParallelSharing: boolean;
  private schedule?: Dependencies["schedule"];
  private cache?: LiveFrameCache;
  readonly pairedShadow?:PairedClickShadowRegistry;
  private privatePixels?: PrivatePixelCache;
  private framePermits?: FrameUploadPermits;
  private frameUploadTraceDevice?: string;
  private frameUploadTraceLog?: Dependencies["frameUploadTraceLog"];
  private readNow:()=>number;
  private readSleep:(ms:number)=>Promise<void>;
  constructor(dependencies: Dependencies) {
    this.diagnosticParallelSharing = diagnosticsEnabled && dependencies.diagnosticParallelSharing === true;
    this.db = dependencies.db; this.now = dependencies.now ?? Date.now; this.bucket = erasureAwareBucket(this.db, dependencies.bucket, this.now); this.schedule = erasureSafeSchedule(dependencies.schedule); this.cache = dependencies.cache ?? (dependencies.schedule ? liveFrames : undefined); this.pairedShadow=dependencies.pairedShadow===false?undefined:dependencies.pairedShadow??(dependencies.schedule?livePairedClickShadow:undefined); this.privatePixels=dependencies.privatePixels;this.framePermits=dependencies.framePermits; this.browseEnabled = diagnosticsEnabled && dependencies.browseEnabled === true;this.readNow=dependencies.readTiming?.now??(()=>performance.now());this.readSleep=dependencies.readTiming?.sleep??sleep;
    const traceDevice=dependencies.frameUploadTraceDevice;
    if(typeof traceDevice==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(traceDevice)){
      this.frameUploadTraceDevice=traceDevice.toLowerCase();
      this.frameUploadTraceLog=dependencies.frameUploadTraceLog??(event=>console.info(JSON.stringify(event)));
    }
  }
  /** Already-writing batches only; read snapshots keep db.batch/all. */
  batch<T=Record<string,unknown>>(statements:D1PreparedStatement[]) {return placementBatch<T>(this.db,statements,this.now);}
  async verifySourceViewProof(user:User,proof:string) {
    return await this.framePermits?.verifySourceViewProof(user.id,proof,this.now()).catch(()=>null)??null;
  }
  async proofClock<T extends {session:string}>(view:T):Promise<T> {
    const row=await this.stmt("SELECT event_clock FROM sb_sessions WHERE id=?",view.session).first<{event_clock:string|null}>();
    return row?.event_clock ? {...view,event_clock:JSON.parse(row.event_clock) as EventClock} : view;
  }
  async issueCompoundQueryViewProof(user:User,view:CompoundQueryViewProof) {
    return await this.framePermits?.issueCompoundQueryViewProof(user.id,await this.proofClock(view)).catch(()=>undefined);
  }
  async verifyCompoundQueryViewProof(user:User,proof:string) {
    return await this.framePermits?.verifyCompoundQueryViewProof(user.id,proof,this.now()).catch(()=>null)??null;
  }
  async scopeBoundLinkedPointReady(user:User,device:string) {
    const row=await this.stmt(`SELECT 1 AS ready FROM sb_hardware
      WHERE owner_id=? AND device_id=? AND json_type(metadata,'$.capabilities."${scopeBoundLinkedPointCapability}"')='true'`,
      user.id,device).first<{ready:number}>();
    return row?.ready===1;
  }
  async resolveReleasedPointProof(user:User,proof:string):Promise<CompoundQueryViewProof|null> {
    const now=this.now();
    const view=await this.framePermits?.verifyCompoundQueryViewProof(user.id,proof,now,true).catch(()=>null);
    if(!view)return null;
    if(view.origin==="retained")return view;
    const row=await this.stmt(
      `SELECT p.proof,p.expires_at,json_type(h.metadata,'$.capabilities."${scopeBoundLinkedPointCapability}"')='true' AS v4
       FROM sb_hardware h LEFT JOIN sb_released_system_search_field_proofs p
         ON p.owner_id=h.owner_id AND p.device_id=h.device_id AND p.command_id=? AND p.frame_id=?
       WHERE h.owner_id=? AND h.device_id=?`,
      view.command,view.frame,user.id,view.device,
    ).first<{proof:string|null;expires_at:number|null;v4:number|null}>();
    if(row?.v4!==1)return !view.scopeBoundOnly&&view.expires>now?view:null;
    if(!row.proof||row.expires_at!==view.expires)return null;
    const saved=await this.framePermits?.verifyCompoundQueryViewProof(user.id,row.proof,now,true).catch(()=>null);
    if(!saved||saved.origin!==view.origin||saved.command!==view.command||saved.frame!==view.frame||saved.device!==view.device||
      saved.preparation!==view.preparation||saved.sha256!==view.sha256||saved.expires!==view.expires||
      saved.scopeBoundOnly!==view.scopeBoundOnly)return null;
    return {...view,scopeBoundPoint:true};
  }
  get releasedFieldViewProofAvailable() { return this.framePermits?.sourceViewProofAvailable===true; }
  async textRequestDigest(owner:string,device:string,key:string,request:string) { need(this.framePermits?.sourceViewProofAvailable,"SIGNING_CONFIGURATION_INVALID",503);return this.framePermits!.textRequestDigest(owner,device,key,request); }
  async issueReleasedFieldViewProof(user:User,view:ReleasedFieldViewProof) {
    return await this.framePermits?.issueReleasedFieldViewProof(user.id,await this.proofClock(view)).catch(()=>undefined);
  }
  async verifyReleasedFieldViewProof(user:User,proof:string,scopeBound=false) {
    return await this.framePermits?.verifyReleasedFieldViewProof(user.id,proof,this.now(),scopeBound).catch(()=>null)??null;
  }
  async rememberReleasedFieldProof(user:User,proof:string,host?:HostReviewRelease):Promise<void> {
    const view = await this.verifyReleasedFieldViewProof(user, proof);
    if (!view) return;
    if(host&&(view.origin!=="system_search"||view.command!==host.command||view.frame!==host.frame))return;
    await this.rememberReleasedActionProof(user,view,proof,view.origin==="parked_press"?reviewedPressCapability:
      view.origin==="paired_click"?scopeBoundFieldCapability:undefined,host);
  }
  async rememberReleasedPointProof(user:User,proof:string):Promise<void> {
    const view=await this.verifyCompoundQueryViewProof(user,proof);
    if(view&&view.origin!=="retained")await this.rememberReleasedActionProof(user,view,proof,scopeBoundLinkedPointCapability);
  }
  async issueVisualReadPointProof(user:User,source:VisualPointEvidence,pixels:string) {
    if(!this.releasedFieldViewProofAvailable)return {reason:"signer_unavailable"};
    if(await hash(Buffer.from(pixels,"base64"))!==source.sha256)return {reason:"jpeg_hash_mismatch"};
    const issued=this.now();
    if(source.staticScreen!==true&&issued-source.captureLower>=visualReadAgeLimitMS)return {reason:"aged_before_sign"};
    const view:VisualReadPointProof={...source,origin:"visual_read",command:visualReadPointLedgerKey,issued,
      expires:issued+currentFrameReferenceRetentionMS};
    if(source.staticScreen===true&&!await staticInputCurrent(this,user,view))return {reason:"static_proof_changed"};
    const proof=await this.framePermits?.issueVisualReadPointProof(user.id,await this.proofClock(view)).catch(()=>undefined);
    return {proof,reason:proof?"issued":"signing_rejected"};
  }
  async rememberVisualReadPointProof(user:User,proof:string) {
    const view=await this.framePermits?.verifyVisualReadPointProof(user.id,proof,this.now()).catch(()=>null);
    if(!view)return {reason:"invalid_or_expired"};
    const result=await this.rememberReleasedActionProof(user,view,proof,visualReadPointCapability);
    return {reason:result[0]?.meta.changes===1?"stored":"insert_skipped",
      rows_pruned:result[1]?.meta.changes??0};
  }
  async resolveVisualReadPointProof(user:User,device:string,frame:string,explicit?:string,_signal?:AbortSignal):
    Promise<{proof:VisualReadPointProof|null;reason:string;sourceAgeMS?:number}> {
    const miss=(reason:string)=>({proof:null,reason});
    if(!this.releasedFieldViewProofAvailable)return miss("signer_unavailable");
    if(explicit){
      const view=await this.framePermits?.verifyVisualReadPointProof(user.id,explicit,this.now()).catch(()=>null);
      if(!view)return miss("signature_or_envelope_invalid");
      if(view.device!==device||view.frame!==frame)return miss("signed_source_mismatch");
      // This signature identifies pixels; it is not a control grant. Current
      // scope, hardware, authorization and geometry are checked at admission.
      return {proof:view,reason:"resolved_signed_reference",sourceAgeMS:this.now()-view.captureLower};
    }
    const row=await this.stmt(`SELECT p.proof,p.expires_at,
      json_type(h.metadata,'$.capabilities."${visualReadPointCapability}"')='true' AS supported
      FROM sb_hardware h LEFT JOIN sb_released_system_search_field_proofs p
      ON p.owner_id=h.owner_id AND p.device_id=h.device_id AND p.command_id=? AND p.frame_id=?
      WHERE h.owner_id=? AND h.device_id=?`,visualReadPointLedgerKey,frame,user.id,device)
      .first<{proof:string|null;expires_at:number|null;supported:number|null}>();
    if(!row)return miss("hardware_not_found");
    if(row.supported!==1)return miss("capability_missing");
    if(!row.proof||row.expires_at===null)return miss("released_frame_not_found");
    const view=await this.framePermits?.verifyVisualReadPointProof(user.id,row.proof,this.now()).catch(()=>null);
    if(!view)return miss("signature_or_envelope_invalid");
    if(view.device!==device||view.frame!==frame)return miss("signed_source_mismatch");
    if(view.expires!==row.expires_at)return miss("ledger_binding_mismatch");
    return {proof:view,reason:"resolved",sourceAgeMS:this.now()-view.captureLower};
  }
  async issueParkedMovePointProof(user:User,source:Omit<ParkedMovePointProof,"origin"|"issued"|"expires"|"sha256">,pixels:string) {
    if(!this.releasedFieldViewProofAvailable)return undefined;
    const sha256=await hash(Buffer.from(pixels,"base64"));
    const issued=this.now();
    return await this.framePermits?.issueParkedMovePointProof(user.id,await this.proofClock({...source,origin:"parked_move",sha256,issued,
      expires:issued+visualReadPointLifetimeMS} as ParkedMovePointProof)).catch(()=>undefined);
  }
  async rememberParkedMovePointProof(user:User,proof:string) {
    const view=await this.framePermits?.verifyParkedMovePointProof(user.id,proof,this.now()).catch(()=>null);
    if(!view)return false;
    const results=await this.rememberReleasedActionProof(user,view,proof,reviewedPressCapability,undefined,parkedPressSelector(proof));
    return Number(results[0]?.meta?.changes??0)>0;
  }
  async resolveParkedPressSelector(user:User,device:string,selector:string) {
    if(!this.releasedFieldViewProofAvailable)return null;
    const now=this.now();
    const row=await this.stmt(`SELECT alias.proof,alias.expires_at,p.frame_id,p.command_id,m.id AS move_id,m.precondition
      FROM sb_released_system_search_field_proofs alias
      JOIN sb_released_system_search_field_proofs p ON p.owner_id=alias.owner_id AND p.device_id=alias.device_id
        AND p.proof=alias.proof AND p.expires_at=alias.expires_at AND p.command_id<>alias.command_id
      JOIN sb_mouse_commands k ON k.owner_id=p.owner_id AND k.device_id=p.device_id AND k.id=p.command_id
      JOIN sb_mouse_commands m ON m.id=k.predecessor_id AND m.owner_id=k.owner_id AND m.device_id=k.device_id
      WHERE alias.owner_id=? AND alias.device_id=? AND alias.command_id=? AND alias.frame_id=?
        AND alias.expires_at>max(?,${databaseNowSQL})`,user.id,device,parkedPressSelectorLedgerKey,selector,now)
      .first<{proof:string;expires_at:number;frame_id:string;command_id:string;move_id:string;precondition:string}>();
    if(!row||parkedPressSelector(row.proof)!==selector)return null;
    const proof=await this.framePermits?.verifyParkedMovePointProof(user.id,row.proof,now).catch(()=>null);
    if(!proof||proof.device!==device||proof.command!==row.command_id||proof.move!==row.move_id||
       proof.frame!==row.frame_id||proof.expires!==row.expires_at)return null;
    return {proof,geometry:record(JSON.parse(row.precondition))};
  }
  async resolveParkedMovePointProof(user:User,device:string,command:string,frame:string,token:string) {
    const now=this.now();
    const proof=await this.framePermits?.verifyParkedMovePointProof(user.id,token,now).catch(()=>null);
    if(!proof||proof.device!==device||proof.command!==command||proof.frame!==frame)return null;
    const row=await this.stmt(`SELECT 1 AS valid FROM sb_released_system_search_field_proofs
      WHERE owner_id=? AND device_id=? AND command_id=? AND frame_id=? AND proof=? AND expires_at=? AND expires_at>max(?,${databaseNowSQL})`,
      user.id,device,command,frame,token,proof.expires,now).first<{valid:number}>();
    return row?.valid===1?proof:null;
  }
  private async rememberReleasedActionProof(user:User,view:CompoundQueryViewProof|ReleasedFieldViewProof|VisualReadPointProof|ParkedMovePointProof,proof:string,
    capability?:string,host?:HostReviewRelease,parkedSelector?:string) {
    // Released action and ordinary-read proofs share a table but keep their
    // bounded eviction budgets and HMAC domains independent.
    const eligible=capability===undefined?"1":
      "EXISTS(SELECT 1 FROM sb_hardware h WHERE h.owner_id=? AND h.device_id=? AND json_type(h.metadata,?)='true')";
    return this.batch([this.stmt(
      `INSERT INTO sb_released_system_search_field_proofs(owner_id,device_id,command_id,frame_id,proof,expires_at)
       SELECT ?,?,?,?,?,? WHERE ?>max(?,${databaseNowSQL}) AND ${eligible}
       ON CONFLICT(owner_id,device_id,command_id,frame_id) DO UPDATE
       SET proof=excluded.proof, expires_at=excluded.expires_at
       WHERE excluded.expires_at>=sb_released_system_search_field_proofs.expires_at`,
      user.id,view.device,view.command,view.frame,proof,view.expires,view.expires,this.now(),
      ...(capability===undefined?[]:[user.id,view.device,`$.capabilities."${capability}"`]),
    ),this.stmt(
      `DELETE FROM sb_released_system_search_field_proofs WHERE rowid IN (
       SELECT rowid FROM sb_released_system_search_field_proofs WHERE owner_id=? AND device_id=?
       AND command_id<>? AND (command_id=?)=?
       ORDER BY expires_at DESC,rowid DESC LIMIT -1 OFFSET 8)`,user.id,view.device,parkedPressSelectorLedgerKey,
       visualReadPointLedgerKey,Number(view.origin==="visual_read"),
    ),...(parkedSelector?[this.stmt(`INSERT INTO sb_released_system_search_field_proofs(owner_id,device_id,command_id,frame_id,proof,expires_at)
       SELECT owner_id,device_id,?,?,proof,expires_at FROM sb_released_system_search_field_proofs
       WHERE owner_id=? AND device_id=? AND command_id=? AND frame_id=? AND proof=?
       ON CONFLICT(owner_id,device_id,command_id,frame_id) DO NOTHING`,
       parkedPressSelectorLedgerKey,parkedSelector,user.id,view.device,view.command,view.frame,proof),
      this.stmt(`DELETE FROM sb_released_system_search_field_proofs WHERE rowid IN (
       SELECT rowid FROM sb_released_system_search_field_proofs WHERE owner_id=? AND device_id=? AND command_id=?
       ORDER BY expires_at DESC,rowid DESC LIMIT -1 OFFSET 8)`,user.id,view.device,parkedPressSelectorLedgerKey)]:[]),
    ...(host?[this.stmt(`UPDATE sb_app_search_queries SET native_review_state=?
      WHERE id=? AND owner_id=? AND device_id=? AND finished_at IS NULL AND native_review_state=?
        AND created_at+?>max(?,${databaseNowSQL})
        AND EXISTS(SELECT 1 FROM sb_released_system_search_field_proofs p WHERE p.owner_id=? AND p.device_id=?
          AND p.command_id=? AND p.frame_id=? AND p.proof=?)`,
      host.next,host.preparation,user.id,view.device,host.previous,host.budgetMS,this.now(),
      user.id,view.device,view.command,view.frame,proof)]:[])]);
  }
  async lookupReleasedFieldProof(user:User,device:string,command:string,frame:string,includeLegacySearch:boolean):
    Promise<{scopeBoundField:boolean;view:ReleasedFieldViewProof|null}> {
    if(!this.releasedFieldViewProofAvailable)return {scopeBoundField:false,view:null};
    const advertised=(capability:string)=>`json_type(h.metadata,'$.capabilities."${capability}"')='true'`;
    const v3=advertised(scopeBoundSystemSearchFieldCapability),v4=advertised(scopeBoundFieldCapability);
    const row = await this.stmt(
      `SELECT p.proof,p.expires_at,(${v3}) AS v3,(${v4}) AS v4 FROM sb_hardware h
       LEFT JOIN sb_released_system_search_field_proofs p ON p.owner_id=h.owner_id AND p.device_id=h.device_id
         AND p.command_id=? AND p.frame_id=?
         AND ((${v4}) OR (? AND ((${v3}) OR p.expires_at>max(?,${databaseNowSQL}))))
       WHERE h.owner_id=? AND h.device_id=?`,
      command,frame,Number(includeLegacySearch),this.now(),user.id,device,
    ).first<{proof:string|null;expires_at:number|null;v3:number|null;v4:number|null}>();
    const scopeBoundField=row?.v4===1,scopeBoundSearch=includeLegacySearch&&row?.v3===1;
    const none={scopeBoundField,view:null};
    if(!row?.proof)return none;
    const view=await this.framePermits?.verifyReleasedFieldViewProof(user.id,row.proof,this.now(),scopeBoundField||scopeBoundSearch).catch(()=>null);
    if(!view||view.device!==device||view.command!==command||view.frame!==frame||view.expires!==row.expires_at||
      (!scopeBoundField&&(view.origin!=="system_search"||!includeLegacySearch||view.scopeBoundOnly&&!scopeBoundSearch)))return none;
    return {scopeBoundField,view:scopeBoundField?{...view,scopeBound:true,scopeBoundField:true}:
      scopeBoundSearch?{...view,scopeBound:true}:view};
  }
  get nativeSearchReviewAvailable() { return this.framePermits?.sourceViewProofAvailable===true; }
  async verifyNativeSearchReview(user:User,token:string) {
    return await this.framePermits?.verifyNativeSearchReview(user.id,token,this.now()).catch(()=>null)??null;
  }
  async issueNativeSearchReview(user:User,view:NativeSearchReviewState,previousToken?:string) {
    const token=await this.framePermits?.issueNativeSearchReview(user.id,view).catch(()=>undefined);
    if(!token)return undefined;
    const previous=previousToken===undefined?null:"used:"+await hash(previousToken);
    return await this.matchNativeSearchReview(user,view,previous,"pending:"+token,"issue")?token:undefined;
  }
  async consumeNativeSearchReview(user:User,token:string) {
    const view=await this.verifyNativeSearchReview(user,token);
    if(!view)return null;
    return await this.matchNativeSearchReview(user,view,"pending:"+token,"used:"+await hash(token),"consume")?view:null;
  }
  async checkPendingNativeSearchReview(user:User,token:string) {
    const view=await this.verifyNativeSearchReview(user,token);
    return view&&await this.matchNativeSearchReview(user,view,"pending:"+token,null,"recover")?view:null;
  }
  private async matchNativeSearchReview(user:User,view:NativeSearchReviewState,previous:string|null,next:string|null,
    phase:"issue"|"consume"|"recover") {
    // A pending row holds only the bounded signed envelope so a lost response
    // can be sent again. Only the atomic transition to its used digest admits
    // a verdict. Recovery does not acquire an input phase or write the row.
    const recovering=phase==="recover",fresh=phase!=="consume";
    const changed=await this.stmt(`WITH clock AS MATERIALIZED (SELECT max(?,${databaseNowSQL}) AS now)
      ${recovering?"SELECT q.id FROM sb_app_search_queries q":"UPDATE sb_app_search_queries AS q SET native_review_state=?"}
      WHERE q.owner_id=? AND q.id=? AND q.device_id=? AND q.digest=? AND q.finished_at IS NULL
        AND q.native_review_state IS ? AND q.created_at<=? AND ?<=q.created_at+20000
        AND ?> (SELECT now FROM clock)
        ${fresh?"AND ?>(SELECT now FROM clock)":""}
        ${recovering?"AND ?>(SELECT now FROM clock)":""}
        AND EXISTS(SELECT 1 FROM sb_devices d
          JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id
          JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
          JOIN sb_mouse_commands c ON c.id=? AND c.owner_id=d.owner_id AND c.device_id=d.id AND c.session_id=s.id
          JOIN sb_observations a ON a.id=d.id||':'||? AND a.device_id=d.id
          CROSS JOIN clock
          WHERE d.id=q.device_id AND d.owner_id=q.owner_id AND d.revoked=0 AND d.worker_expires>clock.now
            AND s.mode='broadcast' AND s.state='active' AND s.capture_state='active'
            AND s.mouse_enabled=1 AND s.mouse_until>clock.now AND s.control_epoch=c.control_epoch
            AND c.worker_id=d.worker_id AND c.lease_epoch=d.lease_epoch AND h.usb_connected=1
            AND c.hardware_id=h.hardware_id AND c.board_boot_id=h.board_boot_id
            AND c.state='board_acked' AND c.result_digest IS NOT NULL AND c.error IS NULL
            AND c.phone_ack_mono_ms>=0
            AND CASE ? WHEN 'focus' THEN c.kind='keyboard.open_search' AND c.id=?
              WHEN 'after_clear' THEN c.kind='pointer.click'
              WHEN 'query_results' THEN c.kind='keyboard.type_text' OR (c.kind='keyboard.open_search' AND c.id=?)
              ELSE 0 END
            AND json_extract(a.acceptance_json,'$.owner_id')=q.owner_id
            AND json_extract(a.acceptance_json,'$.control_epoch')=s.control_epoch
            AND json_extract(a.acceptance_json,'$.metadata.bridge_session_id')=s.id
            AND json_extract(a.acceptance_json,'$.metadata.broadcast_id')=s.broadcast_id
            AND json_extract(a.acceptance_json,'$.metadata.worker_id')=d.worker_id
            AND json_extract(a.acceptance_json,'$.metadata.lease_epoch')=d.lease_epoch
            AND json_extract(a.acceptance_json,'$.metadata.capture_clock_verified')=1
            AND json_extract(a.acceptance_json,'$.metadata.provenance')='device_capture'
            AND json_extract(a.acceptance_json,'$.metadata.content_sha256')=?
            AND json_extract(a.acceptance_json,'$.capture_lower_ms')=?
            AND json_extract(a.acceptance_json,'$.metadata.width')=?
            AND json_extract(a.acceptance_json,'$.metadata.height')=?
            AND json_extract(a.acceptance_json,'$.metadata.orientation_epoch')=?
            AND json_extract(a.acceptance_json,'$.metadata.capture_mono_ms')>c.phone_ack_mono_ms
            AND json_extract(a.acceptance_json,'$.metadata.capture_mono_ms')<=c.phone_ack_mono_ms+5000
            ${recovering?"AND "+noLaterSearchInputSQL("c")+` AND EXISTS(SELECT 1 FROM sb_frames f
              WHERE f.device_id=d.id AND f.owner_id=d.owner_id AND f.session_id=s.id AND f.lease_epoch=d.lease_epoch
                AND f.frame_id=a.frame_id AND f.sha256=? AND f.capture_lower=? AND f.expires_at>clock.now)`:""})
      ${recovering?"":"RETURNING id"}`,this.now(),...(recovering?[]:[next]),user.id,view.preparation,view.device,view.argsDigest,
      previous,view.issued,view.expires,view.expires,...(fresh?[view.captureLower+actionAfterImageAgeLimitMS]:[]),
      ...(recovering?[view.observeUntil]:[]),view.command,view.frame,view.stage,view.shortcut,view.shortcut,view.sha256,
      view.captureLower,view.width,view.height,view.orientationEpoch,...(recovering?[view.sha256,view.captureLower]:[])).first<{id:string}>();
    return changed?.id===view.preparation;
  }
  async issuePointReceiptProof(tokenHash:string,move:unknown,click:unknown,broadcast:string,issued:number,tokenExpires:number) {
    return await this.framePermits?.issuePointReceiptProof(tokenHash,move,click,broadcast,issued,tokenExpires).catch(()=>undefined);
  }
  async verifyPointReceiptProof(tokenHash:string,moveID:string,proof:string) {
    return await this.framePermits?.verifyPointReceiptProof(tokenHash,moveID,proof,this.now()).catch(()=>null)??null;
  }
  private noteFrameShadow(device:FrameDevice,meta:Record<string,unknown>,lower:number|null,visibleAt:number) {
    if(!this.pairedShadow||lower===null||meta.capture_clock_verified!==true||typeof meta.capture_mono_ms!=="number")return;
    try{this.pairedShadow.frameCommitted({owner:device.owner_id,device:device.id,session:String(meta.bridge_session_id),
      broadcast:String(meta.broadcast_id),worker:String(meta.worker_id),lease:Number(meta.lease_epoch),
      frame:String(meta.frame_id),capture:meta.capture_mono_ms,age:visibleAt-lower});}catch{/* Shadow cannot reject a committed frame. */}
  }
  private async rememberPixels(value:PixelEntry) {
    if(!this.privatePixels)return;
    const pixels=this.privatePixels,copy={...value,bytes:new Uint8Array(value.bytes)},job=()=>pixels.put(copy);
    if(!this.scheduleBackground(0,job))await job();
  }
  stmt(sql: string, ...values: unknown[]) { if(!diagnosticsEnabled && sql.startsWith("INSERT INTO sb_metrics") && sql.includes("detail_json"))values[values.length-1]=null;return this.db.prepare(sql).bind(...values); }
  scheduleBackground(delay: number, job: () => Promise<void>) { if (!this.schedule) return false; this.schedule(delay, job); return true; }
  private frameHistory(meta:Record<string,unknown>,lower:number|null,received:number,visible:number,prepared?:CaptureRequestTiming) {
    // Acknowledged D1 commit is an upper bound on when inline pixels became
    // readable, not the earlier request receipt and not a model delivery time.
    return {bridge_session_id:meta.bridge_session_id,broadcast_id:meta.broadcast_id,worker_id:meta.worker_id,clock_domain_id:meta.event_clock!==null&&typeof meta.event_clock==="object"?(meta.event_clock as Record<string,unknown>).clock_domain_id:null,
      lease_epoch:meta.lease_epoch,frame_seq:meta.frame_seq,capture_mono_ms:meta.capture_mono_ms,content_sha256:meta.content_sha256,
      capture_lower_ms:lower,received_at_ms:received,database_visible_observed_at_ms:visible,
      database_visible_age_upper_ms:lower==null?null:Math.max(0,visible-lower),
      ...(prepared?{request_timing_scope:prepared.request_timing_scope??"acceptFrameRequest_entry_to_D1_ack",request_timing_clock:"production_io_boundaries",request_timing:{...prepared.request_timing,commit_observed_at_ms:visible,request_to_visible_ms:performance.now()-prepared.request_started_perf}}:{})};
  }
  private async rejectCapture(device:FrameDevice,meta:Record<string,unknown>,lower:number|null,received:number,
    bytes:Uint8Array|undefined,stage:string,started:number,imageKey?:string,prepared?:CaptureRequestTiming,failure:"OLD_CAPTURE"|"CLOCK_UNCERTAIN"="OLD_CAPTURE"):Promise<never> {
    const now=this.now(),committed=stage==="after_commit";
    const detail={...this.frameHistory(meta,lower,received,now),database_visible_observed_at_ms:committed?now:null,
      database_visible_age_upper_ms:committed&&lower!=null?Math.max(0,now-lower):null,
      failure,outcome:"rejected",stage,freshness_limit_ms:uploadFreshnessMS,rejected_at_ms:now,freshness_unknown:lower==null,
      rejected_age_ms:lower==null?Number(meta.capture_age_ms):Math.max(Number(meta.capture_age_ms),now-lower),
      source_seq:meta.source_seq??null,callback_mono_ms:meta.callback_mono_ms??null,client:meta.client_timing??null,
      ...(prepared?{request_timing_scope:prepared.request_timing_scope?.replace("_to_D1_ack","_to_rejection")??"acceptFrameRequest_entry_to_rejection",request_timing_clock:"production_io_boundaries",
        request_timing:{...prepared.request_timing,rejected_at_ms:now,request_to_rejection_ms:performance.now()-prepared.request_started_perf}}:{})};
    const statements=[this.stmt("INSERT INTO sb_metrics(id,owner_id,device_id,kind,frame_id,bytes,duration_ms,created_at,detail_json) VALUES(?,?,?,?,?,?,?,?,?)",
      uid(),device.owner_id,device.id,bytes?"upload_rejected":"observation_rejected",meta.frame_id,bytes?.length??0,Math.max(0,performance.now()-started),now,JSON.stringify(detail))];
    if(committed) {
      statements.unshift(this.stmt("DELETE FROM sb_frames WHERE device_id=? AND owner_id=? AND session_id=? AND frame_id=?",device.id,device.owner_id,meta.bridge_session_id,meta.frame_id));
      if(meta.refresh_request_id) statements.splice(1,0,this.stmt("UPDATE sb_refreshes SET state='failed',error='OLD_CAPTURE' WHERE id=? AND device_id=? AND owner_id=? AND session_id=? AND worker_id=? AND lease_epoch=? AND changes()=1",meta.refresh_request_id,device.id,device.owner_id,meta.bridge_session_id,meta.worker_id,meta.lease_epoch));
      statements.push(this.stmt("UPDATE sb_observations SET acceptance_json=NULL WHERE id=? AND device_id=?",device.id+":"+meta.frame_id,device.id));
    }
    const results=await this.batch(statements);
    if(committed&&results[0].meta.changes===1&&imageKey) {
      this.cache?.expire(device.id,imageKey);
      const cleanup=()=>this.expireImage(device.id,imageKey);
      if(!this.scheduleBackground(0,cleanup))await cleanup();
    }
    const pruneSource=bytes?"frame":"observation";
    if(!this.scheduleBackground(0,async()=>{await this.pruneMetadata(pruneSource);}))await this.pruneMetadata(pruneSource);
    throw new BridgeError(failure);
  }
  async owned(user: User, deviceID: string): Promise<Device> {
    const device = await this.stmt("SELECT * FROM sb_devices WHERE id=? AND owner_id=? AND revoked=0", uuid(deviceID), user.id).first<Device>();
    need(device, "NOT_FOUND", 404); rememberPhoneName(this,device.id,device.name); return device;
  }
  async authenticate(request: Request): Promise<Device> {
    const now = this.now();
    const device = await this.stmt("SELECT * FROM sb_devices WHERE token_hash=? AND revoked=0 AND token_expires>?", await deviceTokenHash(request), now).first<Device>();
    need(device, "UNAUTHENTICATED", 401);
    if (device.confirmed_at == null) await this.stmt("UPDATE sb_devices SET confirmed_at=? WHERE id=? AND confirmed_at IS NULL", now, device.id).run();
    return device;
  }
  async createPairingCode(user: User, label: unknown, origin: string) {
    text(label, 120);
    const code = Array.from(crypto.getRandomValues(new Uint8Array(10)), n => codeAlphabet[n & 31]).join("");
    const expires = this.now() + 300_000;
    await this.stmt("INSERT INTO sb_pair_codes(id,owner_id,owner_label,code_hash,expires_at) VALUES(?,?,?,?,?)", uid(), user.id, user.label, await hash(code), expires).run();
    return { pairing_code: code.slice(0, 5) + "-" + code.slice(5), expires_at: iso(expires), server_url: origin, user_label: user.label };
  }
  async redeem(body: Record<string, unknown>, clientKey: string) {
    const now = this.now(), window = Math.floor(now / 60_000);
    const rate = await this.stmt("INSERT INTO sb_rate_windows(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count", (await hash(clientKey)) + ":" + window, now + 120_000).first<{ count: number }>();
    need(rate && rate.count <= 10, "RATE_LIMITED", 429);
    const normalized = normalizeCode(text(body.pairing_code, 40)); need(/^[0-9A-HJKMNP-TV-Z]{10}$/.test(normalized), "PAIRING_CODE_INVALID", 400);
    const requestID = uuid(body.request_id), name = text(body.name, 80), digest = await hash(normalized);
    const existing = await this.stmt("SELECT * FROM sb_pair_codes WHERE code_hash=?", digest).first<PairCode>();
    need(existing && existing.expires_at > now, "PAIRING_CODE_INVALID", 400);
    if (existing.used_at != null) {
      if (existing.request_id === requestID && existing.device_id) await this.stmt("UPDATE sb_devices SET revoked=1 WHERE id=? AND confirmed_at IS NULL", existing.device_id).run();
      throw new BridgeError(existing.request_id === requestID ? "PAIRING_RESPONSE_LOST_REPAIR_REQUIRED" : "PAIRING_CODE_USED", 409);
    }
    const deviceID = uid(), token = randomToken(), tokenExpires = now + 30 * 86400_000;
    const results = await this.batch([
      this.stmt("UPDATE sb_pair_codes SET used_at=?,request_id=?,device_id=? WHERE code_hash=? AND used_at IS NULL AND expires_at>?", now, requestID, deviceID, digest, now),
      this.stmt("INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,created_at) SELECT ?,owner_id,?,?,?,? FROM sb_pair_codes WHERE code_hash=? AND device_id=?", deviceID, name, await hash(token), tokenExpires, now, digest, deviceID),
    ]);
    need(results[1].meta.changes === 1, "PAIRING_CODE_USED", 409);
    return { device_id: deviceID, device_token: token, token_expires_at: iso(tokenExpires), user_label: existing.owner_label };
  }
  async listDevices(user: User, selected?: string) {
    // One owner-scoped SQLite snapshot, independent of device count. Select
    // status metadata only: no device credentials, image BLOB or control write.
    const rows=await this.stmt(`SELECT d.id,d.name,d.worker_expires,d.last_seen,
      CASE WHEN s.id IS NOT NULL THEN json_object('id',s.id,'broadcast_id',s.broadcast_id,'mode',s.mode,'capture_state',s.capture_state,'control_epoch',s.control_epoch,'mouse_enabled',s.mouse_enabled,'mouse_until',s.mouse_until,'mouse_grant_request',s.mouse_grant_request,'diagnostic_enabled',s.diagnostic_enabled) END AS session_json,
      CASE WHEN h.device_id IS NOT NULL THEN json_object('hardware_id',h.hardware_id,'board_boot_id',h.board_boot_id,'metadata',h.metadata,'usb_connected',h.usb_connected) END AS hardware_json,
      CASE WHEN g.id IS NOT NULL THEN json_object('id',g.id,'state',g.state,'stop_reason',g.stop_reason,'stopped_at',g.stopped_at) END AS diagnostic_json,
      f.metadata AS frame_metadata,f.capture_lower AS frame_capture_lower,f.received_at AS frame_received_at,f.expires_at AS frame_expires_at
      FROM sb_devices d
      LEFT JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id AND s.state='active'
      LEFT JOIN sb_frames f ON f.device_id=d.id AND f.owner_id=d.owner_id
      LEFT JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
      LEFT JOIN sb_sessions g ON g.rowid=(SELECT x.rowid FROM sb_sessions x WHERE x.device_id=d.id AND x.owner_id=d.owner_id AND x.mode='foreground_diagnostic' ORDER BY x.created_at DESC,x.rowid DESC LIMIT 1)
      WHERE d.owner_id=? AND d.revoked=0${selected===undefined?"":" AND d.id=?"} ORDER BY d.created_at DESC LIMIT 20`,user.id,...(selected===undefined?[]:[selected])).all<DeviceListRow>();
    return rows.results.map(row=>deviceStatus(this,row,
      row.session_json?JSON.parse(row.session_json) as StatusSession:null,
      row.frame_metadata!==null?{metadata:row.frame_metadata,capture_lower:row.frame_capture_lower,received_at:row.frame_received_at!,expires_at:row.frame_expires_at!}:null,
      row.hardware_json?JSON.parse(row.hardware_json) as StatusHardware:null,
      row.diagnostic_json?JSON.parse(row.diagnostic_json) as StatusDiagnostic:null));
  }
  async status(device: Device) {
    const current = await this.stmt("SELECT * FROM sb_devices WHERE id=? AND owner_id=?", device.id, device.owner_id).first<Device>(); need(current && !current.revoked, "UNAUTHENTICATED", 401);
    const session = current.current_session ? await this.stmt("SELECT * FROM sb_sessions WHERE id=? AND device_id=? AND state='active'", current.current_session, device.id).first<Session>() : null;
    const frame = await this.stmt("SELECT device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,capture_lower,received_at,expires_at,storage_ready FROM sb_frames WHERE device_id=? AND owner_id=?", device.id, device.owner_id).first<Frame>();
    const hardware = await this.stmt("SELECT * FROM sb_hardware WHERE device_id=? AND owner_id=?", device.id, device.owner_id).first<{ hardware_id: string; board_boot_id: string; metadata: string; usb_connected: number }>();
    const diagnostic = await this.stmt("SELECT id,state,stop_reason,stopped_at FROM sb_sessions WHERE device_id=? AND owner_id=? AND mode='foreground_diagnostic' ORDER BY created_at DESC,rowid DESC LIMIT 1", device.id, device.owner_id).first<{ id: string; state: string; stop_reason: string | null; stopped_at: number | null }>();
    rememberPhoneName(this,current.id,current.name);
    return deviceStatus(this,current,session,frame,hardware,diagnostic);
  }
  async createSession(device: Device, body: Record<string, unknown>) {
    need(body.mode === "broadcast" && body.control_enabled === false, "VIEW_ONLY_MODE", 403);
    const requestID = uuid(body.request_id), broadcastID = uuid(body.broadcast_id), id = uid(), now = this.now();
    const clock = sessionClockDeclaration(device,body,id);
    const digest = await hash("broadcast:" + broadcastID + (clock ? ":" + JSON.stringify(body.event_clock_request) : ""));
    const currentDevice = await this.stmt("SELECT blocked_broadcast FROM sb_devices WHERE id=?", device.id).first<{ blocked_broadcast: string | null }>();
    const replaced=await this.stmt("SELECT id FROM sb_sessions WHERE device_id=? AND owner_id=? AND broadcast_id=? AND stop_reason='sharing_replaced'",device.id,device.owner_id,broadcastID).first();
    need(!replaced,sharingReplaced);
    need(currentDevice?.blocked_broadcast !== broadcastID && !await this.stmt("SELECT id FROM sb_sessions WHERE device_id=? AND broadcast_id=? AND blocked=1", device.id, broadcastID).first(), "BROADCAST_STOPPED_START_MANUALLY");
    const old = await this.stmt("SELECT * FROM sb_sessions WHERE device_id=? AND request_id=?", device.id, requestID).first<Session>();
    if (old) { need(old.body_hash === digest, "IDEMPOTENCY_CONFLICT"); return this.sessionReply(old); }
    const previous = await this.stmt("SELECT image_key FROM sb_frames WHERE device_id=?", device.id).first<{ image_key: string }>();
    await this.batch([
      this.stmt("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,event_clock) SELECT ?,?,?,?,?,?,'active','active',?,? FROM sb_devices d WHERE d.id=? AND d.revoked=0 AND NOT EXISTS(SELECT 1 FROM sb_sessions WHERE device_id=? AND broadcast_id=? AND blocked=1) ON CONFLICT(device_id,request_id) DO NOTHING", id, device.owner_id, device.id, broadcastID, requestID, digest, now, clock ? clockJSON(clock) : null, device.id, device.id, broadcastID),
      ...(!this.diagnosticParallelSharing?replaceOtherSharingStatements(this,device,id,now):[]),
      this.stmt("UPDATE sb_devices SET current_session=?,lease_epoch=lease_epoch+1,worker_id=NULL,worker_expires=0 WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)", id, device.id, device.owner_id, id),
      this.stmt("UPDATE sb_sessions SET state='stopped',capture_state='stopped' WHERE device_id=? AND id<>? AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)", device.id, id, id),
      this.stmt("DELETE FROM sb_frames WHERE device_id=? AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)", device.id, id),
      this.stmt("DELETE FROM sb_screen_texts WHERE device_id=? AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)", device.id, id),
      this.stmt("DELETE FROM sb_refreshes WHERE device_id=? AND session_id<>? AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)", device.id, id, id),
    ]);
    const created = await this.stmt("SELECT * FROM sb_sessions WHERE device_id=? AND request_id=?", device.id, requestID).first<Session>(); need(created && created.body_hash === digest, "IDEMPOTENCY_CONFLICT");
    if(created.id===id && !this.diagnosticParallelSharing)await cleanReplacedSharing(this,device);
    if (created.id === id && previous) await this.bucket.delete(previous.image_key);
    return this.sessionReply(created);
  }
  sessionReply(session: Session & {event_clock?:string|null}) { return { ...(session.event_clock?{event_clock_version:eventClockVersion}:{}), bridge_session_id: session.id, broadcast_id: session.broadcast_id, mode: "broadcast", state: session.state, control_enabled: false, server_time: iso(this.now()) }; }
  liveSessionStatement(device:Device,id:string,withClock=false) {
    return this.stmt("SELECT s.*,d.worker_id AS live_worker,d.lease_epoch AS live_epoch,d.worker_expires AS live_expires"+
      (withClock?","+databaseNowSQL+" AS checked_at_ms":"")+
      " FROM sb_sessions s JOIN sb_devices d ON d.id=s.device_id WHERE s.id=? AND s.device_id=? AND s.owner_id=? AND s.state='active' AND d.current_session=s.id AND d.revoked=0",id,device.id,device.owner_id);
  }
  checkLiveSession(row:LiveSession|null|undefined,body:Record<string,unknown>,requireLease=true,at=this.now()) {
    need(row, "STALE_SESSION");
    if (row.mode === "broadcast") need(row.broadcast_id === uuid(body.broadcast_id), "STALE_SESSION");
    else need(row.mode === "foreground_diagnostic" && body.broadcast_id == null, "STALE_SESSION");
    if (requireLease) need(row.live_worker === uuid(body.worker_id) && row.live_epoch === integer(body.lease_epoch, 1) && row.live_expires > at, "STALE_LEASE");
    return row;
  }
  async session(device: Device, body: Record<string, unknown>, requireLease = true): Promise<LiveSession> {
    const row=await this.liveSessionStatement(device,uuid(body.bridge_session_id)).first<LiveSession>();
    return this.checkLiveSession(row,body,requireLease);
  }
  async claimWorker(device: Device, body: Record<string, unknown>) {
    let session:LiveSession;
    try{session=await this.session(device,body,false);}catch(error){need(!await replacementHeartbeat(this,device,body),sharingReplaced);throw error;}
    const worker = uuid(body.worker_id), now = this.now();
    need(body.worker_kind === (session.mode === "foreground_diagnostic" ? "main" : "broadcast"), "INVALID_WORKER_KIND", 403);
    const claimed = await this.stmt("UPDATE sb_devices SET heartbeat_seq=CASE WHEN worker_id=? AND worker_expires>? THEN heartbeat_seq ELSE 0 END,heartbeat_write_token=NULL,lease_epoch=CASE WHEN worker_id=? AND worker_expires>? THEN lease_epoch ELSE lease_epoch+1 END,worker_id=?,worker_expires=?,last_seen=? WHERE id=? AND current_session=? AND revoked=0 AND (worker_id=? OR worker_expires<=?) RETURNING lease_epoch", worker, now, worker, now, worker, now + 10_000, now, device.id, session.id, worker, now).first<{ lease_epoch: number }>();
    need(claimed, "WORKER_BUSY"); return { lease_epoch: claimed.lease_epoch, expires_in_ms: 10_000, server_time: iso(now) };
  }
  async heartbeat(device: Device, body: Record<string, unknown>) {
    let session:LiveSession;
    try{session=await this.session(device,body,false);}catch(error){const replacement=await replacementHeartbeat(this,device,body);if(replacement)return replacement;throw error;}
    const now = this.now();
    // Only a capture-only broadcast may recover its current worker after iOS
    // suspends timers. Foreground/actuator grants retain strict expiry checks.
    need(session.mode === "broadcast", "DIAGNOSTIC_REQUIRED", 403);
    need(session.live_worker === uuid(body.worker_id) && session.live_epoch === integer(body.lease_epoch, 1), "STALE_LEASE");
    const state = body.capture_state;
    need(state === "active" || state === "paused" || state === "stopped", "INVALID_CAPTURE_STATE", 422);
    need(body.usb_connected == null || typeof body.usb_connected === "boolean", "INVALID_USB_STATE", 422);
    if (state === "stopped") { await this.stop(device, session.id); return { directive: "all_release", expires_in_ms: 0, grant_remaining_ms: 0, control_epoch: 0, local_lease_max_ms: 0 }; }
    const sequence=body.heartbeat_seq==null?null:integer(body.heartbeat_seq,1),writeToken=uid();
    const restoreID=body.spotlight_restore_command_id==null?null:uuid(body.spotlight_restore_command_id);
    const restoreBoot=restoreID?uuid(body.board_boot_id):null;
    if(restoreID) need(sequence!==null && state==="active" && body.usb_connected===true && body.mouse_relay_enabled===true &&
      integer(body.spotlight_lease_epoch_floor,0,2_000_000_000)<session.live_epoch,"INVALID_SPOTLIGHT_RESTORE_HEARTBEAT",422);
    const repeated=repeatPresentation(body.repeated_frame,sequence);
    need(body.pointer_prefetch_protocol==null||body.pointer_prefetch_protocol===POINTER_PREFETCH,"INVALID_PREFETCH_PROTOCOL",422);
    const prefetchParent=body.pointer_prefetch_protocol===POINTER_PREFETCH?uuid(body.pointer_plan_id):null;
    need(prefetchParent===null||sequence!==null,"PREFETCH_HEARTBEAT_SEQUENCE_REQUIRED",422);
    const prefetchControl=prefetchParent?integer(body.pointer_control_epoch,1):null;
    need(!repeated||state==="active","INVALID_REPEAT_PRESENTATION",422);
    // A transaction-local server nonce prevents an older heartbeat from
    // reactivating paused sharing or renewing old presentation evidence.
    const statements=[
      this.stmt("UPDATE sb_devices SET worker_expires=?,last_seen=?,heartbeat_seq=CASE WHEN ? IS NULL THEN heartbeat_seq ELSE ? END,heartbeat_write_token=? WHERE id=? AND current_session=? AND lease_epoch=? AND worker_id=? AND revoked=0 AND (? IS NULL OR ?>heartbeat_seq)"+
        (restoreID?" AND worker_expires>"+databaseNowSQL:""),now+10000,now,sequence,sequence,writeToken,device.id,session.id,body.lease_epoch,body.worker_id,sequence,sequence),
    ];
    const restoreIndex=restoreID?statements.length:null;
    if(restoreID && session.live_expires>now) {
      // Reconcile the board identity before normal heartbeat processing. The
      // same nonce and sequence fence older heartbeats; the grant is unchanged.
      statements.push(this.stmt("UPDATE sb_hardware AS h SET board_boot_id=? WHERE h.device_id=? AND h.owner_id=? AND h.usb_connected=1 AND EXISTS("+
        "SELECT 1 FROM sb_mouse_commands c JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id JOIN sb_sessions s ON s.id=d.current_session AND s.id=c.session_id AND s.owner_id=d.owner_id AND s.device_id=d.id "+
        "WHERE c.id=? AND c.device_id=h.device_id AND c.owner_id=h.owner_id AND c.hardware_id=h.hardware_id AND (c.board_boot_id=h.board_boot_id OR h.board_boot_id=?) "+
        "AND c.kind IN ('spotlight.type_google_map','keyboard.type_text') AND c.state='board_acked' AND c.result_digest IS NOT NULL AND c.expires_at>? AND c.expires_at>"+databaseNowSQL+
        " AND json_extract(h.metadata,CASE WHEN c.kind='keyboard.type_text' THEN '$.capabilities.\"sayso.focused_text\"' WHEN json_extract(c.payload,'$.probe_keyboard')=1 THEN '$.capabilities.\"sayso.spotlight_wired_probe\"' ELSE '$.capabilities.\"sayso.spotlight_wired\"' END)=1"+
        " AND json_extract(c.receipt,'$.spotlight.restored_mouse_boot_id')=? AND json_extract(c.receipt,'$.spotlight.mouse_mode_confirmed')=1 "+
        "AND s.id=? AND s.broadcast_id=? AND s.mode='broadcast' AND s.state='active' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.mouse_until>? AND s.mouse_until>"+databaseNowSQL+
        " AND s.control_epoch=c.control_epoch AND d.worker_id=? AND d.worker_id=c.worker_id AND d.lease_epoch=? AND d.lease_epoch=c.lease_epoch AND d.revoked=0 AND d.heartbeat_write_token=?)",
        restoreBoot,device.id,device.owner_id,restoreID,restoreBoot,now,restoreBoot,session.id,session.broadcast_id,now,body.worker_id,body.lease_epoch,writeToken));
    }
    const restoreAttempted=restoreIndex!==null && statements.length>restoreIndex;
    statements.push(
      this.stmt("UPDATE sb_sessions SET capture_state=? WHERE id=? AND state='active' AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=? AND d.current_session=? AND d.worker_id=? AND d.lease_epoch=? AND d.revoked=0 AND d.heartbeat_write_token=?)",state,session.id,device.id,session.id,body.worker_id,body.lease_epoch,writeToken),
      this.stmt("UPDATE sb_hardware SET usb_connected=CASE WHEN ?=1 AND board_boot_id=? THEN 1 ELSE 0 END WHERE device_id=? AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=? AND d.current_session=? AND d.worker_id=? AND d.lease_epoch=? AND d.revoked=0 AND d.heartbeat_write_token=?)",body.usb_connected===true?1:0,body.board_boot_id??"",device.id,device.id,session.id,body.worker_id,body.lease_epoch,writeToken),
      this.stmt("UPDATE sb_sessions SET mouse_enabled=0,mouse_until=0,control_epoch=control_epoch+1 WHERE id=? AND mouse_enabled=1 AND (?<>'active' OR ?=0 OR NOT EXISTS(SELECT 1 FROM sb_hardware h WHERE h.device_id=sb_sessions.device_id AND h.owner_id=sb_sessions.owner_id AND h.usb_connected=1 AND h.board_boot_id=?)) AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=? AND d.current_session=sb_sessions.id AND d.worker_id=? AND d.lease_epoch=? AND d.revoked=0 AND d.heartbeat_write_token=?)",session.id,state,body.usb_connected===true?1:0,body.board_boot_id??"",device.id,body.worker_id,body.lease_epoch,writeToken),
    );
    const clear=clearStaticProofQuery(device,session.id,body,writeToken);
    statements.push(this.stmt(clear.sql,...clear.values));
    const presentationIndex=repeated?statements.length:null;
    if(repeated){const plan=repeatPresentationQuery({repeat:repeated,device:device.id,owner:device.owner_id,session:session.id,worker:String(body.worker_id),lease:Number(body.lease_epoch),nonce:writeToken,now,freshness:state==="active"?captureFreshness(body.capture_freshness):null},databaseNowSQL);statements.push(this.stmt(plan.sql,...plan.values));}
    const prefetchIndex=prefetchParent&&session.live_expires>now?statements.length:null;
    if(prefetchIndex!==null){const plan=pointerPrefetchQuery({device:device.id,owner:device.owner_id,session:session.id,broadcast:session.broadcast_id!,worker:String(body.worker_id),lease:Number(body.lease_epoch),control:prefetchControl!,parent:prefetchParent!,nonce:writeToken,priorWorkerUntil:session.live_expires},databaseNowSQL);statements.push(this.stmt(plan.sql,...plan.values));}
    const writes=await this.batch(statements);
    if(writes[0].meta.changes!==1){
      const current=await this.stmt("SELECT d.heartbeat_seq FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session WHERE d.id=? AND d.owner_id=? AND d.current_session=? AND d.worker_id=? AND d.lease_epoch=? AND d.revoked=0 AND s.state='active' AND s.owner_id=d.owner_id",device.id,device.owner_id,session.id,body.worker_id,body.lease_epoch).first<{heartbeat_seq:number}>();
      need(current,"STALE_LEASE");
      if(sequence!==null&&sequence<=current.heartbeat_seq)return {stale_heartbeat:true,server_time:iso(now),mouse_stop_requested:undefined};
      throw new BridgeError("STALE_LEASE");
    }
    const presented=(presentationIndex===null?null:writes[presentationIndex]?.results?.[0]??null) as {image_key:string;frame_id:string;repeat_presented_at:number;repeat_received_at:number;reference_metadata:string|null}|null;
    if(presented)this.schedule?.(25000,()=>this.expireImage(device.id,presented.image_key));
    const hardware = await this.stmt("SELECT h.board_boot_id,h.usb_connected,s.mouse_enabled,s.mouse_until,s.control_epoch,s.mouse_grant_request FROM sb_hardware h JOIN sb_devices d ON d.id=h.device_id AND d.owner_id=h.owner_id JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id WHERE h.device_id=? AND h.owner_id=? AND s.id=? AND s.state='active' AND d.worker_id=? AND d.lease_epoch=? AND d.revoked=0", device.id, device.owner_id,session.id,body.worker_id,body.lease_epoch).first<{ board_boot_id: string; usb_connected: number;mouse_enabled:number;mouse_until:number;control_epoch:number;mouse_grant_request:string|null }>();
    const cancellation=await operationCancelDirective(this,device.id,session.id);
    const mouse = state === "active" && body.mouse_relay_enabled === true && hardware?.mouse_enabled === 1 && hardware.mouse_until > this.now() && body.usb_connected === true && hardware.usb_connected === 1 && hardware.board_boot_id === body.board_boot_id;
    const prefetched=prefetchIndex!==null&&mouse?pointerPrefetchEnvelopes((writes[prefetchIndex]?.results??[]) as PrefetchCommand[],this.now(),prefetchParent!):[];
    return { ...cancellation,...await idleDirective(this,device.id,session.id,body.idle_timeout_seconds),directive: mouse ? "continue" : "all_release", expires_in_ms: 10_000, grant_remaining_ms: mouse ? Math.max(0, Math.min(10_000, hardware!.mouse_until - this.now())) : 0, control_epoch: hardware?.control_epoch??session.control_epoch, mouse_stop_requested:hardware?.mouse_grant_request==="00000000-0000-4000-8000-000000000000", local_lease_max_ms: mouse ? 3000 : 0, screen_only: !mouse, server_time: iso(now),...(restoreIndex!==null?{spotlight_mouse_resumed:mouse&&restoreAttempted&&writes[restoreIndex].meta.changes===1}:{}),...(prefetchIndex!==null?{prefetched_pointer_command:prefetched[0]??null,prefetched_pointer_commands:prefetched}:{}),...(repeated?{repeated_frame_accepted:presented!==null,presentation_received_at_ms:presented?.repeat_received_at??null,presentation_lower_server_utc_ms:presented?.repeat_presented_at??null,presented_frame_id:presented?.frame_id??null,presented_frame:presented?.reference_metadata?JSON.parse(presented.reference_metadata):null}:{}) };
  }
  async stop(device: Device, sessionID: string, blockBroadcast = false, reason = "server_stop") {
    this.cache?.clear(device.id, sessionID);
    const session = await this.stmt("SELECT * FROM sb_sessions WHERE id=? AND device_id=? AND owner_id=?", uuid(sessionID), device.id, device.owner_id).first<Session>(); need(session, "NOT_FOUND", 404);
    await this.batch([
      this.stmt("UPDATE sb_hardware SET usb_connected=0 WHERE device_id=? AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=? AND d.current_session=?)",device.id,device.id,session.id),
      this.stmt("UPDATE sb_sessions SET stop_reason=COALESCE(stop_reason,?) WHERE id=? AND state<>'stopped'",diagnosticsEnabled?text(reason,300):"sharing_stopped",session.id),
    ]);
    const result=await requestSharingErasure(this,device,session.id);
    if(this.privatePixels){const pixels=this.privatePixels,job=()=>pixels.clear(device.owner_id,device.id,session.id);if(!this.scheduleBackground(0,job))await job();}
    return {stopped:true,...result,system_broadcast_stop_confirmed:false,input_control_enabled:false};
  }
  async clockProbe(device: Device, framePermitScope?: unknown, eventClock?: EventClock|null) {
    const id = uid(), now = this.now(),started=performance.now();
    let scope:FramePermitCaptureScope|undefined;
    if(framePermitScope!==undefined){
      try {
        const input=record(framePermitScope);
        scope={session:uuid(input.bridge_session_id),broadcast:uuid(input.broadcast_id),
          worker:uuid(input.worker_id),lease:integer(input.lease_epoch,1)};
      }catch{/* An invalid optional selector still gets the ordinary clock probe. */}
    }
    type ProbeRow={created_at:number;expires_at:number;token_expires?:number;worker_expires?:number};
    const scoped=this.framePermits?scope:undefined;
    // Confirm the persisted probe and current authority in the same batch.
    // Uploads still run all existing write-time fences.
    const eligible=(probeID:string,activeScope:FramePermitCaptureScope)=>this.stmt(`SELECT p.created_at,p.expires_at,d.token_expires,d.worker_expires
        FROM sb_devices d
        JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id
        JOIN sb_clock_probes p ON p.id=? AND p.device_id=d.id
        WHERE d.id=? AND d.owner_id=? AND d.token_hash=? AND d.revoked=0
          AND d.token_expires>${databaseNowSQL} AND d.worker_expires>${databaseNowSQL} AND p.expires_at>${databaseNowSQL}
          AND s.id=? AND s.broadcast_id=? AND s.mode='broadcast' AND s.state='active' AND s.capture_state='active'
          AND d.worker_id=? AND d.lease_epoch=?`,probeID,device.id,device.owner_id,device.token_hash,
        activeScope.session,activeScope.broadcast,activeScope.worker,activeScope.lease);
    // Issue and persist the DB bound in the same SQL step, after transport.
    // No old probe is moved or attributed to a later timestamp.
    const persist=this.stmt("INSERT INTO sb_clock_probes(id,device_id,created_at,expires_at,event_clock) SELECT ?,?,issued,issued+60000,? FROM (SELECT CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER) AS issued) RETURNING created_at,expires_at",id,device.id,eventClock?clockJSON(eventClock):null);
    let issued:ProbeRow|null|undefined,authority:ProbeRow|undefined;
    if(scoped){
      const [saved,live]=await this.batch<ProbeRow>([persist,eligible(id,scoped)]);
      issued=saved.results[0];
      authority=live.results[0];
    }else{
      issued=await persist.first<ProbeRow>();
    }
    const reply=this.now();let anchor=issued?.created_at,probeID=id,version="db_issue_v2";
    if(typeof anchor!=="number"||!Number.isFinite(anchor)||anchor>reply||anchor<now-100){
      const remove=this.stmt("DELETE FROM sb_clock_probes WHERE id=? AND device_id=?",id,device.id);
      if(!scoped)await remove.run();
      probeID=uid();anchor=this.now();version="worker_issue_v1_fallback";
      const insert="INSERT INTO sb_clock_probes(id,device_id,created_at,expires_at,event_clock) VALUES(?,?,?,?,?)";
      if(scoped){
        // Recheck live authority when replacing the skewed row. Do not reuse
        // the authority snapshot from the discarded database anchor.
        const replacement=this.stmt(insert+" RETURNING created_at,expires_at",probeID,device.id,anchor,anchor+60000,eventClock?clockJSON(eventClock):null);
        const [,saved,live]=await this.batch<ProbeRow>([remove,replacement,eligible(probeID,scoped)]);
        issued=saved.results[0];
        authority=live.results[0];
      }else{
        await this.stmt(insert,probeID,device.id,anchor,anchor+60000,eventClock?clockJSON(eventClock):null).run();
      }
    }
    let permit:FramePermitReply|undefined;
    let outcome:number=framePermitScope===undefined?clockPermitOutcome.notRequested:
      !scope?clockPermitOutcome.invalidScope:scoped?clockPermitOutcome.scopeNotLive:clockPermitOutcome.notIssued;
    if(scoped&&authority&&authority.created_at===anchor&&authority.expires_at===issued?.expires_at&&
      typeof authority.token_expires==="number"&&typeof authority.worker_expires==="number"){
      permit=await this.issueFramePermit(device.token_hash,{...scoped,device:device.id,owner:device.owner_id,
        probe:probeID,probeCreated:anchor,probeExpires:authority.expires_at},
        {token_expires:authority.token_expires,worker_expires:authority.worker_expires,probe_expires:authority.expires_at});
      outcome=!permit?clockPermitOutcome.notIssued:
        version==="db_issue_v2"?clockPermitOutcome.databaseAnchor:clockPermitOutcome.workerAnchor;
    }
    console.info(JSON.stringify({event:"capture_clock_probe",clock_probe_id:probeID,anchor_version:version,persistence_ms:performance.now()-started,request_to_issue_ms:anchor-now,reply_after_anchor_ms:Math.max(0,this.now()-anchor),
      frame_permit_outcome:outcome,...(permit?{frame_upload_permit_ttl_ms:permit.frame_upload_permit_ttl_ms}:{})}));
    return { clock_probe_id:probeID,server_time:iso(anchor),expires_in_ms:60000,anchor_version:version,
      ...(outcome===clockPermitOutcome.notRequested?{}:{frame_permit_outcome:outcome}),...permit };
  }
  async frameLower(device: FrameDevice, session: Pick<Session,"id"|"broadcast_id">, meta: Record<string, unknown>, known?: { refresh: Refresh | null; probe: { created_at: number } | null }): Promise<number | null> {
    const now = this.now();
    if (meta.capture_clock_verified !== true) { need(!meta.refresh_request_id && !meta.after_command_id, "CLOCK_UNCERTAIN"); return null; }
    if (meta.refresh_request_id) {
      const refresh = known ? known.refresh : await this.stmt("SELECT * FROM sb_refreshes WHERE id=? AND device_id=? AND session_id=? AND broadcast_id=? AND state='claimed' AND expires_at>?", uuid(meta.refresh_request_id), device.id, session.id, session.broadcast_id, now).first<Refresh>();
      need(refresh && refresh.expires_at > now && refresh.worker_id === meta.worker_id && refresh.lease_epoch === meta.lease_epoch, "INVALID_REFRESH");
      need((meta.frame_seq as number) > refresh.min_seq && (meta.capture_mono_ms as number) > refresh.min_capture_mono && typeof meta.refresh_received_mono_ms === "number" && (meta.capture_mono_ms as number) > meta.refresh_received_mono_ms, "OLD_CAPTURE");
      need((meta.capture_age_ms as number) <= now - refresh.created_at + 100, "OLD_CAPTURE");
      const elapsedAfterReceipt = finite((meta.capture_mono_ms as number) - (meta.refresh_received_mono_ms as number), 0, 300_000);
      // Receipt is after server issuance. Advancing both lower bounds by the
      // known monotonic interval remains conservative, including upload transit.
      const lower = refresh.created_at + elapsedAfterReceipt;
      need(lower <= now + 100, "CLOCK_UNCERTAIN");
      return lower;
    }
    if (meta.clock_probe_id && typeof meta.capture_offset_ms === "number" && typeof meta.clock_rtt_ms === "number") {
      const probe = known ? known.probe : await this.stmt("SELECT created_at FROM sb_clock_probes WHERE id=? AND device_id=? AND expires_at>?", uuid(meta.clock_probe_id), device.id, now).first<{ created_at: number }>();
      need(probe, "INVALID_CLOCK_PROBE");
      return probeCaptureLower(meta, probe.created_at, now);
    }
    return null;
  }
  validateMetadata(raw: Record<string, unknown>, maximumSide = 2048) {
    const allowed = new Set("event_clock bridge_session_id broadcast_id worker_id lease_epoch frame_id frame_seq captured_at capture_age_ms capture_mono_ms width height native_width_px native_height_px orientation orientation_epoch content_sha256 content_rect transform_version capture_clock_verified provenance sampling_reason refresh_request_id refresh_received_mono_ms clock_probe_id capture_offset_ms clock_rtt_ms after_command_id pointer_observed pointer_x_norm pointer_y_norm client_timing source_seq source_pts_ms callback_mono_ms ready_cue_supported ready_cue_command_id loading_cue_supported loading_cue_command_id maps_tiles_cue_supported".split(" "));
    need(Object.keys(raw).every(key => allowed.has(key)), "UNKNOWN_FRAME_FIELD", 422);
    const meta = { ...raw };
    for (const key of ["bridge_session_id", "broadcast_id", "worker_id", "frame_id"]) meta[key] = uuid(meta[key]);
    meta.lease_epoch = integer(meta.lease_epoch, 1); meta.frame_seq = integer(meta.frame_seq, 1);
    meta.width = integer(meta.width, 1, maximumSide); meta.height = integer(meta.height, 1, maximumSide);
    need((meta.width as number) * (meta.height as number) <= Math.min(maximumSide * maximumSide, 33_554_432), "IMAGE_TOO_LARGE", 413);
    meta.capture_age_ms = finite(meta.capture_age_ms, 0, 300_000); meta.capture_mono_ms = finite(meta.capture_mono_ms, 0, Number.MAX_SAFE_INTEGER);
    meta.orientation_epoch = integer(meta.orientation_epoch, 0);
    need(["portrait", "portrait_upside_down", "landscape_left", "landscape_right"].includes(String(meta.orientation)), "INVALID_ORIENTATION", 422);
    need(typeof meta.captured_at === "string" && Number.isFinite(Date.parse(meta.captured_at)), "INVALID_CAPTURE_TIME", 422);
    need(typeof meta.content_sha256 === "string" && /^[a-f0-9]{64}$/.test(meta.content_sha256), "INVALID_HASH", 422);
    need(meta.provenance === "device_capture", "SIMULATION_DISABLED", 403);
    // Older/current phone publishers correlate the forced next frame with an
    // input. This is not a receipt, permission or capture-order proof. Do not
    // persist it; readScreen verifies the real phone ack and original clock.
    if(meta.after_command_id!=null)uuid(meta.after_command_id);
    delete meta.after_command_id;
    if(meta.ready_cue_supported!==undefined)need(meta.ready_cue_supported===true,"INVALID_READY_CUE",422);
    if(meta.ready_cue_command_id!==undefined){
      need(meta.ready_cue_supported===true,"INVALID_READY_CUE",422);
      meta.ready_cue_command_id=uuid(meta.ready_cue_command_id);
    }
    if(meta.loading_cue_supported!==undefined)need(meta.loading_cue_supported===true&&meta.ready_cue_supported===true,"INVALID_READY_CUE",422);
    if(meta.maps_tiles_cue_supported!==undefined)need(meta.maps_tiles_cue_supported===true&&meta.ready_cue_supported===true,"INVALID_READY_CUE",422);
    if(meta.loading_cue_command_id!==undefined){
      need(meta.loading_cue_supported===true&&meta.ready_cue_command_id===undefined,"INVALID_READY_CUE",422);
      meta.loading_cue_command_id=uuid(meta.loading_cue_command_id);
    }
    need(typeof meta.capture_clock_verified === "boolean", "INVALID_CLOCK_METADATA", 422);
    const rect = record(meta.content_rect);
    need(rect.x === 0 && rect.y === 0 && rect.width === meta.width && rect.height === meta.height && meta.transform_version === "1", "UNSUPPORTED_TRANSFORM", 422);
    integer(meta.native_width_px, 1, 8192); integer(meta.native_height_px, 1, 8192);
    if (meta.source_seq != null) integer(meta.source_seq, 1);
    for (const key of ["source_pts_ms", "callback_mono_ms"]) if (meta[key] != null) finite(meta[key], 0, Number.MAX_SAFE_INTEGER);
    if (meta.client_timing != null) {
      const timing = record(meta.client_timing), allowed = ["copy_ms", "queue_ms", "gray_ms", "encode_ms", "ocr_ms", "clock_wait_ms", "previous_upload_ms","jpeg_quality","readiness_wait_ms","selection_freshened_ms","ingress_interval_ms","ingress_phase"];
      need(Object.keys(timing).every(key => allowed.includes(key)), "INVALID_CLIENT_TIMING", 422);
      for (const value of Object.values(timing)) finite(value, 0, 300_000);
      if(timing.jpeg_quality!=null)finite(timing.jpeg_quality,0.01,1);
      if(timing.ingress_interval_ms!=null)need([100,250].includes(integer(timing.ingress_interval_ms)),"INVALID_CLIENT_TIMING",422);
      if(timing.ingress_phase!=null)integer(timing.ingress_phase,0,5);
    }
    return meta;
  }
  private async acceptAtomicObservation(device: FrameDevice, meta: Record<string, unknown>, start: number) {
    const now=this.now(), probe=uuid(meta.clock_probe_id), offset=finite(meta.capture_offset_ms,-300_000,60_000), rtt=finite(meta.clock_rtt_ms,0,300_000);
    const replayID=device.id+":"+meta.frame_id;
    let result: D1Result[];
    try {
      result=await this.batch([
        this.stmt("INSERT INTO sb_observations(id,device_id,frame_id,created_at) VALUES(?,?,?,?)",replayID,device.id,meta.frame_id,now),
        this.stmt("WITH anchor AS (SELECT created_at+?-50 AS lower_bound FROM sb_clock_probes WHERE id=? AND device_id=? AND expires_at>?), checked AS (SELECT lower_bound,CASE WHEN ?<=2000 AND ABS(?-lower_bound)<=30000 THEN lower_bound ELSE NULL END AS verified_lower FROM anchor) UPDATE sb_frames SET frame_id=?,frame_seq=?,lease_epoch=?,metadata=?,repeat_presented_at=NULL,repeat_received_at=NULL,repeat_phone_mono_ms=NULL,repeat_sequence=0,capture_lower=(SELECT verified_lower FROM checked),received_at=?,expires_at=? WHERE device_id=? AND owner_id=? AND session_id=? AND sha256=? AND expires_at>? AND length(inline_jpeg)>0 AND frame_seq<? AND json_extract(metadata,'$.capture_mono_ms')<? AND json_extract(metadata,'$.orientation_epoch')<=? AND json_extract(metadata,'$.width')=? AND json_extract(metadata,'$.height')=? AND EXISTS(SELECT 1 FROM checked c JOIN sb_devices d ON d.id=sb_frames.device_id JOIN sb_sessions s ON s.id=d.current_session WHERE c.lower_bound<=? AND (c.verified_lower>"+databaseNowSQL+"-1500) AND d.owner_id=? AND s.owner_id=? AND d.revoked=0 AND d.current_session=? AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND s.id=sb_frames.session_id AND s.broadcast_id=? AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active')",offset,probe,device.id,now,rtt,Date.parse(meta.captured_at as string),meta.frame_id,meta.frame_seq,meta.lease_epoch,JSON.stringify(meta),now,now+30_000,device.id,device.owner_id,meta.bridge_session_id,meta.content_sha256,now,meta.frame_seq,meta.capture_mono_ms,meta.orientation_epoch,meta.width,meta.height,now+100,device.owner_id,device.owner_id,meta.bridge_session_id,meta.worker_id,meta.lease_epoch,now,meta.broadcast_id),
        // A normal fast-path miss must leave no replay marker so the unchanged
        // existing image/clock/lease validation path can safely handle it.
        this.stmt("DELETE FROM sb_observations WHERE id=? AND device_id=? AND changes()=0",replayID,device.id),
        this.stmt("SELECT image_key,capture_lower,storage_ready FROM sb_frames WHERE device_id=? AND owner_id=? AND session_id=? AND frame_id=?",device.id,device.owner_id,meta.bridge_session_id,meta.frame_id),
        this.stmt(frameAcceptanceEvidenceSQL(databaseNowSQL),replayID),
      ]);
    } catch(error) {
      if(String(error).includes("UNIQUE constraint failed: sb_observations.id")) throw new BridgeError("FRAME_ID_REUSED");
      if(String(error).includes("ERASURE_SCOPE_CLOSED")) throw new BridgeError("STALE_SESSION");
      throw error;
    }
    const accepted=result[3].results?.[0] as {image_key:string;capture_lower:number|null;storage_ready:number}|undefined;
    if(result[1].meta.changes!==1 || !accepted) return null;
    return this.finishObservation(device,meta,start,now,accepted);
  }
  private async finishObservation(device:FrameDevice,meta:Record<string,unknown>,start:number,now:number,accepted:AcceptedObservation,timing?:CaptureRequestTiming) {
    const visibleAt=this.now(),history=this.frameHistory(meta,accepted.capture_lower,now,visibleAt,timing);journalFrame(this.db,device.owner_id,device.id,meta.frame_id,history,"observation");
    if(accepted.capture_lower!=null&&visibleAt-accepted.capture_lower>=uploadFreshnessMS) {
      return this.rejectCapture(device,meta,accepted.capture_lower,now,undefined,"after_commit",start,accepted.image_key,timing);
    }
    this.noteFrameShadow(device,meta,accepted.capture_lower,visibleAt);
    const elapsed=performance.now()-start;
    const pixels=this.cache?.get(device.id,device.owner_id,String(meta.bridge_session_id),accepted.image_key);
    if(pixels) {
      this.cache?.put(device.id,{owner:device.owner_id,session:String(meta.bridge_session_id),frame:String(meta.frame_id),key:accepted.image_key,bytes:pixels,expires:now+30_000});
      await this.rememberPixels({owner:device.owner_id,device:device.id,session:String(meta.bridge_session_id),key:accepted.image_key,sha256:String(meta.content_sha256),bytes:pixels,expires:now+30_000});
    }
    this.schedule?.(25_000,()=>this.expireImage(device.id,accepted.image_key));
    const maintain=async()=>{
      await this.batch([this.stmt("INSERT INTO sb_metrics(id,owner_id,device_id,kind,frame_id,bytes,duration_ms,decode_ms,store_ms,created_at,detail_json) VALUES(?,?,?,'observation',?,0,?,0,0,?,?)",uid(),device.owner_id,device.id,meta.frame_id,elapsed,now,JSON.stringify({...history,revision:"0.7.7",path:timing?"authenticated_atomic_observation":"atomic_observation",duration_scope:timing?"authenticated_validation_commit_rpc":"post_auth_validation_commit",combined_validation_and_commit_ms:elapsed,sampling_reason:typeof meta.sampling_reason==="string"?meta.sampling_reason.slice(0,40):null,same_as_previous_image:true,source_seq:meta.source_seq??null,source_pts_ms:meta.source_pts_ms??null,callback_mono_ms:meta.callback_mono_ms??null,client:meta.client_timing??null}))]);
      await this.pruneMetadata("observation");
    };
    if(this.schedule)this.schedule(0,maintain);else await maintain();
    return {accepted_frame_id:meta.frame_id,received_at:iso(now),database_visible_observed_at:iso(visibleAt),database_visible_age_upper_ms:history.database_visible_age_upper_ms,...("request_timing" in history?{request_timing:history.request_timing,request_timing_scope:history.request_timing_scope,request_timing_clock:history.request_timing_clock}:{}),next_upload_after_ms:500,server_time:iso(this.now()),freshness_unknown:accepted.capture_lower==null,frame_visible_ms:elapsed,storage_pending:accepted.storage_ready===0};
  }
  private async frameContext(meta:Record<string,unknown>,hasBytes:boolean,device?:FrameDevice,tokenHash?:string) {
    const now=this.now(),probeID=meta.clock_probe_id==null?"":uuid(meta.clock_probe_id),refreshID=meta.refresh_request_id==null?"":uuid(meta.refresh_request_id);
    const auth=tokenHash===undefined?"d.id=? AND d.owner_id=?":"d.token_hash=? AND d.token_expires>?";
    const values=tokenHash===undefined?[device!.id,device!.owner_id]:[tokenHash,now];
    return this.stmt("SELECT s.*,d.id AS auth_device_id,d.owner_id AS auth_owner_id,d.confirmed_at AS auth_confirmed_at,d.token_expires AS auth_token_expires,p.expires_at AS probe_expires,d.worker_id AS live_worker,d.lease_epoch AS live_epoch,d.worker_expires AS live_expires,CASE WHEN f.device_id IS NOT NULL THEN json_object('device_id',f.device_id,'owner_id',f.owner_id,'session_id',f.session_id,'frame_id',f.frame_id,'frame_seq',f.frame_seq,'lease_epoch',f.lease_epoch,'image_key',f.image_key,'sha256',f.sha256,'metadata',f.metadata,'capture_lower',f.capture_lower,'received_at',f.received_at,'expires_at',f.expires_at,'storage_ready',f.storage_ready,'inline_jpeg',CASE WHEN ?=1 THEN NULL ELSE f.inline_jpeg END) ELSE NULL END AS existing_json,o.id AS observation_id,p.created_at AS probe_created,CASE WHEN r.id IS NOT NULL THEN json_object('id',r.id,'worker_id',r.worker_id,'lease_epoch',r.lease_epoch,'min_seq',r.min_seq,'min_capture_mono',r.min_capture_mono,'created_at',r.created_at,'expires_at',r.expires_at) ELSE NULL END AS refresh_json FROM sb_devices d LEFT JOIN sb_sessions s ON s.device_id=d.id AND s.owner_id=d.owner_id AND s.id=d.current_session AND s.id=? AND s.broadcast_id=? AND s.state='active' LEFT JOIN sb_frames f ON f.device_id=d.id AND f.owner_id=s.owner_id AND f.session_id=s.id LEFT JOIN sb_observations o ON o.id=d.id||':'||? LEFT JOIN sb_clock_probes p ON p.id=? AND p.device_id=d.id AND p.expires_at>? LEFT JOIN sb_refreshes r ON r.id=? AND r.device_id=d.id AND r.owner_id=s.owner_id AND r.session_id=s.id AND r.broadcast_id=s.broadcast_id AND r.state='claimed' AND r.expires_at>? WHERE d.revoked=0 AND "+auth,hasBytes?1:0,meta.bridge_session_id,meta.broadcast_id,meta.frame_id,probeID,now,refreshID,now,...values).first<FrameContext>();
  }
  private async issueFramePermit(tokenHash:string,scope:Omit<FrameUploadPermit,"expires">,bounds:FramePermitBounds,renewAfter=0):Promise<FramePermitReply|undefined> {
    const now=this.now(),probeExpires=Math.min(scope.probeExpires,bounds.probe_expires);
    const expires=Math.min(now+framePermitLifetimeMS,probeExpires,bounds.token_expires,bounds.worker_expires);
    if(expires<=Math.max(now,renewAfter))return undefined;
    const frame_upload_permit=await this.framePermits?.issue(tokenHash,{...scope,probeExpires,expires}).catch(()=>undefined);
    // The remaining TTL is sampled after signing. A client anchoring it at
    // request start cannot outlive the exact signed expiry.
    const frame_upload_permit_ttl_ms=Math.min(framePermitLifetimeMS,Math.floor(expires-this.now()));
    return frame_upload_permit&&frame_upload_permit_ttl_ms>=1?{frame_upload_permit,frame_upload_permit_ttl_ms}:undefined;
  }
  async acceptFrameRequest(request: Request, metadata:Record<string,unknown>|(()=>Record<string,unknown>), readBytes:(limit?:number)=>Promise<Uint8Array>) {
    const requestStarted=performance.now(),requestTiming:Record<string,number>={version:1,request_started_at_ms:this.now()};
    if(!this.frameUploadTraceDevice)return this.acceptFrameRequestCore(request,metadata,readBytes,requestStarted,requestTiming);
    const slot:FrameUploadAttemptTraceSlot={};
    const workerStarted=workerFetchStartedUTC();
    let outcome:FrameUploadAttemptEvent["outcome"]="rejected",errorStatus:number|undefined;
    try {
      const result=await this.acceptFrameRequestCore(request,metadata,readBytes,requestStarted,requestTiming,slot);
      outcome="accepted";
      return result;
    } catch(error) {
      if(error instanceof BridgeError)errorStatus=error.status;
      throw error;
    } finally {
      if(slot.verified){
        try {
          this.frameUploadTraceLog?.({event:"frame_upload_attempt",...slot.verified,worker_fetch_started_at_ms:workerStarted,
            frame_handler_entry_at_ms:requestTiming.request_started_at_ms,body_completed_at_ms:requestTiming.body_read_completed_at_ms,
            frame_handler_settled_at_ms:this.now(),outcome,error_status:errorStatus});
        } catch { /* Trace delivery cannot change the upload outcome. */ }
      }
    }
  }
  private async acceptFrameRequestCore(request:Request,metadata:Record<string,unknown>|(()=>Record<string,unknown>),
    readBytes:(limit?:number)=>Promise<Uint8Array>,requestStarted:number,requestTiming:Record<string,number>,traceSlot?:FrameUploadAttemptTraceSlot) {
    const verifiedTrace=(deviceID:string,frameID:unknown,admission:FrameUploadAttemptTrace["admission"])=>{
      if(!traceSlot||deviceID!==this.frameUploadTraceDevice||typeof frameID!=="string")return;
      return traceSlot.verified={frame_id:frameID,admission,authority_verified_at_ms:this.now()};
    };
    const match=request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,512})$/);need(match,"UNAUTHENTICATED",401);
    let raw:Record<string,unknown>={},metadataError:unknown;
    try{raw=typeof metadata==="function"?metadata():metadata;}catch(error){metadataError=error;}
    requestTiming.metadata_parsed_at_ms=this.now();
    const tokenHash=await hash(match[1]);
    requestTiming.auth_hash_completed_at_ms=this.now();
    const loadBytes=async(limit?:number)=>{
      requestTiming.body_read_started_at_ms=this.now();const bodyStarted=performance.now();
      const bytes=await readBytes(limit);
      requestTiming.body_read_completed_at_ms=this.now();requestTiming.body_read_ms=performance.now()-bodyStarted;
      return bytes;
    };
    // Query only bounded primitive selectors before authentication. Malformed
    // input must not turn an invalid credential into a metadata error oracle.
    const selector:Record<string,unknown>={};
    for(const key of ["bridge_session_id","broadcast_id","frame_id","clock_probe_id","refresh_request_id","after_command_id"]){
      const value=raw[key];if(typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))selector[key]=value.toLowerCase();
    }
    selector.bridge_session_id??="";selector.broadcast_id??="";selector.frame_id??="";
    const presented=request.headers.get(framePermitHeader);
    const renew=request.headers.get(framePermitRenewHeader)===framePermitRequest&&raw.after_command_id==null&&
      raw.ready_cue_command_id==null&&raw.loading_cue_command_id==null;
    const declaredLength=request.headers.get("content-length")??"";
    const length=/^[1-9]\d{0,4}$/.test(declaredLength)?Number(declaredLength):0;
    const permitCandidate=this.schedule&&this.framePermits&&length>0&&length<=framePermitMaxBytes&&
      !metadataError&&raw.refresh_request_id==null&&raw.capture_clock_verified===true&&typeof selector.clock_probe_id==="string";
    const permitEligible=permitCandidate&&!!presented;
    let admissionCode:number=!permitCandidate?framePermitAdmission.ineligible:!presented?framePermitAdmission.absent:
      presented===framePermitRequest?framePermitAdmission.bootstrap:framePermitAdmission.invalidOrExpired;
    const noteAdmission=(code:number)=>{
      if(permitCandidate||presented!==null||selector.after_command_id)requestTiming.frame_permit_admission_code=code;
      const diagnosticFallback=code===framePermitAdmission.bootstrap||code===framePermitAdmission.invalidOrExpired||code===framePermitAdmission.scopeMismatch;
      // Priority frames and fallbacks are enough to correlate a failed upload
      // with its probe. Healthy preview uploads carry the code only in timing.
      if(selector.frame_id&&selector.clock_probe_id&&(selector.after_command_id||diagnosticFallback)){
        console.info(JSON.stringify({event:"frame_permit_ingress",frame_id:selector.frame_id,clock_probe_id:selector.clock_probe_id,
          frame_permit_admission_code:code,priority:selector.after_command_id?1:0,frame_ingress_at_ms:requestTiming.request_started_at_ms,
          admission_classified_at_ms:this.now()}));
      }
    };
    if(permitEligible&&presented!==framePermitRequest){
      const permit=await this.framePermits!.verify(tokenHash,presented!,this.now()).catch(()=>null);
      const valid=permit&&permit.expires>this.now();
      if(valid)admissionCode=framePermitAdmission.scopeMismatch;
      if(valid&&permit.session===selector.bridge_session_id&&permit.broadcast===selector.broadcast_id&&
         typeof raw.worker_id==="string"&&permit.worker===raw.worker_id.toLowerCase()&&
         permit.lease===raw.lease_epoch&&permit.probe===selector.clock_probe_id){
        const meta=this.validateMetadata(raw);meta.clock_probe_id=permit.probe;
        noteAdmission(framePermitAdmission.signed);
        const uploadAttemptTrace=verifiedTrace(permit.device,meta.frame_id,"signed_permit");
        const bytes=await loadBytes(framePermitMaxBytes);
        need(bytes.length===length,"INVALID_CONTENT_LENGTH",422);
        need(permit.expires>this.now(),"STALE_FRAME_OR_LEASE");
        const row:FrameAdmissionRow={id:permit.session,broadcast_id:permit.broadcast,mode:"broadcast",capture_state:"active",
          live_worker:permit.worker,live_epoch:permit.lease,live_expires:permit.expires,existing_json:null,observation_id:null,
          probe_created:permit.probeCreated,probe_expires:permit.probeExpires,refresh_json:null};
        return this.acceptFrameCore({id:permit.device,owner_id:permit.owner},meta,bytes,
          {row,snapshot_ms:0,token_hash:tokenHash,permitExpiresAt:permit.expires,request_started_perf:requestStarted,
           request_timing:requestTiming,request_timing_scope:"acceptFrameRequest_permit_entry_to_D1_ack",
           uploadAttemptTrace,
           ...(renew?{renewFramePermit:permit}:{})});
      }
    }
    const started=performance.now();
    requestTiming.auth_snapshot_started_at_ms=this.now();
    const row=await this.frameContext(selector,true,undefined,tokenHash),snapshotMS=performance.now()-started;
    requestTiming.auth_snapshot_completed_at_ms=this.now();
    need(row&&row.auth_token_expires>this.now(),"UNAUTHENTICATED",401);
    if(metadataError)throw metadataError;
    const meta=this.validateMetadata(raw);if(meta.clock_probe_id!=null)meta.clock_probe_id=uuid(meta.clock_probe_id);if(meta.refresh_request_id!=null)meta.refresh_request_id=uuid(meta.refresh_request_id);
    noteAdmission(admissionCode);
    need(row.id,"STALE_SESSION");
    const uploadAttemptTrace=traceSlot&&row.auth_device_id===this.frameUploadTraceDevice&&row.mode==="broadcast"&&row.capture_state==="active"&&
      row.id===meta.bridge_session_id&&row.broadcast_id===meta.broadcast_id&&row.live_worker===meta.worker_id&&
      row.live_epoch===meta.lease_epoch&&row.live_expires>this.now()
      ?verifiedTrace(row.auth_device_id,meta.frame_id,"authenticated_snapshot"):undefined;
    if(row.auth_confirmed_at==null)await this.stmt("UPDATE sb_devices SET confirmed_at=? WHERE id=? AND confirmed_at IS NULL AND token_hash=? AND token_expires>? AND revoked=0",this.now(),row.auth_device_id,tokenHash,this.now()).run();
    const bytes=await loadBytes();
    need(row.auth_token_expires>this.now(),"UNAUTHENTICATED",401);
    const result=await this.acceptFrameCore({id:row.auth_device_id,owner_id:row.auth_owner_id},meta,bytes,
      {row,snapshot_ms:snapshotMS,token_hash:tokenHash,request_started_perf:requestStarted,request_timing:requestTiming,uploadAttemptTrace});
    if(!permitEligible||row.mode!=="broadcast"||row.probe_created==null||row.probe_expires==null||
       !("accepted_frame_id" in result)||result.accepted_frame_id!==meta.frame_id)return result;
    const framePermit=await this.issueFramePermit(tokenHash,{device:row.auth_device_id,owner:row.auth_owner_id,
      session:row.id,broadcast:row.broadcast_id,worker:row.live_worker,lease:row.live_epoch,probe:String(meta.clock_probe_id),
      probeCreated:row.probe_created,probeExpires:row.probe_expires},
      {probe_expires:row.probe_expires,token_expires:row.auth_token_expires,worker_expires:row.live_expires});
    return framePermit?{...result,...framePermit}:result;
  }
  async acceptFrame(device: Device, raw: Record<string, unknown>, bytes?: Uint8Array) {
    return this.acceptFrameCore(device,raw,bytes);
  }
  async acceptObservationRequest(request:Request,metadata:Record<string,unknown>|(()=>Promise<Record<string,unknown>>)) {
    const requestStarted=performance.now(),requestTiming:Record<string,number>={version:1,request_started_at_ms:this.now()};
    const match=request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,512})$/);need(match,"UNAUTHENTICATED",401);
    // Only the route's bounded16KiB JSON metadata may be parsed speculatively.
    // Payload errors remain hidden until token authentication succeeds.
    let meta:Record<string,unknown>|undefined,payloadError:unknown,parseFailed=false,eligible=false;
    requestTiming.body_read_started_at_ms=this.now();const bodyStarted=performance.now();
    try {
      const raw=typeof metadata==="function"?await metadata():metadata;
      requestTiming.body_read_completed_at_ms=this.now();requestTiming.body_read_ms=performance.now()-bodyStarted;
      requestTiming.metadata_parsed_at_ms=this.now();
      meta=this.validateMetadata(raw);
      delete meta.ready_cue_command_id;
      delete meta.loading_cue_command_id;
      if(meta.clock_probe_id!=null)meta.clock_probe_id=uuid(meta.clock_probe_id);
      if(meta.refresh_request_id!=null)meta.refresh_request_id=uuid(meta.refresh_request_id);
      eligible=Number(meta.capture_age_ms)<uploadFreshnessMS&&meta.capture_clock_verified===true&&!meta.refresh_request_id&&
        !!meta.clock_probe_id&&typeof meta.capture_offset_ms==="number"&&typeof meta.clock_rtt_ms==="number";
      if(eligible){finite(meta.capture_offset_ms,-300_000,60_000);finite(meta.clock_rtt_ms,0,300_000);}
    } catch(error){payloadError=error;parseFailed=true;meta=undefined;eligible=false;}
    const tokenHash=await hash(match[1]);requestTiming.auth_hash_completed_at_ms=this.now();
    const now=this.now(),started=performance.now();requestTiming.authenticated_commit_started_at_ms=now;
    const plan=authenticatedObservationPlan({tokenHash,now,meta,eligible},databaseNowSQL);
    const results=await this.batch(plan.map(q=>this.stmt(q.sql,...q.values)));
    requestTiming.authenticated_commit_completed_at_ms=this.now();
    const auth=results[0].results[0] as (FrameDevice&{token_expires:number})|undefined;
    need(auth&&auth.token_expires>this.now(),"UNAUTHENTICATED",401);
    if(parseFailed)throw payloadError instanceof Error?payloadError:new BridgeError("INVALID_BODY",422);
    need(meta,"INVALID_BODY",422);
    const timing:CaptureRequestTiming={request_started_perf:requestStarted,request_timing:requestTiming,request_timing_scope:"acceptObservationRequest_entry_to_D1_ack"};
    if(eligible){
      need(results[2].results.length===0,"FRAME_ID_REUSED");
      const accepted=results[5].results[0] as (AcceptedObservation&{device_id:string;owner_id:string})|undefined;
      if(results[3].meta.changes===1&&accepted){
        need(accepted.device_id===auth.id&&accepted.owner_id===auth.owner_id,"UNAUTHENTICATED",401);
        return this.finishObservation(auth,meta,started,now,accepted,timing);
      }
    }
    // Preserve the established NEED_IMAGE/refresh/clock/stale diagnostics path.
    // The fallback snapshot binds the same token again; it is not a cached grant.
    if(Number(meta.capture_age_ms)>=uploadFreshnessMS)return this.rejectCapture(auth,meta,null,now,undefined,"reported_age",started,undefined,timing);
    requestTiming.fallback_snapshot_started_at_ms=this.now();const snapshotStarted=performance.now();
    const row=await this.frameContext(meta,false,undefined,tokenHash);
    const snapshotMS=performance.now()-snapshotStarted;requestTiming.fallback_snapshot_completed_at_ms=this.now();
    need(row&&row.auth_token_expires>this.now()&&row.auth_device_id===auth.id&&row.auth_owner_id===auth.owner_id,"UNAUTHENTICATED",401);
    need(row.mode==="broadcast","STALE_SESSION");
    return this.acceptFrameCore(auth,meta,undefined,{...timing,row,snapshot_ms:snapshotMS,token_hash:tokenHash,observation_checked:true});
  }
  private async acceptFrameCore(device: FrameDevice, raw: Record<string, unknown>, bytes?: Uint8Array,prepared?:PreparedFrameContext) {
    if(prepared)prepared.request_timing.core_started_at_ms=this.now();
    const start = performance.now()-(prepared?.snapshot_ms??0), meta = this.validateMetadata(raw), now = this.now();
    const permitExpiresAt=prepared?.permitExpiresAt;
    if(Number(meta.capture_age_ms)>=uploadFreshnessMS){
      if(permitExpiresAt!==undefined)throw new BridgeError("OLD_CAPTURE");
      return this.rejectCapture(device,meta,null,now,bytes,"reported_age",start,undefined,prepared);
    }
    if(!prepared?.observation_checked && !bytes && meta.capture_clock_verified===true && !meta.refresh_request_id && meta.clock_probe_id && typeof meta.capture_offset_ms==="number" && typeof meta.clock_rtt_ms==="number") {
      const accepted=await this.acceptAtomicObservation(device,meta,start);
      if(accepted)return accepted;
    }
    // One database snapshot replaces the session, prior-frame, replay, refresh,
    // and clock-probe round trips. The write transaction still rechecks the lease.
    const session = prepared?.row ?? await this.frameContext(meta,!!bytes,device);
    need(session?.id, "STALE_SESSION");
    need(session.live_worker === meta.worker_id && session.live_epoch === meta.lease_epoch && session.live_expires > this.now(), "STALE_LEASE");
    need(session.capture_state === "active", "CAPTURE_PAUSED");
    const existing: Frame | null = session.existing_json ? JSON.parse(session.existing_json) : null;
    let previousImage: Pick<Frame,"image_key"|"sha256">|null = existing;
    const lower = await this.frameLower(device, session, meta, { refresh: session.refresh_json ? JSON.parse(session.refresh_json) : null, probe: session.probe_created == null || session.probe_expires == null || session.probe_expires <= this.now() ? null : { created_at: session.probe_created } });
    if(lower==null){
      if(permitExpiresAt!==undefined)throw new BridgeError("CLOCK_UNCERTAIN");
      return this.rejectCapture(device,meta,null,now,bytes,"clock_verification",start,undefined,prepared,"CLOCK_UNCERTAIN");
    }
    need(!session.observation_id, "FRAME_ID_REUSED");
    need(!existing || ((meta.frame_seq as number) > existing.frame_seq && (meta.capture_mono_ms as number) > Number(JSON.parse(existing.metadata).capture_mono_ms)), "OLD_FRAME");
    need(!existing || (meta.orientation_epoch as number) >= Number(JSON.parse(existing.metadata).orientation_epoch), "OLD_ORIENTATION");
    if(this.now()-lower>=uploadFreshnessMS){
      if(permitExpiresAt!==undefined)throw new BridgeError("OLD_CAPTURE");
      return this.rejectCapture(device,meta,lower,now,bytes,"before_commit",start,undefined,prepared);
    }
    const validationMS = performance.now() - start;
    if(prepared)prepared.request_timing.validation_completed_at_ms=this.now();
    let imageKey: string, decodeMS = 0, storeMS = 0, deferred = false;
    if (bytes) {
      need(bytes.length > 0 && bytes.length <= 1024 * 1024, "IMAGE_TOO_LARGE", 413);
      if(prepared)prepared.request_timing.image_hash_started_at_ms=this.now();
      const checksum=await hash(bytes);
      if(prepared)prepared.request_timing.image_hash_completed_at_ms=this.now();
      need(checksum === meta.content_sha256, "HASH_MISMATCH", 422);
      const decodeStart = performance.now();
      if(prepared)prepared.request_timing.image_decode_started_at_ms=this.now();
      try { const image = validatedJpegDimensions(bytes,Number(meta.width),Number(meta.height)); need(image.width === meta.width && image.height === meta.height, "DIMENSION_MISMATCH", 422); }
      catch (error) { if (error instanceof BridgeError) throw error; throw new BridgeError("INVALID_IMAGE", 422); }
      decodeMS = performance.now() - decodeStart;
      if(prepared)prepared.request_timing.image_decode_completed_at_ms=this.now();
      imageKey = `screens/${device.owner_id}/${device.id}/${session.id}/${meta.frame_id}-${uid()}.jpg`;
      deferred = !!this.schedule && bytes.length <= 256 * 1024;
      if (!deferred) { const t = performance.now(); await this.bucket.put(imageKey, bytes, { httpMetadata: { contentType: "image/jpeg", cacheControl: "no-store" } }); storeMS = performance.now() - t; }
    } else {
      need(existing && existing.expires_at > now && existing.sha256 === meta.content_sha256 && (existing.inline_jpeg || this.cache?.get(device.id, device.owner_id, session.id, existing.image_key) || (existing.storage_ready === 1 && await this.bucket.head(existing.image_key))), "NEED_IMAGE");
      const previous = JSON.parse(existing.metadata); need(previous.width === meta.width && previous.height === meta.height, "DIMENSION_MISMATCH", 422);
      imageKey = existing.image_key;
    }
    const inlineJPEG = bytes ? (bytes.length <= 256 * 1024 && this.schedule ? Buffer.from(bytes).toString("base64") : null) : existing!.inline_jpeg;
    // A same-pixel fallback can yield after reading the old key (for example
    // during R2.head). It may advance the current key, but never restore one
    // a concurrent JPEG already replaced. Fence both the replay marker and
    // frame upsert in the same transaction.
    const inheritedImage=bytes?null:existing;
    const inheritedImageGate=inheritedImage?" AND EXISTS(SELECT 1 FROM sb_frames WHERE device_id=? AND owner_id=? AND session_id=? AND image_key=? AND sha256=?)":"";
    const inheritedImageValues=inheritedImage?[device.id,device.owner_id,session.id,inheritedImage.image_key,inheritedImage.sha256]:[];
    let requestGate="",requestValues:unknown[]=[];
    if(prepared){
      requestGate=" AND d.owner_id=? AND d.token_hash=? AND d.token_expires>? AND EXISTS(SELECT 1 FROM sb_sessions a WHERE a.id=d.current_session AND a.device_id=d.id AND a.owner_id=d.owner_id AND a.broadcast_id=? AND a.mode=?)";
      requestValues=[device.owner_id,prepared.token_hash,this.now(),meta.broadcast_id,session.mode];
      if(meta.refresh_request_id){
        const anchor=JSON.parse(session.refresh_json!);
        requestGate+=" AND EXISTS(SELECT 1 FROM sb_refreshes z WHERE z.id=? AND z.device_id=d.id AND z.owner_id=d.owner_id AND z.session_id=d.current_session AND z.broadcast_id=? AND z.worker_id=? AND z.lease_epoch=? AND z.state='claimed' AND z.created_at=? AND z.min_seq=? AND z.min_capture_mono=? AND z.expires_at>?)";
        requestValues.push(meta.refresh_request_id,meta.broadcast_id,meta.worker_id,meta.lease_epoch,anchor.created_at,anchor.min_seq,anchor.min_capture_mono,this.now());
      }else if(meta.capture_clock_verified===true&&meta.clock_probe_id){
        requestGate+=" AND EXISTS(SELECT 1 FROM sb_clock_probes p WHERE p.id=? AND p.device_id=d.id AND p.created_at=? AND p.expires_at>?)";
        requestValues.push(meta.clock_probe_id,session.probe_created,this.now());
      }
    }
    if(permitExpiresAt!==undefined){
      // Recheck authority at database time. An older or competing frame must
      // leave both the image and its replay marker untouched.
      requestGate+=" AND ?>"+databaseNowSQL+" AND d.token_expires>"+databaseNowSQL+" AND d.worker_expires>"+databaseNowSQL+
        " AND EXISTS(SELECT 1 FROM sb_clock_probes p WHERE p.id=? AND p.device_id=d.id AND p.expires_at>"+databaseNowSQL+")"+
        " AND NOT EXISTS(SELECT 1 FROM sb_frames p WHERE p.device_id=d.id AND NOT COALESCE("+
        "p.owner_id=d.owner_id AND p.session_id=s.id AND p.frame_seq<? AND json_extract(p.metadata,'$.capture_mono_ms')<?"+
        " AND json_extract(p.metadata,'$.orientation_epoch')<=?,0))";
      requestValues.push(permitExpiresAt,meta.clock_probe_id,meta.frame_seq,meta.capture_mono_ms,meta.orientation_epoch);
    }
    requestGate+=" AND ?>"+databaseNowSQL+"-1500";requestValues.push(lower);
    requestGate+=inheritedImageGate;requestValues.push(...inheritedImageValues);
    const priorReads=permitExpiresAt===undefined?[]:[
      this.stmt("SELECT image_key,sha256 FROM sb_frames WHERE device_id=? AND owner_id=? AND session_id=?",device.id,device.owner_id,session.id)
    ];
    // Re-read the authority for this exact accepted frame in the existing
    // transaction. The signed permit's write-time fences still run unchanged.
    const renewal=prepared?.renewFramePermit;
    const renewalRead=renewal?this.stmt(`SELECT d.token_expires,d.worker_expires,p.expires_at AS probe_expires
      FROM sb_devices d
      JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id
      JOIN sb_clock_probes p ON p.id=? AND p.device_id=d.id AND p.created_at=?
      JOIN sb_frames f ON f.device_id=d.id AND f.owner_id=d.owner_id AND f.session_id=s.id AND f.lease_epoch=d.lease_epoch
      WHERE d.id=? AND d.owner_id=? AND d.token_hash=? AND d.revoked=0
        AND s.id=? AND s.broadcast_id=? AND s.mode='broadcast' AND s.state='active' AND s.capture_state='active'
        AND d.worker_id=? AND d.lease_epoch=? AND f.frame_id=? AND f.frame_seq=? AND f.sha256=?
        AND min(d.token_expires,d.worker_expires,p.expires_at,?)>${databaseNowSQL}`,
      renewal.probe,renewal.probeCreated,device.id,device.owner_id,prepared!.token_hash,renewal.session,renewal.broadcast,
      renewal.worker,renewal.lease,meta.frame_id,meta.frame_seq,meta.content_sha256,renewal.expires):undefined;
    let renewalBounds:FramePermitBounds|undefined;
    const commitStart = performance.now(); let committed = false,commitTiming:D1Timing|undefined;
    if(prepared)prepared.request_timing.commit_started_at_ms=this.now();
    try {
      const commitStatements = [
        ...priorReads,
        prepared?this.stmt("INSERT INTO sb_observations(id,device_id,frame_id,created_at) SELECT ?,?,?,? FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session WHERE d.id=? AND d.revoked=0 AND d.current_session=? AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND s.state='active' AND s.capture_state='active'"+requestGate,device.id+":"+meta.frame_id,device.id,meta.frame_id,now,device.id,session.id,meta.worker_id,meta.lease_epoch,this.now(),...requestValues):this.stmt("INSERT INTO sb_observations(id,device_id,frame_id,created_at) SELECT ?,?,?,? WHERE ?>"+databaseNowSQL+"-1500"+inheritedImageGate,device.id+":"+meta.frame_id,device.id,meta.frame_id,now,lower,...inheritedImageValues),
        this.stmt("INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,capture_lower,received_at,expires_at,storage_ready,inline_jpeg) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session WHERE d.id=? AND d.revoked=0 AND d.current_session=? AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>?"+requestGate+" AND s.state='active' AND s.capture_state='active' ON CONFLICT(device_id) DO UPDATE SET owner_id=excluded.owner_id,session_id=excluded.session_id,frame_id=excluded.frame_id,frame_seq=excluded.frame_seq,lease_epoch=excluded.lease_epoch,image_key=excluded.image_key,sha256=excluded.sha256,metadata=excluded.metadata,repeat_presented_at=NULL,repeat_received_at=NULL,repeat_phone_mono_ms=NULL,repeat_sequence=0,capture_lower=excluded.capture_lower,received_at=excluded.received_at,expires_at=excluded.expires_at,storage_ready=excluded.storage_ready,inline_jpeg=excluded.inline_jpeg WHERE sb_frames.session_id=excluded.session_id AND sb_frames.frame_seq<excluded.frame_seq AND json_extract(sb_frames.metadata,'$.capture_mono_ms')<json_extract(excluded.metadata,'$.capture_mono_ms') AND json_extract(sb_frames.metadata,'$.orientation_epoch')<=json_extract(excluded.metadata,'$.orientation_epoch')", device.id, device.owner_id, session.id, meta.frame_id, meta.frame_seq, meta.lease_epoch, imageKey, meta.content_sha256, JSON.stringify(meta), lower, now, now + 30_000, bytes ? (deferred ? 0 : 1) : existing!.storage_ready, inlineJPEG, device.id, session.id, meta.worker_id, meta.lease_epoch, this.now(),...requestValues),
        this.stmt("UPDATE sb_refreshes SET state='completed' WHERE id=? AND device_id=? AND session_id=? AND worker_id=? AND lease_epoch=? AND state='claimed' AND EXISTS(SELECT 1 FROM sb_frames WHERE device_id=? AND frame_id=?)", meta.refresh_request_id ?? "", device.id, session.id, meta.worker_id, meta.lease_epoch, device.id, meta.frame_id),
        this.stmt(frameAcceptanceEvidenceSQL(databaseNowSQL),device.id+":"+meta.frame_id),
        ...(renewalRead?[renewalRead]:[]),
      ];
      const commitCallStarted=performance.now();
      const uploadAttemptTrace=prepared?.uploadAttemptTrace;
      if(uploadAttemptTrace)uploadAttemptTrace.d1_write_dispatched_at_ms=this.now();
      const writes=await this.batch(commitStatements);
      if(uploadAttemptTrace)uploadAttemptTrace.d1_reply_observed_at_ms=this.now();
      commitTiming=placementTiming(this.db,this.now(),"frame_commit",writes,performance.now()-commitCallStarted,commitStatements.length);
      committed = writes[priorReads.length+1].meta.changes === 1;
      if(uploadAttemptTrace)uploadAttemptTrace.d1_frame_write_changed=committed;
      if(!committed&&permitExpiresAt===undefined&&this.now()-lower>=uploadFreshnessMS)
        return await this.rejectCapture(device,meta,lower,now,bytes,"commit_gate",start,undefined,prepared);
      need(committed, "STALE_FRAME_OR_LEASE");
      if(priorReads.length)previousImage=(writes[0].results[0] as Pick<Frame,"image_key"|"sha256">|undefined)??null;
      if(renewalRead)renewalBounds=writes.at(-1)?.results[0] as FramePermitBounds|undefined;
    } catch(error) {
      if(permitExpiresAt!==undefined&&String(error).includes("UNIQUE constraint failed: sb_observations.id"))throw new BridgeError("FRAME_ID_REUSED");
      throw error;
    } finally { if (!committed && bytes && !deferred) await this.bucket.delete(imageKey); }
    const commitMS = performance.now() - commitStart;
    const visibleAt=this.now(),history={...this.frameHistory(meta,lower,now,visibleAt,prepared),d1_commit_timing:commitTiming};
    if(lower!=null&&visibleAt-lower>=uploadFreshnessMS) return this.rejectCapture(device,meta,lower,now,bytes,"after_commit",start,imageKey,prepared);
    this.noteFrameShadow(device,meta,lower,visibleAt);journalFrame(this.db,device.owner_id,device.id,meta.frame_id,history,bytes?"upload":"observation");
    const pixels = bytes ?? this.cache?.get(device.id, device.owner_id, session.id, imageKey);
    if (pixels) {
      const commit=bytes&&lower!==null&&meta.capture_clock_verified===true&&typeof meta.capture_mono_ms==="number"?
        {worker:String(meta.worker_id),lease:Number(meta.lease_epoch),captureMono:meta.capture_mono_ms,captureLower:lower,
          readyCueCommandID:typeof meta.ready_cue_command_id==="string"?meta.ready_cue_command_id:undefined}:undefined;
      this.cache?.put(device.id, { owner: device.owner_id, session: session.id, frame: String(meta.frame_id), key: imageKey, bytes: pixels, expires: now + 30_000,commit });
      await this.rememberPixels({owner:device.owner_id,device:device.id,session:session.id,key:imageKey,sha256:String(meta.content_sha256),bytes:pixels,expires:now+30_000});
    }
    if (deferred && bytes) {
      const data = bytes;
      this.schedule!(0, () => this.persistDeferredFrame(device, session.id, String(meta.frame_id), imageKey, data, now));
    }
    this.schedule?.(25_000, () => this.expireImage(device.id, imageKey));
    const elapsed = performance.now() - start;
    const maintain = async () => {
      if (previousImage && previousImage.image_key !== imageKey) await this.bucket.delete(previousImage.image_key);
      await this.batch([this.stmt("INSERT INTO sb_metrics(id,owner_id,device_id,kind,frame_id,bytes,duration_ms,decode_ms,store_ms,created_at,detail_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)", uid(), device.owner_id, device.id, bytes ? "upload" : "observation", meta.frame_id, bytes?.length ?? 0, elapsed, decodeMS, storeMS, now, JSON.stringify({ ...history,revision: "0.7.7", admission_path:permitExpiresAt!==undefined?"signed_permit":prepared?"authenticated_snapshot":"device_snapshot",authenticated_snapshot_ms:prepared?.snapshot_ms??0, validation_ms: validationMS, commit_ms: commitMS, deferred_store: deferred, sampling_reason: typeof meta.sampling_reason === "string" ? meta.sampling_reason.slice(0,40) : null, same_as_previous_image: previousImage?.sha256 === meta.content_sha256, jpeg_validation_profile:bytes?jpegValidationProfile:"existing_reference", source_seq: meta.source_seq ?? null, source_pts_ms: meta.source_pts_ms ?? null, callback_mono_ms: meta.callback_mono_ms ?? null, client: meta.client_timing ?? null }))]);
      await this.pruneMetadata(bytes?"frame":"observation");
    };
    if (this.schedule) this.schedule(0, maintain); else await maintain();
    const renewedPermit=renewal&&renewalBounds?await this.issueFramePermit(prepared!.token_hash,renewal,renewalBounds,renewal.expires):undefined;
    return { accepted_frame_id: meta.frame_id, received_at: iso(now),database_visible_observed_at:iso(visibleAt),database_visible_age_upper_ms:history.database_visible_age_upper_ms,d1_commit_timing:commitTiming,...("request_timing" in history?{request_timing:history.request_timing,request_timing_scope:history.request_timing_scope,request_timing_clock:history.request_timing_clock}:{}), next_upload_after_ms: 500, server_time: iso(this.now()), freshness_unknown: lower == null, frame_visible_ms: elapsed, storage_pending: deferred,
      ...renewedPermit };
  }
  private async persistDeferredFrame(device:FrameDevice,sessionID:string,frameID:string,imageKey:string,data:Uint8Array,receivedAt:number) {
    const started=performance.now();
    const failed=(stage:string)=>console.warn(JSON.stringify({event:"deferred_jpeg_persistence_failed",frame_id:frameID,stage}));
    const remove=()=>this.bucket.delete(imageKey).catch(()=>failed("r2_cleanup"));
    try {
      await this.bucket.put(imageKey,data,{httpMetadata:{contentType:"image/jpeg",cacheControl:"no-store"}});
    } catch {
      failed("r2_put");
      await remove();
      return;
    }
    const putMS=performance.now()-started;
    try {
      // A same-pixel observation can advance the frame ID while retaining this
      // key. The update is fenced by the current image and its live scope.
      const result=await this.batch([
        this.stmt(`UPDATE sb_frames SET storage_ready=1 WHERE device_id=? AND owner_id=? AND session_id=? AND image_key=? AND expires_at>? AND expires_at>${databaseNowSQL}
          AND EXISTS(SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id
            WHERE d.id=sb_frames.device_id AND d.owner_id=sb_frames.owner_id AND d.current_session=sb_frames.session_id
              AND d.lease_epoch=sb_frames.lease_epoch AND d.revoked=0 AND s.state='active')`,device.id,device.owner_id,sessionID,imageKey,this.now()),
        this.stmt("INSERT INTO sb_metrics(id,owner_id,device_id,kind,frame_id,bytes,duration_ms,created_at,detail_json) SELECT ?,?,?,'r2_persist',?,?,?,?,? WHERE changes()=1",
          uid(),device.owner_id,device.id,frameID,data.length,putMS,receivedAt,JSON.stringify({duration_scope:"r2_put"})),
      ]);
      if(result[0].meta.changes===1)return;
    } catch {
      failed("d1_ready_unknown");
      // The ready update may have committed. The existing expiry fence keeps
      // a current object and removes it only after replacement or expiry.
      await this.expireImage(device.id,imageKey).catch(()=>failed("expiry_reconcile"));
      return;
    }
    await remove();
  }
  async expireImage(deviceID: string, key: string) {
    const row = await this.stmt("SELECT image_key,expires_at FROM sb_frames WHERE device_id=?", deviceID).first<{ image_key: string; expires_at: number }>();
    if (!row || row.image_key !== key) {this.cache?.expire(deviceID,key);await this.bucket.delete(key);return;}
    if (row.expires_at <= this.now() + 5000) {
      const result = await this.stmt("DELETE FROM sb_frames WHERE device_id=? AND image_key=? AND expires_at<=?", deviceID, key, this.now() + 5000).run();
      if (result.meta.changes) {this.cache?.expire(deviceID,key);await this.bucket.delete(key);}
    }
  }
  async claimRefresh(device: Device, body: Record<string, unknown>, waitMS: number) {
    const session = await this.session(device, body), started = performance.now(), deadline = started + Math.min(waitMS, 5000);
    let polls = 0;
    const finish = (value: Record<string, unknown> | null) => {
      console.info(JSON.stringify({ event: "capture_refresh_poll", runtime: "0.7.7", polls, elapsed_ms: performance.now() - started, claimed: value != null }));
      return value;
    };
    do {
      if (polls > 0 && performance.now() >= deadline) return finish(null);
      const won = await this.stmt("UPDATE sb_refreshes SET state='claimed',worker_id=?,lease_epoch=? WHERE id=(SELECT r.id FROM sb_refreshes r JOIN sb_devices d ON d.id=r.device_id JOIN sb_sessions s ON s.id=r.session_id WHERE r.device_id=? AND r.session_id=? AND r.owner_id=? AND r.state='queued' AND r.expires_at>? AND d.current_session=r.session_id AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND d.revoked=0 AND s.state='active' AND s.capture_state='active' ORDER BY r.created_at DESC LIMIT 1) AND state='queued' RETURNING *", uuid(body.worker_id), integer(body.lease_epoch, 1), device.id, session.id, device.owner_id, this.now(), body.worker_id, body.lease_epoch, this.now()).first<Refresh>();
      polls++;
      if (won) return finish({ kind: "capture.refresh", refresh_request_id: won.id, bridge_session_id: won.session_id, broadcast_id: won.broadcast_id, issued_at: iso(won.created_at), expires_at: iso(won.expires_at), detail: "standard", max_age_ms: 3000, after_frame_id: null, after_command_id: null });
      const remaining = deadline - performance.now();
      if (remaining <= 0) return finish(null);
      // Keep the first retry quick, then back off empty legacy refresh polls.
      // The immediate read_screen path never waits on this queue.
      await sleep(Math.min(remaining, 125 * 2 ** Math.min(polls - 1, 2)));
    } while (true);
  }
  async viewScreen(user: User, args: Record<string, unknown>): Promise<ScreenResult> {
    const started = performance.now(), requestID = uid();
    need(args.force_fresh == null || typeof args.force_fresh === "boolean", "INVALID_ARGUMENTS", 422);
    need(!args.after_command_id && !args.task_id, "VIEW_ONLY_MODE", 403);
    const maxAge = Math.min(visualReadAgeLimitMS,args.max_age_ms == null ? visualReadAgeLimitMS : integer(args.max_age_ms, 100, 10_000));
    const wait = args.wait_ms == null ? 3500 : integer(args.wait_ms, 0, 5000);
    let preflightMS = 0, preflightLookups = 0;
    const finish = (value: ScreenResult, path: string): ScreenResult => {
      const trace = { ...value.trace, request_id: requestID, path, preflight_ms: preflightMS, preflight_lookups: preflightLookups, server_tool_ms: performance.now() - started };
      console.info(JSON.stringify({ event: "screen_view", ...trace, state: value.state, reason: value.reason ?? null,
        frame_id: value.metadata?.frame_id ?? value.trace?.frame_id ?? null, age_ms: value.metadata?.age_ms ?? value.trace?.final_age_ms ?? null }));
      return { ...value, trace };
    };
    // Reuse the owner/session/lease-bound atomic snapshot. A fresh inline image
    // needs no routing query, JPEG decode, R2 read or second SQL fence.
    if (args.force_fresh !== true) {
      const snapshot = await this.readScreen(user,visualReadArgs({...args,max_age_ms:maxAge}),0,false,requestID);
      preflightMS = performance.now() - started;
      preflightLookups = Number(snapshot.trace?.lookups ?? 0);
      if (snapshot.state === "available") {
        const identity = snapshot.snapshot as Record<string, unknown>;
        return finish({ state: "available", image: snapshot.image, metadata: {
          device_id: identity.device_id, bridge_session_id: identity.bridge_session_id, frame_id: snapshot.metadata!.frame_id,
          width: identity.width, height: identity.height, native_width_px:identity.native_width_px,native_height_px:identity.native_height_px,orientation:identity.orientation,orientation_epoch:identity.orientation_epoch,capture_lower_server_utc_ms:snapshot.metadata!.capture_lower_server_utc_ms,age_ms: snapshot.metadata!.age_ms, stale: false },
          [visualPointEvidence]:snapshot[visualPointEvidence],trace: snapshot.trace }, "atomic_snapshot");
      }
      if (snapshot.state === "choose_device" || snapshot.state === "paused") return finish(snapshot, "atomic_snapshot");
    }
    let device: Device;
    if (args.device_id != null) device = await this.owned(user, uuid(args.device_id));
    else {
      const rows = await this.stmt("SELECT d.* FROM sb_devices d LEFT JOIN sb_sessions s ON s.id=d.current_session WHERE d.owner_id=? AND d.revoked=0 ORDER BY (d.worker_expires>? AND s.state='active') DESC,d.created_at DESC LIMIT 3", user.id, this.now()).all<Device>();
      const online = rows.results.filter(value => value.current_session && value.worker_expires > this.now());
      if (online.length > 1 || (online.length === 0 && rows.results.length > 1)) return finish({ state: "choose_device", devices: rows.results.map(value => ({ device_id: value.id, name: value.name })) }, "capture_refresh");
      const found = online[0] ?? rows.results[0]; if (!found) return finish({ state: "unavailable", reason: "NO_PAIRED_DEVICE" }, "capture_refresh"); device = found;
    }
    if (!device.current_session || device.worker_expires <= this.now()) return finish({ state: "unavailable", reason: "START_SAYSO_BROADCAST" }, "capture_refresh");
    const remaining = Math.max(0, Math.ceil(wait - (performance.now() - started)));
    const result = await this.getScreen(user, { ...args, device_id: device.id, bridge_session_id: device.current_session, wait_ms: remaining }, device, true, requestID);
    if (result.state !== "available") return finish(result, "capture_refresh");
    const m = result.metadata!;
    return finish({ state: "available", image: result.image, metadata: { device_id: device.id, bridge_session_id: device.current_session, frame_id: m.frame_id, width: m.width, height: m.height,native_width_px:m.native_width_px,native_height_px:m.native_height_px,orientation:m.orientation,orientation_epoch:m.orientation_epoch,capture_lower_server_utc_ms:m.capture_lower_server_utc_ms,age_ms: m.age_ms, stale: m.stale },
      [visualPointEvidence]:result[visualPointEvidence],trace: result.trace }, "capture_refresh");
  }
  // Keep the existing owner-checked command expiry/read and current pixel
  // snapshot in one transaction.
  async readPointerPlanSnapshot<T>(user:User,plan:string,statements:D1PreparedStatement[],completedOnly=false) {
    return this.batchScreenSnapshot<T>(user,statements,{selected:null,afterCommand:null,pointerPlan:uuid(plan),pointerCompletedOnly:completedOnly},"d1_pointer_result_snapshot");
  }
  async readPairedResultSnapshot<T>(user:User,device:string,command:string,minGap:number,statements:D1PreparedStatement[],shortSettle=false,afterTiming?:ClickAfterImageTiming) {
    return this.batchScreenSnapshot<T>(user,statements,{selected:uuid(device),afterCommand:uuid(command),afterMinGapMS:minGap},"d1_paired_result_snapshot",shortSettle,afterTiming);
  }
  private async batchScreenSnapshot<T>(user:User,statements:D1PreparedStatement[],route:SnapshotRoute,source:SnapshotSource,shortSettle=false,afterTiming?:ClickAfterImageTiming) {
    const started=performance.now(),now=this.now(),forceInline=source==="d1_pointer_result_snapshot";
    const clickAfter=source==="d1_paired_result_snapshot";
    const heldRam=!forceInline&&route.selected!==null?this.cache?.holdHint(route.selected,user.id):undefined;
    const ramHints=heldRam?[heldRam.key]:[];
    const query=screenSnapshotQuery({owner:user.id,now,maxAge:clickAfter?actionAfterImageAgeLimitMS:liveFrameAgeLimitMS,
      strictAgeCutoff:clickAfter,hints:ramHints,conditionalHint:null,...route,
      visualPoint:clickAfter&&this.releasedFieldViewProofAvailable,
      includeReadTime:!!afterTiming});
    const snapshotStatements=[...statements,this.stmt(query.sql,...query.values)],queryStarted=performance.now();
    const attempt=afterTiming?.begin("paired_snapshot",this.now());
    let results:D1Result[];
    try {results=await this.db.batch(snapshotStatements);}
    catch(error){if(attempt){attempt.worker_return_utc_ms=this.now();attempt.miss="lookup_error";}throw error;}
    if(attempt)attempt.worker_return_utc_ms=this.now();
    const timing=placementTiming(this.db,this.now(),"command_and_read_snapshot",results,performance.now()-queryStarted,snapshotStatements.length);
    afterTiming?.recordDatabase(timing);
    const rows=results.pop() as D1Result<Frame&ScreenSnapshotRoute>;
    if(attempt){
      attempt.d1_read_at_utc_ms=rows.results[0]?.d1_read_at_utc_ms??null;
      const command=rows.results.find(row=>row.after_id===route.afterCommand);
      if(command?.after_state!=="board_acked")attempt.miss=command?"command_not_confirmed":"command_not_found";
    }
    const initial:InitialScreenSnapshot={[screenSnapshotSeal]:true,owner:user.id,rows,started,lookupMS:performance.now()-started,d1Timing:timing,source,ramHints,heldRam,shortSettle,
      afterTiming:afterTiming&&attempt?{log:afterTiming,attempt}:undefined};
    let consumed=false;
    // Shadow consumes only an already-selected terminal scope witness. No SQL is added.
    let shadowBroadcast:string|undefined;
    if(this.pairedShadow){try{const raw=rows.results.find(r=>r.after_id===route.afterCommand)?.after_live_input;
      const value=raw?JSON.parse(raw).broadcast:undefined;if(typeof value==="string")shadowBroadcast=value;}catch{}}
    return {results:results as D1Result<T>[],shadowBroadcast,read:async(waitMS=0,requestID=uid(),report=false,signal?:AbortSignal)=>{
      need(!consumed,"SCREEN_SNAPSHOT_ALREADY_CONSUMED");consumed=true;
      const args={device_id:route.selected,after_command_id:route.afterCommand,after_command_min_gap_ms:route.afterMinGapMS,
        allow_repeated:false,wait_for_new_ms:waitMS};
      return this.readScreen(user,clickAfter?actionAfterImageArgs(args,{signal}):args,waitMS>0?1:0,report,requestID,forceInline,undefined,initial);
    }};
  }
  // Only canonical MCP reads can recover an image that ages out at release.
  // The ordinary reader's scheduling stays unchanged.
  async readScreenWithReleaseRetry(user:User,args:Record<string,unknown>,requestID:string,ordinaryTiming?:OrdinaryReadTiming) {
    const started=this.readNow(),waitMS=integer(args.wait_for_new_ms??readRecoveryDefaultMS,0,readRecoveryMaximumMS);
    const input=visualReadArgs(args);
    const result=await this.readScreen(user,input,1,true,requestID,false,undefined,undefined,undefined,undefined,started,undefined,ordinaryTiming);
    const ordinary=args.after_command_id==null&&args.if_unchanged_since==null?{lastStarted:undefined as number|undefined,timing:ordinaryTiming}:undefined;
    const seal=(candidate:ScreenResult)=>this.sealScreenReleaseRetry(user,input,requestID,candidate,started,waitMS,undefined,undefined,ordinary);
    return {...seal(result),reseal:ordinary?seal:undefined};
  }
  async readActionAfterScreen(user:User,args:Record<string,unknown>,requestID:string,
    options:ActionAfterImageReadOptions&{timing?:ClickAfterImageTiming;report?:boolean;readyCueCommandID?:string;loaderTiming?:FrameCommitBarrier}={}) {
    return this.readScreen(user,actionAfterImageArgs(args,{signal:options.signal,currentInput:options.currentInput}),1,options.report??true,requestID,false,undefined,undefined,
      options.readyCueCommandID,options.loaderTiming,undefined,options.timing);
  }
  prepareActionAfterReleaseRetry(user:User,args:Record<string,unknown>,requestID:string,result:ScreenResult,remainingMS:()=>number,
    paired?:Pick<ActionAfterImageInput,"hardware"|"boot">&{overallRemainingMS:()=>number;signal?:AbortSignal;timing?:ClickAfterImageTiming;currentInput?:ActionAfterImageInput}) {
    // The caller owns the original action and observation deadlines. Convert
    // only the remaining duration to this reader's monotonic clock.
    const started=this.readNow(),remaining=Math.floor(remainingMS());
    const actionArgs=actionAfterImageArgs(args,{signal:paired?.signal,currentInput:paired?.currentInput});
    const input=result[pairedReadyInput];
    const ordinary=this.sealScreenReleaseRetry(user,actionArgs,requestID,result,started,Math.max(0,remaining),
      ()=>remainingMS()>0&&(!paired?.currentInput||!!input&&this.now()<input.mouseUntil));
    if(!paired)return ordinary;
    const releaseReserveMS=500;
    if(!input||input.hardware!==paired.hardware||input.boot!==paired.boot||input.broadcast!==result.metadata?.broadcast_id){
      return {...ordinary,retry:ordinary.retry?async(afterSerialization=false)=>
        afterSerialization?null:await ordinary.retry!():undefined};
    }
    const lateMS=Math.max(0,Math.floor(Math.min(remaining+releaseReserveMS,paired.overallRemainingMS())));
    const late=this.sealScreenReleaseRetry(user,actionArgs,requestID,result,started,lateMS,
      ()=>!paired.signal?.aborted&&paired.overallRemainingMS()>0,{input,timing:paired.timing,capMS:releaseReserveMS});
    let attempted=false,lateSelected=false;
    return {result,withinDeadline:()=>lateSelected?late.withinDeadline():ordinary.withinDeadline(),
      retry:async(afterSerialization=false)=>{
        if(attempted)return null;
        attempted=true;lateSelected=afterSerialization;
        return await (lateSelected?late.retry?.():ordinary.retry?.())??null;
      }};
  }
  async recoverPairedClickAfterTimeout(user:User,args:Record<string,unknown>,requestID:string,result:ScreenResult,
    receipt:PairedObservationReceipt,remainingMS:()=>number,afterTiming?:ClickAfterImageTiming) {
    const witness=result[pairedStaleWitness],trace=result.trace;
    if(!witness||result.state!=="unavailable"||trace?.termination!=="timeout"||
       trace.retry_budget_exhausted!==true||trace.miss!=="frame_too_old")return undefined;
    const {command,scope,prior,input}=witness;
    if(command!==args.after_command_id||args.after_command_min_gap_ms!==300||scope.device!==receipt.device_id||
       scope.session!==receipt.bridge_session_id||scope.lease!==receipt.lease_epoch||prior.worker!==receipt.worker_id||
       prior.control!==receipt.control_epoch||prior.afterAck!==receipt.phone_ack_mono_ms||
       input.hardware!==receipt.hardware_id||input.boot!==receipt.board_boot_id)return undefined;
    const legacyDelay=750,minimumLookupMS=500,started=this.readNow(),remaining=Math.floor(remainingMS());
    if(remaining<legacyDelay+minimumLookupMS||input.mouseUntil<=this.now()+legacyDelay)return undefined;
    const deadline=started+remaining;
    const lastStarted=witness.lastProgressingLookupStarted;
    // Move the existing lookup earlier only when real JPEGs were advancing
    // through the last snapshots but already too old at the Worker boundary.
    const delay=lastStarted===undefined?legacyDelay:Math.max(25,nextPollDelayMS(150,lastStarted,started,deadline));
    let grantUntil=input.mouseUntil;
    const withinDeadline=()=>this.readNow()<deadline&&remainingMS()>0&&this.now()<grantUntil;
    await this.readSleep(delay);
    const lookupStarted=this.readNow();
    if(lookupStarted<started+delay||deadline-lookupStarted<minimumLookupMS||remainingMS()<minimumLookupMS||!withinDeadline())return undefined;
    // The final old head is a successor floor, never an image to deliver.
    // Inline mode and a single readScreenOnce forbid another D1 lookup.
    const next=await this.readScreenOnce(user,actionAfterImageArgs({...args,device_id:scope.device}),requestID,true,scope,deadline,
      undefined,undefined,undefined,"live_image",prior,afterTiming?{log:afterTiming,phase:"timeout_successor"}:undefined).catch(()=>null);
    if(next?.[pairedSuccessorGrantUntil]!==undefined)grantUntil=Math.min(grantUntil,next[pairedSuccessorGrantUntil]);
    const within=withinDeadline(),available=within&&next?.state==="available"&&!!next.image;
    const observed=available?next:result;
    return {screen:{...observed,trace:{...trace,...(available?next.trace:{}),
      lookups:Number(trace.lookups)+1,retry_count:Number(trace.retry_count)+1,
      lookup_ms:Number(trace.lookup_ms)+Number(next?.trace?.lookup_ms??0),
      d1_timing:next?.trace?mergeD1Timing(trace.d1_timing as D1Timing,next.trace.d1_timing as D1Timing):trace.d1_timing,
      retry_wait_ms:Number(trace.retry_wait_ms)+lookupStarted-started,
      retry_trigger:"paired_timeout_successor",retry_budget_exhausted:!available,
      termination:available?"success":trace.termination,
      timeout_successor_result:available?"available":!within?"deadline":next?next.trace?.miss??"unavailable":"lookup_error"}},
      withinDeadline:available?withinDeadline:undefined};
  }
  private sealScreenReleaseRetry(user:User,args:ScreenReadArguments,requestID:string,result:ScreenResult,started:number,waitMS:number,
    callerWithinDeadline=()=>true,late?:{input:LiveInputScope;timing?:ClickAfterImageTiming;capMS:number},
    ordinary?:{lastStarted:number|undefined;timing?:OrdinaryReadTiming}) {
    let deadline=started+waitMS,grantUntil=late?.input.mouseUntil??Infinity;
    const withinDeadline=()=>this.readNow()<deadline&&callerWithinDeadline()&&this.now()<grantUntil;
    const m=result.metadata,raw=result.snapshot as Record<string,unknown>|undefined;
    const afterAck=(result.after_command as {phone_ack_mono_ms?:unknown}|undefined)?.phone_ack_mono_ms;
    if(!withinDeadline()||result.state!=="available"||!result.image||!m||raw?.provenance!=="device_capture"||
      typeof m.device_id!=="string"||typeof m.bridge_session_id!=="string"||typeof m.lease_epoch!=="number"||
      typeof m.worker_id!=="string"||m.worker_id!==m.worker_id_at_read||typeof m.broadcast_id!=="string"||
      typeof m.control_epoch_at_read!=="number"||typeof m.frame_id!=="string"||typeof m.frame_seq!=="number"||
      m.capture_clock_verified!==true||typeof m.capture_lower_phone_mono_ms!=="number"||
      (args.after_command_id!=null&&(typeof afterAck!=="number"||!Number.isFinite(afterAck))))return {result,withinDeadline};
    const scope={device:m.device_id,session:m.bridge_session_id,lease:m.lease_epoch};
    const prior:ScreenSuccessor={frame:m.frame_id,frameSeq:m.frame_seq,sourceSeq:m.source_seq,captureMono:m.capture_lower_phone_mono_ms,
      worker:m.worker_id,broadcast:m.broadcast_id,control:m.control_epoch_at_read,geometry:JSON.stringify(screenGeometry(raw)),
      afterAck:typeof afterAck==="number"?afterAck:undefined,...(late?{input:late.input}:{})};
    let attempted=false;
    const retry=async():Promise<ScreenResult|null>=>{
      if(attempted||!withinDeadline())return null;
      attempted=true;
      if(late)deadline=Math.min(deadline,this.readNow()+late.capMS);
      // Each inline snapshot performs one scoped lookup. Continue only
      // after a verified transient miss, inside the original deadline.
      const readSuccessor=()=>this.readScreenOnce(user,{...args,device_id:scope.device},requestID,true,scope,deadline,
        undefined,undefined,undefined,"live_image",prior,late?.timing?{log:late.timing,phase:"release_successor"}:undefined,
        ordinary?.timing?{log:ordinary.timing,phase:"release_successor"}:undefined);
      const successors:ScreenResult[]=[];
      let lastStarted=ordinary?.lastStarted,waited=0,next:ScreenResult;
      for(;;){
        if(lastStarted!==undefined){
          const now=this.readNow(),interval=ordinary&&now>=started+2000?500:150;
          const delay=nextPollDelayMS(interval,lastStarted,now,deadline);
          if(now+delay>=deadline)return null;
          if(delay>0)await this.readSleep(delay);
          const nextStarted=this.readNow();
          if(!withinDeadline()||nextStarted<lastStarted+interval)return null;
          waited+=nextStarted-now;
        }
        lastStarted=this.readNow();
        if(ordinary)ordinary.lastStarted=lastStarted;
        next=await readSuccessor();
        successors.push(next);
        if(next[pairedSuccessorGrantUntil]!==undefined)grantUntil=Math.min(grantUntil,next[pairedSuccessorGrantUntil]);
        if(!withinDeadline())return null;
        if(next.state==="available"&&next.image)break;
        if(late||!next[releaseSuccessorMiss]||(!ordinary&&successors.length>=2))return null;
      }
      const initial=result.trace!;
      const trace=successors.reduce((prior,successor)=>{
        const latest=successor.trace!;
        return {...latest,lookups:Number(prior.lookups)+Number(latest.lookups),
          lookup_ms:Number(prior.lookup_ms)+Number(latest.lookup_ms),
          lookup_max_ms:Math.max(Number(prior.lookup_max_ms??0),Number(latest.lookup_max_ms??0)),
          private_pixel_probe_ms:Number(prior.private_pixel_probe_ms)+Number(latest.private_pixel_probe_ms),
          d1_inline_jpeg_chars:Number(prior.d1_inline_jpeg_chars)+Number(latest.d1_inline_jpeg_chars),
          d1_timing:mergeD1Timing(prior.d1_timing as D1Timing,latest.d1_timing as D1Timing)};
      },initial);
      return {...next,trace:{...trace,retry_count:Number(initial.retry_count)+successors.length,retry_trigger:"late_image_release",
        wait_for_new_ms:waitMS,retry_elapsed_ms:this.readNow()-started,retry_wait_ms:Number(initial.retry_wait_ms)+waited,termination:"success"}};
    };
    return {result,retry,withinDeadline};
  }
  // Pure snapshot reader: no refresh queue, R2 wait, or product DB writes.
  // Retry transient misses until one shared monotonic deadline, never reset
  // the timeout per lookup. In-flight remote D1 work cannot be cancelled.
  async readScreen(user: User, args: ScreenReadArguments, retryBudget = 1, report = true, requestID = uid(), forceInline = false,
    expectedScope?: ScreenScope,initial?:InitialScreenSnapshot,readyCueCommandID?:string,loaderTiming?:FrameCommitBarrier,originalBudgetStarted?:number,
    afterTiming?:ClickAfterImageTiming,ordinaryTiming?:OrdinaryReadTiming): Promise<ScreenResult> {
    need(args.include_source_view_proof==null||typeof args.include_source_view_proof==="boolean","INVALID_ARGUMENTS",422);
    const started=initial?.started??performance.now(),attemptOrigin=this.readNow(),budgetStarted=originalBudgetStarted??attemptOrigin;
    const waitMS=args.wait_for_new_ms==null?readRecoveryDefaultMS:integer(args.wait_for_new_ms,0,readRecoveryMaximumMS),deadline=budgetStarted+waitMS;
    let attemptStarted=attemptOrigin;
    const knownLoader=!initial&&!forceInline&&retryBudget>0&&waitMS>=450&&readyCueCommandID!==undefined&&
      loaderTiming?.owner===user.id&&loaderTiming.device===args.device_id&&loaderTiming.readyCueCommandID===readyCueCommandID&&
      args.after_command_id===readyCueCommandID?loaderTiming:undefined;
    const nextCueSlot=budgetStarted+150;
    const skippedLoaderLookup=knownLoader!==undefined&&!this.cache?.hasCommitAfter(knownLoader);
    if(skippedLoaderLookup){
      // The preceding authorized snapshot already selected the marked
      // loader. Reuse the next retry slot unless a local ready JPEG appears.
      if(this.cache)await this.readSleep(75);
      const remaining=nextCueSlot-this.readNow();
      if(remaining>0&&!this.cache?.hasCommitAfter(knownLoader))await this.readSleep(Math.ceil(remaining));
      attemptStarted=this.readNow();
      if(attemptStarted>=deadline){
        const trace={request_id:requestID,lookups:0,lookup_ms:0,retry_count:0,retry_wait_ms:attemptStarted-budgetStarted,
          wait_for_new_ms:waitMS,retry_budget_exhausted:true,loader_initial_lookup_skipped:true,termination:"timeout"};
        if(report)console.info(JSON.stringify({event:"screen_read",...trace,state:"unavailable",reason:"OBSERVATION_BUDGET_EXHAUSTED"}));
        return {state:"unavailable",reason:"OBSERVATION_BUDGET_EXHAUSTED",trace};
      }
    }
    const pairedSnapshot=initial?.source==="d1_paired_result_snapshot";
    // A paired zero-budget read consumes the sealed row only. A lost RAM
    // hint must not start an inline fallback after the action deadline.
    const firstDeadline=waitMS>0||pairedSnapshot?deadline:Infinity;
    const initialScope=knownLoader?{device:knownLoader.device,session:knownLoader.session,lease:knownLoader.lease}:expectedScope;
    const readyRAM=knownLoader&&this.cache?.hasCommitAfter(knownLoader)?this.cache.holdHint(knownLoader.device,user.id):undefined;
    const clickTiming=afterTiming??initial?.afterTiming?.log;
    const timingContext=clickTiming?{log:clickTiming,phase:"post_ack" as const}:undefined;
    let result=await this.readScreenOnce(user,args,requestID,forceInline,initialScope,firstDeadline,initial,readyCueCommandID,readyRAM,
      "live_image",undefined,timingContext,ordinaryTiming?{log:ordinaryTiming,phase:"initial"}:undefined),trace={...result.trace};
    if(skippedLoaderLookup){
      trace.loader_initial_lookup_skipped=true;
      trace.retry_wait_ms=attemptStarted-budgetStarted;
      trace.no_wait=false;
    }
    const frames=new Set<string>();let attempts=0,withFrame=0,maxSnapshotMS=0,sequenceSamples=0,sourceSamples=0;
    const ordinaryRead=!initial&&!forceInline&&!readyCueCommandID&&!loaderTiming&&args.after_command_id==null&&args.if_unchanged_since==null;
    let previousRetryFrame:AdvancingReadFrame|undefined,currentRetryFrame:AdvancingReadFrame|undefined,earlyAdvances=0;
    let firstSequence:number|null=null,lastSequence:number|null=null,firstSource:number|null=null,lastSource:number|null=null,lastID:string|null=null,lastCapture:number|null=null,lastAge:number|null=null;
    let advancingStaleJPEGs:{key:string;frame:ScreenSuccessor;captureLower:number;count:number}|undefined;
    const observed=(read:ScreenResult)=>{
      const t=read.trace!;
      previousRetryFrame=currentRetryFrame;currentRetryFrame=t.retry_frame as AdvancingReadFrame|undefined;
      const stale=read[pairedStaleWitness];
      const previous=advancingStaleJPEGs;
      advancingStaleJPEGs=undefined;
      const captureLower=t.capture_lower_ms;
      if(pairedSnapshot&&args.after_command_min_gap_ms===300&&stale&&t.miss==="frame_too_old"&&
        typeof captureLower==="number"&&Number.isFinite(captureLower)&&
        Number(t.d1_inline_jpeg_chars)>0&&typeof stale.prior.afterAck==="number"&&stale.prior.captureMono>stale.prior.afterAck+300){
        const {command,scope,prior,input}=stale;
        const key=JSON.stringify([command,scope.device,scope.session,scope.lease,prior.worker,prior.broadcast,
          prior.control,prior.geometry,prior.afterAck,input.hardware,input.boot]);
        const advances=previous?.key===key&&prior.frame!==previous.frame.frame&&prior.frameSeq>previous.frame.frameSeq&&
          Number(prior.sourceSeq)>Number(previous.frame.sourceSeq)&&prior.captureMono>previous.frame.captureMono&&
          captureLower>previous.captureLower;
        advancingStaleJPEGs={key,frame:prior,captureLower,count:advances?previous.count+1:1};
      }
      attempts++;maxSnapshotMS=Math.max(maxSnapshotMS,Number(t.lookup_max_ms??t.lookup_ms)||0);
      if(typeof t.frame_id!=="string")return;
      frames.add(t.frame_id);withFrame++;lastID=t.frame_id;
      const sequence=Number.isSafeInteger(t.frame_seq)?t.frame_seq as number:null,source=Number.isSafeInteger(t.source_seq)?t.source_seq as number:null;
      if(sequence!==null)sequenceSamples++;if(source!==null)sourceSamples++;
      firstSequence??=sequence;lastSequence=sequence;firstSource??=source;lastSource=source;
      lastCapture=typeof t.capture_lower_ms==="number"&&Number.isFinite(t.capture_lower_ms)?t.capture_lower_ms:null;
      lastAge=typeof t.frame_age_ms==="number"&&Number.isFinite(t.frame_age_ms)?t.frame_age_ms:null;
    };
    observed(result);
    const confirmed=pairedSnapshot?initial.rows.results.find(row=>row.after_state==="board_acked"):undefined;
    const pairedClickConfirmed=confirmed!==undefined;
    const captureFloor=pairedClickConfirmed&&typeof trace.after_capture_not_before_mono_ms==="number"?trace.after_capture_not_before_mono_ms:null;
    const captureGap=Number(args.after_command_min_gap_ms??0);
    const commitBarrierGap=captureGap===300||(captureGap===120&&initial?.shortSettle===true);
    const barrier:FrameCommitBarrier|undefined=commitBarrierGap&&confirmed?.after_device_id&&confirmed.after_session_id&&confirmed.after_worker_id&&
      typeof confirmed.after_lease_epoch==="number"&&typeof confirmed.after_ack_mono_ms==="number"?
      {owner:user.id,device:confirmed.after_device_id,session:confirmed.after_session_id,worker:confirmed.after_worker_id,
        lease:confirmed.after_lease_epoch,captureAfter:confirmed.after_ack_mono_ms+captureGap}:undefined;
    const skipImmediateRetry=captureFloor!==null&&captureGap===300&&captureFloor-this.readNow()>=150;
    let scope=initialScope,backoff=skippedLoaderLookup?300:pairedSnapshot&&!skipImmediateRetry?0:150;
    const maximumInterval=pairedClickConfirmed?250:500;
    // A query dispatched early may execute in D1 after the capture. Keep a
    // full paired cadence or the observed batch duration, whichever is longer.
    const skipBefore=captureGap>300&&captureFloor!==null?captureFloor-Math.max(maximumInterval,initial?.lookupMS??0):null;
    let skippedPreCaptureSlots=0,checkedCommit=false,commitAdvanceMS=0;
    let preserveRetryAt=skippedLoaderLookup?Math.max(nextCueSlot+300,this.readNow()+Math.max(0,nextCueSlot-attemptStarted)):0;
    trace.wait_for_new_ms=waitMS;
    while(retryBudget>0&&waitMS>0&&result.trace?.retryable===true&&!args[actionAfterImageRead]?.signal?.aborted){
      scope??=result.trace.retry_scope as ScreenScope;
      if(!scope)break;
      const afterAttempt=this.readNow(),remaining=deadline-afterAttempt;
      if(remaining<=0){trace.retry_budget_exhausted=true;break;}
      // Bound attempt-start frequency, not sleep plus lookup time. A slow
      // snapshot has already consumed this interval and the shared deadline.
      let delay=nextPollDelayMS(backoff,attemptStarted,afterAttempt,deadline);
      delay=Math.max(delay,Math.ceil(Math.min(remaining,Math.max(0,preserveRetryAt-afterAttempt))));
      const ordinaryDelay=delay;
      delay=advancingReadDelayMS({ordinary:ordinaryRead,delay,requestStarted:budgetStarted,attemptStarted,now:afterAttempt,deadline,
        previous:previousRetryFrame,current:currentRetryFrame});
      if(delay<ordinaryDelay)earlyAdvances++;
      if(skipBefore!==null&&skipBefore-afterAttempt>=150){
        const skipUntil=Math.min(skipBefore,deadline);
        let planned=afterAttempt+delay;
        if(planned<skipUntil){
          // Advance the existing retry schedule without issuing snapshots
          // inside the part of the capture window farthest from eligibility.
          do{
            skippedPreCaptureSlots++;
            backoff=Math.min(maximumInterval,backoff+150);
            planned+=backoff;
          }while(planned<skipUntil);
          delay=Math.ceil(Math.min(planned,deadline)-afterAttempt);
        }
      }
      trace.retry_trigger??=result.trace.miss??null;
      let waited=delay,advancedThisRetryMS=0;
      const middle=Math.ceil(delay/2),scheduled=afterAttempt+delay;
      const readyBarrier=result.trace.ready_commit_barrier as FrameCommitBarrier|undefined;
      const candidateBarrier=barrier??readyBarrier;
      const commitBarrier=candidateBarrier?.device===scope.device&&candidateBarrier.session===scope.session&&
        candidateBarrier.lease===scope.lease?candidateBarrier:undefined;
      const ordinaryWait=barrier&&afterAttempt+middle>=(captureFloor??0)&&
        ["no_frame","before_command_receipt","frame_too_old","frame_expired"].includes(String(result.trace.miss));
      const readinessWait=readyBarrier&&backoff>=450;
      if(!checkedCommit&&this.cache&&commitBarrier&&delay>=100&&(ordinaryWait||readinessWait)){
        // Keep this request's own timer. A matching upload only advances one
        // scheduled snapshot, and a later miss retains the previous cadence.
        checkedCommit=true;
        let committed=this.cache.hasCommitAfter(commitBarrier);
        if(!committed){await this.readSleep(middle);committed=this.cache.hasCommitAfter(commitBarrier);}
        if(!committed&&readinessWait){
          // The loader often clears after the midpoint. Sample local state
          // once more inside this same slot without scheduling another read.
          const untilLateCheck=scheduled-Math.floor(delay/4)-this.readNow();
          if(untilLateCheck>0)await this.readSleep(Math.ceil(untilLateCheck));
          committed=this.cache.hasCommitAfter(commitBarrier);
        }
        const checkedAt=this.readNow();
        if(committed&&checkedAt<scheduled){
          commitAdvanceMS=scheduled-checkedAt;
          advancedThisRetryMS=commitAdvanceMS;
          waited=Math.max(0,checkedAt-afterAttempt);
          preserveRetryAt=scheduled+Math.min(maximumInterval,backoff+150);
        }else if(checkedAt<scheduled)await this.readSleep(Math.ceil(scheduled-checkedAt));
      }else if(delay>0)await this.readSleep(delay);
      trace.retry_wait_ms=Number(trace.retry_wait_ms??0)+waited;trace.no_wait=false;
      if(this.readNow()>=deadline||args[actionAfterImageRead]?.signal?.aborted){trace.retry_budget_exhausted=true;break;}
      const committedRam=commitBarrier&&this.cache?.hasCommitAfter(commitBarrier)?this.cache.holdHint(scope.device,user.id):undefined;
      attemptStarted=this.readNow();
      // A freshness miss does not invalidate a newer pixel-cache entry. Keep
      // hints advisory on retries and authorize each exact frame in D1 again.
      // A real missing-cache fallback below still requests inline bytes.
      const next=await this.readScreenOnce(user,{...args,device_id:scope.device},requestID,forceInline&&!committedRam,scope,deadline,undefined,readyCueCommandID,committedRam,
        "live_image",undefined,timingContext,ordinaryTiming?{log:ordinaryTiming,phase:"retry"}:undefined),t=next.trace!;
      if(advancedThisRetryMS>0&&t.retryable===true){
        preserveRetryAt=Math.max(preserveRetryAt,this.readNow()+advancedThisRetryMS);
      }
      observed(next);
      const totals={lookups:Number(trace.lookups)+Number(t.lookups),lookup_ms:Number(trace.lookup_ms)+Number(t.lookup_ms),
        lookup_max_ms:Math.max(Number(trace.lookup_max_ms??0),Number(t.lookup_max_ms??0)),
        retry_count:Number(trace.retry_count)+Number(t.lookups),retry_wait_ms:trace.retry_wait_ms,retry_trigger:trace.retry_trigger,
        private_pixel_probe_ms:Number(trace.private_pixel_probe_ms)+Number(t.private_pixel_probe_ms),
        d1_inline_jpeg_chars:Number(trace.d1_inline_jpeg_chars)+Number(t.d1_inline_jpeg_chars),cache_fallback:Boolean(trace.cache_fallback||t.cache_fallback),
        d1_timing:mergeD1Timing(trace.d1_timing as D1Timing,t.d1_timing as D1Timing)};
      trace={...trace,...t,...totals,wait_for_new_ms:waitMS,no_wait:false};result=next;backoff=Math.min(maximumInterval,backoff+150);
    }
    // Diagnostic endpoints of attempts, never a claim about every intervening
    // producer callback. A terminal scope/auth change redacts prior frame data.
    if(Number(trace.lookups)>1||!['available','unchanged','repeated'].includes(result.state)){
      const allowed=result.trace?.retryable===true||['available','unchanged','repeated'].includes(result.state);
      trace.frame_progress=allowed?{observation:frames.size===0?"no_frame_seen":frames.size>1?"frame_changed":attempts>1?"same_frame_seen":"single_frame_seen",
        attempts_sampled:attempts,attempts_with_frame:withFrame,distinct_frames:frames.size,
        frame_sequence_advanced:sequenceSamples>=2&&firstSequence!==null&&lastSequence!==null?lastSequence>firstSequence:null,
        source_sequence_advanced:sourceSamples>=2&&firstSource!==null&&lastSource!==null?lastSource>firstSource:null,
        last_seen_frame_id:lastID,last_seen_frame_seq:lastSequence,last_seen_source_seq:lastSource,
        last_seen_capture_lower_server_utc_ms:lastCapture,last_seen_age_ms:lastAge,max_snapshot_ms:maxSnapshotMS,
        last_attempt_has_frame:typeof result.trace?.frame_id==="string"}:{observation:"terminal",attempts_sampled:attempts,max_snapshot_ms:maxSnapshotMS};
    }
    // Internal routing never becomes a caller-visible alternate device hint.
    delete trace.retry_scope;delete trace.retryable;delete trace.retry_frame;delete trace.after_capture_not_before_mono_ms;delete trace.ready_commit_barrier;
    if(earlyAdvances)trace.early_advancing_retries=earlyAdvances;
    if(skippedPreCaptureSlots)trace.skipped_pre_capture_slots=skippedPreCaptureSlots;
    if(commitAdvanceMS>0)trace.frame_commit_advance_ms=commitAdvanceMS;
    trace.retry_elapsed_ms=Math.max(0,this.readNow()-budgetStarted);
    trace.termination=['available','unchanged','repeated'].includes(result.state)?"success":trace.retry_budget_exhausted?"timeout":waitMS===0||retryBudget<=0?"no_wait":"terminal";
    const stale=result[pairedStaleWitness],ageLimit=captureAgeLimit(args);
    if(stale&&trace.termination==="timeout"&&(advancingStaleJPEGs?.count??0)>=3&&
      typeof trace.frame_age_ms==="number"&&trace.frame_age_ms>=ageLimit&&trace.frame_age_ms<=ageLimit+250){
      result={...result,[pairedStaleWitness]:{...stale,lastProgressingLookupStarted:attemptStarted}};
    }
    trace.server_tool_ms=performance.now()-started;
    if(report)console.info(JSON.stringify({event:"screen_read",...trace,state:result.state,reason:result.reason??null,age_ms:result.metadata?.age_ms??trace.frame_age_ms,image_base64_bytes:result.image?.length??0}));
    return {...result,trace};
  }
  /** Existing command admission uses its original reviewed-source window. */
  async revalidateCommandSource(user:User,device:string,reference:string) {
    return this.readScreenOnce(user,{device_id:device,if_unchanged_since:reference},uid(),false,undefined,Infinity,
      undefined,undefined,undefined,"command_source");
  }
  private async readScreenOnce(user:User,args:ScreenReadArguments,requestID:string,forceInline:boolean,expectedScope:ScreenScope|undefined,deadline:number,
    initial?:InitialScreenSnapshot,readyCueCommandID?:string,committedRam?:ReturnType<LiveFrameCache["holdHint"]>,
    purpose:"live_image"|"command_source"="live_image",newerThan?:ScreenSuccessor,afterTiming?:{log:ClickAfterImageTiming;phase:ClickAfterImagePhase},
    ordinaryTiming?:OrdinaryReadTimingContext):Promise<ScreenResult>{
    if(initial)need(initial[screenSnapshotSeal]===true&&initial.owner===user.id,"UNAUTHENTICATED",401);
    const started = initial?.started??performance.now(), now = this.now();
    const selected = args.device_id == null ? null : uuid(args.device_id);
    const afterCommand=args.after_command_id==null?null:uuid(args.after_command_id);
    if(readyCueCommandID!==undefined)need(readyCueCommandID===afterCommand,"INVALID_READY_CUE",422);
    const actionKind=args[actionAfterImageRead]?.currentInput?.kind;
    const minGap=integer(args.after_command_min_gap_ms??0,0,
      actionKind==="click"||actionKind==="system_search"||actionKind==="focused_text"||actionKind==="parked_move"?clickRelookMaxGapMS:2000);
    need(minGap===0||afterCommand!==null,"AFTER_COMMAND_REQUIRED",422);
    need(args.allow_repeated==null||typeof args.allow_repeated==="boolean","INVALID_ARGUMENTS",422);
    const allowRepeated=afterCommand===null&&args.allow_repeated===true;
    const priorView=args.if_unchanged_since==null?null:uuid(args.if_unchanged_since);
    const conditionalHint=forceInline?null:priorView?.slice(0,8)??null;
    const sourceReview=purpose==="command_source";
    const staticEnabled=!sourceReview&&!newerThan&&(args[visualRead]===true||args[actionAfterImageRead]!==undefined);
    const snapshotMaxAge=sourceReview?commandSourceMaxAgeMS:captureAgeLimit(args);
    const maxAge = Math.min(snapshotMaxAge,args.max_age_ms == null ? snapshotMaxAge : integer(args.max_age_ms, 100, 3000));
    const captureAgeAllowed=(now:number,lower:number)=>sourceReview?now-lower<=maxAge:liveFrameAge(now,lower,maxAge,snapshotMaxAge)!==null;
    const waitMS=0;
    // Pin an advisory copy for this one atomic read. A concurrent publication
    // may replace the cache head while D1 is returning the selected frame.
    // The existing held reader still requires the exact authorized scope/hash
    // and refuses cleared, expired or different-session cache state.
    const heldRam=initial?.heldRam??committedRam;
    const heldHints=heldRam?[heldRam]:!initial&&!forceInline?this.cache?.holdHints(user.id,selected)??[]:[];
    const ramHints=initial?.ramHints??(forceInline?[]:heldHints.map(hint=>hint.key));
    const edgeStarted=performance.now(),edge=initial||forceInline||priorView||ramHints.length?null:await this.privatePixels?.peek(user.id,selected)??null;
    need(!args[actionAfterImageRead]?.signal?.aborted,"OBSERVATION_BUDGET_EXHAUSTED");
    const edgeMS=performance.now()-edgeStarted;
    const hints=forceInline?[]:[...new Set([...ramHints,...(edge?[edge.key]:[])])];
    // Ambiguous or paused candidates cannot transfer JPEG bytes out of D1.
    // The current session and frame are read together; no earlier pixels or
    // orientation metadata survive from a separate routing round trip.
    const query=screenSnapshotQuery({owner:user.id,selected,now,maxAge,hints,conditionalHint,afterCommand,afterMinGapMS:minGap,allowRepeated,readyCueCommandID,staticFreshness:staticEnabled,
      strictAgeCutoff:args[actionAfterImageRead]!==undefined||args[visualRead]===true&&maxAge===visualReadAgeLimitMS,
      visualPoint:(args[visualRead]===true||afterCommand!==null)&&this.releasedFieldViewProofAvailable,
      currentInput:args[actionAfterImageRead]?.currentInput?.kind,
      includeReadTime:!!afterTiming||!!ordinaryTiming});
    const queryStarted=performance.now();
    const attempt=initial?.afterTiming?.attempt??afterTiming?.log.begin(afterTiming.phase,this.now());
    const ordinaryAttempt=ordinaryTiming?.log.begin(ordinaryTiming.phase,this.now());
    let rows=initial?.rows;
    if(!rows){
      try {rows=await this.stmt(query.sql,...query.values).all<Frame&ScreenSnapshotRoute>();}
      catch(error){
        if(attempt){attempt.worker_return_utc_ms=this.now();attempt.miss="lookup_error";}
        if(ordinaryAttempt){ordinaryAttempt.worker_return_utc_ms=this.now();ordinaryAttempt.reason="lookup_error";ordinaryTiming?.log.redact();}
        throw error;
      }
      if(attempt){attempt.worker_return_utc_ms=this.now();attempt.d1_read_at_utc_ms=rows.results[0]?.d1_read_at_utc_ms??null;}
      if(ordinaryAttempt){
        ordinaryAttempt.worker_return_utc_ms=this.now();
        const d1ReadAt=rows.results[0]?.d1_read_at_utc_ms;
        ordinaryAttempt.d1_read_at_utc_ms=typeof d1ReadAt==="number"&&Number.isSafeInteger(d1ReadAt)?d1ReadAt:null;
      }
    }
    need(!args[actionAfterImageRead]?.signal?.aborted,"OBSERVATION_BUDGET_EXHAUSTED");
    const timing=initial?.d1Timing??placementTiming(this.db,this.now(),"read_snapshot",rows,performance.now()-queryStarted,1);
    if(!initial)afterTiming?.log.recordDatabase(timing);
    const trace = { revision: "0.9.0",retryable:false,retry_scope:undefined as ScreenScope|undefined,retry_frame:undefined as AdvancingReadFrame|undefined, request_id: requestID, max_age_ms: maxAge, wait_for_new_ms:waitMS,retry_wait_ms:0,retry_budget_exhausted:false,retry_trigger:null as string|null,frame_id: null as string | null, lease_epoch: null as number | null, orientation_epoch: null as number | null,
      lookups: 1, lookup_ms: performance.now() - started-edgeMS, d1_timing:timing, private_pixel_probe_ms:edgeMS, private_pixel_hint:edge!==null, fence_ms: 0, source: "d1_atomic_snapshot", cache_hit: false, no_wait: true, server_tool_ms: 0, retry_count: 0,
      frame_age_ms: null as number | null,frame_seq:null as number|null,source_seq:null as number|null,capture_lower_ms:null as number|null,lookup_max_ms:performance.now()-started-edgeMS, freshness_unknown: false, clock_rtt_ms: null as number | null, queue_ms: null as number | null, miss: null as string | null,
      after_capture_not_before_mono_ms:null as number|null,ready_commit_barrier:undefined as FrameCommitBarrier|undefined,
      ram_hint_count:ramHints.length,pixel_source:null as string|null,d1_inline_jpeg_chars:rows.results.reduce((sum,row)=>sum+(row.inline_jpeg?.length??0),0),cache_fallback:false,clock_probe_id:null as string|null,jpeg_quality:null as number|null };
    if(initial){trace.lookup_ms=initial.lookupMS;trace.lookup_max_ms=initial.lookupMS;trace.source=initial.source;}
    const finish = (value: ScreenResult): ScreenResult => {
      const named=rows.results.filter(row=>row.candidate_id!=null),activeNames=named.filter(row=>row.candidate_capture_state==="active");
      const selectedName=activeNames.length===1?activeNames[0]:named.length===1?named[0]:undefined;
      if(selectedName){rememberPhoneName(this,selectedName.candidate_id,selectedName.candidate_name);value={...value,device_name:selectedName.candidate_name};}
      trace.server_tool_ms = performance.now() - started;
      if(attempt)attempt.miss??=trace.miss??(typeof value.reason==="string"?value.reason:null);
      if(ordinaryAttempt){
        ordinaryAttempt.reason??=trace.miss??(typeof value.reason==="string"?value.reason:value.state);
        if(value.state==="choose_device"||value.state==="paused"||value.reason==="START_SAYSO_BROADCAST"||
          value.reason==="FRAME_OR_SESSION_CHANGED")ordinaryTiming?.log.redact();
      }
      return { ...value, trace };
    };
    if(newerThan&&this.readNow()>=deadline)return finish({state:"unavailable",reason:"OBSERVATION_BUDGET_EXHAUSTED"});
    const retryLatest=async(scope:{device:string;session:string;lease:number}):Promise<ScreenResult|null>=>{
      trace.retryable=true;trace.retry_scope=scope;return null;
    };
    const candidates=rows.results.filter(row=>row.candidate_id!=null);
    const active = candidates.filter(row => row.candidate_capture_state === "active");
    if (active.length > 1) return finish({ state: "choose_device", devices: active.map(row => ({ device_id: row.candidate_id, name: row.candidate_name })) });
    const frame = active[0];
    const command=afterCommand?rows.results.find(row=>row.after_id===afterCommand):null;
    if(afterCommand&&!command){trace.miss="command_not_found";return finish({state:"unavailable",reason:"COMMAND_NOT_FOUND"});}
    if (!frame) return finish(candidates.length ? { state: "paused", reason: "CAPTURE_PAUSED", worker_online: candidates.some(row => row.candidate_expires > this.now()), last_reported_state: "paused" } : { state: "unavailable", reason: afterCommand?"AFTER_COMMAND_SCOPE_CHANGED":"START_SAYSO_BROADCAST" });
    if (frame.candidate_expires <= this.now()) { trace.miss = "worker_expired"; return finish({ state: "unavailable", reason: "FRAME_OR_SESSION_CHANGED" }); }
    const scope={device:frame.candidate_id,session:frame.candidate_session,lease:frame.candidate_lease_epoch};
    if(expectedScope&&(scope.device!==expectedScope.device||scope.session!==expectedScope.session||scope.lease!==expectedScope.lease)){
      trace.miss="scope_changed";return finish({state:"unavailable",reason:"FRAME_OR_SESSION_CHANGED"});
    }
    ordinaryTiming?.log.observeAuthority(JSON.stringify([scope.device,scope.session,scope.lease,frame.candidate_worker_id,frame.candidate_control_epoch]));
    if(command){
      const boundToWorker=command.after_worker_id!=null||command.after_lease_epoch!=null||command.after_state==="board_acked";
      if(command.after_device_id!==scope.device||command.after_session_id!==scope.session||command.after_control_epoch!==frame.candidate_control_epoch||
        (boundToWorker&&(command.after_worker_id!==frame.candidate_worker_id||command.after_lease_epoch!==scope.lease))){
        trace.miss="after_command_scope_changed";return finish({state:"unavailable",reason:"AFTER_COMMAND_SCOPE_CHANGED"});
      }
      if(command.after_state!=="board_acked"){
        trace.miss="command_not_confirmed";
        const retried=["queued","claimed","executing"].includes(String(command.after_state))&&Number(command.after_expires_at)>this.now()?await retryLatest(scope):null;
        return retried??finish({state:"unavailable",reason:"COMMAND_NOT_CONFIRMED",after_command:{command_id:afterCommand,command_state:command.after_state,relation:"not_confirmed",app_effect_observed:false}});
      }
      if(typeof command.after_ack_mono_ms!=="number"||!Number.isFinite(command.after_ack_mono_ms)||command.after_ack_mono_ms<0||command.after_ack_mono_ms>Number.MAX_SAFE_INTEGER){
        trace.miss="command_clock_unavailable";return finish({state:"unavailable",reason:"COMMAND_CLOCK_UNAVAILABLE"});
      }
      if(newerThan?.afterAck!==undefined&&command.after_ack_mono_ms!==newerThan.afterAck){
        trace.miss="after_command_ack_changed";return finish({state:"unavailable",reason:"AFTER_COMMAND_SCOPE_CHANGED"});
      }
      if(readyCueCommandID!==undefined&&command.after_worker_id){
        // The confirmed scope can wait for a commit even while D1 still
        // contains the first loading JPEG or has no eligible frame yet.
        trace.ready_commit_barrier={owner:user.id,device:scope.device,session:scope.session,lease:scope.lease,
          worker:command.after_worker_id,captureAfter:command.after_ack_mono_ms+minGap,readyCueCommandID};
      }
    }
    const requiredInput=args[actionAfterImageRead]?.currentInput;
    const currentInput=requiredInput?liveInputScope(frame,this.now()):undefined;
    if(requiredInput&&(!currentInput||currentInput.hardware!==requiredInput.hardware||currentInput.boot!==requiredInput.boot)){
      trace.miss="after_command_scope_changed";return finish({state:"unavailable",reason:"AFTER_COMMAND_SCOPE_CHANGED"});
    }
    if (!frame.frame_id) { trace.miss = "no_frame"; return await retryLatest(scope)??finish({ state: "unavailable", reason: "NO_FRESH_FRAME" }); }
    const metadata = JSON.parse(frame.metadata);
    if(currentInput&&currentInput.broadcast!==metadata.broadcast_id){
      trace.miss="after_command_scope_changed";return finish({state:"unavailable",reason:"AFTER_COMMAND_SCOPE_CHANGED"});
    }
    const captureMono=metadata.capture_clock_verified===true&&typeof metadata.capture_mono_ms==="number"&&Number.isFinite(metadata.capture_mono_ms)&&metadata.capture_mono_ms>=0?metadata.capture_mono_ms as number:null;
    const retryGeometry=newerThan?screenGeometry(metadata):undefined;
    const successorInput=newerThan?.input?liveInputScope(frame,this.now()):undefined;
    if(newerThan?.input&&(!successorInput||successorInput.hardware!==newerThan.input.hardware||
       successorInput.boot!==newerThan.input.boot||successorInput.broadcast!==newerThan.broadcast)){
      trace.miss="after_command_scope_changed";return finish({state:"unavailable",reason:"AFTER_COMMAND_SCOPE_CHANGED"});
    }
    if(newerThan&&(frame.candidate_worker_id!==newerThan.worker||metadata.worker_id!==newerThan.worker||
      metadata.bridge_session_id!==scope.session||metadata.lease_epoch!==scope.lease||metadata.broadcast_id!==newerThan.broadcast||
      frame.candidate_control_epoch!==newerThan.control||JSON.stringify(retryGeometry)!==newerThan.geometry)){
      trace.miss="scope_changed";return finish({state:"unavailable",reason:"FRAME_OR_SESSION_CHANGED"});
    }
    const priorSourceSeq=typeof newerThan?.sourceSeq==="number"&&Number.isSafeInteger(newerThan.sourceSeq)?newerThan.sourceSeq:null;
    if(newerThan&&(metadata.provenance!=="device_capture"||captureMono===null||
      (priorSourceSeq!==null&&!Number.isSafeInteger(metadata.source_seq)))){
      trace.miss="capture_clock_unavailable";return finish({state:"unavailable",reason:"NO_FRESH_FRAME"});
    }
    const transientSuccessor=Boolean(newerThan&&(!command||(captureMono!==null&&captureMono>command.after_ack_mono_ms!+minGap)));
    const unavailableSuccessor=(transient:boolean)=>finish({state:"unavailable",reason:"NO_FRESH_FRAME",
      ...(transient?{[releaseSuccessorMiss]:true as const}:{})});
    const presentationAge=typeof frame.repeat_presented_at==="number"&&Number.isFinite(frame.repeat_presented_at)?this.now()-frame.repeat_presented_at:Infinity;
    const staticRead=staticEnabled&&staticFrameEligible(frame,this.now(),!command&&captureAgeAllowed(this.now(),frame.capture_lower!));
    const repeated=staticRead||allowRepeated&&frame.capture_lower!=null&&this.now()-frame.capture_lower>maxAge&&presentationAge>=-100&&presentationAge<=maxAge&&frame.repeat_phone_mono_ms!=null;
    trace.frame_id = frame.frame_id; trace.lease_epoch = frame.lease_epoch; trace.orientation_epoch = metadata.orientation_epoch;
    trace.frame_seq=Number.isSafeInteger(frame.frame_seq)?frame.frame_seq:null;
    trace.source_seq=Number.isSafeInteger(metadata.source_seq)?metadata.source_seq:null;
    trace.capture_lower_ms=typeof frame.capture_lower==="number"&&Number.isFinite(frame.capture_lower)?frame.capture_lower:null;
    if(attempt){
      attempt.frame_id=trace.frame_id;attempt.frame_seq=trace.frame_seq;attempt.capture_lower_server_utc_ms=trace.capture_lower_ms;
      attempt.inline_jpeg_chars=frame.inline_jpeg?.length??0;
    }
    if(ordinaryAttempt&&ordinaryTiming){
      if(metadata.worker_id!==frame.candidate_worker_id||metadata.bridge_session_id!==scope.session||
        metadata.lease_epoch!==scope.lease||typeof metadata.broadcast_id!=="string")ordinaryTiming.log.redact();
      else{
        ordinaryTiming.log.observeFrameScope(JSON.stringify([metadata.broadcast_id,metadata.orientation_epoch]));
        if(captureMono!==null&&trace.capture_lower_ms!==null&&metadata.provenance==="device_capture"){
          ordinaryAttempt.frame_id=trace.frame_id;
          ordinaryAttempt.frame_seq=trace.frame_seq;
          ordinaryAttempt.capture_lower_server_utc_ms=trace.capture_lower_ms;
        }
      }
    }
    trace.frame_age_ms = frame.capture_lower == null ? null : Math.max(0, this.now() - frame.capture_lower);
    trace.freshness_unknown = frame.capture_lower == null;
    trace.clock_rtt_ms = metadata.clock_rtt_ms ?? null; trace.queue_ms = metadata.client_timing?.queue_ms ?? null;
    trace.clock_probe_id=metadata.clock_probe_id??null;
    trace.jpeg_quality=metadata.client_timing?.jpeg_quality??null;
    const checkedAt=this.now();
    const future=frame.capture_lower!==null&&frame.capture_lower>checkedAt+(sourceReview?250:0);
    if (frame.capture_lower == null || frame.expires_at <= checkedAt || (!repeated&&!captureAgeAllowed(checkedAt,frame.capture_lower)) || future) {
      trace.miss = frame.capture_lower == null ? "unknown_clock" : frame.expires_at <= checkedAt ? "frame_expired" : future ? "future_capture" : "frame_too_old";
      if(newerThan)return unavailableSuccessor(transientSuccessor&&trace.miss==="frame_too_old"&&Number.isFinite(frame.capture_lower));
      if(!sourceReview&&!repeated&&trace.miss==="frame_too_old"&&captureMono!==null&&metadata.worker_id===frame.candidate_worker_id&&
        metadata.bridge_session_id===scope.session&&metadata.lease_epoch===scope.lease&&typeof metadata.broadcast_id==="string"&&
        Number.isSafeInteger(frame.candidate_control_epoch)&&Number.isSafeInteger(metadata.orientation_epoch)){
        trace.retry_frame={scope:JSON.stringify([user.id,scope.device,scope.session,frame.candidate_worker_id,scope.lease,frame.candidate_control_epoch,metadata.broadcast_id,metadata.orientation_epoch]),
          frame:frame.frame_id,sequence:frame.frame_seq,source:trace.source_seq,captureMono,captureLower:frame.capture_lower!};
      }
      const retried=(trace.miss==="frame_expired"||trace.miss==="frame_too_old")?await retryLatest(scope):null;
      if(retried)return retried;
      const input=command&&trace.retry_frame?liveInputScope(frame,checkedAt):undefined;
      const witness=afterCommand&&command&&input&&captureMono!==null&&metadata.provenance==="device_capture"&&
        metadata.broadcast_id===input.broadcast&&Number.isFinite(frame.capture_lower)&&Number.isSafeInteger(frame.frame_seq)&&
        Number.isSafeInteger(metadata.source_seq)&&metadata.source_seq>0?{command:afterCommand,scope,input,
        prior:{frame:frame.frame_id,frameSeq:frame.frame_seq,sourceSeq:metadata.source_seq,captureMono,
          worker:frame.candidate_worker_id,broadcast:input.broadcast,control:frame.candidate_control_epoch,
          geometry:JSON.stringify(screenGeometry(metadata)),afterAck:command.after_ack_mono_ms!,input}}:undefined;
      return finish({ state: "unavailable", reason: "NO_FRESH_FRAME",...(witness?{[pairedStaleWitness]:witness}:{}) });
    }
    const geometry=retryGeometry??screenGeometry(metadata);
    if(newerThan&&(frame.frame_id===newerThan.frame||frame.frame_seq<=newerThan.frameSeq||
      captureMono===null||captureMono<=newerThan.captureMono||
      (priorSourceSeq!==null&&metadata.source_seq<=priorSourceSeq))){
      trace.miss="no_newer_capture";return unavailableSuccessor(transientSuccessor);
    }
    if(command&&(captureMono===null||metadata.worker_id!==command.after_worker_id)){
      trace.miss="capture_clock_unavailable";return finish({state:"unavailable",reason:"CAPTURE_CLOCK_UNAVAILABLE"});
    }
    if(command&&!staticRead&&captureMono! <= command.after_ack_mono_ms!+minGap){
      trace.miss="before_command_receipt";
      const phoneInterval=command.after_ack_mono_ms!-captureMono!+minGap;
      const checkedAtMono=this.readNow();
      const checkedAt=this.now();
      if(frame.capture_lower<=checkedAt&&phoneInterval<=2000){
        // Advance an existing server lower bound by an interval on the same
        // phone clock. Leave a margin and schedule from the monotonic clock.
        const untilCapture=frame.capture_lower+phoneInterval-checkedAt-20;
        if(untilCapture>0)trace.after_capture_not_before_mono_ms=checkedAtMono+untilCapture;
      }
      return await retryLatest(scope)??finish({state:"unavailable",reason:"WAITING_POST_COMMAND_FRAME",after_command:{command_id:afterCommand,command_state:command.after_state,relation:"not_after_receipt",app_effect_observed:false}});
    }
    if(!staticRead&&readyCueCommandID!==undefined&&metadata.ready_cue_command_id!==readyCueCommandID){
      trace.miss="ready_cue_not_seen";
      trace.retryable=true;
      trace.retry_scope=scope;
      return finish({state:"unavailable",reason:"WAITING_READY_CUE"});
    }
    const afterProof=command?{command_id:afterCommand,command_state:command.after_state,relation:"capture_after_phone_board_ack",scope_matches_at_snapshot:true,phone_clock:"iphone_system_uptime_ms",phone_ack_mono_ms:command.after_ack_mono_ms,capture_lower_phone_mono_ms:captureMono,lower_gap_ms:captureMono! - command.after_ack_mono_ms!,minimum_gap_ms:minGap,app_effect_observed:false}:null;
    const identity={owner:user.id,device:frame.candidate_id,session:frame.candidate_session,lease:frame.lease_epoch,sha256:frame.sha256,
      geometry:JSON.stringify(geometry)};
    const compact={...(metadata.event_clock?{event_clock:metadata.event_clock}:{}),device_id:frame.candidate_id,bridge_session_id:frame.candidate_session,broadcast_id:metadata.broadcast_id??null,worker_id:metadata.worker_id??null,worker_id_at_read:frame.candidate_worker_id,lease_epoch:frame.lease_epoch,control_epoch_at_read:frame.candidate_control_epoch,
      frame_id:frame.frame_id,frame_seq:frame.frame_seq,source_seq:metadata.source_seq??null,capture_lower_phone_mono_ms:captureMono,phone_clock:"iphone_system_uptime_ms",capture_clock_verified:captureMono!==null,capture_lower_server_utc_ms:frame.capture_lower,
      age_reported_at_server_utc_ms:0,age_timing_point:"server_before_tool_result_serialization",
      width:metadata.width,height:metadata.height,native_width_px:metadata.native_width_px,native_height_px:metadata.native_height_px,orientation:metadata.orientation,orientation_epoch:metadata.orientation_epoch,age_ms:Math.max(0,this.now()-frame.capture_lower),stale:false,
      ...(metadata.ready_cue_supported===true?{ready_cue_supported:true}:{}),
      ...(metadata.loading_cue_supported===true?{loading_cue_supported:true}:{}),
      ...(metadata.maps_tiles_cue_supported===true?{maps_tiles_cue_supported:true}:{}),
      ...(metadata.loading_cue_command_id===afterCommand&&afterCommand?{loading_cue_command_id:afterCommand}:{}),
      ...(metadata.ready_cue_command_id===afterCommand&&afterCommand?{ready_cue_command_id:afterCommand}:{})};
    const deliver=(value:ScreenResult):ScreenResult=>{
      const now=this.now();compact.age_ms=Math.max(0,now-frame.capture_lower!);compact.age_reported_at_server_utc_ms=now;
      if(now>=frame.candidate_expires)return finish({state:"unavailable",reason:"FRAME_OR_SESSION_CHANGED"});
      if(currentInput&&now>=currentInput.mouseUntil)return finish({state:"unavailable",reason:"AFTER_COMMAND_SCOPE_CHANGED"});
      if(frame.expires_at<=now||(!repeated&&!captureAgeAllowed(now,frame.capture_lower!))||(repeated&&!staticRead&&now-frame.repeat_presented_at!>maxAge)||(staticRead&&!staticFrameEligible(frame,now))){
        trace.miss="frame_too_old";trace.frame_age_ms=compact.age_ms;trace.retryable=true;trace.retry_scope=scope;
        return unavailableSuccessor(transientSuccessor&&frame.expires_at>now&&frame.capture_lower!<=now);
      }
      if(staticRead)return finish(staticScreenResult(value,compact,frame,metadata[staticProofKey],now,
        command?{id:afterCommand!,state:command.after_state,ack:command.after_ack_mono_ms}:undefined));
      if(repeated)return finish(legacyRepeatedResult(value,compact,metadata,frame,now));
      return finish(afterProof?{...value,after_command:afterProof}:value);
    };
    if(!repeated&&priorView&&(this.cache?this.cache.matchesView(priorView,identity):screenViewMatches(priorView,identity,this.now())))return deliver({state:"unchanged",image_ref:priorView,metadata:compact});
    const ram=!frame.inline_jpeg?this.cache?.getExact(frame.candidate_id,user.id,frame.candidate_session,frame.image_key,frame.sha256):undefined;
    const held=!ram&&!frame.inline_jpeg?heldHints.find(hint=>hint.device===frame.candidate_id)?.readAfterReplacement(frame.candidate_session,frame.image_key,frame.sha256):undefined;
    const exactEdge=!frame.inline_jpeg&&edge?.owner===user.id&&edge.device===frame.candidate_id&&edge.session===frame.candidate_session&&edge.key===frame.image_key&&edge.sha256===frame.sha256&&edge.expires>this.now()?edge.bytes:undefined;
    const cached=ram??held??exactEdge;
    if(!cached&&!frame.inline_jpeg&&!forceInline&&(hints.includes(frame.image_key)||conditionalHint===frame.sha256.slice(0,8))){
      if(this.readNow()>=deadline){trace.miss="cache_missing";trace.retryable=true;trace.retry_scope=scope;return finish({state:"unavailable",reason:"FRAME_NOT_IN_FAST_CACHE"});}
      if(attempt)attempt.miss="cache_hint_unavailable";
      if(ordinaryAttempt)ordinaryAttempt.reason="cache_hint_unavailable";
      const next=await this.readScreenOnce(user,{...args,device_id:scope.device},requestID,true,scope,deadline,undefined,readyCueCommandID,undefined,purpose,
        undefined,afterTiming?{log:afterTiming.log,phase:"cache_fallback"}:undefined,
        ordinaryTiming?{log:ordinaryTiming.log,phase:"cache_fallback"}:undefined),t=next.trace!;
      trace.lookups+=Number(t.lookups);trace.lookup_ms+=Number(t.lookup_ms);trace.retry_count=1;trace.cache_fallback=true;
      trace.d1_timing=mergeD1Timing(trace.d1_timing,t.d1_timing as D1Timing);
      trace.lookup_max_ms=Math.max(trace.lookup_max_ms,Number(t.lookup_max_ms??0));
      for(const key of ["frame_age_ms","frame_seq","source_seq","capture_lower_ms","freshness_unknown","clock_rtt_ms","clock_probe_id","jpeg_quality","queue_ms","miss","cache_hit","frame_id","lease_epoch","orientation_epoch","pixel_source","retryable","retry_scope"] as const)(trace as Record<string,unknown>)[key]=t[key];
      trace.d1_inline_jpeg_chars+=Number(t.d1_inline_jpeg_chars??0);return finish(next);
    }
    if(!cached&&!frame.inline_jpeg){trace.miss="cache_missing";trace.retryable=true;trace.retry_scope=scope;return finish({state:"unavailable",reason:"FRAME_NOT_IN_FAST_CACHE"});}
    trace.pixel_source=held?"private_ram_snapshot":ram?"private_ram":exactEdge?"private_edge":"d1_inline";trace.cache_hit=true;
    if(!newerThan&&!held&&!(ram&&committedRam?.key===frame.image_key)&&(initial?.source!=="d1_paired_result_snapshot"||this.readNow()<deadline)){
      const pixels=cached??new Uint8Array(Buffer.from(frame.inline_jpeg!,"base64"));
      if(!ram)this.cache?.put(frame.candidate_id,{owner:user.id,session:frame.candidate_session,frame:frame.frame_id,key:frame.image_key,bytes:pixels,expires:frame.expires_at});
      await this.rememberPixels({owner:user.id,device:frame.candidate_id,session:frame.candidate_session,key:frame.image_key,sha256:frame.sha256,bytes:pixels,expires:frame.expires_at});
    }
    let sourceViewProof:string|undefined;
    if(args.include_source_view_proof===true&&!repeated&&captureMono!==null&&metadata.provenance==="device_capture"&&this.framePermits?.sourceViewProofAvailable){
      const pixels=cached??Buffer.from(frame.inline_jpeg!,"base64");
      if(createHash("sha256").update(pixels).digest("hex")===frame.sha256){
        const issued=this.now();
        sourceViewProof=await this.framePermits.issueSourceViewProof(user.id,await this.proofClock({
          device:frame.candidate_id,session:frame.candidate_session,broadcast:metadata.broadcast_id,worker:frame.candidate_worker_id,
          lease:frame.lease_epoch,control:frame.candidate_control_epoch,frame:frame.frame_id,frameSeq:frame.frame_seq,sourceSeq:metadata.source_seq,
          captureMono,captureLower:frame.capture_lower,sha256:frame.sha256,geometry,issued,
          expires:Math.min(issued+sourceViewLifetimeMS,frame.capture_lower+sourceViewPreviousAgeMS),
        })).catch(()=>undefined);
      }
    }
    const initialInput=command&&!newerThan?currentInput??liveInputScope(frame,this.now()):undefined;
    return deliver({ state: "available", image:cached?Buffer.from(cached).toString("base64"):frame.inline_jpeg!, ...(repeated?{}:{image_ref:this.cache?.rememberView(identity)??screenViewReference(identity,this.now())}), metadata:compact,
      ...((!repeated||staticRead&&!command)&&(args[visualRead]===true||afterCommand!==null)?
        {[visualPointEvidence]:visualPointSource(frame,frame.visual_point_scope,metadata,this.now(),staticRead)}:{}),
      ...(successorInput?{[pairedSuccessorGrantUntil]:successorInput.mouseUntil}:{}),
      ...(initialInput?.broadcast===metadata.broadcast_id&&initialInput?{[pairedReadyInput]:initialInput}:{}),
      ...(sourceViewProof?{source_view_proof:sourceViewProof}:{}),
      snapshot: { device_id: frame.candidate_id, bridge_session_id: frame.candidate_session, ...metadata } });
  }
  private screenFence(user: User, deviceID: string, sessionID: string, frame: Frame, streamSnapshot: boolean) {
    return this.stmt("SELECT f.frame_id FROM sb_frames f JOIN sb_devices d ON d.id=f.device_id JOIN sb_sessions s ON s.id=d.current_session WHERE f.device_id=? AND f.owner_id=? AND d.owner_id=? AND s.owner_id=? AND s.id=? AND (?=1 OR f.frame_id=?) AND json_extract(f.metadata,'$.orientation_epoch')=? AND d.lease_epoch=? AND d.lease_epoch=f.lease_epoch AND s.state='active' AND s.capture_state='active' AND d.revoked=0 AND d.worker_expires>? AND f.expires_at>?", deviceID, user.id, user.id, user.id, sessionID, streamSnapshot ? 1 : 0, frame.frame_id, JSON.parse(frame.metadata).orientation_epoch, frame.lease_epoch, this.now(), this.now()).first<{ frame_id: string }>();
  }
  async getScreen(user: User, args: Record<string, unknown>, knownDevice?: Device, streamSnapshot = false, requestID = uid()): Promise<ScreenResult> {
    need(args.force_fresh == null || typeof args.force_fresh === "boolean", "INVALID_ARGUMENTS", 422);
    const start = performance.now(), device = knownDevice ?? await this.owned(user, uuid(args.device_id)), sessionID = uuid(args.bridge_session_id);
    need(device.owner_id === user.id && device.id === uuid(args.device_id), "NOT_FOUND", 404);
    need(!args.after_command_id && !args.task_id, "VIEW_ONLY_MODE", 403);
    const maxAge = Math.min(visualReadAgeLimitMS,args.max_age_ms == null ? visualReadAgeLimitMS : integer(args.max_age_ms, 100, 10_000)), wait = args.wait_ms == null ? 5000 : integer(args.wait_ms, 0, 5000);
    const isFresh=(frame:Frame)=>liveFrameAge(this.now(),frame.capture_lower,maxAge,visualReadAgeLimitMS)!==null;
    const force = args.force_fresh === true, after = args.after_frame_id ? uuid(args.after_frame_id) : null;
    const trace = { revision: "0.8.2", request_id: requestID, max_age_ms: maxAge, wait_ms: wait, server_tool_ms: 0, remaining_wait_ms: wait,
      frame_id: null as string | null, selected_age_ms: null as number | null, final_age_ms: null as number | null,
      lease_epoch: null as number | null, orientation_epoch: null as number | null, fence_passed: null as boolean | null,
      lookups: 0, lookup_ms: 0, object_ms: 0, fence_ms: 0, fence_checks: 0, cache_hit: false, source: "none" };
    let refreshID: string | null = null; const deadline = this.now() + wait;
    let selectedLower: number | null = null;
    const finish = (value: ScreenResult): ScreenResult => {
      trace.server_tool_ms = performance.now() - start; trace.remaining_wait_ms = Math.max(0, deadline - this.now());
      trace.final_age_ms = selectedLower == null ? null : Math.max(0, this.now() - selectedLower);
      console.info(JSON.stringify({ event: "screen_capture_read", ...trace, state: value.state, reason: value.reason ?? null }));
      return { ...value, trace };
    };
    do {
      const t = performance.now();
      const at=this.now(),ageComparison=maxAge===visualReadAgeLimitMS?">":">=";
      const proofScope=this.releasedFieldViewProofAvailable?","+visualPointScopeSQL("d.id","s.id","f.owner_id",databaseNowSQL)+" AS visual_point_scope":"";
      const active = await this.stmt("SELECT f.device_id,f.owner_id,f.session_id,f.frame_id,f.frame_seq,f.lease_epoch,f.image_key,f.sha256,f.metadata,f.capture_lower,f.received_at,f.expires_at,f.storage_ready,CASE WHEN f.capture_lower"+ageComparison+"? AND f.capture_lower<=? AND (?=0 OR json_extract(f.metadata,'$.refresh_request_id')=?) THEN f.inline_jpeg ELSE NULL END AS inline_jpeg,s.capture_state AS live_capture_state,s.broadcast_id AS live_broadcast,r.state AS request_state,r.error AS request_error,d.worker_id AS live_worker"+proofScope+" FROM sb_sessions s JOIN sb_devices d ON d.id=s.device_id LEFT JOIN sb_frames f ON f.device_id=d.id AND f.owner_id=s.owner_id AND f.session_id=s.id AND f.lease_epoch=d.lease_epoch AND f.expires_at>? LEFT JOIN sb_refreshes r ON r.id=? AND r.owner_id=s.owner_id AND r.session_id=s.id WHERE s.id=? AND s.device_id=? AND s.owner_id=? AND d.owner_id=? AND s.state='active' AND d.current_session=s.id AND d.revoked=0 AND d.worker_expires>?", at - maxAge, at, force ? 1 : 0, refreshID ?? "", at, refreshID ?? "", sessionID, device.id, user.id, user.id, at).first<Frame & { live_capture_state: string; live_broadcast: string; live_worker:string; visual_point_scope?:string|null; request_state: string | null; request_error: string | null }>();
      trace.lookups++; trace.lookup_ms += performance.now() - t;
      if (!active) return finish({ state: "unavailable", reason: "BROADCAST_OR_WORKER_NOT_ACTIVE" });
      if (active.live_capture_state !== "active") return finish({ state: active.live_capture_state, reason: "CAPTURE_NOT_ACTIVE" });
      const frame = active.frame_id ? active : null, meta = frame ? this.frameMetadata(frame) : null;
      selectedLower = frame?.capture_lower ?? null;
      trace.frame_id = frame?.frame_id ?? null; trace.selected_age_ms = selectedLower == null ? null : Math.max(0, this.now() - selectedLower);
      trace.lease_epoch = frame?.lease_epoch ?? null; trace.orientation_epoch = (meta?.orientation_epoch as number | undefined) ?? null; trace.fence_passed = null;
      if (frame && isFresh(frame) && (!force || (refreshID && meta!.refresh_request_id === refreshID))) {
        if (after === frame.frame_id && !force) return finish({ state: "not_modified", frame_id: frame.frame_id });
        const objectStart = performance.now(); let image: Uint8Array | null = frame.inline_jpeg ? Buffer.from(frame.inline_jpeg, "base64") : this.cache?.get(device.id, user.id, sessionID, frame.image_key) ?? null;
        trace.cache_hit = image != null;
        if (!image && frame.storage_ready === 0) { if (this.now() >= deadline) return finish({ state: "pending", reason: "IMAGE_PERSISTING", retry_without_force_fresh: true }); await sleep(125); continue; }
        if (!image) { const object = await this.bucket.get(frame.image_key); if (object) image = new Uint8Array(await object.arrayBuffer()); }
        trace.source = frame.inline_jpeg ? "d1_frame_cache" : trace.cache_hit ? "process_cache" : "r2"; trace.object_ms += performance.now() - objectStart;
        if (image) {
          const fenceStart = performance.now();
          const current = await this.screenFence(user, device.id, sessionID, frame, streamSnapshot);
          trace.fence_ms += performance.now() - fenceStart; trace.fence_checks++;
          trace.fence_passed = Boolean(current);
          if (current && isFresh(frame)) {
            if (current.frame_id === frame.frame_id) this.cache?.put(device.id, { owner: user.id, session: sessionID, frame: frame.frame_id, key: frame.image_key, bytes: image, expires: frame.expires_at });
            const elapsed = performance.now() - start, stamp = this.now(), count = image.byteLength;
            const recordMetric = async () => { await this.batch([this.stmt("INSERT INTO sb_metrics(id,owner_id,device_id,kind,frame_id,bytes,duration_ms,created_at,detail_json) VALUES(?,?,?,'mcp_image',?,?,?,?,?)", uid(), user.id, device.id, frame.frame_id, count, elapsed, stamp, JSON.stringify(trace))]); };
            if (this.schedule) this.schedule(0, recordMetric); else await recordMetric();
            const finalStart = performance.now();
            const final = this.schedule || await this.screenFence(user, device.id, sessionID, frame, streamSnapshot);
            if (!this.schedule) { trace.fence_ms += performance.now() - finalStart; trace.fence_checks++; }
            trace.fence_passed = Boolean(final);
            if (final && isFresh(frame)) {
              const source=meta?.worker_id===active.live_worker?
                visualPointSource(frame,active.visual_point_scope,meta,this.now()):{reason:"capture_identity_unavailable" as const};
              return finish({state:"available",metadata:{...this.frameMetadata(frame),device_id:device.id,
                capture_lower_server_utc_ms:frame.capture_lower,stale:false,server_tool_ms:elapsed},
                [visualPointEvidence]:source,image:Buffer.from(image).toString("base64")});
            }
          }
          if (this.now() >= deadline) return finish({ state: "unavailable", reason: !isFresh(frame) ? "FRAME_TOO_OLD" : "FRAME_OR_SESSION_CHANGED" });
          continue;
        }
        if (frame.storage_ready === 0 && !force) { if (this.now() >= deadline) return finish({ state: "pending", reason: "IMAGE_PERSISTING", retry_without_force_fresh: true }); await sleep(125); continue; }
      }
      if (!refreshID) {
        const pending = await this.stmt("SELECT id FROM sb_refreshes WHERE device_id=? AND session_id=? AND state IN ('queued','claimed') AND expires_at>? AND created_at>? ORDER BY created_at DESC LIMIT 1", device.id, sessionID, this.now(), this.now() - 1000).first<{ id: string }>();
        if (pending) refreshID = pending.id;
        else {
          refreshID = uid();
          const created = await this.stmt("INSERT INTO sb_refreshes(id,owner_id,device_id,session_id,broadcast_id,state,created_at,expires_at,min_seq,min_capture_mono) SELECT ?,?,?,?,?,'queued',?,?,?,? FROM sb_sessions s JOIN sb_devices d ON d.id=s.device_id WHERE s.id=? AND s.state='active' AND s.capture_state='active' AND d.current_session=s.id AND d.revoked=0 AND d.worker_expires>?", refreshID, user.id, device.id, sessionID, active.live_broadcast, this.now(), this.now() + 10000, frame?.frame_seq ?? 0, frame ? Number(JSON.parse(frame.metadata).capture_mono_ms) : 0, sessionID, this.now()).run();
          if (created.meta.changes !== 1) return finish({ state: "unavailable", reason: "SESSION_STOPPED" });
        }
      }
      if (active.request_state === "failed") return finish({ state: "unavailable", reason: active.request_error ?? "CAPTURE_UNAVAILABLE", refresh_request_id: refreshID });
      if (this.now() >= deadline) return finish({ state: "pending", refresh_request_id: refreshID, retry_without_force_fresh: true });
      await sleep(125);
    } while (true);
  }
  async pruneMetadata(source:"frame"|"observation"|"other"|"maintenance"="other") {
    try{return await runMaintenance(this.db,this.bucket,source==="maintenance"?"legacy":"request",this.now);}catch(error){if(source==="maintenance")throw error;console.warn(JSON.stringify({event:"opportunistic_retention_failed"}));}
  }
  async requestScreen(user: User, deviceID: string, message: unknown) {
    const device = await this.owned(user, deviceID), id = uid(), now = this.now();
    await this.stmt("INSERT INTO sb_manual_requests(id,owner_id,device_id,message,state,created_at,expires_at) VALUES(?,?,?,?,'awaiting_user',?,?)", id, user.id, device.id, text(message, 300), now, now + 120_000).run();
    return { request_id: id, state: "awaiting_user", notification_status: "not_configured", expires_at: iso(now + 120_000) };
  }
  async revoke(user: User, deviceID: string) {
    const result=await requestDeviceErasure(this,user,uuid(deviceID));
    this.cache?.clear(deviceID);
    if(result.session)await this.privatePixels?.clear(user.id,deviceID,result.session);
    return result.result;
  }
  async metricsFor(user: User, deviceID: string) {
    deviceID=uuid(deviceID);
    const cutoff=this.now()-86400_000;
    const authorized="EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=? AND d.owner_id=? AND d.revoked=0)";
    // One read-only transaction: authorization and all projections observe the
    // same device state. Every data query also gates on the current ownership;
    // revoked/foreign devices cannot export historical data. No cached grant.
    const results=await this.db.batch([
      this.stmt("SELECT id FROM sb_devices WHERE id=? AND owner_id=? AND revoked=0",deviceID,user.id),
      this.stmt("SELECT name,tbl_name,sql FROM sqlite_master WHERE type='index' AND name IN ('sb_metrics_created_idx','sb_observations_created_idx') AND "+authorized+" ORDER BY name",deviceID,user.id),
    // Recover the beginning of the latest recorded capture scope without
    // polling or confusing newest120 with complete session history. Owner and
    // device predicates apply to both scope selection and exported rows.
      this.stmt("WITH latest AS (SELECT id AS scope FROM sb_sessions WHERE owner_id=? AND device_id=? AND mode='broadcast' AND "+authorized+" ORDER BY created_at DESC,id DESC LIMIT 1) SELECT l.scope AS selected_session_id,m.id AS metric_id,m.frame_id,m.kind,m.bytes,m.duration_ms,m.decode_ms,m.store_ms,m.created_at,m.detail_json,COUNT(m.id) OVER() AS total_session_records FROM latest l LEFT JOIN sb_metrics m ON json_extract(CASE WHEN json_valid(m.detail_json) THEN m.detail_json ELSE '{}' END,'$.bridge_session_id')=l.scope AND m.owner_id=? AND m.device_id=? AND m.kind IN ('upload','observation','upload_rejected','observation_rejected') AND m.created_at>? ORDER BY m.created_at ASC,m.id ASC LIMIT 256",user.id,deviceID,deviceID,user.id,user.id,deviceID,cutoff),
      this.stmt("SELECT frame_id,kind,bytes,duration_ms,decode_ms,store_ms,created_at,detail_json FROM sb_metrics WHERE owner_id=? AND device_id=? AND created_at>? AND "+authorized+" ORDER BY created_at DESC LIMIT 120",user.id,deviceID,cutoff,deviceID,user.id),
      this.stmt("SELECT id,scenario,created_at,completed_at,first_response_ms,total_ms FROM sb_voice_bench WHERE owner_id=? AND device_id=? AND created_at>? AND total_ms IS NOT NULL AND "+authorized+" ORDER BY created_at DESC LIMIT 10",user.id,deviceID,cutoff,deviceID,user.id),
    ]);
    need(results[0].results.length===1,"NOT_FOUND",404);
    const retentionIndexes=results[1] as D1Result<{name:string;tbl_name:string;sql:string}>;
    const sessionRows=results[2] as D1Result<{selected_session_id:string;metric_id:string;frame_id:string|null;kind:string;bytes:number;duration_ms:number;decode_ms:number|null;store_ms:number|null;created_at:number;detail_json:string;total_session_records:number}>;
    const history=sessionRows.results.filter(row=>row.metric_id!=null).map(({detail_json,total_session_records,selected_session_id,...row})=>{void total_session_records;void selected_session_id;return {...row,detail:JSON.parse(detail_json)};});
    const total=sessionRows.results[0]?.total_session_records??0;
    const rows=results[3] as D1Result<{frame_id:string|null;kind:string;bytes:number;duration_ms:number;decode_ms:number|null;store_ms:number|null;created_at:number;detail_json:string|null}>;
    const summary = (kind: string) => {
      const values = rows.results.filter(row => row.kind === kind).map(row => row.duration_ms).sort((a, b) => a - b);
      return { samples: values.length, p50_ms: values.length ? values[Math.floor((values.length - 1) * .5)] : null, p95_ms: values.length ? values[Math.ceil((values.length - 1) * .95)] : null };
    };
    return { runtime_version: "0.7.7", evidence_type: "actual_cloud_handler_metrics", upload_handler: summary("upload"), mcp_image_handler: summary("mcp_image"), observations: summary("observation"), persistence: summary("r2_persist"), model_inference_and_voice_latency: "not_measured_by_server", read_screen_metrics: "metadata-only screen_read worker logs; read_screen makes no database writes", recent: rows.results.map(({detail_json, ...row}) => ({...row, detail: detail_json ? JSON.parse(detail_json) : null})),
      capture_session_history:{source:"owner_device_scoped_sb_metrics",session_id:sessionRows.results[0]?.selected_session_id??null,order:"created_at_asc_id_asc",limit:256,total_rows:total,returned_rows:history.length,truncated:total>history.length,images_included:false,rows:history},
      retention_index_audit:{source:"live_sqlite_master",expected:["sb_metrics_created_idx","sb_observations_created_idx"],observed:retentionIndexes.results,all_present:retentionIndexes.results.length===2},
      voice_benchmark:{source:"manual_voice_stopwatch",includes_human_marking_error:true,runs:results[4].results}};
  }
  frameMetadata(frame: Pick<Frame,"metadata"|"capture_lower"|"received_at">) {
    const age = frame.capture_lower == null ? null : Math.max(0, this.now() - frame.capture_lower);
    return { ...JSON.parse(frame.metadata), received_at: iso(frame.received_at), age_ms: age, stale: age == null || age >= uploadFreshnessMS, freshness_unknown: age == null };
  }
}
