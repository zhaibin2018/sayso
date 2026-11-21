import assert from "node:assert/strict";
import {test} from "node:test";
import {compactMcpSummary} from "../lib/mcp-performance.ts";

const metadata={device_id:"device",frame_id:"actual-frame",width:444,height:960,orientation_epoch:1};
const source={source_frame_id:"actual-frame",device_id:"device",image_width:444,image_height:960,orientation_epoch:1};
const parked={...source,source_frame_id:"parked-selector"};

test("actual visual source exposes one click argument tuple in model text",()=>{
  const raw={state:"available",image_blocks:1,metadata,source_point_proof:"visual-proof",mcp_request_id:"request",image_ref:"dedupe"};
  const compact=JSON.parse(compactMcpSummary(raw,false,false,false,true));
  assert.deepEqual(compact.click_at_source,{...source,source_point_proof:"visual-proof"});
  assert.match(compact.click_at_instruction,/original-image pixel x and y/);
  assert.doesNotMatch(compact.click_at_instruction,/x=0|target_region|landmark_region/);
  assert.equal(compact.mcp_request_id,undefined);
  assert.equal(compact.image_ref,undefined);
  assert.equal(compact.metadata,undefined);
  assert.equal(compact.source_point_proof,undefined);
  assert.deepEqual(raw.metadata,metadata);
  const withheld=JSON.parse(compactMcpSummary({...raw,state:"unavailable",image_blocks:0},false,false,false,false));
  assert.equal(withheld.click_at_source,undefined);
});

test("compact unsubmitted click reports the independently saved move without leaking its receipt",()=>{
  const raw={state:"failed",error:"POINT_CLICK_NOT_SUBMITTED",
    command_id:"original-click",click_command_id:"original-click",move_command_id:"original-move",
    input_not_submitted:true,click_submitted:false,
    move_result:{command_id:"original-move",state:"outcome_unknown",error:"USB_OUTCOME_UNKNOWN",
      input_attempted:true,payload:{x:42},board_receipt:{unsafe:"not surfaced"}}};
  const compact=(value:Record<string,unknown>)=>JSON.parse(compactMcpSummary(value,false,true));
  assert.deepEqual(compact(raw).move_result,{state:"outcome_unknown",error:"USB_OUTCOME_UNKNOWN",input_attempted:true});
  assert.equal(compact(raw).move_command_id,"original-move");
  assert.equal(compact(raw).click_command_id,"original-click");
  assert.match(compact(raw).click_at_instruction,/get_mouse_result/);
  const refused={...raw,move_result:{...raw.move_result,state:"failed",error:"MOUSE_PRECONDITION_FAILED",input_attempted:false}};
  assert.deepEqual(compact(refused).move_result,{state:"failed",error:"MOUSE_PRECONDITION_FAILED",input_attempted:false});
  const mismatched={...raw,move_result:{...raw.move_result,command_id:"unrelated"}};
  assert.equal(compact(mismatched).move_result,undefined);
  const uncertain={...raw,state:"outcome_unknown",input_not_submitted:false,click_submitted:null};
  assert.equal(compact(uncertain).move_result,undefined);
  assert.equal(compact(uncertain).click_at_instruction,undefined);
});

test("retired parked metadata cannot revive region clicks or erase a failed result",()=>{
 const raw={state:"failed",error:"MOUSE_PRECONDITION_FAILED",command_id:"failed-click",input_not_submitted:true,parked_move_observed:true,move_command_id:"move",after_screen:{state:"available",metadata,parked_click:parked,source_point_proof:"proof",after_command:{command_id:"move",lower_gap_ms:300}}};
 const compact=JSON.parse(compactMcpSummary(raw,false,true,true));
 assert.equal(compact.state,"failed");assert.equal(compact.command_id,"failed-click");assert.equal(compact.parked_click,undefined);assert.equal(compact.parked_click_instruction,undefined);
 assert.doesNotMatch(JSON.stringify(compact),/target_region|landmark_region|x=0/);
});

