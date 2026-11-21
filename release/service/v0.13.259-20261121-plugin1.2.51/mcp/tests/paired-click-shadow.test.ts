import {test} from "node:test";
import assert from "node:assert/strict";
import {PairedClickShadowRegistry, type ShadowScope, type ShadowReceipt, type ShadowFrame} from "../lib/paired-click-shadow.ts";

const scope:ShadowScope={owner:"PRIVATE_OWNER",device:"PRIVATE_DEVICE",session:"PRIVATE_SESSION",broadcast:"PRIVATE_BROADCAST",
  worker:"PRIVATE_WORKER",lease:4,control:7,hardware:"PRIVATE_HARDWARE",boot:"PRIVATE_BOOT",move:"PRIVATE_MOVE",click:"PRIVATE_CLICK"};
const receipt:ShadowReceipt={...scope,ack:5000};
const frame:ShadowFrame={owner:scope.owner,device:scope.device,session:scope.session,broadcast:scope.broadcast,worker:scope.worker,
  lease:scope.lease,frame:"PRIVATE_FRAME_A",capture:5301,age:100};
function finalFields(frameID=frame.frame):Record<string,unknown>{
  return {state:"board_acked",device_id:scope.device,bridge_session_id:scope.session,hardware_id:scope.hardware,
    board_boot_id:scope.boot,move_command_id:scope.move,command_id:scope.click,
    after_screen:{state:"available",metadata:{device_id:scope.device,bridge_session_id:scope.session,broadcast_id:scope.broadcast,
      worker_id:scope.worker,worker_id_at_read:scope.worker,lease_epoch:scope.lease,control_epoch_at_read:scope.control,
      frame_id:frameID,capture_clock_verified:true,capture_lower_phone_mono_ms:5301,age_ms:100},
      after_command:{command_id:scope.click,phone_ack_mono_ms:receipt.ack,scope_matches_at_snapshot:true,
        relation:"capture_after_phone_board_ack",app_effect_observed:false}}};
}
const obj=(value:unknown)=>value as Record<string,unknown>;
function lab(){let now=0;const registry=new PairedClickShadowRegistry(()=>now);return {registry,set:(value:number)=>{now=value;}};}
function frozen(){
  const l=lab(),ticket=l.registry.register(scope,6000)!;assert.ok(ticket);
  l.set(10);l.registry.receiptCommitted(receipt);
  l.set(20);ticket.observedReceipt(receipt);
  l.set(30);l.registry.frameCommitted(frame);
  l.set(50);const project=ticket.freeze();assert.ok(project);
  return {...l,ticket,project};
}

test("paired click shadow: capacity is64 and lazy expiry frees registrations without timers",()=>{
  const l=lab(),tickets=[];
  for(let i=0;i<64;i++){
    const ticket=l.registry.register({...scope,move:`move-${i}`,click:`click-${i}`},100);
    assert.ok(ticket);tickets.push(ticket);
  }
  assert.equal(l.registry.registrations,64);
  assert.equal(l.registry.register(scope,100),undefined);
  l.set(100);
  assert.equal(l.registry.registrations,64,"Expiry has no background timer");
  const current=l.registry.register(scope,200);assert.ok(current);assert.equal(l.registry.registrations,1);
  for(const ticket of tickets)ticket.close();
  assert.equal(l.registry.registrations,1,"Old handles cannot remove another registration");
  current.close();assert.equal(l.registry.registrations,0);
});

test("paired click shadow: close in finally and AbortSignal clean up without producing a projection",()=>{
  const l=lab(),ticket=l.registry.register(scope,6000)!;
  assert.throws(()=>{try{throw new Error("cancelled request");}finally{ticket.close();}},/cancelled/);
  ticket.close();ticket.observedReceipt(receipt);
  assert.equal(ticket.freeze(),undefined);assert.equal(l.registry.registrations,0);
  const controller=new AbortController(),aborted=l.registry.register(scope,6000,controller.signal)!;
  assert.ok(aborted);controller.abort();assert.equal(l.registry.registrations,0);
  aborted.close();assert.equal(aborted.freeze(),undefined);
  assert.equal(l.registry.register(scope,6000,controller.signal),undefined);
});

