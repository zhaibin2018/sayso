import assert from "node:assert/strict";
import {test} from "node:test";
import {imageHandoff} from "../lib/image-handoff.ts";
import {compactMcpSummary} from "../lib/mcp-performance.ts";
const image=[{type:"image",mimeType:"image/jpeg",data:"fixture"}];
const metadata={device_id:"phone",frame_id:"f1",width:443,height:960,orientation_epoch:1,
  bridge_session_id:"session",capture_clock_verified:true,age_ms:900};
const after=(id:string,frame:string)=>({state:"board_acked",command_id:id,device_id:"phone",
  after_screen:{state:"available",metadata:{...metadata,frame_id:frame},
    after_command:{command_id:id,command_state:"board_acked",relation:"capture_after_phone_board_ack",
      scope_matches_at_snapshot:true,lower_gap_ms:301}}});

test("read then click/type/scroll/drag hand off one exact image with no intervening read",()=>{
  let context=imageHandoff({state:"available",metadata},image)!;
  assert.equal(context.source_frame_id,"f1");
  for(const action of ["click","type","scroll","drag"]){
    const used=context.source_frame_id;
    const value=after(action,action+"-frame");
    const handoff=imageHandoff(value,image)!;
    assert.notEqual(handoff.source_frame_id,used);
    const wire=JSON.parse(compactMcpSummary({...value,image_handoff:handoff}));
    assert.deepEqual(wire.image_handoff,handoff);
    assert.equal(handoff.source_after_command_id,action);
    assert.equal(value.after_screen.metadata.age_ms,900);
    assert.equal(handoff.age_ms,undefined);
    context=wire.image_handoff;
  }
});
test("missing images, unknown input and invalid after barriers cannot authorize a handoff",()=>{
  const value=after("click","f2");
  for(const images of [[],[...image,...image],[{type:"text",data:"fixture"}]]){
    assert.equal(imageHandoff(value,images),undefined);
  }
  for(const patch of [{state:"outcome_unknown"},{device_id:"different"},{bridge_session_id:"different"}]){
    assert.equal(imageHandoff({...value,...patch},image),undefined);
  }
  for(const patch of [{command_id:"other"},{lower_gap_ms:0},{scope_matches_at_snapshot:false},{command_state:"queued"}]){
    assert.equal(imageHandoff({...value,after_screen:{...value.after_screen,
      after_command:{...value.after_screen.after_command,...patch}}},image),undefined);
  }
  for(const patch of [{capture_clock_verified:false},{is_repeated:true}]){
    assert.equal(imageHandoff({...value,after_screen:{...value.after_screen,metadata:{...metadata,...patch}}},image),undefined);
  }
});
test("a focus PNG preserves displayed dimensions separately from action coordinates",()=>{
  const value={...after("search","focus"),focus_image:{width:222,height:480}};
  const handoff=imageHandoff(value,[{...image[0],mimeType:"image/png"}])!;
  assert.equal(handoff.displayed_width,222);
  assert.equal(handoff.image_width,443);
  assert.equal(handoff.source_after_command_id,"search");
  const uuid="12345678-1234-4234-8234-123456789abc";
  const realIDs={...handoff,device_id:uuid,source_frame_id:uuid,source_after_command_id:uuid};
  assert.ok(Buffer.byteLength(JSON.stringify(realIDs))<=320,"Handoff must remain a small argument tuple, not duplicate all metadata");
});
