import {workerFetchStartedUTC,workerFetchStartedMono} from "./bridge-context.ts";
import {debugObject as obj,debugNumber as num,debugUUID as uuid,getDebugScope} from "./debug-scope.ts";
import type {McpPerformance} from "./mcp-performance.ts";

/** Only typed correlation keys. Never persist arbitrary request headers or MCP metadata. */
export function upstreamCorrelation(request:Request) {
  const raw=request.headers.get("traceparent"),match=raw?.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i);
  const traceparent=match&&!/^0+$/.test(match[1])&&!/^0+$/.test(match[2])?raw!.toLowerCase():null;
  const upstream=uuid(request.headers.get("x-request-id"));
  return {traceparent,upstream_request_id:upstream,
    upstream_missing_reason:traceparent||upstream?null:"absent_or_not_allowlisted",
    host_spans_missing_reason:"host_delivery_generation_dispatch_not_exposed"};
}
export function releaseBoundary(request:Request,handlerUTC:number,handlerMono:number) {
  const releasedUTC=Date.now(),releasedMono=performance.now(),fetchUTC=workerFetchStartedUTC(),fetchMono=workerFetchStartedMono();
  return {fetch_utc_ms:num(fetchUTC),handler_utc_ms:handlerUTC,released_utc_ms:releasedUTC,
    handler_to_release_ms:Math.max(0,releasedMono-handlerMono),
    boundary_elapsed_ms:fetchMono!==undefined?Math.max(0,releasedMono-fetchMono):null,
    boundary_source:fetchMono!==undefined?"fetch_monotonic":"handler_monotonic_fetch_missing",
    server_clock_domain:"worker_request_monotonic.v1",cross_instance_utc_uncertainty_ms:null,
    ...upstreamCorrelation(request)};
}
export async function enrichBoundaries(db:D1Database,trace:McpPerformance,data:Record<string,unknown>) {
  const scope=getDebugScope(trace),devices=data.scope_device_ids;
  if(!scope||!Array.isArray(devices)||devices.length!==1)return;
  const command=uuid(data.command_id)??scope.command;
  let commandSession:string|null=null;
  if(command){
    const row=await db.prepare("SELECT id,predecessor_id,created_at,precondition,session_id,event_clock FROM sb_mouse_commands WHERE id=? AND owner_id=? AND device_id=?")
      .bind(command,scope.owner,devices[0]).first<{id:string;predecessor_id:string|null;created_at:number;precondition:string;session_id:string;event_clock:string|null}>();
    if(row){const pre=obj(JSON.parse(row.precondition||"{}")),point=obj(pre.point);
      commandSession=uuid(row.session_id);
      if(!uuid(obj(data.event_clock).clock_domain_id)&&row.event_clock){
        const clock=obj(JSON.parse(row.event_clock));
        data.event_clock=Object.fromEntries(["device_id","bridge_session_id","broadcast_id","clock_domain_id","worker_id"].map(k=>[k,uuid(clock[k])]));
        data.clock_domain_source="command_record";
      }
      Object.assign(data,{command_id:row.id,parent_command_id:uuid(row.predecessor_id),
        child_command_id:uuid(point.click_command_id),enqueued_utc_ms:num(row.created_at)});}
  }
  const session=uuid(obj(data.event_clock).bridge_session_id)??commandSession??uuid(obj((data.device_states as unknown[])?.[0]).session_id);
  data.session_id=session;data.device_id=uuid(devices[0]);
  if(session){
    const row=await db.prepare("SELECT broadcast_id,event_clock FROM sb_sessions WHERE id=? AND owner_id=? AND device_id=?")
      .bind(session,scope.owner,devices[0]).first<{broadcast_id:string;event_clock:string|null}>();
    data.broadcast_id=uuid(row?.broadcast_id);
    if(!uuid(obj(data.event_clock).clock_domain_id)&&row?.event_clock){
      const clock=obj(JSON.parse(row.event_clock));
      data.event_clock=Object.fromEntries(["device_id","bridge_session_id","broadcast_id","clock_domain_id","worker_id"].map(k=>[k,uuid(clock[k])]));
      data.clock_domain_source="post_response_session_snapshot";
    }
  }
  data.clock_domain_missing_reason=uuid(obj(data.event_clock).clock_domain_id)?null:"session_clock_not_available";
  const prior=await db.prepare(`SELECT data_json FROM sb_timing_journal WHERE received_utc_ms<? AND received_utc_ms>=?
    AND json_extract(data_json,'$.rpc')='tools/call' AND json_extract(data_json,'$.scope_owner_hash')=?
    AND json_extract(data_json,'$.scope_device_ids[0]')=? ORDER BY received_utc_ms DESC,id DESC LIMIT 1`)
    .bind(data.received_utc_ms,Number(data.received_utc_ms)-86400_000,data.scope_owner_hash,devices[0]).first<{data_json:string}>();
  const p=prior?obj(JSON.parse(prior.data_json)):{};
  const previousRelease=num(p.released_utc_ms),currentFetch=num(data.fetch_utc_ms);
  Object.assign(data,{previous_request_id:uuid(p.request_id),previous_link_source:prior?"observed_device_order_not_causality":"missing",
    previous_link_qualified:!!session&&session===uuid(p.session_id)&&previousRelease!==null&&currentFetch!==null&&previousRelease<=currentFetch,
    previous_link_missing_reason:prior?"serial_task_and_user_pause_not_observable":"no_retained_predecessor"});
}