test("confirmed click relook preserves the exact new press and focus frame",()=>{
  const raw={state:"board_acked",kind:"pointer.click",command_id:"confirmed-press",
    after_screen:{state:"available",metadata,source_field_proof:"field-proof",
      after_command:{command_id:"confirmed-press",lower_gap_ms:320}}};
  const compact=JSON.parse(compactMcpSummary(raw,false,false,false,false,true));
  assert.deepEqual(compact.after_screen,raw.after_screen);
  const oldMove={...raw,after_screen:{...raw.after_screen,after_command:{command_id:"original-move",lower_gap_ms:320}}};
  assert.equal(JSON.parse(compactMcpSummary(oldMove,false,false,false,false,true)).after_screen,undefined);
});

test("a linked type-only result exposes only current click arguments, never its retired query proof",()=>{
  const raw={state:"board_acked",command_id:"type-command",mcp_request_id:"other-uuid",
    after_screen:{state:"available",metadata,source_query_proof:"query-proof",
      after_command:{command_id:"type-command",lower_gap_ms:320}}};
  const compact=(value:Record<string,unknown>,actualImage=true)=>
    JSON.parse(compactMcpSummary(value,false,false,false,false,false,actualImage));
  assert.deepEqual(compact(raw).click_at_source,source);
  assert.equal(compact(raw).click_at_source.source_query_proof,undefined);
  assert.equal(compact(raw).enter_sent,false);
  assert.equal(compact(raw).mcp_request_id,undefined);
  assert.match(compact(raw).click_at_instruction,/original-image pixel x and y/);
  assert.equal(compact(raw,false).click_at_source,undefined);
  assert.equal(compact({...raw,state:"outcome_unknown"}).click_at_source,undefined);
  assert.equal(compact({...raw,after_screen:{...raw.after_screen,source_query_proof:undefined}}).click_at_source,undefined);
  assert.equal(compact({...raw,after_screen:{...raw.after_screen,after_command:{command_id:"old",lower_gap_ms:320}}}).click_at_source,undefined);
  const submitted=compact({...raw,text_input:{enter_sent:true}});
  assert.equal(submitted.enter_sent,true);
  assert.equal(submitted.click_at_source,undefined);
});

test("host focus review exposes the rendition and action frame only with its image",()=>{
  const review_image={mime_type:"image/png",width:222,height:480,stage:"initial",
    purpose:"spotlight_focus_review",coordinate_space:"normalized_full_frame"};
  const focused={state:"review_required",preparation_id:"prep",device_id:metadata.device_id,
    review_frame_id:metadata.frame_id,review_image,after_screen:{state:"available",metadata,
      after_command:{command_id:"shortcut",lower_gap_ms:1200}}};
  const compact=(value:Record<string,unknown>,hasImage:boolean)=>
    JSON.parse(compactMcpSummary(value,false,false,false,false,false,false,{hasImage}));
  const rendered=compact(focused,true);
  assert.deepEqual(rendered.review_image,review_image);
  assert.deepEqual(rendered.search_app_review,{preparation_id:"prep",device_id:metadata.device_id,review_frame_id:metadata.frame_id});
  assert.equal(rendered.click_at_source,undefined);
  const status=compact(focused,false);
  assert.equal(status.review_frame_id,metadata.frame_id);
  assert.equal(status.search_app_review,undefined);
  assert.equal(status.review_image,undefined);
  const noImage=compact({state:"review_image_unavailable",preparation_id:"prep",relook_focus_available:true},false);
  assert.match(noImage.review_image_instruction,/once.*relook_focus=true/);
  const expired=compact({state:"outcome_unknown",reason:"SPOTLIGHT_REVIEW_EXPIRED",shortcut_state:"board_acked"},false);
  assert.equal(expired.reason,"SPOTLIGHT_REVIEW_EXPIRED");
  assert.equal(expired.shortcut_state,"board_acked");
  assert.equal(expired.review_image_instruction,undefined);
});

test("direct Search focus image includes original field reference without a click selector",()=>{
  const focus_image={mime_type:"image/png",width:222,height:480,
    purpose:"spotlight_focus",coordinate_space:"normalized_full_frame"};
  const observation={kind:"keyboard.open_search",state:"board_acked",command_id:"shortcut",focus_image,
    after_screen:{state:"available",metadata,after_command:{command_id:"shortcut",lower_gap_ms:960},source_field_proof:"proof"}};
  const compact=(value:Record<string,unknown>)=>JSON.parse(compactMcpSummary(value));
  assert.deepEqual(compact(observation).focus_image,focus_image);
  assert.deepEqual(compact(observation).after_screen,observation.after_screen);
  assert.equal(compact(observation).click_at_source,undefined);
  const unrelated=compact({...observation,after_screen:{...observation.after_screen,after_command:{command_id:"another"}}});
  assert.equal(unrelated.focus_image,undefined);
  const unconfirmed=compact({...observation,state:"outcome_unknown"});
  assert.equal(unconfirmed.focus_image,undefined);
});

