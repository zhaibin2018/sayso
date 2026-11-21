import test from "node:test";
import assert from "node:assert/strict";
import {deviceTextLimit,checkTextLimit,countedTextReceipt} from "../lib/long-text.ts";
import {authorizedFieldText,spotlightReceipt} from "../lib/spotlight-command.ts";
import {currentActionCapabilities} from "../lib/current-action-capabilities.ts";
import {allMcpTools} from "../lib/mcp-tool-catalog.ts";

test("D133 numeric capability and all advertised text bounds agree",()=>{
  const caps={"hid.keyboard.ascii_stable":true,"sayso.focused_text":true,"sayso.focused_text.no_visual.v1":true,max_text_len:150};
  assert.equal(currentActionCapabilities(caps,"usb_ncm").max_text_len,150);
  for(const n of [64,120,150])for(const clear of [true,false]){
    const value="x".repeat(n);assert.equal(authorizedFieldText({text:value,clear_before_input:clear}).text.length,n);
    checkTextLimit(value,caps,clear);
  }
  assert.throws(()=>authorizedFieldText({text:"x".repeat(151)}),/TEXT_TOO_LONG_MAX_150/);
  assert.throws(()=>checkTextLimit("x".repeat(65),{}),/TEXT_TOO_LONG_MAX_64/);
  assert.throws(()=>checkTextLimit("x".repeat(61),{},true),/TEXT_TOO_LONG_MAX_60/);
  for(const n of [null,"150",0,-1,150.5,151])assert.equal(deviceTextLimit({max_text_len:n}),64);
  const tool=allMcpTools.find(t=>t.name==="type_text_in_field")!;
  assert.equal((tool.inputSchema.properties.text as {maxLength:number}).maxLength,150);
});
test("D133 count receipts retain uncertainty and reject malformed or mismatched evidence",()=>{
  const body={state:"outcome_unknown",input_submitted:true,finished_client_mono_ms:10050.25};
  const receipt={command_id:"original",board_boot_id:"boot",state:"outcome_unknown",subcommand_index:0,
    started_uptime_ms:1000,finished_uptime_ms:4000,effect:{ascii_stable:true,all_released:true,typed_count:75,typed_count_exact:true}};
  assert.equal(countedTextReceipt(body,receipt,"original","boot",150),true);
  assert.equal(countedTextReceipt(body,{...receipt,effect:{...receipt.effect,typed_count_exact:false}},"original","boot",150),false);
  assert.equal(countedTextReceipt(body,{...receipt,effect:{...receipt.effect,all_released:false}},"original","boot",150),false);
  for(const typed_count of [undefined,-1,1.5,151,"75",NaN])assert.throws(()=>countedTextReceipt(body,
    {...receipt,effect:{...receipt.effect,typed_count}},"original","boot",150),/INVALID_TEXT_COUNT_RECEIPT/);
  for(const invalid of [{command_id:"other"},{board_boot_id:"other"},{subcommand_index:1},{state:"executing"},{finished_uptime_ms:999}])
    assert.throws(()=>countedTextReceipt(body,{...receipt,...invalid},"original","boot",150),/INVALID_TEXT_COUNT_RECEIPT/);
  assert.throws(()=>countedTextReceipt({...body,state:"board_acked"},receipt,"original","boot",150),/INVALID_TEXT_COUNT_RECEIPT/);
});
test("D133 successful counted receipts do not request uncertain-input recovery",()=>{
  const boot="11111111-1111-4111-8111-111111111111",command="22222222-2222-4222-8222-222222222222";
  const body={state:"board_acked",input_submitted:true,finished_client_mono_ms:10050.25,mouse_mode_confirmed:true,restored_mouse_boot_id:boot};
  const receipt={command_id:command,board_boot_id:boot,subcommand_index:0,state:"executed",error:null,started_uptime_ms:1000,finished_uptime_ms:7000,
    effect:{ascii_stable:true,hid_reports_sent:true,all_released:true,typed_count:150,typed_count_exact:true}};
  const value=spotlightReceipt(body,receipt,command,boot,true,true,false,true,false,150);
  assert.equal(value.spotlight.recovery_eligible,false);
  assert.equal(value.spotlight.typed_count,150);
});
