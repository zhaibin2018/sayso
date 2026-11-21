import assert from "node:assert/strict";
import test from "node:test";
import {hasPacedWheelEvidence,validatePacedWheelReceipt} from "../lib/wheel-receipt.ts";

const command="3fa85f64-5717-4562-b3fc-2c963f66afa6",boot="0f8fad5b-d9cb-469f-a165-70867728950e";
const effect={hid_reports_sent:true,wheel_reports_sent:6,wheel_units_sent:-6};
const receipt={command_id:command,board_boot_id:boot,subcommand_index:0,state:"executed",error:null,
  started_uptime_ms:1000,finished_uptime_ms:1120,effect};

test("paced wheel success binds the exact original signed step count, report count and receipt scope",()=>{
  assert.equal(hasPacedWheelEvidence(receipt),true);
  assert.equal(hasPacedWheelEvidence({...receipt,effect:{hid_reports_sent:true}}),false);
  assert.equal(hasPacedWheelEvidence({...receipt,effect:{hid_reports_sent:true,wheel_units_sent:-6}}),true);
  assert.doesNotThrow(()=>validatePacedWheelReceipt(receipt,command,boot,-6,true));
  assert.doesNotThrow(()=>validatePacedWheelReceipt({...receipt,effect:{...effect,wheel_units_sent:8,wheel_reports_sent:8}},command,boot,8,true));
  for(const invalid of [
    {...receipt,command_id:boot},{...receipt,board_boot_id:command},{...receipt,subcommand_index:1},
    {...receipt,finished_uptime_ms:999},{...receipt,error:"ERROR"},{...receipt,state:"failed"},
    {...receipt,effect:{...effect,wheel_reports_sent:5}},{...receipt,effect:{...effect,wheel_units_sent:6}},
    {...receipt,effect:{...effect,wheel_reports_sent:5,wheel_units_sent:-5}},
    {...receipt,effect:{...effect,wheel_reports_sent:7,wheel_units_sent:-7}},
    {...receipt,effect:{...effect,wheel_reports_sent:6.5}},{...receipt,effect:{...effect,wheel_units_sent:"-6"}},
    {...receipt,effect:{hid_reports_sent:true,wheel_reports_sent:6}},
    {...receipt,effect:{hid_reports_sent:true,wheel_units_sent:-6}},
    {...receipt,effect:{...effect,extra:true}},
  ])assert.throws(()=>validatePacedWheelReceipt(invalid,command,boot,-6,true),/INVALID_WHEEL_RECEIPT/);
});

test("paced wheel partial evidence stays within the original direction and never claims HID success",()=>{
  const partial={...receipt,state:"outcome_unknown",error:"INPUT_NOT_CONFIRMED_OR_EXPIRED",
    effect:{hid_reports_sent:false,wheel_reports_sent:2,wheel_units_sent:-2}};
  assert.doesNotThrow(()=>validatePacedWheelReceipt(partial,command,boot,-6,false));
  assert.doesNotThrow(()=>validatePacedWheelReceipt({...partial,state:"failed",
    effect:{hid_reports_sent:false,wheel_reports_sent:0,wheel_units_sent:0}},command,boot,-6,false));
  for(const invalid of [
    {...partial,state:"executed"},{...partial,effect:{...partial.effect,hid_reports_sent:true}},
    {...partial,effect:{...partial.effect,wheel_units_sent:2}},
    {...partial,effect:{...partial.effect,wheel_units_sent:-7,wheel_reports_sent:7}},
  ])assert.throws(()=>validatePacedWheelReceipt(invalid,command,boot,-6,false),/INVALID_WHEEL_RECEIPT/);
});

test("terminal wheel uncertainty can preserve all completed pulses without qualifying as a successful receipt",()=>{
  const expired={...receipt,state:"outcome_unknown",error:null};
  assert.doesNotThrow(()=>validatePacedWheelReceipt(expired,command,boot,-6,false));
  assert.throws(()=>validatePacedWheelReceipt(expired,command,boot,-6,true),/INVALID_WHEEL_RECEIPT/);
  for(const invalid of [
    {...expired,state:"failed"},{...expired,state:"executed"},
    {...expired,error:undefined},{...expired,error:"UNEXPECTED"},
    {...expired,effect:{...effect,wheel_reports_sent:2,wheel_units_sent:-2}},
    {...expired,effect:{...effect,wheel_units_sent:6}},
    {...expired,effect:{...effect,wheel_reports_sent:5}},
  ])assert.throws(()=>validatePacedWheelReceipt(invalid,command,boot,-6,false),/INVALID_WHEEL_RECEIPT/);
});