const scopedMetadata={...metadata,bridge_session_id:"session",broadcast_id:"broadcast",worker_id:"worker",
  worker_id_at_read:"worker",lease_epoch:2,control_epoch_at_read:3,orientation:"portrait",
  frame_seq:19,source_seq:21,age_ms:100,capture_clock_verified:true,capture_lower_phone_mono_ms:10200};
const originalOrder={command_id:"action",command_state:"board_acked",relation:"capture_after_phone_board_ack",
  scope_matches_at_snapshot:true,phone_clock:"iphone_system_uptime_ms",phone_ack_mono_ms:9900,
  capture_lower_phone_mono_ms:10200,lower_gap_ms:300,minimum_gap_ms:100};

test("a delivered raw command, scroll, drag or legacy text image retains only its real handoff evidence",()=>{
  const project=(value:Record<string,unknown>,image?:"command")=>
    JSON.parse(compactMcpSummary(value,false,false,false,false,false,false,undefined,image));
  for(const kind of ["pointer.click","pointer.move_absolute","pointer.move_relative","pointer.scroll","pointer.drag_absolute",
    "keyboard.open_search","keyboard.type_text","spotlight.type_google_map"]){
    const raw={kind,state:"board_acked",command_id:"action",device_id:"device",bridge_session_id:"session",
      after_screen:{state:"available",metadata:{...scopedMetadata,other:"discard"},after_command:{...originalOrder,other:"discard"},
        source_field_proof:"real-field-proof",source_query_proof:"real-query-proof",unsafe:"discard"}};
    const handoff=project(raw,"command");
    assert.deepEqual(handoff.after_screen,{state:"available",metadata:scopedMetadata,after_command:originalOrder,
      source_field_proof:"real-field-proof",source_query_proof:"real-query-proof"});
    assert.equal(handoff.click_at_source,undefined);
    assert.equal(project(raw).after_screen,undefined);
    assert.equal(project({...raw,state:"outcome_unknown"},"command").after_screen,undefined);
    assert.equal(project({...raw,bridge_session_id:"replacement"},"command").after_screen,undefined);
    assert.equal(project({...raw,after_screen:{...raw.after_screen,
      after_command:{...originalOrder,command_id:"other"}}},"command").after_screen,undefined);
    assert.equal(project({...raw,after_screen:{...raw.after_screen,
      after_command:{...originalOrder,scope_matches_at_snapshot:false}}},"command").after_screen,undefined);
  }
});

test("plan and preparation images preserve their actual identities without creating an ordinary command receipt",()=>{
  const project=(value:Record<string,unknown>,image?:"plan"|"preparation"|"browse")=>
    JSON.parse(compactMcpSummary(value,false,false,false,false,false,false,undefined,image));
  const plan={state:"succeeded",plan_id:"plan",device_id:"device",bridge_session_id:"session",
    verification:"phone_pixel_effect_and_sites_acceptance",after_screen:{state:"available",metadata:scopedMetadata}};
  assert.equal(project(plan,"plan").plan_id,"plan");
  assert.deepEqual(project(plan,"plan").after_screen,plan.after_screen);
  assert.equal(project({...plan,state:"executing"},"plan").after_screen,undefined);
  const prepared={state:"completed",preparation_id:"prep",after_screen:{state:"available",metadata:scopedMetadata,
    relation:"capture_after_original_child_ack",child_command_id:"child",phone_ack_mono_ms:9900}};
  assert.equal(project(prepared,"preparation").preparation_id,"prep");
  assert.deepEqual(project(prepared,"preparation").after_screen,prepared.after_screen);
  assert.equal(project(prepared,"preparation").after_screen.after_command,undefined);
  const browse={state:"active",run_id:"browse",image_state:"available",image_metadata:scopedMetadata};
  assert.deepEqual(project(browse,"browse").image_metadata,scopedMetadata);
  assert.equal(project(browse,"browse").after_screen,undefined);
  assert.equal(project(browse).image_metadata,undefined);
});