export type PerfSegment={stage:string;duration_ms:number|null;error_ms:number|null;source:string;missing_reason:string|null};
/** Intervals may overlap. UTC differences between Worker/D1 instances have unknown error. */
export function performanceSegments(data:Record<string,unknown>,command:Record<string,unknown>={},frame:Record<string,unknown>={}):PerfSegment[] {
  const delta=(a:unknown,b:unknown)=>num(a)!==null&&num(b)!==null&&Number(b)>=Number(a)?Number(b)-Number(a):null;
  const segment=(stage:string,duration:number|null,source:string,error:number|null,reason="not_recorded"):PerfSegment=>
    ({stage,duration_ms:duration,error_ms:duration===null?null:error,source,missing_reason:duration===null?reason:null});
  return [segment("O_i",num(data.boundary_elapsed_ms),"fetch_to_final_release_monotonic",null,"fetch_monotonic_missing"),
    segment("fetch_to_handler",delta(data.fetch_utc_ms,data.handler_utc_ms),"same_request_worker_utc",null),
    segment("handler_to_final_release",num(data.handler_to_release_ms),"worker_monotonic",null),
    segment("enqueue_to_claim",delta(data.enqueued_utc_ms,command.claimed_utc_ms),"journal_command_worker_utc",null),
    segment("claim_to_receipt_ingress",delta(command.claimed_utc_ms,command.receipt_utc_ms),"journal_command_worker_utc",null),
    segment("frame_received_to_commit_observed",delta(frame.received_at_ms,frame.database_visible_observed_at_ms),frame.frame_history_kind==="observation"?"presentation_observation_worker_utc":"frame_upload_worker_utc",null),
    segment("frame_commit_observed_to_release",delta(frame.database_visible_observed_at_ms,data.released_utc_ms),"cross_request_worker_utc",null),
    ...["phone_claim","transport_lock","usb_submit_to_ack","post_image_qualification","first_final_candidate","encoding","upload","receipt_upload","clock_mapping"].map(stage=>
      segment(stage,null,"app_local_numeric_log",null,data.command_id?"local_log_not_uploaded_no_extra_request":data.tool==="read_screen"?
        ["encoding","upload","clock_mapping"].includes(stage)?"local_frame_history_not_uploaded_may_predate_call":"read_screen_reuses_capture_no_command":"no_command_not_applicable"))];
}
export function adjacentResidual(previous:Record<string,unknown>|undefined,current:Record<string,unknown>) {
  const p=previous??{},same=uuid(current.previous_request_id)===uuid(p.request_id)&&uuid(p.request_id)!==null;
  const qualified=same&&current.previous_link_qualified===true;
  const s=num(current.fetch_utc_ms),r=num(p.released_utc_ms),ps=num(p.fetch_utc_ms);
  return {previous_request_id:same?uuid(current.previous_request_id):null,
    O_i:num(p.boundary_elapsed_ms),P_i:qualified&&s!==null&&ps!==null?s-ps:null,
    G_i:qualified&&s!==null&&r!==null?s-r:null,error_ms:null,
    source:"observed_device_order_worker_utc",qualification:"serial_task_and_no_pause_not_verified",
    missing_reason:qualified?null:"missing_boundary_predecessor_scope_change_or_overlap"};
}
