import {absoluteDragRequest} from "../lib/absolute-drag.ts";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import {dragAdmissionRejectionSQL,logDragAdmissionRejection,type DragAdmissionRejection} from "../lib/drag-admission-diagnostic.ts";

const now=1794419810000;
const scope={device:"device",owner:"owner",session:"session",broadcast:"broadcast",worker:"worker"};
const privateSHA="PRIVATE_SHA_NEVER_LOG";
const privateJPEG="PRIVATE_JPEG_NEVER_LOG";
const capabilities=["hid.mouse.absolute","hid.mouse.drag_absolute","sayso.drag_at"] as const;
const authority=(at:string)=>`d.revoked=0 AND d.worker_expires>${at} AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.mouse_until>${at} AND h.usb_connected=1`;
const pending="NOT EXISTS(SELECT 1 FROM sb_mouse_commands c WHERE c.device_id=d.id AND c.state IN ('queued','claimed','executing','embedded'))";
const sql=dragAdmissionRejectionSQL(String(now),authority,capabilities,{pending_input_clear:pending});
const schema=readdirSync("drizzle").filter(name=>name.endsWith(".sql")).sort()
  .map(name=>readFileSync("drizzle/"+name,"utf8")).join("\n");
const intent=(frame:string)=>JSON.stringify({source_frame_id:frame,source_width:444,source_height:960,orientation_epoch:1});

function fixture() {
  const db=new DatabaseSync(":memory:");
  db.exec(schema);
  db.prepare("INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,confirmed_at,created_at,current_session,lease_epoch,worker_id,worker_expires) VALUES(?,?,'diagnostic','token',?,?,?,?,7,?,?)")
    .run(scope.device,scope.owner,now+9000,now,now,scope.session,scope.worker,now+9000);
  db.prepare("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,control_epoch,mouse_enabled,mouse_until,mode) VALUES(?,?,?,?,?,?,'active','active',?,2,1,?,'broadcast')")
    .run(scope.session,scope.owner,scope.device,scope.broadcast,"request","body",now,now+9000);
  db.prepare("INSERT INTO sb_hardware(device_id,owner_id,hardware_id,board_boot_id,metadata,usb_connected) VALUES(?,?,?,?,?,1)")
    .run(scope.device,scope.owner,"hardware","boot",JSON.stringify({capabilities:Object.fromEntries(capabilities.map(name=>[name,true])),private_note:"PRIVATE_STATUS_NEVER_LOG"}));
  function frame(frameID:string,seq:number,capture:number,mono:number,sha=privateSHA,accept=true) {
    const metadata={frame_id:frameID,bridge_session_id:scope.session,broadcast_id:scope.broadcast,worker_id:scope.worker,
      lease_epoch:7,source_seq:seq,capture_mono_ms:mono,capture_clock_verified:true,content_sha256:sha,
      provenance:"device_capture",width:444,height:960,native_width_px:828,native_height_px:1792,
      orientation:"portrait",orientation_epoch:1,content_rect:{x:0,y:0,width:444,height:960},transform_version:"1"};
    db.prepare("INSERT OR REPLACE INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,capture_lower,received_at,expires_at,storage_ready,inline_jpeg) VALUES(?,?,?,?,?,7,?,?,?,?,?,?,1,?)")
      .run(scope.device,scope.owner,scope.session,frameID,seq,"image",sha,JSON.stringify(metadata),capture,now,now+9000,privateJPEG);
    if(accept)db.prepare("INSERT INTO sb_observations(id,device_id,frame_id,created_at,acceptance_json) VALUES(?,?,?,?,?)")
      .run(scope.device+":"+frameID,scope.device,frameID,now,JSON.stringify({owner_id:scope.owner,control_epoch:2,frame_seq:seq,capture_lower_ms:capture,metadata}));
  }
  const read=(frameID:string,owner=scope.owner,cutoff=now+5000)=>db.prepare(sql)
    .get(now,intent(frameID),scope.device,owner,"diagnostic-idempotency",cutoff) as DragAdmissionRejection|undefined;
  return {db,frame,read};
}

