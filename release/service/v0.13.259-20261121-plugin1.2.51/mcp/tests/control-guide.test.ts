import {test} from "node:test";
import assert from "node:assert/strict";
import {handleMcp} from "../lib/mcp-protocol.ts";
import {controlWorkflows} from "../lib/control-guide.ts";
import {BridgeError} from "../lib/bridge-engine.ts";

async function invoke(method:string,params:Record<string,unknown>,modern=true,authenticated=true){
  let engineCalls=0;
  const response=await handleMcp(new Request("https://fixture.invalid/mcp",{method:"POST",headers:{"Content-Type":"application/json",...(modern?{"MCP-Protocol-Version":"2026-07-28"}:{})},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})}),
    {engine:()=>{engineCalls++;throw Error("Static guide must not access a device engine");},caller:()=>{if(!authenticated)throw new BridgeError("UNAUTHENTICATED",401);return {id:"synthetic-owner",label:"fixture"};},origin:"https://fixture.invalid",performance:{log:()=>{}}});
  return {rpc:await response.json() as {result:{isError?:boolean;structuredContent:Record<string,unknown>;content?:{type:string}[];tools?:{name:string;annotations:{readOnlyHint:boolean}}[];serverInfo?:{name:string};instructions?:string}},engineCalls};
}
test("current guide: metadata never accesses phone engine or grants readiness",async()=>{
  for(const workflow of controlWorkflows){
    const {rpc,engineCalls}=await invoke("tools/call",{name:"get_control_guide",arguments:{workflow}});
    assert.equal(engineCalls,0);assert.equal(rpc.result.structuredContent.state,"guidance_only");
    assert.equal(rpc.result.structuredContent.device_readiness,"not_checked");
    assert.equal(rpc.result.content?.some(x=>x.type==="image"),false);
  }
});
test("current guide: retired preparation and visual-field inputs are not exposed",async()=>{
  const {rpc}=await invoke("tools/list",{});
  const tools=rpc.result.tools! as unknown as {name:string;inputSchema:{properties:Record<string,unknown>};description:string}[];
  for(const name of ["search_app_with_vision","prepare_app_search","get_app_search_query_result","get_app_search_preparation_result","type_google_map_in_spotlight"])
    assert.equal(tools.some(t=>t.name===name),false,name);
  for(const [name,keys] of [["open_system_search",["source_frame_id","source_view_proof"]],["type_text_in_field",["verify_layout","field","landmark","source_frame_id"]]] as const){
    const tool=tools.find(t=>t.name===name)!;assert.ok(tool);
    for(const key of keys)assert.equal(tool.inputSchema.properties[key],undefined,key);
  }
  assert.match(tools.find(t=>t.name==="drag_at")!.description,/No|no/);
});
test("current initialization requires image handoff and forbids legacy fallbacks",async()=>{
  const {rpc,engineCalls}=await invoke("initialize",{protocolVersion:"2026-07-28"});assert.equal(engineCalls,0);
  assert.match(rpc.result.instructions!,/BETWEEN tool calls/);assert.match(rpc.result.instructions!,/Input clears first by default/);
  assert.match(rpc.result.instructions!,/retired/);assert.doesNotMatch(rpc.result.instructions!,/remain available only for existing preparations/);
});

test("T6 is exposed by every guide and initialization, outside click metadata",async()=>{
 for(const workflow of controlWorkflows){const {rpc,engineCalls}=await invoke("tools/call",{name:"get_control_guide",arguments:{workflow}});const rules=JSON.stringify(rpc.result.structuredContent);assert.match(rules,/T6/);assert.match(rules,/move_mouse_to/);assert.match(rules,/after-image/);assert.match(rules,/soft instruction/);assert.match(rules,/black, blank/);assert.equal(engineCalls,0);}
 const {rpc}=await invoke("initialize",{});assert.match(rpc.result.instructions!,/ask the user to tap/);assert.match(rpc.result.instructions!,/final payments, orders, sends, deletions, subscription cancellations and transfers/);
 const listed=await invoke("tools/list",{});const click=(listed.rpc.result.tools as unknown as {name:string;description:string}[]).find(x=>x.name==="click_at")!;assert.doesNotMatch(click.description,/ask the user|do not call/);assert.match(click.description,/original-image x\/y/);
});
