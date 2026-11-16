import { BridgeError, databaseNowSQL, finite, hash, integer, need, record, text, uuid, type BridgeEngine, type User } from "./bridge-engine.ts";
import { clickAtKey, MouseControl, SYSTEM_SEARCH_KIND, type ClickAfterReleaseRecovery } from "./mouse-control.ts";
import { actionAfterImageAgeLimitMS, beforeImageObservationDeadline, clickRelookMaxGapMS, type ImageObservationDeadline } from "./read-policy.ts";
import { extendedModelReviewedFieldAgeMS, focusedTextPayload } from "./spotlight-command.ts";
import type { NativeSearchReviewState } from "./native-search-review.ts";

export type SpotlightReviewContext = {phase:"focus"|"query_results";query:string};
export type SpotlightReviewer = (jpeg:string,signal:AbortSignal,context:SpotlightReviewContext)=>Promise<unknown>;
export const appSearchQueryKeyPrefix = "app-search-query:";
type Run = { id:string; device_id:string; digest:string; created_at:number; finished_at:number|null; reason:string|null; native_review_state:string|null };
type Child = { id:string; state:string };
export type NativeSearchReview = {token:string;stage:NativeSearchReviewState["stage"];query:string;frame:string};
export type NativeSearchContinuation = {token:string;kind:"missing"}|{token:string;kind:"answer";verdict:unknown};
type QueryObservation = {state:string;command_id:string;image?:string;
  after_screen:{state:string;reason?:unknown;metadata?:unknown;after_command?:unknown;app_effect_observed?:boolean}};
const hostReviewBudgetMS = 60000;
const hostReview = {opening:"host:opening",initial:"host:initial",relook:"host:relook",consumed:"host:consumed",
  noImage:(phase:string)=>phase+":none"};
const hostReleasePending=(phase:string|null)=>phase===hostReview.initial||phase===hostReview.relook;
function reviewedHostFrame(state:string|null) {
  const match=state?.match(/^host:(initial|relook):([0-9a-f-]{36}):(\d+)$/);
  return match?{frame:match[2],gap:Number(match[3]),canRelook:match[1]==="initial"}:null;
}
const runBudgetMS = 20000;
const reviewBudgetMS = 2500;
const extendedReviewBudgetMS = 8000;
const inputRunwayMS = 1500;
const reviewedExistingQuery = "SPOTLIGHT_QUERY_ALREADY_VISIBLE";
const shortcutKey = (id:string) => appSearchQueryKeyPrefix + id + ":shortcut";
const queryKey = (id:string) => appSearchQueryKeyPrefix + id + ":text";
const clearKey = (id:string) => appSearchQueryKeyPrefix + id + ":clear";
const unconfirmed = new Set(["queued","claimed","executing","embedded","outcome_unknown"]);

function focusArguments(verdict: unknown, frame: string, query: string) {
  if (!verdict || typeof verdict!=="object" || Array.isArray(verdict)) return null;
  const result = record(verdict);
  if (result.scene !== "spotlight" || result.empty !== true || result.caret !== true) return null;
  const keys = ["scene","empty","caret","field","landmark","placeholder"];
  if (Object.keys(result).some(key => !keys.includes(key))) return null;
  return focusedTextPayload({
    source_frame_id:frame, text:query, field:result.field, landmark:result.landmark, placeholder:result.placeholder,
  });
}

function visibleQuery(verdict: unknown, frame: string, query: string) {
  if (!verdict || typeof verdict!=="object" || Array.isArray(verdict)) return null;
  const result=record(verdict);
  if (result.scene!=="spotlight" || result.empty!==false ||
      typeof result.visible_query!=="string" || !result.visible_query.trim() ||
      result.visible_query.length>128 || /[\x00-\x1f\x7f]/.test(result.visible_query)) return null;
  if (Object.keys(result).some(key=>!["scene","empty","visible_query","field","landmark","clear_control"].includes(key))) return null;
  const {field,landmark}=focusedTextPayload({source_frame_id:frame,text:query,field:result.field,landmark:result.landmark});
  if (result.clear_control===undefined) return {text:result.visible_query};
  const control=record(result.clear_control);
  need(Object.keys(control).length===4,"INVALID_SPOTLIGHT_CLEAR_CONTROL",422);
  const x=finite(control.x,0,1), y=finite(control.y,0,1);
  const width=finite(control.width,0.01,field.width/3), height=finite(control.height,0.01,field.height);
  need(x>=field.x&&y>=field.y&&x+width<=field.x+field.width&&y+height<=field.y+field.height,
    "INVALID_SPOTLIGHT_CLEAR_CONTROL",422);
  return {text:result.visible_query,clear:{x:x+width/2,y:y+height/2,target:{x,y,width,height},landmark:landmark.region}};
}

function transitionVerdict(verdict: unknown) {
  if (!verdict || typeof verdict!=="object" || Array.isArray(verdict)) return false;
  const value=record(verdict);
  return value.scene==="transition" && Object.keys(value).length===1;
}

function focusReviewWindow(signal:AbortSignal,observation:Record<string,unknown>,deadline:ImageObservationDeadline|undefined,
  now:number,extended:boolean) {
  const observationRemaining=Math.max(0,Math.floor(deadline?.remainingMS()??0));
  const capture=record(observation.metadata??{}).capture_lower_server_utc_ms;
  const sourceRemaining=typeof capture==="number"&&Number.isFinite(capture)&&capture<=now?
    capture+extendedModelReviewedFieldAgeMS-inputRunwayMS-now:0;
  const budget=extended&&sourceRemaining>0?
    Math.min(extendedReviewBudgetMS,Math.floor(sourceRemaining)):
    Math.min(reviewBudgetMS,observationRemaining);
  return {observationRemaining,signal:AbortSignal.any([signal,AbortSignal.timeout(Math.max(0,budget))])};
}

function focusRelookSignal(signal:AbortSignal,deadline:ImageObservationDeadline|undefined) {
  const remaining=Math.floor(deadline?.remainingMS()??0);
  return remaining>0&&!signal.aborted?AbortSignal.any([signal,AbortSignal.timeout(remaining)]):null;
}

function queryResultsVerdict(verdict:unknown,query:string) {
  if(!verdict||typeof verdict!=="object"||Array.isArray(verdict))return null;
  const result=record(verdict);
  if(Object.keys(result).length!==3||result.scene!=="spotlight"||typeof result.visible_query!=="string"||
    result.visible_query.toLowerCase()!==query.toLowerCase())return null;
  return result.result==="installed_result_visible"?"ready":result.result==="loading"?"loading":null;
}

async function reviewWithin(review:SpotlightReviewer,jpeg:string,signal:AbortSignal,context:SpotlightReviewContext) {
  if (signal.aborted) return null;
  let aborted!: () => void;
  const stopped = new Promise<null>(resolve => {
    aborted = () => resolve(null);
    signal.addEventListener("abort", aborted, {once:true});
  });
  try {
    return await Promise.race([review(jpeg,signal,context),stopped]);
  } finally {
    signal.removeEventListener("abort",aborted);
  }
}

