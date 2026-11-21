import {diagnosticsEnabled} from "./build-profile.ts";
import {deferBridgeTask,canDeferBridgeTask} from "./bridge-context.ts";
import type {McpPerformance} from "./mcp-performance.ts";
import {journalDebugData,debugHash} from "./debug-scope.ts";
import {enrichBoundaries} from "./perf-boundaries.ts";

export const journalTTL = 24*60*60*1000;
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const number=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0?v:null;
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)?v:null;
const code=(v:unknown)=>typeof v==="string"&&/^[A-Z][A-Z0-9_]{0,95}$/.test(v)?v:null;
const state=(v:unknown)=>["queued","claimed","executing","board_acked","failed","outcome_unknown","cancelled","expired"].includes(String(v))?v:null;
const releasedMetadata=new WeakMap<McpPerformance,Record<string,unknown>>();
export function observeJournalImage(trace:McpPerformance,metadata:Record<string,unknown>,count:number,ageUpper:number|null) {
  if(!diagnosticsEnabled)return;
  releasedMetadata.set(trace,count===1?{
    frame_id:uuid(metadata.frame_id),frame_seq:number(metadata.frame_seq),capture_clock_verified:typeof metadata.capture_clock_verified==="boolean"?metadata.capture_clock_verified:null,
    capture_lower_server_utc_ms:number(metadata.capture_lower_server_utc_ms),age_upper_ms:number(ageUpper),
    event_clock:Object.fromEntries(["device_id","bridge_session_id","broadcast_id","clock_domain_id","worker_id"].map(k=>[k,uuid(object(metadata.event_clock)[k])])),
    orientation:["portrait","portrait_upside_down","landscape_left","landscape_right"].includes(String(metadata.orientation))?metadata.orientation:null,
  }:{});
}
export type JournalRow={id:number; record_key:string; received_utc_ms:number; data_json:string};

/** Only the final serialized response is projected, after the image guard. Never persist raw data. */
export function responseProjection(body:unknown) {
  const envelope=object(body),result=object(envelope.result),summary=object(result.structuredContent);
  const meta=object(result._meta),after=object(summary.after_screen);
  const images=Array.isArray(result.content)?result.content.map(object).filter(v=>v.type==="image"):[];
  const imageMetadata=object(summary.metadata??after.metadata??summary.image_metadata??meta.frame_metadata);
  const image=object(summary.image);
  const recovery=object(summary.recovery);
  const error=code(summary.error)??(typeof object(envelope.error).code==="number"?object(envelope.error).code:null);
  const bytes=images.reduce((sum,v)=>sum+(typeof v.data==="string"?Math.max(0,Math.floor(v.data.length*3/4)-(v.data.endsWith("==")?2:v.data.endsWith("=")?1:0)):0),0);
  return {outcome:result.isError===true||envelope.error!==undefined?"error":"ok",error_code:error,
    read_screen_state:["available","repeated","unavailable","unchanged","paused","pending","error"].includes(String(summary.state))?summary.state:null,
    reason_code:code(summary.reason)??code(summary.error),
    sensitive_input_length:error==="SENSITIVE_INPUT_USER_MUST_TYPE"?number(summary.input_length):null,
    image_count:images.length,image_bytes:bytes,
    width:images.length===1?number(imageMetadata.width??image.width):null,
    height:images.length===1?number(imageMetadata.height??image.height):null,
    orientation:images.length===1&&["portrait","portrait_upside_down","landscape_left","landscape_right",0,1,2,3,4].includes(imageMetadata.orientation as string)?imageMetadata.orientation:null,
    frame_id:images.length===1?uuid(imageMetadata.frame_id):null,
    frame_seq:images.length===1?number(imageMetadata.frame_seq):null,
    age_ms:images.length===1?number(imageMetadata.age_ms??image.age_ms):null,
    capture_clock_verified:images.length===1&&typeof imageMetadata.capture_clock_verified==="boolean"?imageMetadata.capture_clock_verified:null,
    capture_lower_server_utc_ms:images.length===1?number(imageMetadata.capture_lower_server_utc_ms):null,
    ingress_utc_ms:images.length===1?number(imageMetadata.ingress_at_server_utc_ms):null,
    stored_utc_ms:images.length===1?number(imageMetadata.stored_at_server_utc_ms):null,
    lookup_attempts:number(recovery.lookups),retry_count:number(recovery.retry_count),budget_exhausted:typeof recovery.budget_exhausted==="boolean"?recovery.budget_exhausted:null,
    command_id:uuid(summary.command_id),enqueued_utc_ms:number(summary.created_at),result_state:state(summary.state)};
}