test("paired click shadow: invalid or expired registration never becomes observable",()=>{
  const l=lab();
  for(const deadline of [0,-1,6001,NaN,Infinity])assert.equal(l.registry.register(scope,deadline),undefined);
  for(const invalid of [{...scope,move:scope.click},{...scope,owner:""},{...scope,lease:0},{...scope,control:NaN}]){
    assert.equal(l.registry.register(invalid,6000),undefined);
  }
  const ticket=l.registry.register(scope,100)!;ticket.observedReceipt(receipt);l.set(100);
  assert.equal(ticket.freeze(),undefined);assert.equal(l.registry.registrations,0);
});

test("paired click shadow: every receipt scope field and the exact original ACK are bound",()=>{
  for(const key of Object.keys(scope) as (keyof ShadowScope)[]){
    const l=lab(),ticket=l.registry.register(scope,6000)!;
    const wrong={...receipt,[key]:typeof receipt[key]==="number"?Number(receipt[key])+1:"WRONG_SCOPE"};
    l.registry.receiptCommitted(wrong);ticket.observedReceipt(wrong);l.registry.frameCommitted(frame);
    assert.equal(ticket.freeze(),undefined,key);
  }
  const l=lab(),ticket=l.registry.register(scope,6000)!;
  ticket.observedReceipt(receipt);l.registry.receiptCommitted({...receipt,ack:receipt.ack+1});
  l.registry.frameCommitted(frame);const project=ticket.freeze()!;
  const value=project(scope.owner,finalFields())!;
  assert.equal(value.receipt_read_seen,1);assert.equal(value.receipt_commit_notice_seen,0);
  const wrong=finalFields();obj(obj(wrong.after_screen).after_command).phone_ack_mono_ms=receipt.ack+1;
  assert.equal(project(scope.owner,wrong),undefined);
});

test("paired click shadow: frame notices before the receipt anchor or from another scope are ignored",()=>{
  const l=lab(),ticket=l.registry.register(scope,6000)!;
  l.registry.frameCommitted(frame);l.set(10);ticket.observedReceipt(receipt);
  for(const key of ["owner","device","session","broadcast","worker","lease"] as const){
    l.registry.frameCommitted({...frame,[key]:typeof frame[key]==="number"?Number(frame[key])+1:"WRONG_FRAME_SCOPE"});
  }
  l.set(9);l.registry.frameCommitted(frame);l.set(20);
  const value=ticket.freeze()!(scope.owner,finalFields())!;
  assert.equal(value.eligible_frame_commit_notices,0);
  assert.equal(value.first_frame_notice_matches_returned,0);
});

test("paired click shadow: capture must be strictly after ACK+300 and age strictly below1000",()=>{
  const l=lab(),ticket=l.registry.register(scope,6000)!;ticket.observedReceipt(receipt);
  for(const patch of [{capture:5300},{capture:5299},{capture:NaN},{capture:Infinity},{age:1000},{age:1001},{age:-1},{age:NaN}]){
    l.registry.frameCommitted({...frame,...patch});
  }
  l.set(10);l.registry.frameCommitted({...frame,age:999.999});
  l.registry.frameCommitted({...frame,age:999.999});
  const value=ticket.freeze()!(scope.owner,finalFields())!;
  assert.equal(value.eligible_frame_commit_notices,1);
  assert.equal(value.first_frame_notice_age_upper_ms,999.999);
});

test("paired click shadow: duplicate frame IDs do not recount after an intervening frame",()=>{
  const l=lab(),ticket=l.registry.register(scope,6000)!;ticket.observedReceipt(receipt);
  l.set(10);l.registry.frameCommitted(frame);
  l.set(20);l.registry.frameCommitted({...frame,frame:"PRIVATE_FRAME_B",capture:5302});
  l.set(30);l.registry.frameCommitted(frame);
  const value=ticket.freeze()!(scope.owner,finalFields("PRIVATE_FRAME_B"))!;
  assert.equal(value.eligible_frame_commit_notices,2);
  assert.equal(value.first_frame_notice_matches_returned,0);
  assert.equal(value.latest_frame_notice_matches_returned,1);
});