export class AppSearchQuery {
  private readonly mouse: MouseControl;
  private readonly engine: BridgeEngine;
  private readonly review?: SpotlightReviewer;
  constructor(engine: BridgeEngine, review?: SpotlightReviewer) {
    this.engine=engine;
    this.review=review;
    this.mouse = new MouseControl(engine);
  }
  private async original(user: User, id: string) {
    return this.engine.stmt(`SELECT q.* FROM sb_app_search_queries q
      JOIN sb_devices d ON d.id=q.device_id AND d.owner_id=q.owner_id AND d.revoked=0
      WHERE q.owner_id=? AND q.id=?`,user.id,id).first<Run>();
  }
  private async children(user: User, run: Run) {
    const originalClearKey=(await clickAtKey(clearKey(run.id)))+":click";
    const result = await this.engine.stmt("SELECT id,state,idempotency_key FROM sb_mouse_commands "+
      "WHERE owner_id=? AND device_id=? AND idempotency_key IN (?,?,?)",user.id,run.device_id,
      shortcutKey(run.id),originalClearKey,queryKey(run.id)).all<Child & {idempotency_key:string}>();
    return {
      shortcut:result.results.find(child => child.idempotency_key===shortcutKey(run.id)),
      clear:result.results.find(child => child.idempotency_key===originalClearKey),
      typed:result.results.find(child => child.idempotency_key===queryKey(run.id)),
    };
  }
  private async reviewQueryResults(user:User,query:string,requestID:string,review:SpotlightReviewer,signal:AbortSignal,
    original:QueryObservation,release:ClickAfterReleaseRecovery|undefined) {
    const deadline=release?.observationDeadline;
    const selected={after_screen:original.after_screen,image:original.image};
    const fallback={...selected,release,readyFrame:undefined as string|undefined,readySHA:undefined as string|undefined,
      visibleFrame:undefined as string|undefined};
    if(!release||!deadline||original.state!=="board_acked"||original.after_screen.state!=="available"||!original.image)return fallback;
    const initial=record(original.after_screen.metadata??{}),firstProof=record(original.after_screen.after_command??{});
    const initialFrame=initial.frame_id;
    if(typeof initialFrame!=="string"||firstProof.command_id!==original.command_id)return fallback;
    const classify=(image:string)=>beforeImageObservationDeadline(deadline,async limited=>{
      const reviewSignal=AbortSignal.any([signal,limited,AbortSignal.timeout(reviewBudgetMS)]);
      return queryResultsVerdict(await reviewWithin(review,image,reviewSignal,{phase:"query_results",query}),query);
    }).catch(()=>undefined);
    const sha=(image:string)=>hash(Buffer.from(image,"base64")).catch(()=>undefined);
    const first=await classify(original.image);
    if(first==="ready"){
      const readySHA=await sha(original.image);
      return {...fallback,readyFrame:readySHA?initialFrame:undefined,readySHA,visibleFrame:initialFrame};
    }
    if(first!=="loading")return fallback;
    const gap=firstProof.lower_gap_ms;
    if(typeof gap!=="number"||!Number.isFinite(gap)||gap<0||Math.ceil(gap)>=clickRelookMaxGapMS)return fallback;

    let laterRelease:ClickAfterReleaseRecovery|undefined;
    const oneRelook={...fallback,visibleFrame:initialFrame,release:{...release,retry:undefined}};
    const later=await beforeImageObservationDeadline(deadline,limited=>
      this.mouse.getSpotlightObserved(user,original.command_id,requestID,{
        signal:AbortSignal.any([signal,limited]),afterCommandMinGapMS:Math.ceil(gap),
        registerRelease:value=>{laterRelease=value;},
      })).catch(()=>undefined);
    if(!later)return oneRelook;
    if(later.after_screen.reason==="AFTER_COMMAND_SCOPE_CHANGED"||later.after_screen.reason==="SCREEN_SCOPE_CHANGED")
      return {...oneRelook,after_screen:later.after_screen,image:undefined,visibleFrame:undefined};
    if(later.state!=="board_acked"||later.after_screen.state!=="available"||!later.image||!laterRelease)return oneRelook;
    const next=record(later.after_screen.metadata),nextProof=record(later.after_screen.after_command),frame=next.frame_id;
    const sameScope=["device_id","bridge_session_id","broadcast_id","worker_id","worker_id_at_read",
      "lease_epoch","control_epoch_at_read","orientation_epoch","orientation","width","height"].every(key=>next[key]===initial[key]);
    const advances=["frame_seq","source_seq","capture_lower_phone_mono_ms"].every(key=>
      typeof next[key]==="number"&&typeof initial[key]==="number"&&Number(next[key])>Number(initial[key]));
    if(typeof frame!=="string"||frame===initialFrame||!sameScope||!advances||nextProof.command_id!==original.command_id||
      nextProof.phone_ack_mono_ms!==firstProof.phone_ack_mono_ms)return {
        ...oneRelook,after_screen:{state:"unavailable",reason:"QUERY_RESULT_FRAME_CHANGED",app_effect_observed:false as const},
        image:undefined,visibleFrame:undefined,
      };
    const observed=await classify(later.image);
    // The second read has no independent window and cannot use egress recovery
    // to read a third image after the configured reviewer has finished.
    const boundedRelease={...release,retry:undefined};
    const readySHA=observed==="ready"?await sha(later.image):undefined;
    return {after_screen:later.after_screen,image:later.image,release:boundedRelease,
      readyFrame:readySHA?frame:undefined,readySHA,visibleFrame:observed==="ready"||observed==="loading"?frame:undefined};
  }

