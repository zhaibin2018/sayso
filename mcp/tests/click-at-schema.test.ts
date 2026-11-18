import {test} from "node:test";
import assert from "node:assert/strict";
import {handleMcp} from "../lib/mcp-protocol.ts";
import {MouseControl,InputAdmissionError} from "../lib/mouse-control.ts";
import {BridgeError,type BridgeEngine} from "../lib/bridge-engine.ts";
import {focusedTextPayload,spotlightPayload} from "../lib/spotlight-command.ts";

const cue={text:"GoogleMaps",region:{x:.04,y:.62,width:.39,height:.09},wait_ms:500};
const base={device_id:"11111111-1111-4111-8111-111111111111",source_frame_id:"22222222-2222-4222-8222-222222222222",x:7,y:15,image_width:16,image_height:32,orientation_epoch:0,idempotency_key:"schema-fixture",wait_ms:0};
async function invoke(method:string,params:Record<string,unknown>){
  const response=await handleMcp(new Request("https://fixture.invalid/mcp",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
  }),{retention:false,engine:()=>({browseEnabled:false} as BridgeEngine),caller:()=>({id:"fixture-owner",label:"fixture"}),
    origin:"https://fixture.invalid",performance:{log:()=>{}}});
  return await response.json() as {result:{isError?:boolean;structuredContent:{error?:string};
    tools?:{name:string;inputSchema:{properties:{after_ready_cue:{properties:{mode:{enum:string[]}}}}}}[]}};
}

test("MCP click accepts only current explicit source coordinates and rejects all ready cues",async t=>{
  let admitted=0;
  t.mock.method(MouseControl.prototype,"clickAt",async()=>{admitted++;throw new BridgeError("CURRENT_CLICK_REACHED",422);});
  const catalogue=await invoke("tools/list",{});
  assert.equal(catalogue.result.tools!.find(x=>x.name==="click_at")!.inputSchema.properties.after_ready_cue,undefined);
  for(const mode of [undefined,"loader_disappears","maps_tiles",null,1]){
    const response=await invoke("tools/call",{name:"click_at",arguments:{...base,after_ready_cue:{...cue,mode}}});
    assert.equal(response.result.structuredContent.error,"INVALID_ARGUMENTS");assert.equal(admitted,0);
  }
  assert.equal((await invoke("tools/call",{name:"click_at",arguments:base})).result.structuredContent.error,"CURRENT_CLICK_REACHED");
  assert.equal(admitted,1);
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

test("MCP current input rejects the removed layout probe before admission",async t=>{
  let admitted=0;t.mock.method(MouseControl.prototype,"enqueueAuthorizedFieldObserved",async()=>{admitted++;throw new Error("must not admit");});
  const value=await invoke("tools/call",{name:"type_text_in_field",arguments:{device_id:"347e31cf-5d17-4cba-bc87-9360b4e24d39",text:"hello",idempotency_key:"no-old-probe",verify_layout:true}});
  assert.equal(value.result.isError,true);assert.equal(admitted,0);
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
  }),{retention:false,engine:()=>({browseEnabled:false} as BridgeEngine),caller:()=>({id:"fixture-owner",label:"fixture"}),
    origin:"https://fixture.invalid",performance:{log:()=>{}}});
  const {result}=await response.json() as {result:{isError:boolean;structuredContent:Record<string,unknown>;content:{type:string;text:string}[]}};
  assert.equal(result.isError,true);
  assert.deepEqual(result.structuredContent.admission_diagnostic,diagnostic);
  const compact=JSON.parse(result.content.find(x=>x.type==="text")!.text);
  assert.deepEqual(compact.admission_diagnostic,diagnostic);
  assert.equal(compact.input_not_submitted,true);
  assert.equal(result.content.filter(x=>x.type==="image").length,0);
});
