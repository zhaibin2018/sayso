import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync,type SQLInputValue} from "node:sqlite";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {writeJournal,readJournal,responseProjection,journalTTL,journalCommand} from "../lib/timing-journal.ts";
import {handleTimingJournal} from "../lib/timing-journal-http.ts";
import {handleMcp} from "../lib/mcp-protocol.ts";
import {runWithBridgeContext} from "../lib/bridge-context.ts";
import type {BridgeEngine} from "../lib/bridge-engine.ts";
const key="ab".repeat(32),maintenance="cd".repeat(32),id="11111111-1111-1111-1111-111111111111";
function fixture(){
  const sql=new DatabaseSync(":memory:");sql.exec(readFileSync(new URL("../drizzle/0028_timing_journal.sql",import.meta.url),"utf8"));
  class Statement {
    query:string;values:SQLInputValue[]=[];
    constructor(query:string){this.query=query;}
    bind(...values:SQLInputValue[]){this.values=values;return this;}
    async all(){return {results:sql.prepare(this.query).all(...this.values)};}
    async first(){return sql.prepare(this.query).get(...this.values)??null;}
  }
  const db={prepare:(query:string)=>new Statement(query),batch:async(items:Statement[])=>{
    sql.exec("BEGIN");try{for(const item of items)sql.prepare(item.query).run(...item.values);sql.exec("COMMIT");}
    catch(error){sql.exec("ROLLBACK");throw error;}
  }} as unknown as D1Database;
  return {db,sql};
}
test("journal writes, caps at 200, expires after 24h and pages without duplicate timestamps",async()=>{
  const {db}=fixture(),now=Date.now();
  await writeJournal(db,"expired",now-journalTTL-1,{rpc:"ping"},now-journalTTL-1);
  for(let n=0;n<205;n++)await writeJournal(db,String(n),now,{request_id:String(n)},now);
  const first=await readJournal(db,0,80,now),second=await readJournal(db,first.next_cursor,120,now);
  assert.equal(first.rows.length,80);assert.equal(second.rows.length,120);assert.equal(first.has_more,true);assert.equal(second.has_more,false);
  assert.equal(new Set([...first.rows,...second.rows].map(v=>v.id)).size,200);
  assert.equal((await readJournal(db,0,200,now+journalTTL+1)).rows.length,0);
  await writeJournal(db,"new",now+journalTTL+1,{},now+journalTTL+1);
  assert.equal((await readJournal(db,0,200,now+journalTTL+1)).rows.length,1);
});
test("HTTP auth rejects missing, wrong, maintenance and reused maintenance keys; validates pagination",async()=>{
  const {db}=fixture(),env={DB:db,SAYSO_TIMING_JOURNAL_READ_KEY_HEX:key,SAYSO_RETENTION_MAINTENANCE_KEY_HEX:maintenance};
  const request=(token:string|null,suffix="")=>new Request("https://test.invalid/internal/timing-journal"+suffix,{headers:token?{"X-SaySo-Timing-Key":token}:{}});
  for(const token of [null,"ef".repeat(32),maintenance])assert.equal((await handleTimingJournal(request(token),env)).status,401);
  assert.equal((await handleTimingJournal(request(key),{...env,SAYSO_TIMING_JOURNAL_READ_KEY_HEX:undefined})).status,503);
  assert.equal((await handleTimingJournal(request(key),{...env,SAYSO_TIMING_JOURNAL_READ_KEY_HEX:maintenance.toUpperCase()})).status,503);
  for(const suffix of ["?after=-1","?limit=201","?limit=0","?after=9007199254740992","?limit=1.1"])
    assert.equal((await handleTimingJournal(request(key,suffix),env)).status,400);
  const response=await handleTimingJournal(request(key),env);assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
  const page=await response.json() as any;assert.ok(page.server_now_utc_ms>0);assert.equal(page.next_cursor,0);
});
test("projection excludes private parameters, text, identities and pixels, including tool errors",()=>{
  const raw={result:{structuredContent:{error:"INVALID_ARGUMENTS",name:"SECRET",user_id:"SECRET",arguments:{text:"SECRET"},
    command_id:id,metadata:{frame_id:id,width:444,height:960,orientation:"portrait",capture_clock_verified:true,frame_seq:3,storage_key:"SECRET"}},
    content:[{type:"text",text:"SECRET"},{type:"image",data:"QUJD",mimeType:"image/jpeg"}],isError:true}};
  const value=responseProjection(raw);assert.equal(value.image_bytes,3);assert.equal(value.frame_id,id);assert.equal(value.error_code,"INVALID_ARGUMENTS");
  assert.doesNotMatch(JSON.stringify(value),/SECRET|QUJD|arguments|storage_key|user_id/);
  assert.equal(responseProjection({result:{structuredContent:raw.result.structuredContent,content:[]}}).frame_id,null);
});
test("handleMcp returns before background writes; persistence failure leaves result and catalogue intact",async()=>{
  for(const broken of [false,true]){
    const {db}=fixture(),jobs:Promise<unknown>[]=[];let accesses=0;
    const service={db:broken?{prepare:()=>{throw Error("write failed");}}:db, bucket:{}} as BridgeEngine;
    const response=await runWithBridgeContext({waitUntil:job=>{jobs.push(job);}},()=>handleMcp(new Request("https://test.invalid/mcp",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"get_profile",arguments:{}}})}),{
      engine:()=>{accesses++;return service;},caller:()=>({id:"SECRET",label:"SECRET"}),origin:"https://test.invalid",toolAudience:"development",retention:false,performance:{log:()=>{}}}));
    assert.equal(accesses,1); // get_profile dispatch; no journal DB access before return.
    const body=await response.json() as any;assert.equal(body.result.isError,false);
    await Promise.all(jobs);
    const rows=(await readJournal(db,0,200)).rows as any[];
    if(!broken){assert.equal(rows.length,1);assert.equal(rows[0].rpc,"tools/call");assert.equal(rows[0].tool,"get_profile");assert.doesNotMatch(JSON.stringify(rows),/SECRET/);}
    else assert.equal(rows.length,0);
  }
});
test("image journal uses the final post-guard response and final elapsed snapshot",async()=>{
  const {db}=fixture(),jobs:Promise<unknown>[]=[];
  // The real handler's guard rejects an already-expired screenshot. No stale frame is persisted.
  const service={db,bucket:{},now:()=>Date.now(),readScreenWithReleaseRetry:async()=>({result:{state:"available",image:"QUJD",metadata:{
    frame_id:id,width:444,height:960,capture_lower_server_utc_ms:Date.now()-60000,capture_clock_verified:true,age_ms:60000}}})} as unknown as BridgeEngine;
  const response=await runWithBridgeContext({waitUntil:job=>{jobs.push(job);}},()=>handleMcp(new Request("https://test.invalid/mcp",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen",arguments:{}}})}),{
    engine:()=>service,caller:()=>({id:"SECRET",label:"SECRET"}),origin:"https://test.invalid",retention:false,performance:{log:()=>{}}}));
  const body=await response.json() as any;assert.equal(body.result.content.filter((v:any)=>v.type==="image").length,0);
  await Promise.all(jobs);const row=(await readJournal(db,0,200)).rows[0] as any;
  assert.equal(row.image_count,0);assert.equal(row.frame_id,null);assert.ok(row.released_utc_ms>=row.response_ready_utc_ms);assert.ok(row.server_elapsed_ms>=0);
});
test("associated command updates survive receipt-before-request and claim-after-receipt ordering",async()=>{
  const {db}=fixture(),jobs:Promise<unknown>[]=[],now=Date.now();
  runWithBridgeContext({waitUntil:job=>{jobs.push(job);}},()=>{
    journalCommand(db,{id,created_at:now-20,state:"board_acked"},"receipt",now);
    journalCommand(db,{id,created_at:now-20,state:"executing"},"claim",now-10);
  });
  await Promise.all(jobs);const rows=(await readJournal(db,0,200)).rows as any[];
  assert.equal(rows.length,1);const row=rows[0];
  assert.equal(row.result_state,"board_acked");assert.equal(row.enqueued_utc_ms,now-20);
  assert.equal(row.claimed_utc_ms,now-10);assert.equal(row.receipt_utc_ms,now);
});
test("production profile performs no writes or reads even with configured credentials",()=>{
  const script=`globalThis.__SAYSO_DIAGNOSTICS__=false;
    const {writeJournal,journalCommand,journalResponse}=await import('./lib/timing-journal.ts');
    const {handleTimingJournal}=await import('./lib/timing-journal-http.ts');
    const db=new Proxy({},{get(){throw Error('production DB access');}});
    await writeJournal(db,'x',0,{});journalCommand(db,{id:'${id}',created_at:0,state:'queued'},'claim',0);
    journalResponse(()=>db,{},0,0,0,new Response());
    const r=await handleTimingJournal(new Request('https://test.invalid'),{DB:db});if(r.status!==404)throw Error('production read');`;
  const result=spawnSync(process.execPath,["--experimental-strip-types","--input-type=module","-e",script],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
});

test("sensitive tool arguments are never persisted, including validation error responses",async()=>{
  const {db}=fixture(),jobs:Promise<unknown>[]=[];
  const response=await runWithBridgeContext({waitUntil:job=>{jobs.push(job);}},()=>handleMcp(new Request("https://test.invalid/mcp",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",
      params:{name:"read_screen",arguments:{text:"SECRET",user_id:"SECRET",device_name:"SECRET",image:"SECRET"}}})}),{
    engine:()=>({db}) as BridgeEngine,caller:()=>({id:"SECRET",label:"SECRET"}),origin:"https://test.invalid",retention:false,performance:{log:()=>{}}}));
  assert.equal((await response.json() as any).result.isError,true);
  await Promise.all(jobs);const rows=(await readJournal(db,0,200)).rows as any[];
  assert.equal(rows.length,1);assert.equal(rows[0].outcome,"error");assert.equal(rows[0].error_code,"INVALID_ARGUMENTS");
  assert.doesNotMatch(JSON.stringify(rows),/SECRET|arguments|invalid_arguments|device_name|user_id/);
});
test("initialize and tools/list persist only minimal RPC metadata",async()=>{
  const {db}=fixture(),jobs:Promise<unknown>[]=[];
  for(const method of ["initialize","tools/list"]){
    const response=await runWithBridgeContext({waitUntil:job=>{jobs.push(job);}},()=>handleMcp(new Request("https://test.invalid/mcp",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params:{clientInfo:{name:"SECRET"}}})}),{
      engine:()=>({db}) as BridgeEngine,caller:()=>({id:"SECRET",label:"SECRET"}),origin:"https://test.invalid",retention:false,performance:{log:()=>{}}}));
    await response.arrayBuffer();
  }
  await Promise.all(jobs);const rows=(await readJournal(db,0,200)).rows as any[];
  assert.equal(rows.length,2);
  for(const row of rows){assert.equal(row.tool,undefined);assert.equal(row.metrics,undefined);assert.equal(row.response_bytes,undefined);assert.doesNotMatch(JSON.stringify(row),/SECRET/);}
});

