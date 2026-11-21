import assert from "node:assert/strict";
import test from "node:test";
import {isRelativeDragPreflightError,validateDragReceipt} from "../lib/absolute-drag.ts";
import {compactMcpSummary} from "../lib/mcp-performance.ts";

test("current compact output never suggests a retired calibration retry",()=>{
  const summary=(v:Record<string,unknown>)=>JSON.parse(compactMcpSummary(v));
  assert.equal(summary({drag_at_ready:true,drag_calibrated_duration_ms:350}).drag_calibrated_duration_ms,undefined);
  const failed={state:"failed",error:"DRAG_RELATIVE_DURATION_UNMEASURED",input_not_submitted:true,command_id:"original"};
  const value=summary(failed);
  assert.equal(value.input_not_submitted,true);assert.equal(value.drag_calibrated_duration_ms,undefined);
  assert.equal(value.drag_retry_instruction,undefined);assert.equal(value.command_id,"original");
  for(const patch of [{state:"outcome_unknown"},{input_not_submitted:false},{error:"USB_OUTCOME_UNKNOWN"}])
    assert.equal(summary({...failed,...patch}).drag_retry_instruction,undefined);
});

const command="3fa85f64-5717-4562-b3fc-2c963f66afa6",boot="0f8fad5b-d9cb-469f-a165-70867728950e";
const effect={relative_drag:true,hid_reports_sent:true,delta_x_sent:0,delta_y_sent:-635,all_released:true};
const receipt={command_id:command,board_boot_id:boot,subcommand_index:0,state:"executed",
  error:null,started_uptime_ms:1000,finished_uptime_ms:1120,effect};

test("relative drag preflight evidence recognizes only the four measured-profile failures",()=>{
  for(const suffix of ["CALIBRATION_REQUIRED","DURATION_UNMEASURED","DIRECTION_UNMEASURED","RANGE_UNMEASURED"]){
    assert.equal(isRelativeDragPreflightError("DRAG_RELATIVE_"+suffix),true);
  }
  for(const error of [null,"DRAG_RELATIVE_OTHER","USB_OUTCOME_UNKNOWN","DRAG_GEOMETRY_UNAVAILABLE"]){
    assert.equal(isRelativeDragPreflightError(error),false);
  }
});

test("relative drag receipt keeps exact board identity, bounded signed counts and confirmed release",()=>{
  assert.doesNotThrow(()=>validateDragReceipt(receipt,command,boot,true,120));
  assert.doesNotThrow(()=>validateDragReceipt({...receipt,effect:{...effect,delta_x_sent:1024,delta_y_sent:0}},command,boot,true,1000));
  for(const invalid of [
    {...receipt,command_id:boot},{...receipt,board_boot_id:command},{...receipt,subcommand_index:1},
    {...receipt,finished_uptime_ms:999},{...receipt,state:"failed"},{...receipt,error:"ERROR"},
    {...receipt,effect:{...effect,delta_y_sent:0}},
    {...receipt,effect:{...effect,delta_x_sent:636}},
    {...receipt,effect:{...effect,delta_x_sent:-636}},
    {...receipt,effect:{...effect,delta_x_sent:1.25}},
    {...receipt,effect:{...effect,delta_x_sent:"4"}},
    {...receipt,effect:{...effect,all_released:false}},
    {...receipt,effect:{...effect,hid_reports_sent:false}},
    {...receipt,effect:{...effect,relative_drag:false}},
    {...receipt,effect:{...effect,extra:1}},
  ])assert.throws(()=>validateDragReceipt(invalid,command,boot,true,120),/INVALID_DRAG_RECEIPT/);
  assert.throws(()=>validateDragReceipt({...receipt,effect:{...effect,delta_x_sent:1025}},command,boot,true,1000),/INVALID_DRAG_RECEIPT/);
  assert.throws(()=>validateDragReceipt(receipt,command,boot,true,119),/INVALID_DRAG_RECEIPT/);
});

test("relative drag partial signed evidence allows zero counts and tracks release without becoming a success",()=>{
  const partial={...receipt,state:"outcome_unknown",error:"INPUT_NOT_CONFIRMED_OR_EXPIRED",
    effect:{...effect,delta_y_sent:0,hid_reports_sent:false,all_released:false}};
  assert.doesNotThrow(()=>validateDragReceipt(partial,command,boot,false,120));
  assert.doesNotThrow(()=>validateDragReceipt({...partial,state:"failed",effect:{...partial.effect,
    all_released:true,delta_x_sent:-127,delta_y_sent:381}},command,boot,false,120));
  for(const invalid of [
    {...partial,effect:{...partial.effect,hid_reports_sent:true}},
    {...partial,effect:{...partial.effect,all_released:1}},
    {...partial,effect:{...partial.effect,delta_y_sent:-636}},
    {...partial,state:"executed"},
  ])assert.throws(()=>validateDragReceipt(invalid,command,boot,false,120),/INVALID_DRAG_RECEIPT/);
  assert.throws(()=>validateDragReceipt(partial,command,boot,true,120),/INVALID_DRAG_RECEIPT/);
  const absolute={...receipt,effect:{hid_reports_sent:true}};
  assert.doesNotThrow(()=>validateDragReceipt(absolute,command,boot,true,120));
  assert.doesNotThrow(()=>validateDragReceipt({...absolute,state:"failed"},command,boot,false,120));
});