  async get(user: User, id: unknown, observe: boolean, requestID: string, signal: AbortSignal,
    registerRelease?: (value:ClickAfterReleaseRecovery)=>void, afterCommandMinGapMS?:number) {
    const run=await this.original(user,uuid(id));
    need(run,"APP_SEARCH_QUERY_NOT_FOUND",404);
    const {shortcut,clear,typed}=await this.children(user,run);
    const child=typed??clear??shortcut;
    const existing=run.reason===reviewedExistingQuery&&shortcut?.state==="board_acked";
    const hostPhase=run.native_review_state?.startsWith("host:");
    const review=run.finished_at===null&&hostPhase?reviewedHostFrame(run.native_review_state):null;
    const expired=this.engine.now()>=run.created_at+(hostPhase?hostReviewBudgetMS:runBudgetMS);
    const phase=run.native_review_state;
    const expiredFocusReview=expired&&run.finished_at===null&&shortcut?.state==="board_acked"&&!clear&&!typed&&
      (phase===hostReview.opening||hostReleasePending(phase)||review!==null||
        phase===hostReview.noImage(hostReview.initial)||phase===hostReview.noImage(hostReview.relook));
    const result=observe&&(!hostPhase||typed)&&child?.state==="board_acked"?
      await this.mouse.getSpotlightObserved(user,child.id,requestID,{signal,registerRelease,afterCommandMinGapMS}):null;
    return {
      preparation_id:run.id, device_id:run.device_id,
      state:typed?.state==="board_acked"?"query_confirmed":existing?"review_required":child&&unconfirmed.has(child.state)?"outcome_unknown":
        run.finished_at!==null?"stopped":expired?"outcome_unknown":review?"review_required":
        hostPhase&&run.native_review_state?.endsWith(":none")?"review_image_unavailable":
        hostReleasePending(run.native_review_state)?"review_release_pending":"in_progress",
      reason:typed?.state==="board_acked"?null:existing?"SPOTLIGHT_QUERY_REVIEW_REQUIRED":
        run.reason??(expiredFocusReview?"SPOTLIGHT_REVIEW_EXPIRED":null),
      reviewed_query_frame_id:undefined,
      query_results_state:"not_checked",
      query_results_frame_id:undefined,
      query_results_content_sha256:undefined,
      ...(!expired&&review?{review_frame_id:review.frame}:{}),
      compound_query_proof_allowed:run.finished_at!==null&&typed?.state==="board_acked"&&result?.text_input?.transport==="stable_usb",
      shortcut_command_id:shortcut?.id??null, shortcut_state:shortcut?.state??null,
      clear_command_id:clear?.id??null, clear_state:clear?.state??null,
      text_command_id:typed?.id??null, text_state:typed?.state??null,
      after_screen:result?.after_screen??{state:"unavailable"},
      kind:result?.kind, image:result?.image, app_effect_observed:false,
    };
  }
  private async input(args:Record<string,unknown>) {
    const id=uuid(args.preparation_id), device=uuid(args.device_id);
    const source=args.source_frame_id===undefined?undefined:uuid(args.source_frame_id);
    const proof=args.source_view_proof===undefined?undefined:text(args.source_view_proof,2048);
    need(proof===undefined||source!==undefined,"SYSTEM_SEARCH_PROOF_REQUIRES_SOURCE_FRAME",422);
    const query=text(args.query,64);
    need(/^[\x20-\x7e]{1,64}$/.test(query)&&query.trim().length>0,"UNSUPPORTED_TEXT_CHARACTERS",422);
    const digest=await hash(JSON.stringify([device,source??null,query,proof??null]));
    return {id,device,source,proof,query,digest};
  }
  private create(user:User,id:string,device:string,digest:string,now:number,phase:string|null=null) {
    return this.engine.stmt(`INSERT INTO sb_app_search_queries(id,owner_id,device_id,digest,created_at,native_review_state)
      SELECT ?,d.owner_id,d.id,?,?,? FROM sb_devices d WHERE d.id=? AND d.owner_id=? AND d.revoked=0
      AND NOT EXISTS(SELECT 1 FROM sb_app_search_queries q WHERE q.owner_id=d.owner_id AND q.device_id=d.id
        AND q.finished_at IS NULL AND q.created_at>CASE WHEN q.native_review_state LIKE 'host:%' THEN ? ELSE ? END)
      ON CONFLICT(owner_id,id) DO NOTHING RETURNING id`,id,digest,now,phase,device,user.id,now-hostReviewBudgetMS,now-runBudgetMS).first<{id:string}>();
  }
  private async busy(user:User,device:string,digest:string) {
    const now=this.engine.now();
    const active=await this.engine.stmt(`SELECT q.id,q.digest,q.created_at+CASE WHEN q.native_review_state LIKE 'host:%' THEN ? ELSE ? END AS expires_at
      FROM sb_app_search_queries q JOIN sb_devices d ON d.id=q.device_id AND d.owner_id=q.owner_id AND d.revoked=0
      WHERE q.owner_id=? AND q.device_id=? AND q.finished_at IS NULL
        AND q.created_at>CASE WHEN q.native_review_state LIKE 'host:%' THEN ? ELSE ? END
      ORDER BY q.created_at DESC LIMIT 1`,hostReviewBudgetMS,runBudgetMS,user.id,device,now-hostReviewBudgetMS,now-runBudgetMS)
      .first<{id:string;digest:string;expires_at:number}>();
    const canResume=active?.digest===digest;
    return {device_id:device,state:active?"search_busy":"stopped",reason:active?"APP_SEARCH_QUERY_BUSY":"APP_SEARCH_QUERY_BUSY_OR_UNAVAILABLE",
      can_resume:canResume,retry_after_ms:active?Math.max(0,active.expires_at-now):0,
      ...(canResume?{active_preparation_id:active!.id}:{}),image:undefined,reviewed_query_frame_id:undefined,
      compound_query_proof_allowed:false,query_results_content_sha256:undefined,app_effect_observed:false,
      shortcut_command_id:null,text_command_id:null};
  }
  private async finish(user:User,id:string,reason:string|null) {
    await this.engine.stmt("UPDATE sb_app_search_queries SET finished_at=?,reason=? WHERE id=? AND owner_id=? AND finished_at IS NULL",
      this.engine.now(),reason,id,user.id).run();
  }

  private moveHostReview(user:User,id:string,from:string,to:string) {
    return this.engine.stmt(`UPDATE sb_app_search_queries SET native_review_state=?
      WHERE id=? AND owner_id=? AND finished_at IS NULL AND native_review_state=?
        AND created_at+?>max(?,${databaseNowSQL}) RETURNING id`,
      to,id,user.id,from,hostReviewBudgetMS,this.engine.now()).first<{id:string}>();
  }

  async rememberHostReview(user:User,id:string,phase:string,command:string,frame:string,gap:number,proof:string) {
    if(!hostReleasePending(phase))return;
    await this.engine.rememberReleasedFieldProof(user,proof,{
      preparation:id,command,frame,previous:phase,next:phase+":"+frame+":"+Math.ceil(gap),budgetMS:hostReviewBudgetMS,
    });
  }

  async rememberMissingHostReview(user:User,id:string,phase:string) {
    if(hostReleasePending(phase))
      await this.moveHostReview(user,id,phase,hostReview.noImage(phase));
  }

  private async waitForHostRelease(user:User,run:Run,signal:AbortSignal) {
    // Pending release is neither a missing image nor a confirmed frame.
    if(run.finished_at!==null||signal.aborted||!hostReleasePending(run.native_review_state))return run;
    await new Promise(resolve=>setTimeout(resolve,100));
    return await this.original(user,run.id)??run;
  }

  private confirmedHostSummary(id:string,device:string,shortcut:string,typed?:string) {
    return {preparation_id:id,device_id:device,reason:null,
      shortcut_command_id:shortcut,shortcut_state:"board_acked",clear_command_id:null,clear_state:null,
      text_command_id:typed??null,text_state:typed?"board_acked":null,reviewed_query_frame_id:undefined,
      query_results_state:"not_checked",query_results_frame_id:undefined,query_results_content_sha256:undefined,
      compound_query_proof_allowed:false,app_effect_observed:false};
  }

