import {relativeDragCorrection} from "./absolute-drag.ts";
type Metric = { calls: number; sum_ms: number; failures: number };
export type McpPerformanceOptions = { now?: () => number; log?: (value: Record<string, unknown>) => void };
const rounded = (value: number) => Math.round(Math.max(0, value) * 100) / 100;

/** Request-local diagnostics. Never records arguments, SQL, storage keys or identities. */
export class McpPerformance {
  readonly requestID = crypto.randomUUID();
  private clock: () => number;
  private log: (value: Record<string, unknown>) => void;
  private started: number;
  private toolStarted?: number;
  private metrics: Record<string, Metric> = {};
  private databases = new WeakMap<object, D1Database>();
  private statements = new WeakMap<object, D1PreparedStatement>();
  private buckets = new WeakMap<object, R2Bucket>();
  private engines = new WeakMap<object, object>();
  private rpc = "unknown";
  private tool = "none";
  private failed = false;
  private responseBytes: number | null = null;
  constructor(options: McpPerformanceOptions = {}) {
    this.clock = options.now ?? (() => performance.now());
    this.log = options.log ?? (value => console.info(JSON.stringify(value)));
    this.started = this.clock();
  }
  identify(method: unknown, tool: unknown, knownTools: readonly string[]) {
    this.rpc = ["server/discover", "initialize", "ping", "tools/list", "tools/call", "resources/list", "resources/read"].includes(String(method)) ? String(method) : "unknown";
    this.tool = knownTools.includes(String(tool)) ? String(tool) : method === "tools/call" ? "unknown" : "none";
    if (method === "tools/call") this.toolStarted = this.clock();
  }
  private mark(name: string, started: number, failed = false) {
    const metric = this.metrics[name] ??= { calls: 0, sum_ms: 0, failures: 0 };
    metric.calls++; metric.sum_ms += Math.max(0, this.clock() - started); metric.failures += Number(failed);
  }
  sync<T>(name: string, action: () => T): T {
    const started = this.clock();
    try { const value = action(); this.mark(name, started); return value; }
    catch (error) { this.mark(name, started, true); throw error; }
  }
  async measure<T>(name: string, action: () => Promise<T>): Promise<T> {
    const started = this.clock();
    try { const value = await action(); this.mark(name, started); return value; }
    catch (error) { this.mark(name, started, true); throw error; }
  }
  endTool(failed = false) {
    this.failed ||= failed;
    if (this.toolStarted != null) { this.mark("dispatch", this.toolStarted, failed); this.toolStarted = undefined; }
  }
  journalSnapshot() { return {rpc:this.rpc,tool:this.tool,...this.snapshot()}; }
  snapshot() {
    return { request_id: this.requestID, server_elapsed_ms: rounded(this.clock() - this.started),
      metrics: Object.fromEntries(Object.entries(this.metrics).map(([name, m]) => [name, { ...m, sum_ms: rounded(m.sum_ms) }])) };
  }
  database(db: D1Database): D1Database {
    const prior = this.databases.get(db); if (prior) return prior;
    const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
      const result = new Proxy(statement, { get: (target, key) => {
        const value = Reflect.get(target, key, target);
        if (key === "bind") return (...args: unknown[]) => wrap(target.bind(...args));
        if (["first", "all", "run", "raw"].includes(String(key))) return (...args: unknown[]) => this.measure("d1", () => Reflect.apply(value, target, args) as Promise<unknown>);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      this.statements.set(result, statement); return result;
    };
    const result = new Proxy(db, { get: (target, key) => {
      if (key === "prepare") return (sql: string) => wrap(target.prepare(sql));
      if (key === "batch") return (items: D1PreparedStatement[]) => this.measure("d1", () => target.batch(items.map(item => this.statements.get(item) ?? item)));
      const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
    } });
    this.databases.set(db, result); return result;
  }
  bucket(bucket: R2Bucket): R2Bucket {
    const prior = this.buckets.get(bucket); if (prior) return prior;
    const result = new Proxy(bucket, { get: (target, key) => {
      const value = Reflect.get(target, key, target);
      if (["get", "head", "put", "delete", "list"].includes(String(key))) return async (...args: unknown[]) => {
        const reply = await this.measure("r2", () => Reflect.apply(value, target, args) as Promise<unknown>);
        if (key !== "get" || !reply || typeof reply !== "object" || !("arrayBuffer" in reply) || typeof reply.arrayBuffer !== "function") return reply;
        return new Proxy(reply as R2ObjectBody, { get: (body, field) => {
          const item = Reflect.get(body, field, body);
          if (field === "arrayBuffer") return () => this.measure("r2_body", () => body.arrayBuffer());
          return typeof item === "function" ? item.bind(body) : item;
        } });
      };
      return typeof value === "function" ? value.bind(target) : value;
    } });
    this.buckets.set(bucket, result); return result;
  }
  engine<T extends { db: D1Database; bucket: R2Bucket }>(engine: T): T {
    const prior = this.engines.get(engine); if (prior) return prior as T;
    const result = new Proxy(engine, { get: (target, key, receiver) => key === "db" ? this.database(target.db) : key === "bucket" ? this.bucket(target.bucket) : Reflect.get(target, key, receiver) });
    this.engines.set(engine, result); return result;
  }
  json(value: unknown, status = 200) {
    const bytes = this.sync("serialize", () => new TextEncoder().encode(JSON.stringify(value)));
    this.responseBytes = bytes.byteLength;
    return new Response(bytes, { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }
  responseTiming(response:Response,snapshot=this.snapshot()) {
    const m=snapshot.metrics,late=m.late_image_release_retry;
    response.headers.set("X-SaySo-Request-ID", this.requestID);
    response.headers.set("Server-Timing", `sb_total;dur=${snapshot.server_elapsed_ms}, sb_d1;dur=${m.d1?.sum_ms ?? 0};desc="sum of ${m.d1?.calls ?? 0} calls", sb_r2;dur=${m.r2?.sum_ms ?? 0};desc="sum of ${m.r2?.calls ?? 0} calls", sb_summary_encode;dur=${m.summary_serialize?.sum_ms ?? 0}, sb_response_encode;dur=${m.serialize?.sum_ms ?? 0}${late?`, sb_late_release_retry;dur=${late.sum_ms}`:""}`);
    return response;
  }
  finish(response?: Response) {
    this.endTool(!response || response.status >= 400);
    const snapshot = this.snapshot();
    if(response)this.responseTiming(response,snapshot);
    try { this.log({ event: "mcp_request", rpc: this.rpc, tool: this.tool, outcome: this.failed ? "error" : "ok", ...snapshot, response_bytes: this.responseBytes }); }
    catch { /* Diagnostic delivery cannot change the tool's result. */ }
    return response;
  }
}

function compactPointImageMetadata(value:unknown) {
  if(!value||typeof value!=="object"||Array.isArray(value))return undefined;
  const metadata=value as Record<string,unknown>;
  const keys=["device_id","frame_id","width","height","orientation_epoch"];
  return keys.every(key=>Object.hasOwn(metadata,key))?
    Object.fromEntries(keys.map(key=>[key,metadata[key]])):undefined;
}

export type DeliveredActionImage = "command"|"plan"|"preparation"|"browse";
function compactScopedImageMetadata(value:unknown) {
  const geometry=compactPointImageMetadata(value);
  if(!geometry)return;
  const metadata=value as Record<string,unknown>;
  const scope=["bridge_session_id","broadcast_id","worker_id","worker_id_at_read","lease_epoch","control_epoch_at_read",
    "orientation","frame_seq","source_seq","age_ms","capture_clock_verified","capture_lower_phone_mono_ms"];
  return {...geometry,...Object.fromEntries(scope.filter(key=>Object.hasOwn(metadata,key)).map(key=>[key,metadata[key]]))};
}
function compactActionImage(value:Record<string,unknown>,kind:"command"|"plan"|"preparation") {
  if(!value.after_screen||typeof value.after_screen!=="object")return;
  const after=value.after_screen as Record<string,unknown>,metadata=compactScopedImageMetadata(after.metadata);
  if(after.state!=="available"||!metadata||
     typeof value.device_id==="string"&&metadata.device_id!==value.device_id||
     typeof value.bridge_session_id==="string"&&metadata.bridge_session_id!==value.bridge_session_id)return;
  const image={state:"available",metadata};
  if(kind==="plan")return value.state==="succeeded"&&typeof value.plan_id==="string"&&
    value.verification==="phone_pixel_effect_and_sites_acceptance"?image:undefined;
  if(kind==="preparation"){
    if(typeof value.preparation_id!=="string"||value.state==="outcome_unknown")return;
    if(after.relation==="current_preparation_image")return {...image,relation:after.relation};
    if(after.relation==="capture_after_original_child_ack"&&typeof after.child_command_id==="string"&&
       typeof after.phone_ack_mono_ms==="number"&&Number.isFinite(after.phone_ack_mono_ms))
      return {...image,relation:after.relation,child_command_id:after.child_command_id,phone_ack_mono_ms:after.phone_ack_mono_ms};
    return;
  }
  if(value.state!=="board_acked"||typeof value.command_id!=="string"||!after.after_command||
     typeof after.after_command!=="object")return;
  const order=after.after_command as Record<string,unknown>;
  if(order.command_id!==value.command_id||order.relation!=="capture_after_phone_board_ack"||
     order.scope_matches_at_snapshot!==true||order.command_state!=="board_acked"||
     metadata.capture_clock_verified!==true||typeof order.lower_gap_ms!=="number"||
     !Number.isFinite(order.lower_gap_ms)||order.lower_gap_ms<=0)return;
  const timing=["command_id","command_state","relation","scope_matches_at_snapshot","phone_clock",
    "phone_ack_mono_ms","capture_lower_phone_mono_ms","lower_gap_ms","minimum_gap_ms"];
  const proofs=["source_field_proof","source_query_proof","source_point_proof"];
  return {...image,
    after_command:Object.fromEntries(timing.filter(key=>Object.hasOwn(order,key)).map(key=>[key,order[key]])),
    ...Object.fromEntries(proofs.filter(key=>typeof after[key]==="string").map(key=>[key,after[key]]))};
}

/** Full fields remain in structuredContent; legacy peers retain full JSON text. */
export function compactMcpSummary(value: Record<string, unknown>, includeNativeTiming = false, includeClick = false,
  includeParkedMoveImage = false, includeVisualClickSource = false, includeConfirmedClickRelook = false, includeFocusedAfterImage = false,
  searchResult? : {hasImage:boolean}, deliveredActionImage?:DeliveredActionImage) {
  const fields = ["invalid_arguments","selector_fallback_reason","selector_fallback","selector_notice","privacy_storage_ready","retention_details_redacted","verification","source_age_ms","screen_changed_since_source","source_observed_at_server_utc_ms","signing_available","input_control_enabled","cloud_image_cleared","system_broadcast_stop_confirmed","stopped_sessions","failed_sessions","already_stopped","board_release_confirmed","screen_sharing_stopped","scope","image_handoff", "interaction_policy_version", "after_image_instruction", "mcp_request_id", "state", "image_ref", "runtime_version", "image_blocks", "pre_age_server_ms_lower", "error", "command_id", "run_id", "plan_id", "preparation_id", "revision", "checkpoint_seq", "pending_steps", "remaining_slots", "enabled", "online", "grant_remaining_ms", "drag_at_ready", "input_not_submitted", "focused_text_no_visual_ready", "focused_text_submit_enter_ready", "focused_text_clear_before_input_ready", "stopped", "observation_state", "image_state"];
  const summary = Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
  Object.assign(summary,relativeDragCorrection(value));
  if(value.reason==="CLICK_AT_RECEIPT_NOT_FOUND"&&value.lookup_found===false){
    for(const key of ["reason","lookup_found","move_record_found","click_record_found"])
      if(Object.hasOwn(value,key))summary[key]=value[key];
  }
  if(value.input_not_submitted===true&&
     ["REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED","REVIEWED_POINT_NOT_READY","DRAG_FRAME_OR_CONTROL_CHANGED"].includes(String(value.error))&&
     value.admission_diagnostic&&typeof value.admission_diagnostic==="object"){
    const detail=value.admission_diagnostic as Record<string,unknown>;
    const fields=["diagnostic_timing","source_frame_id","source_age_ms","current_head_age_ms","visual_proof_resolved","visual_proof_lookup","conditions",
      "coordinate_space","coordinates","snapshot"];
    summary.admission_diagnostic=Object.fromEntries(fields.filter(key=>Object.hasOwn(detail,key)).map(key=>[key,detail[key]]));
    summary.input_not_submitted=true;
  }
  if(searchResult){
    for(const key of ["preparation_id","device_id","reason","can_resume","retry_after_ms","active_preparation_id",
      "shortcut_command_id","shortcut_state","text_command_id","text_state","query_results_state","review_frame_id"])
      if(Object.hasOwn(value,key))summary[key]=value[key];
    if(value.relook_focus_available===true)summary.relook_focus_available=true;
    if(searchResult.hasImage&&value.after_screen&&typeof value.after_screen==="object"){
      const after=value.after_screen as Record<string,unknown>,metadata=compactPointImageMetadata(after.metadata);
      const command=after.after_command as Record<string,unknown>|undefined;
      if(after.state==="available"&&metadata&&command){
        summary.after_screen={state:"available",metadata,
          after_command:{command_id:command.command_id,lower_gap_ms:command.lower_gap_ms}};
        if(value.state==="review_required"&&value.review_frame_id===metadata.frame_id&&typeof value.review_frame_id==="string"){
          summary.review_frame_id=value.review_frame_id;
          summary.search_app_review={preparation_id:value.preparation_id,device_id:value.device_id,review_frame_id:value.review_frame_id};
          if(value.review_image)summary.review_image=value.review_image;
        }
        if((value.state==="query_confirmed"||value.state==="query_visible")&&typeof after.source_query_proof==="string")
          summary.click_at_source={source_frame_id:metadata.frame_id,device_id:metadata.device_id,image_width:metadata.width,
            image_height:metadata.height,orientation_epoch:metadata.orientation_epoch,source_query_proof:after.source_query_proof};
      }
    }
  }
  if(searchResult&&summary.relook_focus_available===true)
    summary.review_image_instruction="If the focus image is missing, invisible or in transition, call get_app_search_query_result once with this preparation_id and relook_focus=true.";
  // Some hosts forward only image/text blocks, not structuredContent. Carry
  // the identifiers and opaque proof needed to click this exact actual JPEG.
  if(value.state==="available"&&(includeVisualClickSource||value.image_blocks===1)&&typeof value.source_point_proof==="string"){
    const metadata=compactPointImageMetadata(value.metadata);
    if(metadata&&includeVisualClickSource){
      delete summary.image_ref;
      delete summary.mcp_request_id;
      summary.click_at_source={source_frame_id:metadata.frame_id,device_id:metadata.device_id,
        image_width:metadata.width,image_height:metadata.height,orientation_epoch:metadata.orientation_epoch,
        source_point_proof:value.source_point_proof};
      summary.click_at_instruction="Copy this exact source and its geometry. Select original-image pixel x and y from the actual visible target; never substitute placeholder coordinates. T6 irreversible final actions use move_mouse_to and user handoff instead. Unknown input uses original-ID recovery, never replay.";
    }else if(metadata){summary.metadata=metadata;summary.source_point_proof=value.source_point_proof;}
  }
  if(includeClick&&typeof value.click_command_id==="string"&&value.click_command_id===value.command_id){
    summary.click_command_id=value.click_command_id;
    if(typeof value.move_command_id==="string")summary.move_command_id=value.move_command_id;
    if(value.click_submitted===true||value.click_submitted===false||value.click_submitted===null)
      summary.click_submitted=value.click_submitted;
    if(value.state==="failed"&&value.input_not_submitted===true)summary.input_not_submitted=true;
    if(value.state==="failed"&&value.error==="POINT_CLICK_NOT_SUBMITTED"&&value.input_not_submitted===true&&
       value.click_submitted===false&&typeof value.move_command_id==="string"){
      const move=value.move_result as Record<string,unknown>|undefined;
      if(move?.command_id===value.move_command_id&&["failed","outcome_unknown","board_acked"].includes(String(move.state))){
        summary.move_result={state:move.state,
          ...(typeof move.error==="string"&&move.error.length<=120?{error:move.error}:{}),
          ...(typeof move.input_attempted==="boolean"?{input_attempted:move.input_attempted}:{})};
      }
      summary.click_at_instruction="The click was not submitted. Check the original move separately by move_command_id with get_mouse_result; a signed move receipt confirms this command. Use the original click_command_id for click status. Use only these read-only queries for uncertain input.";
    }
  }
  if(includeParkedMoveImage&&value.workflow_state==="review_required"&&value.state==="failed"&&
     value.error==="POINT_CLICK_NOT_SUBMITTED"&&value.click_at_source&&value.after_screen&&typeof value.after_screen==="object"){
    const after=value.after_screen as Record<string,unknown>,metadata=compactPointImageMetadata(after.metadata);
    if(after.state==="available"&&after.reason==="REVIEW_POINT_AGAIN"&&metadata&&typeof after.source_point_proof==="string"){
      summary.workflow_state="review_required";
      summary.after_screen={state:"available",reason:"REVIEW_POINT_AGAIN",metadata,after_command:null};
      summary.click_at_source=value.click_at_source;
      summary.click_at_instruction="Copy this exact source and its geometry. Select original-image pixel x and y from the actual visible target; never substitute placeholder coordinates. T6 irreversible final actions use move_mouse_to and user handoff instead. Unknown input uses original-ID recovery, never replay.";
    }
  }
  if((includeClick&&includeParkedMoveImage||includeConfirmedClickRelook&&value.kind==="pointer.click")&&value.state==="board_acked"&&
     value.after_screen&&typeof value.after_screen==="object"){
    const after=value.after_screen as Record<string,unknown>,metadata=compactPointImageMetadata(after.metadata);
    const command=after.after_command as Record<string,unknown>|null|undefined;
    if(after.state==="available"&&metadata&&command&&command.command_id===value.command_id&&
      typeof command.lower_gap_ms==="number"&&Number.isFinite(command.lower_gap_ms)){
      summary.after_screen={state:"available",metadata,
        after_command:{command_id:command.command_id,lower_gap_ms:command.lower_gap_ms},
        ...(typeof after.source_field_proof==="string"?{source_field_proof:after.source_field_proof}:{})};
    }
  }
  if(value.kind==="keyboard.open_search"&&value.state==="board_acked"&&value.focus_image&&
     typeof value.command_id==="string"&&value.after_screen&&typeof value.after_screen==="object"){
    const after=value.after_screen as Record<string,unknown>,metadata=compactPointImageMetadata(after.metadata);
    const command=after.after_command as Record<string,unknown>|undefined;
    if(after.state==="available"&&metadata&&command?.command_id===value.command_id){
      summary.focus_image=value.focus_image;
      summary.after_screen={state:"available",metadata,after_command:{command_id:command.command_id,lower_gap_ms:command.lower_gap_ms},
        ...(typeof after.source_field_proof==="string"?{source_field_proof:after.source_field_proof}:{})};
    }
  }
  if(typeof value.recovery_click_command_id==="string")summary.recovery_click_command_id=value.recovery_click_command_id;
  if(includeFocusedAfterImage&&value.state==="board_acked"&&value.after_screen&&typeof value.after_screen==="object"){
    const after=value.after_screen as Record<string,unknown>,metadata=compactPointImageMetadata(after.metadata);
    const command=after.after_command as Record<string,unknown>|null|undefined;
    const typed=value.text_input as Record<string,unknown>|null|undefined;
    if(after.state==="available"&&metadata&&command&&typeof value.command_id==="string"&&command.command_id===value.command_id&&
       typeof command.lower_gap_ms==="number"&&Number.isFinite(command.lower_gap_ms)){
      summary.enter_sent=typed?.enter_sent===true;
      if(typed?.clear_sent===true)summary.clear_sent=true;
      const precondition=value.precondition as Record<string,unknown>|null|undefined;
      if(precondition?.field_input_validation==="no_visual_v1")summary.after_screen={state:"available",metadata,
        after_command:{command_id:command.command_id,lower_gap_ms:command.lower_gap_ms}};
      if(summary.enter_sent===false&&typeof after.source_query_proof==="string"){
        delete summary.image_ref;
        delete summary.mcp_request_id;
        summary.click_at_source={source_frame_id:metadata.frame_id,device_id:metadata.device_id,
          image_width:metadata.width,image_height:metadata.height,orientation_epoch:metadata.orientation_epoch,
          source_query_proof:after.source_query_proof};
        summary.click_at_instruction="Copy this exact source and its geometry. Select original-image pixel x and y from the actual visible target; never substitute placeholder coordinates. T6 irreversible final actions use move_mouse_to and user handoff instead. Unknown input uses original-ID recovery, never replay.";
      }
    }
  }
  if(deliveredActionImage==="browse"&&value.image_state==="available"&&typeof value.run_id==="string"){
    const metadata=compactScopedImageMetadata(value.image_metadata);
    if(metadata)summary.image_metadata=metadata;
  }else if(deliveredActionImage&&deliveredActionImage!=="browse"&&!summary.after_screen){
    const observed=compactActionImage(value,deliveredActionImage);
    if(observed)summary.after_screen=observed;
  }
  if(deliveredActionImage==="command"&&!summary.click_at_source){
    const observed=compactActionImage(value,"command");
    if(observed&&"source_point_proof" in observed&&typeof observed.source_point_proof==="string"){
      const m=observed.metadata;
      summary.click_at_source={device_id:m.device_id,source_frame_id:m.frame_id,
        image_width:m.width,image_height:m.height,orientation_epoch:m.orientation_epoch,
        source_point_proof:observed.source_point_proof};
      summary.click_at_instruction="Copy this exact source and its geometry. Select original-image pixel x and y from the actual visible target; never substitute placeholder coordinates. T6 irreversible final actions use move_mouse_to and user handoff instead. Unknown input uses original-ID recovery, never replay.";
      // Keep the long opaque point proof once in model text. Full structured
      // metadata remains unchanged for existing clients and other input kinds.
      if(summary.after_screen&&typeof summary.after_screen==="object"){
        const {source_point_proof:_point,...rest}=summary.after_screen as Record<string,unknown>;
        summary.after_screen=rest;
      }
    }
  }
  // Only the read-screen caller opts in. Never copy the entire internal trace
  // or change other compact tool responses to ship their diagnostics.
  const trace=value.trace;
  if(includeNativeTiming&&trace&&typeof trace==="object"&&!Array.isArray(trace)){
    const timing=(trace as Record<string,unknown>).native_transport;
    if(timing&&typeof timing==="object"&&!Array.isArray(timing)){
      const safe=timing as Record<string,unknown>;
      const timingFields=["request_id","timing_point","handler_elapsed_ms_at_result","d1_calls","d1_sum_ms","d1_timing",
        "worker_placement","worker_fetch_started_utc_ms","worker_fetch_to_handler_ms","handler_started_utc_ms",
        "frame_age_reported_at_server_utc_ms","image_payload","serialization_phase"];
      summary.trace={native_transport:Object.fromEntries(timingFields.filter(key=>Object.hasOwn(safe,key)).map(key=>[key,safe[key]]))};
    }
  }
  // Only current click_at input fields may be advertised as a reusable argument tuple.
  if(summary.click_at_source&&typeof summary.click_at_source==="object"){
    const allowed=new Set(["device_id","source_frame_id","image_width","image_height","orientation_epoch","source_point_proof"]);
    summary.click_at_source=Object.fromEntries(Object.entries(summary.click_at_source).filter(([key])=>allowed.has(key)));
  }
  return JSON.stringify(summary);
}
export function compactBrowseProjection(value: Record<string, unknown>) {
  const observation = value.observation;
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) return value;
  const source = observation as Record<string, unknown>;
  if (source.projection !== true || !Array.isArray(source.blocks)) return value;
  const reduced = { ...source }; delete reduced.text;
  return { ...value, observation: reduced };
}
