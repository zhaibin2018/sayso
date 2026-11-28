import test from "node:test";
import assert from "node:assert/strict";
import {DB,Bucket} from "./fixtures/retention.ts";
import {BridgeEngine} from "../lib/bridge-engine.ts";
import {handleMcp} from "../lib/mcp-protocol.ts";
import {runWithBridgeContext} from "../lib/bridge-context.ts";
import {completeCallParameters} from "../lib/complete-call-journal.ts";
import {imageOnlyReadResult} from "../lib/image-only-read-result.ts";
import {McpPerformance} from "../lib/mcp-performance.ts";
import {captureCompleteCall,recordCompleteCall} from "../lib/complete-call-journal.ts";
import {callFrameIngress,callImageFields,observeCompleteCallImage} from "../lib/call-image-journal.ts";
import {createHash} from "node:crypto";

test("D175 exact name/fallback text, text-first read order and handoff only",()=>{
  const image={type:"image",data:"QUJD"},image_handoff={source_frame_id:"frame"};
  for(const name of ["iPhone 11","",null,undefined,123]){
    const result=imageOnlyReadResult({state:"available",metadata:{frame_id:"frame",age_ms:1},device_name:name,image_handoff},[image],false)!;
    assert.deepEqual(result.content,[{type:"text",text:name==="iPhone 11"?
      "Screenshot below from iPhone 11. 下图是 iPhone 11 的屏幕截图。":"Screenshot below. 下图是屏幕截图。"},image]);
    assert.deepEqual(result.structuredContent,{image_handoff});
  }
});

test("T97 parameter allowlist keeps values, presence flags and Unicode character count only",()=>{
  const safe=completeCallParameters({result_projection:"full",wait_for_new_ms:0,max_age_ms:100,
    after_command_min_gap_ms:25,include_read_timing:false,settle_ms:20,submit:true,clear_before_input:false,
    if_unchanged_since:"PRIVATE_FRAME",device_id:"PRIVATE_DEVICE",after_command_id:null,
    source_frame_id:"PRIVATE_SOURCE",idempotency_key:"PRIVATE_KEY",text:"PRIVATE😀",
    x:123,y:456,proof:"PRIVATE_PROOF",token:"PRIVATE_TOKEN",image:"PRIVATE_IMAGE",extra:"PRIVATE_EXTRA"});
  assert.deepEqual(safe,{result_projection:"full",wait_for_new_ms:0,max_age_ms:100,
    after_command_min_gap_ms:25,include_read_timing:false,settle_ms:20,submit:true,clear_before_input:false,
    if_unchanged_since:true,device_id:true,after_command_id:false,source_frame_id:true,idempotency_key:true,text_chars:8});
  assert.doesNotMatch(JSON.stringify(safe),/PRIVATE|123|456|proof|token|image/);
});

test("T97 each MCP method persists independently after response, including notification and errors",async()=>{
  const db=new DB(),engine=new BridgeEngine({db:db as unknown as D1Database,bucket:new Bucket() as unknown as R2Bucket});
  const jobs:Promise<unknown>[]=[],owner={id:"complete-owner",label:"offline"};
  const methods=["initialize","notifications/initialized","tools/list","ping","resources/list","unknown/method","tools/call"];
  for(const [i,method] of methods.entries()){
    const request=new Request("https://offline.invalid/mcp",{method:"POST",headers:{"Content-Type":"application/json","Mcp-Session-Id":"PRIVATE_SESSION"},
      body:JSON.stringify({jsonrpc:"2.0",...(method.startsWith("notifications/")?{}:{id:i}),method,
        params:method==="tools/call"?{name:"get_control_guide",arguments:{workflow:"overview"}}:{}})});
    const response=await runWithBridgeContext({waitUntil:job=>{jobs.push(job);}},()=>handleMcp(request,
      {engine:()=>engine,caller:()=>owner,origin:"https://offline.invalid",retention:false,performance:{log:()=>{}}}));
    assert.ok(response.status<500);
    // No background callback can run until the response promise has resolved.
    await Promise.all(jobs);
    const rows=db.raw.prepare("SELECT data_json FROM sb_timing_journal WHERE record_key LIKE 'minimal:%'").all();
    assert.equal(rows.length,i+1);
    const row=JSON.parse(String(rows.at(-1)!.data_json));
    assert.equal(row.method,method);assert.equal(row.tool,method==="tools/call"?"get_control_guide":null);
    assert.equal(row.runtime_version,"0.13.293");assert.match(row.mcp_session_hash,/^[a-f0-9]{24}$/);
    assert.ok(row.released_utc_ms>=row.received_utc_ms);
    for(const key of ["boundary_elapsed_ms","image_count","image_bytes","text_utf8_bytes","structured_utf8_bytes","response_bytes"])assert.equal(typeof row[key],"number",key);
    assert.equal(row.response_bytes,(await response.arrayBuffer()).byteLength);
    for(const key of callImageFields)assert.equal(row[key],null,key);
    assert.doesNotMatch(JSON.stringify(row),/PRIVATE_SESSION/);
  }
});