  private async hostObservation(user:User,id:string,device:string,shortcut:string,phase:string,observation:QueryObservation|undefined,
    requestID:string,signal:AbortSignal,release:ClickAfterReleaseRecovery|undefined,
    registerRelease?:(value:ClickAfterReleaseRecovery)=>void) {
    if(release)registerRelease?.(release);
    if(observation?.state==="board_acked"&&observation.command_id===shortcut&&
      observation.after_screen.state==="available"&&observation.image){
      // The known scoped command already proves this status. Avoid another
      // original/children read while the JPEG is approaching its release limit.
      return {...observation,...this.confirmedHostSummary(id,device,shortcut),
        state:"review_required",host_review_phase:phase};
    }
    const base=await this.get(user,id,false,requestID,signal);
    return {...base,...observation,
      state:base.shortcut_state==="board_acked"?"review_image_unavailable":base.state,
      reason:base.reason??"SPOTLIGHT_AFTER_IMAGE_UNAVAILABLE",
      host_review_phase:phase};
  }

  async hostRelook(user:User,id:unknown,requestID:string,signal:AbortSignal,
    registerRelease?:(value:ClickAfterReleaseRecovery)=>void) {
    const original=await this.original(user,uuid(id));
    need(original,"APP_SEARCH_QUERY_NOT_FOUND",404);
    const run=await this.waitForHostRelease(user,original,signal);
    const phase=run.native_review_state,previous=reviewedHostFrame(phase);
    if(run.finished_at!==null||!phase||(phase!==hostReview.noImage(hostReview.initial)&&!previous?.canRelook))
      return this.get(user,run.id,false,requestID,signal);
    const {shortcut}=await this.children(user,run);
    if(signal.aborted||shortcut?.state!=="board_acked"||
      (previous&&previous.gap>=clickRelookMaxGapMS)||!await this.moveHostReview(user,run.id,phase,hostReview.relook))
      return this.get(user,run.id,false,requestID,signal);
    let release:ClickAfterReleaseRecovery|undefined;
    const observation=await this.mouse.getSpotlightObserved(user,shortcut.id,requestID,{
      signal,afterCommandMinGapMS:previous?.gap,registerRelease:value=>{release=value;},
    }).catch(()=>undefined);
    return this.hostObservation(user,run.id,run.device_id,shortcut.id,hostReview.relook,observation,requestID,signal,release,registerRelease);
  }

  async hostRun(user:User,args:Record<string,unknown>,requestID:string,signal:AbortSignal,
    registerRelease?:(value:ClickAfterReleaseRecovery)=>void) {
    need(this.engine.releasedFieldViewProofAvailable,"APP_SEARCH_VISION_UNAVAILABLE",409);
    const {id,device,source,proof,query,digest}=await this.input(args);
    const status=()=>this.get(user,id,false,requestID,signal);
    need(!signal.aborted,"APP_SEARCH_QUERY_CANCELLED",409);
    let release:ClickAfterReleaseRecovery|undefined;
    const captureRelease=(value:ClickAfterReleaseRecovery)=>{release=value;};
    if(args.review===undefined){
      const existing=await this.original(user,id);
      if(existing){
        need(existing.device_id===device&&existing.digest===digest,"IDEMPOTENCY_CONFLICT");
        return status();
      }
      const board=await this.mouse.status(user,{device_id:device});
      need(board.system_search_ready===true&&board.focused_text_scope_bound_field_ready===true&&
        board.focused_text_scope_bound_after_ready===true,"APP_SEARCH_HOST_REVIEW_UNAVAILABLE",409);
      if(!await this.create(user,id,device,digest,this.engine.now(),hostReview.opening)){
        const same=await this.original(user,id);
        if(!same)return this.busy(user,device,digest);
        need(same.device_id===device&&same.digest===digest,"IDEMPOTENCY_CONFLICT");
        return status();
      }
      try{
        const opened=await this.mouse.enqueueObserved(user,SYSTEM_SEARCH_KIND,{
          device_id:device,idempotency_key:shortcutKey(id),settle_ms:900,
          ...(source===undefined?{}:{source_frame_id:source}),...(proof===undefined?{}:{source_view_proof:proof}),
        },requestID,{signal,cancelSystemSearchBeforeAdmission:true,registerRelease:captureRelease});
        if(opened.state!=="board_acked"&&!unconfirmed.has(opened.state)){
          await this.finish(user,id,"SPOTLIGHT_SEARCH_UNCONFIRMED");
          return status();
        }
        if(!await this.moveHostReview(user,id,hostReview.opening,hostReview.initial))return status();
        if(opened.state!=="board_acked"){
          await this.rememberMissingHostReview(user,id,hostReview.initial);
          return status();
        }
        return this.hostObservation(user,id,device,opened.command_id,hostReview.initial,opened,requestID,signal,release,registerRelease);
      }catch(error){
        await this.finish(user,id,error instanceof BridgeError?error.code:"APP_SEARCH_QUERY_UNAVAILABLE");
        return status();
      }
    }
    const found=await this.original(user,id);
    need(found&&found.device_id===device&&found.digest===digest,"INVALID_APP_SEARCH_CONTINUATION",409);
    const original=await this.waitForHostRelease(user,found,signal);
    const review=record(args.review),frame=uuid(review.source_frame_id);
    const phase=original.native_review_state,reviewed=reviewedHostFrame(phase);
    if(original.finished_at!==null||phase===hostReview.consumed||hostReleasePending(phase))return status();
    need(phase&&reviewed?.frame===frame,"APP_SEARCH_REVIEW_FRAME_CHANGED",409);
    const keys=review.scene==="unverified"?["source_frame_id","scene"]:["source_frame_id","scene","empty","field","landmark","placeholder"];
    need(Object.keys(review).every(key=>keys.includes(key)),"INVALID_APP_SEARCH_CONTINUATION",422);
    const focus=review.scene==="spotlight"&&review.empty===true?focusedTextPayload({
      source_frame_id:frame,text:query,field:review.field,landmark:review.landmark,placeholder:review.placeholder,
    }):null;
    need(focus||review.scene==="unverified","INVALID_APP_SEARCH_CONTINUATION",422);
    const {shortcut}=await this.children(user,original);
    need(shortcut?.state==="board_acked","INVALID_APP_SEARCH_CONTINUATION",409);
    const {scopeBoundField,view}=await this.engine.lookupReleasedFieldProof(user,device,shortcut.id,frame,false);
    need(scopeBoundField&&view?.origin==="system_search"&&view.scopeBoundField===true,
      "FIELD_FRAME_OR_CONTROL_CHANGED",409);
    if(signal.aborted||!await this.moveHostReview(user,id,phase,hostReview.consumed))return status();
    if(!focus){
      await this.finish(user,id,"SPOTLIGHT_FOCUS_UNVERIFIED");
      return status();
    }
    try{
      const typedArgs={
        ...focus,device_id:device,source_after_command_id:shortcut.id,idempotency_key:queryKey(id),settle_ms:300,
        clear_before_input:false,
      };
      const direct=await this.mouse.enqueueAuthorizedFieldObserved(user,typedArgs,requestID,{signal,
        authorizedSearch:{preparationID:id,shortcutID:shortcut.id,until:original.created_at+hostReviewBudgetMS},registerRelease:captureRelease});
      const typed=direct??await this.mouse.enqueueSpotlightObserved(user,typedArgs,requestID,true,
        {signal,linkedFieldSource:view,registerRelease:captureRelease});
      await this.finish(user,id,typed.state==="board_acked"?null:"APP_SEARCH_QUERY_UNCONFIRMED");
      if(release)registerRelease?.(release);
      const summary=typed.state==="board_acked"&&typed.after_screen.state==="available"&&typed.image?
        {...this.confirmedHostSummary(id,device,shortcut.id,typed.command_id),state:"query_confirmed"}:await status();
      return {...summary,kind:typed.kind,after_screen:typed.after_screen,image:typed.image,
        query_results_state:"pending",compound_query_proof_allowed:typed.state==="board_acked"&&typed.text_input?.transport==="stable_usb"};
    }catch(error){
      await this.finish(user,id,error instanceof BridgeError?error.code:"APP_SEARCH_QUERY_UNAVAILABLE");
      return status();
    }
  }

