import {SensitiveInputError} from "./sensitive-input.ts";
import {journalResponse,observeJournalImage} from "./timing-journal.ts";
import {diagnosticsEnabled} from "./build-profile.ts";
import {benchmarkCaseIDs,BENCHMARK_UI_URI,RENDERER_PROBE_URI} from "./benchmark-metadata.ts";
import { InvalidArguments, validateArgumentNames } from "./mcp-arguments.ts";
import {opportunisticRetention} from "./opportunistic-retention.ts";
import {stopOwnedSessions} from "./stop-owned-sessions.ts";
import {requireMcpSigning} from "./signing-policy.ts";
import {runtimeName,runtimeVersion} from "./runtime-identity.ts";
import {mcpToolsForAudience,imageDelivery,searchFocusFormats,liveDisplayFormats,observedWriteNames} from "./mcp-tool-catalog.ts";
import {phoneWorkflowInstructions, afterImageInstruction, interactionPolicyVersion} from "./interaction-guidance.ts";
import {pairedClickShadow,type ShadowProjection} from "./paired-click-shadow.ts";
import {beforeImageObservationDeadline,actionAfterImageAgeLimitMS,clickRelookMaxGapMS,liveFrameAge,liveFrameAgeLimitMS,readRecoveryDefaultMS,readRecoveryMaximumMS,visualReadAgeLimitMS,type ImageObservationDeadline} from "./read-policy.ts";
import { imageHandoff } from "./image-handoff.ts";
import { bounded } from "./http-utils.ts";
import { McpPerformance, compactMcpSummary, type McpPerformanceOptions } from "./mcp-performance.ts";
import { controlGuide, controlWorkflows, type ControlWorkflow } from "./control-guide.ts";
import { BridgeError, OrdinaryReadTiming, hash, integer, record, text, uuid, visualPointEvidence, type BridgeEngine, type ClickAfterImageTiming, type VisualPointSourceEvidence, type User } from "./bridge-engine.ts";
import { LEDControl } from "./led-control.ts";
import {reviewedPressKeyPrefix} from "./reviewed-press.ts";
import { MouseControl, InputAdmissionError, clickAfterImageTiming,livePointClaimHints,POINTER_SCROLL_KIND,SYSTEM_SEARCH_KIND,type ClickAfterReleaseRecovery } from "./mouse-control.ts";
import { DRAG_KIND,relativeDragCorrection } from "./absolute-drag.ts";
import {logPairedClickDiagnostic,pairedClickTiming,type PairedClickTiming} from "./paired-click-timing.ts";
import type {ImageReleaseClockSampler} from "./image-release-clock.ts";
import {background,deferBridgeDiagnostic,workerFetchStartedUTC,workerPlacementObservation} from "./bridge-context.ts";
import { focusedTextKind } from "./spotlight-command.ts";
const appSearchQueryKeyPrefix="app-search-query:";
import {makeLiveImagePreview} from "./live-image-preview.ts";
export type Dependencies = { retention?:boolean;strictSigning?:boolean;toolAudience?:"public"|"development"; engine: () => BridgeEngine; caller: (request: Request) => User; origin: string;
  performance?: McpPerformanceOptions; refreshImageReleaseClock?: () => Promise<boolean>;
  createImageReleaseClockSampler?:()=>ImageReleaseClockSampler;
  imageReleaseLog?: (entry:Record<string,unknown>)=>void;
};
type ImageReleaseGuard=(response:Response)=>Promise<Response>;
type HostReviewDropReason="HOST_REVIEW_PROOF_AGED_BEFORE_BIND"|"HOST_REVIEW_PROOF_NOT_BOUND";
type ImageReleaseOptions={register?:(guard:ImageReleaseGuard)=>void;recover?:(eligible:boolean,afterSerialization?:boolean)=>Promise<Response|null>;withinDeadline?:()=>boolean;clockRetryWithinDeadline?:()=>boolean;clickAfterTiming?:ClickAfterImageTiming;measureRecovery?:boolean;ordinaryReadTiming?:OrdinaryReadTiming;observationDeadline?:ImageObservationDeadline;actionAfterImage?:boolean;visualRead?:true;imageMime?:"image/jpeg"|"image/png";recoverUnprovenClock?:true;recoveredCandidate?:true;hostReviewDropReason?:HostReviewDropReason;onImageReleased?:()=>void;onImageDropped?:()=>void};
type ReleaseFailure="frame_expired"|"clock_unavailable"|"deadline_expired"|"clock_reversed"|"freshness_unproven";
type ReleaseTiming={phase:"before_serialization"|"after_serialization_clock_check";preparedAt:number;checkedAt:number|null;retryRequested:boolean};
type SearchFocusFormat=typeof searchFocusFormats[number];
const isSearchFocusFormat=(value:unknown):value is SearchFocusFormat=>searchFocusFormats.some(format=>format===value);
type LiveDisplayFormat=typeof liveDisplayFormats[number];
const isLiveDisplayFormat=(value:unknown):value is LiveDisplayFormat=>liveDisplayFormats.some(format=>format===value);
const commandImageTools=new Set([...observedWriteNames,"click_at","type_text_in_field",
  "open_system_search","drag_at","get_mouse_result"]);