test("drag admission rejection diagnoses exact source and each successor proof without projecting image bytes or hashes",t=>{
  const {db,frame,read}=fixture();
  t.after(()=>db.close());
  frame("reviewed",1,1794419807911.5403,216560356.29375002);
  frame("new-head",2,1794419809499.5403,216560756.29375002,privateSHA,false);
  const exact=JSON.parse(read("new-head")!.diagnostic_json);
  assert.equal(exact.view.eligible,1);
  assert.equal(exact.view.exact_source_frame,1);
  assert.equal(exact.view.head_proof.proof_present,0);

  frame("verified-head",3,1794419809501.5403,216560756.29375002);
  const row=read("reviewed")!;
  assert.equal(row.ready,1);
  assert.equal(row.capabilities_ready,1);
  const successor=JSON.parse(row.diagnostic_json);
  assert.equal(successor.view.exact_source_frame,0);
  assert.equal(successor.view.eligible,1);
  assert.equal(successor.view.source.retained_age,1);
  assert.ok(successor.view.source.age_ms>2000);
  assert.equal(successor.view.successor.sha_equal,1);
  assert.equal(successor.view.head_proof.capture_lower_exact,1);
  assert.equal(successor.view.head_proof.capture_mono_exact,1);

  db.prepare("UPDATE sb_observations SET acceptance_json=json_set(acceptance_json,'$.capture_lower_ms',?) WHERE frame_id='verified-head'")
    .run(1794419809501.54);
  const rounded=JSON.parse(read("reviewed")!.diagnostic_json);
  assert.equal(rounded.view.head_proof.capture_lower_exact,0);
  assert.equal(rounded.view.head_proof.capture_mono_exact,1);
  assert.equal(rounded.view.eligible,0);

  frame("changed-head",4,1794419809502.5403,216560856.29375002,"PRIVATE_DIFFERENT_SHA_NEVER_LOG");
  db.prepare("UPDATE sb_observations SET acceptance_json=json_set(acceptance_json,'$.control_epoch',99) WHERE frame_id='reviewed'").run();
  const changedRow=read("reviewed")!;
  const changed=JSON.parse(changedRow.diagnostic_json);
  assert.equal(changed.view.source.control_matches,0);
  assert.equal(changed.view.successor.sha_equal,0);
  assert.equal(changed.view.head_proof.sha_equal,1);
  assert.equal(changed.view.eligible,0);
  assert.doesNotMatch(changedRow.diagnostic_json,/PRIVATE|inline_jpeg|sha256/);
  const logged=t.mock.method(console,"info",()=>{});
  logDragAdmissionRejection("request",scope.device,"reviewed",changedRow.diagnostic_json);
  assert.equal(logged.mock.calls.length,1);
  const line=logged.mock.calls[0].arguments[0];
  assert.doesNotMatch(line,/PRIVATE/);
  assert.deepEqual(JSON.parse(line),{event:"drag_admission_rejected",request_id:"request",
    device_id:scope.device,source_frame_id:"reviewed",snapshot:changed});
});

test("drag rejection reports authority and stale view separately and skips accepted idempotent commands",t=>{
  const {db,frame,read}=fixture();
  t.after(()=>db.close());
  frame("reviewed",1,now-4000,216560356.29375002);
  frame("stale-head",2,now-2000,216560756.29375002);
  db.prepare("UPDATE sb_sessions SET mouse_enabled=0 WHERE id=?").run(scope.session);
  const denied=JSON.parse(read("reviewed",scope.owner,now)!.diagnostic_json);
  assert.equal(denied.admission.grant_enabled,0);
  assert.equal(denied.admission.authority_eligible,0);
  assert.equal(denied.admission.admission_time_remaining,0);
  assert.equal(denied.view.head.fresh_age,0);
  assert.equal(denied.view.source.retained_age,0);
  assert.equal(denied.view.eligible,0);
  const otherOwner=read("reviewed","other-owner")!;
  assert.equal(otherOwner.ready,0);
  assert.equal(JSON.parse(otherOwner.diagnostic_json).view.head.frame_id,null);

  db.prepare("INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,control_epoch,created_at,expires_at) VALUES(?,?,?,?,?,?,?,'{}','digest',?,'queued',2,?,?)")
    .run("command",scope.owner,scope.device,scope.session,"hardware","boot","pointer.drag_absolute","other-key",now,now+5000);
  assert.equal(JSON.parse(read("reviewed")!.diagnostic_json).admission.pending_input_clear,0);
  db.prepare("UPDATE sb_mouse_commands SET idempotency_key='diagnostic-idempotency' WHERE id='command'").run();
  assert.equal(read("reviewed"),undefined);
});

test("drag coordinates preserve pixel units and explicit fraction conversion",()=>{
  const base={device_id:"c00a407b-77fd-4afc-b633-61c818165947",
    source_frame_id:"e7505289-6cc9-4247-ba5f-e56f01f18738",
    image_width:443,image_height:960,orientation_epoch:1,
    from_x:0.015,from_y:0.52,to_x:0.8,to_y:0.52};
  const tiny=absoluteDragRequest(base);
  assert.equal(tiny.intent.coordinate_space,"full_screen_image_pixels");
  assert.equal(tiny.intent.source_from_x,0.015);
  assert.equal(tiny.intent.source_from_y,0.52);
  assert.equal(tiny.payload.from_x,1);
  assert.equal(tiny.payload.to_x,59);
  const converted=absoluteDragRequest({...base,from_x:0.015*442,from_y:0.52*959,to_x:0.8*442,to_y:0.52*959});
  assert.equal(converted.payload.from_x,Math.round(0.015*32767));
  assert.equal(converted.payload.to_x,Math.round(0.8*32767));
  assert.equal(converted.payload.from_y,Math.round(0.52*32767));
  assert.equal(converted.payload.from_y,converted.payload.to_y);
});
