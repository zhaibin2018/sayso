import {test} from "node:test";
import assert from "node:assert/strict";
import {logAuthorizedPairedGrant} from "../lib/paired-grant-timing.ts";
import {runWithBridgeContext} from "../lib/bridge-context.ts";

const move="11111111-1111-4111-8111-111111111111",click="22222222-2222-4222-8222-222222222222";
const probe="33333333-3333-4333-8333-333333333333";
const grant=()=>({command_id:move,state:"executing",kind:"pointer.move_absolute",point_protocol:"paired_mouse_point.v1",
  raw_dispatch_protocol:"raw_mouse_claim_start.v1",claim_pregrant_elapsed_ms:254,ttl_remaining_ms:2500,paired_dispatch_probe_id:probe,
  paired_click_command:{command_id:click,state:"executing",kind:"pointer.click",predecessor_command_id:move},
  payload:{text:"PRIVATE_TEXT"},point_receipt_proof:"PRIVATE_PROOF",authorization:"PRIVATE_TOKEN",owner_id:"PRIVATE_OWNER"});

test("paired grant timing: original ID and allowlisted numbers only, from trusted worker context",()=>{
  const logs:Record<string,unknown>[]=[],c={...grant(),worker_fetch_started_utc_ms:999999};const before=structuredClone(c);
  runWithBridgeContext({waitUntil:()=>{throw Error("No I/O");},workerFetchStartedUTC:100},()=>logAuthorizedPairedGrant(c,110,370,x=>logs.push(x)));
  assert.equal(logs.length,1);assert.deepEqual(c,before);
  assert.deepEqual(logs[0],{event:"paired_grant_route_timing",command_id:move,route_started_utc_ms:110,reply_ready_utc_ms:370,
    claim_pregrant_elapsed_ms:254,ttl_remaining_ms:2500,paired_dispatch_probe_attested:1,worker_entry_available:1,clock_ordered:1,
    worker_fetch_started_utc_ms:100,route_to_reply_ready_ms:260,worker_fetch_to_route_ms:10});
  for(const privateValue of [click,probe,"PRIVATE_TEXT","PRIVATE_PROOF","PRIVATE_TOKEN","PRIVATE_OWNER"])assert.equal(JSON.stringify(logs).includes(privateValue),false);
  assert.ok(Object.entries(logs[0]).filter(([key])=>!["event","command_id"].includes(key)).every(([,v])=>typeof v==="number"&&Number.isFinite(v)));
});

test("paired grant timing: empty, legacy, malformed and nonpaired results emit nothing",()=>{
  const cases:unknown[]=[null,undefined,{},[],{...grant(),state:"claimed"},{...grant(),kind:"pointer.click"},
    {...grant(),point_protocol:undefined},{...grant(),raw_dispatch_protocol:undefined},
    {...grant(),command_id:"PRIVATE_BAD_ID"},{...grant(),paired_click_command:{...grant().paired_click_command,command_id:move}},
    {...grant(),paired_click_command:{...grant().paired_click_command,predecessor_command_id:probe}},
    {...grant(),paired_click_command:{...grant().paired_click_command,state:"claimed"}}];
  for(const c of cases){const logs:unknown[]=[];logAuthorizedPairedGrant(c,100,200,x=>logs.push(x));assert.equal(logs.length,0);}
});

test("paired grant timing: missing or reversed clocks never invent positive elapsed evidence",()=>{
  const absent:Record<string,unknown>[]=[];logAuthorizedPairedGrant(grant(),100,200,x=>absent.push(x));
  assert.equal(absent[0].worker_entry_available,0);assert.equal(absent[0].worker_fetch_started_utc_ms,undefined);
  for(const entry of [NaN,Infinity,-1]){
    const logs:Record<string,unknown>[]=[];
    runWithBridgeContext({waitUntil:()=>{},workerFetchStartedUTC:entry},()=>logAuthorizedPairedGrant(grant(),100,200,x=>logs.push(x)));
    assert.equal(logs[0].worker_entry_available,0);assert.equal(logs[0].worker_fetch_started_utc_ms,undefined);
  }
  for(const [entry,start,end] of [[120,100,200],[90,100,99]]){
    const logs:Record<string,unknown>[]=[];
    runWithBridgeContext({waitUntil:()=>{},workerFetchStartedUTC:entry},()=>logAuthorizedPairedGrant(grant(),start,end,x=>logs.push(x)));
    assert.equal(logs[0].clock_ordered,0);assert.equal(logs[0].route_to_reply_ready_ms,undefined);assert.equal(logs[0].worker_fetch_to_route_ms,undefined);
  }
});

test("paired grant timing: invalid budgets and clock values suppress diagnostics; sink failure is harmless",()=>{
  const logs:unknown[]=[];
  for(const value of [-1,Infinity,NaN,60001])logAuthorizedPairedGrant({...grant(),claim_pregrant_elapsed_ms:value},0,1,x=>logs.push(x));
  for(const value of [-1,Infinity,NaN,2501])logAuthorizedPairedGrant({...grant(),ttl_remaining_ms:value},0,1,x=>logs.push(x));
  for(const value of [-1,Infinity,NaN])logAuthorizedPairedGrant(grant(),value,1,x=>logs.push(x));
  assert.deepEqual(logs,[]);
  assert.doesNotThrow(()=>logAuthorizedPairedGrant(grant(),0,1,()=>{throw Error("private sink failure");}));
});

test("paired grant timing: longer TTL is logged only for an eligible reviewed point envelope",()=>{
  const profile="reviewed_point_crop.v4",logs:Record<string,unknown>[]=[];
  const envelope={...grant(),ttl_remaining_ms:4870,raw_dispatch_ttl_profile:profile,
    precondition:{point_source:{protocol:profile,origin:"typed"}}};
  logAuthorizedPairedGrant(envelope,100,200,x=>logs.push(x));
  assert.equal(logs.length,1);
  assert.equal(logs[0].ttl_remaining_ms,4870);
  assert.equal(logs[0].raw_dispatch_ttl_profile,profile);
  for(const rejected of [{...envelope,ttl_remaining_ms:5001},{...envelope,precondition:{}},
    {...envelope,precondition:{point_source:{protocol:profile,origin:"retained"}}},
    {...envelope,raw_dispatch_ttl_profile:"scope_only_system_search.v1"}])
    logAuthorizedPairedGrant(rejected,100,200,x=>logs.push(x));
  assert.equal(logs.length,1);
});
