import {test} from "node:test";
import assert from "node:assert/strict";
import {handleMcp} from "../lib/mcp-protocol.ts";
import {MouseControl,InputAdmissionError} from "../lib/mouse-control.ts";
import {BridgeError,type BridgeEngine} from "../lib/bridge-engine.ts";
import {focusedTextPayload,spotlightPayload} from "../lib/spotlight-command.ts";

const cue={text:"GoogleMaps",region:{x:.04,y:.62,width:.39,height:.09},wait_ms:500};
const base={x:7,y:15,image_width:16,image_height:32,orientation_epoch:0,idempotency_key:"schema-fixture",wait_ms:0};
async function invoke(method:string,params:Record<string,unknown>){
  const response=await handleMcp(new Request("https://fixture.invalid/mcp",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
  }),{engine:()=>({browseEnabled:false} as BridgeEngine),caller:()=>({id:"fixture-owner",label:"fixture"}),
    origin:"https://fixture.invalid",performance:{log:()=>{}}});
  return await response.json() as {result:{isError?:boolean;structuredContent:{error?:string};
    tools?:{name:string;inputSchema:{properties:{after_ready_cue:{properties:{mode:{enum:string[]}}}}}}[]}};
}

test("MCP click_at rejects undeclared ready-cue modes before any input admission",async t=>{
  let admitted=0;
  t.mock.method(MouseControl.prototype,"enqueue",async()=>{
    admitted++;throw new BridgeError("READ_ONLY_PROBE_REACHED_ENQUEUE",422);
  });
  const catalogue=await invoke("tools/list",{});
  assert.deepEqual(catalogue.result.tools!.find(x=>x.name==="click_at")!.inputSchema.properties.after_ready_cue.properties.mode.enum,
    ["loader_disappears"]);
  for(const mode of ["maps_tiles","unadvertised_future_mode",null,1]){
    const response=await invoke("tools/call",{name:"click_at",arguments:{...base,after_ready_cue:{...cue,mode}}});
    assert.equal(response.result.isError,true);
    assert.equal(response.result.structuredContent.error,"INVALID_READY_CUE",String(mode));
    assert.equal(admitted,0,String(mode));
  }
});

test("MCP click_at preserves default clicks and declared generic ready-cue modes",async t=>{
  const admissions:unknown[]=[];
  t.mock.method(MouseControl.prototype,"enqueue",async(...args:unknown[])=>{
    admissions.push(args[5]);throw new BridgeError("READ_ONLY_PROBE_REACHED_ENQUEUE",422);
  });
  for(const after_ready_cue of [undefined,{...cue,text:"Page ready"},{...cue,text:"Loading",mode:"loader_disappears"}]){
    const response=await invoke("tools/call",{name:"click_at",arguments:{...base,...(after_ready_cue?{after_ready_cue}:{})}});
    assert.equal(response.result.structuredContent.error,"READ_ONLY_PROBE_REACHED_ENQUEUE");
  }
  assert.equal(admissions.length,3);
  assert.equal((admissions[0] as {readyCue?:unknown}).readyCue,undefined);
  assert.equal((admissions[1] as {readyCue:{text:string;mode?:string}}).readyCue.text,"Pageready");
  assert.equal((admissions[1] as {readyCue:{mode?:string}}).readyCue.mode,undefined);
  assert.equal((admissions[2] as {readyCue:{mode:string}}).readyCue.mode,"loader_disappears");
});

test("MCP original-ID after-image lookup advertises and enforces its exclusive selector",async t=>{
  const command="6f8d8638-69fc-4bd9-8f6c-973d1f6d1f02";
  const device="347e31cf-5d17-4cba-bc87-9360b4e24d39";
  const catalogue=await invoke("tools/list",{});
  const fields=catalogue.result.tools!.find(tool=>tool.name==="get_mouse_result")!.inputSchema.properties as unknown as
    Record<string,{description:string}>;
  assert.match(fields.command_id.description,/omit device_id/);
  assert.match(fields.device_id.description,/Only with click_at_idempotency_key/);

  const seen:string[]=[];
  t.mock.method(MouseControl.prototype,"getSpotlightObserved",async(_user:unknown,original:string)=>{
    seen.push(original);
    throw new BridgeError("FIXTURE_ORIGINAL_RELOOK",422);
  });
  const args={command_id:command,include_after_screen:true,after_command_min_gap_ms:309};
  const lookup=(arguments_:Record<string,unknown>)=>invoke("tools/call",{name:"get_mouse_result",arguments:arguments_});
  assert.equal((await lookup({...args,device_id:device})).result.structuredContent.error,"INVALID_ARGUMENTS");
  assert.deepEqual(seen,[]);
  assert.equal((await lookup(args)).result.structuredContent.error,"FIXTURE_ORIGINAL_RELOOK");
  assert.deepEqual(seen,[command]);
});

