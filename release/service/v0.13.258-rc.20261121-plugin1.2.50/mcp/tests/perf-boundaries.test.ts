import {test} from "node:test";
import assert from "node:assert/strict";
import {upstreamCorrelation,releaseBoundary,enrichBoundaries,performanceSegments,adjacentResidual} from "../lib/perf-boundaries.ts";
import {runWithBridgeContext} from "../lib/bridge-context.ts";
import {McpPerformance} from "../lib/mcp-performance.ts";
import {setDebugScope,debugHash} from "../lib/debug-scope.ts";
import {writeJournal,journalFrame,readJournal,responseProjection} from "../lib/timing-journal.ts";
import {DB} from "./fixtures/retention.ts";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

test("fetch boundary includes final work with monotonic O and never exports request metadata",()=>{
  const headers={traceparent:"00-"+"a".repeat(32)+"-"+"b".repeat(16)+"-01","x-request-id":id(1),authorization:"SECRET"};
  const request=new Request("https://fixture.invalid/mcp",{headers});
  const value=runWithBridgeContext({waitUntil:()=>{},workerFetchStartedUTC:Date.now()-5,workerFetchStartedMono:performance.now()-5},()=>
    releaseBoundary(request,Date.now()-2,performance.now()-2));
  assert.ok(Number(value.boundary_elapsed_ms)>=5);assert.ok(value.handler_to_release_ms>=2);
  assert.equal(value.traceparent,headers.traceparent);assert.equal(value.upstream_request_id,id(1));
  assert.doesNotMatch(JSON.stringify(value),/SECRET|authorization|uptime/);
  for(const traceparent of ["SECRET","00-"+"0".repeat(32)+"-"+"b".repeat(16)+"-01"]){
    const bad=upstreamCorrelation(new Request(request.url,{headers:{traceparent,"x-request-id":"SECRET"}}));
    assert.equal(bad.traceparent,null);assert.equal(bad.upstream_request_id,null);assert.ok(bad.upstream_missing_reason);
  }
  assert.equal(releaseBoundary(new Request(request.url),Date.now(),performance.now()).boundary_elapsed_ms,null);
});
test("scoped predecessor survives only as an observed order; overlap and scope changes suppress residual",async()=>{
  const db=new DB() as unknown as D1Database,owner=await debugHash("owner"),now=Date.now();
  const p={request_id:id(1),rpc:"tools/call",tool:"read_screen",scope_owner_hash:owner,scope_device_ids:[id(2)],
    session_id:id(3),received_utc_ms:now-100,fetch_utc_ms:now-110,released_utc_ms:now-80,boundary_elapsed_ms:30};
  await writeJournal(db,id(1),now-100,p,now);
  const trace=new McpPerformance({log:()=>{}});setDebugScope(trace,"owner",{device_id:id(2)});
  const next:Record<string,unknown>={request_id:id(4),rpc:"tools/call",scope_owner_hash:owner,scope_device_ids:[id(2)],
    device_states:[{session_id:id(3)}],received_utc_ms:now,fetch_utc_ms:now-10};
  await enrichBoundaries(db,trace,next);
  assert.equal(next.previous_request_id,id(1));assert.equal(next.previous_link_qualified,true);
  const gap=adjacentResidual(p,next);assert.equal(gap.O_i,30);assert.equal(gap.P_i,100);assert.equal(gap.G_i,70);
  assert.equal(gap.error_ms,null);assert.match(gap.qualification,/not_verified/);
  assert.equal(adjacentResidual(undefined,next).G_i,null);
  next.fetch_utc_ms=now-90;await enrichBoundaries(db,trace,next);assert.equal(adjacentResidual(p,next).G_i,null);
  next.fetch_utc_ms=null;await enrichBoundaries(db,trace,next);assert.equal(next.previous_link_qualified,false);
  next.device_states=[{session_id:id(5)}];await enrichBoundaries(db,trace,next);assert.equal(next.previous_link_qualified,false);
});
test("frame companions join by final UUID and share erasure fence, 24h read gate and strict projection",async()=>{
  const db=new DB() as unknown as D1Database,jobs:Promise<unknown>[]=[],now=Date.now();
  runWithBridgeContext({waitUntil:p=>{jobs.push(p);}},()=>journalFrame(db,"owner",id(1),id(2),{
    received_at_ms:now-12,database_visible_observed_at_ms:now-2,bridge_session_id:id(3),broadcast_id:id(4),
    text:"SECRET",image:"SECRET",token:"SECRET",clock_domain_id:id(5)}));
  await Promise.all(jobs);const frame=(await readJournal(db,0,200,now)).rows[0] as Record<string,unknown>;
  assert.equal(frame.frame_id,id(2));assert.equal(frame.clock_domain_id,id(5));assert.doesNotMatch(JSON.stringify(frame),/SECRET/);
  const segments=performanceSegments({boundary_elapsed_ms:15,released_utc_ms:now}, {}, frame);
  assert.equal(segments.find(s=>s.stage==="frame_received_to_commit_observed")?.duration_ms,10);
  assert.equal(segments.find(s=>s.stage==="frame_received_to_commit_observed")?.error_ms,null);
  assert.equal(segments.find(s=>s.stage==="usb_submit_to_ack")?.duration_ms,null);
  assert.equal((await readJournal(db,0,200,now+86400_000)).rows.length,0);
  const projected=responseProjection({result:{structuredContent:{state:"unavailable",recovery:{lookups:3,retry_count:2,budget_exhausted:true,text:"SECRET"}},content:[]}});
  assert.equal(projected.lookup_attempts,3);assert.equal(projected.image_count,0);assert.doesNotMatch(JSON.stringify(projected),/SECRET/);
});
test("original-ID recovery keeps its command session instead of a newer live session",async()=>{
  const clock={device_id:id(1),bridge_session_id:id(2),broadcast_id:id(3),worker_id:id(4),clock_domain_id:id(5)};
  const db={prepare:(sql:string)=>({bind(){return this;},async first(){
    if(sql.includes("FROM sb_mouse_commands"))return {id:id(6),session_id:id(2),event_clock:JSON.stringify(clock),precondition:"{}",created_at:1};
    if(sql.includes("FROM sb_sessions"))return {broadcast_id:id(3),event_clock:JSON.stringify(clock)};
    return null;
  }})} as unknown as D1Database;
  const trace=new McpPerformance({log:()=>{}});setDebugScope(trace,"owner",{device_id:id(1),command_id:id(6)});
  const data:Record<string,unknown>={scope_device_ids:[id(1)],device_states:[{session_id:id(9)}],received_utc_ms:100};
  await enrichBoundaries(db,trace,data);
  assert.equal(data.session_id,id(2));assert.equal(data.clock_domain_source,"command_record");
  assert.equal((data.event_clock as Record<string,unknown>).clock_domain_id,id(5));
});