/** Transactional insert + retention: request and associated command rows share the 200-row cap. */
export async function writeJournal(db:D1Database,key:string,received:number,data:Record<string,unknown>,now=Date.now(),enabled=diagnosticsEnabled) {
  if(!enabled)return;
  const json=JSON.stringify(data),scoped=Array.isArray(data.scope_device_ids)&&data.scope_device_ids.length>0;
  // Same atomic insert fences delayed diagnostics after device erasure.
  const gate=scoped?` WHERE NOT EXISTS(SELECT 1 FROM sb_erasure_jobs e WHERE e.fenced=1 AND
    (e.scope='site' OR (e.scope='device' AND EXISTS(SELECT 1 FROM json_each(?,'$.scope_device_ids') WHERE value=e.device_id))))`:"";
  await db.batch([
    db.prepare(`INSERT INTO sb_timing_journal(record_key,received_utc_ms,data_json) SELECT ?,?,?${gate}
      ON CONFLICT(record_key) DO UPDATE SET data_json=json_patch(sb_timing_journal.data_json,excluded.data_json)`)
      .bind(key,received,json,...(scoped?[json]:[])),
    db.prepare("DELETE FROM sb_timing_journal WHERE received_utc_ms<?").bind(now-journalTTL),
    db.prepare("DELETE FROM sb_timing_journal WHERE id NOT IN (SELECT id FROM sb_timing_journal ORDER BY id DESC LIMIT 200)"),
  ]);
}

export function journalResponse(db:()=>D1Database,trace:McpPerformance,received:number,ready:number,released:number,response:Response,boundary:Record<string,unknown>={}) {
  if(!diagnosticsEnabled||!canDeferBridgeTask())return;
  const snapshot=trace.journalSnapshot();
  if(snapshot.tool==="get_debug_report")return;
  const copy=response.clone();
  deferBridgeTask(async()=>{
    const raw=await copy.arrayBuffer();
    let body:unknown=null;try{body=JSON.parse(new TextDecoder().decode(raw));}catch{}
    const tool=snapshot.rpc==="tools/call";
    const base={request_id:trace.requestID,rpc:snapshot.rpc,received_utc_ms:received,
      response_ready_utc_ms:ready,released_utc_ms:released,server_elapsed_ms:snapshot.server_elapsed_ms};
    const data:Record<string,unknown>=tool?{...base,tool:snapshot.tool,...responseProjection(body),...releasedMetadata.get(trace),metrics:snapshot.metrics,
      release_retry_attempts:snapshot.metrics.late_image_release_retry?.calls??0,
      response_bytes:raw.byteLength,...boundary}:base;
    if(boundary.exception===true)Object.assign(data,{outcome:"error",error_code:"UNHANDLED_EXCEPTION"});
    const database=db();
    if(tool)try{Object.assign(data,await journalDebugData(database,trace,object(object(object(body).result).structuredContent),received));}catch{/* Missing legacy scope is never made public. */}
    if(tool&&data.command_id){
      const command=await database.prepare("SELECT created_at FROM sb_mouse_commands WHERE id=?").bind(data.command_id).first<{created_at:number}>();
      data.enqueued_utc_ms=number(command?.created_at);
    }
    if(tool)try{await enrichBoundaries(database,trace,data);}catch{data.boundary_enrichment_missing_reason="scope_or_retained_record_unavailable";}
    await writeJournal(database,trace.requestID,received,data);
  });
}

/** Frame-keyed companion rows use the same diagnostics gate, erasure fence, TTL and cap. */
export function journalFrame(db:D1Database,owner:string,device:string,frame:unknown,history:Record<string,unknown>,kind:"upload"|"observation"="upload") {
  const id=uuid(frame);if(!diagnosticsEnabled||!id)return;
  deferBridgeTask(async()=>writeJournal(db,"frame:"+id+":"+kind,Number(history.received_at_ms),{
    frame_id:id,scope_owner_hash:await debugHash(owner),scope_device_ids:[device],
    session_id:uuid(history.bridge_session_id),broadcast_id:uuid(history.broadcast_id),
    received_at_ms:number(history.received_at_ms),database_visible_observed_at_ms:number(history.database_visible_observed_at_ms),
    clock_domain_id:uuid(history.clock_domain_id),source:"frame_commit_observed",frame_history_kind:kind
  }));
}

/** Associated rows avoid the race where a phone receipt precedes the MCP background insert. */
export function journalCommand(db:D1Database,command:{id:string;created_at:number;state:string},phase:"claim"|"receipt",at:number) {
  if(!diagnosticsEnabled)return;
  const id=uuid(command.id);if(!id)return;
  const fields={command_id:id,enqueued_utc_ms:number(command.created_at),
    ...(phase==="claim"?{claimed_utc_ms:at}:{receipt_utc_ms:at,result_state:state(command.state)})};
  deferBridgeTask(()=>writeJournal(db,"command:"+id,at,fields));
}

export async function readJournal(db:D1Database,after:number,limit:number,now=Date.now()) {
  const result=await db.prepare("SELECT * FROM sb_timing_journal WHERE id>? AND received_utc_ms>=? ORDER BY id LIMIT ?")
    .bind(after,now-journalTTL,limit+1).all<JournalRow>();
  const selected=result.results.slice(0,limit);
  return {oldest_received_utc_ms:(await db.prepare("SELECT min(received_utc_ms) AS oldest FROM sb_timing_journal WHERE received_utc_ms>=?").bind(now-journalTTL).first<{oldest:number|null}>())?.oldest??null,rows:selected.map(row=>({id:row.id,...JSON.parse(row.data_json)})),
    server_now_utc_ms:Date.now(),next_cursor:selected.at(-1)?.id??after,has_more:result.results.length>limit};
}