test("card refusal persists only bounded outcome metadata, never original text",async t=>{
  const {db}=fixture(),jobs:Promise<unknown>[]=[],logged:unknown[]=[];
  t.mock.method(console,"info",(entry:unknown)=>{logged.push(entry);});
  const input=["4111","1111","1111","1111"].join("-");
  const response=await runWithBridgeContext({waitUntil:job=>{jobs.push(job);}},()=>handleMcp(new Request("https://test.invalid/mcp",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",
      params:{name:"type_text_in_field",arguments:{device_id:id,idempotency_key:"offline",text:input}}})}),{
    engine:()=>({db}) as BridgeEngine,caller:()=>({id:"fixture",label:"fixture"}),origin:"https://test.invalid",retention:false,
    performance:{log:entry=>{logged.push(entry);}}}));
  assert.equal((await response.json() as any).result.structuredContent.error,"SENSITIVE_INPUT_USER_MUST_TYPE");
  await Promise.all(jobs);
  const rows=(await readJournal(db,0,200)).rows as any[];
  assert.equal(rows.length,1);assert.equal(rows[0].reason_code,"SENSITIVE_INPUT_USER_MUST_TYPE");
  assert.equal(rows[0].sensitive_input_length,input.length);
  assert.equal(JSON.stringify(rows).includes(input),false);assert.equal(JSON.stringify(logged).includes(input),false);
  assert.equal(JSON.stringify(rows).includes(input.replaceAll("-","")),false);
});
