import {test} from "node:test";
import assert from "node:assert/strict";
import {handleMcp} from "../lib/mcp-protocol.ts";

const retired=["search_app_with_vision","prepare_app_search","get_app_search_query_result",
  "get_app_search_preparation_result","type_google_map_in_spotlight","run_pointer_actions",
  "get_pointer_action_result","browse_cycle","get_browse_state","stop_browse","read_screen_text",
  "view_screen","request_screen","get_latest_screen"];
async function rpc(method:string,params:Record<string,unknown>){
  let engineCalls=0;
  const response=await handleMcp(new Request("https://fixture.invalid/mcp",{method:"POST",
    headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})}),{
    engine:()=>{engineCalls++;throw Error("A retired request must never reach the device engine");},
    caller:()=>({id:"current-only-fixture",label:"fixture"}),origin:"https://fixture.invalid",
    performance:{log:()=>{}}});
  return {body:await response.json() as any,engineCalls};
}
test("current-only catalogue has no OCR plan, old capture request or Search compatibility entry",async()=>{
  const {body,engineCalls}=await rpc("tools/list",{});assert.equal(engineCalls,0);
  const names=body.result.tools.map((t:{name:string})=>t.name);
  for(const name of retired)assert.equal(names.includes(name),false,name);
  for(const name of ["read_screen","click_at","type_text_in_field","scroll_mouse","drag_at","open_system_search","get_mouse_result","stop_mouse"])
    assert.equal(names.includes(name),true,name);
});
test("retired tools are rejected before any phone lookup or command enqueue",async()=>{
  for(const name of retired){
    const {body,engineCalls}=await rpc("tools/call",{name,arguments:{}});
    assert.equal(engineCalls,0,name);assert.equal(body.result.isError,true,name);
    assert.match(JSON.stringify(body),/UNKNOWN_TOOL/,name);
  }
});
test("retired visual parameters and source-less clicks cannot enter execution",async()=>{
  const device_id="11111111-1111-4111-8111-111111111111",source_frame_id="22222222-2222-4222-8222-222222222222";
  const point={device_id,source_frame_id,x:12,y:34,image_width:444,image_height:960,orientation_epoch:1,idempotency_key:"current-only"};
  const invalid:[string,Record<string,unknown>][]=[
    ["click_at",{...point,target_region:{x:0,y:0,width:1,height:1}}],
    ["click_at",{...point,landmark_region:{x:0,y:0,width:1,height:1}}],
    ["click_at",{...point,after_ready_cue:{text:"GoogleMaps"}}],
    ["read_screen",{device_id,allow_repeated:false}],
    ["read_screen",{device_id,include_source_view_proof:true}],
  ];
  const {source_frame_id:unused,...withoutFrame}=point;invalid.push(["click_at",withoutFrame]);
  for(const [name,args]of invalid){const {body,engineCalls}=await rpc("tools/call",{name,arguments:args});
    assert.equal(engineCalls,0,name);assert.equal(body.result.isError,true,name);assert.match(JSON.stringify(body),/INVALID_ARGUMENTS/);}
});
