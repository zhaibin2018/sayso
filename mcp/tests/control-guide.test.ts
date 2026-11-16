import {test} from "node:test";
import assert from "node:assert/strict";
import {handleMcp} from "../lib/mcp-protocol.ts";
import {controlWorkflows} from "../lib/control-guide.ts";
import {BridgeError} from "../lib/bridge-engine.ts";

test("current initialization does not route ordinary input through old caret or review gates",async()=>{
  const {rpc,engineCalls}=await invoke("initialize",{protocolVersion:"2026-07-28"});
  const instructions=rpc.result.instructions!;
  assert.equal(engineCalls,0);
  assert.match(instructions,/defaults to the original full-size JPEG/);
  assert.match(instructions,/Input clears first by default/);
  assert.match(instructions,/in-app search use submit=enter/);
  assert.match(instructions,/Continue an authorized multi-step task/);
  assert.doesNotMatch(instructions,/verify the visible caret|model confirms the empty focused field|repeat the original arguments with that exact review_frame_id/);
  const tools=(await invoke("tools/list",{})).rpc.result.tools! as unknown as {name:string;description:string}[];
  assert.match(tools.find(t=>t.name==="open_system_search")!.description,/Default original_jpeg/);
  assert.match(tools.find(t=>t.name==="read_screen_text")!.description,/Do not use this during ordinary image-driven/);
});

test("guide: the current reader requires actual captures and accepts legacy repeat arguments",async()=>{
  const {rpc}=await invoke("tools/list",{});
  const tools=rpc.result.tools as unknown as {name:string;inputSchema:{properties:Record<string,{default?:unknown}>};description:string}[];
  assert.equal(tools.some(t=>t.name==="read_last_screen"),false);
  const read=tools.find(t=>t.name==="read_screen")!;
  assert.equal(read.inputSchema.properties.allow_repeated.default,false);
  assert.match(read.description,/strictly less than 2000 ms/);assert.match(read.description,/presentation-only repeats do not qualify/);
});