  private async recoverNativeReview(user:User,run:Run,query:string,requestID:string,signal:AbortSignal,
    registerRelease?:(value:ClickAfterReleaseRecovery)=>void) {
    const base=await this.get(user,run.id,false,requestID,signal);
    const fallback={...base,nativeReview:undefined};
    const state=run.native_review_state;
    if(run.finished_at!==null||!state?.startsWith("pending:")||signal.aborted)return fallback;
    const token=state.slice("pending:".length),view=await this.engine.verifyNativeSearchReview(user,token);
    if(!view||view.preparation!==run.id||view.device!==run.device_id||view.argsDigest!==run.digest||
      view.shortcut!==base.shortcut_command_id||base.shortcut_state!=="board_acked")return fallback;
    const expected=view.stage==="focus"?[base.shortcut_command_id,base.shortcut_state]:
      view.stage==="after_clear"?[base.clear_command_id,base.clear_state]:
      base.text_command_id?[base.text_command_id,base.text_state]:[base.shortcut_command_id,base.shortcut_state];
    if(expected[0]!==view.command||expected[1]!=="board_acked")return fallback;
    const ends=Math.min(view.observeUntil,view.expires,view.captureLower+actionAfterImageAgeLimitMS);
    const deadline:ImageObservationDeadline={remainingMS:()=>ends-this.engine.now(),signal,expire:()=>{}};
    let recovery:ClickAfterReleaseRecovery|undefined;
    const observed=await beforeImageObservationDeadline(deadline,limited=>
      this.mouse.getSpotlightObserved(user,view.command,requestID,{
        signal:AbortSignal.any([signal,limited]),snapshotOnly:true,registerRelease:value=>{recovery=value;},
      })).catch(()=>undefined);
    if(observed?.state!=="board_acked"||observed.after_screen.state!=="available"||!observed.image||!recovery)return fallback;
    const meta=record(observed.after_screen.metadata??{}),proof=record(observed.after_screen.after_command??{});
    if(meta.frame_id!==view.frame||meta.capture_lower_server_utc_ms!==view.captureLower||
      meta.width!==view.width||meta.height!==view.height||meta.orientation_epoch!==view.orientationEpoch||
      proof.command_id!==view.command||proof.lower_gap_ms!==view.originalGapMS||
      await hash(Buffer.from(observed.image,"base64"))!==view.sha256)return fallback;
    const release=recovery;
    const withinDeadline=()=>!signal.aborted&&deadline.remainingMS()>0&&release.withinDeadline();
    // Recheck the pending token and exact authorized JPEG after fetching the
    // pixels. A consumed challenge and a newer writer both end this readback.
    if(!withinDeadline()||!await beforeImageObservationDeadline(deadline,()=>this.engine.checkPendingNativeSearchReview(user,token))||
      !withinDeadline())return fallback;
    registerRelease?.({withinDeadline,enforceDeadline:true,observationDeadline:deadline});
    return {...base,kind:observed.kind,after_screen:observed.after_screen,image:observed.image,
      nativeReview:{token,stage:view.stage,query,frame:view.frame}};
  }

