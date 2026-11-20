import {test} from "node:test";
import assert from "node:assert/strict";
import {absoluteDragRequest,validateDragReceipt} from "../lib/absolute-drag.ts";
const id="11111111-1111-4111-8111-111111111111",boot="22222222-2222-4222-8222-222222222222";
const payload={from_x:16458,from_y:23781,to_x:16458,to_y:9738,duration_ms:350};
const effect={hid_reports_sent:true,absolute_drag_v2:true,all_released:true,button_report_id:2,position_report_id:3,motion_reports_sent:15,final_x:16458,final_y:9738};
const receipt={command_id:id,board_boot_id:boot,subcommand_index:0,state:"executed",error:null,started_uptime_ms:1000,finished_uptime_ms:1600,effect};
test("original Live image endpoints retain exact HID mapping, without any curve",()=>{
 const r=absoluteDragRequest({device_id:id,source_frame_id:boot,from_x:222,from_y:696,to_x:222,to_y:285,image_width:443,image_height:960,orientation_epoch:1});
 assert.deepEqual(r.payload,payload);
});
test("direct receipt needs matching endpoint, report counts and release",()=>{
 assert.doesNotThrow(()=>validateDragReceipt(receipt,id,boot,true,350,payload));
 for(const [key,value] of Object.entries({all_released:false,button_report_id:3,position_report_id:2,motion_reports_sent:14,final_y:9739,absolute_drag_v2:false})){
  assert.throws(()=>validateDragReceipt({...receipt,effect:{...effect,[key]:value}},id,boot,true,350,payload));
 }
 assert.throws(()=>validateDragReceipt(receipt,id,boot,true,350));
 assert.throws(()=>validateDragReceipt(receipt,boot,boot,true,350,payload));
});
test("partial direct movement is preserved but never classified executed",()=>{
 const partial={...receipt,state:"outcome_unknown",error:"INPUT_NOT_CONFIRMED_OR_EXPIRED",effect:{...effect,hid_reports_sent:false,motion_reports_sent:7,final_y:23781+Math.trunc((9738-23781)*7/15)}};
 assert.doesNotThrow(()=>validateDragReceipt(partial,id,boot,false,350,payload));
 assert.throws(()=>validateDragReceipt(partial,id,boot,true,350,payload));
 assert.throws(()=>validateDragReceipt({...partial,effect:{...partial.effect,final_y:0}},id,boot,false,350,payload));
});
test("legacy and relative receipts remain accepted",()=>{
 assert.doesNotThrow(()=>validateDragReceipt({...receipt,effect:{hid_reports_sent:true}},id,boot,true,350,payload));
 assert.doesNotThrow(()=>validateDragReceipt({...receipt,effect:{hid_reports_sent:true,relative_drag:true,all_released:true,delta_x_sent:0,delta_y_sent:-291}},id,boot,true,350,payload));
});