test("MCP layout verification is limited to the pinned iPhone 11 and the exact test string",async t=>{
  const device="347e31cf-5d17-4cba-bc87-9360b4e24d39",source="6f8d8638-69fc-4bd9-8f6c-973d1f6d1f02";
  const field={x:.1,y:.55,width:.65,height:.07},landmark={text:"Siri Suggestions",region:{x:.04,y:.17,width:.78,height:.06}};
  const probe={device_id:device,source_frame_id:source,field,landmark,verify_layout:true,text:"Google mapq",idempotency_key:"layout",wait_ms:2000};
  const admissions:{focused:boolean;payload:ReturnType<typeof focusedTextPayload>|ReturnType<typeof spotlightPayload>}[]=[];
  const direct=t.mock.method(MouseControl.prototype,"enqueueAuthorizedFieldObserved",async(
    _user:unknown,_args:Record<string,unknown>)=>null);
  t.mock.method(MouseControl.prototype,"enqueueSpotlightObserved",async(_user:unknown,args:Record<string,unknown>,_requestID:unknown,focused:boolean)=>{
    const payload=focused?focusedTextPayload(args):spotlightPayload(args);
    admissions.push({focused,payload});
    throw new BridgeError("FIXTURE_ADMISSION_REACHED",422);
  });
  const invokeText=(arguments_:Record<string,unknown>)=>invoke("tools/call",{name:"type_text_in_field",arguments:arguments_});
  const catalogue=await invoke("tools/list",{}),properties=catalogue.result.tools!.find(tool=>tool.name==="type_text_in_field")!.inputSchema.properties;
  const schema=properties as unknown as {verify_layout:{type:string},clear_before_input:{description:string}};
  assert.equal(schema.verify_layout.type,"boolean");
  assert.match(schema.clear_before_input.description,/Defaults to selecting and deleting/);
  for(const [patch,error] of [
    [{verify_layout:"true"},"INVALID_LAYOUT_PROBE"],
    [{verify_layout:null},"INVALID_LAYOUT_PROBE"],
    [{device_id:"c00a407b-77fd-4afc-b633-61c818165947"},"LAYOUT_PROBE_DEVICE_UNAVAILABLE"],
    [{text:"Google Maps"},"INVALID_LAYOUT_PROBE"],
    [{submit:"enter"},"INVALID_LAYOUT_PROBE"],
    [{submit_enter:true},"INVALID_ARGUMENTS"],
    [{clear_before_input:true},"INVALID_LAYOUT_PROBE"],
    [{clear_before_input:false},"INVALID_LAYOUT_PROBE"],
    [{placeholder:"Search"},"INVALID_LAYOUT_PROBE"],
    [{landmark:{...landmark,text:" unrelated scene"}},"INVALID_SPOTLIGHT_FOCUS"],
    [{landmark:{...landmark,region:field}},"SPOTLIGHT_REGIONS_OVERLAP"],
  ] as const){
    const result=(await invokeText({...probe,...patch})).result;
    assert.equal(result.isError,true);
    assert.equal(result.structuredContent.error,error,JSON.stringify(patch));
    assert.equal(admissions.length,0);
  }
  const layout=(await invokeText(probe)).result;
  assert.equal(layout.structuredContent.error,"FIXTURE_ADMISSION_REACHED");
  assert.equal(direct.mock.callCount(),0);
  assert.deepEqual(admissions[0],{focused:false,payload:{source_frame_id:source,field,landmark,probe_keyboard:true}});
  const args={...probe,text:"changi airport",verify_layout:false,submit:"enter"};
  const unsupported=(await invokeText(args)).result;
  assert.equal(unsupported.structuredContent.error,"FOCUSED_TEXT_CLEAR_NOT_READY");
  assert.equal(direct.mock.calls[0].arguments[1]?.clear_before_input,true);
  assert.equal(admissions.length,1);
  const ordinary=(await invokeText({...args,clear_before_input:false})).result;
  assert.equal(ordinary.structuredContent.error,"FIXTURE_ADMISSION_REACHED");
  assert.equal(direct.mock.callCount(),2);
  assert.deepEqual(admissions[1],{focused:true,payload:{source_frame_id:source,field,landmark,text:"changi airport",submit_enter:true}});
});

test("MCP point refusal returns bounded original diagnostic in modern image-only hosts",async t=>{
  const diagnostic={diagnostic_timing:"after_rejection",source_frame_id:"original-frame",
    source_age_ms:5300,current_head_age_ms:120,visual_proof_resolved:false,
    visual_proof_lookup:"released_frame_not_found",
    conditions:{authority:1,control_enabled:1,ordinary_source_younger_than_4s:0}};
  t.mock.method(MouseControl.prototype,"clickAt",async()=>{
    throw new InputAdmissionError("REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED",diagnostic);
  });
  const response=await handleMcp(new Request("https://fixture.invalid/mcp",{
    method:"POST",headers:{"Content-Type":"application/json","mcp-protocol-version":"2026-07-28"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"click_at",arguments:base}}),
  }),{engine:()=>({browseEnabled:false} as BridgeEngine),caller:()=>({id:"fixture-owner",label:"fixture"}),
    origin:"https://fixture.invalid",performance:{log:()=>{}}});
  const {result}=await response.json() as {result:{isError:boolean;structuredContent:Record<string,unknown>;content:{type:string;text:string}[]}};
  assert.equal(result.isError,true);
  assert.deepEqual(result.structuredContent.admission_diagnostic,diagnostic);
  const compact=JSON.parse(result.content.find(x=>x.type==="text")!.text);
  assert.deepEqual(compact.admission_diagnostic,diagnostic);
  assert.equal(compact.input_not_submitted,true);
  assert.equal(result.content.filter(x=>x.type==="image").length,0);
});