  /** The only state across native MCP rounds is a signed JPEG reference and one-use D1 phase. */
  async nativeRun(user:User,args:Record<string,unknown>,requestID:string,requestSignal:AbortSignal,
    continuation:NativeSearchContinuation|undefined,registerRelease?:(value:ClickAfterReleaseRecovery)=>void) {
    need(this.engine.nativeSearchReviewAvailable,"APP_SEARCH_VISION_UNAVAILABLE",409);
    const {id,device,source,proof,query,digest}=await this.input(args);
    const status=()=>this.get(user,id,false,requestID,requestSignal);
    const now=this.engine.now();
    need(!requestSignal.aborted,"APP_SEARCH_QUERY_CANCELLED",409);
    let createdAt=now, previous:NativeSearchReviewState|undefined, verdict:unknown;
    if (continuation) {
      const original=await this.original(user,id);
      need(original&&original.device_id===device&&original.digest===digest,"INVALID_APP_SEARCH_CONTINUATION",409);
      createdAt=original.created_at;
      const verified=await this.engine.verifyNativeSearchReview(user,continuation.token);
      if (!verified||verified.preparation!==id||verified.device!==device||verified.argsDigest!==digest||original.finished_at!==null)
        return {...await status(),nativeReview:undefined};
      if (requestSignal.aborted) return {...await status(),nativeReview:undefined};
      if (continuation.kind==="missing") {
        // An absent callback is not a verdict. Re-emit only the exact pending
        // challenge that this request echoed, within its original pixel window.
        return original.native_review_state==="pending:"+continuation.token?
          this.recoverNativeReview(user,original,query,requestID,requestSignal,registerRelease):
          {...await status(),nativeReview:undefined};
      }
      const consumed=await this.engine.consumeNativeSearchReview(user,continuation.token);
      if (!consumed) return {...await status(),nativeReview:undefined};
      previous=consumed;
      verdict=continuation.verdict;
    } else if (!await this.create(user,id,device,digest,createdAt)) {
      const original=await this.original(user,id);
      if(!original)return {...await this.busy(user,device,digest),nativeReview:undefined};
      need(original.device_id===device&&original.digest===digest,"IDEMPOTENCY_CONFLICT");
      return this.recoverNativeReview(user,original,query,requestID,requestSignal,registerRelease);
    }

    const expires=createdAt+runBudgetMS;
    const signal=AbortSignal.any([requestSignal,AbortSignal.timeout(Math.max(0,Math.floor(expires-this.engine.now())))]);
    let observation:QueryObservation|undefined, release:ClickAfterReleaseRecovery|undefined;
    const captureRelease=(value:ClickAfterReleaseRecovery)=>{release=value;};
    let retained=false;
    let ready:NativeSearchReviewState|undefined;
    let reason:string|null="APP_SEARCH_QUERY_CANCELLED";
    let shortcut=previous?.shortcut;
    const readOriginal=async(view:NativeSearchReviewState,minGap?:number)=>{
      const deadline:ImageObservationDeadline={remainingMS:()=>view.observeUntil-this.engine.now(),signal,expire:()=>{}};
      const observed=await beforeImageObservationDeadline(deadline,limited=>
        this.mouse.getSpotlightObserved(user,view.command,requestID,{
          signal:AbortSignal.any([limited,signal]),afterCommandMinGapMS:minGap,registerRelease:captureRelease,
        })).catch(()=>undefined);
      // A continuation uses the original observation window and can never acquire
      // the separate egress retry granted to a normal result lookup.
      if (release) {
        const actual=release;
        release={...actual,observationDeadline:deadline,enforceDeadline:true,retry:undefined,
          withinDeadline:()=>!signal.aborted&&deadline.remainingMS()>0&&actual.withinDeadline()};
      }
      return observed;
    };
    const requestReview=async(stage:NativeSearchReviewState["stage"],relook=false,extended=false)=>{
      if(!shortcut||signal.aborted||observation?.state!=="board_acked"||observation.after_screen.state!=="available"||
        !observation.image||!release?.observationDeadline)return undefined;
      const meta=record(observation.after_screen.metadata??{}), after=record(observation.after_screen.after_command??{});
      const capture=meta.capture_lower_server_utc_ms, gap=after.lower_gap_ms, minimum=after.minimum_gap_ms;
      const issued=this.engine.now();
      const remaining=release.observationDeadline.remainingMS();
      const observeUntil=relook&&previous?previous.observeUntil:Math.min(issued+5000,issued+remaining);
      const deadline=stage==="query_results"||!extended?
        Math.min(issued+reviewBudgetMS,observeUntil):Math.min(issued+extendedReviewBudgetMS,Number(capture)+extendedModelReviewedFieldAgeMS-inputRunwayMS);
      if(typeof capture!=="number"||!Number.isFinite(capture)||capture>issued||issued-capture>=2000||
        typeof gap!=="number"||!Number.isFinite(gap)||gap>5000||typeof minimum!=="number"||gap<=minimum||
        !Number.isFinite(observeUntil)||observeUntil<=issued||deadline<=issued||expires<=issued||
        after.command_id!==observation.command_id||after.command_state!=="board_acked"||
        after.relation!=="capture_after_phone_board_ack"||after.scope_matches_at_snapshot!==true||
        meta.capture_clock_verified!==true||meta.device_id!==device||meta.worker_id!==meta.worker_id_at_read||
        after.capture_lower_phone_mono_ms!==meta.capture_lower_phone_mono_ms)return undefined;
      const frame=uuid(meta.frame_id);
      if(relook&&previous&&(frame===previous.frame||capture<=previous.captureLower||gap<=previous.originalGapMS))return undefined;
      const sha256=await hash(Buffer.from(observation.image,"base64"));
      if(signal.aborted||!release.withinDeadline())return undefined;
      const token=await this.engine.issueNativeSearchReview(user,{
        preparation:id,device,argsDigest:digest,stage,shortcut,command:observation.command_id,frame,sha256,nonce:crypto.randomUUID(),
        width:integer(meta.width,2,8192),height:integer(meta.height,2,8192),orientationEpoch:integer(meta.orientation_epoch,0,Number.MAX_SAFE_INTEGER),
        captureLower:capture,originalGapMS:gap,relook,observeUntil,issued,expires:Math.min(expires,deadline),
      },continuation?.token);
      return token?{token,stage,query,frame}:undefined;
    };
    const result=async(nativeReview?:NativeSearchReview)=>{
      const base=await status();
      if(release)registerRelease?.({...release,retry:undefined});
      const kind=observation&&"kind" in observation&&typeof observation.kind==="string"?observation.kind:base.kind;
      const typed=base.text_state==="board_acked"&&observation?.state==="board_acked"&&observation.command_id===base.text_command_id;
      const pending=previous?.stage==="query_results"||typed||retained;
      return {
        ...base, state:retained&&ready?"query_visible":base.state,
        reason:retained&&ready?null:base.reason,
        kind, image:observation?.image, after_screen:observation?.after_screen??base.after_screen,
        reviewed_query_frame_id:retained&&ready?ready.frame:undefined,
        query_results_state:ready?"ready":pending?"pending":"not_checked",
        query_results_frame_id:ready?.frame,query_results_content_sha256:ready?.sha256,
        compound_query_proof_allowed:typed||retained&&!!ready,
        nativeReview,
      };
    };
    try {
      if (!signal.aborted && !previous) {
        let extended=false;
        const opened=await this.mouse.enqueueObserved(user,SYSTEM_SEARCH_KIND,{
          device_id:device,idempotency_key:shortcutKey(id),
          ...(source===undefined?{}:{source_frame_id:source}),...(proof===undefined?{}:{source_view_proof:proof}),
        },requestID,{signal,cancelSystemSearchBeforeAdmission:true,onExtendedModelField:()=>{extended=true;},registerRelease:captureRelease});
        shortcut=opened.command_id;
        observation=opened;
        reason="SPOTLIGHT_AFTER_IMAGE_UNAVAILABLE";
        const challenge=await requestReview("focus",false,extended);
        if(challenge)return result(challenge);
      } else if(!signal.aborted && previous) {
        const view=previous, original=await this.original(user,id);
        need(original,"INVALID_APP_SEARCH_CONTINUATION",409);
        const children=await this.children(user,original);
        const expected=view.stage==="focus"?children.shortcut:view.stage==="after_clear"?children.clear:children.typed??children.shortcut;
        need(children.shortcut?.id===view.shortcut&&children.shortcut.state==="board_acked"&&
          expected?.id===view.command&&expected.state==="board_acked","INVALID_APP_SEARCH_CONTINUATION",409);
        const isResults=view.stage==="query_results";
        const disposition=isResults?queryResultsVerdict(verdict,query):null;
        const mayRelook=isResults?disposition==="loading":transitionVerdict(verdict);
        reason=isResults?"APP_SEARCH_QUERY_UNCONFIRMED":view.stage==="after_clear"?"SPOTLIGHT_FOCUS_AFTER_CLEAR_UNVERIFIED":"SPOTLIGHT_FOCUS_UNVERIFIED";
        if(isResults) {
          retained=expected.id===view.shortcut;
          reason=retained?reviewedExistingQuery:null;
        }
        if(mayRelook&&!view.relook&&Math.ceil(view.originalGapMS)<clickRelookMaxGapMS) {
          observation=await readOriginal(view,Math.ceil(view.originalGapMS));
          const challenge=await requestReview(view.stage,true);
          if(challenge)return result(challenge);
        } else if(isResults) {
          // A newly arrived head can be returned, but only the exact JPEG seen by
          // this verdict can carry a semantic ready claim.
          observation=await readOriginal(view);
          if(disposition==="ready"&&observation?.state==="board_acked"&&observation.image&&
            record(observation.after_screen.metadata??{}).frame_id===view.frame&&
            await hash(Buffer.from(observation.image,"base64"))===view.sha256)ready=view;
        } else if(!mayRelook) {
          const existing=view.stage==="focus"?visibleQuery(verdict,view.frame,query):null;
          if(existing?.text.toLowerCase()===query.toLowerCase()) {
            retained=true;
            reason=reviewedExistingQuery;
            observation=await readOriginal(view);
            const challenge=await requestReview("query_results");
            if(challenge)return result(challenge);
          } else if(existing) {
            reason="SPOTLIGHT_EXISTING_QUERY";
            if(existing.clear) {
              const pointState=await this.mouse.status(user,{device_id:device});
              if(!signal.aborted&&this.engine.now()<view.expires) {
                observation=await this.mouse.clickAt(user,{
                  device_id:device,source_frame_id:view.frame,idempotency_key:clearKey(id),
                  x:Math.round(existing.clear.x*(view.width-1)),y:Math.round(existing.clear.y*(view.height-1)),
                  image_width:view.width,image_height:view.height,orientation_epoch:view.orientationEpoch,
                  ...(pointState.reviewed_point_crops_ready===true?{
                    target_region:existing.clear.target,landmark_region:existing.clear.landmark,
                  }:{}),
                },requestID,undefined,captureRelease,signal,{systemSearchCommandID:view.shortcut});
                reason="SPOTLIGHT_CLEAR_UNCONFIRMED";
                const challenge=await requestReview("after_clear",false,pointState.focused_text_linked_after_ready===true);
                if(challenge)return result(challenge);
              }
            }
          } else {
            const focus=focusArguments(verdict,view.frame,query);
            if(focus&&!signal.aborted&&this.engine.now()<view.expires) {
              const typed=await this.mouse.enqueueSpotlightObserved(user,{
                ...focus,device_id:device,source_after_command_id:view.command,idempotency_key:queryKey(id),
              },requestID,true,{
                signal,modelReviewedFieldSource:{frameID:view.frame,contentSHA256:view.sha256},registerRelease:captureRelease,
                ...(view.stage==="after_clear"?{requireOriginalSearchClear:{shortcutID:view.shortcut}}:{requireOriginalSystemSearch:true}),
              });
              observation=typed;
              reason=typed.state==="board_acked"?null:"APP_SEARCH_QUERY_UNCONFIRMED";
              const challenge=await requestReview("query_results");
              if(challenge)return result(challenge);
            }
          }
        }
      }
    } catch(error) {
      reason=error instanceof BridgeError?error.code:"APP_SEARCH_QUERY_UNAVAILABLE";
    }
    await this.finish(user,id,reason);
    return result();
  }