async function invoke(method:string,params:Record<string,unknown>,modern=true,authenticated=true){
  let engineCalls=0;
  const response=await handleMcp(new Request("https://fixture.invalid/mcp",{method:"POST",headers:{"Content-Type":"application/json",...(modern?{"MCP-Protocol-Version":"2026-07-28"}:{})},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})}),
    {engine:()=>{engineCalls++;throw Error("Static guide must not access a device engine");},caller:()=>{if(!authenticated)throw new BridgeError("UNAUTHENTICATED",401);return {id:"synthetic-owner",label:"fixture"};},origin:"https://fixture.invalid",performance:{log:()=>{}}});
  return {rpc:await response.json() as {result:{isError?:boolean;structuredContent:Record<string,unknown>;content?:{type:string}[];tools?:{name:string;annotations:{readOnlyHint:boolean}}[];serverInfo?:{name:string};instructions?:string}},engineCalls};
}
test("guide: every workflow is readable without engine access or readiness claims",async()=>{
  for(const modern of [false,true])for(const workflow of controlWorkflows){
    const {rpc,engineCalls}=await invoke("tools/call",{name:"get_control_guide",arguments:{workflow}},modern);
    assert.equal(engineCalls,0);assert.equal(rpc.result.isError,false);
    assert.equal(rpc.result.structuredContent.state,"guidance_only");assert.equal(rpc.result.structuredContent.device_readiness,"not_checked");
    assert.equal(rpc.result.structuredContent.workflow,workflow);assert.equal(rpc.result.content?.some(x=>x.type==="image"),false);
  }
});
test("guide: advertised operating tools exist and discovery uses SaySo",async()=>{
  const {rpc}=await invoke("tools/list",{}),catalogue=rpc.result.tools!;
  const guide=catalogue.find(x=>x.name==="get_control_guide")!;assert.equal(guide.annotations.readOnlyHint,true);
  const overview=(await invoke("tools/call",{name:"get_control_guide",arguments:{workflow:"overview"}})).rpc.result.structuredContent;
  for(const tool of overview.current_tools as string[])assert.ok(catalogue.some(x=>x.name===tool),tool);
  assert.ok((overview.current_tools as string[]).includes("click_at"));assert.match(String(overview.repeat),/paired_mouse_point\.v1/);
  const initialized=(await invoke("initialize",{protocolVersion:"2026-07-28"})).rpc.result;
  assert.equal(initialized.serverInfo?.name,"sayso");assert.ok(initialized.instructions?.includes("get_control_guide"));
});
test("guide: a voice action starts from actual pixels and uses one combined click per visible point",async()=>{
  const {rpc:{result:{instructions}}}=await invoke("initialize",{protocolVersion:"2026-07-28"});
  assert.match(instructions ?? "",/current voice or text conversation, use SaySo tools directly/);
  assert.match(instructions ?? "",/use click_at for a visible target/);
  assert.match(instructions ?? "",/inspect every content_items and content array.*type=image/);
  const overview=(await invoke("tools/call",{name:"get_control_guide",arguments:{workflow:"overview"}})).rpc.result.structuredContent;
  assert.match(String(overview.voice_start),/respond in the same voice conversation/);
  const combinations=overview.combinations as string[];
  assert.match(combinations[1],/click_at\(settle_ms=300\).*after-image/);
  assert.match(combinations.at(-1) ?? "",/^explicit landing check:/);
  const openApp=(await invoke("tools/call",{name:"get_control_guide",arguments:{workflow:"open_app"}})).rpc.result.structuredContent;
  assert.match(String(openApp.note),/one bounded get_mouse_result with the original click command ID and include_after_screen=true/);
  assert.doesNotMatch((openApp.sequence as string[]).join("\n"),/pointer workflow|move_mouse_to|click_mouse/);
});
test("guide: missing/unknown workflow or unauthenticated caller cannot retrieve a guide",async()=>{
  for(const args of [{},{workflow:"invented"},{workflow:[]},{workflow:"open_app",device_id:"not-a-device"}]){
    const {rpc,engineCalls}=await invoke("tools/call",{name:"get_control_guide",arguments:args});
    assert.equal(rpc.result.isError,true);assert.equal(rpc.result.structuredContent.error,"INVALID_ARGUMENTS");assert.equal(engineCalls,0);
  }
  const {rpc,engineCalls}=await invoke("tools/call",{name:"get_control_guide",arguments:{workflow:"clipboard"}},true,false);
  assert.equal(rpc.result.structuredContent.error,"UNAUTHENTICATED");assert.equal(engineCalls,0);
});