export async function handleMcp(request: Request, dependencies: Dependencies) {
  const handlerStartedUTC = Date.now();
  const trace = new McpPerformance(dependencies.performance);
  const measured = { ...dependencies, engine: () => trace.sync("engine", () => trace.engine(dependencies.engine())), caller: (value: Request) => trace.sync("auth", () => dependencies.caller(value)) };
  let releaseImage: ImageReleaseGuard|undefined;
  try {
    const response = await handleMcpRequest(request, measured, trace, handlerStartedUTC, check=>{ releaseImage=check; });
    const ready=Date.now(),finished=trace.finish(response)!;
    const released=releaseImage?await releaseImage(finished):finished;
    try {journalResponse(()=>dependencies.engine().db,trace,handlerStartedUTC,ready,Date.now(),released);}catch{}
    return released;
  }
  catch (error) { trace.finish(); throw error; }
}
async function handleMcpRequest(request: Request, dependencies: Dependencies, trace: McpPerformance, handlerStartedUTC: number,
  guardRelease:(check:ImageReleaseGuard)=>void) {
  if(!diagnosticsEnabled&&dependencies.toolAudience==="development")return new Response("Not found",{status:404});
  const tools=mcpToolsForAudience(dependencies.toolAudience);
  const json = (value: unknown, status = 200) => trace.json(value, status);
  if (request.method !== "POST") return new Response("Use POST", { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "JSON_REQUIRED" }, 415);
  let authenticatedUser:User;
  try {authenticatedUser=dependencies.caller(request);} catch {return json({jsonrpc:"2.0",id:null,error:{code:-32001,message:"Authentication required"}},401);}
  let body: Record<string, unknown>;
  try { body = await trace.measure("parse", async () => record(JSON.parse(new TextDecoder().decode(await bounded(request, 65_536))))); }
  catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON-RPC body" } }, 400); }
  const id = body.id;
  if (!Object.hasOwn(body, "id")) return new Response(null, { status: 202 });
  if (!(typeof id === "string" || (typeof id === "number" && Number.isFinite(id))) || body.jsonrpc !== "2.0") return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } }, 400);
  const info = { name: runtimeName, version: runtimeVersion };
  const requestParams = body.params && typeof body.params === "object" && !Array.isArray(body.params) ? body.params as Record<string, unknown> : {};
  const requestMeta = requestParams._meta && typeof requestParams._meta === "object" && !Array.isArray(requestParams._meta) ? requestParams._meta as Record<string, unknown> : {};
  const modern = body.method === "server/discover" || request.headers.get("mcp-protocol-version") === "2026-07-28" || requestMeta["io.modelcontextprotocol/protocolVersion"] === "2026-07-28";
  const declaredVersion=requestMeta["io.modelcontextprotocol/protocolVersion"];
  const transportVersion=request.headers.get("mcp-protocol-version");
  trace.identify(body.method, requestParams.name, tools.map(tool => tool.name));
  const cacheable = ["server/discover", "tools/list", "resources/list", "resources/read"].includes(String(body.method));
  const success = (requestID: string | number, result: unknown) => {
    const original = record(result); trace.endTool(original.isError === true);
    const value = { ...original, _meta: { ...record(original._meta ?? {}), sayso_performance: trace.snapshot() } };
    // These are wire fields: SDK examples omit them because the SDK adds them.
    // A hand-written 2026 transport must stamp every completed result itself.
    return json({ jsonrpc: "2.0", id: requestID, result: modern ? {
      ...value, resultType: original.resultType==="input_required"?"input_required":"complete",
      _meta: { ...record(value._meta ?? {}), "io.modelcontextprotocol/serverInfo": info },
      ...(cacheable ? { ttlMs: 0, cacheScope: "private" } : {}),
    } : value });
  };
  const toolResult = (raw: unknown, images: Record<string, unknown>[] = [], meta: Record<string, unknown> = {}, isError = false) => {
    const fields = record(raw), projected = fields;
    const summary:Record<string,unknown> = { ...projected, ...relativeDragCorrection(projected), mcp_request_id: trace.requestID };
    // The native connector can omit result._meta. Mirror the bounded numeric
    // timing projection in structuredContent. This measures the handler before
    // result serialization. Keep click timing out of the compact text block.
    const clickAt=requestParams.name==="click_at";
    const clickReadback=requestParams.name==="get_mouse_result"&&fields.kind==="pointer.click"&&images.length===1;
    const visualClickSource=requestParams.name==="read_screen"&&images.length===1;
    const focusedAfterImage=fields.kind===focusedTextKind&&images.length===1&&
      (requestParams.name==="type_text_in_field"||requestParams.name==="get_mouse_result");
    const tool=String(requestParams.name);
    const focusPNG=images.length===1&&images[0].mimeType==="image/png"&&
      summary.kind===SYSTEM_SEARCH_KIND&&summary.state==="board_acked"&&summary.focus_image!==undefined;
    const actionImage=images.length===1&&(images[0].mimeType==="image/jpeg"||focusPNG)?(commandImageTools.has(tool)?"command":undefined):undefined;
    if(clickAt || requestParams.name==="read_screen" || requestParams.name==="get_profile"){
      const snapshot=trace.snapshot();
      const prior=summary.trace && typeof summary.trace==="object"&&!Array.isArray(summary.trace)?summary.trace as Record<string,unknown>:{};
      const enqueue=snapshot.metrics.move_enqueue;
      const read=requestParams.name==="read_screen"&&record(requestParams.arguments??{}).include_read_timing===true;
      const authorizedRead=read&&meta.sayso_trace!==undefined;
      const workerStarted=clickAt||authorizedRead?workerFetchStartedUTC():undefined;
      const screenTrace=read?record(meta.sayso_trace??{}):{},frame=record(summary.metadata??{});
      const workerPlacement=authorizedRead?workerPlacementObservation():undefined;
      summary.trace={...prior,native_transport:{request_id:trace.requestID,timing_point:"before_tool_result_serialization",
        handler_elapsed_ms_at_result:snapshot.server_elapsed_ms,d1_calls:snapshot.metrics.d1?.calls??0,d1_sum_ms:snapshot.metrics.d1?.sum_ms??0,
        ...(read?{d1_timing:screenTrace.d1_timing??null,
          ...(workerPlacement?{worker_placement:workerPlacement}:{}),
          frame_age_reported_at_server_utc_ms:frame.age_reported_at_server_utc_ms??null,
          image_payload:{image_blocks:images.length,encoded_chars:images.reduce((sum,block)=>sum+(typeof block.data==="string"?block.data.length:0),0)},
          serialization_phase:"before_final_json_encode"}:{}),
        ...(clickAt||authorizedRead?{handler_started_utc_ms:handlerStartedUTC,
          ...(workerStarted!==undefined&&Number.isFinite(workerStarted)&&workerStarted<=handlerStartedUTC
            ?{worker_fetch_started_utc_ms:workerStarted,worker_fetch_to_handler_ms:handlerStartedUTC-workerStarted}:{})}:{}),
        ...(clickAt&&enqueue?{move_enqueue_ms:enqueue.sum_ms}:{})}};
    }
    if(commandImageTools.has(tool)||tool==="read_screen"){
      const handoff=imageHandoff(summary,images);
      if(handoff){
        summary.image_handoff=handoff;
        summary.interaction_policy_version=interactionPolicyVersion;
        if(handoff.source_after_command_id)summary.after_image_instruction=afterImageInstruction;
      }
      // Reference provenance only: no text, coordinates, tokens or image bytes.
      const args=record(requestParams.arguments??{});
      const source=typeof args.source_frame_id==="string"?args.source_frame_id:null;
      logPairedClickDiagnostic({event:"image_handoff",request_id:trace.requestID,tool,
        source_frame_id:source,returned_frame_id:handoff?.source_frame_id??null,
        command_id:typeof summary.command_id==="string"?summary.command_id:null,
        action_state:summary.state??null,image_prepared:images.length===1,timing_point:"before_serialization",
        handoff_available:!!handoff,interaction_policy_version:interactionPolicyVersion,
        image_mime:images.length===1?images[0].mimeType:null,
        image_width:handoff?.image_width??null,image_height:handoff?.image_height??null,
        displayed_width:handoff?.displayed_width??handoff?.image_width??null,
        displayed_height:handoff?.displayed_height??handoff?.image_height??null});
    }
    // Measure the existing text encoding once. Full response encoding happens
    // later and is reported by the existing request log/Server-Timing header.
    const text=trace.sync("summary_serialize",()=>modern && summary.state!=="repeated" ?
      compactMcpSummary(summary,requestParams.name==="read_screen",clickAt||clickReadback,
        (clickAt||clickReadback)&&images.length===1,visualClickSource,clickReadback,focusedAfterImage,
        undefined,actionImage) : JSON.stringify(summary));
    // Put exact next-action references before potentially large image payloads.
    // Preserve all structured fields and original image bytes for existing clients.
    const orderedSummary=summary.image_handoff?{image_handoff:summary.image_handoff,...summary}:summary;
    return { content: [{ type: "text", text }, ...images], structuredContent: orderedSummary, _meta: meta, isError };
  };
  const inheritTiming=(response:Response,prior:Response)=>{
    for(const header of ["X-SaySo-Request-ID","Server-Timing"]){
      const value=prior.headers.get(header);
      if(value!==null)response.headers.set(header,value);
    }
    return response;
  };
  const logOrdinaryRead=(entry:Record<string,unknown>,timing:OrdinaryReadTiming,preparedAt?:number,checkedAt?:number|null)=>{
    deferBridgeDiagnostic(()=>logPairedClickDiagnostic({...entry,ordinary_read:{
      ...timing.snapshot(),prepared_at_worker_utc_ms:preparedAt??null,release_checked_at_worker_utc_ms:checkedAt??null,
    }},dependencies.imageReleaseLog));
  };
  let releaseClockRechecked=false;
  const liveResult=(summary:Record<string,unknown>,image:unknown,now:()=>number,
    slot:"metadata"|"after_screen"|"image_metadata",
    makeResult:(fields:Record<string,unknown>,images:Record<string,unknown>[])=>unknown=toolResult,
    maximum=liveFrameAgeLimitMS,options:ImageReleaseOptions={}) => {
    const after=slot==="after_screen";
    const strictAgeLimit=after&&options.actionAfterImage?actionAfterImageAgeLimitMS:options.visualRead?visualReadAgeLimitMS:liveFrameAgeLimitMS;
    const observation=after?record(summary.after_screen??{}):summary;
    const metadataKey=slot==="image_metadata"?"image_metadata":"metadata";
    const actualImage=typeof image==="string"&&image.length>0;
    const reuse=requestParams.name==="read_screen"&&summary.state==="unchanged";
    const readArgs=requestParams.name==="read_screen"?record(requestParams.arguments??{}):undefined;
    const ordinaryRead=readArgs!==undefined&&readArgs.after_command_id==null;
    const metadata=record(observation[metadataKey]??{});
    const register=options.register??guardRelease;
    const recover=actualImage&&options.recover?(eligible:boolean,afterSerialization=false)=>{
      const attempt=()=>options.recover!(eligible,afterSerialization);
      return (options.measureRecovery===false?attempt():trace.measure("late_image_release_retry",attempt)).catch(()=>null);
    }:undefined;
    const witness=(imageCount:number,finalAge:number|null,reason:string|null,preparedAt?:number,checkedAt?:number|null)=>{
      observeJournalImage(trace,metadata,imageCount,finalAge);
      const entry={event:"live_image_release",request_id:trace.requestID,age_upper_ms:finalAge,image_count:imageCount,drop_reason:reason,
        ...(options.recoverUnprovenClock&&options.recoveredCandidate?{host_review_release_recovery:true}:{}),
        ...(releaseClockRechecked?{clock_rechecked:true}:{})};
      if(options.ordinaryReadTiming){logOrdinaryRead(entry,options.ordinaryReadTiming,preparedAt,checkedAt);return;}
      const clickTiming=options.clickAfterTiming;
      if(!clickTiming){logPairedClickDiagnostic(entry,dependencies.imageReleaseLog);return;}
      const clockRechecked=releaseClockRechecked;
      deferBridgeDiagnostic(()=>{
        const released=imageCount===1&&finalAge!==null;
        const capture=metadata.capture_lower_server_utc_ms;
        const ageUpper=(at:number|null|undefined)=>at!=null&&typeof capture==="number"&&Number.isFinite(at-capture)&&at>=capture?at-capture:null;
        const preparedAge=ageUpper(preparedAt),checkedAge=ageUpper(checkedAt);
        const click={click_command_id:summary.command_id,selected_frame_id:released?metadata.frame_id:null,
          selected_frame_seq:released?metadata.frame_seq:null,observation_reason:observation.reason??null,
          prepared_at_server_utc_ms:preparedAt??null,release_checked_at_server_utc_ms:checkedAt??null,
          prepare_to_release_check_ms:preparedAt!==undefined&&checkedAt!=null&&checkedAt>=preparedAt?checkedAt-preparedAt:null,
          prepared_headroom_ms:preparedAge===null?null:maximum-preparedAge,
          checked_headroom_ms:checkedAge===null?null:maximum-checkedAge,
          release_age_upper_ms:finalAge,release_headroom_ms:finalAge===null?null:maximum-finalAge,
          clock_rechecked:clockRechecked,lookups:clickTiming.snapshot(released)??null,
          lookup_d1_timing:clickTiming.databaseTiming()??null,receipt_poll_timing:clickTiming.receiptTiming??null};
        logPairedClickDiagnostic({...entry,paired_click:click},dependencies.imageReleaseLog);
      });
    };
    const age=(sampledAt:number)=>metadata.is_repeated===true||observation.state==="repeated"?null:liveFrameAge(sampledAt,metadata.capture_lower_server_utc_ms,maximum,strictAgeLimit);
    const expiredAt=(sampledAt:number)=>{
      if(typeof metadata.capture_lower_server_utc_ms!=="number")return false;
      const candidateAge=sampledAt-metadata.capture_lower_server_utc_ms;
      return candidateAge>=strictAgeLimit||options.visualRead===true&&Number.isFinite(candidateAge)&&candidateAge>maximum;
    };
    const rejected=(failure?:ReleaseFailure,timing?:ReleaseTiming)=>{
      const reason="LIVE_FRAME_FRESHNESS_UNPROVEN_AT_RELEASE";
      const {image_ref: _imageRef,source_view_proof: _sourceViewProof,source_point_proof:_sourcePointProof,...fields}=summary;
      let diagnostic={};
      if(timing&&options.clickAfterTiming&&actualImage&&observation.state==="available"){
        const capture=metadata.capture_lower_server_utc_ms;
        const ageUpper=(at:number|null)=>at!==null&&typeof capture==="number"&&Number.isFinite(at-capture)&&at>=capture?at-capture:null;
        const preparedAge=ageUpper(timing.preparedAt),checkedAge=ageUpper(timing.checkedAt);
        // A retry may have observed changed authority. Keep only timing if we
        // have no authorized replacement, or if clock/deadline proof failed.
        const includeFrames=failure==="frame_expired"&&!timing.retryRequested;
        diagnostic={recovery:{...record(observation.recovery??{}),
          attempt_timing:options.clickAfterTiming.snapshot(includeFrames),
          release_timing:{phase:timing.phase,prepare_to_check_ms:timing.checkedAt===null?null:timing.checkedAt-timing.preparedAt,
            prepared_age_upper_ms:preparedAge,checked_age_upper_ms:checkedAge,
            prepared_headroom_ms:preparedAge===null?null:maximum-preparedAge,checked_headroom_ms:checkedAge===null?null:maximum-checkedAge,
            retry_requested:timing.retryRequested,clock_rechecked:releaseClockRechecked,
            ...(includeFrames?{candidate_frame_id:metadata.frame_id,candidate_frame_seq:metadata.frame_seq,
              prepared_at_server_utc_ms:timing.preparedAt,checked_at_server_utc_ms:timing.checkedAt}:{})}}};
      }
      if(after)return success(id,makeResult({...fields,observation_state:"unavailable",
        after_screen:{...observation,state:"unavailable",reason,metadata:null,image_ref:null,source_view_proof:undefined,
           source_query_proof:undefined,source_field_proof:undefined,source_point_proof:undefined,parked_click:undefined,after_command:null,suggestion_target:null,
          ...(options.actionAfterImage&&failure?{release_failure:failure,...diagnostic}:{})}},[]));
      if(slot==="image_metadata")return success(id,makeResult({...fields,image_state:"stale",image_metadata:undefined,image_reason:reason},[]));
      const readDiagnostic=readArgs?.include_read_timing===true&&failure&&timing?{
        release_failure:failure,release_timing:{phase:timing.phase,clock_rechecked:releaseClockRechecked,
          prepare_to_check_ms:timing.checkedAt!==null&&Number.isFinite(timing.checkedAt)&&timing.checkedAt>=timing.preparedAt?
            timing.checkedAt-timing.preparedAt:null}
      }:{};
      return success(id,makeResult({...fields,state:"unavailable",reason,metadata:undefined,after_command:undefined,...readDiagnostic},[]));
    };
    if(!actualImage&&!reuse){
      witness(0,null,options.hostReviewDropReason??"NO_QUALIFIED_IMAGE");
      options.onImageDropped?.();
      if(observation.state==="available"||summary.image_state==="available")return rejected();
      return success(id,makeResult(summary,[]));
    }
    const preparedAt=now(),preparedAge=age(preparedAt);
    if(preparedAge===null){
      const expired=expiredAt(preparedAt);
      const response=rejected(expired?"frame_expired":"freshness_unproven",{phase:"before_serialization",preparedAt,checkedAt:null,retryRequested:!!recover&&expired});
      if(actualImage&&options.recover){
        register(async response=>{
          const next=await recover?.(expired);
          if(next)return trace.responseTiming(next);
          options.onImageDropped?.();
          witness(0,null,"FRESHNESS_UNPROVEN_BEFORE_SERIALIZATION",preparedAt);
          return trace.responseTiming(response);
        });
      }else{
        options.onImageDropped?.();
        witness(0,null,"FRESHNESS_UNPROVEN_BEFORE_SERIALIZATION",preparedAt);
      }
      return response;
    }
    const updated={...observation,[metadataKey]:{...metadata,age_ms:preparedAge,
      ...(Object.hasOwn(metadata,"age_reported_at_server_utc_ms")?{age_reported_at_server_utc_ms:preparedAt}:{})}};
    const images=actualImage?[{type:"image",mimeType:options.imageMime??"image/jpeg",data:image}]:[];
    const response=success(id,makeResult(after?{...summary,after_screen:updated}:updated,images));
    register(async response=>{
      // Hosted Workers freeze their clock between I/O. Sample after the
      // serialized response and an actual runtime I/O boundary.
      let refresh:ImageReleaseClockSampler|undefined=dependencies.refreshImageReleaseClock;
      try {if(dependencies.createImageReleaseClockSampler)refresh=dependencies.createImageReleaseClockSampler();}
      catch {refresh=async()=>false;}
      const sampleClock=async(recheck:boolean)=>{
        try {
          const sample=()=>refresh!(recheck);
          return options.observationDeadline?await beforeImageObservationDeadline(options.observationDeadline,sample)===true:await sample();
        }catch{return false;}
      };
      let clockCurrent=refresh?await sampleClock(false):true;
      const recheck=!clockCurrent&&!releaseClockRechecked&&options.clockRetryWithinDeadline?.()===true;
      if(recheck){
        releaseClockRechecked=true;
        clockCurrent=await sampleClock(true);
      }
      const releasedAt=clockCurrent?now():null,releasedAge=releasedAt===null?null:age(releasedAt);
      const withinDeadline=(options.withinDeadline?.()??true)&&(!recheck||options.clockRetryWithinDeadline?.()===true);
      if(withinDeadline&&releasedAge!==null&&releasedAge>=preparedAge){
        response.headers.set("X-SaySo-Frame-Age-Ms",String(releasedAge));
        witness(images.length,releasedAge,reuse?"REFERENCE_ONLY":null,preparedAt,releasedAt);
        if(images.length===1&&options.onImageReleased){
          try{options.onImageReleased();}
          catch{ /* Proof retention cannot invalidate an otherwise qualified image. */ }
        }
        return response;
      }
      const expired=releasedAt!==null&&releasedAt>=preparedAt&&expiredAt(releasedAt);
      const clockUnproven=!clockCurrent||releasedAt===null||!Number.isFinite(releasedAt)||releasedAt<preparedAt;
      const canRecover=withinDeadline&&(expired||options.recoverUnprovenClock===true&&clockUnproven);
      const next=await recover?.(canRecover,true);
      if(next)return trace.responseTiming(next);
      options.onImageDropped?.();
      witness(0,null,!withinDeadline?"READ_DEADLINE_EXPIRED":
        !clockCurrent?"RELEASE_CLOCK_UNAVAILABLE":releasedAge===null?"FRESHNESS_UNPROVEN_AT_RELEASE":"RELEASE_CLOCK_REVERSED",preparedAt,releasedAt);
      const failure:ReleaseFailure=!withinDeadline?"deadline_expired":!clockCurrent||ordinaryRead&&releasedAt!==null&&!Number.isFinite(releasedAt)?"clock_unavailable":
        releasedAt!==null&&releasedAt<preparedAt?"clock_reversed":expired?"frame_expired":"freshness_unproven";
      const dropped=rejected(failure,{phase:"after_serialization_clock_check",preparedAt,checkedAt:releasedAt,retryRequested:!!recover&&canRecover});
      return options.recover?trace.responseTiming(dropped):inheritTiming(dropped,response);
    });
    return response;
  };
  const prepareVisualPointRelease=async(service:BridgeEngine,user:User,value:{state:string;image?:unknown;metadata?:Record<string,unknown>;[visualPointEvidence]?:VisualPointSourceEvidence})=>{
    const evidence=value[visualPointEvidence];
    if(!evidence||typeof value.image!=="string"||value.state!=="available")return {fields:{}};
    const source=evidence.source,metadata=value.metadata;
    const frame=metadata?.frame_id,capture=metadata?.capture_lower_server_utc_ms;
    const signing=source&&frame===source.frame&&capture===source.captureLower?
      await service.issueVisualReadPointProof(user,source,value.image).catch(()=>({reason:"signing_error"})):
      {reason:source?"delivery_identity_changed":evidence.reason};
    const proof="proof" in signing&&typeof signing.proof==="string"?signing.proof:undefined;
    const report=(stage:string,reason:string,rowsPruned?:number)=>logPairedClickDiagnostic({
      event:"visual_point_proof",request_id:trace.requestID,stage,reason,
      source_frame_id:typeof frame==="string"?frame:null,
      source_age_ms:typeof capture==="number"&&Number.isFinite(capture)?service.now()-capture:null,
      ...(rowsPruned===undefined?{}:{rows_pruned:rowsPruned}),
    });
    report("prepare",signing.reason);
    return {
      fields:proof?{source_point_proof:proof}:{},
      onImageReleased:()=>{
        report("egress",proof?"released_with_proof":"released_without_proof");
        if(proof)background(service.rememberVisualReadPointProof(user,proof)
          .then(result=>report("ledger",result.reason,result.rows_pruned))
          .catch(()=>report("ledger","database_error")));
      },
      onImageDropped:()=>report("egress","not_released"),
    };
  };
  const releaseObservedAction=async(summary:Record<string,unknown>,image:unknown,recovery:ClickAfterReleaseRecovery|undefined,
    render:(fields:Record<string,unknown>,pixels:unknown,options:ImageReleaseOptions)=>Response|Promise<Response>)=>{
    const retry=recovery?.retry;
    return render(summary,image,{withinDeadline:recovery?.enforceDeadline?recovery.withinDeadline:undefined,
      observationDeadline:recovery?.observationDeadline,clockRetryWithinDeadline:recovery?.withinDeadline,recover:retry&&recovery?async(eligible,afterSerialization)=>{
        if(!eligible)return null;
        const next=await retry(afterSerialization);
        if(!next)return null;
        const {image,...observation}=next;
        let release:ImageReleaseGuard|undefined;
        const response=await render({...summary,...observation},image,{withinDeadline:recovery.withinDeadline,
          observationDeadline:recovery.observationDeadline,recoveredCandidate:true,register:guard=>{release=guard;}});
        return release?await release(response):response;
      }:undefined});
  };
  const prepareAfterPointRelease=async(service:BridgeEngine,user:User,fields:Record<string,unknown>,pixels:unknown):Promise<{fields:Record<string,unknown>;onImageReleased?:()=>void;onImageDropped?:()=>void}>=>{
    const after=record(fields.after_screen??{});
    const eligible=fields.state==="board_acked"&&typeof pixels==="string"&&
      imageHandoff(fields,[{type:"image",data:pixels,mimeType:"image/jpeg"}]);
    if(!eligible)return {fields};
    const point=await prepareVisualPointRelease(service,user,{
      state:String(after.state),image:pixels,metadata:record(after.metadata??{}),
      [visualPointEvidence]:(after as Record<PropertyKey,unknown>)[visualPointEvidence] as VisualPointSourceEvidence|undefined,
    });
    return {...point,fields:typeof point.fields.source_point_proof==="string"?
      {...fields,after_screen:{...after,...point.fields}}:fields};
  };
  const releaseDirectObservation=(service:BridgeEngine,summary:Record<string,unknown>,image:unknown,recovery?:ClickAfterReleaseRecovery,
    user?:User,originalRelook=false,searchFocus?:SearchFocusFormat)=>{
    const actionAfterImage=summary.kind===focusedTextKind||summary.kind===POINTER_SCROLL_KIND||summary.kind===DRAG_KIND||
      summary.kind===SYSTEM_SEARCH_KIND||summary.kind==="pointer.click";
    return releaseObservedAction(summary,image,recovery,async(fields,pixels,options)=>{
      const point:Awaited<ReturnType<typeof prepareAfterPointRelease>>=user?await prepareAfterPointRelease(service,user,fields,pixels):{fields};
      const onImageReleased=()=>{point.onImageReleased?.();};
      const outcome=point.fields,after=record(outcome.after_screen??{});
      const metadata=record(after.metadata??{}),order=record(after.after_command??{});
      const focus=searchFocus&&fields.kind===SYSTEM_SEARCH_KIND&&fields.state==="board_acked"&&
        after.state==="available"&&typeof pixels==="string"&&pixels.length>0&&
        order.command_id===fields.command_id&&order.command_state==="board_acked"&&
        order.relation==="capture_after_phone_board_ack"&&order.scope_matches_at_snapshot===true&&
        metadata.capture_clock_verified===true;
      // The proof above signs the original JPEG. The focus rendition changes
      // only the content sent to the visual model.
      const preview=focus&&searchFocus==="compact_png"?
        trace.sync("spotlight_focus_encode",()=>makeLiveImagePreview(String(pixels),"png")):null;
      const imageMime=preview?.mimeType??"image/jpeg";
      const render=focus?(visible:Record<string,unknown>,images:Record<string,unknown>[])=>toolResult(images.length===1?
        {...visible,focus_image:{mime_type:imageMime,width:preview?.width??metadata.width,
          height:preview?.height??metadata.height,purpose:"spotlight_focus",coordinate_space:"normalized_full_frame"}}:visible,images):undefined;
      return liveResult({...outcome,runtime_version:info.version},preview?.data??pixels,service.now,"after_screen",render,
        actionAfterImage?actionAfterImageAgeLimitMS:liveFrameAgeLimitMS,{...options,actionAfterImage,imageMime,onImageReleased,
          onImageDropped:point.onImageDropped});
    });
  };
  const capabilities=dependencies.toolAudience!=="development"?{tools:{}}:{tools:{},resources:{},extensions:{"io.modelcontextprotocol/ui":{mimeTypes:["text/html;profile=mcp-app"]}}};
  if (body.method === "server/discover") return success(id, { supportedVersions: ["2026-07-28", "2025-11-25"], capabilities });
  if (body.method === "initialize") {
    const requested = (body.params as Record<string, unknown> | undefined)?.protocolVersion;
    return success(id, { protocolVersion: ["2026-07-28", "2025-11-25", "2025-06-18"].includes(String(requested)) ? requested : "2026-07-28", capabilities, serverInfo: info, instructions: imageDelivery.trim() + " " + phoneWorkflowInstructions });
  }
  if (body.method === "ping") return success(id, {});
  if(body.method==="resources/list"||body.method==="resources/read"){
    if(!diagnosticsEnabled||dependencies.toolAudience!=="development")return body.method==="resources/list"?success(id,{resources:[]}):json({jsonrpc:"2.0",id,error:{code:-32602,message:"Unknown resource"}});
    try{
      // Identity was checked before parsing the envelope.
      if(body.method==="resources/list")return success(id,{resources:[{uri:BENCHMARK_UI_URI,name:"sayso_synthetic_benchmark",mimeType:"text/html;profile=mcp-app",description:"Synthetic-only image prefetch benchmark; no phone or microphone."},{uri:RENDERER_PROBE_URI,name:"sayso_renderer_probe",mimeType:"text/html;profile=mcp-app",description:"Minimal text-only renderer probe; no images or device access."}]});
      const uri=record(body.params).uri, html=(await import("./benchmark-resources.ts")).benchmarkResource(uri), known=html!==null;
      // Deliberately omit the requested URI, caller, request body and headers.
      // HTTP 200 may contain a JSON-RPC error, so record the response kind.
      console.info(JSON.stringify({event:"benchmark_resource",runtime:info.version,resource:uri===BENCHMARK_UI_URI?"image_benchmark":uri===RENDERER_PROBE_URI?"renderer_probe":"unknown",uri_type:typeof uri,known_uri:known,response_kind:known?"html_contents":"unknown_resource",mime_type:known?"text/html;profile=mcp-app":null,html_bytes:html?new TextEncoder().encode(html).byteLength:0}));
      if(!known)return json({jsonrpc:"2.0",id,error:{code:-32602,message:"Unknown resource"}});
      return success(id,{contents:[{uri,mimeType:"text/html;profile=mcp-app",text:html,_meta:{ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[]}}}}]});
    }catch{return json({jsonrpc:"2.0",id,error:{code:-32001,message:"Authenticated resource access required"}},401);}
  }
  if (body.method === "tools/list") {
    const visible = tools;
    console.info(JSON.stringify({ event: "mcp_catalogue", runtime: info.version, tools: visible.map(tool => tool.name) }));
    return success(id, { tools: visible });
  }
  if (body.method !== "tools/call") return json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  try {
    const params = record(body.params), name = params.name, args = record(params.arguments ?? {}), tool = tools.find(item => item.name === name);
    if (!tool) throw new BridgeError("UNKNOWN_TOOL", 422);
    const hasContinuation=Object.hasOwn(params,"requestState")||Object.hasOwn(params,"inputResponses");
    if(hasContinuation)
      throw new BridgeError("UNSUPPORTED_TOOL_CONTINUATION",422);
    const schema = tool.inputSchema;
    validateArgumentNames(args,schema);
    if(typeof args.idempotency_key==="string"&&
       [appSearchQueryKeyPrefix,reviewedPressKeyPrefix].some(prefix=>(args.idempotency_key as string).startsWith(prefix)))
      throw new BridgeError("RESERVED_IDEMPOTENCY_KEY",422);
    const user = authenticatedUser;
    if(name==="get_control_guide"){
      if(!controlWorkflows.includes(args.workflow as ControlWorkflow))throw new BridgeError("INVALID_ARGUMENTS",422);
      return success(id,toolResult(controlGuide(args.workflow as ControlWorkflow)));
    }
    if(name==="open_benchmark_renderer_probe")return success(id,{content:[{type:"text",text:"Renderer-only diagnostic. No image or model feedback is produced. Only the actual UI status can prove that rendering and the host handshake succeeded."}],structuredContent:{state:"renderer_probe",requires_host_render_verification:true},isError:false});
    if(diagnosticsEnabled&&name==="open_screen_benchmark"){
      const {benchmarkCase}=await import("./benchmark-frame.ts");
      const caseID=benchmarkCase(args.case_id);
      if(args.preview!=null&&typeof args.preview!=="boolean")throw new BridgeError("INVALID_ARGUMENTS",422);
      const summary={state:"synthetic_widget",source:"synthetic_fixture",simulated:true,case_id:caseID,width:args.preview===true?240:480,height:args.preview===true?427:854,preview:args.preview===true,requires_host_image_context_verification:true};
      return success(id,{content:[{type:"text",text:"Synthetic benchmark widget. No phone is connected. Image context and model latency must be verified in the real host."}],structuredContent:summary,isError:false});
    }
    if(diagnosticsEnabled&&(name==="read_benchmark_frame"||name==="read_benchmark_pixels"||name==="read_benchmark_jpeg")){
      const {benchmarkCarrier,benchmarkCase,benchmarkFrame,benchmarkJpegFrame}=await import("./benchmark-frame.ts");
      const started=performance.now();
      const {frame,layout,match}=name==="read_benchmark_frame"?benchmarkCarrier(args):
        {frame:name==="read_benchmark_jpeg"?benchmarkJpegFrame(args.case_id):benchmarkFrame(args.case_id),
          layout:"content_only",match:false};
      const claimed=requestMeta["io.modelcontextprotocol/clientCapabilities"];
      const clientCaps=claimed&&typeof claimed==="object"&&!Array.isArray(claimed)?claimed as Record<string,unknown>:null;
      // Fixed booleans only: do not log client identity, arbitrary keys, headers
      // or the capability payload. Absence is not permission to call sampling.
      const capabilitySummary={capability_envelope_present:clientCaps!==null,sampling_declared:clientCaps?.sampling!==undefined};
      console.info(JSON.stringify({event:"benchmark_frame",runtime:info.version,tool:name,response_layout:layout,image_mime_type:frame.content[0].mimeType??null,image_width:frame.structuredContent.width,image_height:frame.structuredContent.height,preview:frame.structuredContent.preview,case_id:frame.structuredContent.case_id,simulated:true,match_payload_size:match,...capabilitySummary,server_tool_ms:performance.now()-started,image_base64_bytes:frame.content[0].data?.length??0}));
      return success(id,layout==="mixed"?frame:{content:frame.content,isError:false});
    }
    const service = dependencies.engine();
    if(dependencies.retention!==false)await opportunisticRetention(service);
    if(dependencies.strictSigning)requireMcpSigning(String(name),service.releasedFieldViewProofAvailable);
    const display=async (format:LiveDisplayFormat,maximumWait:number)=>{
      const wait=integer(args.wait_for_new_ms??1500,0,maximumWait);
      const maximum=integer(args.max_age_ms??visualReadAgeLimitMS,100,visualReadAgeLimitMS);
      const options={device_id:args.device_id,wait_for_new_ms:wait,max_age_ms:maximum,allow_repeated:false};
      const {result:original,retry,withinDeadline,reseal}=await service.readScreenWithReleaseRetry(user,options,trace.requestID);
      const render=(value:typeof original,release:ImageReleaseOptions):Response=>{
        const image=value.state==="available"&&typeof value.image==="string"?value.image:undefined;
        const capture=value.metadata;
        const rendition=!image?undefined:format==="original_jpeg"?
          {mimeType:"image/jpeg" as const,data:image,width:Number(capture?.width),height:Number(capture?.height)}:
          trace.sync("live_display_encode",()=>makeLiveImagePreview(image,format==="compact_png"?"png":"jpeg"));
        if(rendition===null){
          logPairedClickDiagnostic({event:"live_image_release",request_id:trace.requestID,image_count:0,age_upper_ms:null,
            drop_reason:"DISPLAY_IMAGE_ENCODING_FAILED",image_format:format},dependencies.imageReleaseLog);
          return success(id,toolResult({state:"unavailable",reason:"DISPLAY_IMAGE_ENCODING_FAILED",runtime_version:info.version}));
        }
        const out={state:value.state,reason:value.reason,metadata:capture};
        return liveResult(out,rendition?.data,service.now,"metadata",(fields,images)=>{
          const delivered=images.length===1&&rendition;
          const summary={state:fields.state,runtime_version:info.version,mcp_request_id:trace.requestID,
            ...(delivered?{image:{mime_type:rendition.mimeType,width:rendition.width,height:rendition.height,
              format,age_ms:record(fields.metadata).age_ms,view_only:true}}:{reason:fields.reason})};
          return {content:[...images,{type:"text",text:JSON.stringify(summary)}],structuredContent:summary,isError:false};
        },maximum,{...release,visualRead:true,imageMime:rendition?.mimeType,onImageReleased:rendition?()=>{
          logPairedClickDiagnostic({event:"live_display_rendition",request_id:trace.requestID,format,
            source_frame_id:capture?.frame_id,mime:rendition.mimeType,width:rendition.width,height:rendition.height,
            encoded_chars:rendition.data.length},dependencies.imageReleaseLog);
        }:undefined});
      };
      const recoverReplacement=(attempt:typeof retry,requireExpiry=false):ImageReleaseOptions["recover"]=>attempt?async expired=>{
        if(requireExpiry&&!expired)return null;
        const next=await attempt();
        if(!next)return null;
        let imageRelease:ImageReleaseGuard|undefined;
        const response=render(next,{withinDeadline,recover:recoverReplacement(reseal?.(next).retry,true),
          measureRecovery:false,register:guard=>{imageRelease=guard;}});
        return imageRelease?await imageRelease(response):response;
      }:undefined;
      const clockRetryWithinDeadline=retry&&dependencies.createImageReleaseClockSampler?withinDeadline:undefined;
      return render(original,{clockRetryWithinDeadline,recover:recoverReplacement(retry)});
    };
    let result: unknown;
    switch (name) {
      case "get_mouse_state": result = await new MouseControl(service).status(user,args); break;
      case "open_system_search": {
        const {image_format:format,...input}=args;
        if(format!==undefined&&!isSearchFocusFormat(format))throw new BridgeError("INVALID_ARGUMENTS",422);
        let recovery:ClickAfterReleaseRecovery|undefined;
        const {image,...summary}=await new MouseControl(service).enqueueObserved(user,SYSTEM_SEARCH_KIND,
          {...input,settle_ms:input.settle_ms??300},trace.requestID,{signal:request.signal,registerRelease:prepared=>{recovery=prepared;}});
        const focusFormat=format??"original_jpeg";
        return releaseDirectObservation(service,summary,image,recovery,user,false,focusFormat);
      }
      case "move_mouse_to":
      case "move_mouse":
      case "click_mouse": {
        const kinds:Record<string,string>={move_mouse_to:"pointer.move_absolute",move_mouse:"pointer.move_relative",click_mouse:"pointer.click"};
        const value=await new MouseControl(service).enqueueObserved(user,kinds[String(name)],args,trace.requestID),{image,...summary}=value;
        return releaseDirectObservation(service,summary,image,undefined,user);
      }
      case "scroll_mouse": {
        let recovery:ClickAfterReleaseRecovery|undefined;
        const {image,...summary}=await new MouseControl(service).enqueueObserved(user,POINTER_SCROLL_KIND,args,trace.requestID,
          {signal:request.signal,registerRelease:prepared=>{recovery=prepared;}});
        return releaseDirectObservation(service,summary,image,recovery,user);
      }
      case "drag_at": {
        let recovery:ClickAfterReleaseRecovery|undefined;
        const {image,...summary}=await new MouseControl(service).enqueueDragObserved(user,args,trace.requestID,
          {signal:request.signal,registerRelease:prepared=>{recovery=prepared;}});
        return releaseDirectObservation(service,summary,image,recovery,user);
      }
      case "click_at": {
        let releaseRecovery:ClickAfterReleaseRecovery|undefined;
        const mouse=new MouseControl(service,{claimHints:livePointClaimHints});
        const value=await mouse.clickAt(user,args,trace.requestID,trace,prepared=>{releaseRecovery=prepared;},request.signal);
        const {image,[clickAfterImageTiming]:clickAfterTiming,[pairedClickTiming]:phaseTiming,[pairedClickShadow]:shadowProjection,...summary}=value as typeof value & {
          [clickAfterImageTiming]?:ClickAfterImageTiming;[pairedClickTiming]?:PairedClickTiming;[pairedClickShadow]?:ShadowProjection};
        const makeClickResult=phaseTiming||shadowProjection?(fields:Record<string,unknown>,images:Record<string,unknown>[])=>{
          const after=record(fields.after_screen),release=record(record(after.recovery??{}).release_timing??{});
          // A failed release retry may have observed changed authority.
          const stillQualified=images.length>0||after.reason==="NO_FRESH_FRAME"||after.reason==="WAITING_POST_COMMAND_FRAME"||
            after.release_failure==="frame_expired"&&release.retry_requested===false;
          let shadow:Record<string,number>|undefined;
          try{if(images.length>0)shadow=shadowProjection?.(user.id,fields);}catch{}
          return toolResult({...fields,trace:{...record(fields.trace??{}),
            ...(stillQualified&&phaseTiming?{paired_click_timing:phaseTiming}:{}),...(shadow?{paired_click_shadow:shadow}:{})}},images);
        }:undefined;
        const render=async(fields:Record<string,unknown>,pixels:unknown,options:ImageReleaseOptions)=>{
          const reviewed={fields};
          const point=await prepareAfterPointRelease(service,user,reviewed.fields,pixels);
          const onImageReleased=()=>{point.onImageReleased?.();};
          return liveResult({...point.fields,runtime_version:info.version},pixels,service.now,"after_screen",makeClickResult,
            actionAfterImageAgeLimitMS,{...options,clickAfterTiming,actionAfterImage:true,onImageReleased,
              onImageDropped:point.onImageDropped});
        };
        return releaseObservedAction(summary,image,releaseRecovery,render);
      }
      case "get_mouse_result": {
        const mouse=new MouseControl(service);
        if(args.include_after_screen!==undefined&&typeof args.include_after_screen!=="boolean")throw new BridgeError("INVALID_ARGUMENTS",422);
        const format=args.image_format;
        if(format!==undefined&&(!isSearchFocusFormat(format)||args.include_after_screen!==true))throw new BridgeError("INVALID_ARGUMENTS",422);
        const afterCommandMinGapMS=args.after_command_min_gap_ms===undefined?undefined:integer(args.after_command_min_gap_ms,0,clickRelookMaxGapMS);
        if(afterCommandMinGapMS!==undefined&&args.include_after_screen!==true)throw new BridgeError("INVALID_ARGUMENTS",422);
        if(args.click_at_idempotency_key!==undefined||args.device_id!==undefined){
          if(args.command_id!==undefined||args.include_after_screen===true||
             args.click_at_idempotency_key===undefined||args.device_id===undefined)throw new BridgeError("INVALID_ARGUMENTS",422);
          result=await mouse.getClickAtByKey(user,args.device_id,args.click_at_idempotency_key);break;
        }
        if(args.command_id===undefined)throw new BridgeError("INVALID_ARGUMENTS",422);
        const keyPrefix="click-at-key:";
        if(typeof args.command_id==="string"&&args.command_id.startsWith(keyPrefix)){
          const selector=args.command_id.slice(keyPrefix.length);
          if(args.include_after_screen===true||selector[36]!==":"||selector.length<38||selector.length>157)
            throw new BridgeError("INVALID_ARGUMENTS",422);
          result=await mouse.getClickAtByKey(user,selector.slice(0,36),selector.slice(37));break;
        }
        const idValue=uuid(args.command_id);
        if(args.include_after_screen!==true){result=await mouse.get(user,idValue,true);break;}
        let recovery:ClickAfterReleaseRecovery|undefined;
        const {image,...summary}=await mouse.getSpotlightObserved(user,idValue,trace.requestID,
          {signal:request.signal,afterCommandMinGapMS,searchFocusOnly:format!==undefined,registerRelease:prepared=>{recovery=prepared;}});
        return releaseDirectObservation(service,summary,image,recovery,user,true,format);
      }
      case "type_text_in_field": {
        if(args.verify_layout!==undefined||args.probe_keyboard!==undefined)
          throw new BridgeError("CURRENT_ACTION_PROTOCOL_REQUIRED",422);
        const input=args.clear_before_input===undefined?{...args,clear_before_input:true}:args;
        let recovery:ClickAfterReleaseRecovery|undefined;
        const direct=await new MouseControl(service).enqueueAuthorizedFieldObserved(user,input,trace.requestID,
          {signal:request.signal,registerRelease:value=>{recovery=value;}});
        if(!direct)throw new BridgeError("CURRENT_ACTION_PROTOCOL_REQUIRED",409);
        const {image,...summary}=direct;
        return releaseDirectObservation(service,summary,image,recovery,user);
      }
      case "stop_mouse": result = await new MouseControl(service).stop(user,args); break;

      case "read_screen_live": {
        const format=args.image_format??"compact_png";
        if(!isLiveDisplayFormat(format))throw new BridgeError("INVALID_ARGUMENTS",422);
        return display(format,5000);
      }
      case "read_screen": {
        if(Object.hasOwn(args,"include_read_timing")&&typeof args.include_read_timing!=="boolean")throw new BridgeError("INVALID_ARGUMENTS",422);
        const ordinaryReadTiming=args.include_read_timing===true&&args.after_command_id==null&&
          args.if_unchanged_since==null?new OrdinaryReadTiming():undefined;
        const {result:original,retry,withinDeadline,reseal}=await service.readScreenWithReleaseRetry(user,{...args,allow_repeated:false},trace.requestID,ordinaryReadTiming)
          .catch(error=>{
            if(ordinaryReadTiming){
              ordinaryReadTiming.redact();
              logOrdinaryRead({event:"live_image_release",request_id:trace.requestID,image_count:0,age_upper_ms:null,drop_reason:"READ_ERROR"},ordinaryReadTiming);
            }
            throw error;
          });
        const render=async(value:typeof original,options:ImageReleaseOptions)=>{
          const {image,trace:screenTrace,snapshot,[visualPointEvidence]:_pointEvidence,...summary}=value;
          const point=await prepareVisualPointRelease(service,user,value);
          Object.assign(summary,point.fields);
          if(args.include_read_timing!==true&&summary.metadata){
            const {age_reported_at_server_utc_ms,age_timing_point,...ordinaryMetadata}=summary.metadata;
            void age_reported_at_server_utc_ms;void age_timing_point;summary.metadata=ordinaryMetadata;
          }
          const lookup=Number(screenTrace?.lookup_ms),calls=Math.max(1,Number(screenTrace?.lookups)||1);
          // These disjoint lookup intervals finish before the reported image-age
          // point. A lower bound avoids counting them twice in a client RTT bound.
          const preAge=Number.isFinite(lookup)&&lookup>=0?Math.max(0,Math.floor(lookup)-2*calls):0;
          return liveResult(summary,image,service.now,"metadata",(fields,imageBlocks)=>{
            // This describes MCP delivery, before the host consumes the image.
            const delivered=imageBlocks.length>0,expired=fields.reason==="LIVE_FRAME_FRESHNESS_UNPROVEN_AT_RELEASE";
            const deliveryReport={stage:"server_result",image_blocks:imageBlocks.length,mime_types:imageBlocks.map(block=>block.mimeType),
              encoded_chars:delivered&&typeof image==="string"?image.length:0,mode:delivered?"image_content":fields.state==="unchanged"?"reuse_image_ref":"no_image",render_required:delivered};
            // A rejected candidate can be followed by a scope/revocation
            // denial. Retain timing, not its frame identity or progress IDs.
            const reportedTrace=expired?{...screenTrace,frame_id:null,frame_seq:null,source_seq:null,capture_lower_ms:null,
              clock_probe_id:null,frame_progress:undefined,termination:"expired_at_release",miss:"frame_expired_at_release"}:screenTrace;
            return toolResult({...fields,runtime_version:info.version,image_blocks:imageBlocks.length,pre_age_server_ms_lower:preAge,pixel_source:screenTrace?.pixel_source??null,private_pixel_probe_ms:Math.round(Number(screenTrace?.private_pixel_probe_ms??0)*100)/100,d1_jpeg_chars:screenTrace?.d1_inline_jpeg_chars??0,recovery:{lookups:screenTrace?.lookups??0,retry_count:screenTrace?.retry_count??0,retry_trigger:screenTrace?.retry_trigger??null,failure:reportedTrace?.miss??null,retry_wait_ms:screenTrace?.retry_wait_ms??0,budget_exhausted:screenTrace?.retry_budget_exhausted??false,timeout_ms:screenTrace?.wait_for_new_ms??0,wait_elapsed_ms:Math.round(Number(screenTrace?.retry_elapsed_ms??0)*100)/100,termination:reportedTrace?.termination??null,...(reportedTrace?.frame_progress?{frame_progress:reportedTrace.frame_progress}:{})}},imageBlocks,{sayso_trace:reportedTrace,frame_metadata:expired?undefined:snapshot,image_delivery:deliveryReport});
          },Number(args.max_age_ms??visualReadAgeLimitMS),{...options,visualRead:true,ordinaryReadTiming,
            onImageReleased:point.onImageReleased,onImageDropped:point.onImageDropped});
        };
        // The production sampler retains one bounded recheck on this exact
        // serialized JPEG. A zero-wait request has no recovery deadline.
        const clockRetryWithinDeadline=retry&&args.after_command_id==null&&dependencies.createImageReleaseClockSampler?
          withinDeadline:undefined;
        const recoverReplacement=(attempt:typeof retry,requireExpiry=false):ImageReleaseOptions["recover"]=>attempt?async expired=>{
          if(requireExpiry&&!expired)return null;
          const next=await attempt().catch(error=>{ordinaryReadTiming?.redact();throw error;});
          if(!next)return null;
          let release:ImageReleaseGuard|undefined;
          const response=await render(next,{withinDeadline,recover:recoverReplacement(reseal?.(next).retry,true),measureRecovery:false,register:guard=>{release=guard;}});
          return release?await release(response):response;
        }:undefined;
        return render(original,{clockRetryWithinDeadline,recover:recoverReplacement(retry)});
      }
      case "get_profile": result = { id: user.id, name: user.label }; break;
      case "set_led": result = await new LEDControl(service).set(user, args); break;
      case "get_command_result": result = await new LEDControl(service).get(user, uuid(args.command_id)); break;
      case "create_pairing_code": result = await service.createPairingCode(user, args.label, dependencies.origin); break;
      case "list_devices": result = { devices: await service.listDevices(user) }; break;
      case "stop_session": result = await stopOwnedSessions(service,user,args.bridge_session_id); break;
      case "revoke_device": result = await service.revoke(user, uuid(args.device_id)); break;
      case "get_screen_metrics": result = await service.metricsFor(user, uuid(args.device_id)); break;
    }
    return success(id, toolResult(result));
  } catch (error) {
    const code = error instanceof BridgeError ? error.code : "INTERNAL_ERROR";
    return success(id, toolResult({ error: code,...(error instanceof SensitiveInputError?{input_length:error.inputLength}:{}),...(error instanceof InvalidArguments?{invalid_arguments:error.detail}:{}),...(requestParams.name==="click_at"?{source_age_ms:error instanceof InputAdmissionError?error.diagnostic.source_age_ms??null:null,screen_changed_since_source:null,source_observed_at_server_utc_ms:null}:{}),...(code==="SIGNING_CONFIGURATION_INVALID"?{signing_available:false}:{}),
      ...(error instanceof InputAdmissionError?{
        admission_diagnostic:error.diagnostic,
        input_not_submitted:true,
      }:{}) }, [], {}, true));
  }
}