  async run(user: User, args: Record<string, unknown>, requestID: string, requestSignal: AbortSignal,
    registerRelease?: (value:ClickAfterReleaseRecovery)=>void) {
    const reviewer=this.review;
    need(reviewer,"APP_SEARCH_VISION_UNAVAILABLE",409);
    const {id,device,source,proof,query,digest}=await this.input(args);
    const signal=AbortSignal.any([requestSignal,AbortSignal.timeout(runBudgetMS)]);
    need(!signal.aborted,"APP_SEARCH_QUERY_CANCELLED",409);
    const created=await this.create(user,id,device,digest,this.engine.now());
    if (!created) {
      const previous=await this.original(user,id);
      if(!previous)return this.busy(user,device,digest);
      need(previous.digest===digest,"IDEMPOTENCY_CONFLICT");
      // Duplicate deliveries only read original state. A stopped or crashed
      // request cannot regain keyboard authority by repeating the parent ID.
      return this.get(user,id,true,requestID,signal,registerRelease);
    }
    const summary={preparation_id:id,device_id:device,app_effect_observed:false};
    let reason:string|null="APP_SEARCH_QUERY_CANCELLED";
    let shortcut:Awaited<ReturnType<MouseControl["enqueueObserved"]>>|undefined;
    let clear:Awaited<ReturnType<MouseControl["clickAt"]>>|undefined;
    let typed:Awaited<ReturnType<MouseControl["enqueueSpotlightObserved"]>>|undefined;
    let shortcutRelease:ClickAfterReleaseRecovery|undefined;
    let clearRelease:ClickAfterReleaseRecovery|undefined;
    let typedRelease:ClickAfterReleaseRecovery|undefined;
    let reviewedQueryFrame:string|undefined;
    let extendedModelField=false;
    try {
      if (!signal.aborted) {
        let shortcutDeadline:ImageObservationDeadline|undefined;
        shortcut=await this.mouse.enqueueObserved(user,SYSTEM_SEARCH_KIND,{
          device_id:device,idempotency_key:shortcutKey(id),
          ...(source===undefined?{}:{source_frame_id:source}),
          ...(proof===undefined?{}:{source_view_proof:proof}),
        },requestID,{signal,cancelSystemSearchBeforeAdmission:true,onExtendedModelField:()=>{extendedModelField=true;},registerRelease:value=>{
          shortcutRelease=value;
          shortcutDeadline=value.observationDeadline;
        }});
        reason="SPOTLIGHT_AFTER_IMAGE_UNAVAILABLE";
        const observation=shortcut.after_screen;
        if (shortcut.state==="board_acked"&&observation.state==="available"&&shortcut.image&&!signal.aborted) {
          let frame=uuid(record(observation.metadata).frame_id);
          const {observationRemaining:initialWindow,signal:reviewSignal}=
            focusReviewWindow(signal,observation,shortcutDeadline,this.engine.now(),extendedModelField);
          reason="SPOTLIGHT_FOCUS_UNVERIFIED";
          let verdict=initialWindow>0?await reviewWithin(reviewer,shortcut.image,reviewSignal,{phase:"focus",query}):null;
          if (transitionVerdict(verdict)&&!reviewSignal.aborted) {
            const proof=record(observation.after_command),gap=Number(proof.lower_gap_ms);
            verdict=null;
            const relook=focusRelookSignal(reviewSignal,shortcutDeadline);
            if (relook&&Number.isFinite(gap)&&gap>=0&&Math.ceil(gap)<clickRelookMaxGapMS) {
              let laterRelease:ClickAfterReleaseRecovery|undefined;
              const later=await this.mouse.getSpotlightObserved(user,shortcut.command_id,requestID,{
                signal:relook,afterCommandMinGapMS:Math.ceil(gap),registerRelease:value=>{laterRelease=value;},
              });
              if (later.after_screen.state==="available"&&later.image&&!relook.aborted) {
                const laterFrame=uuid(record(later.after_screen.metadata).frame_id);
                if (laterFrame!==frame) {
                  shortcut=later;
                  shortcutRelease=laterRelease;
                  frame=laterFrame;
                  verdict=await reviewWithin(reviewer,later.image,reviewSignal,{phase:"focus",query});
                }
              }
            }
          }
          const approved=verdict!==null&&!reviewSignal.aborted&&!signal.aborted;
          const existing=approved?visibleQuery(verdict,frame,query):null;
          let focus=approved&&existing===null?focusArguments(verdict,frame,query):null;
          if (existing?.text.toLowerCase()===query.toLowerCase()) {
            reason=reviewedExistingQuery;
            reviewedQueryFrame=frame;
          } else if (existing) {
            reason="SPOTLIGHT_EXISTING_QUERY";
            if (existing.clear) {
              const geometry=record(shortcut.after_screen.metadata);
              const width=integer(geometry.width,2,8192), height=integer(geometry.height,2,8192);
              const pointState=await this.mouse.status(user,{device_id:device});
              clear=await this.mouse.clickAt(user,{
                device_id:device,source_frame_id:frame,idempotency_key:clearKey(id),
                x:Math.round(existing.clear.x*(width-1)),y:Math.round(existing.clear.y*(height-1)),
                image_width:width,image_height:height,orientation_epoch:integer(geometry.orientation_epoch,0,Number.MAX_SAFE_INTEGER),
                ...(pointState.reviewed_point_crops_ready===true?{
                  target_region:existing.clear.target,landmark_region:existing.clear.landmark,
                }:{}),
              },requestID,undefined,value=>{clearRelease=value;},signal,{systemSearchCommandID:shortcut.command_id});
              reason="SPOTLIGHT_CLEAR_UNCONFIRMED";
              if (clear.state==="board_acked"&&clear.kind==="pointer.click"&&clear.after_screen.state==="available"&&clear.image) {
                let clearFrame=uuid(record(clear.after_screen.metadata).frame_id);
                const clearDeadline=clearRelease?.observationDeadline;
                const {observationRemaining:window,signal:clearReview}=
                  focusReviewWindow(signal,clear.after_screen,clearDeadline,this.engine.now(),extendedModelField);
                reason="SPOTLIGHT_FOCUS_AFTER_CLEAR_UNVERIFIED";
                let cleared=window>0?await reviewWithin(reviewer,clear.image,clearReview,{phase:"focus",query}):null;
                if (transitionVerdict(cleared)&&!clearReview.aborted) {
                  const gap=Number(record(clear.after_screen.after_command).lower_gap_ms);
                  cleared=null;
                  const relook=focusRelookSignal(clearReview,clearDeadline);
                  if (relook&&Number.isFinite(gap)&&gap>=0&&Math.ceil(gap)<clickRelookMaxGapMS) {
                    let laterRelease:ClickAfterReleaseRecovery|undefined;
                    const later=await this.mouse.getSpotlightObserved(user,clear.command_id,requestID,{
                      signal:relook,afterCommandMinGapMS:Math.ceil(gap),registerRelease:value=>{laterRelease=value;},
                    });
                    if (later.after_screen.state==="available"&&later.image&&!relook.aborted) {
                      const frameID=uuid(record(later.after_screen.metadata).frame_id);
                      if (frameID!==clearFrame) {
                        clear={...clear,after_screen:later.after_screen,image:later.image};
                        clearRelease=laterRelease;
                        clearFrame=frameID;
                        cleared=await reviewWithin(reviewer,later.image,clearReview,{phase:"focus",query});
                      }
                    }
                  }
                }
                if (!clearReview.aborted)focus=focusArguments(cleared,clearFrame,query);
              }
            }
          }
          if (focus&&!signal.aborted) {
            const reviewedImage=clear?.image??shortcut.image;
            need(reviewedImage,"SPOTLIGHT_AFTER_IMAGE_UNAVAILABLE");
            const modelReviewedFieldSource={frameID:focus.source_frame_id,contentSHA256:await hash(Buffer.from(reviewedImage,"base64"))};
            reason="APP_SEARCH_QUERY_UNCONFIRMED";
            typed=await this.mouse.enqueueSpotlightObserved(user,{
              ...focus,device_id:device,source_after_command_id:clear?.command_id??shortcut.command_id,idempotency_key:queryKey(id),
            },requestID,true,{
              signal,modelReviewedFieldSource,registerRelease:value=>{typedRelease=value;},
              ...(clear?{requireOriginalSearchClear:{shortcutID:shortcut.command_id}}:{requireOriginalSystemSearch:true}),
            });
            if (typed.state==="board_acked") reason=null;
          }
        }
      }
    } catch(error) {
      reason=error instanceof BridgeError?error.code:"APP_SEARCH_QUERY_UNAVAILABLE";
      await this.finish(user,id,reason);
      // Admission can fail after committing a child. Return its durable ID
      // without allowing this or a retry to resume the workflow.
      return this.get(user,id,false,requestID,signal);
    }
    const existing=reason===reviewedExistingQuery,final=typed??clear??shortcut;
    let release=typed?typedRelease:clear?clearRelease:shortcutRelease;
    const reviewCandidate=typed?.state==="board_acked"?typed:existing?shortcut:undefined;
    const checked=reviewCandidate?await this.reviewQueryResults(user,query,requestID,reviewer,signal,reviewCandidate,release):undefined;
    if(checked){
      release=checked.release;
      if(existing)reviewedQueryFrame=checked.visibleFrame??reviewedQueryFrame;
    }
    await this.finish(user,id,reason);
    if (release) registerRelease?.(release);
    return {
      ...summary, state:reason===null?"query_confirmed":existing?"query_visible":final&&unconfirmed.has(final.state)?"outcome_unknown":"stopped",
      reason:existing?null:reason,
      reviewed_query_frame_id:reviewedQueryFrame,
      query_results_state:checked?.readyFrame?"ready":reviewCandidate?"pending":"not_checked",
      query_results_frame_id:checked?.readyFrame,
      query_results_content_sha256:checked?.readySHA,
      compound_query_proof_allowed:existing||typed?.state==="board_acked"&&typed.text_input?.transport==="stable_usb",
      shortcut_command_id:shortcut?.command_id??null, shortcut_state:shortcut?.state??null,
      clear_command_id:clear?.command_id??null, clear_state:clear?.state??null,
      text_command_id:typed?.command_id??null, text_state:typed?.state??null,
      after_screen:checked?.after_screen??final?.after_screen??{state:"unavailable"}, kind:final?.kind,
      image:checked?checked.image:final?.image,
    };
  }
}
