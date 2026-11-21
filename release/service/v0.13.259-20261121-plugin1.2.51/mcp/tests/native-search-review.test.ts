import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {DatabaseSync,type SQLInputValue} from "node:sqlite";
import {test} from "node:test";
import {BridgeEngine} from "../lib/bridge-engine.ts";
import {FrameUploadPermits} from "../lib/frame-upload-permit.ts";
import type {NativeSearchReviewState} from "../lib/native-search-review.ts";

const owner={id:"native-owner",label:"Native fixture"},other={id:"other-owner",label:"Other fixture"};
const key="4c".repeat(32);
const migrations=new URL("../drizzle/",import.meta.url);
const migrationSQL=readdirSync(migrations).filter(name=>name.endsWith(".sql")).sort()
  .map(name=>readFileSync(new URL(name,migrations),"utf8"));

function fixture(){
  const db=new DatabaseSync(":memory:");
  for(const sql of migrationSQL)db.exec(sql);
  const d1={prepare:(sql:string)=>({bind:(...values:SQLInputValue[])=>({
    first:async()=>db.prepare(sql).get(...values)??null,
  })})} as unknown as D1Database;
  const engine=()=>new BridgeEngine({db:d1,bucket:{} as R2Bucket,framePermits:new FrameUploadPermits(key)});
  const now=Date.now(),[preparation,device,session,broadcast,worker,hardware,boot,command,frame]=Array.from({length:9},()=>randomUUID());
  const view:NativeSearchReviewState={preparation,device,argsDigest:"9".repeat(64),stage:"focus",shortcut:command,command,frame,
    sha256:"a".repeat(64),nonce:randomUUID(),width:444,height:960,orientationEpoch:1,captureLower:now-100,
    originalGapMS:410,relook:false,observeUntil:now+4000,issued:now,expires:now+5000};
  db.prepare("INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,confirmed_at,created_at,current_session,lease_epoch,worker_id,worker_expires) "+
    "VALUES(?,?,?,?,?,?,?,?,7,?,?)").run(device,owner.id,"test","token",now+30000,now,now,session,worker,now+30000);
  db.prepare("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,control_epoch,mouse_enabled,mouse_until,mode) "+
    "VALUES(?,?,?,?,?,?,'active','active',?,2,1,?,'broadcast')").run(session,owner.id,device,broadcast,randomUUID(),"body",now,now+30000);
  db.prepare("INSERT INTO sb_hardware(device_id,owner_id,hardware_id,board_boot_id,metadata,usb_connected) "+
    "VALUES(?,?,?,?,?,1)").run(device,owner.id,hardware,boot,"{}");
  db.prepare("INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,"+
    "worker_id,lease_epoch,control_epoch,created_at,expires_at,result_digest,phone_ack_mono_ms) "+
    "VALUES(?,?,?,?,?,?,'keyboard.open_search','{}',?,?,'board_acked',?,7,2,?,?,?,10000)").run(command,owner.id,device,session,hardware,boot,
      "action",randomUUID(),worker,now-500,now+2000,"receipt");
  const accepted={owner_id:owner.id,control_epoch:2,capture_lower_ms:view.captureLower,metadata:{
    bridge_session_id:session,broadcast_id:broadcast,worker_id:worker,lease_epoch:7,capture_clock_verified:true,
    provenance:"device_capture",content_sha256:view.sha256,width:view.width,height:view.height,orientation_epoch:view.orientationEpoch,
    capture_mono_ms:10410,
  }};
  db.prepare("INSERT INTO sb_observations(id,device_id,frame_id,created_at,acceptance_json) VALUES(?,?,?,?,?)")
    .run(device+":"+frame,device,frame,now,JSON.stringify(accepted));
  db.prepare("INSERT INTO sb_app_search_queries(id,owner_id,device_id,digest,created_at) VALUES(?,?,?,?,?)")
    .run(preparation,owner.id,device,view.argsDigest,now-1000);
  return {db,engine,view};
}

test("native search review HMAC binds owner, exact frame references, domain and expiry",async()=>{
  const {db,view}=fixture();
  try{
    const permits=new FrameUploadPermits(key);
    const signed=await permits.issueNativeSearchReview(owner.id,view);
    assert.ok(signed);
    assert.deepEqual(await new FrameUploadPermits(key).verifyNativeSearchReview(owner.id,signed,view.issued+1),view);
    assert.equal(await permits.verifyNativeSearchReview(other.id,signed,view.issued+1),null);
    assert.equal(await permits.verifyNativeSearchReview(owner.id,signed+"x",view.issued+1),null);
    assert.equal(await permits.verifyNativeSearchReview(owner.id,signed,view.expires),null);
    assert.equal(await permits.verifyReleasedFieldViewProof(owner.id,signed,view.issued+1),null);
    assert.equal(await new FrameUploadPermits().issueNativeSearchReview(owner.id,view),undefined);
    assert.equal(await permits.issueNativeSearchReview(owner.id,{...view,captureLower:view.issued-2000}),undefined);
  }finally{db.close();}
});

test("native search review durable compare-and-swap permits one issuer and one consumer across engines",async()=>{
  const {db,engine,view}=fixture();
  try{
    const a=engine(),b=engine();
    const published=(await Promise.all([a.issueNativeSearchReview(owner,view),
      b.issueNativeSearchReview(owner,{...view,nonce:randomUUID()})])).filter(Boolean);
    assert.equal(published.length,1);
    const token=published[0]!;
    assert.equal(await b.consumeNativeSearchReview(other,token),null);
    const verified=await a.verifyNativeSearchReview(owner,token);
    assert.ok(verified);
    assert.equal(verified.frame,view.frame);
    assert.equal(await a.issueNativeSearchReview(owner,{...view,nonce:randomUUID()},token),undefined);
    const won=(await Promise.all([a.consumeNativeSearchReview(owner,token),b.consumeNativeSearchReview(owner,token)])).filter(Boolean);
    assert.deepEqual(won,[verified]);
    const next=await b.issueNativeSearchReview(owner,{...view,nonce:randomUUID(),relook:true},token);
    assert.ok(next&&next!==token);
    assert.equal(await a.consumeNativeSearchReview(owner,token),null);
    assert.equal((await a.consumeNativeSearchReview(owner,next))?.relook,true);
  }finally{db.close();}
});

test("native search review cannot consume after authority or the exact accepted JPEG changes",async t=>{
  const changes={
    control:"UPDATE sb_sessions SET control_epoch=control_epoch+1",
    board:"UPDATE sb_hardware SET board_boot_id='replacement'",
    stopped:"UPDATE sb_sessions SET capture_state='stopped'",
    jpeg:"UPDATE sb_observations SET acceptance_json=json_set(acceptance_json,'$.metadata.content_sha256','changed')",
    finished:"UPDATE sb_app_search_queries SET finished_at=created_at+1",
  };
  for(const [mode,sql] of Object.entries(changes))await t.test(mode,async()=>{
    const {db,engine,view}=fixture();
    try{
      const a=engine(),token=await a.issueNativeSearchReview(owner,view);
      assert.ok(token);
      db.exec(sql);
      assert.equal(await a.consumeNativeSearchReview(owner,token),null);
      assert.equal((db.prepare("SELECT native_review_state FROM sb_app_search_queries").get()?.native_review_state as string).startsWith("pending:"),true);
      assert.equal((db.prepare("SELECT count(*) n FROM sb_mouse_commands").get()?.n),1);
    }finally{db.close();}
  });
});