test("paired click shadow: freezing detaches live state and outputs only immutable numeric telemetry",()=>{
  const c=frozen();assert.equal(c.registry.registrations,0);assert.equal(c.ticket.freeze(),undefined);
  const before=c.project(scope.owner,finalFields())!;
  assert.deepEqual(before,{registered:1,receipt_commit_notice_seen:1,receipt_read_seen:1,eligible_frame_commit_notices:1,
    registration_to_candidate_ready_ms:50,registration_to_receipt_commit_notice_ms:10,receipt_notice_to_receipt_read_ms:10,
    registration_to_first_frame_notice_ms:30,first_frame_notice_to_candidate_ready_ms:20,first_frame_notice_age_upper_ms:100,
    first_frame_notice_matches_returned:1,latest_frame_notice_matches_returned:1});
  c.set(100);c.registry.receiptCommitted(receipt);c.registry.frameCommitted({...frame,frame:"OTHER_FRAME"});c.ticket.observedReceipt(receipt);
  assert.deepEqual(c.project(scope.owner,finalFields()),before);
  before.registered=999;assert.equal(c.project(scope.owner,finalFields())!.registered,1);
  for(const value of Object.values(c.project(scope.owner,finalFields())!))assert.ok(typeof value==="number"&&Number.isFinite(value));
  const actual=finalFields();actual.pixels="SECRET_PIXELS";actual.secret="SECRET_TOKEN";
  assert.doesNotMatch(JSON.stringify(c.project(scope.owner,actual)),/PRIVATE|SECRET|OWNER|DEVICE|FRAME_A/);
});

test("paired click shadow: final top-level and image scope must match the registered original pair",()=>{
  const c=frozen();assert.equal(c.project("OTHER_OWNER",finalFields()),undefined);
  for(const key of ["device_id","bridge_session_id","hardware_id","board_boot_id","move_command_id","command_id"]){
    const fields=finalFields();fields[key]="WRONG_FINAL_SCOPE";
    assert.equal(c.project(scope.owner,fields),undefined,key);
  }
  for(const key of ["device_id","bridge_session_id","broadcast_id","worker_id","worker_id_at_read","lease_epoch","control_epoch_at_read"]){
    const fields=finalFields(),metadata=obj(obj(fields.after_screen).metadata);
    metadata[key]=typeof metadata[key]==="number"?Number(metadata[key])+1:"WRONG_IMAGE_SCOPE";
    assert.equal(c.project(scope.owner,fields),undefined,key);
  }
});

test("paired click shadow: final proof and read-clock failures never expose frozen statistics",()=>{
  const c=frozen();
  for(const patch of [{age_ms:1000},{age_ms:-1},{age_ms:NaN},{capture_clock_verified:false},
    {capture_lower_phone_mono_ms:5300},{capture_lower_phone_mono_ms:Infinity}]){
    const fields=finalFields();Object.assign(obj(obj(fields.after_screen).metadata),patch);
    assert.equal(c.project(scope.owner,fields),undefined,JSON.stringify(patch));
  }
  for(const patch of [{command_id:"WRONG_COMMAND"},{phone_ack_mono_ms:4999},{scope_matches_at_snapshot:false},{relation:"not_after_receipt"}]){
    const fields=finalFields();Object.assign(obj(obj(fields.after_screen).after_command),patch);
    assert.equal(c.project(scope.owner,fields),undefined,JSON.stringify(patch));
  }
  for(const [section,state] of [["top","outcome_unknown"],["after","unchanged"]]){
    const fields=finalFields();if(section==="top")fields.state=state;else obj(fields.after_screen).state=state;
    assert.equal(c.project(scope.owner,fields),undefined);
  }
});

test("paired click shadow: callback clock exceptions fail open and freeze still cleans up",()=>{
  let fail=false;const registry=new PairedClickShadowRegistry(()=>{if(fail)throw new Error("clock unavailable");return 0;});
  const ticket=registry.register(scope,6000)!;assert.ok(ticket);fail=true;
  assert.doesNotThrow(()=>registry.receiptCommitted(receipt));
  assert.doesNotThrow(()=>registry.frameCommitted(frame));
  assert.doesNotThrow(()=>ticket.observedReceipt(receipt));
  assert.equal(registry.register(scope,6000),undefined);
  assert.equal(ticket.freeze(),undefined);assert.equal(registry.registrations,0);
  assert.doesNotThrow(()=>ticket.close());
});