test("guide: standalone read recovery patience matches discovery without weakening pixel freshness",async()=>{
  const {rpc}=await invoke("tools/list",{});
  const tool=rpc.result.tools!.find(x=>x.name==="read_screen") as unknown as {inputSchema:{properties:Record<string,{default?:number;maximum?:number;minimum?:number}>}};
  assert.equal(tool.inputSchema.properties.wait_for_new_ms.default,15000);
  assert.equal(tool.inputSchema.properties.wait_for_new_ms.maximum,15000);
  assert.equal(tool.inputSchema.properties.max_age_ms.default,2000);
  assert.equal(tool.inputSchema.properties.max_age_ms.maximum,2000);
  const guide=(await invoke("tools/call",{name:"get_control_guide",arguments:{workflow:"overview"}})).rpc.result.structuredContent;
  assert.equal(guide.guide_revision,"1.14.0");
  assert.ok((guide.invariants as string[]).some(x=>x.includes("default15000ms, maximum15000ms")));
  assert.ok((guide.invariants as string[]).some(x=>x.includes("ordinary visual reads strictly below 2000 ms")));
});
test("guide: opening apps and entering fields use the same discovered generic input",async()=>{
  const open=await invoke("tools/call",{name:"get_control_guide",arguments:{workflow:"open_app"}});
  const field=await invoke("tools/call",{name:"get_control_guide",arguments:{workflow:"field_input"}});
  const maps=await invoke("tools/call",{name:"get_control_guide",arguments:{workflow:"maps"}});
  const sequence=(x:typeof open)=>(x.rpc.result.structuredContent.sequence as string[]).join("\n");
  assert.equal(open.engineCalls+field.engineCalls+maps.engineCalls,0);
  assert.match(sequence(open),/visible system Search button.*requested app name/i);
  assert.match(sequence(open),/prepare_app_search.*app_search_preparation_ready.*source_image_ref.*source_scope.*does not click an App/);
  assert.match(sequence(open),/get_app_search_preparation_result.*original preparation_id.*Never send a new preparation/);
  assert.match(sequence(open),/Spotlight is already visible.*without toggling/);
  assert.match(sequence(open),/Only for an existing legacy preparation or an explicit compatibility request, use search_app_with_vision if this connection exposes it and get_app_search_query_result.*empty Spotlight field.*without Return.*query_confirmed.*original preparation_id/);
  assert.match(sequence(open),/system_search_scope_only_ready and focused_text_no_visual_ready.*open_system_search once.*original JPEG.*type_text_in_field directly.*settle_ms/);
  assert.match(sequence(open),/open_system_search.*system_search_scope_only_ready.*device_id.*idempotency_key.*fixed shortcut.*after-image/);
  assert.match(sequence(open),/older system_search_ready devices.*reviewed source_frame_id.*actual after-image.*before type_text_in_field/);
  assert.match(sequence(open),/uses AC Search and older firmware uses Command\+Space through the same tool/);
  assert.match(sequence(open),/focused_text_system_search_handoff_ready.*source_after_command_id.*Omit submit/);
  assert.match(sequence(open),/later than the original ACK.*greater of 300 ms and saved settle.*at most 2000 ms/);
  assert.match(sequence(open),/confirmed shortcut with a loading after-image.*after_command_min_gap_ms.*strictly newer capture/);
  assert.match(sequence(open),/strictly newer capture.*own bounded wait without a wait argument/);
  assert.match(sequence(open),/report the missing readiness.*Home route only if the user requests it/);
  assert.match(sequence(open),/unknown shortcut.*original command_id.*include_after_screen=true.*Never repeat.*pending confirmation/);
  assert.match(sequence(open),/visible name, icon and result type/);
  assert.match(sequence(open),/Call click_at once on its tile or visible open arrow/);
  assert.match(String(open.rpc.result.structuredContent.note),/identity is unclear.*original click command ID.*strictly later capture/);
  assert.match(String(open.rpc.result.structuredContent.note),/after_command_min_gap_ms.*rounded up.*0–5000 ms.*scope.*pending or unknown.*foreground identity pending confirmation/);
  assert.doesNotMatch(sequence(open),/Google Maps|Siri Suggestions/);
  assert.match(sequence(field),/focused_text_ready and type_text_in_field/);
  assert.match(sequence(field),/focused_text_system_search_handoff_ready.*confirmed open_system_search.*younger than 4 seconds.*younger than 2 seconds/);
  assert.match(sequence(field),/focused_text_scope_bound_field_ready.*original paired click_at or open_system_search.*no reference age cutoff.*current same-scope image under 2 seconds/);
  assert.match(sequence(field),/insertion caret before sending keys.*checks focus after the USB transition.*same board boot/);
  assert.match(sequence(field),/original command_id.*restored_mouse_boot_id/);
  assert.match(sequence(field),/explicitly authorizes a Pinyin spelling.*exact authorized spelling.*does not prove Chinese characters/);
  assert.match(sequence(maps),/open_app.*requested app name/);
  const catalogue=(await invoke("tools/list",{})).rpc.result.tools!.map(x=>x.name);
  assert.ok(catalogue.includes("type_text_in_field"));
  assert.ok(!catalogue.includes("search_app_with_vision") && !catalogue.includes("get_app_search_query_result"));
  assert.ok(catalogue.includes("prepare_app_search"));assert.ok(catalogue.includes("get_app_search_preparation_result"));
  assert.ok(!catalogue.includes("type_google_map_in_spotlight"));
  const recovery=(await invoke("tools/list",{})).rpc.result.tools!.find(x=>x.name==="get_mouse_result") as {description:string}|undefined;
  assert.match(recovery?.description??"",/type_text_in_field.*include_after_screen=true.*stable USB release.*keyboard-window mouse restoration/);
});