test("D198 deferred action image fields bind final JPEG, release age and private ingress only",async()=>{
  const db=new DB(),trace=new McpPerformance({log:()=>{}}),jobs:Promise<unknown>[]=[];
  const frame="00000000-0000-4000-8000-000000000001",bytes=Buffer.from([0xff,0xd8,0x00,0xff,0xd9]);
  const metadata={frame_id:frame,frame_seq:41,source_seq:82,capture_lower_server_utc_ms:1000,
    capture_clock_verified:true,width:16,height:32,[callFrameIngress]:1100,private:"SECRET_PIXELS"};
  const body={result:{content:[{type:"image",mimeType:"image/jpeg",data:bytes.toString("base64")}],
    structuredContent:{state:"board_acked",after_screen:{state:"available",metadata}}}};
  captureCompleteCall(trace,"owner",{method:"tools/call",params:{name:"click_at",arguments:{}}},null);
  observeCompleteCallImage(trace,metadata,1,350,1350);
  const before=JSON.stringify(body);
  runWithBridgeContext({waitUntil:job=>{jobs.push(job);}},()=>recordCompleteCall(()=>db as unknown as D1Database,
    trace,Date.now(),0,Date.now(),1,body,before.length));
  assert.equal(db.raw.prepare("SELECT count(*) n FROM sb_timing_journal").get()!.n,0);
  await Promise.all(jobs);
  const row=JSON.parse(String(db.raw.prepare("SELECT data_json FROM sb_timing_journal").get()!.data_json));
  assert.deepEqual(Object.fromEntries(callImageFields.map(key=>[key,row[key]])),{
    returned_frame_id:frame,frame_seq:41,source_seq:82,capture_lower_server_utc_ms:1000,
    released_check_utc_ms:1350,age_upper_ms:350,clock_verified:true,static_repeated:false,
    image_sha256:createHash("sha256").update(bytes).digest("hex"),image_width:16,image_height:32,
    frame_ingress_server_utc_ms:1100});
  assert.equal(JSON.stringify(body),before);
  assert.doesNotMatch(JSON.stringify(row),/SECRET|private|\/9gA/);
});

test("T97 unavailable/failed/blocked waitUntil never changes or awaits the MCP response",async()=>{
  for(const mode of ["throw","reject","blocked"]){
    const jobs:Promise<unknown>[]=[],db=new DB();let writes=0,unblock:()=>void=()=>{};
    const blocked=new Promise<void>(resolve=>{unblock=resolve;});
    const engine=new BridgeEngine({db:new Proxy(db,{get(target,key){if(key==="batch")return async()=>{writes++;if(mode==="reject")throw Error("offline");await blocked;return [];};return Reflect.get(target,key);}}) as unknown as D1Database,bucket:new Bucket() as unknown as R2Bucket});
    const request=new Request("https://offline.invalid/mcp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"ping"})});
    const response=await runWithBridgeContext({waitUntil:job=>{if(mode==="throw")throw Error("unavailable");jobs.push(job);}},()=>handleMcp(request,
      {engine:()=>engine,caller:()=>({id:"owner",label:"offline"}),origin:"https://offline.invalid",retention:false,performance:{log:()=>{}}}));
    assert.equal(response.status,200);assert.equal(writes,0,"no D1 before response resolution");
    await new Promise(resolve=>setTimeout(resolve,5));unblock();await Promise.all(jobs);
  }
});
