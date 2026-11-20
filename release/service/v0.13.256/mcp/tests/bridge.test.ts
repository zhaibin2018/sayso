import {PairedClickShadowRegistry} from "../lib/paired-click-shadow.ts";
import { test } from "node:test";

test("current contract: drag uses scoped server evidence without old pixel or age gates",async t=>{
  for(const mode of ["old_reference","changed_after_admission","source_missing","control_changed","geometry_changed","current_image_stale","current_capability_missing"] as const)await t.test(mode,async()=>{
    const {l,r,caps,led,args,source,count}=await realDragFixture();
    for(let i=0;i<20;i++){l.tick(1000);await l.service.heartbeat(r.actor,r.beat);}
    const bytes=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,97)},70).data;
    const {meta:head}=await capturedAtPhoneMono(l,{...r,bytes},29999,2,{source_seq:2,content_sha256:await hash(bytes)});
    if(mode==="source_missing")l.db.raw.prepare("DELETE FROM sb_observations WHERE frame_id=?").run(source.frame_id);
    if(mode==="control_changed")l.db.raw.prepare("UPDATE sb_observations SET acceptance_json=json_set(acceptance_json,'$.control_epoch',99) WHERE frame_id=?").run(source.frame_id);
    if(mode==="geometry_changed")l.db.raw.prepare("UPDATE sb_frames SET metadata=json_set(metadata,'$.orientation_epoch',1) WHERE frame_id=?").run(head.frame_id);
    if(mode==="current_image_stale")l.tick(2000);
    if(mode==="current_capability_missing")await led.bind(r.actor,{...r.hardware,capabilities:{...caps,"sayso.action_geometry.v1":false}});
    const reply=await liveMcp(l.service,"drag_at",args),q=reply.result.structuredContent;
    if(!["old_reference","changed_after_admission"].includes(mode)){
      assert.equal(reply.result.isError,true,mode);assert.equal(count(),0);return;
    }
    assert.equal(reply.result.isError,false,JSON.stringify(q));
    const p=record(q.precondition);assert.equal(p.drag_source_confirmation,"server_accepted_geometry.v1");
    assert.equal(p.drag_source_sha256,source.content_sha256);assert.equal(p.drag_source_seq,1);assert.equal(p.drag_source_frame_seq,1);
    assert.equal(p.source_frame_id,source.frame_id);
    const replay=await liveMcp(l.service,"drag_at",args);assert.equal(replay.result.structuredContent.command_id,q.command_id);assert.equal(count(),1);
    if(mode==="changed_after_admission"){l.tick(200);await capturedAtPhoneMono(l,r,30199,3,{source_seq:3});}
    const claim=await r.mouse.claim(r.actor,{...r.identity,control_epoch:q.control_epoch,raw_dispatch_protocol:RAW_MOUSE_DISPATCH},0);
    assert.equal(claim?.command_id,q.command_id);assert.equal(claim?.state,"executing");
    assert.equal(record(claim.precondition).drag_source_seq,1);
  });
});

test("current contract: retired tools and old input/search arguments cannot enqueue",async()=>{
  const l=lab(),r=await mouseReady(l);
  for(const name of ["prepare_app_search","search_app_with_vision","type_google_map_in_spotlight","get_app_search_query_result","get_app_search_preparation_result"]){
    const reply=await liveMcp(l.service,name,{device_id:r.actor.id});assert.equal(reply.result.isError,true);
  }
  for(const [name,args] of [["open_system_search",{source_frame_id:uid()}],["type_text_in_field",{text:"hello",verify_layout:true}]] as const){
    const reply=await liveMcp(l.service,name,{device_id:r.actor.id,idempotency_key:uid(),...args});assert.equal(reply.result.isError,true);
  }
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,0);
});

test("ordinary click: released bare coordinates survive old age and changed pixels without losing scope",async t=>{
  for(const mode of ["implicit","explicit","no_ledger","legacy_capability","changed_after_admission","control_mismatch",
    "orientation_mismatch","missing_source","source_hash_tampered","proof_expired","proof_tampered","stopped_after_admission","same_pixels","explicit_cache_missing","beyond_retention"] as const)await t.test(mode,async()=>{
    const l=lab(false,undefined,new FrameUploadPermits("0123456789abcdef".repeat(4))),r=await systemSearchReady(l);
    const modern=mode!=="legacy_capability";
    await new LEDControl(l.service).bind(r.actor,{...r.hardware,capabilities:{...r.hardware.capabilities,
      "hid.mouse.absolute":true,"sayso.reviewed_point.v1":true,"sayso.reviewed_point_crops.v2":modern,
      "sayso.reviewed_point_crops.v3":modern,"sayso.reviewed_point_crops.v4":modern,
      "sayso.action_geometry.v1":modern}});
    await l.service.heartbeat(r.actor,r.beat);
    const mouse=new MouseControl(l.service);
    const state=await mouse.status(alice,{device_id:r.actor.id});
    const phone={...r.identity,control_epoch:state.control_epoch,raw_dispatch_protocol:RAW_MOUSE_DISPATCH,point_protocol:PAIRED_MOUSE_POINT};
    await mouse.claim(r.actor,phone,0);l.tick(400);
    const {meta:source}=await capturedAtPhoneMono(l,r,10400,2,{source_seq:2});
    const observation=r.actor.id+":"+source.frame_id;
    const original=JSON.parse(String(l.db.raw.prepare("SELECT acceptance_json FROM sb_observations WHERE id=?").get(observation)!.acceptance_json));
    const signed=await l.service.issueVisualReadPointProof(alice,{device:r.actor.id,session:r.identity.bridge_session_id,
      broadcast:r.identity.broadcast_id,worker:r.identity.worker_id,lease:r.identity.lease_epoch,control:state.control_epoch,
      frame:source.frame_id,frameSeq:2,sourceSeq:2,captureMono:10400,captureLower:original.capture_lower_ms,
      sha256:await hash(r.bytes),hardware:r.hardware.hardware_id,boot:r.hardware.board_boot_id,geometry:[16,32,source.native_width_px,source.native_height_px,"portrait",0,0,0,16,32,"1"]},Buffer.from(r.bytes).toString("base64"));
    assert.equal(typeof signed.proof,"string");
    if(mode!=="no_ledger")await l.service.rememberVisualReadPointProof(alice,signed.proof!);
    const elapsed=mode==="beyond_retention"?86400001:mode==="proof_expired"?16000:4500;
    if(mode==="beyond_retention"){
      // Simulated elapsed time with a still-current grant/worker. This is not phone evidence.
      l.tick(elapsed);
      l.db.raw.prepare("UPDATE sb_devices SET worker_expires=? WHERE id=?").run(l.now()+30000,r.actor.id);
      l.db.raw.prepare("UPDATE sb_sessions SET mouse_until=? WHERE id=?").run(l.now()+30000,r.identity.bridge_session_id);
      r.metadata.clock_probe_id=uid();
      l.db.raw.prepare("INSERT INTO sb_clock_probes(id,device_id,created_at,expires_at) VALUES(?,?,?,?)").run(r.metadata.clock_probe_id,r.actor.id,l.now(),l.now()+60000);
    }else for(let i=0;i<elapsed;i+=1000){l.tick(Math.min(1000,elapsed-i));await l.service.heartbeat(r.actor,r.beat);}

    const changed=mode==="same_pixels"?r.bytes:jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,80)},70).data;
    await capturedAtPhoneMono(l,{...r,bytes:changed},10400+elapsed,3,{source_seq:3,content_sha256:await hash(changed),...(mode==="beyond_retention"?{capture_offset_ms:0,captured_at:new Date(l.now()).toISOString()}: {})});
    if(mode==="control_mismatch")l.db.raw.prepare("UPDATE sb_observations SET acceptance_json=json_set(acceptance_json,'$.control_epoch',?) WHERE id=?").run(Number(state.control_epoch)+1,observation);
    if(mode==="source_hash_tampered")l.db.raw.prepare("UPDATE sb_observations SET acceptance_json=json_set(acceptance_json,'$.metadata.content_sha256',?) WHERE id=?").run("0".repeat(64),observation);
    if(["missing_source","explicit_cache_missing","beyond_retention"].includes(mode)){
      l.db.raw.prepare("DELETE FROM sb_observations WHERE id=?").run(observation);
      l.db.raw.prepare("DELETE FROM sb_released_system_search_field_proofs WHERE frame_id=?").run(source.frame_id);
    }
    const args={device_id:r.actor.id,source_frame_id:source.frame_id,x:5,y:12,image_width:16,image_height:32,
      orientation_epoch:mode==="orientation_mismatch"?1:0,idempotency_key:uid(),wait_ms:0,
      ...(["explicit","proof_tampered","explicit_cache_missing","beyond_retention"].includes(mode)?{source_point_proof:signed.proof+(mode==="proof_tampered"?"x":"")}: {})};
    const rejected=["legacy_capability","control_mismatch","orientation_mismatch","missing_source","source_hash_tampered","proof_tampered"].includes(mode);
    if(rejected){
      await assert.rejects(mouse.clickAt(alice,args));
      assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,0);return;
    }
    const admitted=await mouse.clickAt(alice,args);
    assert.ok(Number(admitted.source_age_ms)>=elapsed);assert.equal(admitted.screen_changed_since_source,mode!=="same_pixels");
    const duplicate=await mouse.clickAt(alice,args);
    assert.equal(duplicate.move_command_id,admitted.move_command_id);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
    if(mode==="changed_after_admission"){
      l.tick(350);await capturedAtPhoneMono(l,r,10400+elapsed+350,4,{source_seq:4});
    }
    if(mode==="stopped_after_admission"){
      await mouse.stop(alice,{device_id:r.actor.id});
      assert.equal(await mouse.claim(r.actor,phone,0),null);return;
    }
    const claim=await mouse.claim(r.actor,phone,0);
    assert.equal(claim?.command_id,admitted.move_command_id);
    assert.equal(claim.precondition?.source_frame_id,source.frame_id);
    assert.equal(claim.precondition?.point_source,undefined);
    assert.equal(claim.precondition?.point_query_origin,undefined);
    assert.equal(claim.precondition?.point_motion_policy,undefined);
    assert.ok(record(claim).paired_click_command);
  });
});
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import jpeg from "jpeg-js";
import { BridgeEngine, BridgeError, OrdinaryReadTiming, hash, uid, record, type User,type Dependencies } from "../lib/bridge-engine.ts";
import { handleMcp } from "../lib/mcp-protocol.ts";
import { observeWorkerPlacement,runWithBridgeContext } from "../lib/bridge-context.ts";
import { LiveFrameCache } from "../lib/live-frame-cache.ts";
import { PrivatePixelCache } from "../lib/private-pixel-cache.ts";
import { FrameUploadPermits,framePermitHeader,framePermitRenewHeader,framePermitRequest,framePermitMaxBytes } from "../lib/frame-upload-permit.ts";
import type { D1Timing } from "../lib/d1-timing.ts";
import { voiceBenchmark, voiceRuns } from "../lib/voice-bench.ts";
import { LEDControl } from "../lib/led-control.ts";
import { absoluteMouseRequest } from "../lib/absolute-mouse.ts";
import { MouseControl, PointClaimHints, PointReceiptHints, RAW_MOUSE_DISPATCH, SPOTLIGHT_CLAIM_START, SYSTEM_SEARCH_KIND, type ClickAfterReleaseRecovery } from "../lib/mouse-control.ts";
import {PAIRED_MOUSE_POINT} from "../lib/mouse-point.ts";
import {reviewedPointTTLCapability,reviewedPointTTLProfile,scopedSearchTTLCapability,scopedSearchTTLProfile} from "../lib/raw-claim-ttl.ts";
import {PairedClickPhaseTiming} from "../lib/paired-click-timing.ts";
import {imageReleaseClockSampler,type ImageReleaseClockSampler} from "../lib/image-release-clock.ts";
import {AppSearchControl} from "../lib/app-search-control.ts";
import {APP_SEARCH_PROTOCOL,APP_SEARCH_CLAIM,SOURCE_KEYS,searchPreparationRequest,validateSearchPreparationResult} from "../lib/app-search-contract.ts";

test("software: explicit post-command settle barrier rejects an early frame and never mutates capture time",async()=>{
  const l=lab(),r=await acknowledgedMouse(l),{e}=await capturedAtPhoneMono(l,r,10001);
  const early=await e.service.readScreen(alice,{after_command_id:r.command.command_id,after_command_min_gap_ms:300,wait_for_new_ms:0});
  assert.equal(early.image,undefined);assert.equal(early.reason,"WAITING_POST_COMMAND_FRAME");assert.equal(early.trace?.d1_inline_jpeg_chars,0);
  l.tick(301);await capturedAtPhoneMono(l,r,10301,2);
  const ready=await e.service.readScreen(alice,{after_command_id:r.command.command_id,after_command_min_gap_ms:300,wait_for_new_ms:0});
  assert.equal(ready.state,"available");assert.equal(ready.metadata?.capture_lower_phone_mono_ms,10301);
  assert.equal((ready.after_command as Record<string,unknown>).minimum_gap_ms,300);
  await assert.rejects(e.service.readScreen(alice,{after_command_min_gap_ms:300,wait_for_new_ms:0}),/AFTER_COMMAND_REQUIRED/);
});
import { PointerActionControl, POINTER_PROTOCOL, pointerSteps, verifyPointerEvents } from "../lib/pointer-actions.ts";
import { POINTER_PREFETCH } from "../lib/pointer-prefetch-query.ts";
import { pointerResultSnapshotQuery } from "../lib/pointer-result-query.ts";
import { frameAcceptanceEvidenceSQL } from "../lib/frame-acceptance-evidence.ts";
import { pointerAdmissionSnapshotQuery } from "../lib/pointer-admission-query.ts";
import { ScreenText } from "../lib/screen-text.ts";
import { BrowseControl } from "../lib/browse-control.ts";
import { BROWSE_PROTOCOL, type Scene } from "../lib/browse-contract.ts";
import { browseImageCache } from "../lib/browse-image.ts";
import { McpPerformance } from "../lib/mcp-performance.ts";
import { scheduleLatestExpiryCleanup as scheduleCleanup } from "../lib/latest-expiry-cleanup.ts";

let cleanupFixtureRevision=0;

test("software: pointer acceptance lookup bounds session state and expiry instead of walking device history",()=>{
  const l=lab(),sql=frameAcceptanceEvidenceSQL("CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)");
  const details=l.db.raw.prepare("EXPLAIN QUERY PLAN "+sql).all("fixture-device:fixture-frame").map(row=>String(row.detail));
  assert.ok(details.some(line=>line.includes("SEARCH sb_observations USING INDEX")));
  assert.ok(!details.some(line=>line.includes("SCAN sb_mouse_commands")),JSON.stringify(details));
});

test("software: fast paired admission and expiry skip completed cross-session mouse history",async t=>{
  for(const indexed of [false,true])await t.test(indexed?"partial active index":"prior indexes",async t=>{
    const c=await pairedPhonePoint(false),{l,r}=c;
    if(!indexed)l.db.raw.exec("DROP INDEX sb_mouse_active_device_idx");
    l.db.raw.exec("DELETE FROM sb_mouse_commands");
    const insert=l.db.raw.prepare("INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,control_epoch,created_at,expires_at) VALUES(?,?,?,?,?,?,'pointer.click','{}','fixture',?,?,1,?,?)");
    const terminalStates=["board_acked","failed","expired","cancelled","outcome_unknown","succeeded"];
    l.db.raw.exec("BEGIN");
    for(let i=0;i<13050;i++)insert.run("history-"+i,alice.id,r.actor.id,"old-session-"+(i%20),
      r.hardware.hardware_id,r.hardware.board_boot_id,"history-"+i,terminalStates[i%terminalStates.length],l.now()-7200000,l.now()-3600000);
    const oldStates=["queued","claimed","executing","embedded"];
    for(const state of oldStates)insert.run("stale-"+state,alice.id,r.actor.id,"prior-session",r.hardware.hardware_id,
      r.hardware.board_boot_id,"stale-"+state,state,l.now()-100,l.now()+10000);
    insert.run("foreign",bob.id,uid(),"foreign-session",r.hardware.hardware_id,r.hardware.board_boot_id,
      "foreign","queued",l.now()-100,l.now()+10000);
    l.db.raw.exec("COMMIT");

    const plans:string[][]=[];
    const batch=l.db.batch.bind(l.db);
    l.db.batch=async statements=>{
      if(statements.some(s=>s.sql.startsWith("WITH clock AS")&&s.sql.includes("INSERT INTO sb_mouse_commands"))){
        for(const statement of statements.slice(0,2)){
          const details=l.db.raw.prepare("EXPLAIN QUERY PLAN "+statement.sql)
            .all(...statement.values as (string|number|null)[]).map(row=>String(row.detail));
          plans.push(details);
        }
      }
      return batch(statements);
    };
    const clicked=await c.controller.clickAt(alice,{...c.args,device_id:r.actor.id,observe_after:false});
    assert.equal(clicked.click_submitted,null);
    assert.equal(clicked.point_protocol,PAIRED_MOUSE_POINT);
    assert.equal(plans.length,2);
    if(indexed){
      assert.ok(plans[0].some(line=>/SEARCH sb_mouse_commands USING INDEX sb_mouse_active_device_idx.*device_id=\?.*state=\?/.test(line)),plans[0].join("\n"));
      assert.ok(plans[1].some(line=>/SEARCH c USING (COVERING )?INDEX sb_mouse_active_device_idx.*device_id=\?.*state=\?/.test(line)),plans[1].join("\n"));
    }else{
      assert.ok(plans[0].some(line=>/SEARCH sb_mouse_commands USING INDEX sb_mouse_(claim|idempotency)_idx.*device_id=\?/.test(line)),plans[0].join("\n"));
      assert.ok(plans[1].some(line=>/SEARCH c USING (COVERING )?INDEX sb_mouse_claim_idx \(device_id=\?\)/.test(line)),plans[1].join("\n"));
    }
    const expirationPlan=plans[0].find(line=>line.includes("SEARCH sb_mouse_commands USING INDEX"));
    const historyChecks=plans[1].filter(line=>/SEARCH c USING (COVERING )?INDEX sb_mouse_(active_device|claim)_idx \(device_id=\?( AND state=\?)?\)/.test(line));
    t.diagnostic(JSON.stringify({indexed,history:13050,expirationPlan,admissionPlan:historyChecks[0],plannedAdmissionChecks:historyChecks.length}));
    const rows=l.db.raw.prepare("SELECT id,state FROM sb_mouse_commands WHERE id LIKE 'stale-%' OR id='foreign' ORDER BY id").all();
    assert.deepEqual(rows.map(row=>[row.id,row.state]),[
      ["foreign","queued"],["stale-claimed","expired"],["stale-embedded","expired"],
      ["stale-executing","outcome_unknown"],["stale-queued","expired"],
    ]);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE id LIKE 'history-%'").get()!.n,13050);
    const current=l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id IN (?,?) ORDER BY state");
    assert.deepEqual(current.all(clicked.move_command_id,clicked.command_id).map(row=>row.state),["embedded","queued"]);
    await assert.rejects(c.controller.clickAt(alice,{...c.args,device_id:r.actor.id,idempotency_key:uid(),observe_after:false}),/MOUSE_BUSY_OR_CONTROL_CHANGED|REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED/);
    assert.deepEqual(current.all(clicked.move_command_id,clicked.command_id).map(row=>row.state),["embedded","queued"]);
  });
});

test("software: immutable frame acceptance preserves both exact fractional clock values",async()=>{
  const captureLower=1794419807911.5403,phoneMono=216560356.29375002;
  const l=lab();
  l.tick(Math.floor(captureLower)+50-l.now());
  const r=await mouseReady(l);
  await new LEDControl(l.service).bind(r.actor,{...r.identity,...r.hardware,
    capabilities:{...r.hardware.capabilities,"hid.mouse.absolute":true,"hid.mouse.drag_absolute":true,"hid.mouse.drag_absolute.v2":true,"hid.mouse.click":true,"sayso.action_geometry.v1":true,"sayso.drag_at":true}});
  await l.service.heartbeat(r.actor,r.beat);
  const {meta}=await capturedAtPhoneMono(l,r,9999,1,{source_seq:1});
  const key=r.actor.id+":"+meta.frame_id;
  l.db.raw.prepare("UPDATE sb_frames SET capture_lower=?,metadata=? WHERE frame_id=?")
    .run(captureLower,JSON.stringify({...meta,capture_mono_ms:phoneMono}),meta.frame_id);
  l.db.raw.prepare("UPDATE sb_observations SET acceptance_json=NULL WHERE id=?").run(key);
  const clock="CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)";
  l.db.raw.prepare(frameAcceptanceEvidenceSQL(clock)).run(key);
  const row=l.db.raw.prepare(`SELECT o.acceptance_json,
      json_extract(o.acceptance_json,'$.capture_lower_ms')=f.capture_lower AS exact_lower,
      json_extract(o.acceptance_json,'$.metadata.capture_mono_ms')=json_extract(f.metadata,'$.capture_mono_ms') AS exact_mono
    FROM sb_observations o JOIN sb_frames f ON f.device_id=o.device_id AND f.frame_id=o.frame_id WHERE o.id=?`).get(key);
  assert.equal(row?.exact_lower,1);
  assert.equal(row?.exact_mono,1);
  const accepted=JSON.parse(String(row?.acceptance_json));
  assert.equal(accepted.capture_lower_ms,captureLower);
  assert.equal(accepted.metadata.capture_mono_ms,phoneMono);
});

test("software: high-volume retention prunes use time ranges and preserve the exact cutoff",async()=>{
  const l=lab(),cutoff=l.now()-86400000;
  for(const [id,time] of [["expired",cutoff-1],["boundary",cutoff],["recent",cutoff+1]] as const) {
    l.db.raw.prepare("INSERT INTO sb_metrics(id,owner_id,device_id,kind,bytes,duration_ms,created_at) VALUES(?,'fixture-owner','fixture-device','fixture',0,1,?)").run(id,time);
    l.db.raw.prepare("INSERT INTO sb_observations(id,device_id,frame_id,created_at) VALUES(?,'fixture-device',?,?)").run(id,id,time);
  }
  for(const [table,index] of [["sb_metrics","sb_metrics_created_idx"],["sb_observations","sb_observations_created_idx"]]) {
    const plan=l.db.raw.prepare("EXPLAIN QUERY PLAN DELETE FROM "+table+" WHERE created_at<?").all(cutoff);
    assert.ok(plan.some(row=>String(row.detail).includes(index)),JSON.stringify(plan));
    assert.ok(!plan.some(row=>String(row.detail).startsWith("SCAN ")));
  }
  await l.service.pruneMetadata();
  for(const table of ["sb_metrics","sb_observations"])assert.deepEqual(l.db.raw.prepare("SELECT id FROM "+table+" ORDER BY id").all().map(row=>row.id),["boundary","recent"]);
});

test("software: metadata prune logs one bounded begin/end pair around the unchanged batch",async()=>{
  const l=lab(),started=l.now(),before=l.db.requests,events:Record<string,unknown>[]=[];
  const batch=l.db.batch.bind(l.db),log=console.info;
  l.db.batch=async statements=>{
    assert.equal(events[0]?.event,"metadata_prune_begin");
    assert.equal(statements.length,14);
    const results=await batch(statements);
    l.tick(42);
    return results.map((_,index)=>({success:true,results:[],meta:{changes:0,timings:{sql_duration_ms:0.25},
      rows_read:index,rows_written:index===0?3:0,served_by_region:index===0?"APAC":"private-region",query:"PRIVATE SQL"}}));
  };
  console.info=entry=>events.push(JSON.parse(String(entry)));
  try {await l.service.pruneMetadata("frame");} finally {console.info=log;}
  assert.equal(l.db.requests-before,1);
  assert.equal(events.length,2);
  assert.deepEqual(events[0],{event:"metadata_prune_begin",prune_id:events[1].prune_id,source:"frame",
    scheduled:false,statement_count:14,started_at_utc_ms:started});
  assert.equal(events[1].event,"metadata_prune_end");
  assert.equal(events[1].outcome,"completed");
  assert.equal(events[1].finished_at_utc_ms,started+42);
  const timing=record(events[1].d1_timing);
  assert.equal(timing.sql_duration_ms,3.5);
  assert.equal(timing.rows_read,91);
  assert.equal(timing.rows_written,3);
  assert.deepEqual(timing.served_by_regions,["APAC"]);
  assert.ok(Number.isFinite(timing.wall_ms)&&Number(timing.wall_ms)>=0);
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE SQL|private-region/);
});

test("software: metadata prune diagnostics preserve D1 and logger failure behavior",async()=>{
  const l=lab(),events:Record<string,unknown>[]=[],log=console.info,batch=l.db.batch.bind(l.db);
  const failure=Error("PRIVATE D1 DETAIL");
  l.db.batch=async()=>{l.tick(10);throw failure;};
  console.info=entry=>events.push(JSON.parse(String(entry)));
  try {
    await assert.rejects(l.service.pruneMetadata("observation"),error=>error===failure);
    assert.equal(events.length,2);
    assert.equal(events[1].outcome,"error");
    assert.equal(events[1].source,"observation");
    assert.equal(record(events[1].d1_timing).sql_duration_ms,null);
    assert.equal(record(events[1].d1_timing).rows_written,null);
    assert.doesNotMatch(JSON.stringify(events),/PRIVATE D1 DETAIL/);
    l.db.batch=batch;
    console.info=()=>{throw Error("broken diagnostic sink");};
    await l.service.pruneMetadata();
    assert.equal(l.db.requests,1);
  } finally {console.info=log;}
});

test("software: newest capture history does not hide a session with only rejected frames",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  await e.service.stop(r.actor,r.identity.bridge_session_id,true);l.tick(1000);
  const broadcast=uid(),session=await e.service.createSession(r.actor,{mode:"broadcast",broadcast_id:broadcast,request_id:uid(),control_enabled:false});
  let result=await e.service.metricsFor(alice,r.actor.id);
  assert.equal(result.capture_session_history.session_id,session.bridge_session_id);
  assert.equal(result.capture_session_history.returned_rows,0);
  const id=uid();l.db.raw.prepare("INSERT INTO sb_metrics(id,owner_id,device_id,kind,frame_id,bytes,duration_ms,created_at,detail_json) VALUES(?,?,?,'upload_rejected',?,0,1,?,?)").run(uid(),alice.id,r.actor.id,id,l.now(),JSON.stringify({bridge_session_id:session.bridge_session_id,broadcast_id:broadcast,failure:"CLOCK_UNCERTAIN"}));
  result=await e.service.metricsFor(alice,r.actor.id);
  assert.equal(result.capture_session_history.rows[0].kind,"upload_rejected");assert.equal(result.capture_session_history.total_rows,1);
});

test("software: bounded ingress experiment metadata is retained without changing admission",async()=>{
  const l=lab(),r=await running(l),e=edge(l),client={copy_ms:1,ingress_interval_ms:100,ingress_phase:2};
  const meta={...r.metadata,client_timing:client};await e.service.acceptFrame(r.actor,meta,r.bytes);
  await e.flush();const row=l.db.raw.prepare("SELECT detail_json FROM sb_metrics WHERE frame_id=? AND kind='upload'").get(meta.frame_id)!;
  assert.deepEqual(JSON.parse(row.detail_json as string).client,client);
  for(const patch of [{ingress_interval_ms:99},{ingress_interval_ms:251},{ingress_phase:6},{ingress_phase:1.5}]) {
    assert.throws(()=>l.service.validateMetadata({...meta,client_timing:{...client,...patch}}),/INVALID_CLIENT_TIMING|INVALID_NUMBER/);
  }
});

test("software: upload cannot use an unverified clock or stale reported processing age",async()=>{
  for(const fault of ["unverified","slow_probe","reported_age"]) {
    const l=lab(),r=await running(l),e=edge(l),meta={...r.metadata};
    if(fault==="unverified")meta.capture_clock_verified=false;
    if(fault==="slow_probe")meta.clock_rtt_ms=3000;
    if(fault==="reported_age")meta.capture_age_ms=1500;
    await assert.rejects(e.service.acceptFrame(r.actor,meta,r.bytes),fault==="reported_age"?/OLD_CAPTURE/:/CLOCK_UNCERTAIN/);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_frames").get()!.n,0);
    const row=l.db.raw.prepare("SELECT detail_json FROM sb_metrics WHERE frame_id=? AND kind='upload_rejected'").get(meta.frame_id)!;
    assert.ok(row);assert.equal(JSON.parse(row.detail_json as string).outcome,"rejected");
  }
});

test("software: capture refresh rejected after commit is not left completed",async()=>{
  const l=lab(),r=await running(l),e=edge(l);
  await e.service.getScreen(alice,{device_id:r.actor.id,bridge_session_id:r.identity.bridge_session_id,force_fresh:true,wait_ms:0});
  const refresh=await e.service.claimRefresh(r.actor,r.identity,0);l.tick(100);
  const meta={...r.metadata,refresh_request_id:refresh!.refresh_request_id,refresh_received_mono_ms:10000,capture_mono_ms:10100},batch=l.db.batch.bind(l.db);let delayed=false;
  l.db.batch=async statements=>{const result=await batch(statements);if(!delayed){delayed=true;l.tick(1600);}return result;};
  await assert.rejects(e.service.acceptFrame(r.actor,meta,r.bytes),/OLD_CAPTURE/);
  const row=l.db.raw.prepare("SELECT state,error FROM sb_refreshes WHERE id=?").get(refresh!.refresh_request_id as string)!;
  assert.equal(row.state,"failed");assert.equal(row.error,"OLD_CAPTURE");
});

test("software: metrics history exports latest owner-device session from its beginning with an explicit bound",async()=>{
  const l=lab(),r=await running(l),scope=r.identity.bridge_session_id,old=uid(),foreign=await running(l,bob);
  const insert=l.db.raw.prepare("INSERT INTO sb_metrics(id,owner_id,device_id,kind,frame_id,bytes,duration_ms,created_at,detail_json) VALUES(?,?,?,?,?,0,10,?,?)");
  insert.run(uid(),alice.id,r.actor.id,"upload",uid(),l.now()-1000,JSON.stringify({bridge_session_id:old,frame_seq:999}));
  for(let i=1;i<=270;i++)insert.run(uid(),alice.id,r.actor.id,i===2?"upload_rejected":"upload",uid(),l.now()-500+i,JSON.stringify({bridge_session_id:scope,frame_seq:i,failure:i===2?"OLD_CAPTURE":null}));
  insert.run(uid(),bob.id,foreign.actor.id,"upload",uid(),l.now(),JSON.stringify({bridge_session_id:scope,frame_seq:9999}));
  const result=await l.service.metricsFor(alice,r.actor.id),h=result.capture_session_history;
  assert.equal(h.session_id,scope);assert.equal(h.total_rows,270);assert.equal(h.returned_rows,256);assert.equal(h.truncated,true);
  assert.equal(h.rows[0].detail.frame_seq,1);assert.equal(h.rows.at(-1)!.detail.frame_seq,256);
  assert.equal(h.rows[1].kind,"upload_rejected");assert.equal(h.images_included,false);
  assert.ok(h.rows.every(row=>row.detail.frame_seq!==9999));
  await assert.rejects(l.service.metricsFor(bob,r.actor.id),/NOT_FOUND/);
});

test("software: upload admission rejects a capture at1500ms on image and observation paths",async()=>{
  for(const observation of [false,true]) for(const age of [1499,1500,1700]) {
    const l=lab(),r=await running(l),e=edge(l);
    if(observation) await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
    const meta=observation?{...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:10001,capture_offset_ms:1}:r.metadata;
    l.tick(age-50+(observation?1:0));
    const work=()=>e.service.acceptFrame(r.actor,meta,observation?undefined:r.bytes);
    if(age<1500) {const result=await work();assert.ok(result.accepted_frame_id);}
    else {
      await assert.rejects(work(),/OLD_CAPTURE/);
      const row=l.db.raw.prepare("SELECT detail_json FROM sb_metrics WHERE frame_id=? AND kind=?").get(meta.frame_id,observation?"observation_rejected":"upload_rejected")!;
      assert.ok(row,"Do not discard stale rejection evidence");
      assert.equal(JSON.parse(row.detail_json as string).failure,"OLD_CAPTURE");
    }
  }
});

test("software: admission rechecks fresh capture age inside the actual commit execution",async()=>{
  for(const observation of [false,true]) {
    const l=lab(),r=await running(l),e=edge(l);
    if(observation) await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
    const meta=observation?{...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:10001,capture_offset_ms:1}:r.metadata;
    const batch=l.db.batch.bind(l.db);let delayed=false;
    l.db.batch=async statements=>{if(!delayed){delayed=true;l.tick(1600);}return batch(statements);};
    await assert.rejects(e.service.acceptFrame(r.actor,meta,observation?undefined:r.bytes),/OLD_CAPTURE/);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_frames WHERE frame_id=?").get(meta.frame_id)!.n,0);
  }
});

test("software: fresh-at-issue image rejected after delayed commit cannot delete a newer frame",async()=>{
  const l=lab(),r=await running(l),e=edge(l),batch=l.db.batch.bind(l.db);let delayed=false;
  const next={...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:11600,capture_offset_ms:1600,captured_at:new Date(l.now()+1600).toISOString()};
  l.db.batch=async statements=>{
    const result=await batch(statements);
    if(!delayed){delayed=true;l.tick(1600);await e.service.acceptFrame(r.actor,next,r.bytes);}
    return result;
  };
  await assert.rejects(e.service.acceptFrame(r.actor,r.metadata,r.bytes),/OLD_CAPTURE/);
  assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames WHERE device_id=?").get(r.actor.id)!.frame_id,next.frame_id);
  assert.equal((await e.service.readScreen(alice,{},0)).metadata?.frame_id,next.frame_id);
});

test("software: authenticated frame timing includes body wait without changing legacy service duration",async()=>{
  const l=lab(),r=await running(l),e=edge(l),before=l.now();
  const result=await e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),r.metadata,async()=>{
    l.tick(700);await new Promise(resolve=>setTimeout(resolve,25));return r.bytes;
  }) as Record<string,unknown>;
  const timing=result.request_timing as Record<string,number>;
  assert.ok(timing,"Raw JPEG handler must return its timing scope");
  assert.equal(result.request_timing_scope,"acceptFrameRequest_entry_to_D1_ack");
  assert.equal(result.request_timing_clock,"production_io_boundaries");
  assert.equal(timing.body_read_started_at_ms,before);
  assert.equal(timing.body_read_completed_at_ms,before+700);
  assert.equal(timing.commit_observed_at_ms,before+700);
  assert.ok(timing.body_read_ms>=20);
  assert.ok(timing.request_to_visible_ms-Number(result.frame_visible_ms)>=10);
  assert.equal(result.received_at,new Date(before+700).toISOString());
  for(const job of [...e.jobs]) if(job.delay===0) await job.job();
  const row=l.db.raw.prepare("SELECT detail_json FROM sb_metrics WHERE frame_id=? AND kind='upload'").get(r.metadata.frame_id)!;
  const detail=JSON.parse(row.detail_json as string);
  assert.deepEqual(detail.request_timing,timing);
  assert.equal(detail.database_visible_observed_at_ms,timing.commit_observed_at_ms);
  assert.equal(Object.keys(timing).some(key=>/token|authorization|body_content/i.test(key)),false);
});

test("software: frame history measures database visibility after commit, independently of receipt", async () => {
  for (const observation of [false,true]) {
    const l=lab(),r=await running(l),e=edge(l);
    if(observation) {await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(1000);}
    const meta=observation?{...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:11000,capture_offset_ms:1000}:r.metadata;
    const before=l.now(),batch=l.db.batch.bind(l.db);
    l.db.batch=async statements=>{const result=await batch(statements);l.tick(450);return result;};
    const result=await e.service.acceptFrame(r.actor,meta,observation?undefined:r.bytes) as Record<string,unknown>;
    assert.equal(result.received_at,new Date(before).toISOString());
    assert.equal(result.database_visible_observed_at,new Date(before+450).toISOString());
    assert.equal(result.database_visible_age_upper_ms,500);
    for(const job of [...e.jobs]) if(job.delay===0) await job.job();
    const row=l.db.raw.prepare("SELECT detail_json FROM sb_metrics WHERE frame_id=? AND kind=?").get(meta.frame_id,observation?"observation":"upload")!;
    const detail=JSON.parse(row.detail_json as string);
    assert.equal(detail.bridge_session_id,r.identity.bridge_session_id);
    assert.equal(detail.broadcast_id,r.identity.broadcast_id);
    assert.equal(detail.frame_seq,meta.frame_seq);
    assert.equal(detail.received_at_ms,before);
    assert.equal(detail.database_visible_observed_at_ms,before+450);
    assert.equal(detail.capture_lower_ms,before-50);
    assert.equal(detail.database_visible_age_upper_ms,500);
    assert.equal(l.db.raw.prepare("SELECT received_at FROM sb_frames WHERE device_id=?").get(r.actor.id)!.received_at,before);
  }
});

test("software: visibility history retains slow and unknown-clock outcomes without refreshing capture time",async()=>{
  for(const unknown of [false,true]) {
    const l=lab(),r=await running(l),e=edge(l),batch=l.db.batch.bind(l.db);
    l.db.batch=async statements=>{const result=await batch(statements);l.tick(1600);return result;};
    const meta={...r.metadata,capture_clock_verified:!unknown};
    if(unknown) {
      await assert.rejects(e.service.acceptFrame(r.actor,meta,r.bytes),/CLOCK_UNCERTAIN/);
      assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_frames WHERE device_id=?").get(r.actor.id)!.n,0);
      const row=l.db.raw.prepare("SELECT detail_json FROM sb_metrics WHERE frame_id=? AND kind='upload_rejected'").get(meta.frame_id)!;
      assert.equal(JSON.parse(row.detail_json as string).database_visible_age_upper_ms,null);
      assert.equal(JSON.parse(row.detail_json as string).failure,"CLOCK_UNCERTAIN");
    } else {
      await assert.rejects(e.service.acceptFrame(r.actor,meta,r.bytes),/OLD_CAPTURE/);
      assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_frames WHERE device_id=?").get(r.actor.id)!.n,0);
      const row=l.db.raw.prepare("SELECT detail_json FROM sb_metrics WHERE frame_id=? AND kind='upload_rejected'").get(meta.frame_id)!;
      assert.equal(JSON.parse(row.detail_json as string).database_visible_age_upper_ms,1650);
    }
    const image=await e.service.readScreen(alice,{},0);
    assert.equal(image.state,"unavailable"); assert.equal(image.image,undefined);
  }
});
function scheduleLatestExpiryCleanup(scope:object,key:string,schedule:(job:()=>Promise<void>)=>boolean,work:()=>Promise<void>,revision=++cleanupFixtureRevision){
  return scheduleCleanup(scope,key,schedule,work,revision);
}

class Statement {
  sql: string; values: unknown[] = []; db: DatabaseSync;
  request: () => void;
  afterAll?: () => void;
  constructor(db: DatabaseSync, sql: string, request: () => void = () => {}) { this.db = db; this.sql = sql; this.request=request; }
  bind(...values: unknown[]) { const statement = new Statement(this.db, this.sql,this.request); statement.values = values; statement.afterAll=this.afterAll;return statement; }
  execute(mode: string) {
    const query = this.db.prepare(this.sql), values = this.values as (string | number | null)[];
    // WITH may introduce SELECT or UPDATE. SQLite's result metadata identifies
    // reads without losing mutation change counts for observation transactions.
    if(mode==="batch")mode=query.columns().length>0?"all":"run";
    if (mode === "first") return query.get(...values) ?? null;
    if (mode === "all") return { results: query.all(...values), success: true, meta: {} };
    const result = query.run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
  async first<T>() { this.request(); return this.execute("first") as T | null; }
  async all<T>() { this.request();const rows=this.execute("all") as {results:T[]};this.afterAll?.();return rows; }
  async run() { this.request(); return this.execute("run"); }
}
class MemoryDB {
  raw = new DatabaseSync(":memory:");
  requests=0;
  afterAll?: (sql:string)=>void;
  constructor() { for (const file of readdirSync("drizzle").filter(name => name.endsWith(".sql")).sort()) this.raw.exec(readFileSync("drizzle/" + file, "utf8")); }
  prepare(sql: string) {
    const statement=new Statement(this.raw,sql,()=>{this.requests++;});
    if(this.afterAll)statement.afterAll=()=>this.afterAll?.(sql);
    return statement;
  }
  async batch(statements: Statement[]) {
    this.requests++;
    this.raw.exec("BEGIN IMMEDIATE");
    try { const results = statements.map(statement => statement.execute("batch")); this.raw.exec("COMMIT"); return results; }
    catch (error) { this.raw.exec("ROLLBACK"); throw error; }
  }
}
class MemoryBucket {
  values = new Map<string, Uint8Array>();
  async put(key: string, value: Uint8Array) { this.values.set(key, new Uint8Array(value)); }
  async get(key: string) { const value = this.values.get(key); return value ? { arrayBuffer: async () => value.slice().buffer } : null; }
  async head(key: string) { return this.values.has(key) ? { key } : null; }
  async delete(key: string | string[]) { for (const name of typeof key === "string" ? [key] : key) this.values.delete(name); }
  async list(options: { prefix: string }) { return { objects: [...this.values.keys()].filter(key => key.startsWith(options.prefix)).map(key => ({ key })) }; }
}
function lab(browseEnabled = false,readTiming?:Dependencies["readTiming"],framePermits?:FrameUploadPermits,pairedShadow?:Dependencies["pairedShadow"]) {
  const db = new MemoryDB(), bucket = new MemoryBucket(); let now = Date.now();
  // Keep SQLite's issuance clock on the same explicit fixture clock as Worker.
  db.raw.function("julianday",(value:unknown)=>{void value;return 2440587.5+now/86400000;});
  const service = new BridgeEngine({ db: db as unknown as D1Database, bucket: bucket as unknown as R2Bucket, now: () => now, browseEnabled,readTiming,framePermits,pairedShadow });
  // Isolate text signing from optional image-signing fixtures; use the real HMAC implementation.
  const textSigner=framePermits?.sourceViewProofAvailable?framePermits:new FrameUploadPermits("ab".repeat(32));
  service.textRequestDigest=(...args)=>textSigner.textRequestDigest(...args);
  return { service, db, bucket, tick: (ms: number) => { now += ms; }, now: () => now };
}
const alice = { id: "site-user-alice", label: "Alice" }, bob = { id: "site-user-bob", label: "Bob" };
// Pointer-entry records are isolated software fixtures, never phone evidence.
const pointerStep=()=>({id:uid(),before:browseScene("List"),after:browseScene("Detail"),target:{text:"Product",region:browseRegion},click_region:{x:0.6,y:0.5,width:0.2,height:0.2}});
function prefetched(reply:Awaited<ReturnType<BridgeEngine["heartbeat"]>>) {return "prefetched_pointer_command" in reply?reply.prefetched_pointer_command:undefined;}

test("software: pointer admission snapshot uses exact device ready hardware and idempotency indexes",()=>{
  const l=lab(),q=pointerAdmissionSnapshotQuery({owner:alice.id,device:uid(),key:uid()},"CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)"),details=l.db.raw.prepare("EXPLAIN QUERY PLAN "+q.sql).all(...q.values).map(x=>String(x.detail));
  assert.ok(details.some(x=>x.includes("sb_mouse_idempotency_idx")&&x.includes("idempotency_key=?")),JSON.stringify(details));
  assert.ok(!details.some(x=>/^SCAN (d|c|s|h|w)\b/.test(x)),JSON.stringify(details));
});
test("software: pointer plans reject payment, duplicate IDs and oversized unsafe regions",()=>{
  const step=pointerStep();assert.equal(pointerSteps([step]).length,1);
  assert.throws(()=>pointerSteps([step,step]),/DUPLICATE_STEP/);assert.throws(()=>pointerSteps([{...step,target:{...step.target,text:"立即购买"}}]),/NAVIGATION_ONLY/);
  assert.throws(()=>pointerSteps([{...step,click_region:browseRegion}]),/CLICK_REGION/);
});
test("software: default MCP responses and tracing headers use the SaySo name",async()=>{
  const l=lab();
  for(const [method,params] of [["initialize",{protocolVersion:"2026-07-28"}],["tools/list",{}],["resources/list",{}],["tools/call",{name:"read_screen",arguments:{wait_for_new_ms:0}}],["tools/call",{name:"get_control_guide",arguments:{workflow:"overview"}}]] as const){
    const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})}),{engine:()=>l.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
    assert.ok(response.headers.get("X-SaySo-Request-ID"));
    const json=await response.text();assert.ok(!/screen.?bridge/i.test(json),method);
    if(method==="tools/call"&&params.name==="read_screen")assert.equal(JSON.parse(json).result.structuredContent.reason,"START_SAYSO_BROADCAST");
  }
});
type RpcReply = { result: { isError: boolean; content: { type: string; mimeType: string; data: string; text?: string }[]; structuredContent: Record<string, unknown>; _meta: Record<string, unknown> } };
async function paired(l: ReturnType<typeof lab>, user: User = alice) {
  const code = await l.service.createPairingCode(user, "test phone", "https://test.example");
  const paired = await l.service.redeem({ pairing_code: code.pairing_code, name: "SOFTWARE TEST PHONE", request_id: uid() }, "test-caller");
  const actor = await l.service.authenticate(new Request("https://test.example/v1/device/status", { headers: { Authorization: "Bearer " + paired.device_token } }));
  return { actor, token: paired.device_token };
}
async function running(l: ReturnType<typeof lab>, user:User=alice) {
  const { actor, token } = await paired(l,user), broadcast = uid();
  const session = await l.service.createSession(actor, { mode: "broadcast", broadcast_id: broadcast, request_id: uid(), control_enabled: false });
  const worker = uid(), claim = await l.service.claimWorker(actor, { bridge_session_id: session.bridge_session_id, broadcast_id: broadcast, worker_id: worker, worker_kind: "broadcast" });
  const identity = { bridge_session_id: session.bridge_session_id, broadcast_id: broadcast, worker_id: worker, lease_epoch: claim.lease_epoch };
  const clock = await l.service.clockProbe(actor);
  const bytes = jpeg.encode({ width: 16, height: 32, data: Buffer.alloc(16 * 32 * 4, 150) }, 70).data;
  const metadata = { ...identity, frame_id: uid(), frame_seq: 1, captured_at: new Date(l.now()).toISOString(), capture_age_ms: 0, capture_mono_ms: 10000,
    width: 16, height: 32, native_width_px: 1206, native_height_px: 2622, orientation: "portrait", orientation_epoch: 0,
    content_sha256: await hash(bytes), content_rect: { x: 0, y: 0, width: 16, height: 32 }, transform_version: "1", capture_clock_verified: true,
    provenance: "device_capture", sampling_reason: "initial", clock_probe_id: clock.clock_probe_id, capture_offset_ms: 0, clock_rtt_ms: 10 };
  return { actor, token, identity, metadata, bytes };
}
async function ledReady(l: ReturnType<typeof lab>) {
  const { actor } = await paired(l), led = new LEDControl(l.service);
  const hardware = { hardware_id: uid(), board_boot_id: uid(), protocol_version: "1.0", descriptor_version: "software-fixture", transport: "usb_midi", capabilities: { "led.set": true }, led_config: { type: "software_test_only" }, lease_epoch_floor: 50 };
  await led.bind(actor, hardware);
  const session = await led.createSession(actor, { mode: "foreground_diagnostic", control_enabled: true, request_id: uid() });
  const worker = uid(), claim = await l.service.claimWorker(actor, { bridge_session_id: session.bridge_session_id, worker_id: worker, worker_kind: "main" });
  assert.ok(claim.lease_epoch > 50);
  const identity = { bridge_session_id: session.bridge_session_id, worker_id: worker, lease_epoch: claim.lease_epoch };
  await led.heartbeat(actor, { ...identity, capture_state: "stopped", usb_connected: true, board_boot_id: hardware.board_boot_id });
  return { actor, led, hardware, identity };
}
test("software: MCP LED writes queue once and only a matching board receipt confirms execution", async () => {
  const l = lab(), r = await ledReady(l), key = uid();
  const request = (name: string, args: Record<string, unknown>) => new Request("https://test.example/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } }) });
  const reply = await handleMcp(request("set_led", { on: true, idempotency_key: key, wait_ms: 0 }), { engine: () => l.service, caller: () => alice, origin: "https://test.example",toolAudience:"development" });
  const data = await reply.json() as RpcReply;
  assert.equal(data.result.isError, false); assert.equal(data.result.structuredContent.state, "queued");
  const id = data.result.structuredContent.command_id as string;
  assert.equal((await r.led.set(alice, { device_id: r.actor.id, on: true, idempotency_key: key, wait_ms: 0 })).command_id, id);
  await assert.rejects(r.led.set(alice, { device_id: r.actor.id, on: false, idempotency_key: key, wait_ms: 0 }), /IDEMPOTENCY_CONFLICT/);
  const claimed = await r.led.claim(r.actor, r.identity, 0); assert.equal(claimed?.command_id, id); assert.equal(await r.led.claim(r.actor, r.identity, 0), null);
  const start = await r.led.start(r.actor, id, { ...r.identity, control_epoch: 1 }); assert.ok(start.ttl_remaining_ms <= 2500);
  const receipt = { command_id: id, board_boot_id: r.hardware.board_boot_id, state: "executed", effect: { led_requested_on: true } };
  await assert.rejects(r.led.result(r.actor, id, { ...r.identity, state: "board_acked", board_receipt: { ...receipt, board_boot_id: uid() }, finished_client_mono_ms: 123 }), /INVALID_BOARD_RECEIPT/);
  const result = { ...r.identity, state: "board_acked", board_receipt: receipt, finished_client_mono_ms: 123 };
  assert.equal((await r.led.result(r.actor, id, result)).state, "board_acked");
  assert.equal((await r.led.result(r.actor, id, result)).state, "board_acked");
  const read = await handleMcp(request("get_command_result", { command_id: id }), { engine: () => l.service, caller: () => alice, origin: "https://test.example",toolAudience:"development" });
  const confirmed = await read.json() as RpcReply;
  assert.equal(confirmed.result.structuredContent.verification, "phone_verified_board_ack");
  assert.equal(confirmed.result.structuredContent.physical_light_observed, false);
  await assert.rejects(r.led.get(bob, id), /NOT_FOUND/);
});
test("software: LED scope is opt-in, owner-bound and foreground-only; screen sessions cannot submit commands", async () => {
  const l = lab(), r = await running(l), led = new LEDControl(l.service);
  await led.bind(r.actor,{hardware_id:uid(),board_boot_id:uid(),protocol_version:"1.0",descriptor_version:"software-fixture",transport:"usb_midi",capabilities:{"led.set":true},led_config:{}});
  await assert.rejects(led.set(alice, { device_id: r.actor.id, on: true, wait_ms: 0 }), /START_FOREGROUND/);
  await assert.rejects(led.claim(r.actor, r.identity, 0), /DIAGNOSTIC_REQUIRED/);
  const ready = await ledReady(l);
  await assert.rejects(ready.led.set(bob, { device_id: ready.actor.id, on: true, wait_ms: 0 }), /NOT_FOUND/);
  const request = new Request("https://test.example/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "set_led", arguments: { on: true, kind: "pointer.click" } } }) });
  const response = await handleMcp(request, { engine: () => l.service, caller: () => alice, origin: "https://test.example",toolAudience:"development" });
  assert.equal((await response.json() as RpcReply).result.structuredContent.error, "INVALID_ARGUMENTS");
});
test("software: stopped workers, board reboots and expiry cannot execute or promote late LED receipts", async () => {
  const l = lab(), r = await ledReady(l);
  const command = await r.led.set(alice, { on: true, wait_ms: 0 });
  await r.led.claim(r.actor, r.identity, 0);
  await r.led.start(r.actor, command.command_id, { ...r.identity, control_epoch: 1 });
  l.tick(10_001);
  assert.equal((await r.led.get(alice, command.command_id)).state, "outcome_unknown");
  await assert.rejects(r.led.result(r.actor, command.command_id, { ...r.identity, state: "outcome_unknown", board_receipt: {} }), /STALE_LEASE/);
  const l2 = lab(), r2 = await ledReady(l2), next = await r2.led.set(alice, { on: true, wait_ms: 0 });
  await r2.led.bind({ ...r2.actor, current_session: r2.identity.bridge_session_id }, { ...r2.hardware, board_boot_id: uid() });
  assert.equal((await r2.led.get(alice, next.command_id)).state, "cancelled");
  await assert.rejects(r2.led.claim(r2.actor, r2.identity, 0), /STALE_SESSION/);
});
test("software: a superseded worker stop does not clear the replacement worker USB readiness", async () => {
  const l = lab(), r = await ledReady(l);
  const next = await r.led.createSession(r.actor, { mode: "foreground_diagnostic", control_enabled: true, request_id: uid() });
  const worker = uid(), lease = await l.service.claimWorker(r.actor, { bridge_session_id: next.bridge_session_id, worker_id: worker, worker_kind: "main" });
  const identity = { bridge_session_id: next.bridge_session_id, worker_id: worker, lease_epoch: lease.lease_epoch };
  await r.led.heartbeat(r.actor, { ...identity, capture_state: "stopped", usb_connected: true, board_boot_id: r.hardware.board_boot_id });
  await l.service.stop(r.actor, r.identity.bridge_session_id, false, "superseded worker stop");
  const current = await l.service.status(r.actor);
  assert.equal(current.session?.bridge_session_id, next.bridge_session_id);
  assert.equal(current.usb_connected, true); assert.equal(current.session?.control_enabled, true);
  await l.service.stop(r.actor, next.bridge_session_id, false, "USB 诊断连接中断");
  const stopped = await l.service.status(r.actor);
  assert.equal(stopped.last_diagnostic?.stop_reason, "USB 诊断连接中断");
  assert.equal(stopped.usb_connected, false);
});
test("software: device list snapshot matches status for idle, control, expiry and diagnostic states in one read",async()=>{
  for(const kind of ["idle","broadcast","mouse","paused","offline","expired-frame","diagnostic","stopped-diagnostic"]){
    const l=lab();
    const r=kind==="idle"?await paired(l):kind.includes("diagnostic")?await ledReady(l):await mouseReady(l);
    if(kind==="paused")l.db.raw.prepare("UPDATE sb_sessions SET capture_state='paused' WHERE device_id=?").run(r.actor.id);
    if(kind==="broadcast")l.db.raw.prepare("UPDATE sb_sessions SET mouse_enabled=0 WHERE device_id=?").run(r.actor.id);
    if(kind==="offline")l.tick(11000);
    if(kind==="expired-frame")l.db.raw.prepare("UPDATE sb_frames SET expires_at=? WHERE device_id=?").run(l.now(),r.actor.id);
    if(kind==="stopped-diagnostic")await l.service.stop(r.actor,(r as Awaited<ReturnType<typeof ledReady>>).identity.bridge_session_id,false,"test-stop");
    const next=await l.service.status(r.actor);
    assert.equal(next.next_step,kind==="offline"||kind==="idle"||kind==="stopped-diagnostic"?"START_SAYSO_BROADCAST":
      kind==="paused"?"CAPTURE_PAUSED":kind.includes("diagnostic")?"START_SAYSO_BROADCAST":kind==="broadcast"?"ALLOW_CONTROL_IN_SAYSO":null);
    const expected=await l.service.status(r.actor),writes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
    l.db.requests=0;
    assert.deepEqual(await l.service.listDevices(alice),[expected],kind);
    assert.equal(l.db.requests,1,kind);
    assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,writes,kind);
  }
});

test("software: device list bounds owner rows and latest diagnostic without pixels or credentials",async()=>{
  const l=lab();
  for(let i=0;i<26;i++)l.db.raw.prepare("INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,created_at,revoked) VALUES(?,?,?,?,?,?,?)")
    .run(uid(),i===25?bob.id:alice.id,"device-"+i,"synthetic-hash-"+i,l.now()+1000,l.now()+i,i===24?1:0);
  const target=l.db.raw.prepare("SELECT id FROM sb_devices WHERE name='device-23'").get()!.id;
  for(const [suffix,owner,state] of [["old",alice.id,"active"],["tie-winner",alice.id,"stopped"],["foreign",bob.id,"active"]])
    l.db.raw.prepare("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,mode,stop_reason,stopped_at) VALUES(?,?,?,?,?,?,?,?,?,'foreground_diagnostic',?,?)")
      .run(uid(),owner,target,uid(),uid(),"fixture",state,"stopped",l.now(),suffix,l.now());
  const sql:string[]=[],prepare=l.db.prepare.bind(l.db);l.db.prepare=(query:string)=>{sql.push(query);return prepare(query);};
  l.db.requests=0;const rows=await l.service.listDevices(alice);
  assert.equal(l.db.requests,1);assert.equal(rows.length,20);
  assert.deepEqual(rows.map(x=>x.name),Array.from({length:20},(_,i)=>"device-"+(23-i)));
  assert.equal(rows[0].last_diagnostic?.stop_reason,"tie-winner");
  assert.equal(sql.length,1);assert.doesNotMatch(sql[0],/token_hash|token_expires|inline_jpeg|image_key|SELECT\s+\*/i);
  assert.doesNotMatch(JSON.stringify(rows),/synthetic-hash|token_hash|session_json|frame_metadata/);
  const plan=l.db.raw.prepare("EXPLAIN QUERY PLAN "+sql[0]).all(alice.id);
  assert.ok(plan.some(x=>String(x.detail).includes("sb_devices_owner_idx")));
  assert.ok(plan.some(x=>String(x.detail).includes("sb_sessions_request_idx")),JSON.stringify(plan));
});

test("software: device list rejects cross-owner joined data and reflects revocation at snapshot execution",async()=>{
  const l=lab(),r=await mouseReady(l);
  l.db.raw.prepare("UPDATE sb_sessions SET owner_id=? WHERE device_id=?").run(bob.id,r.actor.id);
  l.db.raw.prepare("UPDATE sb_hardware SET owner_id=? WHERE device_id=?").run(bob.id,r.actor.id);
  l.db.raw.prepare("UPDATE sb_frames SET owner_id=? WHERE device_id=?").run(bob.id,r.actor.id);
  const [state]=await l.service.listDevices(alice);
  assert.equal(state.session,null);assert.equal(state.latest_frame,null);assert.equal(state.hardware_id,null);
  assert.deepEqual(state.capabilities,{});assert.deepEqual(state.control_scope,[]);
  const prepare=l.db.prepare.bind(l.db);l.db.prepare=(sql:string)=>{const s=prepare(sql),request=s.request;s.request=()=>{request();l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(r.actor.id);};return s;};
  l.db.requests=0;assert.deepEqual(await l.service.listDevices(alice),[]);assert.equal(l.db.requests,1);
});

test("software: device list expiry during lookup cannot report active control or expired frame",async()=>{
  const l=lab(),r=await mouseReady(l),prepare=l.db.prepare.bind(l.db);
  l.db.raw.prepare("UPDATE sb_frames SET expires_at=? WHERE device_id=?").run(l.now()+1,r.actor.id);
  l.db.prepare=(sql:string)=>{const s=prepare(sql),bind=s.bind.bind(s);s.bind=(...values:unknown[])=>{const bound=bind(...values),all=bound.all.bind(bound);bound.all=async<T>()=>{const result=await all<T>();l.tick(11000);return result;};return bound;};return s;};
  const [state]=await l.service.listDevices(alice);
  assert.equal(state.online,false);assert.equal(state.usb_connected,false);assert.equal(state.session?.control_enabled,false);
  assert.deepEqual(state.control_scope,[]);assert.equal(state.latest_frame,null);
});

test("software: single-use pairing, two-user isolation and token-purpose separation", async () => {
  const l = lab(), a = await paired(l), b = await paired(l, bob);
  assert.equal((await l.service.listDevices(alice)).length, 1);
  await assert.rejects(l.service.owned(alice, b.actor.id), /NOT_FOUND/);
  await assert.rejects(l.service.authenticate(new Request("https://test.example", { headers: { Authorization: "Bearer invalid-not-a-device-credential" } })), /UNAUTHENTICATED/);
  const code = await l.service.createPairingCode(alice, "test", "https://test.example"), request = uid();
  const device = await l.service.redeem({ pairing_code: code.pairing_code, name: "test", request_id: request }, "test");
  await assert.rejects(l.service.redeem({ pairing_code: code.pairing_code, name: "test", request_id: request }, "test"), /PAIRING_RESPONSE_LOST/);
  await assert.rejects(l.service.authenticate(new Request("https://test.example", { headers: { Authorization: "Bearer " + device.device_token } })), /UNAUTHENTICATED/);
  assert.notEqual(a.actor.id, b.actor.id);
});
test("software: session retries are idempotent, worker claim is atomic and old epoch is fenced", async () => {
  const l = lab(), { actor } = await paired(l), body = { mode: "broadcast", broadcast_id: uid(), request_id: uid(), control_enabled: false };
  const [a, b] = await Promise.all([l.service.createSession(actor, body), l.service.createSession(actor, body)]);
  assert.equal(a.bridge_session_id, b.bridge_session_id);
  const identities = [uid(), uid()].map(worker_id => ({ bridge_session_id: a.bridge_session_id, broadcast_id: body.broadcast_id, worker_kind: "broadcast", worker_id }));
  const results = await Promise.allSettled(identities.map(identity => l.service.claimWorker(actor, identity)));
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  l.tick(11000);
  await assert.rejects(l.service.heartbeat(actor, { ...identities[0], lease_epoch: 1, capture_state: "active" }), /STALE_LEASE/);
});
test("software: authenticated JPEG request uses two hot-path D1 calls instead of three",async()=>{
 const l=lab(),r=await running(l),e=edge(l),request=()=>new Request("https://test.example/v1/device/frame",{headers:{Authorization:"Bearer "+r.token}});
 const legacy=l.db.requests;const actor=await e.service.authenticate(request());await e.service.acceptFrame(actor,r.metadata,r.bytes);assert.equal(l.db.requests-legacy,3);
 l.tick(50);const next={...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:10050,capture_offset_ms:50};const before=l.db.requests;
 const accepted=await e.service.acceptFrameRequest(request(),{...next,clock_probe_id:String(next.clock_probe_id).toUpperCase()},async()=>r.bytes);
 assert.equal(l.db.requests-before,2);assert.equal(accepted.accepted_frame_id,next.frame_id);assert.equal(accepted.storage_pending,true);
});

test("software: JPEG request refuses invalid authentication before reading image bytes",async()=>{
 for(const kind of ["malformed","wrong","wrong-malformed-metadata","revoked","expired"]){
  const l=lab(),r=await running(l),e=edge(l);let loaded=false;
  if(kind==="revoked")l.db.raw.exec("UPDATE sb_devices SET revoked=1");
  if(kind==="expired")l.db.raw.exec("UPDATE sb_devices SET token_expires=0");
  const token=kind==="malformed"?"bad":kind.startsWith("wrong")?"A".repeat(40):r.token;
  await assert.rejects(e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+token}}),kind==="wrong-malformed-metadata"?{}:r.metadata,async()=>{loaded=true;return r.bytes;}),/UNAUTHENTICATED/);
  assert.equal(loaded,false);assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_frames").get()!.n,0);assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations").get()!.n,0);
 }
});

test("software: JPEG lazy header errors stay behind live authentication and never consume body",async()=>{
 for(const valid of [false,true]){
  const l=lab(),r=await running(l),e=edge(l);let loaded=false;const token=valid?r.token:"A".repeat(40);
  await assert.rejects(e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+token}}),()=>{throw new BridgeError("JPEG_REQUIRED",415);},async()=>{loaded=true;return r.bytes;}),valid?/JPEG_REQUIRED/:/UNAUTHENTICATED/);
  assert.equal(loaded,false);assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_frames").get()!.n,0);
 }
});

test("software: JPEG auth snapshot never follows foreign devices or another owner session",async()=>{
 for(const user of [alice,bob]){
  const l=lab(),r=await running(l),foreign=await running(l,user),e=edge(l);let loaded=false;
  await assert.rejects(e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),foreign.metadata,async()=>{loaded=true;return foreign.bytes;}),/STALE_SESSION/);
  assert.equal(loaded,false);assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_frames").get()!.n,0);
 }
});

test("software: JPEG request rechecks live token and ownership after body IO",async()=>{
 for(const change of ["UPDATE sb_devices SET revoked=1","UPDATE sb_devices SET token_expires=0","UPDATE sb_devices SET token_hash='rotated'","UPDATE sb_devices SET owner_id='another-owner'"]){
  const l=lab(),r=await running(l),e=edge(l);
  await assert.rejects(e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),r.metadata,async()=>{l.db.raw.exec(change);return r.bytes;}),/STALE_FRAME_OR_LEASE/);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_frames").get()!.n,0);assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations").get()!.n,0);assert.equal(e.jobs.length,0);assert.equal(l.bucket.values.size,0);
 }
});

test("software: JPEG request expiry during body IO cannot reuse the earlier token snapshot",async()=>{
 const l=lab(),r=await running(l),e=edge(l);l.db.raw.prepare("UPDATE sb_devices SET token_expires=?").run(l.now()+50);
 await assert.rejects(e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),r.metadata,async()=>{l.tick(100);return r.bytes;}),/UNAUTHENTICATED/);
 assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_frames").get()!.n,0);assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations").get()!.n,0);
});

test("software: JPEG request transaction keeps auth scope and exact probe anchor live",async()=>{
 const changes=["UPDATE sb_devices SET token_hash='rotated'","UPDATE sb_devices SET token_expires=0","UPDATE sb_devices SET revoked=1","UPDATE sb_devices SET current_session='"+uid()+"'","UPDATE sb_devices SET worker_id='"+uid()+"'","UPDATE sb_devices SET lease_epoch=lease_epoch+1","UPDATE sb_devices SET worker_expires=0","UPDATE sb_sessions SET state='stopped'","UPDATE sb_sessions SET capture_state='paused'","UPDATE sb_sessions SET mode='foreground_diagnostic'","UPDATE sb_sessions SET broadcast_id='"+uid()+"'","UPDATE sb_sessions SET owner_id='another-owner'","UPDATE sb_clock_probes SET expires_at=0","UPDATE sb_clock_probes SET created_at=created_at+1","DELETE FROM sb_clock_probes"];
 for(const change of changes){
  const l=lab(),r=await running(l),e=edge(l),batch=l.db.batch.bind(l.db);l.db.batch=async statements=>{l.db.raw.exec(change);return batch(statements);};
  await assert.rejects(e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),r.metadata,async()=>r.bytes),/STALE_FRAME_OR_LEASE/,change);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_frames").get()!.n,0,change);assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations").get()!.n,0,change);assert.equal(e.jobs.length,0);
 }
});

test("software: JPEG body IO cannot overwrite a newer committed frame",async()=>{
 const l=lab(),r=await running(l),e=edge(l);l.tick(50);const next={...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:10050,capture_offset_ms:50};
 await assert.rejects(e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),r.metadata,async()=>{await e.service.acceptFrame(r.actor,next,r.bytes);return r.bytes;}),/STALE_FRAME_OR_LEASE/);
 assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames").get()!.frame_id,next.frame_id);
});

test("software: JPEG request rechecks probe expiry after reading its body",async()=>{
 const l=lab(),r=await running(l),e=edge(l);l.db.raw.prepare("UPDATE sb_clock_probes SET expires_at=?").run(l.now()+50);
 await assert.rejects(e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),r.metadata,async()=>{l.tick(100);return r.bytes;}),/INVALID_CLOCK_PROBE/);
 assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_frames").get()!.n,0);assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations").get()!.n,0);
});

test("software: JPEG requested capture retains fresh refresh ownership and completion",async()=>{
 const l=lab(),r=await running(l),e=edge(l),pending=await e.service.getScreen(alice,{device_id:r.actor.id,bridge_session_id:r.identity.bridge_session_id,force_fresh:true,wait_ms:0});
 const refresh=await e.service.claimRefresh(r.actor,r.identity,0);assert.equal(refresh?.refresh_request_id,pending.refresh_request_id);l.tick(100);
 const meta={...r.metadata,refresh_request_id:String(refresh!.refresh_request_id).toUpperCase(),refresh_received_mono_ms:10000,capture_mono_ms:10100};const before=l.db.requests;
 const result=await e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),meta,async()=>r.bytes);
 assert.equal(result.accepted_frame_id,meta.frame_id);assert.equal(l.db.requests-before,2);assert.equal(l.db.raw.prepare("SELECT state FROM sb_refreshes").get()!.state,"completed");
});

test("software: JPEG requested capture cannot commit a changed refresh anchor",async()=>{
 for(const change of ["UPDATE sb_refreshes SET expires_at=0","UPDATE sb_refreshes SET state='completed'","UPDATE sb_refreshes SET created_at=created_at+1","UPDATE sb_refreshes SET min_seq=min_seq+1","UPDATE sb_refreshes SET worker_id='"+uid()+"'"]){
  const l=lab(),r=await running(l),e=edge(l);await e.service.getScreen(alice,{device_id:r.actor.id,bridge_session_id:r.identity.bridge_session_id,force_fresh:true,wait_ms:0});const refresh=await e.service.claimRefresh(r.actor,r.identity,0);l.tick(100);
  const meta={...r.metadata,refresh_request_id:refresh!.refresh_request_id,refresh_received_mono_ms:10000,capture_mono_ms:10100},batch=l.db.batch.bind(l.db);l.db.batch=async statements=>{l.db.raw.exec(change);return batch(statements);};
  await assert.rejects(e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),meta,async()=>r.bytes),/STALE_FRAME_OR_LEASE/);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_frames").get()!.n,0);assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations").get()!.n,0);
 }
});

test("software: JPEG first-contact confirmation remains explicit and invalid JPEG never commits",async()=>{
 const l=lab(),r=await running(l),e=edge(l);l.db.raw.exec("UPDATE sb_devices SET confirmed_at=NULL");const before=l.db.requests;
 await e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),r.metadata,async()=>r.bytes);
 assert.equal(l.db.requests-before,3);assert.equal(l.db.raw.prepare("SELECT confirmed_at FROM sb_devices").get()!.confirmed_at,l.now());
 const other=lab(),phone=await running(other),service=edge(other),bytes=new Uint8Array([1,2,3]);
 await assert.rejects(service.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+phone.token}}),{...phone.metadata,content_sha256:await hash(bytes)},async()=>bytes),/INVALID_IMAGE/);
 assert.equal(other.db.raw.prepare("SELECT count(*) AS n FROM sb_frames").get()!.n,0);assert.equal(other.db.raw.prepare("SELECT count(*) AS n FROM sb_observations").get()!.n,0);
});

test("software: JPEG validation optimization preserves original bytes for progressive, grayscale and CMYK uploads",async()=>{
  const corpus=JSON.parse(readFileSync("tests/fixtures/jpeg-validation.json","utf8")) as {fixtures:{name:string;width:number;height:number;jpeg_base64:string}[]};
  for(const name of ["RGB-17x31-p1-s2","L-17x31-p0-s0","CMYK-17x31-p1-s0"]){
    const f=corpus.fixtures.find(f=>f.name===name)!,bytes=new Uint8Array(Buffer.from(f.jpeg_base64,"base64"));
    const l=lab(),r=await running(l),e=edge(l),meta={...r.metadata,width:f.width,height:f.height,content_rect:{x:0,y:0,width:f.width,height:f.height},content_sha256:await hash(bytes)};
    await e.service.acceptFrame(r.actor,meta,bytes);
    const read=await e.service.readScreen(alice,{},0,false);
    assert.equal(read.state,"available");assert.deepEqual(Buffer.from(read.image!,"base64"),Buffer.from(bytes),name);
    assert.equal(read.metadata?.width,f.width);assert.equal(read.metadata?.height,f.height);
    await e.flush();const row=l.db.raw.prepare("SELECT detail_json FROM sb_metrics WHERE frame_id=? AND kind='upload'").get(meta.frame_id)!;
    assert.equal(JSON.parse(row.detail_json as string).jpeg_validation_profile,"strict_components_v1");
  }
});
test("software: fresh capture correlation, observation reuse and stop prevent stale replay", async () => {
  const l = lab(), r = await running(l); await l.service.acceptFrame(r.actor, r.metadata, r.bytes);
  const pending = await l.service.getScreen(alice, { device_id: r.actor.id, bridge_session_id: r.identity.bridge_session_id, force_fresh: true, wait_ms: 0 });
  const refresh = await l.service.claimRefresh(r.actor, r.identity, 0); assert.equal(refresh?.refresh_request_id, pending.refresh_request_id);
  l.tick(100);
  const next = { ...r.metadata, frame_id: uid(), frame_seq: 2, capture_mono_ms: 10100, refresh_received_mono_ms: 10050, refresh_request_id: refresh!.refresh_request_id };
  await l.service.acceptFrame(r.actor, next);
  const image = await l.service.getScreen(alice, { device_id: r.actor.id, bridge_session_id: r.identity.bridge_session_id, wait_ms: 0 }); assert.equal(image.state, "available");
  const again = await l.service.getScreen(alice, { device_id: r.actor.id, bridge_session_id: r.identity.bridge_session_id, force_fresh: true, wait_ms: 0 }); assert.notEqual(again.refresh_request_id, refresh!.refresh_request_id);
  await l.service.stop(r.actor, r.identity.bridge_session_id, true); assert.equal(l.bucket.values.size, 0);
  await assert.rejects(l.service.acceptFrame(r.actor, { ...next, frame_id: uid(), frame_seq: 3 }, r.bytes), /STALE_SESSION/);
  await assert.rejects(l.service.createSession(r.actor, { mode: "broadcast", broadcast_id: r.identity.broadcast_id, request_id: uid(), control_enabled: false }), /BROADCAST_STOPPED/);
});
test("software: late upload transit is old; wrong-owner and no-identity MCP calls leak no image", async () => {
  const l = lab(), r = await running(l); l.tick(4000);
  await assert.rejects(l.service.acceptFrame(r.actor, r.metadata, r.bytes), /OLD_CAPTURE/);
  await assert.rejects(l.service.getScreen(bob, { device_id: r.actor.id, bridge_session_id: r.identity.bridge_session_id, wait_ms: 0 }), /NOT_FOUND/);
  const request = new Request("https://test.example/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_devices", arguments: {} } }) });
  const response = await handleMcp(request, { engine: () => l.service, caller: () => { throw new BridgeError("UNAUTHENTICATED", 401); }, origin: "https://test.example",toolAudience:"development" });
  const result = await response.json() as any; assert.equal(response.status,401); assert.equal(result.error.code,-32001);
});

test("software: refresh monotonic elapsed tightens the lower bound without accepting future capture", async () => {
  const l = lab(), r = await running(l); await l.service.acceptFrame(r.actor, r.metadata, r.bytes);
  await l.service.getScreen(alice, { device_id: r.actor.id, bridge_session_id: r.identity.bridge_session_id, force_fresh: true, wait_ms: 0 });
  const refresh = await l.service.claimRefresh(r.actor, r.identity, 0); l.tick(500);
  const next = { ...r.metadata, frame_id: uid(), frame_seq: 2, capture_mono_ms: 10400, refresh_received_mono_ms: 10100, refresh_request_id: refresh!.refresh_request_id };
  await assert.rejects(l.service.acceptFrame(r.actor, { ...next, capture_mono_ms: 20000 }), /CLOCK_UNCERTAIN/);
  await l.service.acceptFrame(r.actor, next);
  const image = await l.service.getScreen(alice, { device_id: r.actor.id, bridge_session_id: r.identity.bridge_session_id, wait_ms: 0 });
  assert.equal(image.state, "available"); assert.equal(image.metadata?.age_ms, 200);
});

test("software: deferred metrics and cleanup never resurrect an image after stop", async () => {
  const l = lab(), r = await running(l), jobs: { delay: number; job: () => Promise<void> }[] = [];
  const service = new BridgeEngine({ db: l.db as unknown as D1Database, bucket: l.bucket as unknown as R2Bucket, now: l.now, schedule: (delay, job) => { jobs.push({ delay, job }); } });
  await service.acceptFrame(r.actor, r.metadata, r.bytes);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS count FROM sb_metrics").get()?.count, 0);
  const image = await service.getScreen(alice, { device_id: r.actor.id, bridge_session_id: r.identity.bridge_session_id, wait_ms: 0 }); assert.equal(image.state, "available");
  await service.stop(r.actor, r.identity.bridge_session_id, true);
  for (const item of jobs.filter(item => item.delay === 0)) await item.job();
  assert.equal(l.bucket.values.size, 0); assert.equal(l.db.raw.prepare("SELECT count(*) AS count FROM sb_frames").get()?.count, 0);
  assert.equal((await service.getScreen(alice, { device_id: r.actor.id, bridge_session_id: r.identity.bridge_session_id, wait_ms: 0 })).state, "unavailable");
});

test("software: stop during object download is fenced before an image can be returned", async () => {
  const l = lab(), r = await running(l); await l.service.acceptFrame(r.actor, r.metadata, r.bytes);
  const get = l.bucket.get.bind(l.bucket);
  l.bucket.get = async key => { const value = await get(key); await l.service.stop(r.actor, r.identity.bridge_session_id, true); return value; };
  const image = await l.service.getScreen(alice, { device_id: r.actor.id, bridge_session_id: r.identity.bridge_session_id, wait_ms: 0 });
  assert.equal(image.state, "unavailable"); assert.equal(image.image, undefined);
});

test("software: RAM cache is bounded, owner/session/key scoped, latest-only and expires", () => {
  let now = 100; const cache = new LiveFrameCache(6, () => now);
  const entry = { owner: "a", session: "s", frame: "f", key: "k", bytes: new Uint8Array([1,2,3,4]), expires: 200 };
  cache.put("d", entry);
  assert.equal(cache.get("d", "b", "s", "k"), null); assert.equal(cache.get("d", "a", "wrong", "k"), null);
  cache.put("e", { ...entry, key: "next" }); assert.equal(cache.byteLength, 4); assert.equal(cache.get("d", "a", "s", "k"), null);
  cache.clear("e", "old-session"); assert.equal(cache.byteLength, 4);
  now = 201; assert.equal(cache.get("e", "a", "s", "next"), null); assert.equal(cache.byteLength, 0);
});

test("software: the frame commit hint requires a fresh raw capture and the entire original scope",()=>{
  let now=1000;const cache=new LiveFrameCache(1024,()=>now);
  const entry={owner:"owner",session:"share",frame:"frame",key:"key",bytes:new Uint8Array([1]),expires:5000};
  const barrier={owner:"owner",device:"phone",session:"share",worker:"worker",lease:1,captureAfter:350};
  cache.put("phone",entry);
  assert.equal(cache.hasCommitAfter(barrier),false);
  const commit={worker:"worker",lease:1,captureMono:350,captureLower:950};
  cache.put("phone",{...entry,commit});
  assert.equal(cache.hasCommitAfter(barrier),false);
  cache.put("phone",{...entry,commit:{...commit,captureMono:351}});
  assert.equal(cache.hasCommitAfter(barrier),true);
  for(const changed of [{owner:"other"},{device:"other"},{session:"other"},{worker:"other"},{lease:2}]){
    assert.equal(cache.hasCommitAfter({...barrier,...changed}),false);
  }
  now=2450;
  assert.equal(cache.hasCommitAfter(barrier),false);
});

function edge(l: ReturnType<typeof lab>,framePermits?:FrameUploadPermits,pairedShadow?:Dependencies["pairedShadow"],
  uploadTrace?:Pick<Dependencies,"frameUploadTraceDevice"|"frameUploadTraceLog">) {
  const jobs: { delay: number; job: () => Promise<void> }[] = [], cache = new LiveFrameCache(4 * 1024 * 1024, l.now);
  const service = new BridgeEngine({ db: l.db as unknown as D1Database, bucket: l.bucket as unknown as R2Bucket, now: l.now, cache, framePermits, pairedShadow, schedule: (delay, job) => { jobs.push({ delay, job }); },...uploadTrace });
  return { service, cache, jobs, flush: async () => { while (jobs.some(value => value.delay === 0)) { const i = jobs.findIndex(value => value.delay === 0); await jobs.splice(i, 1)[0].job(); } } };
}

async function framePermitFixture(framePermits=new FrameUploadPermits("ab".repeat(32))){
  const l=lab(),r=await running(l),e=edge(l,framePermits);
  const request=(proof:string,token=r.token,length=r.bytes.length)=>new Request("https://test.example/v1/device/frame",
    {method:"POST",headers:{Authorization:"Bearer "+token,[framePermitHeader]:proof,"Content-Length":String(length)}});
  const before=l.db.requests;
  const cold=await e.service.acceptFrameRequest(request(framePermitRequest),r.metadata,async limit=>{
    assert.equal(limit,undefined);return r.bytes;
  });
  assert.equal(l.db.requests-before,2);
  assert.ok("frame_upload_permit" in cold&&typeof cold.frame_upload_permit==="string");
  assert.equal(record(cold.request_timing).frame_permit_admission_code,2);
  assert.equal(record(cold).frame_upload_permit_ttl_ms,10_000);
  const permit=cold.frame_upload_permit;
  const next=(sequence:number,elapsed=sequence-1)=>({...r.metadata,frame_id:uid(),frame_seq:sequence,
    captured_at:new Date(l.now()).toISOString(),capture_mono_ms:10000+elapsed,capture_offset_ms:elapsed});
  return {l,r,e,permit,request,next};
}

test("software: frame permit publishes a small JPEG in one round trip with its actual MCP image",async()=>{
  const {l,r,e,permit,request,next}=await framePermitFixture();
  l.tick(50);
  const before=l.db.requests,meta=next(2,50);
  const result=await e.service.acceptFrameRequest(request(permit),meta,async limit=>{
    assert.equal(limit,framePermitMaxBytes);return r.bytes;
  });
  assert.equal(l.db.requests-before,1);
  assert.equal(result.accepted_frame_id,meta.frame_id);
  assert.equal(result.request_timing_scope,"acceptFrameRequest_permit_entry_to_D1_ack");
  const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen",arguments:{device_id:r.actor.id,wait_for_new_ms:0}}})}),
    {engine:()=>e.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development"});
  const rpc=await response.json() as {result:{content:{type:string;data?:string}[]}};
  assert.equal(rpc.result.content.find(item=>item.type==="image")?.data,Buffer.from(r.bytes).toString("base64"));
});

test("software: scoped frame upload trace records the existing signed write without another query",async()=>{
  const permits=new FrameUploadPermits("0123456789abcdef".repeat(4));
  const {l,r,permit,request,next}=await framePermitFixture(permits);
  const events:unknown[]=[];
  const e=edge(l,permits,undefined,{frameUploadTraceDevice:r.actor.id.toUpperCase(),
    frameUploadTraceLog:event=>events.push(JSON.parse(JSON.stringify(event)))});
  l.tick(50);
  const start=l.now(),before=l.db.requests,meta=next(2,50),batch=l.db.batch.bind(l.db);
  l.db.batch=async statements=>{const result=await batch(statements);l.tick(7);return result;};
  const result=await runWithBridgeContext({workerFetchStartedUTC:start-3,waitUntil:()=>{}},()=>
    e.service.acceptFrameRequest(request(permit),meta,async limit=>{
      assert.equal(limit,framePermitMaxBytes);l.tick(4);return r.bytes;
    }));
  assert.equal(l.db.requests-before,1);
  assert.equal(result.accepted_frame_id,meta.frame_id);
  assert.equal(result.request_timing_scope,"acceptFrameRequest_permit_entry_to_D1_ack");
  assert.equal(record(result.request_timing).d1_reply_observed_at_ms,undefined);
  assert.deepEqual(events,[{event:"frame_upload_attempt",frame_id:meta.frame_id,admission:"signed_permit",
    worker_fetch_started_at_ms:start-3,frame_handler_entry_at_ms:start,authority_verified_at_ms:start,
    body_completed_at_ms:start+4,d1_write_dispatched_at_ms:start+4,d1_reply_observed_at_ms:start+11,
    d1_frame_write_changed:true,frame_handler_settled_at_ms:start+11,outcome:"accepted"}]);
});

test("software: scoped frame upload trace distinguishes body failure, write rejection and acceptance",async()=>{
  for(const mode of ["body","write","accepted","log_throws"]){
    const l=lab(),r=await running(l),events:Record<string,unknown>[]=[];
    const e=edge(l,undefined,undefined,{frameUploadTraceDevice:r.actor.id,frameUploadTraceLog:event=>{
      events.push(JSON.parse(JSON.stringify(event)));
      if(mode==="log_throws")throw new Error("diagnostic unavailable");
    }});
    const before=l.db.requests,start=l.now();
    const upload=e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),
      r.metadata,async()=>{
        l.tick(5);
        if(mode==="body")throw new BridgeError("BODY_TOO_LARGE",413);
        if(mode==="write")l.db.raw.exec("UPDATE sb_devices SET revoked=1");
        return r.bytes;
      });
    if(mode==="body"||mode==="write")await assert.rejects(upload,mode==="body"?/BODY_TOO_LARGE/:/STALE_FRAME_OR_LEASE/);
    else assert.equal((await upload).accepted_frame_id,r.metadata.frame_id);
    assert.equal(l.db.requests-before,mode==="body"?1:2,mode);
    const event:Record<string,unknown>={event:"frame_upload_attempt",frame_id:r.metadata.frame_id,admission:"authenticated_snapshot",
      authority_verified_at_ms:start,frame_handler_entry_at_ms:start,frame_handler_settled_at_ms:start+5,
      outcome:mode==="body"||mode==="write"?"rejected":"accepted"};
    if(mode==="body")event.error_status=413;
    else Object.assign(event,{body_completed_at_ms:start+5,d1_write_dispatched_at_ms:start+5,d1_reply_observed_at_ms:start+5,
      d1_frame_write_changed:mode!=="write",...(mode==="write"?{error_status:409}:{})});
    assert.deepEqual(events,[event],mode);
  }
});

test("software: frame upload trace defaults off and refuses foreign, unverified and stale-scope requests",async()=>{
  for(const mode of ["disabled","invalid_device","different_device","bad_auth","revoked","stale_scope"]){
    const l=lab(),r=await running(l),events:unknown[]=[];
    const device=mode==="disabled"?undefined:mode==="invalid_device"?"invalid":mode==="different_device"?uid():r.actor.id;
    const e=edge(l,undefined,undefined,{frameUploadTraceDevice:device,frameUploadTraceLog:event=>events.push(event)});
    if(mode==="revoked")l.db.raw.exec("UPDATE sb_devices SET revoked=1");
    const token=mode==="bad_auth"?"A".repeat(40):r.token;
    const metadata=mode==="stale_scope"?{...r.metadata,worker_id:uid()}:r.metadata;
    const upload=e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+token}}),
      metadata,async()=>r.bytes);
    if(mode==="bad_auth"||mode==="revoked")await assert.rejects(upload,/UNAUTHENTICATED/);
    else if(mode==="stale_scope")await assert.rejects(upload,/STALE_LEASE/);
    else assert.equal((await upload).accepted_frame_id,r.metadata.frame_id);
    assert.deepEqual(events,[],mode);
  }
});

test("software: warm JPEG permit renewal uses one committed D1 batch and exact live bounds",async()=>{
  for(const clamp of ["worker","token","probe","lifetime"] as const){
    const permits=new FrameUploadPermits("0123456789abcdef".repeat(4));
    const {l,r,permit,request,next}=await framePermitFixture(permits); // Cold issuance used two D1 calls.
    const consumer=edge(l,new FrameUploadPermits("0123456789abcdef".repeat(4)));
    const tokenHash=await hash(r.token),original=await permits.verify(tokenHash,permit,l.now());
    assert.ok(original);
    const elapsed=original.expires-l.now()-1000;l.tick(elapsed);
    const close=l.now()+2600,far=l.now()+25_000;
    l.db.raw.prepare("UPDATE sb_devices SET worker_expires=?,token_expires=?")
      .run(clamp==="worker"?close:far,clamp==="token"?close:far);
    if(clamp==="probe")l.db.raw.prepare("UPDATE sb_clock_probes SET expires_at=? WHERE id=?").run(close,original.probe);
    const warm=request(permit);warm.headers.set(framePermitRenewHeader,framePermitRequest);
    const before=l.db.requests,metadata=next(2,elapsed);
    const result=await consumer.service.acceptFrameRequest(warm,metadata,async limit=>{
      assert.equal(l.db.requests,before);assert.equal(limit,framePermitMaxBytes);return r.bytes;
    });
    assert.equal(l.db.requests-before,1);
    assert.equal(result.accepted_frame_id,metadata.frame_id);
    assert.equal(result.request_timing_scope,"acceptFrameRequest_permit_entry_to_D1_ack");
    assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames").get()!.frame_id,metadata.frame_id);
    assert.ok("frame_upload_permit" in result&&typeof result.frame_upload_permit==="string");
    const renewed=await permits.verify(tokenHash,result.frame_upload_permit,l.now());
    assert.deepEqual(renewed,{...original,probeExpires:clamp==="probe"?close:original.probeExpires,
      expires:clamp==="lifetime"?l.now()+10_000:close});
    assert.equal(record(result).frame_upload_permit_ttl_ms,renewed!.expires-l.now());
    assert.notEqual(result.frame_upload_permit,permit);
    assert.equal(await permits.verify(await hash("foreign token"),result.frame_upload_permit,l.now()),null);
  }
});

test("software: warm JPEG renewal leaves legacy, unextended and cold fallback paths intact",async()=>{
  for(const mode of ["no_extension","older_app","priority","expired"] as const){
    const {l,r,e,permit,request,next}=await framePermitFixture();
    const elapsed=mode==="expired"?12_000:50;l.tick(elapsed);
    if(mode!=="no_extension")l.db.raw.prepare("UPDATE sb_devices SET worker_expires=?").run(l.now()+20_000);
    const warm=request(permit);
    if(mode!=="older_app")warm.headers.set(framePermitRenewHeader,framePermitRequest);
    const before=l.db.requests,metadata=next(2,elapsed);
    const result=await e.service.acceptFrameRequest(warm,{...metadata,...(mode==="priority"?{after_command_id:uid()}:{})},async limit=>{
      assert.equal(limit,mode==="expired"?undefined:framePermitMaxBytes);return r.bytes;
    });
    assert.equal(result.accepted_frame_id,metadata.frame_id);
    assert.equal(l.db.requests-before,mode==="expired"?2:1);
    assert.equal(typeof record(result).frame_upload_permit,mode==="expired"?"string":"undefined");
  }
});

test("software: warm JPEG renewal cannot escape live scope, freshness or replay fences",async()=>{
  for(const change of [
    "UPDATE sb_devices SET revoked=1","UPDATE sb_devices SET token_hash='rotated'","UPDATE sb_devices SET token_expires=0",
    "UPDATE sb_devices SET worker_id='"+uid()+"'","UPDATE sb_devices SET lease_epoch=lease_epoch+1",
    "UPDATE sb_sessions SET capture_state='paused'","UPDATE sb_sessions SET broadcast_id='"+uid()+"'",
    "UPDATE sb_clock_probes SET created_at=created_at+1","UPDATE sb_clock_probes SET expires_at=0",
  ]){
    const {l,r,e,permit,request,next}=await framePermitFixture();
    l.tick(50);const before=l.db.requests,jobs=e.jobs.length;
    const warm=request(permit);warm.headers.set(framePermitRenewHeader,framePermitRequest);
    await assert.rejects(e.service.acceptFrameRequest(warm,next(2,50),async()=>{
      l.db.raw.exec(change);return r.bytes;
    }),/STALE_FRAME_OR_LEASE/,change);
    assert.equal(l.db.requests-before,1,change);
    assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames").get()!.frame_id,r.metadata.frame_id,change);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_observations").get()!.n,1,change);
    assert.equal(e.jobs.length,jobs,change);
  }
  const {l,r,e,permit,request,next}=await framePermitFixture();
  l.tick(50);
  const warm=request(permit);warm.headers.set(framePermitRenewHeader,framePermitRequest);
  const before=l.db.requests;
  await assert.rejects(e.service.acceptFrameRequest(warm,{...next(2,50),capture_age_ms:1501},async()=>r.bytes),/OLD_CAPTURE/);
  assert.equal(l.db.requests,before);
  await assert.rejects(e.service.acceptFrameRequest(warm,{...next(2,50),frame_id:r.metadata.frame_id},async()=>r.bytes),/FRAME_ID_REUSED/);
  assert.equal(l.db.requests-before,1);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_observations").get()!.n,1);
});

test("software: shared frame permit crosses independent instances without a pre-body database read",async()=>{
  const key="0123456789abcdef".repeat(4);
  const {l,r,permit,request,next}=await framePermitFixture(new FrameUploadPermits(key));
  const other=edge(l,new FrameUploadPermits(key));
  l.tick(50);const before=l.db.requests,meta=next(2,50);
  const result=await other.service.acceptFrameRequest(request(permit),meta,async limit=>{
    assert.equal(l.db.requests,before);assert.equal(limit,framePermitMaxBytes);return r.bytes;
  });
  assert.equal(l.db.requests-before,1);
  assert.equal(result.request_timing_scope,"acceptFrameRequest_permit_entry_to_D1_ack");
  assert.equal(result.accepted_frame_id,meta.frame_id);
});

test("software: valid but rotated frame permit key retains device-token authentication",async()=>{
  const key="0123456789abcdef".repeat(4);
  for(const otherKey of ["fedcba9876543210".repeat(4)]){
    const {l,r,permit,request,next}=await framePermitFixture(new FrameUploadPermits(key));
    const other=edge(l,new FrameUploadPermits(otherKey));
    l.tick(50);const before=l.db.requests,meta=next(2,50);let read=false;
    await assert.rejects(other.service.acceptFrameRequest(request(permit,"A".repeat(40)),meta,async()=>{
      read=true;return r.bytes;
    }),/UNAUTHENTICATED/);
    assert.equal(read,false);
    const afterRejected=l.db.requests;
    const result=await other.service.acceptFrameRequest(request(permit),meta,async limit=>{
      assert.equal(l.db.requests,afterRejected+1);assert.equal(limit,undefined);return r.bytes;
    });
    assert.equal(l.db.requests-afterRejected,2);assert.ok(afterRejected>before);
    assert.equal(result.accepted_frame_id,meta.frame_id);
    assert.ok("frame_upload_permit" in result&&result.frame_upload_permit!==permit);
  }
});

test("software: frame permit commit checks revocation, token rotation, live scope and probe anchor",async()=>{
  const changes=[
    "UPDATE sb_devices SET revoked=1","UPDATE sb_devices SET token_hash='rotated'","UPDATE sb_devices SET token_expires=0",
    "UPDATE sb_devices SET worker_expires=0","UPDATE sb_devices SET lease_epoch=lease_epoch+1",
    "UPDATE sb_sessions SET capture_state='paused'","UPDATE sb_sessions SET broadcast_id='"+uid()+"'",
    "UPDATE sb_clock_probes SET created_at=created_at+1","UPDATE sb_clock_probes SET expires_at=0",
  ];
  for(const sharedKey of [undefined,"0123456789abcdef".repeat(4)])for(const change of changes){
    const {l,r,e,permit,request,next}=await framePermitFixture(new FrameUploadPermits(sharedKey??"ab".repeat(32)));
    const consumer=sharedKey?edge(l,new FrameUploadPermits(sharedKey??"ab".repeat(32))):e,jobs=consumer.jobs.length;
    l.tick(50);const meta=next(2,50),before=l.db.requests;
    await assert.rejects(consumer.service.acceptFrameRequest(request(permit),meta,async limit=>{
      assert.equal(limit,framePermitMaxBytes);l.db.raw.exec(change);return r.bytes;
    }),/STALE_FRAME_OR_LEASE/,change);
    assert.equal(l.db.requests-before,1,change);
    assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames").get()!.frame_id,r.metadata.frame_id,change);
    assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations").get()!.n,1,change);
    assert.equal(consumer.jobs.length,jobs,change);
  }
});

test("software: frame permit fallback retains pre-body authentication and accepts a new isolate",async()=>{
  const {l,r,e,permit,request,next}=await framePermitFixture(),other=edge(l,new FrameUploadPermits("cd".repeat(32)));
  l.tick(50);const meta=next(2,50);let read=false;
  await assert.rejects(e.service.acceptFrameRequest(request(permit,"A".repeat(40)),meta,async()=>{
    read=true;return r.bytes;
  }),/UNAUTHENTICATED/);
  assert.equal(read,false);
  const before=l.db.requests;
  const result=await other.service.acceptFrameRequest(request(permit),meta,async limit=>{
    assert.equal(limit,undefined);return r.bytes;
  });
  assert.equal(l.db.requests-before,2);
  assert.ok("frame_upload_permit" in result&&result.frame_upload_permit!==permit);
});

test("software: frame permit pre-commit freshness rejection has no database side effects",async()=>{
  const {l,r,e,permit,request,next}=await framePermitFixture();
  l.tick(50);
  l.db.raw.exec("UPDATE sb_devices SET revoked=1");
  const before=l.db.requests,jobs=e.jobs.length;
  await assert.rejects(e.service.acceptFrameRequest(request(permit),{...next(2,50),capture_age_ms:1501},async()=>r.bytes),/OLD_CAPTURE/);
  assert.equal(l.db.requests,before);
  assert.equal(e.jobs.length,jobs);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations").get()!.n,1);
});

test("software: expired frame permits and larger declared bodies use the existing upload path",async()=>{
  for(const expired of [false,true]){
    const {l,r,e,permit,request,next}=await framePermitFixture();
    const elapsed=expired?12_000:50;
    l.tick(elapsed);
    l.db.raw.prepare("UPDATE sb_devices SET worker_expires=?").run(l.now()+20_000);
    const before=l.db.requests,meta=next(2,elapsed);
    const result=await e.service.acceptFrameRequest(request(permit,r.token,expired?r.bytes.length:framePermitMaxBytes+1),meta,async limit=>{
      assert.equal(limit,undefined);return r.bytes;
    });
    assert.equal(l.db.requests-before,2);
    assert.equal(result.accepted_frame_id,meta.frame_id);
  }
});

test("software: frame permit refuses mismatched body sizes and never marks a superseded frame",async()=>{
  const {l,r,e,permit,request,next}=await framePermitFixture();
  l.tick(100);
  const older=next(2,50),newer=next(3,100);
  await assert.rejects(e.service.acceptFrameRequest(request(permit,r.token,r.bytes.length-1),older,async()=>r.bytes),/INVALID_CONTENT_LENGTH/);
  await e.service.acceptFrameRequest(request(permit),newer,async()=>r.bytes);
  await assert.rejects(e.service.acceptFrameRequest(request(permit),older,async()=>r.bytes),/STALE_FRAME_OR_LEASE/);
  const reused={...next(4,110),frame_id:r.metadata.frame_id};
  l.tick(10);
  await assert.rejects(e.service.acceptFrameRequest(request(permit),reused,async()=>r.bytes),/FRAME_ID_REUSED/);
  assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames").get()!.frame_id,newer.frame_id);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations").get()!.n,2);
});

const observationRequest=(token:string)=>new Request("https://test.example/v1/device/frame-observation",{method:"POST",headers:{Authorization:"Bearer "+token}});
const nextObservation=(r:Awaited<ReturnType<typeof running>>,extra:Record<string,unknown>={})=>({...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:10001,capture_offset_ms:1,...extra});

test("software: observation request authenticates and commits in one database round trip",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const before=l.db.requests,meta=nextObservation(r),result=await e.service.acceptObservationRequest(observationRequest(r.token),meta);
  assert.equal(result.accepted_frame_id,meta.frame_id);assert.equal(l.db.requests-before,1);
  const frame=l.db.raw.prepare("SELECT metadata FROM sb_frames WHERE device_id=?").get(r.actor.id)!;
  assert.equal(JSON.parse(String(frame.metadata)).capture_mono_ms,meta.capture_mono_ms);
});

test("software: observation request includes body and authenticated commit timing without credential data",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);const began=l.now();
  const meta=nextObservation(r),result=await e.service.acceptObservationRequest(observationRequest(r.token),async()=>{l.tick(75);return meta;});
  const timing=result.request_timing as Record<string,number>;
  assert.ok(timing);assert.equal(result.request_timing_scope,"acceptObservationRequest_entry_to_D1_ack");
  assert.equal(timing.request_started_at_ms,began);assert.equal(timing.body_read_completed_at_ms,began+75);
  assert.equal(timing.authenticated_commit_started_at_ms,began+75);assert.equal(timing.commit_observed_at_ms,began+75);
  await e.flush();const row=l.db.raw.prepare("SELECT detail_json FROM sb_metrics WHERE frame_id=? AND kind='observation'").get(meta.frame_id)!;
  const detail=JSON.parse(String(row.detail_json));assert.deepEqual(detail.request_timing,timing);
  assert.doesNotMatch(JSON.stringify(timing),new RegExp(r.token));assert.ok(!Object.keys(timing).some(k=>/token|authorization|body_content/i.test(k)));
});

test("software: observation request first confirmation does not add another round trip",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  l.db.raw.prepare("UPDATE sb_devices SET confirmed_at=NULL WHERE id=?").run(r.actor.id);const before=l.db.requests;
  await e.service.acceptObservationRequest(observationRequest(r.token),nextObservation(r));
  assert.equal(l.db.requests-before,1);assert.notEqual(l.db.raw.prepare("SELECT confirmed_at FROM sb_devices WHERE id=?").get(r.actor.id)!.confirmed_at,null);
});

test("software: observation request hides payload errors behind token authentication and writes nothing",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  let read=false;
  await assert.rejects(e.service.acceptObservationRequest(new Request("https://test.example/"),async()=>{read=true;return {}; }),/UNAUTHENTICATED/);
  assert.equal(read,false);
  await assert.rejects(e.service.acceptObservationRequest(observationRequest("wrong-token-"+uid().replaceAll("-","")),async()=>{throw new Error("PRIVATE_PAYLOAD");}),/UNAUTHENTICATED/);
  assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
  assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames WHERE device_id=?").get(r.actor.id)!.frame_id,r.metadata.frame_id);
});

test("software: observation request eligible SQL cannot mutate another device or erase replay state without its token",async()=>{
  const l=lab(),r=await running(l),other=await running(l,bob),e=edge(l);
  await e.service.acceptFrame(r.actor,r.metadata,r.bytes);await e.service.acceptFrame(other.actor,other.metadata,other.bytes);
  const changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  await assert.rejects(e.service.acceptObservationRequest(observationRequest("wrong-token-"+uid().replaceAll("-","")),{...r.metadata}),/UNAUTHENTICATED/);
  assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
  await assert.rejects(e.service.acceptObservationRequest(observationRequest(other.token),nextObservation(r)),/STALE_SESSION/);
  assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames WHERE device_id=?").get(r.actor.id)!.frame_id,r.metadata.frame_id);
  assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames WHERE device_id=?").get(other.actor.id)!.frame_id,other.metadata.frame_id);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_observations").get()!.n,2);
});

test("software: observation request cannot use a token revoked rotated or expired while its transaction queues",async()=>{
  for(const fault of ["revoked","rotated","expired"]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
    if(fault==="expired")l.db.raw.prepare("UPDATE sb_devices SET token_expires=? WHERE id=?").run(l.now()+50,r.actor.id);
    const batch=l.db.batch.bind(l.db);let once=false,changes:unknown;
    l.db.batch=async statements=>{
      if(!once){once=true;
        if(fault==="revoked")l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(r.actor.id);
        if(fault==="rotated")l.db.raw.prepare("UPDATE sb_devices SET token_hash=? WHERE id=?").run(await hash(uid()),r.actor.id);
        if(fault==="expired")l.tick(100);
        changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
      }return batch(statements);
    };
    await assert.rejects(e.service.acceptObservationRequest(observationRequest(r.token),nextObservation(r)),/UNAUTHENTICATED/,fault);
    assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes,fault);
    assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames WHERE device_id=?").get(r.actor.id)!.frame_id,r.metadata.frame_id,fault);
  }
});

test("software: observation request rechecks live owner worker lease mode session and sharing at commit",async()=>{
  for(const fault of ["owner","worker","lease","mode","session","pause","stop"]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);const meta=nextObservation(r);
    const batch=l.db.batch.bind(l.db);let once=false;
    l.db.batch=async statements=>{if(!once){once=true;
      if(fault==="owner")l.db.raw.prepare("UPDATE sb_devices SET owner_id=? WHERE id=?").run(bob.id,r.actor.id);
      if(fault==="worker")l.db.raw.prepare("UPDATE sb_devices SET worker_id=? WHERE id=?").run(uid(),r.actor.id);
      if(fault==="lease")l.db.raw.prepare("UPDATE sb_devices SET lease_epoch=lease_epoch+1 WHERE id=?").run(r.actor.id);
      if(fault==="mode")l.db.raw.prepare("UPDATE sb_sessions SET mode='foreground_diagnostic' WHERE id=?").run(r.identity.bridge_session_id);
      if(fault==="session")l.db.raw.prepare("UPDATE sb_devices SET current_session=? WHERE id=?").run(uid(),r.actor.id);
      if(fault==="pause")l.db.raw.prepare("UPDATE sb_sessions SET capture_state='paused' WHERE id=?").run(r.identity.bridge_session_id);
      if(fault==="stop")l.db.raw.prepare("UPDATE sb_sessions SET state='stopped' WHERE id=?").run(r.identity.bridge_session_id);
    }return batch(statements);};
    await assert.rejects(e.service.acceptObservationRequest(observationRequest(r.token),meta),/STALE|CAPTURE_PAUSED|UNAUTHENTICATED/,fault);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_observations WHERE frame_id=?").get(meta.frame_id)!.n,0,fault);
    assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames WHERE device_id=?").get(r.actor.id)!.frame_id,r.metadata.frame_id,fault);
  }
});

test("software: observation request cannot cache a prior token grant across requests",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const first=nextObservation(r);await e.service.acceptObservationRequest(observationRequest(r.token),first);
  l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(r.actor.id);
  await assert.rejects(e.service.acceptObservationRequest(observationRequest(r.token),nextObservation(r,{frame_seq:3,capture_mono_ms:10002,capture_offset_ms:2})),/UNAUTHENTICATED/);
  assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames WHERE device_id=?").get(r.actor.id)!.frame_id,first.frame_id);
});

test("software: observation request misses preserve replay markers and explicit NEED_IMAGE fallback",async()=>{
  for(const fault of ["missing","hash","dimensions","replay"]){
    const l=lab(),r=await running(l),e=edge(l);
    if(fault!=="missing")await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
    const meta=nextObservation(r);
    if(fault==="hash")meta.content_sha256=await hash("different-reference");
    if(fault==="dimensions"){meta.width=17;meta.content_rect={x:0,y:0,width:17,height:32};}
    if(fault==="replay")l.db.raw.prepare("INSERT INTO sb_observations(id,device_id,frame_id,created_at) VALUES(?,?,?,?)").run(r.actor.id+":"+meta.frame_id,r.actor.id,meta.frame_id,l.now()-100);
    const before=l.db.raw.prepare("SELECT count(*) n FROM sb_observations").get()!.n;
    await assert.rejects(e.service.acceptObservationRequest(observationRequest(r.token),meta),fault==="dimensions"?/DIMENSION_MISMATCH/:fault==="replay"?/FRAME_ID_REUSED/:/NEED_IMAGE/,fault);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_observations").get()!.n,before,fault);
    if(fault==="replay")assert.equal(l.db.raw.prepare("SELECT created_at FROM sb_observations WHERE frame_id=?").get(meta.frame_id)!.created_at,l.now()-100);
  }
});

test("software: observation request rechecks freshness and lease inside a delayed transaction",async()=>{
  for(const fault of ["age","lease"]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
    if(fault==="lease")l.db.raw.prepare("UPDATE sb_devices SET worker_expires=? WHERE id=?").run(l.now()+100,r.actor.id);
    const batch=l.db.batch.bind(l.db);let once=false;
    l.db.batch=async statements=>{if(!once){once=true;l.tick(fault==="age"?1600:200);}return batch(statements);};
    const meta=nextObservation(r);await assert.rejects(e.service.acceptObservationRequest(observationRequest(r.token),meta),fault==="age"?/OLD_CAPTURE/:/STALE_LEASE/);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_observations WHERE frame_id=?").get(meta.frame_id)!.n,0);
    assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames WHERE device_id=?").get(r.actor.id)!.frame_id,r.metadata.frame_id);
  }
});

test("software: observation request rejects unknown slow expired and future capture clocks without relabelling",async()=>{
  for(const fault of ["unverified","slow","expired","future","reported_age"]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);const meta=nextObservation(r);
    if(fault==="unverified")meta.capture_clock_verified=false;
    if(fault==="slow")meta.clock_rtt_ms=3000;
    if(fault==="expired")l.db.raw.prepare("UPDATE sb_clock_probes SET expires_at=? WHERE id=?").run(l.now()-1,meta.clock_probe_id);
    if(fault==="future")meta.capture_offset_ms=1000;
    if(fault==="reported_age")meta.capture_age_ms=1500;
    await assert.rejects(e.service.acceptObservationRequest(observationRequest(r.token),meta),fault==="expired"?/INVALID_CLOCK_PROBE/:fault==="reported_age"?/OLD_CAPTURE/:/CLOCK_UNCERTAIN/,fault);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_observations WHERE frame_id=?").get(meta.frame_id)!.n,0,fault);
  }
});

test("software: observation request fallback reauthenticates instead of using the fast miss authority",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  l.db.raw.prepare("UPDATE sb_frames SET inline_jpeg=NULL WHERE device_id=?").run(r.actor.id);
  const prepare=l.db.prepare.bind(l.db);l.db.prepare=sql=>{const s=prepare(sql);if(sql.startsWith("SELECT s.*")){
    const bind=s.bind.bind(s);s.bind=(...values:unknown[])=>{const b=bind(...values),first=b.first.bind(b);b.first=async<T>()=>{
      l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(r.actor.id);return first<T>();};return b;};}return s;};
  await assert.rejects(e.service.acceptObservationRequest(observationRequest(r.token),nextObservation(r)),/UNAUTHENTICATED/);
});

test("software: observation request fallback preserves a valid owned RAM reference without changing capture time",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  l.db.raw.prepare("UPDATE sb_frames SET inline_jpeg=NULL WHERE device_id=?").run(r.actor.id);
  const meta=nextObservation(r),reply=await e.service.acceptObservationRequest(observationRequest(r.token),meta);
  assert.equal(reply.accepted_frame_id,meta.frame_id);
  const stored=JSON.parse(String(l.db.raw.prepare("SELECT metadata FROM sb_frames WHERE device_id=?").get(r.actor.id)!.metadata));
  assert.equal(stored.capture_mono_ms,meta.capture_mono_ms);assert.equal(stored.frame_id,meta.frame_id);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_observations").get()!.n,2);
  assert.equal(reply.request_timing_scope,"acceptObservationRequest_entry_to_D1_ack");
});

test("software: delayed observation fallback cannot restore a superseded JPEG key",async()=>{
  for(const samePixels of [false,true]){
    const {l,r,e,permit,request,next}=await framePermitFixture();
    await e.flush();
    const current=()=>l.db.raw.prepare("SELECT frame_id,image_key,storage_ready FROM sb_frames WHERE device_id=?").get(r.actor.id)!;
    const old=current();
    assert.equal(old.storage_ready,1);
    // A legacy R2-backed row has no inline pixels. Use a different reader
    // without the writer's RAM cache so the authenticated fallback checks R2.
    l.db.raw.prepare("UPDATE sb_frames SET inline_jpeg=NULL WHERE device_id=?").run(r.actor.id);
    let entered!:()=>void,resume!:()=>void;
    const paused=new Promise<void>(resolve=>{entered=resolve;}),continueRead=new Promise<void>(resolve=>{resume=resolve;});
    const head=l.bucket.head.bind(l.bucket);
    l.bucket.head=async key=>{
      const object=await head(key);
      if(key===old.image_key){assert.ok(object);entered();await continueRead;}
      return object;
    };
    l.tick(350);
    const later=next(3,300);
    const observation=l.service.acceptObservationRequest(observationRequest(r.token),later)
      .then(reply=>({reply,error:null}),error=>({reply:null,error}));
    const began=await Promise.race([paused.then(()=>true),observation.then(()=>false)]);
    assert.equal(began,true,"observation must retain old authenticated key before replacement");
    const bytes=samePixels?r.bytes:jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,42)},70).data;
    const replacement={...next(2,200),content_sha256:await hash(bytes)};
    let winner:ReturnType<typeof current>;
    try {
      const accepted=await e.service.acceptFrameRequest(request(permit,r.token,bytes.length),replacement,async()=>bytes);
      assert.equal(accepted.accepted_frame_id,replacement.frame_id);
      assert.equal(record(accepted.request_timing).frame_permit_admission_code,5);
      winner=current();
      assert.notEqual(winner.image_key,old.image_key);
    } finally {resume();}
    const result=await observation,stored=current();
    assert.ok(result.error instanceof BridgeError&&result.error.code==="STALE_FRAME_OR_LEASE",
      JSON.stringify({samePixels,lateObservationAccepted:result.reply?.accepted_frame_id===later.frame_id,
        oldKeyRestored:stored.image_key===old.image_key}));
    assert.equal(stored.frame_id,replacement.frame_id);
    assert.equal(stored.image_key,winner.image_key);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_observations WHERE frame_id=?").get(later.frame_id)!.n,0);
    await e.flush();
    assert.ok(await head(String(winner.image_key)));
  }
});

test("software: observation request late stale acknowledgement cannot erase a newer frame",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const meta=nextObservation(r),newer={...r.metadata,frame_id:uid(),frame_seq:3,capture_mono_ms:11600,capture_offset_ms:1600,captured_at:new Date(l.now()+1600).toISOString()};
  const batch=l.db.batch.bind(l.db);let once=false;
  l.db.batch=async statements=>{const result=await batch(statements);if(!once){once=true;l.tick(1600);await e.service.acceptFrame(r.actor,newer,r.bytes);}return result;};
  await assert.rejects(e.service.acceptObservationRequest(observationRequest(r.token),meta),/OLD_CAPTURE/);
  assert.equal(l.db.raw.prepare("SELECT frame_id FROM sb_frames WHERE device_id=?").get(r.actor.id)!.frame_id,newer.frame_id);
});

test("software: observation request retains client-tag compatibility without creating control or stored authority",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const meta=nextObservation(r,{after_command_id:uid()}),before=l.db.requests;
  await e.service.acceptObservationRequest(observationRequest(r.token),meta);assert.equal(l.db.requests-before,1);
  const stored=JSON.parse(String(l.db.raw.prepare("SELECT metadata FROM sb_frames WHERE device_id=?").get(r.actor.id)!.metadata));
  assert.equal(stored.after_command_id,undefined);assert.equal(stored.capture_mono_ms,10001);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,0);
});

test("software: cold isolate shares the bounded frame cache and still supports R2 fallback", async () => {
  const l = lab(), r = await running(l), writer = edge(l), reader = edge(l);
  await writer.service.acceptFrame(r.actor, r.metadata, r.bytes);
  const waiting = await reader.service.viewScreen(alice, { wait_ms: 0 });
  assert.equal(waiting.state, "available"); assert.equal(waiting.trace?.source, "d1_atomic_snapshot");
  assert.equal(l.db.raw.prepare("SELECT count(*) AS count FROM sb_refreshes").get()?.count, 0);
  await writer.flush();
  l.db.raw.prepare("UPDATE sb_frames SET inline_jpeg=NULL").run(); reader.cache.clear(r.actor.id);
  const ready = await reader.service.viewScreen(alice, { wait_ms: 0 }); assert.equal(ready.state, "available"); assert.equal(ready.trace?.source, "r2");
});

test("software: oversized JPEG uses R2 without expanding the latest-frame or RAM cache", async () => {
  const l = lab(), r = await running(l), e = edge(l), pixels = Buffer.alloc(512 * 512 * 4); let random = 12345;
  for (let index = 0; index < pixels.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; pixels[index + channel] = random >>> 24; }
    pixels[index + 3] = 255;
  }
  const bytes = jpeg.encode({ width: 512, height: 512, data: pixels }, 90).data;
  assert.ok(bytes.length > 256 * 1024 && bytes.length < 1024 * 1024);
  const meta = { ...r.metadata, width: 512, height: 512, content_rect: { x: 0, y: 0, width: 512, height: 512 }, content_sha256: await hash(bytes) };
  const receipt = await e.service.acceptFrame(r.actor, meta, bytes);
  assert.equal(receipt.storage_pending, false); assert.equal(e.cache.byteLength, 0);
  assert.equal(l.db.raw.prepare("SELECT inline_jpeg FROM sb_frames").get()?.inline_jpeg, null);
  assert.equal((await e.service.viewScreen(alice, { wait_ms: 0 })).trace?.source, "r2");
});

test("software: delayed R2 write after stop is deleted and cached pixels cannot bypass revocation", async () => {
  const l = lab(), r = await running(l), e = edge(l);
  await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
  await e.service.revoke(alice, r.actor.id);
  assert.equal(e.cache.byteLength, 0);
  await e.flush(); assert.equal(l.bucket.values.size, 0);
  assert.equal((await e.service.viewScreen(alice, { wait_ms: 0 })).state, "unavailable");
});

test("software: superseded deferred images cannot become an R2 screenshot history", async () => {
  const l = lab(), r = await running(l), e = edge(l);
  await e.service.acceptFrame(r.actor, r.metadata, r.bytes); l.tick(100);
  await e.service.acceptFrame(r.actor, { ...r.metadata, frame_id: uid(), frame_seq: 2, capture_mono_ms: 10100, capture_offset_ms: 100 }, r.bytes);
  await e.flush(); assert.equal(l.bucket.values.size, 1);
  assert.equal((await e.service.viewScreen(alice, { wait_ms: 0 })).state, "available");
});

test("software: deferred JPEG readiness and its metric share one D1 round trip", async () => {
  const l=lab(),r=await running(l),e=edge(l);
  const receipt=await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  assert.equal(receipt.storage_pending,true);
  const persist=e.jobs.find(job=>job.delay===0);
  assert.ok(persist);
  const before=l.db.requests;
  await persist.job();
  assert.equal(l.db.requests-before,1);
  const frame=l.db.raw.prepare("SELECT image_key,storage_ready FROM sb_frames WHERE device_id=?").get(r.actor.id)!;
  assert.equal(frame.storage_ready,1);
  assert.ok(l.bucket.values.has(String(frame.image_key)));
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_metrics WHERE kind='r2_persist' AND frame_id=?").get(r.metadata.frame_id)!.n,1);
});

test("software: deferred JPEG readiness follows the exact image key through a same-pixel observation", async () => {
  const l=lab(),r=await running(l),e=edge(l);
  await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const key=l.db.raw.prepare("SELECT image_key FROM sb_frames").get()!.image_key;
  const persist=e.jobs.find(job=>job.delay===0)!;
  const next=nextObservation(r);
  await e.service.acceptFrame(r.actor,next);
  await persist.job();
  const live=l.db.raw.prepare("SELECT frame_id,image_key,storage_ready FROM sb_frames").get()!;
  assert.equal(live.frame_id,next.frame_id);
  assert.equal(live.image_key,key);
  assert.equal(live.storage_ready,1);
  assert.ok(l.bucket.values.has(String(key)));
});

test("software: deferred JPEG never becomes ready after its live scope changes", async () => {
  for (const change of ["UPDATE sb_devices SET revoked=1","UPDATE sb_devices SET lease_epoch=lease_epoch+1","UPDATE sb_sessions SET state='stopped'"]) {
    const l=lab(),r=await running(l),e=edge(l);
    await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
    const batch=l.db.batch.bind(l.db);
    l.db.batch=async statements=>{
      if(statements.some(s=>s.sql.startsWith("UPDATE sb_frames SET storage_ready=1")))l.db.raw.exec(change);
      return batch(statements);
    };
    await e.jobs.find(job=>job.delay===0)!.job();
    assert.equal(l.db.raw.prepare("SELECT storage_ready FROM sb_frames").get()!.storage_ready,0,change);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_metrics WHERE kind='r2_persist'").get()!.n,0,change);
    assert.equal(l.bucket.values.size,0,change);
  }
});

test("software: deferred JPEG lost ready reply preserves an already committed current object", async () => {
  const l=lab(),r=await running(l),e=edge(l);
  await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const batch=l.db.batch.bind(l.db);
  l.db.batch=async statements=>{
    const result=await batch(statements);
    if(statements.some(s=>s.sql.startsWith("UPDATE sb_frames SET storage_ready=1")))throw new Error("Fixture lost ready reply");
    return result;
  };
  await e.jobs.find(job=>job.delay===0)!.job();
  const frame=l.db.raw.prepare("SELECT image_key,storage_ready FROM sb_frames").get()!;
  assert.equal(frame.storage_ready,1);
  assert.ok(l.bucket.values.has(String(frame.image_key)));
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_metrics WHERE kind='r2_persist'").get()!.n,1);
});

test("software: fast view fails closed when more than one active phone exists", async () => {
  const l = lab(), first = await running(l), second = await running(l);
  await l.service.acceptFrame(first.actor, first.metadata, first.bytes); await l.service.acceptFrame(second.actor, second.metadata, second.bytes);
  const result = await l.service.viewScreen(alice, { wait_ms: 0 }); assert.equal(result.state, "choose_device"); assert.equal(result.image, undefined);
  assert.equal((await l.service.viewScreen(alice, { device_id: first.actor.id, wait_ms: 0 })).state, "available");
});

async function presentRepeated(l:ReturnType<typeof lab>,r:Awaited<ReturnType<typeof running>>,sequence:number,patch:Record<string,unknown>={}):Promise<Record<string,unknown>>{
  const probe=await l.service.clockProbe(r.actor),elapsed=l.now()-Date.parse(r.metadata.captured_at);
  return l.service.heartbeat(r.actor,{...r.identity,capture_state:"active",usb_connected:false,heartbeat_seq:sequence,
    repeated_frame:{is_repeated:true,frame_id:r.metadata.frame_id,capture_mono_ms:r.metadata.capture_mono_ms,
      presentation_mono_ms:10000+elapsed,presentation_seq:sequence,source_quiet_ms:Math.max(1000,elapsed),
      clock_probe_id:probe.clock_probe_id,presentation_offset_ms:0,clock_rtt_ms:10,...patch}});
}
async function presentLatest(l:ReturnType<typeof lab>,r:Awaited<ReturnType<typeof running>>,sequence:number,knownFrame?:string,source:Record<string,unknown>={}):Promise<Record<string,unknown>> {
  const probe=await l.service.clockProbe(r.actor),elapsed=l.now()-Date.parse(r.metadata.captured_at);
  const capture=Number(source.source_capture_mono_ms??r.metadata.capture_mono_ms),phoneMono=10000+elapsed;
  return l.service.heartbeat(r.actor,{...r.identity,capture_state:"active",usb_connected:false,heartbeat_seq:sequence,
    repeated_frame:{is_repeated:true,resolution:"latest_accepted",...(knownFrame?{known_frame_id:knownFrame}:{}),
      source_capture_mono_ms:capture,source_width:r.metadata.native_width_px,source_height:r.metadata.native_height_px,
      source_orientation:r.metadata.orientation,source_orientation_epoch:r.metadata.orientation_epoch,
      presentation_mono_ms:phoneMono,presentation_seq:sequence,source_quiet_ms:phoneMono-capture,
      clock_probe_id:probe.clock_probe_id,presentation_offset_ms:0,clock_rtt_ms:10,...source}});
}
test("software: content-bound presentation cannot refresh the old screen after a changed local image",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(6000);
  const result=await presentLatest(l,r,1,r.metadata.frame_id,{source_content_sha256:"a".repeat(64)});
  assert.equal(result.repeated_frame_accepted,false);
  assert.equal((await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0})).state,"unavailable");
});

test("software: content-bound repeats survive a long static screen without renewing capture time",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  for(let sequence=1;sequence<=12;sequence++){
    l.tick(5000);const result=await presentLatest(l,r,sequence,undefined,{source_content_sha256:r.metadata.content_sha256});
    assert.equal(result.repeated_frame_accepted,true);
    const read=await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0});
    assert.equal(read.state,"repeated");assert.equal(read.metadata!.capture_lower_phone_mono_ms,10000);
    assert.equal(read.metadata!.frame_id,r.metadata.frame_id);
  }
});

test("software: content-bound presentation recovers a changed image after its upload ACK was lost",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  l.tick(500);const bytes=jpeg.encode({width:r.metadata.width,height:r.metadata.height,data:Buffer.alloc(r.metadata.width*r.metadata.height*4,155)},65).data;
  const changed={...nextObservation(r,{capture_mono_ms:10500,capture_offset_ms:500}),content_sha256:await hash(bytes)};
  await e.service.acceptFrame(r.actor,changed,bytes);l.tick(5500);
  const stale=await presentLatest(l,r,1,r.metadata.frame_id,{source_capture_mono_ms:11000,source_content_sha256:r.metadata.content_sha256});
  assert.equal(stale.repeated_frame_accepted,false);
  const current=await presentLatest(l,r,2,r.metadata.frame_id,{source_capture_mono_ms:11000,source_content_sha256:changed.content_sha256});
  assert.equal(current.repeated_frame_accepted,true);assert.equal(current.presented_frame_id,changed.frame_id);
  const read=await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0});assert.equal(read.metadata!.frame_id,changed.frame_id);
});

test("software: content-bound presentation rejects malformed source hashes",async()=>{
  for(const source_content_sha256 of ["", "A".repeat(64), "a".repeat(63)]){
    const l=lab(),r=await running(l);await l.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(6000);
    await assert.rejects(presentLatest(l,r,1,undefined,{source_content_sha256}),/INVALID_REPEAT_SOURCE_CONTENT/);
  }
});

test("software: latest accepted presentation recovers the first image even if its upload ACK was lost",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(6000);
  const result=await presentLatest(l,r,1);
  assert.equal(result.repeated_frame_accepted,true);assert.equal(result.presented_frame_id,r.metadata.frame_id);
  assert.equal((result.presented_frame as Record<string,unknown>).capture_mono_ms,10000);
  assert.equal((await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0})).state,"repeated");
  l.tick(1000);const next=await presentLatest(l,r,2,r.metadata.frame_id);assert.equal(next.presented_frame,null);
});
test("software: a stale acknowledged reference cannot hide a newer server-admitted image",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  l.tick(500);const next=nextObservation(r,{capture_mono_ms:10500,capture_offset_ms:500});await e.service.acceptFrame(r.actor,next,r.bytes);
  l.tick(5500);const result=await presentLatest(l,r,1,r.metadata.frame_id,{source_capture_mono_ms:11000});
  assert.equal(result.presented_frame_id,next.frame_id);assert.equal((result.presented_frame as Record<string,unknown>).capture_mono_ms,10500);
  const read=await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0});
  assert.equal(read.metadata!.frame_id,next.frame_id);assert.equal(read.metadata!.capture_lower_phone_mono_ms,10500);
});
test("software: latest presentation cannot bridge source geometry changes or source times before its image",async()=>{
  for(const source of [{source_width:640},{source_orientation_epoch:1},{source_capture_mono_ms:9999}]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(6000);
    assert.equal((await presentLatest(l,r,1,undefined,source)).repeated_frame_accepted,false);
    assert.equal((await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0})).image,undefined);
  }
});
test("software: an unknown foreign frame reference never selects another phone image",async()=>{
  const l=lab(),r=await running(l),foreign=await running(l,bob),e=edge(l);
  await e.service.acceptFrame(r.actor,r.metadata,r.bytes);await e.service.acceptFrame(foreign.actor,foreign.metadata,foreign.bytes);l.tick(6000);
  const result=await presentLatest(l,r,1,foreign.metadata.frame_id);
  assert.equal(result.presented_frame_id,r.metadata.frame_id);
  assert.equal((result.presented_frame as Record<string,unknown>).worker_id,r.identity.worker_id);
});
test("software: App heartbeat repeats advance presentation time without changing capture or image identity",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const original=l.db.raw.prepare("SELECT capture_lower,frame_seq,frame_id,sha256,inline_jpeg FROM sb_frames").get()!;
  l.tick(6000);const first=await presentRepeated(l,r,1);assert.equal(first.repeated_frame_accepted,true);
  const repeated=await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0});
  assert.equal(repeated.state,"repeated");assert.equal(repeated.image,Buffer.from(r.bytes).toString("base64"));
  assert.ok(Number(repeated.metadata!.age_ms)>6000);assert.ok(Number(repeated.metadata!.presentation_age_ms)<1500);
  assert.equal(repeated.metadata!.capture_lower_phone_mono_ms,10000);assert.equal(repeated.metadata!.usable_for_input,false);
  assert.equal(repeated.image_ref,undefined);assert.equal(repeated.trace?.termination,"success");
  l.tick(1000);await presentRepeated(l,r,2);
  const current=l.db.raw.prepare("SELECT capture_lower,frame_seq,frame_id,sha256,inline_jpeg FROM sb_frames").get()!;
  assert.deepEqual(current,original);
  const again=await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0});
  assert.ok(Number(again.metadata!.presentation_received_at_ms)>Number(repeated.metadata!.presentation_received_at_ms));
});
test("software: strict capture readers never consume a repeated presentation",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(6000);await presentRepeated(l,r,1);
  assert.equal((await e.service.readScreen(alice,{wait_for_new_ms:0})).image,undefined);
  assert.equal((await e.service.readScreen(alice,{wait_for_new_ms:0})).image,undefined);
  const before=l.db.requests,changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  assert.equal((await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0})).state,"repeated");
  assert.equal(l.db.requests-before,1);assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
});
test("software: a reused view reference distinguishes a repeated old capture from newly captured identical pixels",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const first=await e.service.readScreen(alice,{wait_for_new_ms:0});l.tick(6000);await presentRepeated(l,r,1);
  const repeated=await e.service.readScreen(alice,{allow_repeated:true,if_unchanged_since:first.image_ref,wait_for_new_ms:0});
  assert.equal(repeated.state,"repeated");assert.equal(typeof repeated.image,"string");
  await e.service.acceptObservationRequest(observationRequest(r.token),nextObservation(r,{capture_mono_ms:16000,capture_offset_ms:6000}));
  const fresh=await e.service.readScreen(alice,{allow_repeated:true,if_unchanged_since:first.image_ref,wait_for_new_ms:0});
  assert.equal(fresh.state,"unchanged");assert.equal(fresh.metadata!.capture_lower_phone_mono_ms,16000);
});
test("software: client upload metadata cannot forge server presentation evidence",async()=>{
  const l=lab(),r=await running(l),e=edge(l);
  await assert.rejects(e.service.acceptFrame(r.actor,{...r.metadata,repeat_presented_at:l.now()+6000,repeat_received_at:l.now()+6000,is_repeated:true},r.bytes),/UNKNOWN_FRAME_FIELD/);
  await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  l.tick(6000);
  assert.equal((await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0})).image,undefined);
});
test("software: three-minute quiet presentation retains one image with its original capture timestamp",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const before=l.db.raw.prepare("SELECT capture_lower FROM sb_frames").get()!.capture_lower;
  for(let i=1;i<=72;i++){l.tick(2500);assert.equal((await presentRepeated(l,r,i)).repeated_frame_accepted,true);}
  const result=await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0});
  assert.equal(result.state,"repeated");assert.equal(result.metadata!.capture_lower_server_utc_ms,before);
  assert.ok(Number(result.metadata!.age_ms)>=180000);assert.ok(Number(result.metadata!.presentation_age_ms)<1500);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_frames").get()!.n,1);
});
test("software: fresh JPEG and zero-byte observations both clear all repeat evidence",async()=>{
  for(const mode of ["jpeg","observation"]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(6000);await presentRepeated(l,r,1);
    const next=nextObservation(r,{capture_mono_ms:16000,capture_offset_ms:6000});
    if(mode==="jpeg")await e.service.acceptFrame(r.actor,next,r.bytes);
    else await e.service.acceptObservationRequest(observationRequest(r.token),next);
    const row=l.db.raw.prepare("SELECT frame_id,repeat_presented_at,repeat_phone_mono_ms,repeat_sequence FROM sb_frames").get()!;
    assert.equal(row.frame_id,next.frame_id);assert.equal(row.repeat_presented_at,null);assert.equal(row.repeat_phone_mono_ms,null);assert.equal(row.repeat_sequence,0);
    assert.equal((await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0})).state,"available");
    assert.equal((await presentRepeated(l,r,2)).repeated_frame_accepted,false,"an old frame hint cannot mark a newer capture repeated");
  }
});
test("software: delayed heartbeat cannot reactivate pause or renew presentation after a newer heartbeat",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(6000);await presentRepeated(l,r,1);
  await l.service.heartbeat(r.actor,{...r.identity,capture_state:"paused",usb_connected:false,heartbeat_seq:3});
  const before=l.db.raw.prepare("SELECT repeat_presented_at,expires_at FROM sb_frames").get();
  const late=await presentRepeated(l,r,2);assert.equal(late.stale_heartbeat,true);
  assert.equal(l.db.raw.prepare("SELECT capture_state FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!.capture_state,"paused");
  assert.deepEqual(l.db.raw.prepare("SELECT repeat_presented_at,expires_at FROM sb_frames").get(),before);
  assert.equal((await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0})).image,undefined);
});
test("software: stopped, revoked, expired or replaced scopes redact repeated images",async()=>{
  for(const fault of ["stop","revoke","expired","lease","session","owner"]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(6000);await presentRepeated(l,r,1);
    assert.equal((await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0})).state,"repeated");
    if(fault==="stop")await e.service.stop(r.actor,r.identity.bridge_session_id);
    if(fault==="revoke")l.db.raw.prepare("UPDATE sb_devices SET revoked=1").run();
    if(fault==="expired")l.tick(11000);
    if(fault==="lease")l.db.raw.prepare("UPDATE sb_devices SET lease_epoch=lease_epoch+1").run();
    if(fault==="session")await l.service.createSession(r.actor,{mode:"broadcast",broadcast_id:uid(),request_id:uid(),control_enabled:false});
    assert.equal((await e.service.readScreen(fault==="owner"?bob:alice,{allow_repeated:true,wait_for_new_ms:0})).image,undefined,fault);
  }
});
test("software: old or inconsistent repeat messages cannot refresh presentation evidence",async()=>{
  for(const fault of ["clock","wrong_capture","wrong_frame"]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(6000);
    const patch=fault==="clock"?{presentation_offset_ms:-1600}:fault==="wrong_capture"?{capture_mono_ms:9999}:{frame_id:uid()};
    if(fault==="clock")await assert.rejects(presentRepeated(l,r,1,patch),/INVALID_NUMBER/);
    else assert.equal((await presentRepeated(l,r,1,patch)).repeated_frame_accepted,false);
    assert.equal((await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0})).image,undefined);
  }
});
test("software: repeated presentation is rechecked at release, not only at snapshot time",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(6000);await presentRepeated(l,r,1);
  const reader=edge(l),put=reader.cache.put.bind(reader.cache);reader.cache.put=(...args)=>{l.tick(1600);return put(...args);};
  const result=await reader.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0});assert.equal(result.image,undefined);
});
test("software: delayed or expired clock proofs cannot turn a late heartbeat into a new presentation",async()=>{
  for(const expired of [false,true]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
    let probe:string,offset=0;
    if(expired){
      for(let i=1;i<=4;i++){l.tick(10000);await presentRepeated(l,r,i);}
      probe=r.metadata.clock_probe_id;l.tick(21000);offset=59900;
    }else {l.tick(6000);probe=(await l.service.clockProbe(r.actor)).clock_probe_id;l.tick(1600);}
    const before=l.db.raw.prepare("SELECT repeat_presented_at,expires_at FROM sb_frames").get();
    const elapsed=l.now()-Date.parse(r.metadata.captured_at),sequence=10;
    const result:Record<string,unknown>=await l.service.heartbeat(r.actor,{...r.identity,capture_state:"active",usb_connected:false,heartbeat_seq:sequence,
      repeated_frame:{is_repeated:true,frame_id:r.metadata.frame_id,capture_mono_ms:10000,presentation_mono_ms:10000+elapsed,
        presentation_seq:sequence,source_quiet_ms:elapsed,clock_probe_id:probe,presentation_offset_ms:offset,clock_rtt_ms:10}});
    assert.equal(result.repeated_frame_accepted,false);
    assert.deepEqual(l.db.raw.prepare("SELECT repeat_presented_at,expires_at FROM sb_frames").get(),before);
  }
});
test("software: repeated views never satisfy a post-command fresh-capture barrier",async()=>{
  const l=lab(),r=await acknowledgedMouse(l,9999),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  l.tick(6000);await presentRepeated(l,r,1);
  assert.equal((await e.service.readScreen(alice,{allow_repeated:true,wait_for_new_ms:0})).state,"repeated");
  const result=await e.service.readScreen(alice,{allow_repeated:true,after_command_id:r.command.command_id,wait_for_new_ms:0});
  assert.equal(result.image,undefined);assert.notEqual(result.state,"repeated");
});
test("software: modern and legacy MCP reject stale capture despite a fresh presentation heartbeat",async()=>{
  for(const modern of [true,false]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(6000);await presentRepeated(l,r,1);
    const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json",...(modern?{"MCP-Protocol-Version":"2026-07-28"}:{})},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen",arguments:{wait_for_new_ms:0}}})}),{engine:()=>e.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
    const rpc=await response.json() as RpcReply;assert.equal(rpc.result.structuredContent.state,"unavailable");
    assert.equal(rpc.result.structuredContent.reason,"NO_FRESH_FRAME");
    assert.equal(rpc.result.content.filter(b=>b.type==="image").length,0);
  }
});
test("software: immediate image delivery caps freshness below 1000ms even with a legacy larger request",async()=>{
  for(const args of [{},{max_age_ms:3000}]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
    const initial=await e.service.readScreen(alice,args,0);l.tick(999-Number(initial.metadata!.age_ms));assert.equal((await e.service.readScreen(alice,args,0)).state,"available");
    l.tick(1);const stale=await e.service.readScreen(alice,args,0);assert.equal(stale.image,undefined);assert.equal(stale.trace?.max_age_ms,1000);
  }
});
test("software: read-only immediate screen uses one database snapshot, zero R2 calls and zero writes", async () => {
  const l = lab(), r = await running(l), e = edge(l); await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
  const before = l.db.raw.prepare("SELECT total_changes() AS n").get()!.n;
  const prepare = l.db.prepare.bind(l.db), queries: string[] = [];
  l.db.prepare = sql => { queries.push(sql); assert.ok(/^(SELECT|WITH)\b/.test(sql) && !/\b(UPDATE|INSERT|DELETE)\b/.test(sql), "read_screen must not modify D1"); return prepare(sql); };
  l.bucket.get = async () => { throw new Error("read_screen must not wait on R2"); };
  const result = await e.service.readScreen(alice, {});
  assert.equal(result.state, "available"); assert.deepEqual(Buffer.from(result.image!, "base64"), Buffer.from(r.bytes));
  assert.equal(queries.length, 1); assert.equal(l.db.raw.prepare("SELECT total_changes() AS n").get()!.n, before);
  assert.equal(result.trace?.lookups, 1);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_refreshes").get()!.n, 0);
  const call = new Request("https://test.example/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_screen", arguments: {} } }) });
  const response = await handleMcp(call, { engine: () => e.service, caller: () => alice, origin: "https://test.example",toolAudience:"development" });
  const rpc = await response.json() as RpcReply;
  assert.equal(rpc.result.isError, false); assert.ok(rpc.result.content.some(value => value.type === "image"));
  const summaryBytes=Buffer.byteLength(JSON.stringify(rpc.result.structuredContent));
  assert.ok(summaryBytes<1720,"Bounded clock/scope metadata plus the <=320-byte image handoff: "+summaryBytes);
  assert.deepEqual(Object.keys(rpc.result.structuredContent.trace as Record<string,unknown>),["native_transport"]);
  assert.equal(typeof rpc.result.structuredContent.runtime_version,"string");
  const lower=Number(rpc.result.structuredContent.pre_age_server_ms_lower),trace=rpc.result._meta.sayso_trace as Record<string,unknown>;
  assert.ok(Number.isFinite(lower)&&lower>=0&&lower<=Number(trace.lookup_ms));
});
test("software: a warm immediate read fetches authority and geometry without retransferring the JPEG from D1",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const prepare=l.db.prepare.bind(l.db);let inline=0,queries=0;
  l.db.prepare=sql=>{const statement=prepare(sql),bind=statement.bind.bind(statement);if(sql.startsWith("WITH candidates AS"))statement.bind=(...values:unknown[])=>{const bound=bind(...values),all=bound.all.bind(bound);bound.all=async<T>()=>{const result=await all<T>();queries++;for(const row of result.results)inline+=String((row as {inline_jpeg:string|null}).inline_jpeg??"").length;return result;};return bound;};return statement;};
  const before=l.db.raw.prepare("SELECT total_changes() n").get()!.n,view=await e.service.readScreen(alice,{});
  assert.equal(view.state,"available");assert.equal(view.image,Buffer.from(r.bytes).toString("base64"));assert.equal(inline,0);assert.equal(queries,1);
  assert.equal(view.trace?.pixel_source,"private_ram");assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,before);
});
test("software: optional reported JPEG quality is bounded diagnostics and remains bound to the accepted frame",async()=>{
  for(const quality of [0.5,0.62,0.72]){const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,{...r.metadata,client_timing:{jpeg_quality:quality}},r.bytes);const read=await e.service.readScreen(alice,{});assert.equal(read.trace?.jpeg_quality,quality);assert.equal(read.image,Buffer.from(r.bytes).toString("base64"));}
  for(const quality of [0,1.01,-1]){const l=lab(),r=await running(l);await assert.rejects(l.service.acceptFrame(r.actor,{...r.metadata,client_timing:{jpeg_quality:quality}},r.bytes));}
});
test("software: separate reader isolates reuse private edge pixels while D1 still verifies every read",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const entries=new Map<string,Response>(),store={match:async(q:Request)=>entries.get(q.url)?.clone(),put:async(q:Request,v:Response)=>{entries.set(q.url,v.clone());},delete:async(q:Request)=>entries.delete(q.url)};
  const pixels=new PrivatePixelCache("https://test.example",async()=>store,l.now);
  const first=new BridgeEngine({db:l.db as unknown as D1Database,bucket:l.bucket as unknown as R2Bucket,now:l.now,privatePixels:pixels});
  const cold=await first.readScreen(alice,{});assert.equal(cold.state,"available");
  const other=new BridgeEngine({db:l.db as unknown as D1Database,bucket:l.bucket as unknown as R2Bucket,now:l.now,privatePixels:pixels});
  const before=l.db.requests,warm=await other.readScreen(alice,{});
  assert.equal(warm.state,"available");assert.equal(warm.image,cold.image);assert.equal(warm.trace?.pixel_source,"private_edge");assert.equal(warm.trace?.d1_inline_jpeg_chars,0);assert.equal(l.db.requests-before,1);
  l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(r.actor.id);
  assert.equal((await other.readScreen(alice,{})).state,"unavailable");
  assert.equal((await other.readScreen(bob,{})).state,"unavailable");
});

test("software: private edge pixels cannot rescue stale, unknown-clock, paused, expired-lease or ambiguous authority",async()=>{
  for(const change of ["stale","clock","paused","lease","multiple"]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
    const entries=new Map<string,Response>(),store={match:async(q:Request)=>entries.get(q.url)?.clone(),put:async(q:Request,v:Response)=>{entries.set(q.url,v.clone());},delete:async(q:Request)=>entries.delete(q.url)};
    const pixels=new PrivatePixelCache("https://test.example",async()=>store,l.now),reader=new BridgeEngine({db:l.db as unknown as D1Database,bucket:l.bucket as unknown as R2Bucket,now:l.now,privatePixels:pixels});
    assert.equal((await reader.readScreen(alice,{})).state,"available");
    if(change==="stale")l.db.raw.prepare("UPDATE sb_frames SET capture_lower=?").run(l.now()-1500);
    if(change==="clock")l.db.raw.exec("UPDATE sb_frames SET capture_lower=NULL");
    if(change==="paused")l.db.raw.exec("UPDATE sb_sessions SET capture_state='paused'");
    if(change==="lease")l.db.raw.exec("UPDATE sb_devices SET lease_epoch=lease_epoch+1");
    if(change==="multiple")await running(l);
    const result=await reader.readScreen(alice,{},0);assert.notEqual(result.state,"available",change);assert.equal(result.image,undefined,change);
  }
});
test("software: a wrong private edge session forces one new inline snapshot and stop clears scoped pixels",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const entries=new Map<string,Response>(),store={match:async(q:Request)=>entries.get(q.url)?.clone(),put:async(q:Request,v:Response)=>{entries.set(q.url,v.clone());},delete:async(q:Request)=>entries.delete(q.url)};
  const pixels=new PrivatePixelCache("https://test.example",async()=>store,l.now),reader=new BridgeEngine({db:l.db as unknown as D1Database,bucket:l.bucket as unknown as R2Bucket,now:l.now,privatePixels:pixels});
  const frame=l.db.raw.prepare("SELECT image_key,expires_at FROM sb_frames").get()!;
  await pixels.put({owner:alice.id,device:r.actor.id,session:uid(),key:String(frame.image_key),sha256:r.metadata.content_sha256,bytes:r.bytes,expires:Number(frame.expires_at)});
  const result=await reader.readScreen(alice,{});assert.equal(result.state,"available");assert.equal(result.trace?.lookups,2);assert.equal(result.trace?.cache_fallback,true);assert.equal(result.image,Buffer.from(r.bytes).toString("base64"));
  await reader.stop(r.actor,r.identity.bridge_session_id);assert.equal(await pixels.peek(alice.id,null),null);assert.equal((await reader.readScreen(alice,{})).state,"unavailable");
});

test("software: screen metrics identify accepted frames without exposing pixels or another owner's records",async()=>{
  const l=lab(),r=await running(l);await l.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const before=l.db.raw.prepare("SELECT total_changes() n").get()!.n,result=await l.service.metricsFor(alice,r.actor.id);
  const row=result.recent.find(value=>value.kind==="upload");assert.equal(row?.frame_id,r.metadata.frame_id);
  assert.equal(Object.hasOwn(row!,"inline_jpeg"),false);assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,before);
  await assert.rejects(l.service.metricsFor(bob,r.actor.id),/NOT_FOUND/);
});

test("software: combined MCP diagnostics retain voice history in one read-only database round trip",async()=>{
  const l=lab(),r=await running(l);await l.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const run=uid();await voiceBenchmark(l.service,alice,{action:"start",run_id:run,scenario:"current_screen",device_id:r.actor.id});
  await voiceBenchmark(l.service,alice,{action:"finish",run_id:run,first_response_ms:700,total_ms:1300});
  const expectedVoice=await voiceRuns(l.service,alice,r.actor.id),batch=l.db.batch.bind(l.db),batches:string[][]=[];
  const maintenance:(()=>Promise<void>)[]=[];
  const scheduled=new BridgeEngine({db:l.db as unknown as D1Database,bucket:l.bucket as unknown as R2Bucket,now:l.now,schedule:(_delay,job)=>{maintenance.push(job);}});
  l.db.batch=async statements=>{batches.push(statements.map(s=>s.sql));assert.ok(statements.every(s=>/^(SELECT|WITH)\b/.test(s.sql)&&!/\b(INSERT|UPDATE|DELETE)\b/.test(s.sql)));return batch(statements);};
  const before=l.db.requests,changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"get_screen_metrics",arguments:{device_id:r.actor.id}}})}),{engine:()=>scheduled,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
  const result=(await response.json() as RpcReply).result;
  assert.equal(result.isError,false);assert.deepEqual(result.structuredContent.voice_benchmark,JSON.parse(JSON.stringify(expectedVoice)));
  assert.equal(l.db.requests-before,1);assert.equal(batches.length,1);
  assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
  assert.equal(result.content.filter(x=>x.type==="image").length,0);
  assert.ok(!JSON.stringify(result.structuredContent).includes("inline_jpeg"));
  assert.equal(maintenance.length,1,"Maintenance is scheduled separately from the read-only diagnostic projection");
  l.db.batch=batch;await maintenance[0]();
});

test("software: diagnostics gate every projection against revocation or owner replacement at batch execution",async()=>{
  for(const fault of ["revoked","owner_changed"]){
    const l=lab(),r=await running(l);await l.service.acceptFrame(r.actor,r.metadata,r.bytes);
    const batch=l.db.batch.bind(l.db);let observed=false;
    l.db.batch=async statements=>{
      if(fault==="revoked")l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(r.actor.id);
      else l.db.raw.prepare("UPDATE sb_devices SET owner_id=? WHERE id=?").run(bob.id,r.actor.id);
      const result=await batch(statements);observed=true;
      assert.ok(result.every(row=>row!==null&&Array.isArray(row.results)&&row.results.length===0),"No history, index audit or voice projection may survive failed authorization");
      return result;
    };
    await assert.rejects(l.service.metricsFor(alice,r.actor.id),/NOT_FOUND/);assert.equal(observed,true);
  }
});

test("software: a cold full image read warms private pixels for the next atomic snapshot",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);e.cache.clear(r.actor.id);
  const first=await e.service.readScreen(alice,{}),second=await e.service.readScreen(alice,{});
  assert.equal(first.trace?.pixel_source,"d1_inline");assert.ok(Number(first.trace?.d1_inline_jpeg_chars)>0);
  assert.equal(second.trace?.pixel_source,"private_ram");assert.equal(second.trace?.d1_inline_jpeg_chars,0);assert.equal(second.image,first.image);
});
test("software: private image hints are owner-scoped bounded and cannot expose mutable cache bytes",async()=>{
  let now=0;const cache=new LiveFrameCache(1024,()=>now),bytes=new Uint8Array([1,2,3]),digest=await hash(bytes);
  for(let n=0;n<30;n++)cache.put("d"+n,{owner:alice.id,session:"s",frame:"f",key:"k"+n,bytes,expires:100});
  bytes[0]=9;assert.equal(cache.hints(alice.id,null).length,16);assert.equal(cache.hints(bob.id,null).length,0);assert.deepEqual(cache.hints(alice.id,"d20"),["k20"]);
  assert.equal(cache.holdHints(alice.id,null).length,16);assert.deepEqual(cache.holdHints(bob.id,null),[]);
  assert.deepEqual(cache.holdHints(alice.id,"d20").map(hint=>[hint.device,hint.key]),[["d20","k20"]]);
  const returned=cache.get("d20",alice.id,"s","k20")!;returned[1]=9;
  assert.deepEqual(cache.getExact("d20",alice.id,"s","k20",digest),new Uint8Array([1,2,3]));assert.equal(cache.getExact("d20",alice.id,"s","k20","a".repeat(64)),null);
  assert.equal(cache.getExact("d20",bob.id,"s","k20",digest),null);now=100;assert.deepEqual(cache.holdHints(alice.id,null),[]);assert.deepEqual(cache.hints(alice.id,null),[]);assert.equal(cache.byteLength,0);
});
test("software: a cache hint race returns the newly authorized frame and its matching geometry",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const prepare=l.db.prepare.bind(l.db),frame=uid(),pixels=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,110)},70).data;let reads=0;
  l.db.prepare=sql=>{const statement=prepare(sql),bind=statement.bind.bind(statement);if(sql.startsWith("WITH candidates AS"))statement.bind=(...values:unknown[])=>{const bound=bind(...values),all=bound.all.bind(bound);bound.all=async<T>()=>{const result=await all<T>();if(++reads===1){e.cache.clear(r.actor.id);l.tick(100);await e.service.acceptFrame(r.actor,{...r.metadata,frame_id:frame,frame_seq:2,orientation_epoch:1,capture_mono_ms:10100,capture_offset_ms:100,content_sha256:await hash(pixels)},pixels);}return result;};return bound;};return statement;};
  const value=await e.service.readScreen(alice,{});assert.equal(reads,2);assert.equal(value.image,Buffer.from(pixels).toString("base64"));assert.equal(value.metadata?.frame_id,frame);assert.equal(value.metadata?.orientation_epoch,1);
});
test("software: native read and its atomic snapshot share one diagnostic request ID",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const reply=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen",arguments:{}}})}),{engine:()=>e.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development"});
  const body=await reply.json() as {result:{structuredContent:{mcp_request_id:string};_meta:{sayso_trace:{request_id:string}}}};
  assert.equal(body.result.structuredContent.mcp_request_id,body.result._meta.sayso_trace.request_id);
});
test("software: evicted or corrupted private pixels trigger one new fully authorized inline snapshot",async()=>{
  for(const fault of ["evict","corrupt","revoke","stale"]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
    if(fault==="corrupt"){const row=l.db.raw.prepare("SELECT image_key FROM sb_frames").get()!;e.cache.put(r.actor.id,{owner:alice.id,session:r.identity.bridge_session_id,frame:r.metadata.frame_id,key:String(row.image_key),bytes:new Uint8Array([1,2,3]),expires:l.now()+30000});}
    const prepare=l.db.prepare.bind(l.db);let queries=0;
    l.db.prepare=sql=>{const statement=prepare(sql),bind=statement.bind.bind(statement);if(sql.startsWith("WITH candidates AS"))statement.bind=(...values:unknown[])=>{const bound=bind(...values),all=bound.all.bind(bound);bound.all=async<T>()=>{const result=await all<T>();if(++queries===1&&fault!=="corrupt"){e.cache.clear(r.actor.id);if(fault==="revoke")l.db.raw.exec("UPDATE sb_devices SET revoked=1");if(fault==="stale")l.tick(1500);}return result;};return bound;};return statement;};
    const view=await e.service.readScreen(alice,{wait_for_new_ms:0});assert.equal(queries,fault==="stale"?1:2);
    if(fault==="revoke"||fault==="stale"){assert.equal(view.image,undefined);assert.equal(view.state,"unavailable");}
    else {assert.equal(view.image,Buffer.from(r.bytes).toString("base64"));assert.equal(view.trace?.cache_fallback,true);}
  }
});
test("software: conditional immediate read omits identical pixels only for a prior owner-bound image reference",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const first=await e.service.readScreen(alice,{});assert.equal(first.state,"available");assert.equal(typeof first.image_ref,"string");
  l.tick(100);await e.service.acceptFrame(r.actor,{...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:10100,capture_offset_ms:100},r.bytes);
  const reads=l.db.requests,changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  const same=await e.service.readScreen(alice,{if_unchanged_since:first.image_ref});assert.equal(same.state,"unchanged");assert.equal(same.image,undefined);
  assert.equal(same.image_ref,first.image_ref);assert.equal(same.metadata?.age_ms,50);assert.notEqual(same.metadata?.frame_id,first.metadata?.frame_id);
  assert.equal(l.db.requests-reads,1);assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
  const foreign=await e.service.readScreen(bob,{if_unchanged_since:first.image_ref});assert.equal(foreign.state,"unavailable");assert.equal(foreign.image_ref,undefined);
});
test("software: conditional read falls back to pixels for changed content, geometry, scope, missing or expired references",async()=>{
  for(const fault of ["content","geometry","lease","session","unknown","expired","cold"]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);const first=await e.service.readScreen(alice,{});
    assert.equal(typeof first.image_ref,"string");
    if(fault==="content") {l.tick(100);const pixels=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,128)},72).data;await e.service.acceptFrame(r.actor,{...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:10100,capture_offset_ms:100,content_sha256:await hash(pixels)},pixels);}
    if(fault==="geometry") l.db.raw.exec("UPDATE sb_frames SET metadata=json_set(metadata,'$.orientation_epoch',1)");
    if(fault==="lease") {l.db.raw.exec("UPDATE sb_devices SET lease_epoch=lease_epoch+1");l.db.raw.exec("UPDATE sb_frames SET lease_epoch=lease_epoch+1");}
    if(fault==="session") {const next=await running(l);await e.service.acceptFrame(next.actor,next.metadata,next.bytes);}
    if(fault==="expired") {l.tick(61000);await l.service.heartbeat(r.actor,{...r.identity,capture_state:"active",usb_connected:false});const clock=await l.service.clockProbe(r.actor);await e.service.acceptFrame(r.actor,{...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:71000,captured_at:new Date(l.now()).toISOString(),clock_probe_id:clock.clock_probe_id,capture_offset_ms:0},r.bytes);}
    const service=fault==="cold"?edge(l).service:e.service;
    const value=await service.readScreen(alice,{if_unchanged_since:fault==="unknown"?uid():first.image_ref});
    if(fault==="cold")assert.equal(value.state,"unchanged");else assert.notEqual(value.state,"unchanged");if(value.state==="available")assert.equal(typeof value.image,"string");
  }
});
test("software: unchanged image MCP replies carry the reference in text and structure with zero image blocks",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  async function read(args:Record<string,unknown>){const reply=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","mcp-protocol-version":"2026-07-28"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen",arguments:args}})}),{engine:()=>e.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development"});return (await reply.json() as RpcReply).result;}
  const first=await read({}),reference=first.structuredContent!.image_ref;
  assert.equal(first.content.filter(x=>x.type==="image").length,1);assert.equal(typeof reference,"string");
  const second=await read({if_unchanged_since:reference});assert.equal(second.structuredContent!.state,"unchanged");assert.equal(second.content.filter(x=>x.type==="image").length,0);
  assert.equal(JSON.parse(second.content.find(x=>x.type==="text")!.text!).image_ref,reference);
  l.tick(1500);
  const stillFresh=await read({if_unchanged_since:reference});
  assert.equal(stillFresh.structuredContent!.state,"unchanged");
  assert.equal(stillFresh.content.filter(x=>x.type==="image").length,0);
  l.tick(500);
  const stale=await read({if_unchanged_since:reference,wait_for_new_ms:0});
  assert.equal(stale.structuredContent!.state,"unavailable");
  assert.equal(stale.content.filter(x=>x.type==="image").length,0);
  assert.equal(stale.structuredContent!.image_ref,undefined);
});
test("software: image references are scoped content validators with a bounded lifetime and no hit renewal",()=>{
  let now=0;const cache=new LiveFrameCache(1024,()=>now),identity={owner:uid(),device:uid(),session:uid(),lease:1,sha256:"a".repeat(64),geometry:"same"};
  const first=cache.rememberView(identity);assert.equal(cache.matchesView(first,identity),true);
  for(const changed of [{owner:uid()},{device:uid()},{session:uid()},{lease:2},{sha256:"b".repeat(64)},{geometry:"changed"}])assert.equal(cache.matchesView(first,{...identity,...changed}),false);
  for(let n=0;n<128;n++)assert.equal(cache.rememberView(identity),first);
  const expiring=cache.rememberView(identity);now=60000;assert.equal(cache.matchesView(expiring,identity),false);
  cache.clear(identity.device,identity.session);assert.equal(cache.byteLength,0);
});
test("software: a cold worker can confirm identical fresh pixels but a stopped session cannot use a view reference",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);const first=await e.service.readScreen(alice,{});
  const cold=new BridgeEngine({db:l.db as unknown as D1Database,bucket:l.bucket as unknown as R2Bucket,now:l.now});
  const queries=l.db.requests,same=await cold.readScreen(alice,{if_unchanged_since:first.image_ref});assert.equal(same.state,"unchanged");assert.equal(same.image,undefined);assert.equal(same.image_ref,first.image_ref);
  assert.equal(same.trace?.d1_inline_jpeg_chars,0);assert.equal(l.db.requests-queries,1);
  l.db.raw.exec("UPDATE sb_sessions SET state='stopped'");const stopped=await cold.readScreen(alice,{if_unchanged_since:first.image_ref});assert.equal(stopped.state,"unavailable");assert.equal(stopped.image,undefined);assert.equal(stopped.image_ref,undefined);
});
test("software: a matching pixel prefix cannot claim unchanged without the full scope and geometry validator",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);const first=await e.service.readScreen(alice,{});
  const cold=new BridgeEngine({db:l.db as unknown as D1Database,bucket:l.bucket as unknown as R2Bucket,now:l.now});
  const ref=String(first.image_ref),forged=ref.slice(0,-1)+(ref.endsWith("0")?"1":"0");
  const bad=await cold.readScreen(alice,{if_unchanged_since:forged});assert.equal(bad.state,"available");assert.equal(bad.image,Buffer.from(r.bytes).toString("base64"));assert.equal(bad.trace?.lookups,2);assert.equal(bad.trace?.cache_fallback,true);assert.notEqual(bad.image_ref,forged);
  const changed={...r.metadata,orientation_epoch:1};l.db.raw.prepare("UPDATE sb_frames SET metadata=?").run(JSON.stringify(changed));
  const geometry=await cold.readScreen(alice,{if_unchanged_since:first.image_ref});assert.equal(geometry.state,"available");assert.equal(geometry.metadata?.orientation_epoch,1);assert.equal(geometry.trace?.lookups,2);assert.notEqual(geometry.image_ref,first.image_ref);
});
test("software: changed pixels keep the single-query conditional full-image path",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);const first=await e.service.readScreen(alice,{});
  const bytes=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,90)},70).data,sha=await hash(bytes);assert.notEqual(sha.slice(0,8),r.metadata.content_sha256.slice(0,8));l.tick(100);
  await e.service.acceptFrame(r.actor,{...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:10100,captured_at:new Date(l.now()).toISOString(),capture_offset_ms:100,content_sha256:sha},bytes);
  const cold=new BridgeEngine({db:l.db as unknown as D1Database,bucket:l.bucket as unknown as R2Bucket,now:l.now});
  const result=await cold.readScreen(alice,{if_unchanged_since:first.image_ref});assert.equal(result.state,"available");assert.equal(result.image,Buffer.from(bytes).toString("base64"));assert.equal(result.trace?.lookups,1);assert.ok(Number(result.trace?.d1_inline_jpeg_chars)>0);
});

test("software: delayed image-reference work cannot return pixels or unchanged evidence beyond the age bound",async()=>{
  for(const mode of ["full","unchanged"]){
    const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);const first=await e.service.readScreen(alice,{});
    if(mode==="unchanged"){const match=e.cache.matchesView.bind(e.cache);e.cache.matchesView=(ref,identity)=>{l.tick(1500);return match(ref,identity);};}
    else {const remember=e.cache.rememberView.bind(e.cache);e.cache.rememberView=identity=>{l.tick(1500);return remember(identity);};}
    const value=await e.service.readScreen(alice,mode==="full"?{}:{if_unchanged_since:first.image_ref},0);
    assert.equal(value.state,"unavailable");assert.equal(value.image,undefined);assert.equal(value.image_ref,undefined);
  }
});
test("software: immediate reader never asks for capture or serves stale, paused, foreign or ambiguous pixels", async () => {
  const l = lab(), r = await running(l), e = edge(l); await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
  assert.equal((await e.service.readScreen(bob, { device_id: r.actor.id })).image, undefined);
  l.tick(3001); assert.equal((await e.service.readScreen(alice, {})).reason, "NO_FRESH_FRAME");
  await assert.rejects(e.service.readScreen(alice, { max_age_ms: 10000 }), /INVALID_NUMBER/);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_refreshes").get()!.n, 0);
  const l2 = lab(), a = await running(l2), b = await running(l2), e2 = edge(l2);
  await e2.service.acceptFrame(a.actor, a.metadata, a.bytes); await e2.service.acceptFrame(b.actor, b.metadata, b.bytes);
  assert.equal((await e2.service.readScreen(alice, {})).state, "choose_device");
  assert.equal((await e2.service.readScreen(alice, { device_id: a.actor.id })).state, "available");
  l2.db.raw.prepare("UPDATE sb_sessions SET capture_state='paused' WHERE id=?").run(a.identity.bridge_session_id);
  assert.equal((await e2.service.readScreen(alice, { device_id: a.actor.id })).image, undefined);
});

test("software: ambiguous, paused and stale snapshots do not even transfer JPEG payloads from the database", async () => {
  for (const state of ["ambiguous", "paused", "stale"]) {
    const l = lab(), r = await running(l), e = edge(l); await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
    if (state === "ambiguous") { const second = await running(l); await e.service.acceptFrame(second.actor, second.metadata, second.bytes); }
    if (state === "paused") l.db.raw.prepare("UPDATE sb_sessions SET capture_state='paused'").run();
    if (state === "stale") l.tick(3001);
    const prepare = l.db.prepare.bind(l.db); let inspected = false;
    l.db.prepare = sql => {
      const statement = prepare(sql);
      if (sql.startsWith("WITH candidates AS")) {
        const bind = statement.bind.bind(statement);
        statement.bind = (...values: unknown[]) => {
          const bound = bind(...values), all = bound.all.bind(bound);
          bound.all = async <T>() => {
            const result = await all<T>(); inspected = true;
            assert.ok(result.results.every(row => !(row as {inline_jpeg: unknown}).inline_jpeg));
            return result;
          };
          return bound;
        };
      }
      return statement;
    };
    const result = await e.service.readScreen(alice, {});
    assert.ok(inspected); assert.equal(result.image, undefined);
    if (state === "stale") { assert.equal(result.trace?.miss, "frame_too_old"); assert.ok(Number(result.trace?.frame_age_ms) > 3000); }
  }
});
test("software: immediate snapshot rejects revoked, foreign, replaced, paused, stopped or expired state", async () => {
  for (const mutation of ["UPDATE sb_devices SET revoked=1", "UPDATE sb_devices SET lease_epoch=lease_epoch+1", "UPDATE sb_frames SET owner_id='site-user-bob'", "UPDATE sb_sessions SET capture_state='paused'", "UPDATE sb_sessions SET state='stopped'", "UPDATE sb_devices SET worker_expires=0", "UPDATE sb_devices SET current_session=NULL"]) {
    const l = lab(), r = await running(l), e = edge(l); await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
    const prepare = l.db.prepare.bind(l.db); let applied = false;
    l.db.prepare = sql => { if (!applied && sql.startsWith("WITH candidates AS")) { applied = true; l.db.raw.prepare(mutation).run(); } return prepare(sql); };
    const result = await e.service.readScreen(alice, {}); assert.notEqual(result.state, "available"); assert.equal(result.image, undefined);
  }
});

test("software: immediate reader takes coherent latest pixels and geometry when a new capture replaces fresh, stale or missing state", async () => {
  for (const initial of ["fresh", "stale", "missing"]) {
    const l = lab(), r = await running(l), e = edge(l);
    if (initial !== "missing") await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
    l.tick(initial === "stale" ? 3001 : 100);
    const bytes = jpeg.encode({ width: 16, height: 32, data: Buffer.alloc(16 * 32 * 4, 70) }, 70).data;
    const offset = initial === "stale" ? 3001 : 100;
    const next = { ...r.metadata, frame_id: uid(), frame_seq: 2, orientation_epoch: 1, capture_mono_ms: 10000 + offset, capture_offset_ms: offset, captured_at: new Date(l.now()).toISOString(), content_sha256: await hash(bytes) };
    const prepare = l.db.prepare.bind(l.db); let routed = false;
    l.db.prepare = sql => {
      const statement = prepare(sql);
      if (sql.startsWith("WITH candidates AS")) {
        const bind = statement.bind.bind(statement);
        statement.bind = (...values: unknown[]) => {
          const bound = bind(...values), all = bound.all.bind(bound);
          bound.all = async <T>() => {
            routed = true;
            await e.service.acceptFrame(r.actor, next, bytes);
            return all<T>();
          };
          return bound;
        };
      }
      return statement;
    };
    const result = await e.service.readScreen(alice, {});
    assert.ok(routed); assert.equal(result.state, "available");
    assert.deepEqual(Buffer.from(result.image!, "base64"), Buffer.from(bytes));
    assert.equal(result.metadata?.frame_id, next.frame_id);
    assert.equal((result.snapshot as Record<string, unknown>).frame_id, next.frame_id);
    assert.equal((result.snapshot as Record<string, unknown>).content_sha256, next.content_sha256);
    assert.equal((result.snapshot as Record<string, unknown>).orientation_epoch, 1);
    assert.ok(Number(result.metadata?.age_ms) <= 3000);
  }
});

test("software: immediate reader rechecks age after the final database response", async () => {
  const l = lab(), r = await running(l), e = edge(l); await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
  const prepare = l.db.prepare.bind(l.db);
  l.db.prepare = sql => {
    const statement = prepare(sql);
    if (sql.startsWith("WITH candidates AS")) {
      const bind = statement.bind.bind(statement);
      statement.bind = (...values: unknown[]) => {
        const bound = bind(...values), all = bound.all.bind(bound);
        bound.all = async <T>() => { const result = await all<T>(); l.tick(3001); return result; };
        return bound;
      };
    }
    return statement;
  };
  const result = await e.service.readScreen(alice, {wait_for_new_ms:0});
  assert.equal(result.reason, "NO_FRESH_FRAME"); assert.equal(result.image, undefined);
});

test("software: one short re-read can consume a background upload without requesting capture or returning stale pixels", async () => {
  const l = lab(), r = await running(l), e = edge(l); await e.service.acceptFrame(r.actor, r.metadata, r.bytes); l.tick(3001);
  const next = { ...r.metadata, frame_id: uid(), frame_seq: 2, capture_mono_ms: 13001, capture_offset_ms: 3001, captured_at: new Date(l.now()).toISOString() };
  const prepare = l.db.prepare.bind(l.db); let reads = 0;
  l.db.prepare = sql => {
    const statement = prepare(sql);
    if (sql.startsWith("WITH candidates AS")) {
      const bind = statement.bind.bind(statement);
      statement.bind = (...values: unknown[]) => {
        const bound = bind(...values), all = bound.all.bind(bound);
        bound.all = async <T>() => { const rows = await all<T>(); if (++reads === 1) await e.service.acceptFrame(r.actor,next,r.bytes); return rows; };
        return bound;
      };
    }
    return statement;
  };
  const result = await e.service.readScreen(alice,{});
  assert.equal(result.state,"available"); assert.equal(result.metadata?.frame_id,next.frame_id);
  assert.ok(Number(result.metadata?.age_ms)<=3000); assert.equal(result.trace?.retry_count,1); assert.equal(reads,2);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_refreshes").get()!.n,0);
});

function afterFirstScreenSnapshot(l:ReturnType<typeof lab>,change:()=>Promise<void>,at=1){
  const prepare=l.db.prepare.bind(l.db);let reads=0;
  l.db.prepare=sql=>{
    const statement=prepare(sql);
    if(sql.startsWith("WITH candidates AS")){
      const bind=statement.bind.bind(statement);
      statement.bind=(...values:unknown[])=>{
        const bound=bind(...values),all=bound.all.bind(bound);
        bound.all=async<T>()=>{const rows=await all<T>();if(++reads===at)await change();return rows;};return bound;
      };
    }
    return statement;
  };
  return ()=>reads;
}

test("software: quiet-source recovery can wait for a newly captured frame beyond five seconds",async()=>{
  for(const wait of [undefined,5000]){
    let clock=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;l.tick(ms);}}),r=await running(l),publisher=edge(l);
    await publisher.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(2000);
    // The physical witness kept its worker heartbeat alive during video quiet.
    l.db.raw.prepare("UPDATE sb_devices SET worker_expires=? WHERE id=?").run(l.now()+60000,r.actor.id);
    let fresh:Record<string,unknown>|undefined;
    afterFirstScreenSnapshot(l,async()=>{},1);
    const prepare=l.db.prepare.bind(l.db);
    l.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith("WITH candidates AS")){
      const bind=statement.bind.bind(statement);statement.bind=(...values:unknown[])=>{const bound=bind(...values),all=bound.all.bind(bound);
        bound.all=async<T>()=>{const rows=await all<T>();if(clock>=6400&&!fresh){
          const probe=await l.service.clockProbe(r.actor);
          fresh={...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:12000+clock,clock_probe_id:probe.clock_probe_id,capture_offset_ms:0,captured_at:new Date(l.now()).toISOString()};
          await publisher.service.acceptFrame(r.actor,fresh,r.bytes);
        }return rows;};return bound;};}return statement;};
    const result=await l.service.readScreen(alice,{...(wait===undefined?{}:{wait_for_new_ms:wait})});
    if(wait===5000){assert.equal(result.image,undefined);assert.equal(result.trace?.termination,"timeout");assert.equal(clock,5000);assert.equal(fresh,undefined);}
    else {assert.equal(result.state,"available");assert.ok(clock>5000&&clock<15000);assert.equal(result.trace?.wait_for_new_ms,15000);
      assert.equal(result.metadata?.frame_id,fresh!.frame_id);assert.equal(result.metadata?.capture_lower_phone_mono_ms,fresh!.capture_mono_ms);
      assert.ok(Number(result.metadata?.age_ms)<1500);assert.deepEqual(Buffer.from(result.image!,"base64"),Buffer.from(r.bytes));}
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_refreshes").get()!.n,0);
  }
});

async function readCadenceFixture(mode:"advancing"|"quiet"|"unverified"|"source_repeat"|"control_change"|"pause"|"revoke",freshAt=4,budget=3000){
  let clock=0,inFlight=0,maximumInFlight=0,count=0;const starts:number[]=[],waits:number[]=[];
  const l=lab(false,{now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;l.tick(ms);}}),r=await running(l),publisher=edge(l);
  await publisher.service.acceptFrame(r.actor,{...r.metadata,source_seq:1},r.bytes);
  const prepare=l.db.prepare.bind(l.db),initialNow=l.now(),frames=Array.from({length:40},()=>uid());
  l.db.prepare=sql=>{assert.ok(/^(SELECT|WITH)\b/.test(sql),"The reader must not write");const statement=prepare(sql);
    if(sql.startsWith("WITH candidates AS")){const bind=statement.bind.bind(statement);statement.bind=(...values:unknown[])=>{
      const bound=bind(...values),all=bound.all.bind(bound);bound.all=async<T>()=>{
        count++;starts.push(clock);inFlight++;maximumInFlight=Math.max(maximumInFlight,inFlight);
        if(count===2&&mode==="pause")l.db.raw.prepare("UPDATE sb_sessions SET capture_state='paused'").run();
        if(count===2&&mode==="revoke")l.db.raw.prepare("UPDATE sb_devices SET revoked=1").run();
        const rows=await all<T>();clock+=80;l.tick(80);
        for(const row of rows.results as Record<string,unknown>[]){if(!row.frame_id)continue;
          const progressing=mode!=="quiet",n=progressing?count:1;
          const lower=count>=freshAt?l.now()-700:progressing?l.now()-1200:initialNow-1200;
          const m=JSON.parse(String(row.metadata));Object.assign(m,{frame_id:frames[n],frame_seq:n,source_seq:mode==="source_repeat"?1:n,
            capture_mono_ms:10000+(progressing?count*80:0),capture_clock_verified:mode!=="unverified",orientation_epoch:0});
          Object.assign(row,{frame_id:frames[n],frame_seq:n,capture_lower:lower,metadata:JSON.stringify(m),inline_jpeg:Buffer.from(r.bytes).toString("base64"),
            ...(mode==="control_change"?{candidate_control_epoch:count}:{})});
        }
        inFlight--;return rows;
      };return bound;};
    }return statement;
  };
  const changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  const result=await l.service.readScreen(alice,{device_id:r.actor.id,wait_for_new_ms:budget});
  return {result,clock,starts,waits,count,maximumInFlight,changesAfter:l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes};
}

test("read cadence integration: progressing stale real frames reduce only early idle waits",async()=>{
  const r=await readCadenceFixture("advancing");
  assert.equal(r.result.state,"available");assert.equal(r.result.metadata?.age_ms,700);
  assert.deepEqual(r.starts,[0,150,300,450]);assert.equal(r.clock,530);
  assert.equal(r.result.trace?.early_advancing_retries,2);
  assert.equal(r.maximumInFlight,1);assert.equal(r.changesAfter,r.changes);assert.equal(r.result.trace?.retry_frame,undefined);
});

test("read cadence integration: quiet, repeated-source, unknown-clock and changed-control samples retain old pacing",async()=>{
  for(const mode of ["quiet","unverified","source_repeat","control_change"] as const){
    const r=await readCadenceFixture(mode,mode==="quiet"?99:4,mode==="quiet"?1000:3000);assert.deepEqual(r.starts,[0,150,450,900],mode);
    assert.equal(r.result.trace?.early_advancing_retries,undefined,mode);assert.equal(r.maximumInFlight,1);assert.equal(r.changesAfter,r.changes);
  }
});

test("read cadence integration: burst ends by2s and the original deadline never renews",async()=>{
  const r=await readCadenceFixture("advancing",99,4000);
  assert.equal(r.result.image,undefined);assert.equal(r.result.trace?.termination,"timeout");assert.ok(r.clock>=4000&&r.clock<=4080);
  assert.ok(r.starts.every(v=>v<4000));assert.ok(r.starts.filter(v=>v<2000).length<=14);
  const late=r.starts.filter(v=>v>=2000);assert.ok(late.length>1);assert.ok(late.slice(1).every((v,i)=>v-late[i]>=500));
  assert.equal(r.maximumInFlight,1);assert.equal(r.changesAfter,r.changes);
});

test("read cadence integration: current authority still terminates before a fast retry",async()=>{
  for(const mode of ["pause","revoke"] as const){const r=await readCadenceFixture(mode);
    assert.equal(r.result.image,undefined);assert.deepEqual(r.starts,[0,150]);assert.equal(r.result.trace?.termination,"terminal");
    assert.equal(r.result.trace?.early_advancing_retries,undefined);assert.equal(r.maximumInFlight,1);
  }
});

test("software: quiet-source recovery default uses one fifteen-second deadline with no database writes",async()=>{
  let clock=0;const waits:number[]=[],l=lab(false,{now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;}});await running(l);
  const reads=afterFirstScreenSnapshot(l,async()=>{}),before=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  const result=await l.service.readScreen(alice,{});
  assert.equal(clock,15000);assert.equal(reads(),32);assert.equal(result.image,undefined);assert.equal(result.trace?.termination,"timeout");
  assert.ok(waits.every(x=>x>0&&x<=500));assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,before);
});

test("software: quiet-source recovery after five seconds still stops on pause,revocation or scope change",async()=>{
  for(const change of ["pause","revoke","lease","session"]){
    let clock=0,changed=false;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;}}),r=await running(l);
    const prepare=l.db.prepare.bind(l.db);l.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith("WITH candidates AS")){
      const bind=statement.bind.bind(statement);statement.bind=(...values:unknown[])=>{const bound=bind(...values),all=bound.all.bind(bound);
        bound.all=async<T>()=>{const rows=await all<T>();if(clock>=6000&&!changed){changed=true;
          if(change==="pause")l.db.raw.prepare("UPDATE sb_sessions SET capture_state='paused' WHERE id=?").run(r.identity.bridge_session_id);
          if(change==="revoke")l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(r.actor.id);
          if(change==="lease")l.db.raw.prepare("UPDATE sb_devices SET lease_epoch=lease_epoch+1 WHERE id=?").run(r.actor.id);
          if(change==="session")l.db.raw.prepare("UPDATE sb_devices SET current_session=NULL WHERE id=?").run(r.actor.id);
        }return rows;};return bound;};}return statement;};
    const result=await l.service.readScreen(alice,{});
    assert.equal(changed,true);assert.ok(clock>=6000&&clock<15000);assert.equal(result.image,undefined);assert.equal(result.trace?.termination,"terminal");
    assert.equal((result.trace?.frame_progress as Record<string,unknown>)?.last_seen_frame_id,undefined);
  }
});

test("software: quiet-source recovery leaves the normal fresh path at one snapshot and no sleep",async()=>{
  let clock=0,sleeps=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;sleeps++;}}),r=await running(l),publisher=edge(l);
  await publisher.service.acceptFrame(r.actor,r.metadata,r.bytes);const before=l.db.requests;
  const result=await l.service.readScreen(alice,{});
  assert.equal(result.state,"available");assert.equal(l.db.requests-before,1);assert.equal(sleeps,0);assert.equal(result.trace?.wait_for_new_ms,15000);
});

test("software: retries can consume the third subsequent snapshot without resetting the timeout",async()=>{
  let clock=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;}}),r=await running(l),e=edge(l);
  const reads=afterFirstScreenSnapshot(l,async()=>{await e.service.acceptFrame(r.actor,r.metadata,r.bytes);},3);
  const result=await l.service.readScreen(alice,{});
  assert.equal(reads(),4);assert.equal(result.state,"available");assert.equal(clock,900);
  assert.equal(result.trace?.retry_count,3);assert.equal(result.trace?.termination,"success");
  assert.equal(result.trace?.wait_for_new_ms,15000);assert.equal(result.trace?.retry_scope,undefined);
  assert.equal(result.metadata?.frame_id,r.metadata.frame_id);assert.ok(Number(result.metadata?.age_ms)<1500);
});

test("software: persistent absence reaches the exact total timeout with increasing waits and no writes",async()=>{
  for(const [timeout,expected] of [[2000,6],[5000,12]]){
    let clock=0;const waits:number[]=[],l=lab(false,{now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;}});await running(l);
    const reads=afterFirstScreenSnapshot(l,async()=>{}),changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
    const result=await l.service.readScreen(alice,{wait_for_new_ms:timeout});
    assert.equal(reads(),expected);assert.equal(clock,timeout);assert.equal(result.trace?.termination,"timeout");
    assert.equal(result.trace?.retry_wait_ms,timeout);assert.equal(result.image,undefined);
    assert.deepEqual(waits.slice(0,4),[150,300,450,500]);assert.ok(waits.every(x=>x>0&&x<=500));
    assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
  }
});

test("software: read pacing counts a slow snapshot toward the next attempt interval",async()=>{
  let clock=0;const waits:number[]=[],l=lab(false,{now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;}}),r=await running(l),publisher=edge(l);
  const reads=afterFirstScreenSnapshot(l,async()=>{clock+=600;await publisher.service.acceptFrame(r.actor,r.metadata,r.bytes);});
  const result=await l.service.readScreen(alice,{wait_for_new_ms:2000});
  assert.equal(result.state,"available");assert.equal(reads(),2);assert.equal(clock,600);
  assert.deepEqual(waits,[]);assert.equal(result.trace?.retry_wait_ms,0);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_refreshes").get()!.n,0);
});

test("software: read pacing sleeps only the unconsumed part of a short interval",async()=>{
  let clock=0;const waits:number[]=[],l=lab(false,{now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;}}),r=await running(l),publisher=edge(l);
  const reads=afterFirstScreenSnapshot(l,async()=>{clock+=80;await publisher.service.acceptFrame(r.actor,r.metadata,r.bytes);});
  const result=await l.service.readScreen(alice,{wait_for_new_ms:2000});
  assert.equal(result.state,"available");assert.equal(reads(),2);assert.equal(clock,150);
  assert.deepEqual(waits,[70]);assert.equal(result.trace?.retry_wait_ms,70);
});

test("software: read pacing rounds fractional waits up to preserve minimum start spacing",async()=>{
  let clock=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;}}),r=await running(l),publisher=edge(l);
  afterFirstScreenSnapshot(l,async()=>{clock+=80.25;await publisher.service.acceptFrame(r.actor,r.metadata,r.bytes);});
  const result=await l.service.readScreen(alice,{wait_for_new_ms:2000});
  assert.equal(result.state,"available");assert.ok(clock>=150&&clock<151);
});

test("software: read pacing can reach a narrow real-image freshness window without relaxing age",async()=>{
  let clock=0;const waits:number[]=[],l=lab(false,{now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;l.tick(ms);}}),r=await running(l),publisher=edge(l);
  const reads=afterFirstScreenSnapshot(l,async()=>{
    clock+=1000;l.tick(1000);const probe=await l.service.clockProbe(r.actor);
    await publisher.service.acceptFrame(r.actor,{...r.metadata,clock_probe_id:probe.clock_probe_id,capture_offset_ms:-300,
      capture_age_ms:350,capture_mono_ms:10700,captured_at:new Date(l.now()-350).toISOString()},r.bytes);
  });
  afterFirstScreenSnapshot(l,async()=>{clock+=600;l.tick(600);},2);
  const result=await l.service.readScreen(alice,{wait_for_new_ms:2000});
  assert.equal(result.state,"available",JSON.stringify({clock,waits,reason:result.reason,trace:result.trace}));assert.equal(reads(),2);assert.equal(clock,1600);
  assert.deepEqual(waits,[]);assert.equal(result.metadata?.age_ms,950);
  assert.deepEqual(Buffer.from(result.image!,"base64"),Buffer.from(r.bytes));
  assert.equal(result.trace?.termination,"success");
});

test("software: read pacing still reauthorizes after a slow snapshot before returning pixels",async()=>{
  let clock=0;const waits:number[]=[],l=lab(false,{now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;}}),r=await running(l);
  const reads=afterFirstScreenSnapshot(l,async()=>{clock+=600;l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(r.actor.id);});
  const result=await l.service.readScreen(alice,{wait_for_new_ms:2000});
  assert.equal(reads(),2);assert.equal(clock,600);assert.deepEqual(waits,[]);
  assert.equal(result.image,undefined);assert.equal(result.trace?.termination,"terminal");
});

test("software: a slow retry consumes the original deadline and cannot start another query",async()=>{
  let clock=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;}});await running(l);
  const reads=afterFirstScreenSnapshot(l,async()=>{clock+=1850;},2);
  const result=await l.service.readScreen(alice,{wait_for_new_ms:2000});
  assert.equal(reads(),2);assert.equal(clock,2000);assert.equal(result.trace?.termination,"timeout");
  assert.equal(result.trace?.retry_count,1);assert.equal(result.image,undefined);
});

test("software: a pause discovered after multiple retries terminates before the timeout",async()=>{
  let clock=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;}}),r=await running(l);
  const reads=afterFirstScreenSnapshot(l,async()=>{l.db.raw.prepare("UPDATE sb_sessions SET capture_state='paused' WHERE id=?").run(r.identity.bridge_session_id);},2);
  const result=await l.service.readScreen(alice,{});
  assert.equal(reads(),3);assert.equal(clock,450);assert.equal(result.state,"paused");
  assert.equal(result.trace?.termination,"terminal");assert.equal(result.image,undefined);
});

test("software: repeated post-command reads still require an actually later capture",async()=>{
  let clock=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;}}),r=await acknowledgedMouse(l);
  await capturedAtPhoneMono(l,r,9999);
  const reads=afterFirstScreenSnapshot(l,async()=>{await capturedAtPhoneMono(l,r,10001,2);},3);
  const result=await l.service.readScreen(alice,{after_command_id:r.command.command_id});
  assert.equal(reads(),4);assert.equal(result.state,"available");assert.equal(result.trace?.retry_count,3);
  assert.equal(result.trace?.retry_trigger,"before_command_receipt");
  assert.equal((result.after_command as Record<string,unknown>).relation,"capture_after_phone_board_ack");
  assert.equal((result.after_command as Record<string,unknown>).app_effect_observed,false);
});

test("software: stale timeout exposes an unchanged observed frame without pixels or new database calls",async()=>{
  let clock=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;}}),r=await running(l),e=edge(l);
  await e.service.acceptFrame(r.actor,{...r.metadata,source_seq:1},r.bytes);l.tick(1600);
  const changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;l.db.requests=0;
  const result=await l.service.readScreen(alice,{wait_for_new_ms:600}),p=result.trace?.frame_progress as Record<string,unknown>;
  assert.equal(result.image,undefined);assert.equal(result.trace?.termination,"timeout");assert.equal(l.db.requests,3);
  assert.equal(p.observation,"same_frame_seen");assert.equal(p.attempts_sampled,3);assert.equal(p.distinct_frames,1);
  assert.equal(p.frame_sequence_advanced,false);assert.equal(p.source_sequence_advanced,false);
  assert.equal(p.last_seen_frame_id,r.metadata.frame_id);assert.equal(p.last_seen_frame_seq,1);assert.equal(p.last_seen_source_seq,1);
  assert.equal(p.last_seen_age_ms,1650);assert.equal(p.last_attempt_has_frame,true);
  assert.ok(Number(p.max_snapshot_ms)>=0);assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
});

test("software: frames can advance during timeout without any fresh pixels being released",async()=>{
  let clock=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;}}),r=await running(l),e=edge(l);
  await e.service.acceptFrame(r.actor,{...r.metadata,source_seq:1},r.bytes);l.tick(2000);
  const id=uid(),lower=l.now()-1600,reads=afterFirstScreenSnapshot(l,async()=>{
    l.db.raw.prepare("UPDATE sb_frames SET frame_id=?,frame_seq=2,capture_lower=?,metadata=? WHERE device_id=?")
      .run(id,lower,JSON.stringify({...r.metadata,frame_id:id,frame_seq:2,source_seq:2}),r.actor.id);
  });
  const result=await l.service.readScreen(alice,{wait_for_new_ms:600}),p=result.trace?.frame_progress as Record<string,unknown>;
  assert.equal(reads(),3);assert.equal(result.image,undefined);assert.equal(result.trace?.termination,"timeout");
  assert.equal(p.observation,"frame_changed");assert.equal(p.distinct_frames,2);
  assert.equal(p.frame_sequence_advanced,true);assert.equal(p.source_sequence_advanced,true);
  assert.equal(p.last_seen_frame_id,id);assert.equal(p.last_seen_frame_seq,2);assert.equal(p.last_seen_source_seq,2);
  assert.equal(p.last_seen_capture_lower_server_utc_ms,lower);assert.equal(p.last_seen_age_ms,1600);
});

test("software: one known source sequence cannot prove a source stayed unchanged",async()=>{
  let clock=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;}}),r=await running(l),e=edge(l);
  await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(1600);
  afterFirstScreenSnapshot(l,async()=>{
    l.db.raw.prepare("UPDATE sb_frames SET metadata=? WHERE device_id=?").run(JSON.stringify({...r.metadata,source_seq:2}),r.actor.id);
  },2);
  const result=await l.service.readScreen(alice,{wait_for_new_ms:600}),p=result.trace?.frame_progress as Record<string,unknown>;
  assert.equal(p.source_sequence_advanced,null);assert.equal(p.last_seen_source_seq,2);
  assert.equal(p.frame_sequence_advanced,false);assert.equal(result.image,undefined);
});

test("software: terminal revocation redacts frame progress collected from earlier authorized attempts",async()=>{
  let clock=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;}}),r=await running(l),e=edge(l);
  await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(2600);
  const reads=afterFirstScreenSnapshot(l,async()=>{l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(r.actor.id);});
  const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen",arguments:{device_id:r.actor.id}}})}),{engine:()=>l.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
  const result=(await response.json() as RpcReply).result,recovery=result.structuredContent.recovery as Record<string,unknown>;
  assert.equal(reads(),2);assert.equal(recovery.termination,"terminal");
  assert.equal((recovery.frame_progress as Record<string,unknown>).observation,"terminal");
  assert.equal(JSON.stringify(recovery).includes(r.metadata.frame_id),false);
  assert.equal(JSON.stringify(recovery).includes(r.actor.id),false);assert.equal(result.content.filter(x=>x.type==="image").length,0);
});

test("software: a normal fresh screen keeps the progress projection out of the hot response",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  l.db.requests=0;const value=await l.service.readScreen(alice,{});
  assert.equal(value.state,"available");assert.equal(l.db.requests,1);assert.equal(value.trace?.frame_progress,undefined);
});

test("software: active missing-frame reader consumes the next upload without a capture request",async()=>{
  const l=lab(),r=await running(l),e=edge(l);
  const reads=afterFirstScreenSnapshot(l,async()=>{await e.service.acceptFrame(r.actor,r.metadata,r.bytes);});
  const result=await e.service.readScreen(alice,{});
  assert.equal(reads(),2);assert.equal(result.state,"available");assert.equal(result.metadata?.frame_id,r.metadata.frame_id);
  assert.ok(Number(result.metadata?.age_ms)<1500);assert.deepEqual(Buffer.from(result.image!,"base64"),Buffer.from(r.bytes));
  assert.equal(result.trace?.retry_trigger,"no_frame");assert.equal(result.trace?.retry_count,1);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_refreshes").get()!.n,0);
});

test("software: missing-frame waits retry until the shared timeout and remain optional and read-only",async()=>{
  for(const wait of [0,600]){
    let clock=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;}});await running(l);const reads=afterFirstScreenSnapshot(l,async()=>{});
    const changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
    l.bucket.get=async()=>{throw Error("Reader cannot wait on R2");};
    const result=await l.service.readScreen(alice,{wait_for_new_ms:wait});
    assert.equal(result.state,"unavailable");assert.equal(result.reason,"NO_FRESH_FRAME");assert.equal(result.image,undefined);
    assert.equal(reads(),wait===0?1:3);assert.equal(result.trace?.retry_count,wait===0?0:2);
    assert.equal(clock,wait);assert.equal(result.trace?.termination,wait===0?"no_wait":"timeout");
    assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
  }
  for(const wait of [-1,15001,"150"]){const l=lab();await assert.rejects(l.service.readScreen(alice,{wait_for_new_ms:wait}),/INVALID_NUMBER/);}
});

test("software: missing-frame retry rechecks stop, pause, owner, lease and session and cannot switch phones",async()=>{
  for(const fault of ["pause","stop","revoke","owner","lease","session","other_device"]){
    const l=lab(),r=await running(l),e=edge(l);
    const reads=afterFirstScreenSnapshot(l,async()=>{
      if(fault==="pause")l.db.raw.prepare("UPDATE sb_sessions SET capture_state='paused' WHERE id=?").run(r.identity.bridge_session_id);
      if(fault==="stop"||fault==="other_device")await l.service.stop(r.actor,r.identity.bridge_session_id,true);
      if(fault==="revoke")l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(r.actor.id);
      if(fault==="owner")l.db.raw.prepare("UPDATE sb_devices SET owner_id=? WHERE id=?").run(bob.id,r.actor.id);
      if(fault==="lease"){
        await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
        l.db.raw.prepare("UPDATE sb_devices SET lease_epoch=lease_epoch+1 WHERE id=?").run(r.actor.id);
        l.db.raw.prepare("UPDATE sb_frames SET lease_epoch=lease_epoch+1 WHERE device_id=?").run(r.actor.id);
      }
      if(fault==="session"){
        const broadcast=uid(),session=await l.service.createSession(r.actor,{mode:"broadcast",broadcast_id:broadcast,request_id:uid(),control_enabled:false}),worker=uid();
        const claim=await l.service.claimWorker(r.actor,{bridge_session_id:session.bridge_session_id,broadcast_id:broadcast,worker_id:worker,worker_kind:"broadcast"});
        await e.service.acceptFrame(r.actor,{...r.metadata,bridge_session_id:session.bridge_session_id,broadcast_id:broadcast,worker_id:worker,lease_epoch:claim.lease_epoch},r.bytes);
      }
      if(fault==="other_device"){const other=await running(l);await e.service.acceptFrame(other.actor,other.metadata,other.bytes);}
    });
    const result=await e.service.readScreen(alice,{});
    assert.equal(reads(),2,fault);assert.equal(result.image,undefined,fault);
    assert.equal(result.state,fault==="pause"?"paused":"unavailable",fault);
    if(fault==="lease"||fault==="session")assert.equal(result.reason,"FRAME_OR_SESSION_CHANGED",fault);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_refreshes").get()!.n,0);
  }
});

test("software: re-read does not release a newly arrived image that is already1500ms old",async()=>{
  const l=lab(),r=await running(l),e=edge(l);
  const reads=afterFirstScreenSnapshot(l,async()=>{await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(1450);});
  const result=await e.service.readScreen(alice,{wait_for_new_ms:200});
  assert.equal(reads(),2);assert.equal(result.image,undefined);assert.equal(result.reason,"NO_FRESH_FRAME");
  assert.equal(result.trace?.frame_age_ms,1500);assert.equal(result.trace?.retry_count,1);
});

test("software: slow first snapshot exhausts the soft retry budget instead of polling again",async()=>{
  const l=lab();await running(l);
  const reads=afterFirstScreenSnapshot(l,async()=>{await new Promise(resolve=>setTimeout(resolve,650));});
  const result=await l.service.readScreen(alice,{wait_for_new_ms:600});
  assert.equal(reads(),1);assert.equal(result.trace?.retry_budget_exhausted,true);assert.equal(result.trace?.retry_count,0);
  assert.equal(result.reason,"NO_FRESH_FRAME");
});

test("software: native screen result carries bounded recovery evidence even when result meta is omitted",async()=>{
  let clock=0;const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;}}),r=await running(l),reads=afterFirstScreenSnapshot(l,async()=>{});
  const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen",arguments:{device_id:r.actor.id}}})}),{engine:()=>l.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
  const result=(await response.json() as RpcReply).result,recovery=result.structuredContent.recovery as Record<string,unknown>;
  assert.equal(result.isError,false);assert.equal(reads(),32);assert.equal(recovery.lookups,32);assert.equal(recovery.retry_count,31);
  assert.equal(recovery.timeout_ms,15000);
  assert.equal(recovery.retry_trigger,"no_frame");assert.equal(recovery.failure,"no_frame");assert.equal(recovery.budget_exhausted,true);
  assert.equal((recovery.frame_progress as Record<string,unknown>).observation,"no_frame_seen");
  assert.equal((recovery.frame_progress as Record<string,unknown>).distinct_frames,0);
  assert.equal(result.content.filter(x=>x.type==="image").length,0);assert.ok(!JSON.stringify(recovery).includes(alice.id));
});

test("software: stale re-read honours its total timeout and a concurrent pause", async () => {
  for(const pause of [false,true]) {
    const l=lab(),r=await running(l),e=edge(l); await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.tick(3001);
    const before=l.db.raw.prepare("SELECT total_changes() AS n").get()!.n;
    const prepare=l.db.prepare.bind(l.db);let reads=0;
    l.db.prepare=sql=>{
      const statement=prepare(sql);
      if(sql.startsWith("WITH candidates AS")) {
        const bind=statement.bind.bind(statement);
        statement.bind=(...values:unknown[])=>{
          const bound=bind(...values),all=bound.all.bind(bound);
          bound.all=async<T>()=>{const rows=await all<T>();if(++reads===1&&pause)l.db.raw.prepare("UPDATE sb_sessions SET capture_state='paused'").run();return rows;};return bound;
        };
      }
      return statement;
    };
    const result=await e.service.readScreen(alice,{wait_for_new_ms:200});
    assert.equal(reads,2);assert.equal(result.image,undefined);assert.equal(result.trace?.retry_count,1);
    assert.equal(result.state,pause?"paused":"unavailable");
    if(!pause)assert.equal(l.db.raw.prepare("SELECT total_changes() AS n").get()!.n,before);
  }
});

test("software: immediate reader also rejects a worker lease that expires during the final response", async () => {
  const l = lab(), r = await running(l), e = edge(l); await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
  l.db.raw.prepare("UPDATE sb_devices SET worker_expires=?").run(l.now() + 100);
  const prepare = l.db.prepare.bind(l.db);
  l.db.prepare = sql => {
    const statement = prepare(sql);
    if (sql.startsWith("WITH candidates AS")) {
      const bind = statement.bind.bind(statement);
      statement.bind = (...values: unknown[]) => {
        const bound = bind(...values), all = bound.all.bind(bound);
        bound.all = async <T>() => { const result = await all<T>(); l.tick(101); return result; };
        return bound;
      };
    }
    return statement;
  };
  const result = await e.service.readScreen(alice, {});
  assert.equal(result.reason, "FRAME_OR_SESSION_CHANGED"); assert.equal(result.image, undefined);
});
test("software: consolidated upload validation still rejects replay, invalid probes and stale leases", async () => {
  const l = lab(), r = await running(l), e = edge(l);
  await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
  await assert.rejects(e.service.acceptFrame(r.actor, r.metadata, r.bytes), /FRAME_ID_REUSED/);
  await assert.rejects(e.service.acceptFrame(r.actor, { ...r.metadata, frame_id: uid(), frame_seq: 2, clock_probe_id: uid() }, r.bytes), /INVALID_CLOCK_PROBE/);
  await assert.rejects(e.service.acceptFrame(r.actor, { ...r.metadata, frame_id: uid(), frame_seq: 2, worker_id: uid() }, r.bytes), /STALE_LEASE/);
});
test("software: paused broadcast is reported directly without hiding a separate active phone", async () => {
  const l = lab(), r = await running(l), e = edge(l); await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
  l.db.raw.prepare("UPDATE sb_sessions SET capture_state='paused' WHERE id=?").run(r.identity.bridge_session_id);
  const paused = await e.service.readScreen(alice, {});
  assert.equal(paused.state, "paused"); assert.equal(paused.reason, "CAPTURE_PAUSED"); assert.equal(paused.image, undefined);
  assert.equal(paused.worker_online,true);
  l.tick(11_000);
  const offline = await e.service.readScreen(alice,{});
  assert.equal(offline.state,"paused"); assert.equal(offline.worker_online,false); assert.equal(offline.image,undefined);
  const second = await running(l); await e.service.acceptFrame(second.actor, second.metadata, second.bytes);
  const active = await e.service.readScreen(alice, {});
  assert.equal(active.state, "available"); assert.equal(active.metadata?.frame_id, second.metadata.frame_id);
});
test("software: empty refresh polling backs off within its monotonic budget and still claims new requests", async () => {
  const l = lab(), r = await running(l); await l.service.acceptFrame(r.actor, r.metadata, r.bytes);
  const prepare = l.db.prepare.bind(l.db); let polls = 0;
  l.db.prepare = sql => { if(sql.startsWith("UPDATE sb_refreshes SET state='claimed'")) polls++; return prepare(sql); };
  const start = performance.now();
  assert.equal(await l.service.claimRefresh(r.actor, r.identity, 900), null);
  assert.ok(polls <= 5, `empty polling issued ${polls} updates`); assert.ok(performance.now()-start < 2500);
  const queued = new Promise<unknown>((resolve,reject)=>setTimeout(()=>{l.service.getScreen(alice,{device_id:r.actor.id,bridge_session_id:r.identity.bridge_session_id,force_fresh:true,wait_ms:0}).then(value=>resolve(value.refresh_request_id),reject);},250));
  const claim = l.service.claimRefresh(r.actor,r.identity,2000);
  const [id,won] = await Promise.all([queued,claim]); assert.equal(won?.refresh_request_id,id);
});
test("software: screen-only heartbeat clears old diagnostic USB readiness", async () => {
  const l = lab(), r = await ledReady(l), broadcast = uid();
  assert.equal((await l.service.status(r.actor)).usb_connected,true);
  const session = await l.service.createSession(r.actor,{mode:"broadcast",broadcast_id:broadcast,request_id:uid(),control_enabled:false});
  const worker=uid(), lease=await l.service.claimWorker(r.actor,{bridge_session_id:session.bridge_session_id,broadcast_id:broadcast,worker_id:worker,worker_kind:"broadcast"});
  await l.service.heartbeat(r.actor,{bridge_session_id:session.bridge_session_id,broadcast_id:broadcast,worker_id:worker,lease_epoch:lease.lease_epoch,capture_state:"active",usb_connected:false,board_boot_id:null});
  const status=await l.service.status(r.actor); assert.equal(status.online,true); assert.equal(status.usb_connected,false); assert.equal(status.session?.control_enabled,false);
});
test("software: only the current capture worker can recover an expired lease after a system pause", async () => {
  const l=lab(), r=await running(l), e=edge(l); await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  await l.service.heartbeat(r.actor,{...r.identity,capture_state:"paused",usb_connected:false}); l.tick(11_000);
  const recovered=await l.service.heartbeat(r.actor,{...r.identity,capture_state:"active",usb_connected:false});
  assert.equal(recovered.directive,"all_release"); assert.equal(recovered.grant_remaining_ms,0);
  assert.equal((await e.service.readScreen(alice,{})).reason,"NO_FRESH_FRAME");
  await assert.rejects(e.service.acceptFrame(r.actor,{...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:10001},r.bytes),/OLD_CAPTURE/);
  const probe=await l.service.clockProbe(r.actor);
  await e.service.acceptFrame(r.actor,{...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:21000,captured_at:new Date(l.now()).toISOString(),clock_probe_id:probe.clock_probe_id,capture_offset_ms:0},r.bytes);
  assert.equal((await e.service.readScreen(alice,{})).state,"available");
  l.tick(11_000); const nextWorker=uid();
  await l.service.claimWorker(r.actor,{...r.identity,worker_id:nextWorker,worker_kind:"broadcast"});
  await assert.rejects(l.service.heartbeat(r.actor,{...r.identity,capture_state:"paused"}),/STALE_LEASE/);
  const row=l.db.raw.prepare("SELECT capture_state FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id);
  assert.equal(row?.capture_state,"active");
  await l.service.stop(r.actor,r.identity.bridge_session_id,true);
  await assert.rejects(l.service.heartbeat(r.actor,{...r.identity,capture_state:"active"}),/STALE_SESSION/);
  const other=await running(l); await l.service.revoke(alice,other.actor.id);
  await assert.rejects(l.service.heartbeat(other.actor,{...other.identity,capture_state:"active"}),/STALE_SESSION/);
});
test("software: expired foreground LED permission is never restored by a heartbeat", async () => {
  const l=lab(), r=await ledReady(l); l.tick(11_000);
  await assert.rejects(r.led.heartbeat(r.actor,{...r.identity,capture_state:"stopped",usb_connected:true,board_boot_id:r.hardware.board_boot_id}),/STALE_LEASE/);
});
test("software: unchanged observations keep pixels intact with one database request and no image transfer", async () => {
  const l=lab(), r=await running(l), e=edge(l); await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  e.cache.clear(r.actor.id); l.tick(1000);
  const original=l.db.raw.prepare("SELECT inline_jpeg,image_key,storage_ready FROM sb_frames WHERE device_id=?").get(r.actor.id)!;
  const batch=l.db.batch.bind(l.db); let wireBytes=0;
  l.db.batch=async statements=>{
    for(const statement of statements)assert.ok(!statement.values.includes(original.inline_jpeg));
    const result=await batch(statements); const wire=JSON.stringify(result); wireBytes=wire.length;
    assert.ok(!wire.includes(String(original.inline_jpeg))); return result;
  };
  l.bucket.head=async()=>{throw new Error("metadata path must not read R2");};
  const next={...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:11000,capture_offset_ms:1000,captured_at:new Date(l.now()).toISOString()};
  const before=l.db.requests, accepted=await e.service.acceptFrame(r.actor,next);
  assert.equal(l.db.requests-before,1); assert.equal(accepted.accepted_frame_id,next.frame_id); assert.ok(wireBytes<2048);
  const stored=l.db.raw.prepare("SELECT inline_jpeg,image_key,storage_ready FROM sb_frames WHERE device_id=?").get(r.actor.id)!;
  assert.deepEqual(stored,original);
  const current=await e.service.readScreen(alice,{}); assert.equal(current.state,"available"); assert.equal(current.metadata?.frame_id,next.frame_id);
  assert.deepEqual(Buffer.from(current.image!,"base64"),Buffer.from(r.bytes));
  await assert.rejects(e.service.acceptFrame(r.actor,next),/FRAME_ID_REUSED/);
});
test("software: a metadata fast-path miss preserves the same-id full-image fallback", async () => {
  const l=lab(), r=await running(l), e=edge(l); await e.service.acceptFrame(r.actor,r.metadata,r.bytes); l.tick(1000);
  l.db.raw.prepare("DELETE FROM sb_frames WHERE device_id=?").run(r.actor.id); e.cache.clear(r.actor.id);
  const next={...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:11000,capture_offset_ms:1000,captured_at:new Date(l.now()).toISOString()};
  await assert.rejects(e.service.acceptFrame(r.actor,next),/NEED_IMAGE/);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations WHERE frame_id=?").get(next.frame_id)!.n,0);
  await e.service.acceptFrame(r.actor,next,r.bytes);
  assert.equal((await e.service.readScreen(alice,{})).state,"available");
  l.tick(31_000);
  await l.service.heartbeat(r.actor,{...r.identity,capture_state:"active"});
  l.db.raw.prepare("DELETE FROM sb_observations WHERE frame_id=?").run(next.frame_id);
  const expired={...next,frame_seq:3,capture_mono_ms:42000,capture_offset_ms:32000,captured_at:new Date(l.now()).toISOString()};
  await assert.rejects(e.service.acceptFrame(r.actor,expired),/NEED_IMAGE/);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations WHERE frame_id=?").get(expired.frame_id)!.n,0);
  await e.service.acceptFrame(r.actor,expired,r.bytes);
  assert.equal((await e.service.readScreen(alice,{})).state,"available");
});
test("software: atomic observations cannot refresh stale, paused, superseded or revoked captures", async () => {
  for(const action of ["old_capture","paused","expired","takeover","stopped","revoked","bad_probe"]){
    const l=lab(), r=await running(l), e=edge(l); await e.service.acceptFrame(r.actor,r.metadata,r.bytes); l.tick(1000);
    const next={...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:11000,capture_offset_ms:1000,captured_at:new Date(l.now()).toISOString()};
    let error=/STALE_SESSION/;
    if(action==="old_capture"){l.tick(3100);error=/OLD_CAPTURE/;}
    if(action==="paused"){await l.service.heartbeat(r.actor,{...r.identity,capture_state:"paused"});error=/CAPTURE_PAUSED/;}
    if(action==="expired"){l.tick(11_000);error=/STALE_LEASE/;}
    if(action==="takeover"){l.tick(11_000);await l.service.claimWorker(r.actor,{...r.identity,worker_id:uid(),worker_kind:"broadcast"});error=/STALE_LEASE/;}
    if(action==="stopped")await l.service.stop(r.actor,r.identity.bridge_session_id,true);
    if(action==="revoked")await l.service.revoke(alice,r.actor.id);
    if(action==="bad_probe"){next.clock_probe_id=uid();error=/INVALID_CLOCK_PROBE/;}
    await assert.rejects(e.service.acceptFrame(r.actor,next),error);
    assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations WHERE frame_id=?").get(next.frame_id)!.n,0);
  }
});
test("software: atomic observation retains dimension, hash and conservative clock rules", async () => {
  for(const action of ["dimensions","hash","future_clock","uncertain_clock"]){
    const l=lab(), r=await running(l), e=edge(l); await e.service.acceptFrame(r.actor,r.metadata,r.bytes); l.tick(900);
    const next={...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:10900,capture_offset_ms:900,captured_at:new Date(l.now()).toISOString()};
    if(action==="dimensions"){next.width++;next.content_rect={...next.content_rect,width:next.width};await assert.rejects(e.service.acceptFrame(r.actor,next),/DIMENSION_MISMATCH/);}
    if(action==="hash"){next.content_sha256="0".repeat(64);await assert.rejects(e.service.acceptFrame(r.actor,next),/NEED_IMAGE/);}
    if(action==="future_clock"){next.capture_offset_ms=10_000;await assert.rejects(e.service.acceptFrame(r.actor,next),/CLOCK_UNCERTAIN/);}
    if(action==="uncertain_clock"){next.clock_rtt_ms=3000;await assert.rejects(e.service.acceptFrame(r.actor,next),/CLOCK_UNCERTAIN/);assert.equal((await e.service.readScreen(alice,{},0)).metadata?.frame_id,r.metadata.frame_id);}
    assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_observations WHERE frame_id=?").get(next.frame_id)!.n,0);
  }
});
test("software: voice stopwatch is owner-scoped and preserves first-answer vs complete-answer timing", async () => {
  const l = lab(), r = await running(l), run = uid();
  await voiceBenchmark(l.service, alice, { action: "start", run_id: run, scenario: "current_screen" });
  await assert.rejects(voiceBenchmark(l.service, bob, { action: "finish", run_id: run, first_response_ms: 500, total_ms: 1000 }), /RUN_NOT_FOUND/);
  await assert.rejects(voiceBenchmark(l.service, alice, { action: "finish", run_id: run, first_response_ms: 2000, total_ms: 1000 }), /INVALID_NUMBER/);
  const done = await voiceBenchmark(l.service, alice, { action: "finish", run_id: run, first_response_ms: 1200, total_ms: 2500 });
  assert.equal(done.source, "manual_voice_stopwatch"); assert.equal(done.total_ms, 2500);
  assert.equal((await voiceRuns(l.service, alice, r.actor.id)).runs.length, 1);
  await assert.rejects(voiceRuns(l.service, bob, r.actor.id), /NOT_FOUND/);
  await assert.rejects(voiceBenchmark(l.service, alice, { action: "finish", run_id: run, total_ms: 2500 }), /RUN_NOT_FOUND/);
});

test("software: stream view accepts a recent snapshot when another same-orientation frame arrives during read", async () => {
  const l = lab(), r = await running(l); await l.service.acceptFrame(r.actor, r.metadata, r.bytes);
  const get = l.bucket.get.bind(l.bucket);
  l.bucket.get = async key => {
    const value = await get(key); l.tick(100);
    await l.service.acceptFrame(r.actor, { ...r.metadata, frame_id: uid(), frame_seq: 2, capture_mono_ms: 10100, capture_offset_ms: 100 }, r.bytes);
    return value;
  };
  const result = await l.service.viewScreen(alice, { wait_ms: 0 });
  assert.equal(result.state, "available"); assert.equal(result.metadata?.frame_id, r.metadata.frame_id);
  assert.ok(Number(result.metadata?.age_ms) <= 3000);
});

test("software: stream view still rejects orientation or worker-epoch changes during image read", async () => {
  for (const changed of ["orientation", "lease"]) {
    const l = lab(), r = await running(l); await l.service.acceptFrame(r.actor, r.metadata, r.bytes);
    const get = l.bucket.get.bind(l.bucket);
    l.bucket.get = async key => {
      const value = await get(key);
      if (changed === "orientation") l.db.raw.prepare("UPDATE sb_frames SET metadata=json_set(metadata,'$.orientation_epoch',1)").run();
      else l.db.raw.prepare("UPDATE sb_devices SET lease_epoch=lease_epoch+1").run();
      return value;
    };
    assert.equal((await l.service.viewScreen(alice, { wait_ms: 0 })).state, "unavailable");
  }
});

test("software: legacy strict read does not silently accept a different latest frame", async () => {
  const l = lab(), r = await running(l); await l.service.acceptFrame(r.actor, r.metadata, r.bytes);
  const get = l.bucket.get.bind(l.bucket);
  l.bucket.get = async key => {
    const value = await get(key); l.tick(100);
    await l.service.acceptFrame(r.actor, { ...r.metadata, frame_id: uid(), frame_seq: 2, capture_mono_ms: 10100, capture_offset_ms: 100 }, r.bytes);
    return value;
  };
  assert.equal((await l.service.getScreen(alice, { device_id: r.actor.id, bridge_session_id: r.identity.bridge_session_id, wait_ms: 0 })).state, "unavailable");
});

test("software: view_screen serves a recent inline snapshot with one query and no final SQL fence", async () => {
  const l = lab(), r = await running(l), e = edge(l); await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
  l.tick(900); // The conservative capture bound adds 50ms: 950ms old.
  const before = l.db.requests;
  l.bucket.get = async () => { throw new Error("fresh inline view must not read R2"); };
  const result = await e.service.viewScreen(alice, { wait_ms: 0 });
  assert.equal(result.state, "available"); assert.equal(result.metadata?.age_ms, 950);
  assert.equal(result.metadata?.device_id, r.actor.id); assert.equal(result.metadata?.bridge_session_id, r.identity.bridge_session_id);
  assert.deepEqual(Buffer.from(result.image!, "base64"), Buffer.from(r.bytes));
  assert.equal(l.db.requests - before, 1); assert.equal(result.trace?.path, "atomic_snapshot");
  assert.equal(result.trace?.fence_ms, 0); assert.equal(result.trace?.cache_hit, true);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_refreshes").get()!.n, 0);
});

test("software: capture read logs cached-image expiry separately from a session fence rejection", async () => {
  for (const condition of ["age", "lease"]) {
    const l = lab(), r = await running(l), e = edge(l); await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
    if (condition === "age") l.tick(1900);
    const prepare = l.db.prepare.bind(l.db);
    l.db.prepare = sql => {
      if (sql.startsWith("SELECT f.frame_id FROM sb_frames")) {
        if (condition === "age") l.tick(150);
        else l.db.raw.exec("UPDATE sb_devices SET lease_epoch=lease_epoch+1");
      }
      return prepare(sql);
    };
    const messages: string[] = [], original = console.info;
    console.info = message => { messages.push(String(message)); };
    try {
      const result = await e.service.getScreen(alice, { device_id: r.actor.id, bridge_session_id: r.identity.bridge_session_id, wait_ms: 0, max_age_ms:3000 });
      assert.equal(result.state, "unavailable"); assert.equal(result.image, undefined);
      assert.equal(result.reason, condition === "age" ? "FRAME_TOO_OLD" : "FRAME_OR_SESSION_CHANGED");
      assert.equal(result.trace?.selected_age_ms, condition === "age" ? 1950 : 50);
      assert.equal(result.trace?.final_age_ms, condition === "age" ? 2100 : 50);
      assert.equal(result.trace?.fence_passed, condition === "age");
      const logged = messages.map(message => JSON.parse(message)).find(value => value.event === "screen_capture_read");
      assert.equal(logged.reason, result.reason); assert.equal(logged.frame_id, r.metadata.frame_id);
      assert.equal(logged.request_id, result.trace?.request_id); assert.equal(logged.cache_hit, true);
      assert.equal(logged.image, undefined); assert.equal(logged.final_age_ms, result.trace?.final_age_ms);
    } finally { console.info = original; }
  }
});

test("software: atomic view validates capture arguments and keeps forced capture on its existing path", async () => {
  const l = lab(), r = await running(l), e = edge(l); await e.service.acceptFrame(r.actor, r.metadata, r.bytes);
  await assert.rejects(e.service.viewScreen(alice, { force_fresh: "true" }), /INVALID_ARGUMENTS/);
  await assert.rejects(e.service.viewScreen(alice, { wait_ms: -1 }), /INVALID_NUMBER/);
  const result = await e.service.viewScreen(alice, { force_fresh: true, wait_ms: 0 });
  assert.equal(result.state, "pending"); assert.equal(result.trace?.path, "capture_refresh");
  assert.ok(result.refresh_request_id); assert.equal(result.image, undefined);
});

async function textCapture(l: ReturnType<typeof lab>, r: Awaited<ReturnType<typeof running>>) {
  const block = { id: "t1", text: "搜索 Search", confidence: .12, bounds: { x: 80, y: 120, width: 200, height: 45 },
    candidates: [{ text: "搜索 Search", confidence: .12 }, { text: "搜素 Search", confidence: .09 }] };
  const ocr = { schema: "screen_text.v1", engine: "apple_vision", recognition_level: "accurate", coordinate_space: "pixels_top_left", actionability: "not_inferred",
    image_width: 886, image_height: 1918, recognition_revision: 3, recognition_languages: ["zh-Hans", "en"], full_text: block.text, blocks: [block],
    barcodes: [{ symbology: "QR", payload: "https://example.invalid/", confidence: .9, bounds: { x: 0, y: 0, width: 60, height: 60 } }],
    recognition_ms: 123, truncated: false, omitted_blocks: 0, omitted_candidates: 0, warnings: [] };
  const metadata = { ...r.metadata, width: 886, height: 1918, native_width_px: 886, native_height_px: 1918,
    content_rect: { x: 0, y: 0, width: 886, height: 1918 }, content_sha256: await hash(ocr.full_text), client_timing: { ocr_ms: 123 } };
  return { metadata, ocr };
}

test("software: latest-only cleanup suppresses obsolete jobs even when callbacks fire out of order",async()=>{
  const scope={},jobs:(()=>Promise<void>)[]=[],calls:string[]=[];
  const schedule=(job:()=>Promise<void>)=>{jobs.push(job);return true;};
  assert.equal(scheduleLatestExpiryCleanup(scope,"phone",schedule,async()=>{calls.push("old");}),false);
  assert.equal(scheduleLatestExpiryCleanup(scope,"phone",schedule,async()=>{calls.push("middle");}),true);
  assert.equal(scheduleLatestExpiryCleanup(scope,"phone",schedule,async()=>{calls.push("latest");}),true);
  await jobs[2]();await jobs[0]();await jobs[1]();assert.deepEqual(calls,["latest"]);
});

test("software: an already-running cleanup cannot erase its successor scheduling hint",async()=>{
  const scope={},jobs:(()=>Promise<void>)[]=[],calls:string[]=[];let release!:()=>void;
  const hold=new Promise<void>(resolve=>{release=resolve;}),schedule=(job:()=>Promise<void>)=>{jobs.push(job);return true;};
  scheduleLatestExpiryCleanup(scope,"phone",schedule,async()=>{calls.push("old-running");await hold;});
  const first=jobs[0]();await Promise.resolve();
  assert.equal(scheduleLatestExpiryCleanup(scope,"phone",schedule,async()=>{calls.push("new-superseded");}),false);
  release();await first;
  assert.equal(scheduleLatestExpiryCleanup(scope,"phone",schedule,async()=>{calls.push("new-final");}),true);
  await jobs[1]();await jobs[2]();assert.deepEqual(calls,["old-running","new-final"]);
});

test("software: latest cleanup hints never cross database bindings or device keys",async()=>{
  const db1={},db2={},jobs:(()=>Promise<void>)[]=[],calls:string[]=[];
  const schedule=(job:()=>Promise<void>)=>{jobs.push(job);return true;};
  scheduleLatestExpiryCleanup(db1,"phone",schedule,async()=>{calls.push("db1");});
  scheduleLatestExpiryCleanup(db2,"phone",schedule,async()=>{calls.push("db2");});
  scheduleLatestExpiryCleanup(db1,"other",schedule,async()=>{calls.push("other");});
  for(const job of jobs)await job();assert.deepEqual(calls,["db1","db2","other"]);
});

test("software: unavailable background scheduling does not suppress existing cleanup",async()=>{
  const scope={},jobs:(()=>Promise<void>)[]=[],calls:string[]=[];
  scheduleLatestExpiryCleanup(scope,"phone",job=>{jobs.push(job);return true;},async()=>{calls.push("scheduled");});
  assert.equal(scheduleLatestExpiryCleanup(scope,"phone",()=>false,async()=>{calls.push("not-scheduled");}),false);
  await jobs[0]();assert.deepEqual(calls,["scheduled"]);
});

test("software: cleanup tracker eviction preserves final tasks for every device",async()=>{
  const scope={},jobs:(()=>Promise<void>)[]=[],calls:number[]=[];
  for(let i=0;i<257;i++)scheduleLatestExpiryCleanup(scope,String(i),job=>{jobs.push(job);return true;},async()=>{calls.push(i);});
  for(const job of jobs)await job();assert.equal(calls.length,257);assert.equal(new Set(calls).size,257);
});

test("software: scheduling exceptions do not cancel an earlier cleanup registration",async()=>{
  const scope={},jobs:(()=>Promise<void>)[]=[],calls:string[]=[];
  scheduleLatestExpiryCleanup(scope,"phone",job=>{jobs.push(job);return true;},async()=>{calls.push("original");});
  assert.throws(()=>scheduleLatestExpiryCleanup(scope,"phone",()=>{throw Error("scheduler unavailable");},async()=>{calls.push("failed-registration");}),/scheduler unavailable/);
  await jobs[0]();assert.deepEqual(calls,["original"]);
});

test("software: probe persistence diagnostics do not move the trusted issuance anchor",async()=>{
  const l=lab(),r=await running(l),issued=l.now(),prepare=l.db.prepare.bind(l.db);const logs:Record<string,unknown>[]=[],info=console.info;
  l.db.prepare=sql=>{const statement=prepare(sql),bind=statement.bind.bind(statement);if(sql.startsWith("INSERT INTO sb_clock_probes"))statement.bind=(...values:unknown[])=>{const bound=bind(...values),run=bound.run.bind(bound),first=bound.first.bind(bound);bound.run=async()=>{const result=await run();l.tick(185);return result;};bound.first=async<T>()=>{const result=await first<T>();l.tick(185);return result;};return bound;};return statement;};
  console.info=(value:unknown)=>{logs.push(JSON.parse(String(value)));};
  try{const probe=await l.service.clockProbe(r.actor);assert.equal(probe.server_time,new Date(issued).toISOString());assert.equal(l.db.raw.prepare("SELECT created_at FROM sb_clock_probes WHERE id=?").get(probe.clock_probe_id)!.created_at,issued);assert.equal(logs.find(x=>x.event==="capture_clock_probe")?.reply_after_anchor_ms,185);}finally{console.info=info;}
});
test("software: queued probe issuance is stored at SQL execution, never manufactured at response completion",async()=>{
  const l=lab(),r=await running(l),start=l.now(),prepare=l.db.prepare.bind(l.db);let delayed=false;
  l.db.prepare=sql=>{const statement=prepare(sql),bind=statement.bind.bind(statement);if(sql.startsWith("INSERT INTO sb_clock_probes"))statement.bind=(...values:unknown[])=>{const bound=bind(...values),first=bound.first.bind(bound),run=bound.run.bind(bound);bound.first=async<T>()=>{if(!delayed){delayed=true;l.tick(350);}const result=await first<T>();l.tick(100);return result;};bound.run=async()=>{if(!delayed){delayed=true;l.tick(350);}const result=await run();l.tick(100);return result;};return bound;};return statement;};
  const probe=await l.service.clockProbe(r.actor),row=l.db.raw.prepare("SELECT created_at,expires_at FROM sb_clock_probes WHERE id=?").get(probe.clock_probe_id)!;
  assert.equal(row.created_at,start+350);assert.equal(probe.server_time,new Date(start+350).toISOString());assert.equal(l.now(),start+450);assert.equal(probe.anchor_version,"db_issue_v2");
  assert.equal(row.expires_at,Number(row.created_at)+60000);
});
test("software: a future or badly skewed SQL probe clock is deleted and falls back to a conservative Worker anchor",async()=>{
  for(const skew of [5000,-5000]){
    const l=lab(),r=await running(l);l.db.raw.function("julianday",(value:unknown)=>{void value;return 2440587.5+(l.now()+skew)/86400000;});
    const probe=await l.service.clockProbe(r.actor),row=l.db.raw.prepare("SELECT created_at FROM sb_clock_probes WHERE id=?").get(probe.clock_probe_id)!;
    assert.equal(row.created_at,l.now());assert.equal(probe.anchor_version,"worker_issue_v1_fallback");
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_clock_probes WHERE created_at>? OR created_at<?").get(l.now()+100,l.now()-100)!.n,0);
  }
});

test("software: an opted-in clock probe carries a token-bound permit for the persisted probe and exact capture scope",async()=>{
  const key="67".repeat(32),issuer=new FrameUploadPermits(key),consumer=new FrameUploadPermits(key);
  const l=lab(false,undefined,issuer),r=await running(l);
  const before=l.db.requests;
  const probe=await l.service.clockProbe(r.actor,r.identity);
  assert.equal(l.db.requests-before,1);
  assert.equal(probe.anchor_version,"db_issue_v2");
  assert.ok(probe.frame_upload_permit);
  assert.equal(probe.frame_permit_outcome,4);
  assert.equal(probe.frame_upload_permit_ttl_ms,10_000);
  const signed=await consumer.verify(r.actor.token_hash,probe.frame_upload_permit,l.now());
  const row=l.db.raw.prepare("SELECT created_at,expires_at FROM sb_clock_probes WHERE id=? AND device_id=?").get(probe.clock_probe_id,r.actor.id)!;
  assert.deepEqual(signed,{
    device:r.actor.id,owner:r.actor.owner_id,session:r.identity.bridge_session_id,broadcast:r.identity.broadcast_id,
    worker:r.identity.worker_id,lease:r.identity.lease_epoch,probe:probe.clock_probe_id,probeCreated:row.created_at,
    probeExpires:row.expires_at,expires:l.now()+10_000,
  });
  assert.equal(await consumer.verify("different-token-hash",probe.frame_upload_permit,l.now()),null);
  const publisher=edge(l,consumer),start=l.db.requests;
  const request=new Request("https://test.example/v1/device/frame",{method:"POST",headers:{
    Authorization:"Bearer "+r.token,[framePermitHeader]:probe.frame_upload_permit,"Content-Length":String(r.bytes.length),
  }});
  const uploaded=await publisher.service.acceptFrameRequest(request,{...r.metadata,clock_probe_id:probe.clock_probe_id},async limit=>{
    assert.equal(limit,framePermitMaxBytes);
    return r.bytes;
  });
  assert.equal(uploaded.accepted_frame_id,r.metadata.frame_id);
  assert.equal(l.db.requests-start,1);
});

test("software: clock probe replies without a permit for legacy, malformed and mismatched selectors",async()=>{
  const l=lab(false,undefined,new FrameUploadPermits("67".repeat(32))),r=await running(l);
  const scopes=[[undefined,undefined],[null,1],[[],1],[{},1],
    [{...r.identity,bridge_session_id:uid()},2],[{...r.identity,broadcast_id:uid()},2],
    [{...r.identity,worker_id:uid()},2],[{...r.identity,lease_epoch:r.identity.lease_epoch+1},2]] as const;
  for(const [scope,code] of scopes){
    const before=l.db.requests,probe=await l.service.clockProbe(r.actor,scope);
    assert.equal(l.db.requests-before,1);
    assert.equal(probe.anchor_version,"db_issue_v2");
    assert.equal(Object.hasOwn(probe,"frame_upload_permit"),false);
    assert.equal(probe.frame_permit_outcome,code);
    const keys=["anchor_version","clock_probe_id","expires_in_ms","server_time"];
    if(code!==undefined)keys.push("frame_permit_outcome");
    assert.deepEqual(Object.keys(probe).sort(),keys.sort());
  }
});

test("software: clock probe does not issue a permit after capture, lease or token authority changes",async()=>{
  const changes=[
    "UPDATE sb_sessions SET capture_state='paused'",
    "UPDATE sb_devices SET worker_expires=0",
    "UPDATE sb_devices SET token_expires=0",
    "UPDATE sb_devices SET token_hash='replaced-token-hash'",
    "UPDATE sb_devices SET revoked=1",
  ];
  for(const sql of changes){
    const l=lab(false,undefined,new FrameUploadPermits("67".repeat(32))),r=await running(l);
    l.db.raw.exec(sql);
    const before=l.db.requests,probe=await l.service.clockProbe(r.actor,r.identity);
    assert.equal(l.db.requests-before,1,sql);
    assert.equal(probe.anchor_version,"db_issue_v2",sql);
    assert.equal(Object.hasOwn(probe,"frame_upload_permit"),false,sql);
    assert.equal(probe.frame_permit_outcome,2,sql);
  }
});

test("software: a skew fallback clock probe carries a fresh permit for its own persisted Worker anchor",async()=>{
  for(const skew of [-500,400]){
    const key="67".repeat(32),issuer=new FrameUploadPermits(key);
    const l=lab(false,undefined,issuer),r=await running(l);
    l.db.raw.function("julianday",(_value:unknown)=>2440587.5+(l.now()+skew)/86400000);
    l.db.raw.prepare("UPDATE sb_devices SET worker_expires=?").run(l.now()+700);
    const probeCount=l.db.raw.prepare("SELECT count(*) n FROM sb_clock_probes").get()!.n;
    const before=l.db.requests;
    const logs:Record<string,unknown>[]=[],info=console.info;
    console.info=(value:unknown)=>{logs.push(JSON.parse(String(value)));};
    try {
      const probe=await l.service.clockProbe(r.actor,r.identity);
      assert.equal(l.db.requests-before,2);
      assert.equal(probe.anchor_version,"worker_issue_v1_fallback");
      assert.equal(probe.frame_permit_outcome,5);
      assert.equal(probe.frame_upload_permit_ttl_ms,700);
      assert.ok(probe.frame_upload_permit);
      assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_clock_probes").get()!.n,Number(probeCount)+1);
      const row=l.db.raw.prepare("SELECT created_at FROM sb_clock_probes WHERE id=?").get(probe.clock_probe_id)!;
      assert.equal(row.created_at,l.now());
      const consumer=new FrameUploadPermits(key),signed=await consumer.verify(r.actor.token_hash,probe.frame_upload_permit,l.now());
      assert.equal(signed?.probe,probe.clock_probe_id);
      assert.equal(signed?.probeCreated,row.created_at);
      const publisher=edge(l,consumer),uploadBefore=l.db.requests,metadata={...r.metadata,clock_probe_id:probe.clock_probe_id,after_command_id:uid()};
      const request=new Request("https://test.example/v1/device/frame",{method:"POST",headers:{
        Authorization:"Bearer "+r.token,[framePermitHeader]:probe.frame_upload_permit,"Content-Length":String(r.bytes.length),
      }});
      const uploaded=await publisher.service.acceptFrameRequest(request,metadata,async limit=>{
        assert.equal(limit,framePermitMaxBytes);return r.bytes;
      });
      assert.equal(l.db.requests-uploadBefore,1);
      assert.equal(uploaded.accepted_frame_id,metadata.frame_id);
      assert.equal(record(uploaded.request_timing).frame_permit_admission_code,5);
      assert.equal(logs.find(row=>row.event==="capture_clock_probe"&&row.clock_probe_id===probe.clock_probe_id)?.frame_permit_outcome,5);
      assert.equal(logs.find(row=>row.event==="frame_permit_ingress"&&row.frame_id===metadata.frame_id&&row.clock_probe_id===probe.clock_probe_id)?.frame_permit_admission_code,5);
      assert.equal(JSON.stringify(logs).includes(probe.frame_upload_permit),false);
      l.tick(700);
      assert.equal(await consumer.verify(r.actor.token_hash,probe.frame_upload_permit,l.now()),null);
    }finally{console.info=info;}
  }
});

test("software: a fallback clock probe cannot reuse authority lost after the skewed probe",async()=>{
  for(const change of [
    "UPDATE sb_devices SET worker_expires=0","UPDATE sb_devices SET token_expires=0",
    "UPDATE sb_devices SET lease_epoch=lease_epoch+1","UPDATE sb_sessions SET capture_state='paused'",
  ]){
    const l=lab(false,undefined,new FrameUploadPermits("67".repeat(32))),r=await running(l);
    l.db.raw.function("julianday",(_value:unknown)=>2440587.5+(l.now()-500)/86400000);
    const batch=l.db.batch.bind(l.db);let batches=0;
    l.db.batch=async statements=>{
      const output=await batch(statements);
      if(++batches===1)l.db.raw.exec(change);
      return output;
    };
    const probe=await l.service.clockProbe(r.actor,r.identity);
    assert.equal(batches,2);
    assert.equal(probe.anchor_version,"worker_issue_v1_fallback");
    assert.equal(probe.frame_permit_outcome,2,change);
    assert.equal(probe.frame_upload_permit,undefined,change);
    assert.equal(probe.frame_upload_permit_ttl_ms,undefined,change);
  }
});

test("software: permit timing distinguishes absent, invalid and valid-but-mismatched frame headers",async()=>{
  for(const [mode,code] of [["absent",1],["invalid",3],["wrong_probe",4]] as const){
    const {l,r,e,permit,request,next}=await framePermitFixture();
    const probe=await l.service.clockProbe(r.actor);
    l.tick(50);
    const upload=request(mode==="invalid"?"invalid-fixture-header":permit);
    if(mode==="absent")upload.headers.delete(framePermitHeader);
    const metadata={...next(2,50),clock_probe_id:probe.clock_probe_id};
    const result=await e.service.acceptFrameRequest(upload,metadata,async limit=>{
      assert.equal(limit,undefined);
      return r.bytes;
    });
    assert.equal(result.accepted_frame_id,metadata.frame_id);
    assert.equal(record(result.request_timing).frame_permit_admission_code,code);
    assert.equal(Object.hasOwn(result,"frame_upload_permit_ttl_ms"),mode!=="absent");
  }
});

test("software: a permit that expires during signing is omitted with its TTL",async()=>{
  const issuer=new FrameUploadPermits("67".repeat(32)),l=lab(false,undefined,issuer),r=await running(l);
  l.db.raw.prepare("UPDATE sb_devices SET worker_expires=?").run(l.now()+100);
  const sign=issuer.issue.bind(issuer);
  issuer.issue=async(...args)=>{
    const proof=await sign(...args);
    l.tick(100);
    return proof;
  };
  const probe=await l.service.clockProbe(r.actor,r.identity);
  assert.equal(probe.frame_permit_outcome,3);
  assert.equal(probe.frame_upload_permit,undefined);
  assert.equal(probe.frame_upload_permit_ttl_ms,undefined);
});


async function mouseReady(l: ReturnType<typeof lab>) {
  const r = await running(l), mouse = new MouseControl(l.service), led = new LEDControl(l.service);
  const hardware = { hardware_id: uid(), board_boot_id: uid(), protocol_version: "1.0", descriptor_version: "mouse-only-test", transport: "usb_ncm", capabilities: { "led.set": true, "hid.mouse.relative": true, "hid.mouse.click": true, "hid.mouse.scroll": true, "hid.keyboard": false }, led_config: { type: "software_fixture" }, lease_epoch_floor: 0 };
  await led.bind(r.actor, hardware);
  const beat = { ...r.identity, capture_state: "active", usb_connected: true, board_boot_id: hardware.board_boot_id, mouse_relay_enabled: true };
  await l.service.heartbeat(r.actor, beat);
  await mouse.grant(r.actor, { bridge_session_id: r.identity.bridge_session_id, control_enabled: true, request_id: uid() });
  const heartbeat = await l.service.heartbeat(r.actor, beat);
  assert.equal(heartbeat.directive, "continue"); assert.ok(heartbeat.grant_remaining_ms > 0);
  return { ...r, mouse, hardware, beat };
}

async function acknowledgedMouse(l:ReturnType<typeof lab>,mono=10000){
  const r=await mouseReady(l),request={idempotency_key:uid(),wait_ms:0},command=await r.mouse.enqueue(alice,"pointer.click",request);
  await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,command.command_id,{...r.identity,control_epoch:command.control_epoch});
  const receipt={command_id:command.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",finished_uptime_ms:9_000_000,effect:{hid_reports_sent:true}};
  const body={...r.identity,state:"board_acked",board_receipt:receipt,finished_client_mono_ms:mono};
  const ack=await r.mouse.result(r.actor,command.command_id,body);
  return {...r,command,body,ack,request};
}
async function capturedAtPhoneMono(l:ReturnType<typeof lab>,r:Awaited<ReturnType<typeof running>>,mono:number,seq=1,extra:Record<string,unknown>={}){
  const e=edge(l),meta={...r.metadata,frame_id:uid(),frame_seq:seq,capture_mono_ms:mono,capture_offset_ms:mono-10000,captured_at:new Date(l.now()+mono-10000).toISOString(),...extra};
  await e.service.acceptFrame(r.actor,meta,r.bytes);return {e,meta};
}

async function systemSearchReady(l:ReturnType<typeof lab>){
  const r=await mouseReady(l);
  const hardware={...r.identity,...r.hardware,capabilities:{...r.hardware.capabilities,
    "hid.keyboard.system_search":true,"sayso.system_search":true,"sayso.system_search.scope_only.v1":true}};
  await new LEDControl(l.service).bind(r.actor,hardware);await l.service.heartbeat(r.actor,r.beat);
  const {meta}=await capturedAtPhoneMono(l,r,9999,1,{source_seq:1});
  const args={device_id:r.actor.id,idempotency_key:uid(),wait_ms:0};
  async function invoke(name:string,arguments_:Record<string,unknown>,user=alice){
    const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:arguments_}})}),
      {engine:()=>l.service,caller:()=>user,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
    return (await response.json() as RpcReply).result;
  }
  return {...r,meta,args,hardware,invoke};
}

async function scopeOnlySystemSearchReady(l:ReturnType<typeof lab>,enabled=true){
  const r=await mouseReady(l);
  const hardware={...r.identity,...r.hardware,capabilities:{...r.hardware.capabilities,
    "hid.keyboard.system_search":true,"sayso.system_search":true,"sayso.system_search.scope_only.v1":enabled}};
  await new LEDControl(l.service).bind(r.actor,hardware);
  await l.service.heartbeat(r.actor,r.beat);
  const args={device_id:r.actor.id,idempotency_key:uid(),wait_ms:0};
  return {...r,hardware,args};
}

test("software: scope-only system search starts without a preimage and returns one original signed after-image",async()=>{
  const l=lab(),r=await scopeOnlySystemSearchReady(l),device=r.actor.id;
  const status=await r.mouse.status(alice,{device_id:device});
  assert.equal(status.system_search_ready,true);
  assert.equal(status.system_search_scope_only_ready,true);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_frames WHERE device_id=?").get(device)!.n,0);
  const count=()=>l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE device_id=?").get(device)!.n;
  const unboundProof=await liveMcp(l.service,"open_system_search",{...r.args,source_view_proof:"fixture-proof"});
  assert.equal(unboundProof.result.structuredContent.error,"INVALID_ARGUMENTS");
  assert.equal(count(),0);
  let announce!: (id:string)=>void;
  const queued=new Promise<string>(resolve=>{announce=resolve;});
  const batch=l.db.batch.bind(l.db);
  l.db.batch=async statements=>{
    const rows=await batch(statements);
    const saved=l.db.raw.prepare("SELECT id FROM sb_mouse_commands WHERE device_id=? AND state='queued'").get(device);
    if(typeof saved?.id==="string")announce(saved.id);
    return rows;
  };
  const {wait_ms:_wait,...defaultArgs}=r.args;
  const invocation=liveMcp(l.service,"open_system_search",defaultArgs);
  const id=await Promise.race([queued,invocation.then(reply=>{throw new Error(JSON.stringify(reply.result.structuredContent));})]);
  assert.equal(count(),1);
  const admission=l.db.raw.prepare("SELECT worker_id,lease_epoch FROM sb_mouse_commands WHERE id=?").get(id)!;
  assert.equal(admission.worker_id,r.identity.worker_id);
  assert.equal(admission.lease_epoch,r.identity.lease_epoch);
  const claim=(token:string)=>r.mouse.claimRequest(new Request("https://test.example/v1/device/mouse/commands/claim",
    {headers:{Authorization:"Bearer "+token}}),async()=>({body:{...r.identity,control_epoch:status.control_epoch,
      raw_dispatch_protocol:RAW_MOUSE_DISPATCH},waitMS:0}));
  await assert.rejects(claim("x".repeat(43)),/UNAUTHENTICATED/);
  const granted=await claim(r.token);
  assert.equal(granted?.command_id,id);
  assert.equal(granted.state,"executing");
  assert.deepEqual(granted.payload,{});
  assert.deepEqual(granted.precondition,{system_search_mode:"scope_only.v1",capture_min_gap_ms:300});
  assert.equal(record(granted).raw_dispatch_protocol,RAW_MOUSE_DISPATCH);
  assert.ok(Number(record(granted).ttl_remaining_ms)>0&&Number(record(granted).ttl_remaining_ms)<=2500);
  const boot=r.hardware.board_boot_id,ack=10003;
  const receipt={command_id:id,board_boot_id:boot,state:"executed",subcommand_index:0,error:null,
    effect:{hid_reports_sent:true,system_search_stable:true,all_released:true}};
  const resultBody={...r.identity,state:"board_acked",finished_client_mono_ms:ack,board_receipt:receipt};
  await assert.rejects(r.mouse.result(r.actor,id,{...resultBody,board_receipt:{...receipt,
    effect:{...receipt.effect,all_released:false}}}),/INVALID_SYSTEM_SEARCH_RECEIPT/);
  await r.mouse.result(r.actor,id,resultBody);
  l.tick(400);
  const {meta}=await capturedAtPhoneMono(l,r,10400,1,{source_seq:1});
  const reply=await invocation,summary=reply.result.structuredContent,after=record(summary.after_screen),proof=record(after.after_command);
  assert.equal(reply.result.isError,false);
  assert.equal(summary.command_id,id);
  assert.equal(summary.state,"board_acked");
  assert.deepEqual(summary.board_receipt,receipt);
  assert.equal(reply.images.length,1);
  assert.equal(record(after.metadata).frame_id,meta.frame_id);
  assert.equal(proof.command_id,id);
  assert.equal(proof.phone_ack_mono_ms,ack);
  assert.equal(proof.minimum_gap_ms,300);
  assert.ok(Number(proof.lower_gap_ms)>300);
  assert.equal(proof.scope_matches_at_snapshot,true);
  assert.equal(proof.app_effect_observed,false);
  assert.ok(Number(after.wait_budget_ms)>4500&&Number(after.wait_budget_ms)<=5000);
  const duplicate=await liveMcp(l.service,"open_system_search",r.args);
  assert.equal(duplicate.result.structuredContent.command_id,id);
  const changed=await liveMcp(l.service,"open_system_search",{...r.args,settle_ms:700});
  assert.equal(changed.result.structuredContent.error,"IDEMPOTENCY_CONFLICT");
  assert.equal(await claim(r.token),null);
  assert.equal(count(),1);
});

test("software: current Search requires scope capability and rejects the removed source-image argument",async()=>{
  const l=lab(),r=await scopeOnlySystemSearchReady(l,false),device=r.actor.id;
  const before=await r.mouse.status(alice,{device_id:device});
  assert.equal(before.system_search_ready,undefined);
  assert.equal(before.system_search_scope_only_ready,undefined);
  const rejected=await liveMcp(l.service,"open_system_search",r.args);
  assert.ok(["SYSTEM_SEARCH_SCOPE_ONLY_NOT_READY","MOUSE_ACTION_UNSUPPORTED"].includes(String(rejected.result.structuredContent.error)));
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,0);

  await new LEDControl(l.service).bind(r.actor,{...r.hardware,capabilities:{...r.hardware.capabilities,
    "sayso.system_search.scope_only.v1":true}});
  await l.service.heartbeat(r.actor,r.beat);
  const {meta}=await capturedAtPhoneMono(l,r,9999,1,{source_seq:1});
  const rejectedOld=await liveMcp(l.service,"open_system_search",{...r.args,source_frame_id:meta.frame_id});
  assert.equal(rejectedOld.result.structuredContent.error,"INVALID_ARGUMENTS");
  const current=await liveMcp(l.service,"open_system_search",r.args);
  assert.equal(current.result.isError,false);
  assert.equal(record(current.result.structuredContent.precondition).system_search_mode,"scope_only.v1");
});

test("software: negotiated raw TTL uses only an exact scope-only search and never renews the row or live authority",async t=>{
  for(const mode of ["extended","no_request","no_capability","reviewed_source","ordinary_click","worker_cutoff",
    "control_cutoff","claim_observation_delay","invalid_request"] as const)await t.test(mode,async()=>{
    const l=lab(),r=await scopeOnlySystemSearchReady(l);
    await new LEDControl(l.service).bind(r.actor,{...r.hardware,capabilities:{...r.hardware.capabilities,
      [scopedSearchTTLCapability]:mode!=="no_capability"}});
    const source=mode==="reviewed_source"?(await capturedAtPhoneMono(l,r,9999,1,{source_seq:1})).meta.frame_id:undefined;
    if(mode==="reviewed_source"){
      await assert.rejects(r.mouse.enqueue(alice,SYSTEM_SEARCH_KIND,{...r.args,source_frame_id:source}),/CURRENT_ACTION_PROTOCOL_REQUIRED/);
      assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,0);return;
    }
    const queued=mode==="ordinary_click"?await r.mouse.enqueue(alice,"pointer.click",r.args):
      await r.mouse.enqueue(alice,SYSTEM_SEARCH_KIND,{...r.args,source_frame_id:source});
    const args={...r.identity,control_epoch:queued.control_epoch,raw_dispatch_protocol:RAW_MOUSE_DISPATCH,
      ...(mode==="no_request"?{}:{raw_dispatch_ttl_profiles:[scopedSearchTTLProfile]})};
    const originalExpiry=Date.parse(queued.expires_at);
    if(mode==="invalid_request"){
      await assert.rejects(r.mouse.claim(r.actor,{...args,raw_dispatch_ttl_profiles:[scopedSearchTTLProfile,scopedSearchTTLProfile]},0),
        /INVALID_RAW_DISPATCH_TTL_PROFILES/);
      await assert.rejects(r.mouse.claim(r.actor,{...args,raw_dispatch_protocol:undefined},0),/INVALID_RAW_DISPATCH_TTL_PROFILES/);
      assert.equal((await r.mouse.get(alice,queued.command_id)).state,"queued");
      return;
    }
    const cutoff=mode==="worker_cutoff"?l.now()+3310:mode==="control_cutoff"?l.now()+3170:originalExpiry;
    if(mode==="worker_cutoff")l.db.raw.prepare("UPDATE sb_devices SET worker_expires=? WHERE id=?").run(cutoff,r.actor.id);
    if(mode==="control_cutoff")l.db.raw.prepare("UPDATE sb_sessions SET mouse_until=? WHERE id=?")
      .run(cutoff,r.identity.bridge_session_id);
    if(mode==="claim_observation_delay"){
      const batch=l.db.batch.bind(l.db);
      l.db.batch=async statements=>{const value=await batch(statements);l.tick(800);return value;};
    }
    const reply=record(await r.mouse.claim(r.actor,args,0));
    const extended=!["no_request","no_capability","reviewed_source","ordinary_click"].includes(mode);
    assert.equal(reply.state,"executing");
    assert.equal(reply.command_id,queued.command_id);
    assert.equal(reply.raw_dispatch_ttl_profile,extended?scopedSearchTTLProfile:undefined);
    assert.equal(reply.ttl_remaining_ms,Math.min(extended?5000:2500,cutoff-l.now()));
    assert.equal(reply.expires_at,queued.expires_at);
    assert.equal(await r.mouse.claim(r.actor,args,0),null);
    assert.equal((await r.mouse.get(alice,queued.command_id)).expires_at,queued.expires_at);
  });
});

test("software: scope-only system search fences owner, permission, control, board, worker, lease and capability at dispatch",async t=>{
  for(const stage of ["claim","start"] as const)for(const change of ["owner","permission","control","boot","capability","worker","lease"] as const)
    await t.test(stage+"_"+change,async()=>{
      const l=lab(),r=await scopeOnlySystemSearchReady(l),device=r.actor.id;
      await new LEDControl(l.service).bind(r.actor,{...r.hardware,capabilities:{...r.hardware.capabilities,[scopedSearchTTLCapability]:true}});
      const opened=await liveMcp(l.service,"open_system_search",r.args),command=opened.result.structuredContent;
      const id=String(command.command_id),identity={...r.identity,control_epoch:command.control_epoch};
      assert.equal(command.state,"queued");
      if(stage==="start"){
        const claim=await r.mouse.claim(r.actor,r.identity,0);
        assert.equal(claim?.command_id,id);
        assert.equal(claim.state,"claimed");
      }
      if(change==="permission")l.db.raw.prepare("UPDATE sb_sessions SET mouse_enabled=0 WHERE id=?").run(r.identity.bridge_session_id);
      if(change==="control")l.db.raw.prepare("UPDATE sb_sessions SET control_epoch=control_epoch+1 WHERE id=?").run(r.identity.bridge_session_id);
      if(change==="boot")l.db.raw.prepare("UPDATE sb_hardware SET board_boot_id=? WHERE device_id=?").run(uid(),device);
      if(change==="capability")await new LEDControl(l.service).bind(r.actor,{...r.hardware,
        capabilities:{...r.hardware.capabilities,"sayso.system_search.scope_only.v1":false}});
      const dispatchIdentity={...identity};
      if(change==="worker"){
        dispatchIdentity.worker_id=uid();
        l.db.raw.prepare("UPDATE sb_devices SET worker_id=? WHERE id=?").run(dispatchIdentity.worker_id,device);
      }
      if(change==="lease"){
        dispatchIdentity.lease_epoch=Number(identity.lease_epoch)+1;
        l.db.raw.prepare("UPDATE sb_devices SET lease_epoch=? WHERE id=?").run(dispatchIdentity.lease_epoch,device);
      }
      const actor=change==="owner"?{...r.actor,owner_id:bob.id}:r.actor;
      if(stage==="claim"){
        const claim=r.mouse.claim(actor,{...dispatchIdentity,
          control_epoch:change==="control"?Number(command.control_epoch)+1:command.control_epoch,
          raw_dispatch_protocol:RAW_MOUSE_DISPATCH,raw_dispatch_ttl_profiles:[scopedSearchTTLProfile]},0);
        if(change==="owner")await assert.rejects(claim,/STALE_SESSION/);
        else assert.equal(await claim,null);
      }else await assert.rejects(r.mouse.start(actor,id,dispatchIdentity),/MOUSE_EXPIRED_OR_CONTROL_CHANGED/);
      assert.notEqual(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(id)!.state,"executing");
    });
});

const sourceViewLab=()=>lab(false,undefined,new FrameUploadPermits("59".repeat(32)));

test("software: system search is one exact same-boot action with an original after-image",async()=>{
  const l=lab(),r=await systemSearchReady(l);
  assert.equal((await r.mouse.status(alice,{device_id:r.actor.id})).system_search_ready,true);
  const first=await r.invoke("open_system_search",r.args),command=first.structuredContent,id=String(command.command_id);
  assert.equal(first.isError,false);assert.equal(command.kind,"keyboard.open_search");
  assert.deepEqual(command.payload,{});assert.deepEqual(command.precondition,{system_search_mode:"scope_only.v1",capture_min_gap_ms:300});
  assert.equal((await r.invoke("open_system_search",r.args)).structuredContent.command_id,id);
  assert.equal((await r.invoke("open_system_search",{...r.args,settle_ms:700})).structuredContent.error,"IDEMPOTENCY_CONFLICT");
  const claim=await r.mouse.claimRequest(new Request("https://test.example/v1/device/mouse/commands/claim",{headers:{Authorization:"Bearer "+r.token}}),
    async()=>({body:{...r.identity,control_epoch:command.control_epoch,raw_dispatch_protocol:RAW_MOUSE_DISPATCH},waitMS:0}));
  assert.equal(claim?.command_id,id);assert.equal(claim?.state,"executing");
  assert.equal(record(claim).raw_dispatch_protocol,RAW_MOUSE_DISPATCH);assert.ok(Number(record(claim).ttl_remaining_ms)<=2500);
  const board={command_id:id,board_boot_id:r.hardware.board_boot_id,state:"executed",subcommand_index:0,
    effect:{hid_reports_sent:true,system_search_stable:true,all_released:true}};
  const packet={...r.identity,state:"board_acked",finished_client_mono_ms:10003,board_receipt:board};
  for(const invalid of [
    {...board,board_boot_id:uid()}, {...board,subcommand_index:1}, {...board,error:"CONTRADICTORY_BOARD_ERROR"},
    {...board,effect:{...board.effect,system_search_stable:false}}, {...board,effect:{...board.effect,all_released:false}},
  ])await assert.rejects(r.mouse.result(r.actor,id,{...packet,board_receipt:invalid}),/INVALID_SYSTEM_SEARCH_RECEIPT|INVALID_BOARD_RECEIPT/);
  await r.mouse.result(r.actor,id,packet);
  assert.equal((await r.invoke("get_mouse_result",{command_id:id,include_after_screen:true})).content.filter(x=>x.type==="image").length,0);
  l.tick(400);const {meta}=await capturedAtPhoneMono(l,r,10400,2);
  const seen=await r.invoke("get_mouse_result",{command_id:id,include_after_screen:true});
  assert.equal(seen.structuredContent.observation_state,"available");
  assert.equal(record(record(seen.structuredContent.after_screen).metadata).frame_id,meta.frame_id);
  assert.equal(record(seen.structuredContent.after_screen).app_effect_observed,false);
  assert.equal(seen.content.filter(x=>x.type==="image").length,1);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
});

test("software: current Search ignores image age but rejects missing capability and unrelated parameters",async()=>{
  for(const mode of ["no_board_cap","no_phone_cap","old_frame","wrong_frame","foreign","stopped","app_name","text","payload"]){
    const l=lab(),r=await systemSearchReady(l);
    let args:Record<string,unknown>={...r.args},user=alice;
    if(mode==="no_board_cap"||mode==="no_phone_cap"){
      await new LEDControl(l.service).bind(r.actor,{...r.hardware,capabilities:{...r.hardware.capabilities,
        [mode==="no_board_cap"?"hid.keyboard.system_search":"sayso.system_search"]:false}});
    }
    if(mode==="old_frame"){l.tick(1600);await capturedAtPhoneMono(l,r,11600,2);}
    if(mode==="wrong_frame")args={...args,source_frame_id:uid()};
    if(mode==="foreign")user=bob;
    if(mode==="stopped")await r.mouse.stop(alice,{device_id:r.actor.id});
    if(["app_name","text","payload"].includes(mode))args={...args,[mode]:mode==="payload"?{keys:[40]}:"target app"};
    const response=await r.invoke("open_system_search",args,user);
    assert.equal(response.isError,mode!=="old_frame",mode);assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,mode==="old_frame"?1:0,mode);
  }
});

test("software: system search unknown input keeps the original command and never toggles again",async()=>{
  const l=lab(),r=await systemSearchReady(l),command=(await r.invoke("open_system_search",r.args)).structuredContent,id=String(command.command_id);
  await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,id,{...r.identity,control_epoch:command.control_epoch});
  await r.mouse.result(r.actor,id,{...r.identity,state:"outcome_unknown",board_receipt:{},error:"USB_OUTCOME_UNKNOWN"});
  const query=await r.invoke("get_mouse_result",{command_id:id,include_after_screen:true});
  assert.equal(query.structuredContent.state,"outcome_unknown");assert.equal(query.content.filter(x=>x.type==="image").length,0);
  const repeated=await r.invoke("open_system_search",r.args);
  assert.equal(repeated.structuredContent.command_id,id);assert.equal(repeated.structuredContent.state,"outcome_unknown");
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
});

test("software: system search capabilities remain fenced at claim and start",async()=>{
  for(const stage of ["claim","start"]){
    const l=lab(),r=await systemSearchReady(l),command=(await r.invoke("open_system_search",r.args)).structuredContent,id=String(command.command_id);
    if(stage==="start")assert.equal((await r.mouse.claim(r.actor,r.identity,0))?.command_id,id);
    await new LEDControl(l.service).bind(r.actor,{...r.hardware,capabilities:{...r.hardware.capabilities,"sayso.system_search":false}});
    if(stage==="claim")assert.equal(await r.mouse.claim(r.actor,{...r.identity,control_epoch:command.control_epoch,raw_dispatch_protocol:RAW_MOUSE_DISPATCH},0),null);
    else await assert.rejects(r.mouse.start(r.actor,id,{...r.identity,control_epoch:command.control_epoch}),/MOUSE_EXPIRED_OR_CONTROL_CHANGED/);
  }
});

test("software: system search binds the capture delay to its original command and recovery",async()=>{
  const l=lab(),r=await systemSearchReady(l),args={...r.args,settle_ms:900};
  const original=(await r.invoke("open_system_search",args)).structuredContent,id=String(original.command_id);
  assert.equal(record(original.precondition).capture_min_gap_ms,900);
  const changed=await r.invoke("open_system_search",{...args,settle_ms:300});
  assert.equal(changed.structuredContent.error,"IDEMPOTENCY_CONFLICT");
  await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,id,{...r.identity,control_epoch:original.control_epoch});
  await r.mouse.result(r.actor,id,{...r.identity,state:"board_acked",finished_client_mono_ms:10003,
    board_receipt:{command_id:id,board_boot_id:r.hardware.board_boot_id,state:"executed",subcommand_index:0,
      effect:{hid_reports_sent:true,system_search_stable:true,all_released:true}}});
  l.tick(400);await capturedAtPhoneMono(l,r,10400,2);
  const early=await r.invoke("get_mouse_result",{command_id:id,include_after_screen:true});
  assert.equal(early.content.filter(x=>x.type==="image").length,0);
  l.tick(600);const {meta}=await capturedAtPhoneMono(l,r,11000,3);
  const observed=await r.invoke("get_mouse_result",{command_id:id,include_after_screen:true});
  assert.equal(observed.structuredContent.observation_state,"available");
  const after=record(observed.structuredContent.after_screen);
  assert.equal(record(after.metadata).frame_id,meta.frame_id);
  assert.equal(record(after.after_command).minimum_gap_ms,900);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
});

const focusedTextEnterBoard={
  "sayso.focused_text":true,"hid.keyboard.ascii_stable":true,
  "sayso.focused_text_submit_enter":true,"hid.keyboard.ascii_enter_stable":true,
};
const focusedTextEnterArgs=(device:string,frame:string)=>({
  device_id:device,source_frame_id:frame,idempotency_key:uid(),text:"changi airport",submit:"enter",clear_before_input:false,wait_ms:0,
  field:{x:.12,y:.48,width:.64,height:.06},landmark:{text:"Search",region:{x:.04,y:.16,width:.8,height:.06}},
});

async function focusedTextAfterFixture(submitEnter:boolean,settleMS?:number,advanceCaptureClockDuringWait=true){
  let mono=0;
  const l=lab(false,{now:()=>mono,sleep:async ms=>{mono+=ms;if(advanceCaptureClockDuringWait)l.tick(ms);}});
  const r=await mouseReady(l);await capturedAtPhoneMono(l,r,9999);
  const boot=r.hardware.board_boot_id;
  await new LEDControl(l.service).bind(r.actor,{...r.identity,...r.hardware,
    capabilities:{...r.hardware.capabilities,...focusedTextEnterBoard,"hid.mouse.absolute":true,"sayso.action_geometry.v1":true,
      "sayso.focused_text.no_visual.v1":true}});
  await l.service.heartbeat(r.actor,r.beat);
  const state=await r.mouse.status(alice,{device_id:r.actor.id});
  const phone={...r.identity,control_epoch:state.control_epoch,raw_dispatch_protocol:RAW_MOUSE_DISPATCH,
    point_protocol:PAIRED_MOUSE_POINT,spotlight_dispatch_protocol:SPOTLIGHT_CLAIM_START};
  await r.mouse.claim(r.actor,phone,0);
  const args={device_id:r.actor.id,text:"Changi airport",idempotency_key:uid(),clear_before_input:false,
    submit:submitEnter?"enter":undefined,wait_ms:0,...(settleMS===undefined?{}:{settle_ms:settleMS})};
  const pending=await r.mouse.enqueueAuthorizedFieldObserved(alice,args);assert.ok(pending);
  const id=pending.command_id,claimed=await r.mouse.claim(r.actor,phone,0);assert.equal(claimed?.state,"executing");
  await r.mouse.result(r.actor,id,{...r.identity,state:"board_acked",input_submitted:true,finished_client_mono_ms:10050,
    mouse_mode_confirmed:true,restored_mouse_boot_id:boot,
    board_receipt:{command_id:id,board_boot_id:boot,state:"executed",subcommand_index:0,error:null,
      effect:{hid_reports_sent:true,ascii_stable:true,all_released:true,...(submitEnter?{enter_sent:true}:{})}}});
  const count=()=>l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n;
  const setAge=(frame:string,age:number)=>{
    l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE frame_id=?").run(l.now()-age,frame);
    l.db.raw.prepare("UPDATE sb_observations SET acceptance_json=json_set(acceptance_json,'$.capture_lower_ms',?) WHERE frame_id=?").run(l.now()-age,frame);
  };
  return {l,r,id,args,count,setAge};
}

test("software: split focused text uses a saved settle and read-only original gap without replay",async t=>{
  for(const mode of ["type_only","default_type_only","enter_floor","enter_raised"] as const)await t.test(mode,async()=>{
    const submitEnter=mode==="enter_floor"||mode==="enter_raised";
    const configured=mode==="default_type_only"?undefined:mode==="enter_floor"?0:mode==="enter_raised"?480:300;
    const expectedGap=mode==="enter_raised"?480:300;
    const {l,r,id,args,count}=await focusedTextAfterFixture(submitEnter,configured,false);
    const ack=10050;
    let sequence=1,previousMono=10000;
    const capture=async(gap:number)=>{
      const mono=ack+gap;
      l.tick(mono-previousMono);
      previousMono=mono;
      return (await capturedAtPhoneMono(l,r,mono,++sequence,{source_seq:sequence})).meta.frame_id;
    };
    const same=()=>liveMcp(l.service,"type_text_in_field",{...args,wait_ms:500});
    const original=(min?:number)=>liveMcp(l.service,"get_mouse_result",
      {command_id:id,include_after_screen:true,...(min===undefined?{}:{after_command_min_gap_ms:min})});
    const verify=(reply:Awaited<ReturnType<typeof liveMcp>>,frame:string,min:number)=>{
      const result=reply.result.structuredContent,after=record(result.after_screen),proof=record(after.after_command);
      assert.equal(result.command_id,id);
      assert.equal(result.state,"board_acked");
      assert.equal(reply.images.length,1);
      assert.equal(record(after.metadata).frame_id,frame);
      assert.equal(proof.command_id,id);
      assert.equal(proof.minimum_gap_ms,min);
      assert.ok(Number(proof.lower_gap_ms)>min);
    };
    const earlyFrame=await capture(87);
    const first=await same();
    {
      assert.equal(first.result.structuredContent.command_id,id);
      assert.equal(first.result.structuredContent.state,"board_acked");
      assert.equal(first.images.length,0);
      await capture(expectedGap);
      const exact=await original(0);
      assert.equal(exact.result.structuredContent.command_id,id);
      assert.equal(exact.images.length,0);
    }
    const nextGap=Math.max(expectedGap,87)+40;
    const later=await capture(nextGap);
    verify(await same(),later,expectedGap);
    verify(await original(),later,expectedGap);
    const noNewer=await original(nextGap);
    assert.equal(noNewer.result.structuredContent.command_id,id);
    assert.equal(noNewer.images.length,0);
    const latest=await capture(2501);
    verify(await original(2500),latest,2500);
    assert.equal(count(),1);
    assert.equal((await liveMcp(l.service,"type_text_in_field",{...args,settle_ms:expectedGap+5})).result.structuredContent.error,
      "IDEMPOTENCY_CONFLICT");
    assert.equal((await liveMcp(l.service,"type_text_in_field",{...args,settle_ms:2001})).result.structuredContent.error,
      "INVALID_NUMBER");
    assert.equal(count(),1);
  });
});

test("software: focused text and exact original-ID reads release only same-scope JPEGs strictly under 2s",async t=>{
  for(const mode of ["type_only","return_original_id","at_snapshot_limit","at_release_limit","old_boot","before_return_floor","late_replacement"] as const)await t.test(mode,async()=>{
    const submitEnter=mode!=="type_only";
    const {l,r,id,args,count,setAge}=await focusedTextAfterFixture(submitEnter);
    const gap=mode==="before_return_floor"?350:400;
    l.tick(gap);
    const {meta:frame}=await capturedAtPhoneMono(l,r,10000+gap,2,{source_seq:2});
    setAge(frame.frame_id,1001);
    const standalone=await liveMcp(l.service,"read_screen",{device_id:r.actor.id,wait_for_new_ms:0,max_age_ms:1000});
    assert.equal(standalone.images.length,0);
    assert.equal(standalone.result.structuredContent.reason,"NO_FRESH_FRAME");
    setAge(frame.frame_id,mode==="at_snapshot_limit"?2000:mode==="late_replacement"?1990:mode==="before_return_floor"?200:1999.75);
    if(mode==="old_boot")l.db.raw.prepare("UPDATE sb_hardware SET board_boot_id=? WHERE device_id=?").run(uid(),r.actor.id);
    let replacement:string|undefined;
    const clock=mode==="at_release_limit"?async()=>{l.tick(.25);return true;}:
      mode==="late_replacement"?async()=>{
        if(!replacement){l.tick(20);replacement=(await capturedAtPhoneMono(l,r,10420,3,{source_seq:3})).meta.frame_id;}
        return true;
      }:undefined;
    const sameCall=mode!=="return_original_id";
    const reply=await liveMcp(l.service,sameCall?"type_text_in_field":"get_mouse_result",
      sameCall?{...args,wait_ms:600}:{command_id:id,include_after_screen:true},()=>{},clock);
    const result=reply.result.structuredContent,after=record(result.after_screen);
    assert.equal(result.state,"board_acked");
    assert.equal(result.command_id,id);
    assert.equal(count(),1);
    assert.equal(after.age_limit_ms,2000);
    if(["type_only","return_original_id","late_replacement"].includes(mode)){
      assert.equal(reply.images.length,1);
      if(mode==="late_replacement")assert.ok(Number(reply.age)<2000);
      else assert.equal(reply.age,"1999.75");
      const proof=record(after.after_command);
      assert.equal(record(after.metadata).frame_id,replacement??frame.frame_id);
      assert.equal(proof.command_id,id);
      assert.equal(proof.minimum_gap_ms,300);
      assert.ok(Number(proof.lower_gap_ms)>(submitEnter?300:0));
      if(mode==="late_replacement")assert.equal(record(after.recovery).retry_trigger,"late_image_release");
    }else{
      assert.equal(reply.images.length,0);
      assert.equal(after.metadata,null);
      if(mode==="at_release_limit")assert.equal(after.release_failure,"frame_expired");
      if(mode==="old_boot")assert.equal(after.reason,"AFTER_COMMAND_SCOPE_CHANGED");
      if(mode==="before_return_floor")assert.equal(after.reason,"WAITING_POST_COMMAND_FRAME");
    }
  });
});

test("software: a verified text after-image supplies the next action without repeating the text command",async t=>{
  for(const mode of ["next_text","next_click"] as const)await t.test(mode,async()=>{
    const {l,r,id,args,count,setAge}=await focusedTextAfterFixture(false);
    l.tick(400);
    const {meta:frame}=await capturedAtPhoneMono(l,r,10400,2,{source_seq:2});
    setAge(frame.frame_id,1700);
    const noWait=await liveMcp(l.service,"type_text_in_field",{...args,wait_ms:0});
    assert.equal(noWait.images.length,0);
    assert.equal(noWait.result.structuredContent.command_id,id);
    assert.equal(record(noWait.result.structuredContent.after_screen).reason,"OBSERVATION_BUDGET_EXHAUSTED");
    const receiptOnly=await liveMcp(l.service,"type_text_in_field",{...args,wait_ms:600,observe_after:false});
    assert.equal(receiptOnly.images.length,0);
    assert.equal(receiptOnly.result.structuredContent.command_id,id);
    assert.equal(record(receiptOnly.result.structuredContent.after_screen).state,"not_requested");
    const verified=await liveMcp(l.service,"type_text_in_field",{...args,wait_ms:600});
    assert.equal(verified.images.length,1);
    assert.equal(verified.age,"1700");
    assert.equal(verified.result.structuredContent.command_id,id);
    assert.equal(count(),1);
    const metadata=record(record(verified.result.structuredContent.after_screen).metadata);
    const nextBase={device_id:metadata.device_id,idempotency_key:uid(),wait_ms:0,observe_after:false};
    if(mode==="next_text"){
      const next=await liveMcp(l.service,"type_text_in_field",{...args,...nextBase,text:"another field"});
      assert.notEqual(next.result.structuredContent.command_id,id);
      assert.equal(record(next.result.structuredContent.payload).source_frame_id,undefined);
    }else{
      const next=await liveMcp(l.service,"click_at",{...nextBase,source_frame_id:metadata.frame_id,x:7,y:15,
        image_width:metadata.width,image_height:metadata.height,orientation_epoch:metadata.orientation_epoch});
      assert.equal(next.result.isError,false,JSON.stringify(next.result.structuredContent));
      const move=l.db.raw.prepare("SELECT precondition FROM sb_mouse_commands WHERE id=?").get(String(next.result.structuredContent.move_command_id));
      assert.ok(move);assert.equal(JSON.parse(String(move.precondition)).source_frame_id,frame.frame_id);
    }
    assert.equal(count(),mode==="next_click"?3:2);
  });
});

async function scrollAfterFixture(l:ReturnType<typeof lab>){
  const r=await mouseReady(l),boot=r.hardware.board_boot_id;
  await capturedAtPhoneMono(l,r,9999,1,{source_seq:1});
  const args={device_id:r.actor.id,steps:-6,idempotency_key:uid(),wait_ms:0,settle_ms:300};
  const pending=await r.mouse.enqueue(alice,"pointer.scroll",args),id=pending.command_id;
  assert.deepEqual(pending.payload,{steps:-6});
  await r.mouse.claim(r.actor,r.identity,0);
  await r.mouse.start(r.actor,id,{...r.identity,control_epoch:pending.control_epoch});
  await r.mouse.result(r.actor,id,{...r.identity,state:"board_acked",finished_client_mono_ms:10050,
    board_receipt:{command_id:id,board_boot_id:boot,state:"executed",subcommand_index:0,effect:{hid_reports_sent:true}}});
  return {r,args,id,count:()=>l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n};
}

test("software: default wheel after-image can arrive beyond the old 600 ms window without repeating the wheel",async()=>{
  let mono=0,frameID:string|undefined,publish:undefined|(()=>Promise<string>);
  const l=lab(false,{now:()=>mono,sleep:async ms=>{
    mono+=ms;l.tick(ms);
    if(mono>=1100&&publish&&!frameID)frameID=await publish();
  }});
  const {r,args,id,count}=await scrollAfterFixture(l);
  publish=async()=>(await capturedAtPhoneMono(l,r,10000+mono,2,{source_seq:2})).meta.frame_id;
  const explicit=await liveMcp(l.service,"scroll_mouse",{...args,wait_ms:300});
  assert.equal(explicit.images.length,0);
  assert.equal(explicit.result.structuredContent.state,"board_acked");
  assert.equal(explicit.result.structuredContent.command_id,id);
  assert.ok(Number(record(explicit.result.structuredContent.after_screen).wait_budget_ms)<=300);
  const before=mono,{wait_ms:_wait,...defaultArgs}=args;
  const observed=await liveMcp(l.service,"scroll_mouse",defaultArgs),after=record(observed.result.structuredContent.after_screen);
  assert.equal(observed.images.length,1);
  assert.equal(observed.result.structuredContent.command_id,id);
  assert.equal(record(after.metadata).frame_id,frameID);
  assert.equal(record(after.after_command).command_id,id);
  assert.equal(record(after.after_command).minimum_gap_ms,300);
  assert.ok(mono-before>600);
  assert.ok(Number(after.wait_budget_ms)>4500&&Number(after.wait_budget_ms)<=5000);
  assert.equal(count(),1);
});

test("software: wheel same-call JPEG has an exact 2s age limit and original live board scope",async t=>{
  for(const mode of ["under_limit","at_snapshot_limit","at_release_limit","old_boot","late_replacement","receipt_only"] as const)await t.test(mode,async()=>{
    let mono=0;
    const l=lab(false,{now:()=>mono,sleep:async ms=>{mono+=ms;l.tick(ms);}}),{r,args,id,count}=await scrollAfterFixture(l);
    l.tick(400);
    const {meta:frame}=await capturedAtPhoneMono(l,r,10400,2,{source_seq:2});
    const setAge=l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE frame_id=?");
    setAge.run(l.now()-1001,frame.frame_id);
    const standalone=await liveMcp(l.service,"read_screen",{device_id:r.actor.id,wait_for_new_ms:0,max_age_ms:1000});
    assert.equal(standalone.images.length,0);
    setAge.run(l.now()-(mode==="at_snapshot_limit"?2000:mode==="late_replacement"?1990:1999.75),frame.frame_id);
    if(mode==="old_boot")l.db.raw.prepare("UPDATE sb_hardware SET board_boot_id=? WHERE device_id=?").run(uid(),r.actor.id);
    let replacement:string|undefined;
    const clock=mode==="at_release_limit"?async()=>{l.tick(.25);return true;}:
      mode==="late_replacement"?async()=>{
        if(!replacement){l.tick(20);replacement=(await capturedAtPhoneMono(l,r,10420,3,{source_seq:3})).meta.frame_id;}
        return true;
      }:undefined;
    const reply=await liveMcp(l.service,"scroll_mouse",{...args,wait_ms:600,observe_after:mode!=="receipt_only"},()=>{},clock);
    const result=reply.result.structuredContent,after=record(result.after_screen);
    assert.equal(result.command_id,id);
    assert.equal(result.state,"board_acked");
    assert.equal(result.app_effect_observed,false);
    assert.equal(count(),1);
    if(mode==="receipt_only"){
      assert.equal(after.state,"not_requested");
      assert.equal(reply.images.length,0);
      return;
    }
    assert.equal(after.age_limit_ms,2000);
    if(mode==="under_limit"||mode==="late_replacement"){
      assert.equal(reply.images.length,1);
      assert.equal(record(after.metadata).frame_id,replacement??frame.frame_id);
      assert.equal(record(after.after_command).command_id,id);
      assert.ok(Number(record(after.after_command).lower_gap_ms)>300);
      if(mode==="under_limit")assert.equal(reply.age,"1999.75");
      else assert.equal(record(after.recovery).retry_trigger,"late_image_release");
    }else{
      assert.equal(reply.images.length,0);
      assert.equal(after.metadata,null);
      if(mode==="at_release_limit")assert.equal(after.release_failure,"frame_expired");
      if(mode==="old_boot")assert.equal(after.reason,"AFTER_COMMAND_SCOPE_CHANGED");
    }
  });
});

test("software: the default wheel after-image deadline keeps the receipt when its release clock stalls",async t=>{
  t.mock.timers.enable({apis:["setTimeout"]});
  const l=lab(),{r,args,id,count}=await scrollAfterFixture(l);
  l.tick(400);await capturedAtPhoneMono(l,r,10400,2,{source_seq:2});
  let start!:()=>void,finish!:()=>void,checks=0;
  const started=new Promise<void>(resolve=>{start=resolve;}),pending=new Promise<void>(resolve=>{finish=resolve;});
  const {wait_ms:_wait,...defaultArgs}=args;
  const response=liveMcp(l.service,"scroll_mouse",defaultArgs,()=>{},async()=>{
    checks++;start();await pending;return true;
  });
  await started;
  t.mock.timers.tick(5000);
  const observed=await response,result=observed.result.structuredContent;
  assert.equal(observed.images.length,0);
  assert.equal(result.state,"board_acked");
  assert.equal(result.command_id,id);
  assert.equal(record(result.after_screen).release_failure,"deadline_expired");
  finish();await Promise.resolve();
  assert.equal(count(),1);
  assert.equal(checks,1);
});

test("software: paced wheel result validates same-scope count and archives a partial receipt without replay",async t=>{
  for(const mode of ["complete","partial","completed_before_terminal_expiry"] as const)await t.test(mode,async()=>{
    const succeeded=mode==="complete",allPulses=mode!=="partial";
    const l=lab(),r=await mouseReady(l),boot=r.hardware.board_boot_id;
    await capturedAtPhoneMono(l,r,9999,1,{source_seq:1});
    const args={device_id:r.actor.id,steps:-6,idempotency_key:uid(),wait_ms:0,settle_ms:300};
    const queued=await r.mouse.enqueue(alice,"pointer.scroll",args),id=queued.command_id;
    const claim=await r.mouse.claimRequest(new Request("https://test.example/v1/device/mouse/commands/claim",
      {headers:{Authorization:"Bearer "+r.token}}),async()=>({body:{...r.identity,control_epoch:queued.control_epoch,
        raw_dispatch_protocol:RAW_MOUSE_DISPATCH},waitMS:0}));
    assert.equal(claim?.state,"executing");
    assert.equal(claim.command_id,id);
    assert.equal(record(claim).raw_dispatch_protocol,RAW_MOUSE_DISPATCH);
    const effect={hid_reports_sent:allPulses,wheel_reports_sent:allPulses?6:2,wheel_units_sent:allPulses?-6:-2};
    const receipt={command_id:id,board_boot_id:boot,subcommand_index:0,state:succeeded?"executed":"outcome_unknown",
      error:allPulses?null:"INPUT_NOT_CONFIRMED_OR_EXPIRED",started_uptime_ms:1000,finished_uptime_ms:1120,effect};
    const body={...r.identity,board_receipt:receipt,...(succeeded?{state:"board_acked",finished_client_mono_ms:10050}:
      {state:"outcome_unknown",input_submitted:true,error:"USB_OUTCOME_UNKNOWN"})};
    const result=(packet:Record<string,unknown>,token=r.token)=>r.mouse.resultRequest(new Request(
      "https://test.example/v1/device/mouse/commands/"+id+"/result",{headers:{Authorization:"Bearer "+token}}),id,async()=>packet);
    await assert.rejects(result(body,"x".repeat(43)),/UNAUTHENTICATED/);
    await assert.rejects(result({...body,board_receipt:{...receipt,effect:{...effect,wheel_units_sent:-7,wheel_reports_sent:7}}}),/INVALID_WHEEL_RECEIPT/);
    if(!succeeded)await assert.rejects(result({...body,input_submitted:false}),/INVALID_WHEEL_RECEIPT/);
    if(!succeeded&&allPulses){
      await assert.rejects(result({...body,state:"board_acked",error:null,finished_client_mono_ms:10050}),/INVALID_BOARD_RECEIPT/);
      await assert.rejects(result({...body,board_receipt:{...receipt,effect:{...effect,wheel_units_sent:-2,wheel_reports_sent:2}}}),/INVALID_WHEEL_RECEIPT/);
    }
    const accepted=await result(body);
    assert.equal(accepted.command_id,id);
    assert.equal(accepted.state,succeeded?"board_acked":"outcome_unknown");
    assert.equal(accepted.receipt_observation.valid_for_capture_order,succeeded);
    assert.deepEqual(accepted.board_receipt,receipt);
    assert.deepEqual((await result(body)).board_receipt,receipt);
    l.tick(400);await capturedAtPhoneMono(l,r,10400,2,{source_seq:2});
    const observed=await liveMcp(l.service,"scroll_mouse",{...args,wait_ms:500});
    assert.equal(observed.result.structuredContent.command_id,id);
    assert.equal(observed.images.length,succeeded?1:0);
    assert.deepEqual((await r.mouse.get(alice,id)).board_receipt,receipt);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
  });
});

async function originalWheelFixture(l:ReturnType<typeof lab>,settle:number|null|undefined){
  const r=await mouseReady(l);
  await capturedAtPhoneMono(l,r,9999,1,{source_seq:1});
  const args={device_id:r.actor.id,steps:6,idempotency_key:uid(),wait_ms:0,
    ...(typeof settle==="number"?{settle_ms:settle}:{})};
  const queued=settle===null?await r.mouse.enqueue(alice,"pointer.scroll",args):
    (await liveMcp(l.service,"scroll_mouse",args)).result.structuredContent;
  const id=String(queued.command_id),boot=r.hardware.board_boot_id;
  const claim=await r.mouse.claimRequest(new Request("https://test.example/v1/device/mouse/commands/claim",
    {headers:{Authorization:"Bearer "+r.token}}),async()=>({body:{...r.identity,control_epoch:queued.control_epoch,
      raw_dispatch_protocol:RAW_MOUSE_DISPATCH},waitMS:0}));
  assert.equal(claim?.command_id,id);
  assert.equal(claim.state,"executing");
  assert.deepEqual(claim.payload,{steps:6});
  assert.deepEqual(claim.precondition,settle===null?null:{capture_min_gap_ms:settle??0});
  const result=(partial=false)=>r.mouse.result(r.actor,id,{...r.identity,
    ...(partial?{state:"outcome_unknown",input_submitted:true,error:"USB_OUTCOME_UNKNOWN"}:
      {state:"board_acked",finished_client_mono_ms:10050}),
    board_receipt:{command_id:id,board_boot_id:boot,subcommand_index:0,state:partial?"outcome_unknown":"executed",
      error:null,started_uptime_ms:1000,finished_uptime_ms:1120,
      effect:{hid_reports_sent:true,wheel_reports_sent:6,wheel_units_sent:6}}});
  return {r,args,id,result};
}

test("software: original wheel relook follows an executing reverse scroll through its signed ACK and fresh JPEG",async()=>{
  // This boundary fixture intentionally excludes source-proof signing.
  const l=lab(false,undefined,new FrameUploadPermits()),{r,args,id,result}=await originalWheelFixture(l,520);
  const maintenance:(()=>Promise<void>)[]=[];
  l.service.scheduleBackground=(_delay,job)=>{maintenance.push(job);return true;};
  const lookup={command_id:id,include_after_screen:true};
  const before=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  const pending=await liveMcp(l.service,"get_mouse_result",lookup);
  assert.equal(pending.result.structuredContent.command_id,id);
  assert.equal(pending.result.structuredContent.state,"executing");
  assert.equal(record(pending.result.structuredContent.after_screen).state,"pending_input");
  assert.equal(pending.images.length,0);
  assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,before);
  await result();
  l.tick(800);
  const {meta:frame}=await capturedAtPhoneMono(l,r,10700,2,{source_seq:2});
  l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE frame_id=?").run(l.now()-1999.75,frame.frame_id);
  const changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  const statements:string[]=[];
  const prepare=l.db.prepare.bind(l.db);
  l.db.prepare=sql=>{statements.push(sql);return prepare(sql);};
  const reply=await liveMcp(l.service,"get_mouse_result",lookup);
  const observed=reply.result.structuredContent,after=record(observed.after_screen),proof=record(after.after_command);
  assert.equal(reply.result.isError,false);
  assert.equal(observed.command_id,id);
  assert.equal(observed.state,"board_acked");
  assert.equal(reply.images.length,1);
  assert.equal(reply.age,"1999.75");
  assert.equal(record(after.metadata).frame_id,frame.frame_id);
  assert.equal(proof.command_id,id);
  assert.equal(proof.phone_ack_mono_ms,10050);
  assert.equal(proof.minimum_gap_ms,520);
  assert.equal(proof.scope_matches_at_snapshot,true);
  const compact=JSON.parse(reply.result.content.find(item=>item.type==="text")!.text!);
  assert.equal(compact.after_screen.metadata.frame_id,frame.frame_id);
  assert.equal(compact.after_screen.metadata.frame_seq,2);
  assert.equal(compact.after_screen.after_command.command_id,id);
  assert.equal(compact.after_screen.after_command.minimum_gap_ms,520);
  assert.ok(Number(after.wait_budget_ms)>4500&&Number(after.wait_budget_ms)<=5000);
  const atLimit=await liveMcp(l.service,"get_mouse_result",lookup,()=>{},async()=>{l.tick(.25);return true;});
  assert.equal(atLimit.images.length,0);
  assert.equal(record(atLimit.result.structuredContent.after_screen).release_failure,"frame_expired");
  assert.ok(statements.length>=4);
  assert.ok(statements.every(sql=>/^\s*(SELECT|WITH)\b/i.test(sql)&&!/\b(INSERT|UPDATE|DELETE)\b/i.test(sql)));
  assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
  const replay=await liveMcp(l.service,"scroll_mouse",{...args,settle_ms:0});
  assert.equal(replay.result.structuredContent.command_id,id);
  assert.deepEqual(replay.result.structuredContent.precondition,{capture_min_gap_ms:520});
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
});

test("software: original wheel relook preserves saved settle, legacy fallback and live receipt barriers",async t=>{
  for(const mode of ["legacy","saved_zero","equal_gap","under_legacy_gap","changed_boot","changed_control","wrong_owner",
    "expired_pending","terminal_uncertainty","missing_receipt_digest","click_only_gap"] as const)await t.test(mode,async()=>{
    let mono=0;
    const l=lab(false,{now:()=>mono,sleep:async ms=>{mono+=ms;l.tick(ms);}});
    const legacy=mode==="legacy"||mode==="under_legacy_gap";
    const {r,id,result}=await originalWheelFixture(l,legacy?null:mode==="saved_zero"?undefined:520);
    if(mode!=="expired_pending")await result(mode==="terminal_uncertainty");
    l.tick(800);
    await capturedAtPhoneMono(l,r,mode==="equal_gap"?10570:mode==="under_legacy_gap"?10349:mode==="saved_zero"?10080:10700,2,{source_seq:2});
    if(mode==="changed_boot")l.db.raw.prepare("UPDATE sb_hardware SET board_boot_id=?").run(uid());
    if(mode==="changed_control")l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");
    if(mode==="expired_pending")l.tick(5100);
    if(mode==="missing_receipt_digest")l.db.raw.prepare("UPDATE sb_mouse_commands SET result_digest=NULL WHERE id=?").run(id);
    const before=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
    const reply=await liveMcp(l.service,"get_mouse_result",{command_id:id,include_after_screen:true,
      ...(mode==="click_only_gap"?{after_command_min_gap_ms:300}:{})},()=>{},undefined,mode==="wrong_owner"?bob:alice);
    const resultValue=reply.result.structuredContent;
    const success=mode==="legacy"||mode==="saved_zero";
    assert.equal(reply.images.length,success?1:0);
    if(mode==="wrong_owner"||mode==="click_only_gap")assert.equal(resultValue.error,mode==="wrong_owner"?"NOT_FOUND":"INVALID_ARGUMENTS");
    else{
      assert.equal(resultValue.command_id,id);
      assert.equal(resultValue.state,mode==="expired_pending"?"executing":mode==="terminal_uncertainty"?"outcome_unknown":"board_acked");
      const after=record(resultValue.after_screen);
      if(success)assert.equal(record(after.after_command).minimum_gap_ms,legacy?300:0);
      else assert.notEqual(after.state,"available");
    }
    assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,before);
  });
});

test("software: original wheel relook stops a stalled image read at five seconds with its receipt",async t=>{
  t.mock.timers.enable({apis:["setTimeout"]});
  const l=lab(),{id,result}=await originalWheelFixture(l,300);
  const confirmed=await result();
  let started!:()=>void,signal:AbortSignal|undefined;
  const start=new Promise<void>(resolve=>{started=resolve;});
  l.service.readActionAfterScreen=async(...args)=>{
    signal=args[3]?.signal;
    started();
    return new Promise<never>(()=>{});
  };
  const response=liveMcp(l.service,"get_mouse_result",{command_id:id,include_after_screen:true});
  await start;
  assert.equal(signal?.aborted,false);
  t.mock.timers.tick(5000);
  const reply=await response,observed=reply.result.structuredContent;
  assert.equal(signal?.aborted,true);
  assert.equal(observed.command_id,id);
  assert.equal(observed.state,"board_acked");
  assert.deepEqual(observed.board_receipt,confirmed.board_receipt);
  assert.equal(record(observed.after_screen).reason,"OBSERVATION_BUDGET_EXHAUSTED");
  assert.equal(reply.images.length,0);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
});

async function realDragFixture(appReady=true,statusMask=false,orientation="portrait"){
  const l=lab(),r=await mouseReady(l);
  const caps={...r.hardware.capabilities,"hid.mouse.absolute":true,"hid.mouse.drag_absolute":true,
    "sayso.drag_at":appReady,"hid.mouse.drag_absolute.v2":true,"sayso.action_geometry.v1":appReady,"sayso.drag_model_decision.v1":true,"sayso.drag_cloud_acceptance.v1":true,"sayso.drag_status_mask.v1":statusMask};
  const led=new LEDControl(l.service);
  await led.bind(r.actor,{...r.identity,...r.hardware,capabilities:caps});
  await l.service.heartbeat(r.actor,r.beat);
  const {meta:source}=await capturedAtPhoneMono(l,r,9999,1,{source_seq:1,orientation});
  const args={device_id:r.actor.id,source_frame_id:source.frame_id,from_x:2,from_y:4,to_x:12,to_y:28,
    image_width:16,image_height:32,orientation_epoch:0,idempotency_key:uid(),wait_ms:0};
  return {l,r,caps,led,args,source,count:()=>l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n};
}

test("software: real drag validates one reviewed source and one signed release before returning a strict same-scope after-image",async()=>{
  const {l,r,args,source,count}=await realDragFixture();
  assert.equal((await r.mouse.status(alice,{device_id:r.actor.id})).drag_at_ready,true);
  const admitted=await liveMcp(l.service,"drag_at",args),queued=admitted.result.structuredContent,id=String(queued.command_id);
  assert.equal(queued.kind,"pointer.drag_absolute");
  assert.equal(queued.state,"queued");
  assert.deepEqual(queued.payload,{from_x:Math.round(2/15*32767),from_y:Math.round(4/31*32767),
    to_x:Math.round(12/15*32767),to_y:Math.round(28/31*32767),duration_ms:350});
  assert.deepEqual(queued.precondition,{coordinate_space:"full_screen_image_pixels",source_from_x:2,source_from_y:4,
    source_to_x:12,source_to_y:28,source_width:16,source_height:32,orientation_epoch:0,
    source_frame_id:source.frame_id,capture_min_gap_ms:300,capture_width:source.native_width_px,
    capture_height:source.native_height_px,orientation:"portrait",drag_review_mode:"model_decision.v1",
    drag_source_confirmation:"server_accepted_geometry.v1",drag_source_sha256:source.content_sha256,drag_source_seq:1,drag_source_frame_seq:1});
  assert.equal(count(),1);
  const replay=await liveMcp(l.service,"drag_at",args);
  assert.equal(replay.result.structuredContent.command_id,id);
  const conflict=await liveMcp(l.service,"drag_at",{...args,duration_ms:500});
  assert.equal(conflict.result.structuredContent.error,"IDEMPOTENCY_CONFLICT");
  l.tick(80);await capturedAtPhoneMono(l,r,10080,2,{source_seq:2});
  const claim=await r.mouse.claimRequest(new Request("https://test.example/v1/device/mouse/commands/claim",
    {headers:{Authorization:"Bearer "+r.token}}),async()=>({body:{...r.identity,control_epoch:queued.control_epoch,
      raw_dispatch_protocol:RAW_MOUSE_DISPATCH},waitMS:0}));
  assert.equal(claim?.command_id,id);
  assert.equal(claim?.state,"executing");
  assert.deepEqual(claim?.precondition,queued.precondition);
  const boot=r.hardware.board_boot_id,receipt={command_id:id,board_boot_id:boot,subcommand_index:0,state:"executed",
    error:null,started_uptime_ms:1000,finished_uptime_ms:1350,effect:{hid_reports_sent:true}};
  const packet={...r.identity,state:"board_acked",finished_client_mono_ms:10450,board_receipt:receipt};
  for(const malformed of [{...receipt,board_boot_id:uid()},{...receipt,state:"failed"},{...receipt,subcommand_index:1}]){
    await assert.rejects(r.mouse.result(r.actor,id,{...packet,board_receipt:malformed}),/INVALID_.*RECEIPT/);
  }
  const ack=await r.mouse.result(r.actor,id,packet);
  assert.equal(ack.state,"board_acked");
  l.tick(720);
  const {meta:after}=await capturedAtPhoneMono(l,r,10800,3,{source_seq:3});
  const setAge=l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE frame_id=?");
  setAge.run(l.now()-1999.75,after.frame_id);
  const observed=await liveMcp(l.service,"drag_at",{...args,wait_ms:500});
  assert.equal(observed.images.length,1);
  assert.equal(observed.age,"1999.75");
  assert.equal(observed.result.structuredContent.command_id,id);
  const observation=record(observed.result.structuredContent.after_screen),proof=record(observation.after_command);
  assert.equal(record(observation.metadata).frame_id,after.frame_id);
  assert.equal(proof.command_id,id);
  assert.equal(proof.minimum_gap_ms,300);
  assert.equal(proof.lower_gap_ms,350);
  assert.equal(observed.result.structuredContent.app_effect_observed,false);
  assert.equal(record(observed.result.structuredContent.image_handoff).source_frame_id,after.frame_id);
  assert.equal(record(observed.result.structuredContent.image_handoff).source_after_command_id,id);
  const original=await liveMcp(l.service,"get_mouse_result",{command_id:id,include_after_screen:true});
  assert.equal(original.images.length,1);
  assert.equal(original.result.structuredContent.command_id,id);
  for(const reply of [observed,original]){
    const compact=JSON.parse(reply.result.content.find(item=>item.type==="text")!.text!);
    assert.equal(compact.after_screen.metadata.frame_id,after.frame_id);
    assert.equal(compact.after_screen.after_command.command_id,id);
    assert.equal(compact.after_screen.after_command.lower_gap_ms,350);
  }
  const releasedAtLimit=await liveMcp(l.service,"drag_at",{...args,wait_ms:500},()=>{},async()=>{l.tick(.25);return true;});
  assert.equal(releasedAtLimit.images.length,0);
  assert.equal(releasedAtLimit.result.structuredContent.image_handoff,undefined);
  assert.equal(releasedAtLimit.result.structuredContent.command_id,id);
  assert.equal(record(releasedAtLimit.result.structuredContent.after_screen).release_failure,"frame_expired");
  assert.equal(JSON.parse(releasedAtLimit.result.content.find(item=>item.type==="text")!.text!).after_screen,undefined);
  assert.equal(count(),1);
});

test("software: direct absolute USB drag returns a reusable after-image without calibration",async()=>{
  const {l,r,caps,led,args,count}=await realDragFixture();
  await led.bind(r.actor,{...r.identity,...r.hardware,capabilities:{...caps,"hid.mouse.drag_absolute.v2":true,"sayso.action_geometry.v1":true}});
  await l.service.heartbeat(r.actor,r.beat);
  const status=await r.mouse.status(alice,{device_id:r.actor.id});
  assert.equal(record(status.capabilities)["hid.mouse.drag_absolute.v2"],true);
  assert.equal(status.drag_at_ready,true);assert.equal("drag_calibrated_duration_ms" in status,false);
  assert.equal(await r.mouse.claim(r.actor,{...r.identity,control_epoch:status.control_epoch,
    raw_dispatch_protocol:RAW_MOUSE_DISPATCH,point_protocol:PAIRED_MOUSE_POINT},0),null);
  const admitted=await liveMcp(l.service,"drag_at",args),queued=admitted.result.structuredContent,id=String(queued.command_id);
  assert.equal((await r.mouse.claim(r.actor,r.identity,0))?.command_id,id);
  await r.mouse.start(r.actor,id,{...r.identity,control_epoch:queued.control_epoch});
  const payload=record(queued.payload);
  const receipt={command_id:id,board_boot_id:r.hardware.board_boot_id,subcommand_index:0,state:"executed",error:null,
    started_uptime_ms:1000,finished_uptime_ms:1600,effect:{hid_reports_sent:true,absolute_drag_v2:true,all_released:true,
      button_report_id:2,position_report_id:3,motion_reports_sent:Math.ceil(Number(payload.duration_ms)/24),final_x:payload.to_x,final_y:payload.to_y}};
  const body={...r.identity,state:"board_acked",input_submitted:true,finished_client_mono_ms:10450,board_receipt:receipt};
  const ack=await r.mouse.result(r.actor,id,body);assert.equal(ack.state,"board_acked");
  assert.deepEqual((await r.mouse.result(r.actor,id,body)).board_receipt,receipt);
  l.tick(800);const {meta:after}=await capturedAtPhoneMono(l,r,10800,2,{source_seq:2});
  const observed=await liveMcp(l.service,"drag_at",{...args,wait_ms:500});
  assert.equal(observed.images.length,1);
  assert.equal(record(observed.result.structuredContent.image_handoff).source_frame_id,after.frame_id);
  assert.equal(observed.result.structuredContent.app_effect_observed,false);
  assert.equal(count(),1);
  // The next action consumes this released after-image; no read_screen call.
  const click=await liveMcp(l.service,"click_at",{device_id:r.actor.id,source_frame_id:after.frame_id,
    x:8,y:16,image_width:16,image_height:32,orientation_epoch:0,idempotency_key:uid(),wait_ms:0});
  assert.notEqual(click.result.isError,true,JSON.stringify(click.result.structuredContent));
  assert.ok(click.result.structuredContent.command_id);
});

test("software: current drag rejects missing readiness and geometry but permits changed pixels at claim and start",async t=>{
  for(const mode of ["app_missing","unknown_source","past_edge","empty","wrong_dimensions","stale_source","changed_pixel","changed_pixel_start","lost_capability"] as const)await t.test(mode,async()=>{
    const {l,r,caps,led,args,source,count}=await realDragFixture(mode!=="app_missing");
    const patch=mode==="unknown_source"?{source_frame_id:uid()}:mode==="past_edge"?{to_x:16}:
      mode==="empty"?{to_x:args.from_x,to_y:args.from_y}:mode==="wrong_dimensions"?{image_width:17}:{};
    if(mode==="stale_source")l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE frame_id=?").run(l.now()-2000,source.frame_id);
    const reply=await liveMcp(l.service,"drag_at",{...args,...patch}),queued=reply.result.structuredContent;
    if(mode!=="changed_pixel"&&mode!=="changed_pixel_start"&&mode!=="lost_capability"){
      assert.equal(reply.result.isError,true);
      assert.equal(count(),0);
      return;
    }
    assert.equal(queued.state,"queued");
    const id=String(queued.command_id);
    if(mode==="changed_pixel_start")assert.equal((await r.mouse.claim(r.actor,r.identity,0))?.state,"claimed");
    if(mode==="lost_capability")await led.bind(r.actor,{...r.identity,...r.hardware,
      capabilities:{...caps,"sayso.drag_at":false}});
    else {
      l.tick(100);
      const bytes=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,123)},65).data;
      await capturedAtPhoneMono(l,{...r,bytes},10100,2,{source_seq:2,content_sha256:await hash(bytes)});
    }
    if(mode==="changed_pixel_start")assert.equal((await r.mouse.start(r.actor,id,{...r.identity,control_epoch:queued.control_epoch})).command_id,id);
    else if(mode==="changed_pixel")assert.equal((await r.mouse.claim(r.actor,r.identity,0))?.command_id,id);
    else assert.equal(await r.mouse.claim(r.actor,r.identity,0),null);
    assert.equal(count(),1);
  });
});

test("software: a typed drag preflight proves no input only with an explicit false and no board receipt",async t=>{
  for(const error of ["DRAG_SOURCE_SCOPE_CHANGED","DRAG_CURRENT_FRAME_UNAVAILABLE","ROTATE_TO_PORTRAIT"])
  for(const expired of [false,true])await t.test(error+(expired?" after expiry":" current"),async()=>{
    const {l,r,args,count}=await realDragFixture();
    const queued=(await liveMcp(l.service,"drag_at",args)).result.structuredContent,id=String(queued.command_id);
    assert.equal((await r.mouse.claim(r.actor,r.identity,0))?.command_id,id);
    await r.mouse.start(r.actor,id,{...r.identity,control_epoch:queued.control_epoch});
    if(expired){
      l.tick(5001);
      assert.equal((await r.mouse.get(alice,id)).state,"outcome_unknown");
    }
    const body={...r.identity,state:"failed",error,input_submitted:false,board_receipt:{}};
    for(const contradiction of [{input_submitted:undefined},{input_submitted:true},{state:"outcome_unknown"},{board_receipt:{partial:true}}]){
      await assert.rejects(r.mouse.result(r.actor,id,{...body,...contradiction}),/NO_INPUT_PROOF_CONFLICT/);
    }
    const failed=await r.mouse.result(r.actor,id,body);
    assert.equal(failed.command_id,id);
    assert.equal(failed.state,"failed");
    assert.equal(failed.input_not_submitted,true);
    assert.equal(failed.input_attempted,false);
    assert.equal(failed.error,body.error);
    assert.equal((await r.mouse.result(r.actor,id,body)).input_not_submitted,true);
    assert.equal(count(),1);
  });
});

test("software: an uncertain real drag retains its original ID and fences further input until control stops",async()=>{
  const {l,r,args,count}=await realDragFixture();
  const admitted=await liveMcp(l.service,"drag_at",args),queued=admitted.result.structuredContent,id=String(queued.command_id);
  assert.equal((await r.mouse.claim(r.actor,r.identity,0))?.command_id,id);
  await r.mouse.start(r.actor,id,{...r.identity,control_epoch:queued.control_epoch});
  const uncertain=await r.mouse.result(r.actor,id,{...r.identity,state:"outcome_unknown",input_submitted:true,error:"USB_OUTCOME_UNKNOWN",
    board_receipt:{command_id:id,board_boot_id:r.hardware.board_boot_id,subcommand_index:0,state:"failed",error:"HID_SEND_FAILED",
      started_uptime_ms:1000,finished_uptime_ms:1350,effect:{hid_reports_sent:true}}});
  assert.equal(uncertain.state,"outcome_unknown");
  const read=await liveMcp(l.service,"get_mouse_result",{command_id:id,include_after_screen:true});
  assert.equal(read.result.structuredContent.command_id,id);
  assert.equal(read.images.length,0);
  const repeated=await liveMcp(l.service,"drag_at",args);
  assert.equal(repeated.result.structuredContent.command_id,id);
  const next=await liveMcp(l.service,"drag_at",{...args,idempotency_key:uid()});
  assert.equal(next.result.isError,true);
  assert.equal(count(),1);
  const stopped=await liveMcp(l.service,"stop_mouse",{device_id:r.actor.id});
  assert.equal(stopped.result.isError,false);
  assert.equal((await r.mouse.status(alice,{device_id:r.actor.id})).enabled,false);
  assert.equal((await r.mouse.get(alice,id)).state,"outcome_unknown");
});

test("software: the default focused-text after-image returns the receipt at 5s if its release clock stalls",async t=>{
  t.mock.timers.enable({apis:["setTimeout"]});
  const {l,r,id,args,count}=await focusedTextAfterFixture(true);
  l.tick(400);await capturedAtPhoneMono(l,r,10400,2,{source_seq:2});
  let start!:()=>void,finish!:()=>void,reads=0;
  const started=new Promise<void>(resolve=>{start=resolve;}),pending=new Promise<void>(resolve=>{finish=resolve;});
  const {wait_ms:_wait,...defaultArgs}=args;
  const response=liveMcp(l.service,"type_text_in_field",defaultArgs,()=>{},async()=>{
    reads++;start();await pending;return true;
  });
  await started;
  t.mock.timers.tick(5000);
  const observed=await response,result=observed.result.structuredContent;
  assert.equal(observed.images.length,0);
  assert.equal(result.state,"board_acked");
  assert.equal(result.command_id,id);
  assert.equal(record(result.after_screen).release_failure,"deadline_expired");
  finish();await Promise.resolve();
  assert.equal(count(),1);
  assert.equal(reads,1);
});

// Reproduce the dispatch-budget mechanism, not a claim about the unrecorded
// request timings in the physical failure. A slow move leaves its deadline
// almost spent before a separately admitted click reaches the phone.
async function lateCompoundClick(){
  const l=lab(),r=await mouseReady(l);await capturedAtPhoneMono(l,r,9999);
  l.db.raw.prepare("UPDATE sb_hardware SET metadata=? WHERE device_id=?").run(JSON.stringify({...r.hardware,capabilities:{...r.hardware.capabilities,"hid.mouse.absolute":true}}),r.actor.id);
  let monotonic=0;
  const controller=new MouseControl(l.service,{now:()=>monotonic,sleep:async ms=>{monotonic+=ms;}});
  const move=await controller.enqueue(alice,"pointer.move_absolute",{x:7,y:15,image_width:16,image_height:32,orientation_epoch:0,idempotency_key:uid(),wait_ms:0});
  await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,move.command_id,{...r.identity,control_epoch:move.control_epoch});
  l.tick(3500);
  const moveAck=await r.mouse.result(r.actor,move.command_id,{...r.identity,state:"board_acked",finished_client_mono_ms:10000,
    board_receipt:{command_id:move.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true,absolute_requested_x:move.payload.x,absolute_requested_y:move.payload.y}}});
  // Keep this software geometry fixture fresh at the later admission point.
  l.db.raw.prepare("UPDATE sb_frames SET capture_lower=?,expires_at=? WHERE device_id=?").run(l.now()-1,l.now()+10000,r.actor.id);
  const request={button:"left",idempotency_key:uid(),wait_ms:0},createdAt=l.now();
  const click=await controller.enqueue(alice,"pointer.click",request,1,moveAck);
  return {l,r,controller,move,moveAck,request,createdAt,click};
}

test("software: a late admitted compound click retains a usable dispatch budget of its own",async()=>{
  const c=await lateCompoundClick();c.l.tick(1100);
  await c.r.mouse.claim(c.r.actor,c.r.identity,0);
  const ready=await c.r.mouse.start(c.r.actor,c.click.command_id,{...c.r.identity,control_epoch:c.click.control_epoch});
  // This is the installed phone's conservative subtraction. Before the fix,
  // the inherited move expiry leaves 400ms: a 600ms start RTT rejects input.
  const phoneRemaining=Math.max(0,ready.ttl_remaining_ms-600);
  assert.ok(phoneRemaining>0,`MOUSE_DISPATCH_BUDGET_EXPIRED: ${ready.ttl_remaining_ms}ms minus 600ms RTT`);
  assert.equal(Date.parse(c.click.expires_at)-c.createdAt,5000);
  assert.ok(Date.parse(c.click.expires_at)>Date.parse(c.move.expires_at));
  c.l.tick(601); // Original move deadline has now elapsed; click is already admitted.
  const ack=await c.r.mouse.result(c.r.actor,c.click.command_id,{...c.r.identity,state:"board_acked",finished_client_mono_ms:15000,
    board_receipt:{command_id:c.click.command_id,board_boot_id:c.r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}}});
  assert.equal(ack.state,"board_acked");
  const again=await c.controller.enqueue(alice,"pointer.click",c.request,1,c.moveAck);
  assert.equal(again.command_id,c.click.command_id);assert.equal(again.expires_at,c.click.expires_at);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
});

test("software: compound retry never renews an admitted click or creates one from an expired move",async()=>{
  const c=await lateCompoundClick();c.l.tick(6000);
  const again=await c.controller.enqueue(alice,"pointer.click",c.request,1,c.moveAck);
  assert.equal(again.command_id,c.click.command_id);assert.equal(again.expires_at,c.click.expires_at);assert.equal(again.state,"expired");
  await assert.rejects(c.controller.enqueue(alice,"pointer.click",{...c.request,idempotency_key:uid()},10000,c.moveAck),/COMPOUND_DISPATCH_EXPIRED/);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
});

test("software: an admitted compound click still loses execution authority when control is revoked",async()=>{
  const c=await lateCompoundClick();c.l.tick(1600);
  c.l.db.raw.prepare("UPDATE sb_sessions SET mouse_enabled=0 WHERE id=?").run(c.r.identity.bridge_session_id);
  assert.equal(await c.r.mouse.claim(c.r.actor,c.r.identity,0),null);
  await assert.rejects(c.r.mouse.start(c.r.actor,c.click.command_id,{...c.r.identity,control_epoch:c.click.control_epoch}),/MOUSE_EXPIRED_OR_CONTROL_CHANGED/);
});

const rawDispatchProtocol="raw_mouse_claim_start.v1";

const fixtureReadyCue={text:"商品评价",region:{x:0.6,y:0.17,width:0.32,height:0.07},wait_ms:500};
const fixtureLoadingCue={...fixtureReadyCue,text:"加载中",mode:"loader_disappears" as const};
const fixtureMapCue={text:"GoogleMaps",region:{x:0.04,y:0.62,width:0.39,height:0.09},wait_ms:500,mode:"maps_tiles" as const};

async function pairedPhonePoint(claim=true, cue?:{supported:boolean;loader?:boolean;legacy?:boolean;maps?:boolean},l=lab(),minGap=300){
  const r=await mouseReady(l);
  const cueSpec=cue?.loader?fixtureLoadingCue:cue?.maps?fixtureMapCue:cue?fixtureReadyCue:undefined;
  const cueCapabilities={...(cue?.supported?{ready_cue_supported:true}:{}),
    ...(cue?.supported&&cue.loader&&!cue.legacy?{loading_cue_supported:true}:{}),
    ...(cue?.supported&&cue.maps&&!cue.legacy?{maps_tiles_cue_supported:true}:{})};
  l.db.raw.prepare("UPDATE sb_hardware SET metadata=? WHERE device_id=?").run(JSON.stringify({...r.hardware,capabilities:{...r.hardware.capabilities,"hid.mouse.absolute":true,"sayso.action_geometry.v1":true}}),r.actor.id);
  const control=(await r.mouse.status(alice,{})).control_epoch;
  const phone={...r.identity,control_epoch:control,raw_dispatch_protocol:rawDispatchProtocol,point_protocol:PAIRED_MOUSE_POINT};
  assert.equal(await r.mouse.claim(r.actor,phone,0),null);
  const {meta:pointSource}=await capturedAtPhoneMono(l,r,9999,1,{...cueCapabilities,source_seq:1});
  let mono=0;const controller=new MouseControl(l.service,{now:()=>mono,sleep:async ms=>{mono+=ms;}});
  const userKey=uid(),key="click-at:"+await hash(userKey),args={device_id:r.actor.id,source_frame_id:pointSource.frame_id,x:7,y:15,image_width:16,image_height:32,orientation_epoch:0,idempotency_key:userKey,wait_ms:0,
    ...(minGap===300?{}:{settle_ms:minGap}),
    ...(cueSpec?{after_ready_cue:cueSpec}:{})};
  const move=await controller.enqueue(alice,"pointer.move_absolute",{...args,idempotency_key:key+":move"},undefined,undefined,
    {clickKey:key+":click",captureMinGapMS:minGap,sourceFrameID:pointSource.frame_id,geometryOnly:true});
  const child=(move.precondition as Record<string,unknown>).point as Record<string,unknown>;assert.equal(child.protocol,PAIRED_MOUSE_POINT);
  const click=await r.mouse.get(alice,String(child.click_command_id));
  const granted=claim?await r.mouse.claim(r.actor,phone,0):null;
  const effect={hid_reports_sent:true,absolute_requested_x:move.payload.x,absolute_requested_y:move.payload.y};
  const body={...r.identity,state:"board_acked",input_submitted:true,error:null,finished_client_mono_ms:10000,
    board_receipt:{command_id:move.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect},
    point_result:{protocol:PAIRED_MOUSE_POINT,click:{state:"board_acked",input_submitted:true,error:null,finished_client_mono_ms:10050,
      board_receipt:{command_id:click.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}}}}};
  return {l,r,controller,phone,move,click,granted,body,args,key};
}

test("software: key recovery preserves the 300ms paired click_at default",async()=>{
  const c=await pairedPhonePoint(false);
  const args={...c.args,device_id:c.r.actor.id};
  const replay=await c.controller.clickAt(alice,args);
  assert.equal(replay.command_id,c.click.command_id);
  assert.equal(replay.settle_ms,300);
  c.l.db.raw.prepare("DELETE FROM sb_mouse_commands").run();
  const fresh=await c.controller.clickAt(alice,{...args,idempotency_key:uid()});
  assert.equal(fresh.settle_ms,300);
  assert.equal(fresh.move_result?.precondition?.point_capture_min_gap_ms,300);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
});

test("software: worker fetch timing stays scoped to its original click_at request",async()=>{
  const c=await pairedPhonePoint(false);
  const args={...c.args,device_id:c.r.actor.id};
  const entered=Date.now()-50;
  const timing=(value:Awaited<ReturnType<typeof liveMcp>>)=>
    record(record(value.result.structuredContent.trace).native_transport);
  const read=()=>liveMcp(c.l.service,"click_at",args);
  const observed=timing(await runWithBridgeContext({waitUntil:()=>{},workerFetchStartedUTC:entered},read));
  assert.equal(observed.worker_fetch_started_utc_ms,entered);
  assert.equal(observed.worker_fetch_to_handler_ms,Number(observed.handler_started_utc_ms)-entered);
  assert.equal(timing(await read()).worker_fetch_started_utc_ms,undefined);
  const reversed=timing(await runWithBridgeContext({waitUntil:()=>{},workerFetchStartedUTC:Number.MAX_SAFE_INTEGER},read));
  assert.equal(reversed.worker_fetch_started_utc_ms,undefined);
  const profile=timing(await runWithBridgeContext({waitUntil:()=>{},workerFetchStartedUTC:entered},
    ()=>liveMcp(c.l.service,"get_profile",{})));
  assert.equal(profile.worker_fetch_started_utc_ms,undefined);
});

test("software: a lost paired click_at response recovers the original receipt by raw key",async()=>{
  const c=await pairedPhonePoint();
  const catalogue=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list"})}),{
    engine:()=>c.l.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}},
  });
  const tools=record(record(await catalogue.json()).result).tools as unknown[];
  const schema=record(record(tools.find(tool=>record(tool).name==="get_mouse_result")).inputSchema);
  assert.equal(schema.type,"object");
  const properties=record(schema.properties);
  assert.deepEqual(Object.keys(properties).sort(),["after_command_min_gap_ms","click_at_idempotency_key","command_id",
    "device_id","image_format","include_after_screen"]);
  assert.deepEqual(record(properties.image_format).enum,["compact_png","original_jpeg"]);
  assert.deepEqual(schema.required,[]);
  assert.equal(Object.hasOwn(schema,"oneOf"),false);
  await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
  const read={device_id:c.r.actor.id,click_at_idempotency_key:c.args.idempotency_key};
  const changes=c.l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  const calls=c.l.db.requests;
  const {result,images}=await liveMcp(c.l.service,"get_mouse_result",read);
  assert.equal(c.l.db.requests-calls,1);
  assert.equal(c.l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
  assert.equal(result.isError,false);
  assert.equal(images.length,0);
  assert.equal(result.structuredContent.lookup_found,true);
  assert.equal(result.structuredContent.move_command_id,c.move.command_id);
  assert.equal(result.structuredContent.click_command_id,c.click.command_id);
  assert.equal(result.structuredContent.command_id,c.click.command_id);
  assert.equal(result.structuredContent.state,"board_acked");
  assert.equal(result.structuredContent.click_submitted,true);
  assert.equal(result.structuredContent.input_not_submitted,false);
  assert.deepEqual(result.structuredContent.board_receipt,c.body.point_result.click.board_receipt);
  const alias={command_id:`click-at-key:${read.device_id}:${read.click_at_idempotency_key}`};
  const aliasCalls=c.l.db.requests;
  const byAlias=await liveMcp(c.l.service,"get_mouse_result",alias);
  assert.equal(c.l.db.requests-aliasCalls,1);
  assert.equal(byAlias.images.length,0);
  assert.equal(byAlias.result.structuredContent.lookup_found,true);
  assert.equal(byAlias.result.structuredContent.move_command_id,c.move.command_id);
  assert.equal(byAlias.result.structuredContent.click_command_id,c.click.command_id);
  assert.deepEqual(byAlias.result.structuredContent.board_receipt,c.body.point_result.click.board_receipt);
  const foreignAlias=(await liveMcp(c.l.service,"get_mouse_result",alias,()=>{},undefined,bob)).result;
  assert.equal(foreignAlias.structuredContent.lookup_found,false);
  assert.equal(foreignAlias.structuredContent.state,"outcome_unknown");
  const byID=(await liveMcp(c.l.service,"get_mouse_result",{command_id:c.click.command_id})).result;
  assert.deepEqual(result.structuredContent.receipt_observation,byID.structuredContent.receipt_observation);
  assert.deepEqual(result.structuredContent.board_receipt,byID.structuredContent.board_receipt);
  assert.equal(byID.structuredContent.click_at_idempotency_key_sha256,await hash(c.args.idempotency_key));
  assert.equal(Object.hasOwn(await c.controller.get(alice,c.click.command_id),"click_at_idempotency_key_sha256"),false);
  assert.equal((await liveMcp(c.l.service,"get_mouse_result",{command_id:c.move.command_id})).result.structuredContent.click_at_idempotency_key_sha256,undefined);
  const foreign=(await liveMcp(c.l.service,"get_mouse_result",{command_id:c.click.command_id},()=>{},undefined,bob)).result;
  assert.equal(foreign.isError,true);
  assert.equal(foreign.structuredContent.click_at_idempotency_key_sha256,undefined);
  assert.equal(c.l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
  for(const args of [
    {},
    {include_after_screen:false},
    {...alias,include_after_screen:true},
    {...alias,device_id:read.device_id},
    {command_id:`click-at-key:${read.device_id}:`},
    {click_at_idempotency_key:read.click_at_idempotency_key},
    {device_id:read.device_id},
    {...read,command_id:c.click.command_id},
    {...read,include_after_screen:true},
  ]){
    const invalid=(await liveMcp(c.l.service,"get_mouse_result",args)).result;
    assert.equal(invalid.isError,true);
    assert.equal(invalid.structuredContent.error,"INVALID_ARGUMENTS");
  }
});

test("software: original click relook returns a strictly later scoped JPEG with no database mutations",async()=>{
  let mono=0;
  const l=lab(false,{now:()=>mono,sleep:async ms=>{mono+=ms;l.tick(ms);}});
  const c=await pairedPhonePoint(true,undefined,l,520);
  const realReceipt={...c.body.point_result.click.board_receipt,subcommand_index:0,error:null};
  c.body.point_result.click.board_receipt=realReceipt;
  await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
  l.tick(2400);
  const {meta:frame}=await capturedAtPhoneMono(l,c.r,12350,2,{source_seq:2});
  l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE frame_id=?").run(l.now()-1999.75,frame.frame_id);
  const changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  const statements:string[]=[];
  const prepare=l.db.prepare.bind(l.db);
  l.db.prepare=sql=>{statements.push(sql);return prepare(sql);};
  const args={command_id:c.click.command_id,include_after_screen:true,after_command_min_gap_ms:2200};
  const first=await liveMcp(l.service,"get_mouse_result",args);
  const result=first.result.structuredContent,after=record(result.after_screen),proof=record(after.after_command);
  assert.equal(first.result.isError,false);
  assert.equal(result.command_id,c.click.command_id);
  assert.equal(result.state,"board_acked");
  assert.deepEqual(result.board_receipt,realReceipt);
  assert.equal(first.images.length,1);
  assert.equal(first.age,"1999.75");
  assert.equal(record(after.metadata).frame_id,frame.frame_id);
  assert.equal(proof.command_id,c.click.command_id);
  assert.equal(proof.phone_ack_mono_ms,10050);
  assert.equal(proof.minimum_gap_ms,2200);
  assert.equal(proof.lower_gap_ms,2300);
  assert.equal(proof.scope_matches_at_snapshot,true);
  assert.equal(proof.app_effect_observed,false);
  assert.ok(Number(after.wait_budget_ms)>4500&&Number(after.wait_budget_ms)<=5000);
  const settled=await liveMcp(l.service,"get_mouse_result",{...args,after_command_min_gap_ms:0});
  assert.equal(settled.images.length,1);
  assert.equal(record(record(settled.result.structuredContent.after_screen).after_command).minimum_gap_ms,520);
  const atLimit=await liveMcp(l.service,"get_mouse_result",args,()=>{},async()=>{l.tick(.25);return true;});
  assert.equal(atLimit.images.length,0);
  assert.equal(record(atLimit.result.structuredContent.after_screen).release_failure,"frame_expired");
  assert.ok(statements.length>=6);
  assert.ok(statements.every(sql=>/^\s*(SELECT|WITH)\b/i.test(sql)&&!/\b(INSERT|UPDATE|DELETE)\b/i.test(sql)));
  assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
});

test("software: original click relook keeps the exact time and live input scope barriers",async t=>{
  for(const mode of ["equal_gap","below_original_settle","changed_boot","changed_control","wrong_owner","pending","corrupt_receipt"]){
    await t.test(mode,async()=>{
      let mono=0;
      const l=lab(false,{now:()=>mono,sleep:async ms=>{mono+=ms;l.tick(ms);}});
      const c=await pairedPhonePoint(mode!=="pending",undefined,l,520);
      if(mode!=="pending")await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
      l.tick(mode==="below_original_settle"?700:2400);
      const {meta}=await capturedAtPhoneMono(l,c.r,mode==="below_original_settle"?10569:12250,2,{source_seq:2});
      l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE frame_id=?").run(l.now()-50,meta.frame_id);
      if(mode==="pending")l.tick(5100);
      if(mode==="changed_boot")l.db.raw.prepare("UPDATE sb_hardware SET board_boot_id=?").run(uid());
      if(mode==="changed_control")l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");
      if(mode==="corrupt_receipt")l.db.raw.prepare("UPDATE sb_mouse_commands SET receipt=? WHERE id=?").run(
        JSON.stringify({...c.body.point_result.click.board_receipt,effect:{hid_reports_sent:false}}),c.click.command_id);
      const changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
      const reply=await liveMcp(l.service,"get_mouse_result",{command_id:c.click.command_id,include_after_screen:true,
        after_command_min_gap_ms:mode==="equal_gap"?2200:0},()=>{},undefined,mode==="wrong_owner"?bob:alice);
      assert.equal(reply.images.length,0);
      if(mode==="wrong_owner")assert.equal(reply.result.structuredContent.error,"NOT_FOUND");
      else{
        const result=reply.result.structuredContent;
        assert.equal(result.command_id,c.click.command_id);
        assert.equal(result.state,mode==="pending"?"embedded":"board_acked");
        assert.notEqual(record(result.after_screen).state,"available");
      }
      assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
    });
  }
});

test("software: original click relook supports standalone receipts and rejects incompatible gap selectors",async()=>{
  const l=lab(),r=await acknowledgedMouse(l);
  const {meta}=await capturedAtPhoneMono(l,r,10001,1,{source_seq:1});
  const id=r.command.command_id;
  const ok=await liveMcp(l.service,"get_mouse_result",{command_id:id,include_after_screen:true});
  assert.equal(ok.images.length,1);
  assert.equal(record(record(ok.result.structuredContent.after_screen).metadata).frame_id,meta.frame_id);
  const paired=await pairedPhonePoint();
  for(const [service,name,args,error] of [
    [l.service,"get_mouse_result",{command_id:id,after_command_min_gap_ms:10},"INVALID_ARGUMENTS"],
    [l.service,"get_mouse_result",{command_id:id,include_after_screen:true,after_command_min_gap_ms:5001},"INVALID_NUMBER"],
    [paired.l.service,"get_mouse_result",{command_id:paired.move.command_id,include_after_screen:true,after_command_min_gap_ms:10},"INVALID_ARGUMENTS"],
    [paired.l.service,"get_mouse_result",{device_id:paired.r.actor.id,click_at_idempotency_key:paired.args.idempotency_key,after_command_min_gap_ms:10},"INVALID_ARGUMENTS"],
    [paired.l.service,"get_mouse_result",{command_id:`click-at-key:${paired.r.actor.id}:${paired.args.idempotency_key}`,include_after_screen:true,after_command_min_gap_ms:10},"INVALID_ARGUMENTS"],
    [l.service,"read_screen",{after_command_id:id,after_command_min_gap_ms:2200},"INVALID_NUMBER"],
  ] as const){
    const reply=await liveMcp(service,name,args);
    assert.equal(reply.result.isError,true);
    assert.equal(reply.result.structuredContent.error,error);
    assert.equal(reply.images.length,0);
  }
});

test("software: keyed click receipt misses and pending rows remain uncertain and read-only",async()=>{
  const c=await pairedPhonePoint(false),key=c.args.idempotency_key,device=c.r.actor.id;
  const lookup=(owner:User,deviceID:string,rawKey:string)=>c.controller.getClickAtByKey(owner,deviceID,rawKey);
  const changes=()=>c.l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  const assertMiss=(value:Awaited<ReturnType<MouseControl["getClickAtByKey"]>>)=>{
    assert.equal(value.lookup_found,false);
    assert.equal(value.state,"outcome_unknown");
    assert.equal(value.command_id,null);
    assert.equal(value.move_command_id,null);
    assert.equal(value.click_submitted,null);
    assert.equal(value.input_not_submitted,null);
  };
  const otherDevice=(await paired(c.l)).actor.id;
  const before=changes();
  const pending=await lookup(alice,device,key);
  assert.equal(pending.lookup_found,true);
  assert.equal(pending.state,"embedded");
  assert.equal(pending.click_submitted,null);
  assert.equal(pending.input_not_submitted,null);
  assert.equal(record(pending).input_attempted,null);
  assertMiss(await lookup(bob,device,key));
  assertMiss(await lookup(alice,otherDevice,key));
  const missing=await lookup(alice,device,uid());
  assertMiss(missing);
  assert.equal(record(missing).move_record_found,false);
  assert.equal(record(missing).click_record_found,false);
  assertMiss(await lookup(alice,device,c.key+":click"));
  assert.equal(changes(),before);

  // A matching hash namespace is not proof of the original click relationship.
  c.l.db.raw.prepare("UPDATE sb_mouse_commands SET predecessor_id=NULL WHERE id=?").run(c.click.command_id);
  const unmatched=await lookup(alice,device,key);
  assertMiss(unmatched);
  assert.equal(record(unmatched).move_record_found,true);
  assert.equal(record(unmatched).click_record_found,true);
  c.l.db.raw.prepare("UPDATE sb_mouse_commands SET predecessor_id=?,board_boot_id=? WHERE id=?")
    .run(c.move.command_id,uid(),c.click.command_id);
  assertMiss(await lookup(alice,device,key));
  c.l.db.raw.prepare("UPDATE sb_mouse_commands SET board_boot_id=? WHERE id=?").run(c.click.board_boot_id,c.click.command_id);
  assert.equal((await lookup(alice,device,key)).lookup_found,true);
  c.l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(device);
  assertMiss(await lookup(alice,device,key));
});

test("software: a readiness wait leaves unmatched JPEG bytes in D1",async()=>{
  const c=await pairedPhonePoint(true,{supported:true});
  await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
  c.l.tick(400);
  const loading=(await capturedAtPhoneMono(c.l,c.r,10400,2,{ready_cue_supported:true,ready_cue_command_id:uid()})).meta;
  const args={device_id:c.r.actor.id,after_command_id:c.click.command_id,after_command_min_gap_ms:300,wait_for_new_ms:0};
  const ordinary=await c.l.service.readScreen(alice,args,0,false,uid(),true);
  assert.equal(ordinary.metadata?.frame_id,loading.frame_id);
  assert.equal(ordinary.image,Buffer.from(c.r.bytes).toString("base64"));
  assert.ok(Number(ordinary.trace?.d1_inline_jpeg_chars)>0);

  const waiting=await c.l.service.readScreen(alice,args,0,false,uid(),true,undefined,undefined,c.click.command_id);
  assert.equal(waiting.reason,"WAITING_READY_CUE");
  assert.equal(waiting.image,undefined);
  assert.equal(waiting.trace?.d1_inline_jpeg_chars,0);

  c.l.tick(100);
  const pixels=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,40)},70).data;
  const readyDevice={...c.r,bytes:pixels,metadata:{...c.r.metadata,content_sha256:await hash(pixels)}};
  const ready=(await capturedAtPhoneMono(c.l,readyDevice,10500,3,{ready_cue_supported:true,ready_cue_command_id:c.click.command_id})).meta;
  const selected=await c.l.service.readScreen(alice,args,0,false,uid(),true,undefined,undefined,c.click.command_id);
  assert.equal(selected.metadata?.frame_id,ready.frame_id);
  assert.equal(selected.image,Buffer.from(pixels).toString("base64"));
  assert.ok(Number(selected.trace?.d1_inline_jpeg_chars)>0);
});

test("software: matching ready commits advance and reuse the exact JPEG after the D1 snapshot",async(t)=>{
  for(const mode of ["same_process","same_loading_frame","late_commit","replaced","evicted","other_process","wrong_cue"] as const)await t.test(mode,async()=>{
    const c=await pairedPhonePoint(true,{supported:true});
    await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
    c.l.tick(400);
    await capturedAtPhoneMono(c.l,c.r,10400,2,{ready_cue_supported:true});
    const uploader=edge(c.l);
    const cache=mode==="other_process"?new LiveFrameCache(4*1024*1024,c.l.now):uploader.cache;
    const pixels=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,40)},70).data;
    const readyDigest=await hash(pixels);
    let clock=0,frameID:string|undefined;
    let changedCache=false;
    c.l.db.afterAll=sql=>{
      if(changedCache||!frameID||clock!==675||!sql.startsWith("WITH candidates AS"))return;
      if(mode==="replaced"){
        cache.put(c.r.actor.id,{owner:alice.id,session:c.r.identity.bridge_session_id,frame:uid(),key:uid(),
          bytes:c.r.bytes,expires:c.l.now()+30_000});
        changedCache=true;
      }
      if(mode==="evicted"){cache.clear(c.r.actor.id);changedCache=true;}
    };
    const waits:number[]=[];
    const service=new BridgeEngine({db:c.l.db as unknown as D1Database,bucket:c.l.service.bucket,now:c.l.now,cache,
      readTiming:{now:()=>clock,sleep:async ms=>{
        const end=clock+ms;waits.push(ms);
        if(mode==="wrong_cue"&&clock<650&&end>=650){
          c.l.tick(650-clock);clock=650;
          await uploader.service.acceptFrame(c.r.actor,{...c.r.metadata,frame_id:uid(),frame_seq:3,
            capture_mono_ms:11050,capture_offset_ms:1050,captured_at:new Date(c.l.now()).toISOString(),
            ready_cue_supported:true,ready_cue_command_id:uid()},c.r.bytes);
        }
        const commitAt=mode==="wrong_cue"?800:mode==="late_commit"?760:650;
        if(!frameID&&end>=commitAt){
          c.l.tick(commitAt-clock);clock=commitAt;
          frameID=uid();
          await uploader.service.acceptFrame(c.r.actor,{...c.r.metadata,frame_id:frameID,frame_seq:mode==="wrong_cue"?4:3,
            capture_mono_ms:10400+commitAt,capture_offset_ms:400+commitAt,captured_at:new Date(c.l.now()).toISOString(),
            content_sha256:readyDigest,ready_cue_supported:true,ready_cue_command_id:c.click.command_id},pixels);
        }
        c.l.tick(end-clock);clock=end;
      }}});
    const minGap=mode==="same_loading_frame"?350:300;
    const advances=mode!=="other_process"&&mode!=="wrong_cue";
    const inline=mode==="other_process"||mode==="evicted";
    const result=await service.readScreen(alice,{device_id:c.r.actor.id,after_command_id:c.click.command_id,
      after_command_min_gap_ms:minGap,wait_for_new_ms:1000},1,false,uid(),true,undefined,undefined,c.click.command_id);
    assert.equal(result.state,"available");
    assert.equal(result.metadata?.frame_id,frameID);
    assert.equal(result.image,Buffer.from(pixels).toString("base64"));
    assert.equal(result.trace?.lookups,mode==="evicted"?5:4);
    assert.equal(clock,mode==="late_commit"?788:advances?675:900);
    assert.deepEqual(waits,mode==="late_commit"?[150,300,225,113]:advances?[150,300,225]:[150,300,225,113,112]);
    assert.equal(result.trace?.frame_commit_advance_ms,mode==="late_commit"?112:advances?225:undefined);
    assert.equal(result.trace?.d1_inline_jpeg_chars,inline?Buffer.from(pixels).toString("base64").length:0);
    assert.equal(result.trace?.pixel_source,mode==="replaced"?"private_ram_snapshot":inline?"d1_inline":"private_ram");
    assert.equal(changedCache,mode==="replaced"||mode==="evicted");
    assert.equal(result.trace?.ready_commit_barrier,undefined);
    assert.equal(c.l.db.raw.prepare("SELECT count(*) AS n FROM sb_mouse_commands").get()!.n,2);
  });
});

test("software: image reuse preserves ready cue support but never carries a match",async()=>{
  const l=lab(),r=await running(l),e=edge(l);
  await e.service.acceptFrame(r.actor,{...r.metadata,ready_cue_supported:true,ready_cue_command_id:uid()},r.bytes);
  l.tick(50);
  const meta={...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:10050,capture_offset_ms:50,
    ready_cue_supported:true,ready_cue_command_id:uid()};
  const reply=await e.service.acceptObservationRequest(new Request("https://test.example/v1/device/frame-observation",
    {headers:{Authorization:"Bearer "+r.token}}),meta);
  assert.equal(reply.accepted_frame_id,meta.frame_id);
  const saved=JSON.parse(String(l.db.raw.prepare("SELECT metadata FROM sb_frames").get()!.metadata));
  assert.equal(saved.ready_cue_supported,true);
  assert.equal(saved.ready_cue_command_id,undefined);
});

test("software: paired phone point creates one embedded companion and grants both in one claim",async()=>{
  const c=await pairedPhonePoint(false);
  assert.equal(c.click.state,"embedded");assert.equal(c.click.input_not_submitted,true);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
  const before=c.l.db.requests,grant=await c.r.mouse.claim(c.r.actor,c.phone,0) as unknown as Record<string,unknown>;
  assert.equal(c.l.db.requests-before,1,"The live session check and both grants share the first claim round trip");assert.equal(grant.state,"executing");assert.equal(grant.point_protocol,PAIRED_MOUSE_POINT);
  const child=grant.paired_click_command as Record<string,unknown>;assert.equal(child.command_id,c.click.command_id);assert.equal(child.state,"executing");assert.equal(child.input_attempted,undefined);
  assert.equal(await c.r.mouse.claim(c.r.actor,c.phone,0),null,"Duplicate delivery cannot grant either action again");
});

test("software: authenticated paired claim folds the token and first grant into one D1 round trip",async()=>{
  for(const path of ["original","combined"] as const){
    const c=await pairedPhonePoint(false);
    c.l.db.raw.prepare("UPDATE sb_devices SET confirmed_at=created_at WHERE id=?").run(c.r.actor.id);
    const request=new Request("https://test.example/v1/device/mouse/commands/claim",{headers:{Authorization:"Bearer "+c.r.token}});
    const before=c.l.db.requests;
    const claim=path==="original"?await c.r.mouse.claim(await c.l.service.authenticate(request),c.phone,0):
      await c.r.mouse.claimRequest(request,async()=>({body:c.phone,waitMS:0}));
    assert.equal(c.l.db.requests-before,path==="original"?2:1);
    const grant=claim as unknown as Record<string,unknown>;
    assert.equal(grant.command_id,c.move.command_id);assert.equal(grant.state,"executing");
    const child=grant.paired_click_command as Record<string,unknown>;
    assert.equal(child.command_id,c.click.command_id);assert.equal(child.state,"executing");
    if(path==="combined")assert.equal(await c.r.mouse.claimRequest(request,async()=>({body:c.phone,waitMS:0})),null);
  }
});

test("software: paired dispatch probe selects only a visible unexpired exact-device probe in the existing grant batch",async()=>{
  for(const mode of ["newest","missing","expired","future","malformed","late_expiry"]){
    const c=await pairedPhonePoint(false),other=await running(c.l,bob),now=c.l.now(),older=uid(),latest=uid();
    c.l.db.raw.prepare("DELETE FROM sb_clock_probes WHERE device_id=?").run(c.r.actor.id);
    const insert=c.l.db.raw.prepare("INSERT INTO sb_clock_probes(id,device_id,created_at,expires_at) VALUES(?,?,?,?)");
    insert.run(uid(),other.actor.id,now,now+60000); // A newer foreign row is never an eligible witness.
    if(mode==="newest"){insert.run(older,c.r.actor.id,now-200,now+60000);insert.run(latest,c.r.actor.id,now-100,now+60000);}
    if(mode==="expired")insert.run(latest,c.r.actor.id,now-100,now);
    if(mode==="future")insert.run(latest,c.r.actor.id,now+1000,now+60000);
    if(mode==="malformed")insert.run("invalid-probe-id",c.r.actor.id,now-100,now+60000);
    if(mode==="late_expiry"){
      insert.run(latest,c.r.actor.id,now-100,now+50);
      const batch=c.l.db.batch.bind(c.l.db);c.l.db.batch=async statements=>{c.l.tick(51);return batch(statements);};
    }
    const before=c.l.db.requests,request=new Request("https://test.example/v1/device/mouse/commands/claim",{headers:{Authorization:"Bearer "+c.r.token}});
    const grant=record(await c.r.mouse.claimRequest(request,async()=>({body:c.phone,waitMS:0})));
    assert.equal(c.l.db.requests-before,1,mode);
    assert.equal(grant.command_id,c.move.command_id,mode);assert.equal(grant.state,"executing",mode);
    assert.equal(record(grant.paired_click_command).command_id,c.click.command_id,mode);
    assert.equal(record(grant.paired_click_command).state,"executing",mode);
    assert.equal(grant.paired_dispatch_probe_id,mode==="newest"?latest:undefined,mode);
    assert.equal(grant.expires_at,c.move.expires_at,mode);
    assert.ok(Number(grant.ttl_remaining_ms)>0&&Number(grant.ttl_remaining_ms)<=2500,mode);
    const stored=c.l.db.raw.prepare("SELECT * FROM sb_mouse_commands WHERE id=?").get(c.move.command_id)!;
    assert.equal(Object.hasOwn(stored,"paired_dispatch_probe_id"),false,mode);
  }
});

test("software: paired dispatch probe is absent for nonpaired and legacy grants and cannot bypass authentication",async()=>{
  for(const mode of ["nonpaired","legacy","wrong_token"]){
    const c=await pairedPhonePoint(false);
    c.l.db.raw.exec("DELETE FROM sb_mouse_commands");
    const command=await c.r.mouse.enqueue(alice,"pointer.click",{device_id:c.r.actor.id,idempotency_key:uid(),wait_ms:0});
    const request=new Request("https://test.example/claim",{headers:{Authorization:"Bearer "+(mode==="wrong_token"?"z".repeat(43):c.r.token)}});
    const call=c.r.mouse.claimRequest(request,async()=>({body:mode==="legacy"?c.r.identity:c.phone,waitMS:0}));
    if(mode==="wrong_token"){
      await assert.rejects(call,/UNAUTHENTICATED/);
      assert.equal(c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(command.command_id)!.state,"queued");
    }else{
      const grant=record(await call);assert.equal(grant.command_id,command.command_id);
      assert.equal(grant.state,mode==="legacy"?"claimed":"executing");assert.equal(grant.paired_dispatch_probe_id,undefined);
    }
  }
});

test("software: combined paired claim keeps invalid, expired, and foreign tokens from granting input",async()=>{
  for(const failure of ["wrong_token","expired","revoked","rotated","foreign_session","stale_worker"] as const){
    const c=await pairedPhonePoint(false),foreign=failure==="foreign_session"?await running(c.l,bob):null;
    const request=new Request("https://test.example/v1/device/mouse/commands/claim",{headers:{Authorization:"Bearer "+
      (failure==="wrong_token"?"A".repeat(40):foreign?.token??c.r.token)}});
    const body=failure==="stale_worker"?{...c.phone,worker_id:uid()}:c.phone;
    if(failure==="expired")c.l.db.raw.prepare("UPDATE sb_devices SET token_expires=0 WHERE id=?").run(c.r.actor.id);
    if(failure==="revoked")c.l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(c.r.actor.id);
    const before=c.l.db.requests;
    await assert.rejects(c.r.mouse.claimRequest(request,async()=>{
      if(failure==="rotated")c.l.db.raw.prepare("UPDATE sb_devices SET token_hash='rotated' WHERE id=?").run(c.r.actor.id);
      return {body,waitMS:0};
    }),failure==="foreign_session"?/STALE_SESSION/:failure==="stale_worker"?/STALE_LEASE/:/UNAUTHENTICATED/);
    assert.equal(c.l.db.requests-before,1);
    const states=c.l.db.raw.prepare("SELECT id,state FROM sb_mouse_commands WHERE id IN (?,?) ORDER BY state").all(c.move.command_id,c.click.command_id);
    assert.deepEqual(states.map(row=>row.state),["embedded","queued"]);
  }
});

test("software: combined first-use claim confirms the device and preserves the original timing budget",async()=>{
  const c=await pairedPhonePoint(false);
  c.l.db.raw.prepare("UPDATE sb_devices SET confirmed_at=NULL WHERE id=?").run(c.r.actor.id);
  let elapsed=0;
  const batch=c.l.db.batch.bind(c.l.db);
  c.l.db.batch=async statements=>{const result=await batch(statements);elapsed+=125;return result;};
  const controller=new MouseControl(c.l.service,{now:()=>elapsed});
  const request=new Request("https://test.example/v1/device/mouse/commands/claim",{headers:{Authorization:"Bearer "+c.r.token}});
  const before=c.l.db.requests;
  const grant=await controller.claimRequest(request,async()=>{elapsed+=17;return {body:c.phone,waitMS:0};}) as unknown as Record<string,unknown>;
  assert.equal(c.l.db.requests-before,1);
  assert.equal(grant.claim_pregrant_elapsed_ms,142);
  assert.ok(Number(grant.ttl_remaining_ms)>0&&Number(grant.ttl_remaining_ms)<=2500);
  assert.notEqual(c.l.db.raw.prepare("SELECT confirmed_at FROM sb_devices WHERE id=?").get(c.r.actor.id)?.confirmed_at,null);
});

test("software: combined paired long poll checks token authority again before a later grant",async()=>{
  const c=await pairedPhonePoint(false);
  const state=c.l.db.raw.prepare("UPDATE sb_mouse_commands SET state=? WHERE id=?");
  state.run("expired",c.move.command_id);
  let elapsed=0,rotated=false;
  const controller=new MouseControl(c.l.service,{now:()=>elapsed,sleep:async ms=>{
    elapsed+=ms;
    if(!rotated){
      c.l.db.raw.prepare("UPDATE sb_devices SET token_hash='rotated' WHERE id=?").run(c.r.actor.id);
      state.run("queued",c.move.command_id);
      rotated=true;
    }
  }});
  const request=new Request("https://test.example/v1/device/mouse/commands/claim",{headers:{Authorization:"Bearer "+c.r.token}});
  const before=c.l.db.requests;
  assert.equal(await controller.claimRequest(request,async()=>({body:c.phone,waitMS:500})),null);
  assert.equal(c.l.db.requests-before,2);
  const states=c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id IN (?,?) ORDER BY state").all(c.move.command_id,c.click.command_id);
  assert.deepEqual(states.map(row=>row.state),["embedded","queued"]);
});

test("software: bounded claim metadata errors still require an authenticated caller",async()=>{
  const c=await pairedPhonePoint(false);
  for(const valid of [false,true]){
    const request=new Request("https://test.example/v1/device/mouse/commands/claim",{headers:{Authorization:"Bearer "+(valid?c.r.token:"A".repeat(40))}});
    await assert.rejects(c.r.mouse.claimRequest(request,async()=>{throw new BridgeError("INVALID_BODY",422);}),valid?/INVALID_BODY/:/UNAUTHENTICATED/);
  }
  const states=c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id IN (?,?) ORDER BY state").all(c.move.command_id,c.click.command_id);
  assert.deepEqual(states.map(row=>row.state),["embedded","queued"]);
});

test("software: a slow claim body is retryable on App64 after token validation",async()=>{
  const c=await pairedPhonePoint(false);
  for(const valid of [false,true]){
    const request=new Request("https://test.example/v1/device/mouse/commands/claim",{headers:{Authorization:"Bearer "+(valid?c.r.token:"A".repeat(40))}});
    await assert.rejects(c.r.mouse.claimRequest(request,async()=>{throw new BridgeError("METADATA_TIMEOUT",408);}),
      (error:unknown)=>error instanceof BridgeError&&error.code===(valid?"GATEWAY_TIMEOUT":"UNAUTHENTICATED")&&error.status===(valid?504:401));
  }
  const states=c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id IN (?,?) ORDER BY state").all(c.move.command_id,c.click.command_id);
  assert.deepEqual(states.map(row=>row.state),["embedded","queued"]);
});

test("software: phone receipt auth and original paired context share the first D1 round trip",async()=>{
  const c=await pairedPhonePoint();
  const request=new Request("https://test.example/v1/device/mouse/commands/"+c.move.command_id+"/result",{headers:{Authorization:"Bearer "+c.r.token}});
  const before=c.l.db.requests;
  const saved=await c.r.mouse.resultRequest(request,c.move.command_id,async()=>{
    assert.equal(c.l.db.requests-before,1,"Authentication and the original point context precede the body");
    return c.body;
  });
  assert.equal(c.l.db.requests-before,2);
  assert.equal(saved.state,"board_acked");
  assert.equal((await c.r.mouse.get(alice,c.click.command_id)).state,"board_acked");
});

async function claimedReceiptFixture(){
  const c=await pairedPhonePoint(false),hints=new PointReceiptHints();
  const claim=new MouseControl(c.l.service,{receiptHints:hints});
  const request=new Request("https://test.example/result",{headers:{Authorization:"Bearer "+c.r.token}});
  const granted=await claim.claimRequest(request,async()=>({body:c.phone,waitMS:0}));
  assert.equal(granted?.command_id,c.move.command_id);
  assert.equal(granted?.state,"executing");
  return {...c,hints,request,receiver:new MouseControl(c.l.service,{receiptHints:hints})};
}

async function signedPointReceiptFixture(key:string|undefined="0123456789abcdef".repeat(4)){
  const c=await pairedPhonePoint(false),hints=new PointReceiptHints();
  const service=(secret=key)=>new BridgeEngine({db:c.l.db as unknown as D1Database,bucket:c.l.bucket as unknown as R2Bucket,now:c.l.now,framePermits:new FrameUploadPermits(secret)});
  const issuer=service(),claim=new MouseControl(issuer,{receiptHints:hints});
  const request=(proof?:string,token=c.r.token)=>new Request("https://test.example/result",{headers:{Authorization:"Bearer "+token,...(proof===undefined?{}:{"X-SaySo-Point-Receipt-Proof":proof})}});
  const granted=await claim.claimRequest(request(),async()=>({body:c.phone,waitMS:0}));assert.ok(granted);
  const proof=record(granted).point_receipt_proof as string|undefined;
  return {...c,hints,service,issuer,request,proof,granted};
}

test("signed point receipt: signing time belongs to the server prefix without extending command expiry",async()=>{
  const c=await pairedPhonePoint(false);let mono=0;
  const issuer=new BridgeEngine({db:c.l.db as unknown as D1Database,bucket:c.l.bucket as unknown as R2Bucket,now:c.l.now,framePermits:new FrameUploadPermits("0123456789abcdef".repeat(4))});
  const issue=issuer.issuePointReceiptProof.bind(issuer);
  issuer.issuePointReceiptProof=async(...args:Parameters<typeof issue>)=>{mono+=37;c.l.tick(37);return issue(...args);};
  const request=new Request("https://test.example/claim",{headers:{Authorization:"Bearer "+c.r.token}}),claim=new MouseControl(issuer,{now:()=>mono});
  const granted=record(await claim.claimRequest(request,async()=>({body:c.phone,waitMS:0})));
  assert.equal(granted.claim_pregrant_elapsed_ms,37);assert.equal(granted.expires_at,c.move.expires_at);
  assert.ok(Number(granted.ttl_remaining_ms)<=Math.min(2500,Date.parse(c.move.expires_at)-c.l.now()));assert.equal(typeof granted.point_receipt_proof,"string");
});

test("signed point receipt: cold verifier saves the auth snapshot without exposing or persisting proof",async()=>{
  const c=await signedPointReceiptFixture();assert.ok(c.proof&&c.proof.length<=8192);
  const receiver=new MouseControl(c.service(),{receiptHints:new PointReceiptHints()}),before=c.l.db.requests;
  const saved=await receiver.resultRequest(c.request(c.proof),c.move.command_id,async()=>{assert.equal(c.l.db.requests,before);return c.body;});
  assert.equal(c.l.db.requests-before,1);assert.equal(saved.state,"board_acked");assert.equal(saved.command_id,c.move.command_id);
  assert.equal(JSON.stringify(saved).includes(c.proof),false);assert.equal(record(await c.r.mouse.get(alice,c.move.command_id)).point_receipt_proof,undefined);
  const rows=c.l.db.raw.prepare("SELECT receipt,result_digest FROM sb_mouse_commands").all();
  assert.ok(rows.every(r=>r.result_digest!==null));assert.equal(JSON.stringify(rows).includes(c.proof),false);
  assert.equal(rows[0].result_digest,await hash(JSON.stringify(c.body)),"Header must not change result digest");
});

test("signed point receipt: cache hit stays first and absent or bad proof keeps authenticated fallback",async()=>{
  for(const mode of ["cache","missing","tampered","expired","rotated_key","unconfigured"] as const){
    const c=await signedPointReceiptFixture();assert.ok(c.proof);
    let proof:string|undefined=c.proof;
    if(mode==="missing")proof=undefined;
    if(mode==="tampered"){const [payload,sig]=proof!.split('.');proof=payload+'.'+(sig[0]==='A'?'B':'A')+sig.slice(1);}
    if(mode==="expired")c.l.tick(2001);
    const service=mode==="unconfigured"?new BridgeEngine({db:c.l.db as unknown as D1Database,bucket:c.l.bucket as unknown as R2Bucket,now:c.l.now}):c.service(mode==="rotated_key"?"fedcba9876543210".repeat(4):undefined);
    if(mode==="cache")service.verifyPointReceiptProof=async()=>{throw Error("Cache hit must not verify the header");};
    const receiver=new MouseControl(service,{receiptHints:mode==="cache"?c.hints:new PointReceiptHints()}),before=c.l.db.requests;
    const saved=await receiver.resultRequest(c.request(proof),c.move.command_id,async()=>{
      assert.equal(c.l.db.requests-before,mode==="cache"?0:1,mode);return c.body;
    });
    assert.equal(saved.state,"board_acked");assert.equal(c.l.db.requests-before,mode==="cache"?1:2,mode);
  }
});

test("signed point receipt: duplicate proof returns the original result and conflicts stay RESULT_CONFLICT",async()=>{
  const c=await signedPointReceiptFixture();assert.ok(c.proof);const receiver=new MouseControl(c.service());
  const first=await receiver.resultRequest(c.request(c.proof),c.move.command_id,async()=>c.body);
  const again=await new MouseControl(c.service()).resultRequest(c.request(c.proof),c.move.command_id,async()=>c.body);
  assert.deepEqual(again,first);
  assert.deepEqual(await new MouseControl(c.service()).resultRequest(c.request(),c.move.command_id,async()=>c.body),first);
  await assert.rejects(new MouseControl(c.service()).resultRequest(c.request(c.proof),c.move.command_id,async()=>({...c.body,finished_client_mono_ms:10001})),/RESULT_CONFLICT/);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
});

test("software: ordinary paired receipt racing the original reuses the authenticated exact readback",async()=>{
  const c=await signedPointReceiptFixture(),before=c.l.db.requests;
  let concurrentCalls=0,changesAfterOriginal=0;
  const duplicate=await new MouseControl(c.service()).resultRequest(c.request(),c.move.command_id,async()=>{
    const start=c.l.db.requests;
    const original=await new MouseControl(c.service()).resultRequest(c.request(c.proof),c.move.command_id,async()=>c.body);
    assert.equal(original.state,"board_acked");
    concurrentCalls=c.l.db.requests-start;
    changesAfterOriginal=c.l.db.raw.prepare("SELECT total_changes() n").get()!.n as number;
    return structuredClone(c.body);
  });
  assert.equal(duplicate.command_id,c.move.command_id);
  assert.equal(duplicate.state,"board_acked");
  assert.equal(c.l.db.requests-before-concurrentCalls,3,"Context, losing guarded write, and exact authenticated readback");
  assert.equal(c.l.db.raw.prepare("SELECT total_changes() n").get()!.n,changesAfterOriginal);
  assert.equal((await c.r.mouse.get(alice,c.click.command_id)).state,"board_acked");
});

test("signed point receipt: bounded diagnostics distinguish committed sources and authenticated fallback without proof data",async()=>{
  const info=console.info,logs:Record<string,unknown>[]=[];
  console.info=value=>logs.push(JSON.parse(String(value)));
  try {
    for(const mode of ["cache","signed","missing","invalid","ineligible","sink_failure"] as const){
      const c=await signedPointReceiptFixture();assert.ok(c.proof);logs.length=0;
      const receiver=new MouseControl(c.service(),{receiptHints:mode==="cache"?c.hints:new PointReceiptHints()});
      if(mode==="sink_failure")console.info=()=>{throw Error("diagnostic sink failed");};
      const proof=mode==="missing"?undefined:mode==="invalid"?"invalid":c.proof;
      const saved=await receiver.resultRequest(c.request(proof),c.move.command_id,async()=>{if(mode==="ineligible")c.l.tick(2001);return c.body;});
      assert.equal(saved.state,"board_acked",mode);
      if(mode==="sink_failure")continue;
      assert.equal(logs.length,2,mode);
      const commit=logs.find(value=>value.event==="paired_click_receipt_commit")!;
      const event=logs.find(value=>value.event!=="paired_click_receipt_commit")!;
      assert.equal(commit.move_command_id,c.move.command_id,mode);
      assert.equal(commit.click_command_id,c.click.command_id,mode);
      assert.equal(commit.auth_source,mode==="cache"?"same_isolate_hint":mode==="signed"?"signed_receipt_proof":"authenticated_snapshot",mode);
      assert.equal(commit.commit_outcome,"committed",mode);
      assert.equal(commit.click_state,"board_acked",mode);
      assert.ok(Number(commit.receipt_ingress_at_server_utc_ms)<=Number(commit.receipt_authenticated_at_server_utc_ms),mode);
      assert.ok(Number(commit.receipt_d1_started_at_server_utc_ms)<=Number(commit.receipt_commit_observed_at_server_utc_ms),mode);
      assert.deepEqual(record(commit.d1_timing).contexts,["paired_receipt_commit"],mode);
      assert.equal(event.command_id,c.move.command_id);
      if(mode==="cache"||mode==="signed"){
        assert.deepEqual(event,{event:"paired_result_claim_snapshot_used",command_id:c.move.command_id,source:mode==="cache"?"same_isolate_hint":"signed_receipt_proof"});
        await receiver.resultRequest(c.request(c.proof),c.move.command_id,async()=>c.body);
        assert.equal(logs.filter(value=>value.event==="paired_result_claim_snapshot_used").length,1);
        assert.equal(logs.filter(value=>value.event==="paired_click_receipt_commit"&&value.commit_outcome==="committed").length,1,
          "Duplicate readback must not count as a newly committed proof hit");
      }else{
        assert.equal(event.event,"paired_result_auth_snapshot_used");
        assert.equal(event.source,mode==="missing"?"missing_receipt_proof":mode==="invalid"?"unusable_receipt_proof":"prepared_receipt_ineligible");
        assert.ok(Number.isFinite(event.auth_snapshot_ms)&&Number(event.auth_snapshot_ms)>=0);
        assert.deepEqual(Object.keys(event).sort(),["auth_snapshot_ms","command_id","event","source"]);
      }
      for(const secret of [c.proof,c.r.token,alice.id,c.r.actor.id])assert.equal(JSON.stringify(logs).includes(secret),false);
    }
  } finally {console.info=info;}
});

test("signed point receipt: wrong token and URL selector cannot consume a proof as authority",async()=>{
  const c=await signedPointReceiptFixture();assert.ok(c.proof);const receiver=new MouseControl(c.service());
  let read=false;
  await assert.rejects(receiver.resultRequest(c.request(c.proof,"A".repeat(43)),c.move.command_id,async()=>{read=true;return c.body;}),/UNAUTHENTICATED/);
  assert.equal(read,false);
  const before=c.l.db.requests;
  await assert.rejects(receiver.resultRequest(c.request(c.proof),uid(),async()=>{assert.equal(c.l.db.requests-before,1);return c.body;}),/NOT_FOUND/);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE result_digest IS NOT NULL").get()!.n,0);
});

test("signed point receipt: expiry during body IO falls back once and invalid body errors match legacy",async()=>{
  for(const mode of ["expired_during_body","wrong_boot","wrong_broadcast","bad_clock","parse_error"] as const){
    const outcomes=[];
    for(const withProof of [false,true]){
      const c=await signedPointReceiptFixture();assert.ok(c.proof);const receiver=new MouseControl(c.service()),before=c.l.db.requests;
      let readCount=0,code:string|null=null,state:string|undefined;
      try {state=(await receiver.resultRequest(c.request(withProof?c.proof:undefined),c.move.command_id,async()=>{
        readCount++;const body=structuredClone(c.body);
        if(mode==="expired_during_body")c.l.tick(2001);
        if(mode==="wrong_boot")body.board_receipt.board_boot_id=uid();
        if(mode==="wrong_broadcast")body.broadcast_id=uid();
        if(mode==="bad_clock")body.finished_client_mono_ms=-1;
        if(mode==="parse_error")throw new BridgeError("INVALID_BODY",422);
        return body;
      })).state;}catch(error){code=error instanceof BridgeError?error.code:String(error);}
      assert.equal(readCount,1);outcomes.push({code,state});
      if(mode==="expired_during_body"){assert.equal(state,"board_acked");assert.equal(c.l.db.requests-before,2);}
      else {assert.ok(code);assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE result_digest IS NOT NULL").get()!.n,0);}
    }
    assert.deepEqual(outcomes[1],outcomes[0],mode);
  }
});

test("signed point receipt: current revoke, token, scope and hardware fences match legacy under races",async()=>{
  for(const [name,sql] of [
    ["rotated_token","UPDATE sb_devices SET token_hash='rotated'"],
    ["expired_token","UPDATE sb_devices SET token_expires=0"],
    ["revoked","UPDATE sb_devices SET revoked=1"],
    ["lease","UPDATE sb_devices SET lease_epoch=lease_epoch+1"],
    ["worker","UPDATE sb_devices SET worker_id='00000000-0000-4000-8000-000000000000'"],
    ["pause","UPDATE sb_sessions SET capture_state='paused'"],
    ["control","UPDATE sb_sessions SET control_epoch=control_epoch+1"],
    ["grant","UPDATE sb_sessions SET mouse_enabled=0,mouse_until=0"],
    ["boot","UPDATE sb_hardware SET board_boot_id='00000000-0000-4000-8000-000000000000'"],
    ["disconnect","UPDATE sb_hardware SET usb_connected=0"],
    ["immutable_payload","UPDATE sb_mouse_commands SET payload='{\"x\":1,\"y\":2}' WHERE kind='pointer.move_absolute'"],
  ] as const){
    const outcomes=[];
    for(const withProof of [false,true]){
      const c=await signedPointReceiptFixture();assert.ok(c.proof);let code:string|null=null;
      try {await new MouseControl(c.service()).resultRequest(c.request(withProof?c.proof:undefined),c.move.command_id,async()=>{c.l.db.raw.exec(sql);return c.body;});}
      catch(error){code=error instanceof BridgeError?error.code:String(error);}
      assert.ok(code,name);const rows=c.l.db.raw.prepare("SELECT kind,state,error FROM sb_mouse_commands ORDER BY kind").all();
      assert.ok(rows.every(r=>r.state!=="board_acked"),name);assert.equal(rows.length,2);
      outcomes.push({code,rows});
    }
    assert.deepEqual(outcomes[1],outcomes[0],name);
  }
});

test("signed point receipt: partial unknown outcome uses ordinary handling and never replays input",async()=>{
  const c=await signedPointReceiptFixture();assert.ok(c.proof);const before=c.l.db.requests;
  const body:Record<string,unknown>=structuredClone(c.body);
  record(body.point_result).click={state:"outcome_unknown",input_submitted:true,board_receipt:{},finished_client_mono_ms:null,error:"USB_OUTCOME_UNKNOWN"};
  await new MouseControl(c.service()).resultRequest(c.request(c.proof),c.move.command_id,async()=>body);
  assert.equal(c.l.db.requests-before,2);
  const click=await c.r.mouse.get(alice,c.click.command_id);assert.equal(click.state,"outcome_unknown");assert.equal(click.input_not_submitted,false);
  assert.equal(click.receipt_observation.valid_for_capture_order,false);assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
});

test("signed point receipt: uncertain commit response is never retried by the proof path",async()=>{
  const c=await signedPointReceiptFixture();assert.ok(c.proof);const batch=c.l.db.batch.bind(c.l.db);let writes=0;
  c.l.db.batch=async statements=>{writes++;await batch(statements);throw new Error("Lost original paired write reply");};
  await assert.rejects(new MouseControl(c.service()).resultRequest(c.request(c.proof),c.move.command_id,async()=>c.body),/Lost original paired write reply/);
  assert.equal(writes,1);c.l.db.batch=batch;
  assert.equal((await c.r.mouse.get(alice,c.move.command_id)).state,"board_acked");assert.equal((await c.r.mouse.get(alice,c.click.command_id)).state,"board_acked");
  assert.equal((await new MouseControl(c.service()).resultRequest(c.request(c.proof),c.move.command_id,async()=>c.body)).state,"board_acked");
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
});

test("signed point receipt: legacy claim without a configured stable key is unchanged",async()=>{
  const c=await pairedPhonePoint(false),request=new Request("https://test.example/result",{headers:{Authorization:"Bearer "+c.r.token}});
  const granted=await c.r.mouse.claimRequest(request,async()=>({body:c.phone,waitMS:0}));assert.ok(granted);
  assert.equal(record(granted).point_receipt_proof,undefined);
  const before=c.l.db.requests;assert.equal((await c.r.mouse.resultRequest(request,c.move.command_id,async()=>c.body)).state,"board_acked");
  assert.equal(c.l.db.requests-before,2);
});

test("software: a fresh authenticated pair saves one receipt snapshot and keeps replay handling",async t=>{
  for(const mode of ["same_process","other_process","expired_hint"] as const)await t.test(mode,async()=>{
    const c=await claimedReceiptFixture();
    if(mode==="expired_hint")c.l.tick(2001);
    const receiver=mode==="other_process"?new MouseControl(c.l.service,{receiptHints:new PointReceiptHints()}):c.receiver;
    const before=c.l.db.requests;
    const saved=await receiver.resultRequest(c.request,c.move.command_id,async()=>c.body);
    assert.equal(c.l.db.requests-before,mode==="same_process"?1:2);
    assert.equal(saved.state,"board_acked");
    assert.equal((await c.r.mouse.get(alice,c.click.command_id)).state,"board_acked");
    assert.equal((await receiver.resultRequest(c.request,c.move.command_id,async()=>c.body)).state,"board_acked");
    await assert.rejects(receiver.resultRequest(c.request,c.move.command_id,
      async()=>({...c.body,finished_client_mono_ms:10001})),/RESULT_CONFLICT/);
  });
});

test("software: cached paired receipts retain the live authorization and malformed-body checks",async t=>{
  for(const mode of ["rotated","revoked","lease","bad_body","unauthorized_token"] as const)await t.test(mode,async()=>{
    const c=await claimedReceiptFixture();
    const request=mode==="unauthorized_token"?new Request("https://test.example/result",{headers:{Authorization:"Bearer "+"A".repeat(43)}}):c.request;
    let read=false;
    const expected=mode==="lease"?/STALE_LEASE/:mode==="bad_body"?/INVALID_POINT_CLOCK/:/UNAUTHENTICATED/;
    await assert.rejects(c.receiver.resultRequest(request,c.move.command_id,async()=>{
      read=true;
      if(mode==="rotated")c.l.db.raw.exec("UPDATE sb_devices SET token_hash='rotated'");
      if(mode==="revoked")c.l.db.raw.exec("UPDATE sb_devices SET revoked=1");
      if(mode==="lease")c.l.db.raw.exec("UPDATE sb_devices SET lease_epoch=lease_epoch+1");
      return mode==="bad_body"?{...c.body,finished_client_mono_ms:-1}:c.body;
    }),expected);
    assert.equal(read,mode!=="unauthorized_token");
    assert.equal(c.l.db.raw.prepare("SELECT count(*) AS n FROM sb_mouse_commands WHERE result_digest IS NOT NULL").get()!.n,0);
  });
});

test("software: a lost response after the cached paired commit does not repeat the write",async()=>{
  const c=await claimedReceiptFixture(),batch=c.l.db.batch.bind(c.l.db);
  let attempts=0;
  c.l.db.batch=async statements=>{
    attempts++;
    await batch(statements);
    throw new Error("Lost response after D1 commit");
  };
  await assert.rejects(c.receiver.resultRequest(c.request,c.move.command_id,async()=>c.body),/Lost response after D1 commit/);
  c.l.db.batch=batch;
  assert.equal(attempts,1);
  assert.equal((await c.r.mouse.get(alice,c.move.command_id)).state,"board_acked");
  assert.equal((await c.r.mouse.get(alice,c.click.command_id)).state,"board_acked");
});

test("software: standalone phone receipt uses the same authenticated context path",async()=>{
  const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  await r.mouse.claim(r.actor,{...r.identity,control_epoch:c.control_epoch,raw_dispatch_protocol:rawDispatchProtocol},0);
  const request=new Request("https://test.example/result",{headers:{Authorization:"Bearer "+r.token}});
  const before=l.db.requests;
  const result=await r.mouse.resultRequest(request,c.command_id,async()=>({...r.identity,state:"board_acked",finished_client_mono_ms:10000,
    board_receipt:{command_id:c.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}}}));
  assert.equal(l.db.requests-before,2);
  assert.equal(result.command_id,c.command_id);
  assert.equal(result.state,"board_acked");
});

test("software: phone receipt request rejects unauthorized bodies and foreign command IDs",async()=>{
  const c=await pairedPhonePoint(),foreign=await running(c.l,bob);
  for(const token of ["invalid","A".repeat(43)]){
    let read=false;
    await assert.rejects(c.r.mouse.resultRequest(new Request("https://test.example/result",{headers:{Authorization:"Bearer "+token}}),c.move.command_id,async()=>{read=true;return c.body;}),/UNAUTHENTICATED/);
    assert.equal(read,false);
  }
  await assert.rejects(c.r.mouse.resultRequest(new Request("https://test.example/result",{headers:{Authorization:"Bearer "+foreign.token}}),c.move.command_id,async()=>c.body),/NOT_FOUND/);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE result_digest IS NOT NULL").get()!.n,0);
});

test("software: phone receipt commit rejects token and worker changes during body IO",async()=>{
  for(const [change,reason] of [
    ["UPDATE sb_devices SET token_hash='rotated'",/UNAUTHENTICATED/],
    ["UPDATE sb_devices SET revoked=1",/UNAUTHENTICATED/],
    ["UPDATE sb_devices SET token_expires=0",/UNAUTHENTICATED/],
    ["UPDATE sb_devices SET lease_epoch=lease_epoch+1",/STALE_LEASE/],
  ] as const){
    const c=await pairedPhonePoint();
    const request=new Request("https://test.example/result",{headers:{Authorization:"Bearer "+c.r.token}});
    await assert.rejects(c.r.mouse.resultRequest(request,c.move.command_id,async()=>{c.l.db.raw.exec(change);return c.body;}),reason);
    assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE result_digest IS NOT NULL").get()!.n,0,change);
  }
});

test("software: phone receipt request revalidates read-only replays and retains authorized late evidence",async()=>{
  const c=await pairedPhonePoint();
  const request=new Request("https://test.example/result",{headers:{Authorization:"Bearer "+c.r.token}});
  await c.r.mouse.resultRequest(request,c.move.command_id,async()=>c.body);
  assert.equal((await c.r.mouse.resultRequest(request,c.move.command_id,async()=>c.body)).state,"board_acked");
  await assert.rejects(c.r.mouse.resultRequest(request,c.move.command_id,async()=>{c.l.db.raw.exec("UPDATE sb_devices SET token_hash='rotated'");return c.body;}),/UNAUTHENTICATED/);

  const late=await pairedPhonePoint();
  const lateRequest=new Request("https://test.example/result",{headers:{Authorization:"Bearer "+late.r.token}});
  await assert.rejects(late.r.mouse.resultRequest(lateRequest,late.move.command_id,async()=>{late.l.tick(5001);return late.body;}),/STALE_POINT_RECEIPT/);
  for(const id of [late.move.command_id,late.click.command_id]){
    const result=await late.r.mouse.get(alice,id);
    assert.equal(result.state,"outcome_unknown");
    assert.equal(result.receipt_observation.valid_for_capture_order,false);
    assert.equal(result.board_receipt.command_id,id);
  }
});

test("software: fused raw claim never mutates the queue or capability for a stale session or lease",async()=>{
  for(const [invalid,reason] of [
    [{bridge_session_id:uid()},/STALE_SESSION/],
    [{broadcast_id:uid()},/STALE_SESSION/],
    [{worker_id:uid()},/STALE_LEASE/],
    [{lease_epoch:9000},/STALE_LEASE/],
  ] as const){
    const c=await pairedPhonePoint(false);c.l.tick(5001);
    const before=c.l.db.requests,ready=c.l.db.raw.prepare("SELECT * FROM sb_mouse_point_ready").get();
    await assert.rejects(c.r.mouse.claim(c.r.actor,{...c.phone,...invalid,point_protocol:null},0),reason);
    assert.equal(c.l.db.requests-before,1);
    assert.deepEqual(c.l.db.raw.prepare("SELECT * FROM sb_mouse_point_ready").get(),ready);
    assert.equal(c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(c.move.command_id)!.state,"queued");
    assert.equal(c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(c.click.command_id)!.state,"embedded");
  }
  const c=await pairedPhonePoint(false),batch=c.l.db.batch.bind(c.l.db);
  c.l.db.batch=async statements=>{
    if(statements.some(s=>s.sql.includes("AS checked_at_ms")))c.l.tick(12_000);
    return batch(statements);
  };
  await assert.rejects(c.r.mouse.claim(c.r.actor,c.phone,0),/STALE_LEASE/);
  assert.equal(c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(c.move.command_id)!.state,"queued");
});

test("software: fused raw claim cannot wake a companion under an earlier executing parent",async()=>{
  const c=await pairedPhonePoint(false);
  c.l.db.raw.prepare("UPDATE sb_mouse_commands SET state='executing',worker_id=?,lease_epoch=? WHERE id=?").run(c.phone.worker_id,c.phone.lease_epoch,c.move.command_id);
  assert.equal(await c.r.mouse.claim(c.r.actor,c.phone,0),null);
  assert.equal(c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(c.click.command_id)!.state,"embedded");
});

test("software: selected click_at preserves owner, geometry and grant boundaries", async () => {
  const cases = [
    ["revoked", /REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED/],
    ["orientation", /REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED/],
    ["age_during_request", /REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED/],
  ] as const;
  for (const [mode, expected] of cases) {
    const c = await pairedPhonePoint(false);
    c.l.db.raw.prepare("DELETE FROM sb_mouse_commands").run();
    const batch = c.l.db.batch.bind(c.l.db);
    c.l.db.batch = async statements => {
      if (statements.some(s => s.sql.startsWith("WITH clock AS"))) {
        if (mode === "revoked") c.l.db.raw.prepare("UPDATE sb_sessions SET mouse_enabled=0").run();
        if (mode === "orientation") c.l.db.raw.prepare("UPDATE sb_frames SET metadata=json_set(metadata,'$.orientation_epoch',1)").run();
        if (mode === "age_during_request") c.l.tick(2100);
      }
      return batch(statements);
    };
    await assert.rejects(c.controller.clickAt(alice, {...c.args, device_id:c.r.actor.id}), expected);
    assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n, 0, mode);
  }
  const c = await pairedPhonePoint(false);
  c.l.tick(5001);
  await assert.rejects(c.controller.clickAt(bob, {...c.args, device_id:c.r.actor.id}), /START_MOUSE_SHARING/);
  assert.equal(c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(c.move.command_id)!.state,"queued");
  assert.equal(c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(c.click.command_id)!.state,"embedded");

  const stale=await pairedPhonePoint(false);
  stale.l.db.raw.prepare("DELETE FROM sb_mouse_commands").run();
  stale.l.tick(2100);
  const waiting=geometryWaitMouse(stale.l,()=>{
    stale.l.db.raw.prepare("UPDATE sb_sessions SET control_epoch=control_epoch+1").run();
    stale.l.db.raw.prepare("UPDATE sb_frames SET capture_lower=?").run(stale.l.now()-50);
  });
  await assert.rejects(waiting.mouse.clickAt(alice,{...stale.args,device_id:stale.r.actor.id,wait_ms:200}),/REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED/);
  assert.equal(stale.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,0);
});

test("software: selected click_at keeps a single point through contention and an uncertain commit", async () => {
  const c = await pairedPhonePoint(false);
  c.l.db.raw.prepare("DELETE FROM sb_mouse_commands").run();
  const args = {...c.args, device_id:c.r.actor.id, observe_after:false};
  const before = c.l.db.requests;
  const [a,b] = await Promise.all([c.controller.clickAt(alice,args),c.controller.clickAt(alice,args)]);
  assert.equal(a.move_command_id,b.move_command_id);
  assert.equal(a.command_id,b.command_id);
  assert.equal(c.l.db.requests-before,2);
  await assert.rejects(c.controller.clickAt(alice,{...args,x:8}),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(c.controller.clickAt(alice,{...args,idempotency_key:uid()}),/MOUSE_BUSY_OR_CONTROL_CHANGED|REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED/);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);

  const lost = await pairedPhonePoint(false);
  lost.l.db.raw.prepare("DELETE FROM sb_mouse_commands").run();
  const batch = lost.l.db.batch.bind(lost.l.db);
  lost.l.db.batch = async statements => {
    const rows=await batch(statements);
    if (statements.some(s=>s.sql.startsWith("WITH clock AS"))) throw new Error("Fixture lost committed admission reply");
    return rows;
  };
  const began = lost.l.db.requests;
  await assert.rejects(lost.controller.clickAt(alice,{...lost.args,device_id:lost.r.actor.id}),/lost committed admission reply/);
  assert.equal(lost.l.db.requests-began,1,"No new request can follow an uncertain admission automatically");
  const saved=lost.l.db.raw.prepare("SELECT id,kind,predecessor_id FROM sb_mouse_commands ORDER BY predecessor_id").all();
  assert.equal(saved.length,2);
  const click=saved.find(row=>row.kind==="pointer.click");
  assert.equal(click?.predecessor_id,saved.find(row=>row.kind==="pointer.move_absolute")?.id);
  assert.equal((await lost.r.mouse.get(alice,String(click?.id))).state,"embedded");
});

test("software: fresh paired click_at reuses admission snapshot and waits on both receipts together", async () => {
  for (const wait of [0, 600]) {
    const c = await pairedPhonePoint(false);
    c.l.db.raw.prepare("DELETE FROM sb_mouse_commands").run();
    let mono = 0;
    let movePolls = 0;
    let pairPolls = 0;
    const batch = c.l.db.batch.bind(c.l.db);
    c.l.db.batch = async statements => {
      movePolls += statements.filter(s => s.sql.includes("WHERE c.id=? AND c.owner_id=? AND d.revoked=0") && s.sql.startsWith("SELECT c.*")).length;
      pairPolls += statements.filter(s => s.sql.includes("c.id IN (?,?) AND d.revoked=0")).length;
      return batch(statements);
    };
    const controller = new MouseControl(c.l.service, {now: () => mono, sleep: async ms => {
      mono += ms;
      const grant = await c.r.mouse.claim(c.r.actor, c.phone, 0);
      assert.ok(grant);
      const child = (grant as unknown as {paired_click_command: {command_id: string}}).paired_click_command;
      const body = structuredClone(c.body);
      body.board_receipt.command_id = grant.command_id;
      body.point_result.click.board_receipt.command_id = child.command_id;
      await c.r.mouse.result(c.r.actor, grant.command_id, body);
    }});
    const result = await controller.clickAt(alice, {...c.args, wait_ms: wait, observe_after: false});
    assert.equal(result.workflow, "phone_move_click_observe.v1");
    assert.equal(result.state, wait ? "board_acked" : "embedded");
    assert.equal(movePolls, 0);
    assert.equal(pairPolls, wait ? 1 : 0);
    assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n, 2);
  }
});

test("software: default paired click opens a fresh 5s same-call read window only after confirmation",async t=>{
  for(const mode of ["fresh","custom_settle","explicit","scope_changed","expired_frame","late_query","receipt_only","unconfirmed"] as const)await t.test(mode,async()=>{
    const settle=mode==="custom_settle"?700:300;
    const c=await pairedPhonePoint(mode!=="unconfirmed",undefined,lab(),settle);
    if(mode!=="unconfirmed")await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
    const originalRows=c.l.db.raw.prepare("SELECT * FROM sb_mouse_commands ORDER BY id").all();
    let clock=0,firstTerminalReturned=false,publishedFrame:string|undefined,observedLateQuery=false;
    const receiptDelay=3200;
    const frameDue=receiptDelay+(mode==="late_query"?4700:3200);
    const advance=(ms:number)=>{clock+=ms;c.l.tick(ms);};
    const service=new BridgeEngine({db:c.l.db as unknown as D1Database,bucket:c.l.service.bucket,now:c.l.now,
      readTiming:{now:()=>clock,sleep:async ms=>{
        const end=clock+ms;
        if(clock<frameDue&&end>=frameDue){
          advance(frameDue-clock);
          if(mode==="scope_changed"){
            c.l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");
          }else{
            publishedFrame=(await capturedAtPhoneMono(c.l,c.r,10000+clock,2,{source_seq:2})).meta.frame_id;
            if(mode==="expired_frame"){
              c.l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE frame_id=?").run(c.l.now()-2000,publishedFrame);
            }
          }
        }
        advance(end-clock);
      }}});
    c.l.db.afterAll=sql=>{
      if(mode==="late_query"&&publishedFrame&&sql.includes("AS d1_read_at_utc_ms")){
        observedLateQuery=true;
        advance(500);
      }
    };
    const {wait_ms: _wait,...args}=c.args;
    const release:ClickAfterReleaseRecovery[]=[];
    const controller=new MouseControl(service,{now:()=>clock,sleep:async ms=>{advance(ms);}});
    const enqueue=controller.enqueue.bind(controller);
    controller.enqueue=async(...input)=>{
      const result=await enqueue(...input);
      if(mode!=="receipt_only"&&result.state==="board_acked"){
        firstTerminalReturned=true;
        advance(receiptDelay);
      }
      return result;
    };
    const result=await controller.clickAt(alice,{...args,device_id:c.r.actor.id,settle_ms:settle,
      ...(mode==="explicit"?{wait_ms:6000}:mode==="receipt_only"?{observe_after:false}:{})},
      undefined,undefined,guard=>release.push(guard));
    assert.equal(result.command_id,c.click.command_id);
    assert.equal(result.move_command_id,c.move.command_id);
    if(mode==="unconfirmed"){
      assert.notEqual(result.state,"board_acked");
      assert.equal(result.after_screen.wait_budget_ms,undefined);
      assert.ok(clock<=6000);
      assert.equal(result.image,undefined);
      assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
      return;
    }
    assert.equal(result.state,"board_acked");
    assert.deepEqual(c.l.db.raw.prepare("SELECT * FROM sb_mouse_commands ORDER BY id").all(),originalRows);
    if(mode==="receipt_only"){
      assert.equal(result.after_screen.state,"not_requested");
      assert.equal(firstTerminalReturned,false);
      assert.equal(result.image,undefined);
      return;
    }
    assert.equal(firstTerminalReturned,true);
    if(mode==="late_query"){
      assert.ok(observedLateQuery);
      assert.ok(clock>=receiptDelay+5000);
      assert.equal(result.after_screen.reason,"OBSERVATION_BUDGET_EXHAUSTED");
      assert.equal(result.image,undefined);
      return;
    }
    assert.equal(result.after_screen.wait_budget_ms,mode==="explicit"?2000:5000);
    if(mode==="fresh"||mode==="custom_settle"){
      assert.equal(result.image,Buffer.from(c.r.bytes).toString("base64"));
      assert.ok(clock>6000&&clock<receiptDelay+5000);
      const metadata=record(result.after_screen.metadata),proof=record(result.after_screen.after_command);
      assert.equal(metadata.frame_id,publishedFrame);
      assert.equal(metadata.device_id,c.r.actor.id);
      assert.deepEqual([metadata.width,metadata.height,metadata.orientation_epoch],[16,32,0]);
      assert.ok(Number(metadata.age_ms)<1000);
      assert.equal(proof.command_id,c.click.command_id);
      assert.ok(Number(proof.lower_gap_ms)>settle);
      assert.equal(release.length,1);
      assert.equal(release[0].enforceDeadline,true);
      assert.equal(release[0].withinDeadline(),true);
      clock=receiptDelay+5000;
      assert.equal(release[0].withinDeadline(),false);
    }else{
      assert.equal(result.image,undefined);
      if(mode==="scope_changed")assert.equal(result.after_screen.reason,"AFTER_COMMAND_SCOPE_CHANGED");
      else assert.equal(result.after_screen.reason,"NO_FRESH_FRAME");
      assert.equal(publishedFrame!==undefined,mode==="expired_frame");
    }
  });
});

test("software: the 5s after-image deadline returns the original receipt even if read-only work stalls",async t=>{
  t.mock.timers.enable({apis:["setTimeout"]});
  const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(complete=>{resolve=complete;});return {promise,resolve};};
  for(const mode of ["database","final_clock"] as const)await t.test(mode,async()=>{
    let mono=0,reads=0;
    const l=lab(false,{now:()=>mono,sleep:async ms=>{mono+=ms;l.tick(ms);}});
    const c=await pairedPhonePoint(true,undefined,l);
    await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
    const commands=l.db.raw.prepare("SELECT * FROM sb_mouse_commands ORDER BY id").all();
    const started=deferred(),late=deferred(),returned=deferred();
    const {wait_ms: _wait,...args}=c.args;
    const input={...args,device_id:c.r.actor.id};
    if(mode==="database"){
      const prepare=l.db.prepare.bind(l.db);
      l.db.prepare=sql=>{
        const statement=prepare(sql),bind=statement.bind.bind(statement);
        if(!sql.startsWith("WITH candidates AS"))return statement;
        statement.bind=(...values:unknown[])=>{
          const bound=bind(...values),all=bound.all.bind(bound);
          bound.all=async<T>()=>{
            const rows=await all<T>();
            reads++;
            started.resolve();
            await late.promise;
            returned.resolve();
            return rows;
          };
          return bound;
        };
        return statement;
      };
      const result=new MouseControl(l.service,{now:()=>mono}).clickAt(alice,input);
      await started.promise;
      t.mock.timers.tick(5000);
      const observed=await result;
      assert.equal(observed.state,"board_acked");
      assert.equal(observed.command_id,c.click.command_id);
      assert.equal(observed.after_screen.reason,"OBSERVATION_BUDGET_EXHAUSTED");
      assert.equal(observed.image,undefined);
    }else{
      l.tick(400);await capturedAtPhoneMono(l,c.r,10400,2,{source_seq:2});
      const result=liveMcp(l.service,"click_at",input,()=>{},async()=>{
        reads++;
        started.resolve();
        await late.promise;
        returned.resolve();
        return true;
      });
      await started.promise;
      t.mock.timers.tick(5000);
      const observed=await result;
      assert.equal(observed.result.structuredContent.state,"board_acked");
      assert.equal(observed.result.structuredContent.command_id,c.click.command_id);
      assert.equal(record(observed.result.structuredContent.after_screen).release_failure,"deadline_expired");
      assert.equal(observed.images.length,0);
    }
    late.resolve();await returned.promise;
    await Promise.resolve();
    assert.equal(reads,1);
    assert.deepEqual(l.db.raw.prepare("SELECT * FROM sb_mouse_commands ORDER BY id").all(),commands);
  });
});

test("software: public post-command reads and same-call click after-images both have a strict 2s release limit",async t=>{
  for(const mode of ["under_limit","at_lookup_limit","at_final_release_limit"] as const)await t.test(mode,async()=>{
    let clock=0;
    const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;l.tick(ms);}});
    const c=await pairedPhonePoint(true,undefined,l);
    await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
    l.tick(400);
    const {meta:frame}=await capturedAtPhoneMono(l,c.r,10400,2,{source_seq:2});
    const setAge=l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE frame_id=?");
    setAge.run(l.now()-1500,frame.frame_id);
    const ordinary=await liveMcp(l.service,"read_screen",{device_id:c.r.actor.id,
      max_age_ms:2000,wait_for_new_ms:0,after_command_id:c.click.command_id,after_command_min_gap_ms:300});
    assert.equal(ordinary.images.length,1);
    assert.equal(Number(ordinary.age),1500);
    assert.equal(record(ordinary.result.structuredContent.after_command).command_id,c.click.command_id);
    setAge.run(l.now()-(mode==="at_lookup_limit"?2000:1999.75),frame.frame_id);
    const clicked=await liveMcp(l.service,"click_at",{...c.args,device_id:c.r.actor.id,wait_ms:500},()=>{},
      mode==="at_final_release_limit"?async()=>{l.tick(.25);return true;}:undefined);
    const result=clicked.result.structuredContent,after=record(result.after_screen);
    assert.equal(result.state,"board_acked");
    assert.equal(result.command_id,c.click.command_id);
    assert.equal(after.age_limit_ms,2000);
    if(mode==="under_limit"){
      assert.equal(clicked.images.length,1);
      assert.equal(clicked.age,"1999.75");
      const metadata=record(after.metadata),proof=record(after.after_command);
      assert.equal(metadata.frame_id,frame.frame_id);
      assert.equal(metadata.capture_clock_verified,true);
      assert.equal(metadata.age_timing_point,"server_before_tool_result_serialization");
      assert.equal(metadata.age_ms,1999.75);
      assert.equal(proof.command_id,c.click.command_id);
      assert.equal(proof.lower_gap_ms,350);
    }else{
      assert.equal(clicked.images.length,0);
      assert.equal(clicked.age,null);
      assert.equal(after.metadata,null);
      assert.equal(after.reason,mode==="at_lookup_limit"?"NO_FRESH_FRAME":"LIVE_FRAME_FRESHNESS_UNPROVEN_AT_RELEASE");
      if(mode==="at_final_release_limit")assert.equal(after.release_failure,"frame_expired");
    }
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
  });
});

test("software: a reviewed click after-image supplies the exact next point or focused field source",async t=>{
  for(const mode of ["next_click","next_text","stale_click","stale_text"] as const)await t.test(mode,async()=>{
    const c=await pairedPhonePoint(),{l,r}=c;
    await r.mouse.result(r.actor,c.move.command_id,c.body);
    await new LEDControl(l.service).bind(r.actor,{...r.identity,...r.hardware,
      capabilities:{...r.hardware.capabilities,"hid.mouse.absolute":true,"hid.keyboard.ascii_stable":true,"sayso.focused_text":true,"sayso.focused_text.no_visual.v1":true,"sayso.action_geometry.v1":true}});
    await l.service.heartbeat(r.actor,r.beat);
    assert.equal((await r.mouse.status(alice,{device_id:r.actor.id})).focused_text_transport,"stable_usb");
    l.tick(400);
    const {meta:focus}=await capturedAtPhoneMono(l,r,10400,2,{source_seq:2});
    l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE frame_id=?").run(l.now()-1700,focus.frame_id);
    l.db.raw.prepare("UPDATE sb_observations SET acceptance_json=json_set(acceptance_json,'$.capture_lower_ms',?) WHERE frame_id=?").run(l.now()-1700,focus.frame_id);
    const first=await liveMcp(l.service,"get_mouse_result",{command_id:c.click.command_id,include_after_screen:true});
    assert.equal(first.images.length,1);
    assert.equal(first.age,"1700");
    const metadata=record(record(first.result.structuredContent.after_screen).metadata);
    assert.equal(metadata.frame_id,focus.frame_id);
    if(mode.startsWith("stale_"))l.tick(301);
    const nextBase={device_id:metadata.device_id,idempotency_key:uid(),wait_ms:0,observe_after:false};
    if(mode.endsWith("click")){
      const next=await liveMcp(l.service,"click_at",{...nextBase,source_frame_id:metadata.frame_id,x:7,y:15,
        image_width:metadata.width,image_height:metadata.height,orientation_epoch:metadata.orientation_epoch});
      const value=next.result.structuredContent;
      if(mode==="next_click"){
        const move=l.db.raw.prepare("SELECT precondition FROM sb_mouse_commands WHERE id=?").get(String(value.move_command_id));
        assert.ok(move,JSON.stringify(value));assert.equal(JSON.parse(String(move.precondition)).source_frame_id,focus.frame_id);
        assert.notEqual(value.click_command_id,c.click.command_id);
        assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,4);
      }else{
        assert.equal(next.result.isError,true);
        assert.match(String(value.error),/GEOMETRY|FRAME/);
        assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
      }
      return;
    }
    const value=await liveMcp(l.service,"type_text_in_field",{...nextBase,clear_before_input:false,text:"changi airport"});
    const typed=value.result.structuredContent;
    const commandID=String(typed.command_id);
    assert.equal(typed.kind,"keyboard.type_text");
    assert.equal(record(typed.payload).source_frame_id,undefined);
    const command=await r.mouse.claimRequest(new Request("https://test.example/v1/device/mouse/commands/claim",
      {headers:{Authorization:"Bearer "+r.token}}),async()=>({body:{...r.identity,control_epoch:typed.control_epoch,
        raw_dispatch_protocol:RAW_MOUSE_DISPATCH,point_protocol:PAIRED_MOUSE_POINT,spotlight_dispatch_protocol:SPOTLIGHT_CLAIM_START},waitMS:0}));
    assert.equal(command?.command_id,commandID);
    assert.equal(command?.state,"executing");
    const boot=r.hardware.board_boot_id;
    const typedAck=mode==="stale_text"?10704:10403;
    const released=await r.mouse.result(r.actor,commandID,{...r.identity,state:"board_acked",input_submitted:true,finished_client_mono_ms:typedAck,
      mouse_mode_confirmed:true,restored_mouse_boot_id:boot,
      board_receipt:{command_id:commandID,board_boot_id:boot,state:"executed",subcommand_index:0,
        effect:{hid_reports_sent:true,ascii_stable:true,all_released:true}}});
    assert.equal(released.text_input?.restored_mouse_boot_id,boot);
    l.tick(353);const entered=(await capturedAtPhoneMono(l,r,typedAck+350,3,{source_seq:3})).meta;
    const observed=await r.mouse.getSpotlightObserved(alice,commandID);
    assert.equal(record(record(observed.after_screen).metadata).frame_id,entered.frame_id);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,3);
  });
});

test("software: failed paired after-image returns bounded authorized D1 and Worker timing without new lookups",async()=>{
  const c=await pairedPhonePoint(false);
  c.l.tick(20);
  const old=(await capturedAtPhoneMono(c.l,c.r,10020,2,{source_seq:15})).meta;
  c.l.tick(1250);
  const frame=c.l.db.raw.prepare("SELECT capture_lower FROM sb_frames WHERE frame_id=?").get(old.frame_id)!;
  c.l.db.raw.function("julianday",(_value:unknown)=>2440587.5+(c.l.now()+7)/86400000);
  const readsBeforeClick=c.l.db.requests;
  let mono=0,receiptWaits=0,diagnosticReads=0,fixtureRPCs=0;
  const batch=c.l.db.batch.bind(c.l.db);
  c.l.db.batch=async statements=>{
    const results=await batch(statements);
    if(statements.some(s=>s.sql.includes("AS d1_read_at_utc_ms"))){diagnosticReads++;c.l.tick(14);}
    return results;
  };
  c.l.db.afterAll=sql=>{if(sql.includes("AS d1_read_at_utc_ms")){diagnosticReads++;c.l.tick(14);}};
  const service=new BridgeEngine({db:c.l.db as unknown as D1Database,bucket:c.l.service.bucket,now:c.l.now,
    readTiming:{now:()=>mono,sleep:async ms=>{mono+=ms;c.l.tick(ms);}}});
  const controller=new MouseControl(service,{now:()=>mono,sleep:async ms=>{
    mono+=ms;c.l.tick(ms);
    if(++receiptWaits===3){
      const before=c.l.db.requests;
      assert.ok(await c.r.mouse.claim(c.r.actor,c.phone,0));
      await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
      fixtureRPCs=c.l.db.requests-before;
    }
  }});
  const {wait_ms: _wait,...defaultArgs}=c.args;
  const result=await controller.clickAt(alice,{...defaultArgs,device_id:c.r.actor.id,wait_ms:6000});
  assert.equal(result.command_id,c.click.command_id);assert.equal(result.state,"board_acked");
  assert.equal(result.image,undefined);
  const timing=record(record(result.after_screen.recovery).attempt_timing),attempts=timing.attempts as Record<string,unknown>[];
  assert.equal(timing.frames_redacted,false);
  assert.equal(timing.sampled,diagnosticReads);
  assert.equal(c.l.db.requests-readsBeforeClick-fixtureRPCs,1+diagnosticReads,"one admission and one RPC per recorded snapshot");
  assert.equal(attempts.length,8);
  assert.equal(timing.dropped,diagnosticReads-attempts.length);
  assert.ok(Number(timing.dropped)>0);
  assert.equal(attempts[0].phase,"paired_snapshot");
  assert.equal(attempts[0].miss,"command_not_confirmed");
  assert.equal(attempts[0].frame_id,null);
  assert.ok(attempts.some(attempt=>attempt.phase==="post_ack"));
  for(const attempt of attempts){
    assert.equal(Number(attempt.d1_read_at_utc_ms)-Number(attempt.worker_dispatch_utc_ms),7);
    assert.equal(Number(attempt.worker_return_utc_ms)-Number(attempt.worker_dispatch_utc_ms),14);
    assert.equal(attempt.inline_jpeg_chars,0);
    if(attempt.frame_id!==null){
      assert.equal(attempt.frame_id,old.frame_id);assert.equal(attempt.frame_seq,2);
      assert.equal(attempt.capture_lower_server_utc_ms,frame.capture_lower);
      assert.equal(attempt.miss,"frame_too_old");
    }
  }
  assert.equal(attempts.at(-1)?.phase,"timeout_successor");
  assert.equal(attempts.at(-1)?.miss,"frame_too_old");
  assert.ok(!JSON.stringify(timing).includes(Buffer.from(c.r.bytes).toString("base64")));
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
  const prior=diagnosticReads;
  await service.readScreen(alice,{device_id:c.r.actor.id,after_command_id:c.click.command_id,wait_for_new_ms:0});
  assert.equal(diagnosticReads,prior,"standalone read does not project D1 timing");
});

test("software: a progressing stale paired click with an explicit total budget advances its one timeout successor",async t=>{
  for(const mode of ["advancing","missing_successor","expired_successor","changed_scope","static","before_floor"] as const)await t.test(mode,async()=>{
    const c=await pairedPhonePoint(false);
    const old=(await capturedAtPhoneMono(c.l,c.r,10020,2,{source_seq:2})).meta;
    c.l.tick(1250);
    const baseline=c.l.db.raw.prepare("SELECT metadata FROM sb_frames WHERE frame_id=?").get(old.frame_id)!;
    const oldMetadata=JSON.parse(String(baseline.metadata));
    const advances=mode!=="static",afterFloor=mode!=="before_floor";
    let mono=0,seq=2,ordinaryReads=0,successorReads=0,successorDelay=0,lastOrdinaryStart=-1,successorStart=-1;
    let lateFrame:string|undefined;
    const advance=(ms:number)=>{mono+=ms;c.l.tick(ms);};
    // Use the stored synthetic JPEG with a new verified source stamp and the
    // same geometry. 200–250ms reads age the chosen row out in flight.
    const publish=(age:number)=>{
      const frame=uid();seq++;
      const capture=afterFloor?10400+seq*250:10020+seq;
      const metadata={...oldMetadata,frame_id:frame,frame_seq:seq,source_seq:seq,capture_mono_ms:capture};
      c.l.db.raw.prepare("UPDATE sb_frames SET frame_id=?,frame_seq=?,metadata=?,capture_lower=? WHERE device_id=?")
        .run(frame,seq,JSON.stringify(metadata),c.l.now()-age,c.r.actor.id);
      return frame;
    };
    const batch=c.l.db.batch.bind(c.l.db);
    c.l.db.batch=async statements=>{
      const results=await batch(statements);
      if(statements.some(s=>s.sql.includes("AS d1_read_at_utc_ms"))&&results.some(result=>{
        const rows=result?.results;
        return Array.isArray(rows)&&rows.some(row=>row.after_state==="board_acked");
      }))publish(1800);
      return results;
    };
    c.l.db.afterAll=sql=>{
      if(!sql.includes("AS d1_read_at_utc_ms"))return;
      if(successorDelay){
        successorReads++;
        successorStart=mono;
        advance(mode==="expired_successor"?260:192);
        return;
      }
      ordinaryReads++;
      lastOrdinaryStart=mono;
      advance(250);
      if(ordinaryReads<8&&advances)publish(1800);
    };
    const service=new BridgeEngine({db:c.l.db as unknown as D1Database,bucket:c.l.service.bucket,now:c.l.now,
      readTiming:{now:()=>mono,sleep:async delay=>{
        if(ordinaryReads===8){
          successorDelay=delay;
          if(mode!=="missing_successor"){
            advance(3);
            lateFrame=publish(1750);
            if(mode==="changed_scope")c.l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");
            advance(delay-3);
            return;
          }
        }
        advance(delay);
      }}});
    let acknowledged=false;
    const controller=new MouseControl(service,{now:()=>mono,sleep:async delay=>{
      advance(delay);
      if(!acknowledged){
        acknowledged=true;
        assert.ok(await c.r.mouse.claim(c.r.actor,c.phone,0));
        await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
      }
    }});
    const {wait_ms: _wait,...defaultArgs}=c.args;
    const result=await controller.clickAt(alice,{...defaultArgs,device_id:c.r.actor.id,wait_ms:6000});
    assert.equal(result.command_id,c.click.command_id);
    assert.equal(result.state,"board_acked");
    assert.equal(ordinaryReads,8);
    assert.equal(successorReads,1);
    assert.equal(successorDelay,afterFloor&&advances?25:750);
    assert.ok(successorStart-lastOrdinaryStart>=150);
    assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
    const recovery=record(result.after_screen.recovery);
    assert.equal(recovery.retry_trigger,"paired_timeout_successor");
    if(mode==="advancing"){
      assert.equal(recovery.timeout_successor_result,"available");
      assert.equal(result.image,Buffer.from(c.r.bytes).toString("base64"));
      assert.equal(record(result.after_screen.metadata).frame_id,lateFrame);
      assert.ok(Number(record(result.after_screen.metadata).age_ms)<2000);
    }else{
      assert.equal(result.image,undefined);
      assert.notEqual(recovery.timeout_successor_result,"available");
    }
  });
});

test("software: paired attempt timing distinguishes D1 inline bytes from a frame that ages out on return",async()=>{
  const c=await pairedPhonePoint();
  await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
  c.l.tick(400);
  const frame=(await capturedAtPhoneMono(c.l,c.r,10400,2,{source_seq:16})).meta;
  const lower=c.l.now()-1985;
  c.l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE frame_id=?").run(lower,frame.frame_id);
  c.l.db.raw.function("julianday",(_value:unknown)=>2440587.5+(c.l.now()+3)/86400000);
  let mono=0,first=true;
  c.l.db.afterAll=sql=>{
    if(first&&sql.includes("AS d1_read_at_utc_ms")){first=false;c.l.tick(20);}
  };
  const service=new BridgeEngine({db:c.l.db as unknown as D1Database,bucket:c.l.service.bucket,now:c.l.now,
    readTiming:{now:()=>mono,sleep:async ms=>{mono+=ms;c.l.tick(ms);}}});
  const controller=new MouseControl(service,{now:()=>mono});
  const {wait_ms: _wait,...defaultArgs}=c.args;
  const result=await controller.clickAt(alice,{...defaultArgs,device_id:c.r.actor.id,wait_ms:6000});
  assert.equal(result.state,"board_acked");assert.equal(result.image,undefined);
  const timing=record(record(result.after_screen.recovery).attempt_timing);
  assert.equal(timing.frames_redacted,false);
  const firstRead=(timing.attempts as Record<string,unknown>[])[0];
  assert.equal(firstRead.frame_id,frame.frame_id);assert.equal(firstRead.frame_seq,2);
  assert.equal(firstRead.capture_lower_server_utc_ms,lower);
  assert.equal(Number(firstRead.d1_read_at_utc_ms)-lower,1988);
  assert.equal(Number(firstRead.worker_return_utc_ms)-lower,2005);
  assert.equal(firstRead.inline_jpeg_chars,Buffer.from(c.r.bytes).toString("base64").length);
  assert.equal(firstRead.miss,"frame_too_old");
});

test("software: paired after-image pacing retains the two-second observation cap on persistent misses",async()=>{
  const c=await pairedPhonePoint();
  await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
  let clock=0;
  const waits:number[]=[];
  const service=new BridgeEngine({db:c.l.db as unknown as D1Database,bucket:c.l.service.bucket,now:c.l.now,
    readTiming:{now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;c.l.tick(ms);}}});
  const controller=new MouseControl(service,{now:()=>clock});
  const result=await controller.clickAt(alice,{...c.args,wait_ms:6000});
  const recovery=result.after_screen.recovery as Record<string,unknown>;
  assert.equal(result.state,"board_acked");
  assert.equal(result.command_id,c.click.command_id);
  assert.equal(result.image,undefined);
  assert.equal(clock,2000);
  assert.ok(waits.every(ms=>ms>0&&ms<=500));
  assert.ok(waits.reduce((a,b)=>a+b,0)<=2000);
  assert.ok(Number(recovery.lookups)>0&&Number(recovery.lookups)<=10);
  assert.equal(recovery.budget_exhausted,true);
});

test("software: paired click_at sends the original observation gap as a capture hint", async () => {
  for (const [args, expected] of [[{}, 300], [{settle_ms: 750}, 750], [{observe_after: false}, 0]] as const) {
    const c = await pairedPhonePoint(false);
    c.l.db.raw.prepare("DELETE FROM sb_mouse_commands").run();
    const first = await c.controller.clickAt(alice, {...c.args, ...args});
    const later = await c.controller.clickAt(alice, {...c.args, settle_ms: 900});
    assert.equal(later.move_command_id, first.move_command_id);
    assert.equal(later.command_id, first.command_id);
    const grant = await c.r.mouse.claim(c.r.actor, c.phone, 0);
    assert.ok(grant);
    assert.equal(grant.precondition?.point_capture_min_gap_ms, expected);
    assert.deepEqual(Object.keys(grant.precondition?.point as object).sort(), ["click_command_id", "protocol"]);
    assert.equal(await c.r.mouse.claim(c.r.actor, c.phone, 0), null);
  }
});

test("software: paired phone point persists the two real receipts and observes only the click clock",async()=>{
  const c=await pairedPhonePoint();await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
  const m=await c.r.mouse.get(alice,c.move.command_id),k=await c.r.mouse.get(alice,c.click.command_id);
  assert.equal(m.state,"board_acked");assert.equal(k.state,"board_acked");assert.equal(m.receipt_observation.phone_ack_mono_ms,10000);assert.equal(k.receipt_observation.phone_ack_mono_ms,10050);
  c.l.tick(351);await capturedAtPhoneMono(c.l,c.r,10351,2);
  const before=c.l.db.requests;
  const value=await c.controller.clickAt(alice,{...c.args,wait_ms:6000});
  assert.equal(value.workflow,"phone_move_click_observe.v1");assert.equal(value.command_id,c.click.command_id);assert.equal(value.move_command_id,c.move.command_id);
  assert.equal(value.click_submitted,true);assert.equal(value.observation_state,"available");assert.equal(typeof value.image,"string");assert.equal(value.intermediate_landing_verified,false);
  assert.equal((value.after_screen.after_command as Record<string,unknown>).command_id,c.click.command_id);
  assert.equal(c.l.db.requests-before,2,"Current selected-device admission returns the original companion; one read-only after-image lookup follows");
});

test("software: a fresh paired click shares only eligible frame data and keeps receipts after a snapshot failure", async () => {
  for (const mode of ["ready", "boundary", "warm", "snapshot_failure", "pending_snapshot_failure"] as const) {
    const c = await pairedPhonePoint(false);
    c.l.db.raw.prepare("DELETE FROM sb_mouse_commands").run();
    const warm = mode === "warm" ? edge(c.l) : null;
    const batch = c.l.db.batch.bind(c.l.db);
    const images: {state: string, metadata: boolean, pixels: boolean}[] = [];
    let snapshotFailures = 0;
    let requestsAfterUpload = 0;
    c.l.db.batch = async statements => {
      const imageIndex = statements.findIndex(s => s.sql.includes("AS after_id"));
      const receiptPoll=statements.some(s=>s.sql.includes("AS needs_expiry"));
      if(receiptPoll){
        assert.equal(statements.length,imageIndex>=0?2:1,mode);
        assert.ok(statements.every(s=>/^(SELECT|WITH)\b/.test(s.sql)),mode);
      }
      if (imageIndex >= 0 && ((requestsAfterUpload && mode === "snapshot_failure") || mode === "pending_snapshot_failure")) {
        snapshotFailures++;
        throw new Error("Fixture image snapshot unavailable");
      }
      const changes=c.l.db.raw.prepare("SELECT total_changes() n").get()!.n;
      const rows = await batch(statements);
      if(receiptPoll)assert.equal(c.l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes,mode);
      if (imageIndex >= 0) {
        const snapshot = rows[imageIndex];
        assert.ok(snapshot && "results" in snapshot && Array.isArray(snapshot.results));
        const row = snapshot.results[0];
        assert.ok(row);
        images.push({state: String(row.after_state), metadata: typeof row.metadata === "string", pixels: typeof row.inline_jpeg === "string"});
      }
      return rows;
    };
    let mono = 0;
    let polls = 0;
    let expectedFrame: string | undefined;
    const controller = new MouseControl(warm?.service ?? c.l.service, {now: () => mono, sleep: async ms => {
      mono += ms;
      if (++polls === 1) return;
      const grant = await c.r.mouse.claim(c.r.actor, c.phone, 0);
      assert.ok(grant);
      const child = (grant as unknown as {paired_click_command: {command_id: string}}).paired_click_command;
      const body = structuredClone(c.body);
      body.board_receipt.command_id = grant.command_id;
      body.point_result.click.board_receipt.command_id = child.command_id;
      await c.r.mouse.result(c.r.actor, grant.command_id, body);
      const gap = mode === "boundary" ? 350 : 351;
      c.l.tick(gap);
      const {meta} = await capturedAtPhoneMono(c.l, c.r, 10000 + gap, 2);
      expectedFrame = meta.frame_id;
      if (warm) {
        const f = c.l.db.raw.prepare("SELECT image_key,expires_at FROM sb_frames WHERE frame_id=?").get(expectedFrame)!;
        warm.cache.put(c.r.actor.id, {owner:alice.id,session:c.r.identity.bridge_session_id,frame:expectedFrame,key:String(f.image_key),bytes:c.r.bytes,expires:Number(f.expires_at)});
      }
      requestsAfterUpload = c.l.db.requests;
    }});
    const result = await controller.clickAt(alice, {...c.args, wait_ms: 400});
    assert.equal(result.workflow, "phone_move_click_observe.v1");
    assert.equal(result.state, "board_acked");
    assert.equal(result.click_submitted, true);
    const failed = mode === "snapshot_failure" || mode === "pending_snapshot_failure";
    if (mode === "pending_snapshot_failure") assert.equal(images.length, 0);
    else assert.deepEqual(images[0], {state:"embedded",metadata:false,pixels:false}, mode);
    if (failed) assert.equal(snapshotFailures, 1);
    else assert.deepEqual(images[1], {state:"board_acked",metadata:true,pixels:mode==="ready"}, mode);
    if (mode === "boundary") {
      assert.equal(result.image, undefined);
      assert.equal(result.after_screen.reason, "WAITING_POST_COMMAND_FRAME");
    } else {
      assert.equal(result.image, Buffer.from(c.r.bytes).toString("base64"));
      assert.equal((result.after_screen.metadata as Record<string, unknown>).frame_id, expectedFrame);
      assert.equal(c.l.db.requests - requestsAfterUpload, failed ? 2 : 1);
    }
    assert.equal(await c.r.mouse.claim(c.r.actor, c.phone, 0), null, mode);
  }
});

test("software: paired polling writes expiry only after exact pending authority becomes invalid",async()=>{
  for(const change of ["expiry","stop","epoch","boot","lease","pause"] as const){
    const c=await pairedPhonePoint(false);
    const batch=c.l.db.batch.bind(c.l.db);
    const polls:{write:boolean;count:number;changed:number;needsExpiry:unknown}[]=[];
    c.l.db.batch=async statements=>{
      const receiptIndex=statements.findIndex(s=>s.sql.startsWith("SELECT c.*")&&s.sql.includes("c.id IN (?,?)"));
      const before=c.l.db.raw.prepare("SELECT total_changes() n").get()!.n;
      const rows=await batch(statements);
      if(receiptIndex>=0){
        const polled=rows[receiptIndex];
        assert.ok(polled&&"results" in polled&&Array.isArray(polled.results));
        const write=statements[0].sql.startsWith("UPDATE sb_mouse_commands");
        const changed=Number(c.l.db.raw.prepare("SELECT total_changes() n").get()!.n)-Number(before);
        polls.push({write,count:statements.length,changed,needsExpiry:polled.results[0]?.needs_expiry});
      }
      return rows;
    };
    const executing=change!=="expiry";
    let mono=0,requestsBeforePoll=0;
    const controller=new MouseControl(c.l.service,{now:()=>mono,sleep:async ms=>{
      mono+=ms;
      if(executing)assert.ok(await c.r.mouse.claim(c.r.actor,c.phone,0));
      if(change==="expiry")c.l.tick(5001);
      else c.l.db.raw.exec({
        stop:"UPDATE sb_sessions SET mouse_enabled=0",
        epoch:"UPDATE sb_sessions SET control_epoch=control_epoch+1",
        boot:"UPDATE sb_hardware SET board_boot_id='"+uid()+"'",
        lease:"UPDATE sb_devices SET worker_expires=0",
        pause:"UPDATE sb_sessions SET capture_state='paused'",
      }[change]);
      requestsBeforePoll=c.l.db.requests;
    }});
    const result=await controller.clickAt(alice,{...c.args,device_id:c.r.actor.id,wait_ms:600});
    assert.deepEqual(polls,[{write:false,count:2,changed:0,needsExpiry:1},{write:true,count:3,changed:2,needsExpiry:undefined}],change);
    assert.equal(c.l.db.requests-requestsBeforePoll,2,change);
    assert.equal(result.command_id,c.click.command_id,change);
    assert.equal(result.move_command_id,c.move.command_id,change);
    assert.equal(result.state,executing?"outcome_unknown":"expired",change);
    assert.equal(result.input_not_submitted,!executing,change);
    assert.equal(result.click_submitted,executing?null:false,change);
    assert.equal(result.error,"EXPIRED_OR_CONTROL_CHANGED",change);
    assert.equal(result.image,undefined,change);
    assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2,change);
  }
});

test("software: detected paired expiry cannot write or assert no input after the original deadline",async()=>{
  const c=await pairedPhonePoint(false);
  const batch=c.l.db.batch.bind(c.l.db);
  let mono=0,readPolls=0,repairPolls=0,requestsBeforePoll=0;
  const wait=300;
  c.l.db.batch=async statements=>{
    const receiptIndex=statements.findIndex(s=>s.sql.startsWith("SELECT c.*")&&s.sql.includes("c.id IN (?,?)"));
    const rows=await batch(statements);
    if(receiptIndex>=0){
      if(statements[0].sql.startsWith("UPDATE"))repairPolls++;
      else{
        const polled=rows[receiptIndex];
        assert.ok(polled&&"results" in polled&&Array.isArray(polled.results));
        assert.equal(polled.results[0]?.needs_expiry,1);
        readPolls++;mono=wait;
      }
    }
    return rows;
  };
  const controller=new MouseControl(c.l.service,{now:()=>mono,sleep:async ms=>{
    mono+=ms;assert.ok(await c.r.mouse.claim(c.r.actor,c.phone,0));
    c.l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");
    requestsBeforePoll=c.l.db.requests;
  }});
  const result=await controller.clickAt(alice,{...c.args,device_id:c.r.actor.id,wait_ms:wait});
  assert.equal(readPolls,1);assert.equal(repairPolls,0);
  assert.equal(c.l.db.requests-requestsBeforePoll,1);
  assert.equal(result.command_id,c.click.command_id);assert.equal(result.move_command_id,c.move.command_id);
  assert.equal(result.state,"outcome_unknown");assert.equal(result.click_submitted,null);
  assert.equal(result.input_not_submitted,false);assert.equal(result.image,undefined);
  assert.equal(c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(c.click.command_id)!.state,"executing");
});

function expiredPendingMouse(c:Awaited<ReturnType<typeof pairedPhonePoint>>,deviceID=c.r.actor.id){
  const id=uid();
  c.l.db.raw.prepare(`INSERT INTO sb_mouse_commands
    (id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,control_epoch,created_at,expires_at)
    SELECT ?,owner_id,?,session_id,hardware_id,board_boot_id,kind,payload,digest,?,'queued',control_epoch,created_at,?
    FROM sb_mouse_commands WHERE id=?`).run(id,deviceID,uid(),c.l.now()-1,c.move.command_id);
  return id;
}

test("software: unrelated expiry cannot discard an exact terminal pair or bypass the sealed image age check",async()=>{
  for(const mode of ["before_deadline","fresh_at_deadline","stale_at_deadline"] as const){
    const stale=mode==="stale_at_deadline";
    const c=await pairedPhonePoint(false),batch=c.l.db.batch.bind(c.l.db),wait=300;
    let mono=0,readPolls=0,requestsBeforePoll=0,unrelated="",frame="";
    c.l.db.batch=async statements=>{
      const receiptIndex=statements.findIndex(s=>s.sql.startsWith("SELECT c.*")&&s.sql.includes("c.id IN (?,?)"));
      const rows=await batch(statements);
      if(receiptIndex>=0){
        assert.equal(statements.length,2);
        assert.ok(statements.every(s=>/^(SELECT|WITH)\b/.test(s.sql)));
        const polled=rows[receiptIndex];
        assert.ok(polled&&"results" in polled&&Array.isArray(polled.results));
        assert.equal(polled.results.length,2);
        assert.ok(polled.results.every(row=>row.needs_expiry===1&&row.state==="board_acked"));
        readPolls++;
        if(mode!=="before_deadline")mono=wait;
        if(stale)c.l.tick(2000);
      }
      return rows;
    };
    const controller=new MouseControl(c.l.service,{now:()=>mono,sleep:async ms=>{
      mono+=ms;
      assert.ok(await c.r.mouse.claim(c.r.actor,c.phone,0));
      await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
      c.l.tick(400);
      frame=(await capturedAtPhoneMono(c.l,c.r,10400,2)).meta.frame_id;
      unrelated=expiredPendingMouse(c);
      requestsBeforePoll=c.l.db.requests;
    }});
    const result=await controller.clickAt(alice,{...c.args,device_id:c.r.actor.id,wait_ms:wait});
    assert.equal(readPolls,1);
    assert.equal(c.l.db.requests-requestsBeforePoll,1);
    assert.equal(result.command_id,c.click.command_id);assert.equal(result.move_command_id,c.move.command_id);
    assert.equal(result.state,"board_acked");assert.equal(result.click_submitted,true);
    assert.deepEqual(result.board_receipt,c.body.point_result.click.board_receipt);
    assert.equal(result.receipt_observation.valid_for_capture_order,true);
    assert.equal(result.image,stale?undefined:Buffer.from(c.r.bytes).toString("base64"));
    if(!stale){
      assert.equal(record(result.after_screen.metadata).frame_id,frame);
      assert.equal(record(result.after_screen.after_command).command_id,c.click.command_id);
    }
    assert.equal(c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(unrelated)!.state,"queued");
    assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,3);
  }
});

test("software: receipt-only paired polling retains device-wide expiry and ignores a foreign device",async()=>{
  const c=await pairedPhonePoint(false),other=(await paired(c.l)).actor.id;
  let sameDevice="",foreignDevice="";
  const batch=c.l.db.batch.bind(c.l.db),polls:number[]=[];
  c.l.db.batch=async statements=>{
    if(statements.some(s=>s.sql.startsWith("SELECT c.*")&&s.sql.includes("c.id IN (?,?)"))){
      assert.ok(statements.every(s=>!s.sql.includes("AS after_id")));
      polls.push(statements.length);
    }
    return batch(statements);
  };
  let mono=0,sleeps=0;
  const state=(id:string)=>c.l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(id)!.state;
  const controller=new MouseControl(c.l.service,{now:()=>mono,sleep:async ms=>{
    mono+=ms;
    if(++sleeps===1){
      sameDevice=expiredPendingMouse(c);
      foreignDevice=expiredPendingMouse(c,other);
    }else{
      assert.equal(state(sameDevice),"expired");assert.equal(state(foreignDevice),"queued");
      assert.ok(await c.r.mouse.claim(c.r.actor,c.phone,0));
      await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
    }
  }});
  const result=await controller.clickAt(alice,{...c.args,device_id:c.r.actor.id,observe_after:false,wait_ms:600});
  assert.deepEqual(polls,[1,2,1]);
  assert.equal(result.command_id,c.click.command_id);assert.equal(result.state,"board_acked");
  assert.equal(result.observation_state,"not_requested");assert.equal(result.image,undefined);
  assert.equal(state(foreignDevice),"queued");
});

test("software: paired phone point retry retains identities after capability loss and expiry",async()=>{
  const c=await pairedPhonePoint();c.l.db.raw.prepare("DELETE FROM sb_mouse_point_ready").run();
  const again=await c.controller.clickAt(alice,c.args);assert.equal(again.move_command_id,c.move.command_id);assert.equal(again.command_id,c.click.command_id);assert.equal(again.click_submitted,null);
  c.l.tick(5001);const expired=await c.controller.clickAt(alice,c.args);
  assert.equal(expired.move_command_id,c.move.command_id);assert.equal(expired.command_id,c.click.command_id);assert.equal(expired.state,"outcome_unknown");
  await assert.rejects(c.controller.clickAt(alice,{...c.args,x:8}),/IDEMPOTENCY_CONFLICT/);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
});

test("software: paired phone point cannot be claimed by old clients or stale control",async()=>{
  const c=await pairedPhonePoint(false),old={...c.phone};delete (old as Record<string,unknown>).point_protocol;
  assert.equal(await c.r.mouse.claim(c.r.actor,old,0),null);assert.equal(await c.r.mouse.claim(c.r.actor,{...c.phone,control_epoch:c.phone.control_epoch+1},0),null);
  assert.equal((await c.r.mouse.get(alice,c.move.command_id)).state,"queued");assert.equal((await c.r.mouse.get(alice,c.click.command_id)).state,"embedded");
});

test("software: paired phone point never accepts a click receipt without a confirmed move",async()=>{
  const c=await pairedPhonePoint(),body=structuredClone(c.body) as Record<string,unknown>;
  body.state="outcome_unknown";body.board_receipt={};body.finished_client_mono_ms=null;body.error="USB_OUTCOME_UNKNOWN";
  await assert.rejects(c.r.mouse.result(c.r.actor,c.move.command_id,body),/POINT_CLICK_WITHOUT_MOVE/);
  assert.equal((await c.r.mouse.get(alice,c.move.command_id)).state,"executing");assert.equal((await c.r.mouse.get(alice,c.click.command_id)).state,"executing");
});

test("software: paired phone point rejects wrong child or board before either receipt commits",async()=>{
  for(const fault of ["id","board","clock","payload"]){
    const c=await pairedPhonePoint(),body=structuredClone(c.body);
    if(fault==="id")body.point_result.click.board_receipt.command_id=uid();
    if(fault==="board")body.point_result.click.board_receipt.board_boot_id=uid();
    if(fault==="clock")body.point_result.click.finished_client_mono_ms=9999;
    if(fault==="payload")body.board_receipt.effect.absolute_requested_x=1;
    await assert.rejects(c.r.mouse.result(c.r.actor,c.move.command_id,body),/INVALID_POINT_RECEIPT|POINT_ACK_ORDER|ABSOLUTE_RECEIPT_MISMATCH/);
    assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE result_digest IS NOT NULL").get()!.n,0,fault);
  }
});

test("software: paired phone point direct child uploads cannot bypass parent receipt validation",async()=>{
  const c=await pairedPhonePoint();
  await assert.rejects(c.r.mouse.result(c.r.actor,c.click.command_id,{...c.r.identity,...c.body.point_result.click}),/POINT_CHILD_RESULT_REQUIRES_PARENT/);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE result_digest IS NOT NULL").get()!.n,0);
});

test("software: paired phone point known no-input result remains known after the server deadline",async()=>{
  const c=await pairedPhonePoint();c.l.tick(5001);
  const fail={state:"failed",input_submitted:false,board_receipt:{},finished_client_mono_ms:null,error:"MOUSE_DISPATCH_BUDGET_EXPIRED"};
  await c.r.mouse.result(c.r.actor,c.move.command_id,{...c.r.identity,...fail,point_result:{protocol:PAIRED_MOUSE_POINT,click:{...fail,error:"POINT_CLICK_NOT_SUBMITTED"}}});
  for(const id of [c.move.command_id,c.click.command_id]){const r=await c.r.mouse.get(alice,id);assert.equal(r.state,"failed");assert.equal(r.input_not_submitted,true);assert.equal(r.receipt_observation.valid_for_capture_order,false);}
});

test("software: paired phone point unknown move or click is retained without replacement input",async()=>{
  for(const stage of ["move","click"]){
    const c=await pairedPhonePoint(),unknown={state:"outcome_unknown",input_submitted:true,board_receipt:{},finished_client_mono_ms:null,error:"USB_OUTCOME_UNKNOWN"};
    const body=stage==="move"?{...c.r.identity,...unknown,point_result:{protocol:PAIRED_MOUSE_POINT,click:{state:"failed",input_submitted:false,board_receipt:{},finished_client_mono_ms:null,error:"POINT_CLICK_NOT_SUBMITTED"}}}:{...c.body,point_result:{protocol:PAIRED_MOUSE_POINT,click:unknown}};
    await c.r.mouse.result(c.r.actor,c.move.command_id,body);
    const value=await c.controller.clickAt(alice,c.args);assert.equal(value.image,undefined);assert.equal(value.move_command_id,c.move.command_id);assert.equal(value.command_id,c.click.command_id);
    assert.equal(value.state,stage==="move"?"failed":"outcome_unknown");assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
  }
});

test("software: paired phone point revoked scope cannot commit either acknowledgement",async()=>{
  for(const fault of ["control","boot","worker","grant","capture","revoked"]){
    const c=await pairedPhonePoint(),batch=c.l.db.batch.bind(c.l.db);let changed=false;
    c.l.db.batch=async statements=>{if(!changed){changed=true;const sql={control:"UPDATE sb_sessions SET control_epoch=control_epoch+1",boot:"UPDATE sb_hardware SET board_boot_id='"+uid()+"'",worker:"UPDATE sb_devices SET lease_epoch=lease_epoch+1",grant:"UPDATE sb_sessions SET mouse_enabled=0,mouse_until=0",capture:"UPDATE sb_sessions SET capture_state='paused'",revoked:"UPDATE sb_devices SET revoked=1"}[fault]!;c.l.db.raw.exec(sql);}return batch(statements);};
    await assert.rejects(c.r.mouse.result(c.r.actor,c.move.command_id,c.body),/STALE_MOUSE_RECEIPT|STALE_POINT_RECEIPT/,fault);
    assert.equal(changed,true);assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE state='board_acked'").get()!.n,0,fault);
  }
});

test("software: paired phone point duplicate result is idempotent and conflicting result is rejected",async()=>{
  const c=await pairedPhonePoint();await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
  const bad=structuredClone(c.body);bad.point_result.click.finished_client_mono_ms=10051;
  await assert.rejects(c.r.mouse.result(c.r.actor,c.move.command_id,bad),/RESULT_CONFLICT/);
  assert.equal((await c.r.mouse.get(alice,c.click.command_id)).receipt_observation.phone_ack_mono_ms,10050);
});

test("software: paired phone point concurrent claimers have exactly one parent and companion winner",async()=>{
  const c=await pairedPhonePoint(false),claims=await Promise.all([c.r.mouse.claim(c.r.actor,c.phone,0),c.r.mouse.claim(c.r.actor,c.phone,0)]);
  const winners=claims.filter(Boolean);assert.equal(winners.length,1);assert.equal(winners[0]!.command_id,c.move.command_id);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE state='executing'").get()!.n,2);
});

test("software: paired phone point late positive receipts stay unknown with their evidence intact",async()=>{
  const c=await pairedPhonePoint();c.l.tick(5001);
  await assert.rejects(c.r.mouse.result(c.r.actor,c.move.command_id,c.body),/STALE_POINT_RECEIPT/);
  for(const id of [c.move.command_id,c.click.command_id]){
    const r=await c.r.mouse.get(alice,id);assert.equal(r.state,"outcome_unknown");assert.equal((r.board_receipt as Record<string,unknown>).command_id,id);assert.equal(r.receipt_observation.valid_for_capture_order,false);
  }
});

test("software: paired phone point child mutation during commit cannot leave a half-accepted result",async()=>{
  const c=await pairedPhonePoint(),batch=c.l.db.batch.bind(c.l.db);let changed=false;
  c.l.db.batch=async statements=>{if(!changed){changed=true;c.l.db.raw.prepare("UPDATE sb_mouse_commands SET payload='{\"button\":\"right\"}' WHERE id=?").run(c.click.command_id);}return batch(statements);};
  await assert.rejects(c.r.mouse.result(c.r.actor,c.move.command_id,c.body),/STALE_POINT_RECEIPT/);
  assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE state='board_acked'").get()!.n,0);
});

test("software: paired phone point capability can be withdrawn without claiming a queued point",async()=>{
  const c=await pairedPhonePoint(false);assert.equal(await c.r.mouse.claim(c.r.actor,{...c.phone,point_protocol:null},0),null);
  assert.equal((await c.r.mouse.status(alice,{})).point_protocol,null);assert.equal((await c.r.mouse.get(alice,c.move.command_id)).state,"queued");
});

test("software: paired phone point declaration without raw pregrant is rejected before mutation",async()=>{
  const l=lab(),r=await mouseReady(l);
  await assert.rejects(r.mouse.claim(r.actor,{...r.identity,point_protocol:PAIRED_MOUSE_POINT},0),/POINT_REQUIRES_RAW_PREGRANT/);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_point_ready").get()!.n,0);
});

test("software: paired phone point capability never turns an explicit move-only request into a click",async()=>{
  const c=await pairedPhonePoint(false);c.l.db.raw.prepare("DELETE FROM sb_mouse_commands").run();
  const move=await c.controller.enqueue(alice,"pointer.move_absolute",{...c.args,idempotency_key:uid()});
  assert.equal((move.precondition as Record<string,unknown>).point,undefined);assert.equal(c.l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
});

test("software: paired phone point tampered embedded companion prevents the parent grant",async()=>{
  const c=await pairedPhonePoint(false);c.l.db.raw.prepare("UPDATE sb_mouse_commands SET board_boot_id=? WHERE id=?").run(uid(),c.click.command_id);
  assert.equal(await c.r.mouse.claim(c.r.actor,c.phone,0),null);assert.equal((await c.r.mouse.get(alice,c.move.command_id)).state,"queued");
});

test("software: paired phone point long-poll registers once and obeys one monotonic budget",async()=>{
  const l=lab(),r=await mouseReady(l),control=(await r.mouse.status(alice,{})).control_epoch,batch=l.db.batch.bind(l.db);let mono=0,registers=0,attempts=0,scopeReads=0;
  l.db.batch=async statements=>{attempts++;registers+=statements.filter(s=>s.sql.startsWith("INSERT INTO sb_mouse_point_ready")).length;scopeReads+=statements.filter(s=>s.sql.includes("AS checked_at_ms")).length;return batch(statements);};
  const controller=new MouseControl(l.service,{now:()=>mono,sleep:async ms=>{mono+=ms;}});
  assert.equal(await controller.claim(r.actor,{...r.identity,control_epoch:control,raw_dispatch_protocol:rawDispatchProtocol,point_protocol:PAIRED_MOUSE_POINT},550),null);
  assert.equal(mono,550);assert.equal(registers,1);assert.equal(scopeReads,1);assert.equal(attempts,3);
});

test("software: raw phone claim counts an empty lookup toward the next attempt interval",async()=>{
  for(const elapsed of [90.25,320,420]){
    const c=await pairedPhonePoint(false);
    c.l.db.raw.prepare("DELETE FROM sb_mouse_commands").run();
    const batch=c.l.db.batch.bind(c.l.db),starts:number[]=[],waits:number[]=[];
    let mono=0,moveID:string|undefined;
    c.l.db.batch=async statements=>{
      const claiming=statements.some(s=>s.sql.includes("WHEN ?=1 AND kind IN"));
      if(claiming)starts.push(mono);
      const result=await batch(statements);
      if(claiming&&starts.length===1){
        mono+=elapsed;
        const point=await c.controller.clickAt(alice,{...c.args,observe_after:false});
        moveID=point.move_command_id;
      }
      return result;
    };
    const mouse=new MouseControl(c.l.service,{now:()=>mono,sleep:async ms=>{waits.push(ms);mono+=ms;}});
    const result=await mouse.claim(c.r.actor,c.phone,400);
    assert.equal(result?.command_id,elapsed<400?moveID:undefined);
    assert.deepEqual(starts,elapsed<250?[0,250.25]:elapsed<400?[0,320]:[0]);
    assert.deepEqual(waits,elapsed<250?[160]:[]);
  }
});

test("software: opt-in raw claim starts one command atomically without a separate start request",async()=>{
  const l=lab(),r=await mouseReady(l),command=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  const before=l.db.requests,reply=await r.mouse.claim(r.actor,{...r.identity,control_epoch:command.control_epoch,raw_dispatch_protocol:rawDispatchProtocol},0) as unknown as Record<string,unknown>;
  assert.equal(reply.state,"executing");assert.equal(reply.command_id,command.command_id);assert.equal(reply.raw_dispatch_protocol,rawDispatchProtocol);
  assert.equal(l.db.requests-before,1,"One live session and pregrant transaction; no separate session or start request");
  assert.equal(reply.ttl_remaining_ms,2500);assert.ok(Number(reply.claim_pregrant_elapsed_ms)>=0);
  assert.equal(reply.verification,"not_confirmed");assert.equal(reply.app_effect_observed,false);
  assert.equal((await r.mouse.get(alice,command.command_id)).state,"executing");
  await assert.rejects(r.mouse.start(r.actor,command.command_id,{...r.identity,control_epoch:command.control_epoch}),/MOUSE_EXPIRED_OR_CONTROL_CHANGED/);
  const ack=await r.mouse.result(r.actor,command.command_id,{...r.identity,state:"board_acked",finished_client_mono_ms:10000,
    board_receipt:{command_id:command.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}}});
  assert.equal(ack.state,"board_acked");
});

test("software: raw pregrant rejects unknown protocols and stale control before claiming",async()=>{
  const l=lab(),r=await mouseReady(l),command=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  await assert.rejects(r.mouse.claim(r.actor,{...r.identity,control_epoch:command.control_epoch,raw_dispatch_protocol:"unsupported"},0),/INVALID_RAW_DISPATCH_PROTOCOL/);
  await assert.rejects(r.mouse.claim(r.actor,{...r.identity,raw_dispatch_protocol:rawDispatchProtocol},0),/INVALID_NUMBER/);
  assert.equal(await r.mouse.claim(r.actor,{...r.identity,control_epoch:command.control_epoch+1,raw_dispatch_protocol:rawDispatchProtocol},0),null);
  assert.equal((await r.mouse.get(alice,command.command_id)).state,"queued");
});

test("software: raw pregrant transaction rechecks revocation USB board and control changes",async()=>{
  for(const fault of ["revoke","usb","board","control"]){
    const l=lab(),r=await mouseReady(l),command=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0}),batch=l.db.batch.bind(l.db);
    l.db.batch=async statements=>{
      if(fault==="revoke")l.db.raw.prepare("UPDATE sb_sessions SET mouse_enabled=0 WHERE id=?").run(r.identity.bridge_session_id);
      if(fault==="usb")l.db.raw.prepare("UPDATE sb_hardware SET usb_connected=0 WHERE device_id=?").run(r.actor.id);
      if(fault==="board")l.db.raw.prepare("UPDATE sb_hardware SET board_boot_id=? WHERE device_id=?").run(uid(),r.actor.id);
      if(fault==="control")l.db.raw.prepare("UPDATE sb_sessions SET control_epoch=control_epoch+1 WHERE id=?").run(r.identity.bridge_session_id);
      return batch(statements);
    };
    assert.equal(await r.mouse.claim(r.actor,{...r.identity,control_epoch:command.control_epoch,raw_dispatch_protocol:rawDispatchProtocol},0),null,fault);
    assert.notEqual(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(command.command_id)!.state,"executing",fault);
  }
});

test("software: raw pregrant has one winner and a lost delivery cannot be issued again",async()=>{
  const l=lab(),r=await mouseReady(l),command=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0}),body={...r.identity,control_epoch:command.control_epoch,raw_dispatch_protocol:rawDispatchProtocol};
  const winners=(await Promise.all([r.mouse.claim(r.actor,body,0),r.mouse.claim(r.actor,body,0)])).filter(Boolean);
  assert.equal(winners.length,1);assert.equal(winners[0]!.state,"executing");assert.equal(await r.mouse.claim(r.actor,body,0),null);
  l.tick(5001);assert.equal((await r.mouse.get(alice,command.command_id)).state,"outcome_unknown");
  const settled=await r.mouse.result(r.actor,command.command_id,{...r.identity,state:"failed",board_receipt:{},error:"MOUSE_DISPATCH_BUDGET_EXPIRED"});
  assert.equal(settled.state,"failed");assert.equal(settled.input_not_submitted,true);
});

test("software: raw claim reports only the monotonic prefix before its TTL snapshot and never renews expiry",async()=>{
  const l=lab(),r=await mouseReady(l),command=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0}),batch=l.db.batch.bind(l.db);let mono=0;
  l.db.batch=async statements=>{const result=await batch(statements);mono+=900;l.tick(900);return result;};
  const controller=new MouseControl(l.service,{now:()=>mono}),reply=await controller.claim(r.actor,{...r.identity,control_epoch:command.control_epoch,raw_dispatch_protocol:rawDispatchProtocol},0) as unknown as Record<string,unknown>;
  assert.equal(reply.state,"executing");assert.equal(reply.claim_pregrant_elapsed_ms,900);assert.equal(reply.ttl_remaining_ms,2500);assert.equal(reply.expires_at,command.expires_at);
});

test("software: a committed paired point can advance one scoped raw claim lookup",async t=>{
  for(const mode of ["same_process","different_process","different_control","lost_race","slow_lost_race","deadline"] as const)await t.test(mode,async()=>{
    const l=lab(),r=await mouseReady(l);
    l.db.raw.prepare("UPDATE sb_hardware SET metadata=? WHERE device_id=?").run(
      JSON.stringify({...r.hardware,capabilities:{...r.hardware.capabilities,"hid.mouse.absolute":true,"sayso.action_geometry.v1":true}}),r.actor.id);
    const control=(await r.mouse.status(alice,{})).control_epoch;
    const phone={...r.identity,control_epoch:control,raw_dispatch_protocol:rawDispatchProtocol,point_protocol:PAIRED_MOUSE_POINT};
    assert.equal(await r.mouse.claim(r.actor,phone,0),null);
    const {meta:source}=await capturedAtPhoneMono(l,r,9999,1,{source_seq:1});

    const waitingHints=new PointClaimHints();
    const producerHints=mode==="different_process"||mode==="different_control"?new PointClaimHints():waitingHints;
    const lostRace=mode==="lost_race"||mode==="slow_lost_race";
    let clock=0,injecting=false;
    const producer=new MouseControl(l.service,{claimHints:producerHints,now:()=>clock});
    let admission:Awaited<ReturnType<MouseControl["enqueue"]>>|undefined;
    let winner:Awaited<ReturnType<MouseControl["claim"]>>|undefined;
    const starts:number[]=[];
    const batch=l.db.batch.bind(l.db);
    l.db.batch=async statements=>{
      if(!injecting)starts.push(clock);
      const result=await batch(statements);
      if(!injecting&&mode==="slow_lost_race"&&starts.length===2){l.tick(300);clock+=300;}
      return result;
    };
    const waiting=new MouseControl(l.service,{claimHints:waitingHints,now:()=>clock,sleep:async ms=>{
      const end=clock+ms;
      if(!admission&&end>=80){
        l.tick(80-clock);clock=80;
        injecting=true;
        try{
          admission=await producer.enqueue(alice,"pointer.move_absolute",{
            device_id:r.actor.id,source_frame_id:source.frame_id,
            x:7,y:15,image_width:16,image_height:32,orientation_epoch:0,idempotency_key:uid(),wait_ms:0
          },undefined,undefined,{clickKey:uid(),captureMinGapMS:300,sourceFrameID:source.frame_id,geometryOnly:true});
          assert.equal(admission.state,"queued");
          if(mode==="different_control")waitingHints.record({owner:alice.id,device:r.actor.id,session:r.identity.bridge_session_id,
            worker:r.identity.worker_id,lease:r.identity.lease_epoch,control:control+1},l.now(),l.now()+5000);
          if(lostRace)winner=await r.mouse.claim(r.actor,phone,0);
        }finally{injecting=false;}
      }
      l.tick(end-clock);clock=end;
    }});
    const grant=await waiting.claim(r.actor,phone,mode==="deadline"?250:650);
    assert.ok(admission);
    const early=mode==="same_process";
    assert.deepEqual(starts,lostRace?[0,125,mode==="slow_lost_race"?550:500]:mode==="deadline"?[0]:[0,early?125:250]);
    assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_mouse_commands").get()!.n,2);
    if(lostRace||mode==="deadline"){
      assert.equal(grant,null);
      if(lostRace)assert.equal(winner?.command_id,admission.command_id);
      return;
    }
    assert.ok(grant&&"claim_pregrant_elapsed_ms" in grant);
    assert.equal(grant.command_id,admission.command_id);
    assert.equal(grant.expires_at,admission.expires_at);
    assert.equal(grant.paired_click_command?.predecessor_command_id,admission.command_id);
    assert.equal(grant.claim_pregrant_elapsed_ms,early?125:250);
    assert.equal(grant.claim_poll_advance_ms,early?125:undefined);
  });
});

test("software: combined point action pending movement is not a click and options are checked before input",async()=>{
  const l=lab(),r=await mouseReady(l);await capturedAtPhoneMono(l,r,9999);
  l.db.raw.prepare("UPDATE sb_hardware SET metadata=? WHERE device_id=?").run(JSON.stringify({...r.hardware,capabilities:{...r.hardware.capabilities,"hid.mouse.absolute":true}}),r.actor.id);
  const args={x:7,y:15,image_width:16,image_height:32,orientation_epoch:0,idempotency_key:uid(),wait_ms:0};
  await assert.rejects(r.mouse.clickAt(alice,{...args,observe_after:null}),/INVALID_ARGUMENTS/);
  await assert.rejects(r.mouse.clickAt(alice,{...args,settle_ms:2001}),/INVALID_NUMBER/);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,0);
  await assert.rejects(r.mouse.clickAt(alice,args),/INVALID_UUID/);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,0);
});

test("software: client post-input tag does not block an authenticated JPEG or become control authority",async()=>{
  const l=lab(),r=await running(l),e=edge(l),tag=uid(),meta={...r.metadata,after_command_id:tag};
  const receipt=await e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),meta,async()=>r.bytes);
  assert.equal(receipt.accepted_frame_id,meta.frame_id);assert.equal(meta.after_command_id,tag);
  const stored=JSON.parse(String(l.db.raw.prepare("SELECT metadata FROM sb_frames WHERE device_id=?").get(r.actor.id)!.metadata));
  assert.equal(stored.after_command_id,undefined);assert.equal(stored.capture_mono_ms,meta.capture_mono_ms);
  const image=await e.service.readScreen(alice,{wait_for_new_ms:0});
  assert.equal(image.state,"available");assert.deepEqual(Buffer.from(image.image!,"base64"),Buffer.from(r.bytes));
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,0);
  assert.equal(l.db.raw.prepare("SELECT mouse_enabled FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!.mouse_enabled,0);
  const after=await e.service.readScreen(alice,{after_command_id:tag,wait_for_new_ms:0});
  assert.equal(after.image,undefined,"A claimed tag cannot create a real receipt");
});

test("software: client post-input tag permits same-image observation but is never stored",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const meta={...r.metadata,frame_id:uid(),frame_seq:2,capture_mono_ms:10001,capture_offset_ms:1,after_command_id:uid()};
  const device=await e.service.authenticate(new Request("https://test.example/frame-observation",{headers:{Authorization:"Bearer "+r.token}}));
  const receipt=await e.service.acceptFrame(device,meta);
  assert.equal(receipt.accepted_frame_id,meta.frame_id);
  const stored=JSON.parse(String(l.db.raw.prepare("SELECT metadata FROM sb_frames WHERE device_id=?").get(r.actor.id)!.metadata));
  assert.equal(stored.after_command_id,undefined);assert.equal(stored.capture_mono_ms,10001);
  assert.equal((await e.service.readScreen(alice,{wait_for_new_ms:0})).metadata?.frame_id,meta.frame_id);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,0);
});

test("software: client post-input tag cannot replace actual capture-after-receipt ordering",async()=>{
  for(const mono of [9999,10000,10001]) {
    const l=lab(),r=await acknowledgedMouse(l),e=edge(l);
    const meta={...r.metadata,frame_id:uid(),capture_mono_ms:mono,capture_offset_ms:mono-10000,
      captured_at:new Date(l.now()+mono-10000).toISOString(),after_command_id:r.command.command_id};
    await e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),meta,async()=>r.bytes);
    const read=await e.service.readScreen(alice,{after_command_id:r.command.command_id,wait_for_new_ms:0});
    assert.equal(read.state,mono>10000?"available":"unavailable");
    if(mono<=10000){assert.equal(read.reason,"WAITING_POST_COMMAND_FRAME");assert.equal(read.image,undefined);}
    else {assert.equal((read.after_command as Record<string,unknown>).lower_gap_ms,1);assert.equal((read.after_command as Record<string,unknown>).app_effect_observed,false);}
  }
});

test("software: client post-input tag cannot refresh an old frame or verify an unknown clock",async()=>{
  for(const fault of ["stale","unverified"]) {
    const l=lab(),r=await running(l),e=edge(l),meta={...r.metadata,after_command_id:uid()};
    if(fault==="stale")l.tick(1450);else meta.capture_clock_verified=false;
    await assert.rejects(e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),meta,async()=>r.bytes),fault==="stale"?/OLD_CAPTURE/:/CLOCK_UNCERTAIN/);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_frames").get()!.n,0);
  }
});

test("software: client post-input tag must be a UUID and cannot make an invalid payload read image bytes",async()=>{
  for(const tag of ["not-a-command",false,0,""]) {
    const l=lab(),r=await running(l),e=edge(l);let bodyRead=false;
    await assert.rejects(e.service.acceptFrameRequest(new Request("https://test.example/frame",{headers:{Authorization:"Bearer "+r.token}}),{...r.metadata,after_command_id:tag},async()=>{bodyRead=true;return r.bytes;}),/INVALID_UUID/);
    assert.equal(bodyRead,false);assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_frames").get()!.n,0);
  }
});

test("software: phone ack clock survives receipt storage/replay without modifying the board receipt",async()=>{
  const l=lab(),r=await acknowledgedMouse(l,10000.25),read=await r.mouse.get(alice,r.command.command_id);
  assert.equal(l.db.raw.prepare("SELECT phone_ack_mono_ms FROM sb_mouse_commands WHERE id=?").get(r.command.command_id)!.phone_ack_mono_ms,10000.25);
  assert.deepEqual(read.board_receipt,r.body.board_receipt);assert.equal(read.receipt_observation.phone_clock,"iphone_system_uptime_ms");
  assert.equal(read.receipt_observation.phone_ack_mono_ms,10000.25);assert.equal(read.receipt_observation.valid_for_capture_order,true);
  assert.equal(read.app_effect_observed,false);assert.equal(read.receipt_observation.app_effect_observed,false);
  assert.equal((await r.mouse.result(r.actor,r.command.command_id,r.body)).receipt_observation.phone_ack_mono_ms,10000.25);
});

test("software: invalid phone clocks cannot become completion observations",async()=>{
  const l=lab(),r=await mouseReady(l),command=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,command.command_id,{...r.identity,control_epoch:command.control_epoch});
  for(const mono of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])await assert.rejects(r.mouse.result(r.actor,command.command_id,{...r.identity,state:"board_acked",board_receipt:{command_id:command.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}},finished_client_mono_ms:mono}),/INVALID_BOARD_RECEIPT/);
  const row=l.db.raw.prepare("SELECT state,phone_ack_mono_ms FROM sb_mouse_commands WHERE id=?").get(command.command_id)!;
  assert.equal(row.state,"executing");assert.equal(row.phone_ack_mono_ms,null);
});

test("software: image snapshot exposes actual source clock/scope without another database lookup",async()=>{
  const l=lab(),r=await running(l),{e,meta}=await capturedAtPhoneMono(l,r,10001);
  const before=l.db.requests,read=await e.service.readScreen(alice,{},0,false);
  assert.equal(l.db.requests-before,1);assert.equal(read.metadata?.device_id,r.actor.id);assert.equal(read.metadata?.bridge_session_id,r.identity.bridge_session_id);
  assert.equal(read.metadata?.worker_id,r.identity.worker_id);assert.equal(read.metadata?.lease_epoch,r.identity.lease_epoch);
  assert.equal(read.metadata?.phone_clock,"iphone_system_uptime_ms");assert.equal(read.metadata?.capture_lower_phone_mono_ms,meta.capture_mono_ms);
  assert.equal(read.metadata?.capture_clock_verified,true);assert.equal(read.metadata?.frame_id,meta.frame_id);
});

test("software: post-command image uses the phone clock rather than ESP uptime or server wall time",async()=>{
  for(const mono of [9999,10000,10001]){
    const l=lab(),r=await acknowledgedMouse(l),{e}=await capturedAtPhoneMono(l,r,mono),before=l.db.requests;
    const read=await e.service.readScreen(alice,{after_command_id:r.command.command_id,wait_for_new_ms:0});
    assert.equal(l.db.requests-before,1);assert.equal(read.state,mono>10000?"available":"unavailable");
    if(mono<=10000){assert.equal(read.reason,"WAITING_POST_COMMAND_FRAME");assert.equal(read.image,undefined);assert.equal(read.trace?.d1_inline_jpeg_chars,0);}
    else {const proof=read.after_command as Record<string,unknown>;assert.equal(proof.relation,"capture_after_phone_board_ack");assert.equal(proof.lower_gap_ms,1);assert.equal(proof.app_effect_observed,false);}
  }
});

test("software: post-command retry rechecks authority while retaining current pixel cache under delayed reads",async(t)=>{
  for(const mode of ["warm_cache","warm_edge","evicted_cache","edge_wrong_scope","control_changed","forced_inline"] as const)await t.test(mode,async()=>{
    let clock=0;
    const l=lab(),r=await acknowledgedMouse(l),uploader=edge(l),origin=l.now();
    await uploader.service.acceptFrame(r.actor,{...r.metadata,frame_id:uid(),frame_seq:1,
      capture_mono_ms:9999,capture_offset_ms:-1,captured_at:new Date(origin-1).toISOString()},r.bytes);
    l.tick(690);
    const freshID=uid();let snapshots=0;
    const edgeEntries=new Map<string,Response>(),store={match:async(q:Request)=>edgeEntries.get(q.url)?.clone(),put:async(q:Request,v:Response)=>{edgeEntries.set(q.url,v.clone());},delete:async(q:Request)=>edgeEntries.delete(q.url)};
    const pixels=new PrivatePixelCache("https://test.example",async()=>store,l.now);
    const prepare=l.db.prepare.bind(l.db);
    l.db.prepare=sql=>{
      const statement=prepare(sql);
      if(sql.startsWith("WITH candidates AS")){
        const bind=statement.bind.bind(statement);
        statement.bind=(...values:unknown[])=>{
          const bound=bind(...values),all=bound.all.bind(bound);
          bound.all=async<T>()=>{
            const rows=await all<T>();snapshots++;
            // Synthetic IO replay: metadata-only ~250ms, JPEG response ~750ms.
            // These ranges are based on the retained live read-handler traces;
            // this test is not a physical network benchmark.
            const inline=rows.results.some(row=>typeof record(row).inline_jpeg==="string"&&String(record(row).inline_jpeg).length>0);
            const delay=inline?750:250;clock+=delay;l.tick(delay);
            if(snapshots===1){
              await uploader.service.acceptFrame(r.actor,{...r.metadata,frame_id:freshID,frame_seq:2,
                capture_mono_ms:10520,capture_offset_ms:520,captured_at:new Date(origin+520).toISOString()},r.bytes);
              if(mode==="warm_edge"||mode==="edge_wrong_scope"){
                const frame=l.db.raw.prepare("SELECT image_key,expires_at FROM sb_frames WHERE device_id=?").get(r.actor.id)!;
                await pixels.put({owner:alice.id,device:r.actor.id,session:mode==="edge_wrong_scope"?uid():r.identity.bridge_session_id,
                  key:String(frame.image_key),sha256:r.metadata.content_sha256,bytes:r.bytes,expires:Number(frame.expires_at)});
              }
              if(mode==="evicted_cache")uploader.cache.clear(r.actor.id);
              if(mode==="control_changed")l.db.raw.prepare("UPDATE sb_sessions SET control_epoch=control_epoch+1 WHERE id=?").run(r.identity.bridge_session_id);
            }
            return rows;
          };
          return bound;
        };
      }
      return statement;
    };
    const reader=new BridgeEngine({db:l.db as unknown as D1Database,bucket:l.bucket as unknown as R2Bucket,
      now:l.now,cache:mode==="warm_edge"||mode==="edge_wrong_scope"?undefined:uploader.cache,
      privatePixels:mode==="warm_edge"||mode==="edge_wrong_scope"?pixels:undefined,
      readTiming:{now:()=>clock,sleep:async ms=>{clock+=ms;l.tick(ms);}}});
    const result=await reader.readScreen(alice,{device_id:r.actor.id,after_command_id:r.command.command_id,
      after_command_min_gap_ms:514,wait_for_new_ms:1000},1,false,uid(),mode==="forced_inline");
    if(mode==="warm_cache"||mode==="warm_edge"){
      assert.equal(result.state,"available");
      assert.equal(result.metadata?.frame_id,freshID);
      assert.equal(result.image,Buffer.from(r.bytes).toString("base64"));
      assert.equal(result.trace?.pixel_source,mode==="warm_edge"?"private_edge":"private_ram");
      assert.equal(result.trace?.d1_inline_jpeg_chars,0);
      assert.ok(Number(result.metadata?.age_ms)<1000);
      assert.equal(record(result.after_command).command_id,r.command.command_id);
      assert.equal(record(result.after_command).minimum_gap_ms,514);
      assert.equal(record(result.after_command).lower_gap_ms,520);
      assert.equal(clock,500);
    }else{
      assert.equal(result.state,"unavailable");
      assert.equal(result.image,undefined);
      if(mode==="control_changed")assert.equal(result.reason,"AFTER_COMMAND_SCOPE_CHANGED");
      else assert.equal(result.reason,"NO_FRESH_FRAME");
    }
    assert.equal(snapshots,mode==="edge_wrong_scope"?3:2);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_refreshes").get()!.n,0);
  });
});

test("software: ordinary post-command snapshot retains its authorized pixels during same-scope cache replacement",async(t)=>{
  for(const afterCommand of [true,false])for(const selectedDevice of [true,false])for(const mode of ["quick","inflight_late","evicted","scope_changed","expired"] as const)await t.test(`${afterCommand?"post_command":"look"}_${selectedDevice?"explicit":"implicit"}_${mode}`,async()=>{
    const l=lab(),r=await acknowledgedMouse(l),publisher=edge(l),origin=l.now();
    l.tick(600);
    const selected=uid();
    await publisher.service.acceptFrame(r.actor,{...r.metadata,frame_id:selected,frame_seq:1,
      capture_mono_ms:10520,capture_offset_ms:520,captured_at:new Date(origin+520).toISOString()},r.bytes);
    const newerPixels=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,110)},70).data;
    const newerID=uid(),newerHash=await hash(newerPixels);
    let clock=0,reads=0;
    const prepare=l.db.prepare.bind(l.db);
    l.db.prepare=sql=>{
      const statement=prepare(sql);
      if(sql.startsWith("WITH candidates AS")){
        const bind=statement.bind.bind(statement);
        statement.bind=(...values:unknown[])=>{
          const bound=bind(...values),all=bound.all.bind(bound);
          bound.all=async<T>()=>{
            const rows=await all<T>();
            if(++reads===1){
              const delay=mode==="quick"?400:mode==="inflight_late"?800:mode==="expired"?1500:1200;
              clock+=delay;l.tick(delay);
              const offset=l.now()-origin;
              await publisher.service.acceptFrame(r.actor,{...r.metadata,frame_id:newerID,frame_seq:2,
                capture_mono_ms:10000+offset,capture_offset_ms:offset,captured_at:new Date(l.now()).toISOString(),
                content_sha256:newerHash},newerPixels);
              if(mode==="evicted")publisher.cache.clear(r.actor.id);
              if(mode==="scope_changed"){
                l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(r.actor.id);
                publisher.cache.clear(r.actor.id);
              }
            }
            return rows;
          };
          return bound;
        };
      }
      return statement;
    };
    const reader=new BridgeEngine({db:l.db as unknown as D1Database,bucket:l.bucket as unknown as R2Bucket,
      now:l.now,cache:publisher.cache,readTiming:{now:()=>clock,sleep:async ms=>{clock+=ms;l.tick(ms);}}});
    const result=await reader.readScreen(alice,{...(selectedDevice?{device_id:r.actor.id}:{}),
      ...(afterCommand?{after_command_id:r.command.command_id,after_command_min_gap_ms:514}:{}),wait_for_new_ms:mode==="inflight_late"?700:1000},1,false);
    if(mode==="quick"||mode==="inflight_late"){
      assert.equal(result.state,"available");assert.equal(result.metadata?.frame_id,selected);
      assert.equal(result.image,Buffer.from(r.bytes).toString("base64"));
      assert.equal(result.trace?.pixel_source,"private_ram_snapshot");
      assert.ok(Number(result.metadata?.age_ms)<1000);
      const current=l.db.raw.prepare("SELECT image_key FROM sb_frames WHERE device_id=?").get(r.actor.id)!;
      assert.deepEqual(publisher.cache.getExact(r.actor.id,alice.id,r.identity.bridge_session_id,String(current.image_key),newerHash),new Uint8Array(newerPixels));
    }else{assert.equal(result.state,"unavailable");assert.equal(result.image,undefined);}
    assert.equal(reads,1);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_refreshes").get()!.n,0);
  });
});

test("software: post-command recovery can consume one later capture without requesting capture or resending input",async()=>{
  const l=lab(),r=await acknowledgedMouse(l),{e}=await capturedAtPhoneMono(l,r,9999);
  const reads=afterFirstScreenSnapshot(l,async()=>{await capturedAtPhoneMono(l,r,10001,2);});
  const result=await e.service.readScreen(alice,{after_command_id:r.command.command_id});
  assert.equal(result.state,"available");assert.equal(reads(),2);assert.equal(result.trace?.retry_trigger,"before_command_receipt");
  assert.equal(result.metadata?.capture_lower_phone_mono_ms,10001);assert.equal((result.after_command as Record<string,unknown>).app_effect_observed,false);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_refreshes").get()!.n,0);assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
});

test("software: legacy ack records without phone clocks are not backfilled or inferred from ESP timestamps",async()=>{
  const l=lab(),r=await acknowledgedMouse(l),{e}=await capturedAtPhoneMono(l,r,10001);
  l.db.raw.prepare("UPDATE sb_mouse_commands SET phone_ack_mono_ms=NULL WHERE id=?").run(r.command.command_id);
  const replay=await r.mouse.result(r.actor,r.command.command_id,r.body);assert.equal(replay.receipt_observation.valid_for_capture_order,false);
  const before=l.db.requests,read=await e.service.readScreen(alice,{after_command_id:r.command.command_id});
  assert.equal(l.db.requests-before,1);assert.equal(read.reason,"COMMAND_CLOCK_UNAVAILABLE");assert.equal(read.image,undefined);assert.equal(read.trace?.d1_inline_jpeg_chars,0);
  assert.equal(l.db.raw.prepare("SELECT phone_ack_mono_ms FROM sb_mouse_commands WHERE id=?").get(r.command.command_id)!.phone_ack_mono_ms,null);
});

test("software: post-command read cannot expose images for pending, failed or uncertain input",async()=>{
  for(const state of ["queued","claimed","executing","failed","outcome_unknown","expired","cancelled"]){
    const l=lab(),r=await acknowledgedMouse(l),{e}=await capturedAtPhoneMono(l,r,10001);
    l.db.raw.prepare("UPDATE sb_mouse_commands SET state=? WHERE id=?").run(state,r.command.command_id);
    const read=await e.service.readScreen(alice,{after_command_id:r.command.command_id,wait_for_new_ms:0});
    assert.equal(read.reason,"COMMAND_NOT_CONFIRMED",state);assert.equal(read.image,undefined,state);assert.equal(read.trace?.d1_inline_jpeg_chars,0,state);
  }
});

test("software: after-command route is owner scoped, selects the right phone, and cannot cross live authority changes",async()=>{
  for(const fault of ["none","wrong_device","foreign_owner","unknown_command","worker","lease","control","pause","stop","revoke"]){
    const l=lab(),r=await acknowledgedMouse(l),{e}=await capturedAtPhoneMono(l,r,10001);
    const other=await running(l);await capturedAtPhoneMono(l,other,10001);
    let deviceID: string|undefined,caller=alice,commandID=r.command.command_id;
    if(fault==="wrong_device")deviceID=other.actor.id;
    if(fault==="foreign_owner")caller=bob;
    if(fault==="unknown_command")commandID=uid();
    if(fault==="worker")l.db.raw.prepare("UPDATE sb_devices SET worker_id=? WHERE id=?").run(uid(),r.actor.id);
    if(fault==="lease")l.db.raw.prepare("UPDATE sb_devices SET lease_epoch=lease_epoch+1 WHERE id=?").run(r.actor.id);
    if(fault==="control")l.db.raw.prepare("UPDATE sb_sessions SET control_epoch=control_epoch+1 WHERE id=?").run(r.identity.bridge_session_id);
    if(fault==="pause")l.db.raw.prepare("UPDATE sb_sessions SET capture_state='paused' WHERE id=?").run(r.identity.bridge_session_id);
    if(fault==="stop")await r.mouse.stop(alice,{});
    if(fault==="revoke")l.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(r.actor.id);
    const read=await e.service.readScreen(caller,{after_command_id:commandID,...(deviceID?{device_id:deviceID}:{}),wait_for_new_ms:0});
    if(fault==="none"){assert.equal(read.state,"available");assert.equal(read.metadata?.device_id,r.actor.id);}
    else {assert.equal(read.image,undefined,fault);assert.equal(read.trace?.d1_inline_jpeg_chars,0,fault);assert.notEqual(read.state,"available",fault);}
  }
});

test("software: an unchanged image can prove capture order without claiming a UI effect",async()=>{
  const l=lab(),r=await acknowledgedMouse(l),{e}=await capturedAtPhoneMono(l,r,9999);
  const before=await e.service.readScreen(alice,{},0,false);
  await capturedAtPhoneMono(l,r,10001,2);
  const read=await e.service.readScreen(alice,{after_command_id:r.command.command_id,if_unchanged_since:before.image_ref,wait_for_new_ms:0});
  assert.equal(read.state,"unchanged");assert.equal(read.image,undefined);assert.equal(read.metadata?.capture_lower_phone_mono_ms,10001);
  assert.equal((read.after_command as Record<string,unknown>).app_effect_observed,false);
});

test("software: pending confirmation can settle in the same bounded snapshot retry",async()=>{
  const l=lab(),r=await mouseReady(l),{e}=await capturedAtPhoneMono(l,r,10001),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,c.command_id,{...r.identity,control_epoch:c.control_epoch});
  const reads=afterFirstScreenSnapshot(l,async()=>{await r.mouse.result(r.actor,c.command_id,{...r.identity,state:"board_acked",board_receipt:{command_id:c.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}},finished_client_mono_ms:10000});});
  const read=await e.service.readScreen(alice,{after_command_id:c.command_id});assert.equal(read.state,"available");assert.equal(reads(),2);
  assert.equal(read.trace?.retry_trigger,"command_not_confirmed");assert.equal((read.after_command as Record<string,unknown>).app_effect_observed,false);
});

test("software: post-receipt capture still requires verified capture clocks and strict1500ms freshness",async()=>{
  for(const fault of ["stale","unverified","missing_mono","different_capture_worker"]){
    const l=lab(),r=await acknowledgedMouse(l),{e,meta}=await capturedAtPhoneMono(l,r,10001);
    if(fault==="stale")l.tick(1451);
    else{
      const changed={...meta} as Record<string,unknown>;
      if(fault==="unverified")changed.capture_clock_verified=false;
      if(fault==="missing_mono")delete changed.capture_mono_ms;
      if(fault==="different_capture_worker")changed.worker_id=uid();
      l.db.raw.prepare("UPDATE sb_frames SET metadata=? WHERE device_id=?").run(JSON.stringify(changed),r.actor.id);
    }
    const read=await e.service.readScreen(alice,{after_command_id:r.command.command_id,wait_for_new_ms:0});
    assert.equal(read.image,undefined,fault);assert.equal(read.trace?.d1_inline_jpeg_chars,0,fault);
    assert.equal(read.reason,fault==="stale"?"NO_FRESH_FRAME":"CAPTURE_CLOCK_UNAVAILABLE",fault);
  }
});

test("software: an expired acknowledgement retains its phone timestamp as unconfirmed evidence only",async()=>{
  const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,c.command_id,{...r.identity,control_epoch:c.control_epoch});l.tick(5001);
  await assert.rejects(r.mouse.result(r.actor,c.command_id,{...r.identity,state:"board_acked",board_receipt:{command_id:c.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}},finished_client_mono_ms:15000}),/STALE_MOUSE_RECEIPT/);
  const result=await r.mouse.get(alice,c.command_id);assert.equal(result.state,"outcome_unknown");
  assert.equal(result.receipt_observation.phone_ack_mono_ms,15000);assert.equal(result.receipt_observation.valid_for_capture_order,false);
  const {e}=await capturedAtPhoneMono(l,r,15002);
  const read=await e.service.readScreen(alice,{after_command_id:c.command_id,wait_for_new_ms:0});
  assert.equal(read.reason,"COMMAND_NOT_CONFIRMED");assert.equal(read.image,undefined);
});

test("software: native structured result carries post-receipt clock proof without result meta or extra DB reads",async()=>{
  const l=lab(),r=await acknowledgedMouse(l),{e,meta}=await capturedAtPhoneMono(l,r,10001);
  const before=l.db.requests,changes=l.db.raw.prepare("SELECT total_changes() n").get()!.n;
  const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen",arguments:{after_command_id:r.command.command_id,wait_for_new_ms:0}}})}),{engine:()=>e.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
  const result=(await response.json() as RpcReply).result,proof=result.structuredContent.after_command as Record<string,unknown>,metadata=result.structuredContent.metadata as Record<string,unknown>;
  assert.equal(result.isError,false);assert.equal(l.db.requests-before,1);assert.equal(l.db.raw.prepare("SELECT total_changes() n").get()!.n,changes);
  assert.equal(proof.relation,"capture_after_phone_board_ack");assert.equal(proof.app_effect_observed,false);
  assert.equal(metadata.capture_lower_phone_mono_ms,meta.capture_mono_ms);assert.equal(metadata.device_id,r.actor.id);
  assert.equal(result.content.filter(x=>x.type==="image").length,1);
});

test("software: post-command reader does not wait on an already expired pending command",async()=>{
  const l=lab(),r=await mouseReady(l),{e}=await capturedAtPhoneMono(l,r,10001),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  l.db.raw.prepare("UPDATE sb_mouse_commands SET expires_at=0 WHERE id=?").run(c.command_id);
  const before=l.db.requests,read=await e.service.readScreen(alice,{after_command_id:c.command_id});
  assert.equal(read.reason,"COMMAND_NOT_CONFIRMED");assert.equal(read.image,undefined);assert.equal(l.db.requests-before,1);
  assert.equal(read.trace?.retry_count,0);
});

test("software: a queued command without a claimed worker can settle before the single post-receipt retry",async()=>{
  const l=lab(),r=await mouseReady(l),{e}=await capturedAtPhoneMono(l,r,9999),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  assert.equal(l.db.raw.prepare("SELECT worker_id FROM sb_mouse_commands WHERE id=?").get(c.command_id)!.worker_id,null);
  const reads=afterFirstScreenSnapshot(l,async()=>{
    await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,c.command_id,{...r.identity,control_epoch:c.control_epoch});
    await r.mouse.result(r.actor,c.command_id,{...r.identity,state:"board_acked",board_receipt:{command_id:c.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}},finished_client_mono_ms:10000});
    await capturedAtPhoneMono(l,r,10001,2);
  });
  const read=await e.service.readScreen(alice,{after_command_id:c.command_id});
  assert.equal(reads(),2);assert.equal(read.state,"available");assert.equal(read.trace?.retry_trigger,"command_not_confirmed");
});

test("current pointer observation: late confirmed receipt gets five seconds and accepts a 1.2-second image without replay",async()=>{
  const l=lab(),r=await acknowledgedMouse(l);
  await capturedAtPhoneMono(l,r,10001,2);l.tick(1200);
  let mono=0,reads=0,waitBudget=0;
  const mouse=new MouseControl(l.service,{now:()=>mono}),enqueue=mouse.enqueue.bind(mouse);
  mouse.enqueue=async(...args)=>{const result=await enqueue(...args);mono+=2100;return result;};
  const read=l.service.readActionAfterScreen.bind(l.service);
  l.service.readActionAfterScreen=async(...args)=>{reads++;waitBudget=Number(args[1].wait_for_new_ms);return read(...args);};
  const args={idempotency_key:r.request.idempotency_key};
  const result=await mouse.enqueueObserved(alice,"pointer.click",args);
  assert.equal(result.command_id,r.command.command_id);assert.equal(result.state,"board_acked");
  assert.equal(result.observation_state,"available");assert.equal(typeof result.image,"string");
  assert.equal(waitBudget,5000);assert.equal(result.after_screen.age_limit_ms,2000);assert.equal(reads,1);
  const explicit=await mouse.enqueueObserved(alice,"pointer.click",{...args,wait_ms:2000});
  assert.equal(explicit.command_id,r.command.command_id);assert.equal(explicit.image,undefined);assert.equal(reads,1);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
});

test("current pointer observation: an expired observation never fabricates a frame or resends input",async()=>{
  const l=lab(),r=await acknowledgedMouse(l);await capturedAtPhoneMono(l,r,10001,2);
  let mono=0;
  const mouse=new MouseControl(l.service,{now:()=>mono});
  const read=l.service.readActionAfterScreen.bind(l.service);
  l.service.readActionAfterScreen=async(...args)=>{const result=await read(...args);mono+=5001;return result;};
  const result=await mouse.enqueueObserved(alice,"pointer.click",{idempotency_key:r.request.idempotency_key});
  assert.equal(result.command_id,r.command.command_id);assert.equal(result.state,"board_acked");
  assert.equal(result.observation_state,"budget_exhausted");assert.equal(result.image,undefined);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
});

test("software: each mouse write can return a qualified after-image without creating a second input",async()=>{
  for(const [tool,kind,values] of [["move_mouse","pointer.move_relative",{dx:7,dy:-3}],["click_mouse","pointer.click",{}],["scroll_mouse","pointer.scroll",{steps:-2}],["move_mouse_to","pointer.move_absolute",{x:7,y:15,image_width:16,image_height:32,orientation_epoch:0}]] as const){
    const l=lab(),r=await mouseReady(l),{e}=await capturedAtPhoneMono(l,r,9999);
    if(tool==="move_mouse_to")l.db.raw.prepare("UPDATE sb_hardware SET metadata=? WHERE device_id=?").run(JSON.stringify({...r.hardware,capabilities:{...r.hardware.capabilities,"hid.mouse.absolute":true}}),r.actor.id);
    const batch=l.db.batch.bind(l.db);let simulated=false;
    l.db.batch=async statements=>{
      const rows=await batch(statements);
      if(!simulated&&statements.some(s=>s.sql.startsWith("INSERT INTO sb_mouse_commands"))){
        simulated=true;
        const claimed=(await r.mouse.claim(r.actor,r.identity,0))!;
        await r.mouse.start(r.actor,String(claimed.command_id),{...r.identity,control_epoch:claimed.control_epoch});
        const effect:Record<string,unknown>={hid_reports_sent:true};
        if(tool==="move_mouse_to"){const payload=claimed.payload as Record<string,number>;effect.absolute_requested_x=payload.x;effect.absolute_requested_y=payload.y;}
        await r.mouse.result(r.actor,String(claimed.command_id),{...r.identity,state:"board_acked",board_receipt:{command_id:claimed.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect},finished_client_mono_ms:10000});
        await capturedAtPhoneMono(l,r,10001,2);
      }
      return rows;
    };
    const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:tool,arguments:{...values,idempotency_key:uid(),wait_ms:1000}}})}),{engine:()=>e.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
    const result=(await response.json() as RpcReply).result,summary=result.structuredContent,observation=summary.after_screen as Record<string,unknown>;
    assert.equal(result.isError,false,tool);assert.equal(summary.state,"board_acked",tool);assert.equal(summary.observation_state,"available",tool);
    assert.equal(summary.app_effect_observed,false);assert.equal(observation.app_effect_observed,false);
    const proof=observation.after_command as Record<string,unknown>;assert.equal(proof.command_id,summary.command_id);assert.equal(proof.relation,"capture_after_phone_board_ack");
    assert.equal(result.content.filter(x=>x.type==="image").length,1);const image=result.content.find(x=>x.type==="image")!;
    assert.deepEqual(Buffer.from(image.data,"base64"),Buffer.from(r.bytes));assert.ok(!JSON.stringify(summary).includes(image.data));
    assert.equal(observation.snapshot,undefined);assert.equal(observation.trace,undefined);
    const commands=l.db.raw.prepare("SELECT kind FROM sb_mouse_commands").all();assert.equal(commands.length,1);assert.equal(commands[0].kind,kind);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_refreshes").get()!.n,0);
  }
});

test("software: write observation options are checked before enqueue and pending input does not read pixels",async()=>{
  const l=lab(),r=await mouseReady(l);let reads=0;l.service.readScreen=async()=>{reads++;throw Error("No read expected");};
  const requests=l.db.requests;
  for(const flag of [null,"true",1])await assert.rejects(r.mouse.enqueueObserved(alice,"pointer.click",{idempotency_key:uid(),observe_after:flag,wait_ms:0}),/INVALID_ARGUMENTS/);
  assert.equal(l.db.requests,requests);assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,0);
  const result=await r.mouse.enqueueObserved(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  assert.equal(result.state,"queued");assert.equal(result.observation_state,"pending_input");assert.equal(result.image,undefined);assert.equal(reads,0);
});

test("software: explicit receipt-only mode and zero remaining budget never start post-image reads",async()=>{
  const l=lab(),r=await acknowledgedMouse(l);let reads=0;l.service.readScreen=async()=>{reads++;throw Error("Unexpected read");};
  const receiptOnly=await r.mouse.enqueueObserved(alice,"pointer.click",{...r.request,wait_ms:1000,observe_after:false});
  assert.equal(receiptOnly.state,"board_acked");assert.equal(receiptOnly.observation_state,"not_requested");assert.equal(reads,0);
  let now=0;const controller=new MouseControl(l.service,{now:()=>now}),enqueue=controller.enqueue.bind(controller);
  controller.enqueue=async(user,kind,args,deadline)=>{const result=await enqueue(user,kind,args,deadline);now=1001;return result;};
  const expired=await controller.enqueueObserved(alice,"pointer.click",{...r.request,wait_ms:1000});
  assert.equal(expired.state,"board_acked");assert.equal(expired.command_id,r.command.command_id);assert.equal(expired.observation_state,"budget_exhausted");assert.equal(reads,0);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
});

test("software: action and post-image share one budget rather than receiving independent waits",async()=>{
  const l=lab(),r=await acknowledgedMouse(l);let now=0,seen:Record<string,unknown>|undefined;
  const controller=new MouseControl(l.service,{now:()=>now}),enqueue=controller.enqueue.bind(controller);
  controller.enqueue=async(user,kind,args,deadline)=>{const result=await enqueue(user,kind,args,deadline);now=250;return result;};
  l.service.readScreen=async(_user,args)=>{seen=args;return {state:"unavailable",reason:"NO_FRESH_FRAME"};};
  const result=await controller.enqueueObserved(alice,"pointer.click",{...r.request,wait_ms:500});
  assert.equal(seen?.wait_for_new_ms,250);assert.equal(seen?.after_command_id,r.command.command_id);assert.equal(seen?.device_id,r.actor.id);
  assert.equal(result.after_screen.wait_budget_ms,250);assert.equal(result.state,"board_acked");
});

test("software: observation failure retains confirmed action and never exposes internal error details or replays it",async()=>{
  const l=lab(),r=await acknowledgedMouse(l);
  l.service.readScreen=async()=>{throw Error("PRIVATE SQL OR TOKEN SHOULD NOT LEAK");};
  const result=await r.mouse.enqueueObserved(alice,"pointer.click",{...r.request,wait_ms:1000});
  assert.equal(result.command_id,r.command.command_id);assert.equal(result.state,"board_acked");assert.equal(result.observation_state,"error");
  assert.equal(result.after_screen.reason,"OBSERVATION_UNAVAILABLE");assert.equal(result.after_screen.command_result_retained,true);
  assert.ok(!JSON.stringify(result).includes("PRIVATE SQL"));assert.equal(result.image,undefined);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
});

test("software: post-image cannot turn scope loss, old pixels, uncertain input or legacy clocks into another input",async()=>{
  for(const fault of ["scope","old_pixels","unknown","legacy"]){
    const l=lab(),r=await acknowledgedMouse(l);await capturedAtPhoneMono(l,r,fault==="old_pixels"?9999:10001);
    if(fault==="scope")await r.mouse.stop(alice,{});
    if(fault==="unknown")l.db.raw.prepare("UPDATE sb_mouse_commands SET state='outcome_unknown' WHERE id=?").run(r.command.command_id);
    if(fault==="legacy")l.db.raw.prepare("UPDATE sb_mouse_commands SET phone_ack_mono_ms=NULL WHERE id=?").run(r.command.command_id);
    const result=await r.mouse.enqueueObserved(alice,"pointer.click",{...r.request,wait_ms:1000});
    assert.equal(result.command_id,r.command.command_id);assert.equal(result.image,undefined,fault);assert.equal(result.app_effect_observed,false);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
    if(fault==="unknown")assert.equal(result.state,"outcome_unknown");else assert.equal(result.state,"board_acked");
  }
});

test("software: write wrapper does not deliver an image without the requested verified after-receipt proof",async()=>{
  const l=lab(),r=await acknowledgedMouse(l);
  for(const value of [
    {state:"available",image:Buffer.from(r.bytes).toString("base64")},
    {state:"available",image:Buffer.from(r.bytes).toString("base64"),after_command:{command_id:uid(),relation:"capture_after_phone_board_ack",scope_matches_at_snapshot:true}},
    {state:"available",image:Buffer.from(r.bytes).toString("base64"),after_command:{command_id:r.command.command_id,relation:"capture_after_phone_board_ack",scope_matches_at_snapshot:false}},
    {state:"unchanged",image_ref:uid()},
  ]){
    l.service.readScreen=async()=>value;
    const result=await r.mouse.enqueueObserved(alice,"pointer.click",{...r.request,wait_ms:1000});
    assert.equal(result.state,"board_acked");assert.equal(result.image,undefined);assert.equal(result.after_screen.reason,"AFTER_IMAGE_PROOF_MISSING");
  }
});

test("software: public mouse tool schema exposes optional post-image mode and an observation read error preserves wire receipt",async()=>{
  const l=lab(),r=await acknowledgedMouse(l);
  const catalogue=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list"})}),{engine:()=>l.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
  const listed=await catalogue.json() as {result:{tools:{name:string;inputSchema:{properties:Record<string,unknown>}}[]}};
  for(const name of ["move_mouse_to","move_mouse","click_mouse","scroll_mouse"])assert.deepEqual(listed.result.tools.find(t=>t.name===name)!.inputSchema.properties.observe_after,{type:"boolean",default:true});
  l.service.readScreen=async()=>{throw new BridgeError("STORAGE_UNAVAILABLE",503);};
  const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"click_mouse",arguments:{...r.request,wait_ms:1000}}})}),{engine:()=>l.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
  const result=(await response.json() as RpcReply).result,summary=result.structuredContent;
  assert.equal(result.isError,false);assert.equal(summary.state,"board_acked");assert.equal(summary.command_id,r.command.command_id);assert.equal(summary.observation_state,"error");
  assert.equal((summary.after_screen as Record<string,unknown>).reason,"STORAGE_UNAVAILABLE");assert.equal(result.content.filter(x=>x.type==="image").length,0);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,1);
});

test("software: post-image wrapper refuses stale, mis-scoped or unverified metadata even with a positive tag",async()=>{
  const l=lab(),r=await acknowledgedMouse(l),{e}=await capturedAtPhoneMono(l,r,10001),screen=await e.service.readScreen(alice,{after_command_id:r.command.command_id},0,false);
  for(const patch of [{age_ms:2000},{device_id:uid()},{worker_id_at_read:uid()},{control_epoch_at_read:r.command.control_epoch+1},{capture_clock_verified:false},{capture_lower_phone_mono_ms:10000}]){
    l.service.readScreen=async()=>({...screen,metadata:{...screen.metadata,...patch}});
    const result=await r.mouse.enqueueObserved(alice,"pointer.click",{...r.request,wait_ms:1000});
    assert.equal(result.state,"board_acked");assert.equal(result.image,undefined);assert.equal(result.after_screen.reason,"AFTER_IMAGE_PROOF_MISSING");
  }
});

test("software: connected automatic renewal preserves the live epoch and queued inputs",async()=>{
  const l=lab(),r=await mouseReady(l),before=l.db.raw.prepare("SELECT control_epoch,mouse_until FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!;
  const command=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});l.tick(1000);
  await r.mouse.grant(r.actor,{...r.identity,control_enabled:true,automatic_connected:true,renewal:true,expected_control_epoch:before.control_epoch,
    hardware_id:r.hardware.hardware_id,board_boot_id:r.hardware.board_boot_id,request_id:uid()});
  const after=l.db.raw.prepare("SELECT control_epoch,mouse_until FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!;
  assert.equal(after.control_epoch,before.control_epoch);assert.equal(after.mouse_until,l.now()+600_000);
  assert.equal((await r.mouse.get(alice,command.command_id)).state,"queued");
});
test("software: connected auto-grant cannot cross stop, worker, hardware, boot or expired-renewal fences",async()=>{
  for(const fault of ["stop","worker","hardware","boot","expired"]){
    const l=lab(),r=await mouseReady(l),control=l.db.raw.prepare("SELECT control_epoch FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!.control_epoch;
    const body={...r.identity,control_enabled:true,automatic_connected:true,renewal:true,expected_control_epoch:control,
      hardware_id:r.hardware.hardware_id,board_boot_id:r.hardware.board_boot_id,request_id:uid()};
    if(fault==="stop")await r.mouse.stop(alice,{});
    if(fault==="worker")body.worker_id=uid();
    if(fault==="hardware")body.hardware_id=uid();
    if(fault==="boot")body.board_boot_id=uid();
    if(fault==="expired")l.db.raw.prepare("UPDATE sb_sessions SET mouse_until=?").run(l.now()-1);
    await assert.rejects(r.mouse.grant(r.actor,body));
  }
});
test("software: disconnect heartbeat revokes the live grant atomically without stopping capture",async()=>{
  const l=lab(),r=await mouseReady(l),before=l.db.raw.prepare("SELECT control_epoch FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!.control_epoch;
  const beat=await l.service.heartbeat(r.actor,{...r.beat,usb_connected:false});
  assert.equal(beat.directive,"all_release");assert.equal(beat.grant_remaining_ms,0);assert.ok(beat.control_epoch>Number(before));
  const row=l.db.raw.prepare("SELECT mouse_enabled,mouse_until,capture_state,state FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!;
  assert.equal(row.mouse_enabled,0);assert.equal(row.mouse_until,0);assert.equal(row.capture_state,"active");assert.equal(row.state,"active");
  await assert.rejects(r.mouse.grant(r.actor,{...r.identity,control_enabled:true,automatic_connected:true,renewal:false,
    expected_control_epoch:before,hardware_id:r.hardware.hardware_id,board_boot_id:r.hardware.board_boot_id,request_id:uid()}));
});
test("software: scoped hotplug binding preserves capture across board reboot and raises an old worker above the board floor",async()=>{
  const l=lab(),r=await mouseReady(l),led=new LEDControl(l.service),changed={...r.hardware,board_boot_id:uid(),lease_epoch_floor:r.identity.lease_epoch+20};
  await l.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const result=await led.bind(r.actor,{...changed,...r.identity});
  const device=l.db.raw.prepare("SELECT current_session,worker_id,lease_epoch FROM sb_devices WHERE id=?").get(r.actor.id)!;
  const session=l.db.raw.prepare("SELECT state,capture_state,mouse_enabled FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!;
  assert.equal(device.current_session,r.identity.bridge_session_id);assert.equal(device.worker_id,r.identity.worker_id);
  assert.equal(device.lease_epoch,changed.lease_epoch_floor+1);assert.equal(result.lease_epoch,device.lease_epoch);
  assert.equal(session.state,"active");assert.equal(session.capture_state,"active");assert.equal(session.mouse_enabled,0);
  const next={...r.beat,lease_epoch:Number(device.lease_epoch),board_boot_id:changed.board_boot_id};
  assert.equal((await l.service.heartbeat(r.actor,next)).directive,"all_release");
});
test("software: an automatic attach retry is idempotent and an owner stop is explicit in heartbeats",async()=>{
  const l=lab(),r=await mouseReady(l),prior=l.db.raw.prepare("SELECT control_epoch FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!;
  const body={...r.identity,control_enabled:true,automatic_connected:true,renewal:false,expected_control_epoch:prior.control_epoch,
    hardware_id:r.hardware.hardware_id,board_boot_id:r.hardware.board_boot_id,request_id:uid()};
  const first=await r.mouse.grant(r.actor,body),second=await r.mouse.grant(r.actor,body);assert.ok("control_epoch" in first&&"control_epoch" in second);assert.equal(first.control_epoch,second.control_epoch);
  await r.mouse.stop(alice,{});assert.equal((await l.service.heartbeat(r.actor,r.beat)).mouse_stop_requested,true);
  await assert.rejects(r.mouse.grant(r.actor,body),/STALE_CONTROL_EPOCH/);
});
test("software: mouse move, left click and wheel require phone grant and reach one verified board receipt", async () => {
  for (const [kind, values] of [["pointer.move_relative", { dx: 20, dy: -10 }], ["pointer.click", { button: "left" }], ["pointer.scroll", { steps: -2 }]] as const) {
    const l = lab(), r = await mouseReady(l), key = uid();
    const args = { device_id: r.actor.id, ...values, idempotency_key: key, wait_ms: 0 };
    const command = await r.mouse.enqueue(alice, kind, args); assert.equal(command.state, "queued");
    assert.equal((await r.mouse.enqueue(alice, kind, args)).command_id, command.command_id);
    const claimed = await r.mouse.claim(r.actor, r.identity, 0); assert.equal(claimed?.command_id, command.command_id);
    const start = await r.mouse.start(r.actor, command.command_id, { ...r.identity, control_epoch: command.control_epoch }); assert.ok(start.ttl_remaining_ms <= 2500);
    const receipt = { command_id: command.command_id, board_boot_id: r.hardware.board_boot_id, state: "executed", effect: { hid_reports_sent: true } };
    const result = { ...r.identity, state: "board_acked", board_receipt: receipt, finished_client_mono_ms: 12345 };
    const confirmed = await r.mouse.result(r.actor, command.command_id, result);
    assert.equal(confirmed.state, "board_acked"); assert.equal(confirmed.verification, "phone_verified_board_ack"); assert.equal(confirmed.app_effect_observed, false);
    assert.equal((await r.mouse.result(r.actor, command.command_id, result)).state, "board_acked");
    await assert.rejects(r.mouse.get(bob, command.command_id), /NOT_FOUND/);
  }
});

test("software: relative mouse rejects keyboard, absolute, overflow, fractions and unsupported buttons", async () => {
  const l = lab(), r = await mouseReady(l);
  for (const [kind, values] of [["keyboard.press", {}], ["pointer.target", {}], ["pointer.move_relative", { dx: 128, dy: 0 }], ["pointer.move_relative", { dx: .5, dy: 1 }], ["pointer.move_relative", { dx: 0, dy: 0 }], ["pointer.click", { button: "right" }], ["pointer.scroll", { steps: 9 }], ["pointer.scroll", { steps: 0 }]] as const) {
    await assert.rejects(r.mouse.enqueue(alice, kind, { ...values, idempotency_key: uid(), wait_ms: 0 }));
  }
  await assert.rejects(r.mouse.enqueue(bob, "pointer.click", { device_id: r.actor.id, idempotency_key: uid(), wait_ms: 0 }));
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_mouse_commands").get()!.n, 0);
});

test("software: stopping mouse cancels pending input while sharing stays active", async () => {
  const l = lab(), r = await mouseReady(l);
  const command = await r.mouse.enqueue(alice, "pointer.click", { idempotency_key: uid(), wait_ms: 0 });
  const stopped = await r.mouse.stop(alice, {}); assert.equal(stopped.screen_sharing_stopped, false); assert.equal(stopped.board_release_confirmed, false);
  assert.equal((await r.mouse.get(alice, command.command_id)).state, "cancelled");
  const row = l.db.raw.prepare("SELECT capture_state,state FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!;
  assert.equal(row.state, "active"); assert.equal(row.capture_state, "active");
  const beat = await l.service.heartbeat(r.actor, r.beat); assert.equal(beat.directive, "all_release"); assert.equal(beat.grant_remaining_ms, 0);
  await assert.rejects(r.mouse.enqueue(alice, "pointer.click", { idempotency_key: uid(), wait_ms: 0 }), /ALLOW_MOUSE_ON_PHONE/);
});

test("software: mouse revocation, pause, USB disconnect, board reboot, lease change and grant expiry prevent start", async () => {
  for (const condition of ["revoked", "paused", "usb", "boot", "lease", "grant", "stopped"]) {
    const l = lab(), r = await mouseReady(l);
    const command = await r.mouse.enqueue(alice, "pointer.click", { idempotency_key: uid(), wait_ms: 0 });
    await r.mouse.claim(r.actor, r.identity, 0);
    if (condition === "revoked") l.db.raw.exec("UPDATE sb_devices SET revoked=1");
    if (condition === "paused") l.db.raw.exec("UPDATE sb_sessions SET capture_state='paused'");
    if (condition === "usb") l.db.raw.exec("UPDATE sb_hardware SET usb_connected=0");
    if (condition === "boot") l.db.raw.exec("UPDATE sb_hardware SET board_boot_id='" + uid() + "'");
    if (condition === "lease") l.db.raw.exec("UPDATE sb_devices SET lease_epoch=lease_epoch+1");
    if (condition === "grant") l.db.raw.exec("UPDATE sb_sessions SET mouse_until=0");
    if (condition === "stopped") await r.mouse.stop(alice, {});
    await assert.rejects(r.mouse.start(r.actor, command.command_id, { ...r.identity, control_epoch: command.control_epoch }));
  }
});

test("software: mouse idempotency cannot alter an action and uncertain execution is never resent", async () => {
  const l = lab(), r = await mouseReady(l), key = uid();
  const args = { dx: 10, dy: 0, idempotency_key: key, wait_ms: 0 };
  const command = await r.mouse.enqueue(alice, "pointer.move_relative", args);
  await assert.rejects(r.mouse.enqueue(alice, "pointer.move_relative", { ...args, dx: 11 }), /IDEMPOTENCY_CONFLICT/);
  await r.mouse.claim(r.actor, r.identity, 0); await r.mouse.start(r.actor, command.command_id, { ...r.identity, control_epoch: command.control_epoch });
  l.tick(5001);
  assert.equal((await r.mouse.get(alice, command.command_id)).state, "outcome_unknown");
  assert.equal((await r.mouse.enqueue(alice, "pointer.move_relative", args)).command_id, command.command_id);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_mouse_commands").get()!.n, 1);
});

test("software: mouse receipt must match the executing command and stop rejects late success", async () => {
  const l = lab(), r = await mouseReady(l);
  const command = await r.mouse.enqueue(alice, "pointer.click", { idempotency_key: uid(), wait_ms: 0 });
  await r.mouse.claim(r.actor, r.identity, 0); await r.mouse.start(r.actor, command.command_id, { ...r.identity, control_epoch: command.control_epoch });
  const receipt = { command_id: uid(), board_boot_id: r.hardware.board_boot_id, state: "executed", effect: { hid_reports_sent: true } };
  await assert.rejects(r.mouse.result(r.actor, command.command_id, { ...r.identity, state: "board_acked", board_receipt: receipt, finished_client_mono_ms: 1 }), /INVALID_BOARD_RECEIPT/);
  await r.mouse.stop(alice, {}); receipt.command_id = command.command_id;
  await assert.rejects(r.mouse.result(r.actor, command.command_id, { ...r.identity, state: "board_acked", board_receipt: receipt, finished_client_mono_ms: 1 }), /STALE_MOUSE_RECEIPT/);
});


test("software: concurrent identical mouse requests return the same command and MCP dispatch stays mouse-only", async () => {
  const l = lab(), r = await mouseReady(l), key = uid();
  let count = 0, release!: () => void;
  const both = new Promise<void>(resolve => { release = resolve; }), prepare = l.db.prepare.bind(l.db);
  l.db.prepare = sql => {
    const stmt = prepare(sql), bind = stmt.bind.bind(stmt);
    if (sql.includes("c.id AS prior_id")) stmt.bind = (...values: unknown[]) => {
      const bound = bind(...values), all = bound.all.bind(bound);
      bound.all = async <T>() => { const value = await all<T>(); if (++count === 2) release(); await both; return value; };
      return bound;
    };
    return stmt;
  };
  const args = { dx: 3, dy: 4, idempotency_key: key, wait_ms: 0 };
  const [a,b] = await Promise.all([r.mouse.enqueue(alice,"pointer.move_relative",args),r.mouse.enqueue(alice,"pointer.move_relative",args)]);
  assert.equal(count,2);
  l.db.prepare = prepare;
  assert.equal(a.command_id,b.command_id); assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_mouse_commands").get()!.n,1);
  const request = (name: string, arguments_: Record<string, unknown>) => new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:arguments_}})});
  const good = await (await handleMcp(request("move_mouse",args),{engine:()=>l.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development"})).json() as RpcReply;
  assert.equal(good.result.structuredContent.command_id,a.command_id);
  const bad = await (await handleMcp(request("move_mouse",{...args,x:100}),{engine:()=>l.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development"})).json() as RpcReply;
  assert.equal(bad.result.isError,true); assert.equal(bad.result.structuredContent.error,"INVALID_ARGUMENTS");
});


test("software: resyncing verified mouse capabilities preserves a current USB connection without renewing a grant", async () => {
  const l = lab(), r = await mouseReady(l), led = new LEDControl(l.service);
  await r.mouse.stop(alice,{});
  l.db.raw.exec("UPDATE sb_hardware SET metadata=json_set(metadata,'$.capabilities',json('{\"led.set\":true}'))");
  await assert.rejects(r.mouse.grant(r.actor,{bridge_session_id:r.identity.bridge_session_id,control_enabled:true,request_id:uid()}),/MOUSE_NOT_SUPPORTED/);
  await led.bind(r.actor,r.hardware);
  const state = await r.mouse.status(alice,{});
  assert.equal(state.usb_connected,true); assert.equal(state.enabled,false);
  assert.equal(state.capabilities['hid.mouse.relative'],true);
  await r.mouse.grant(r.actor,{bridge_session_id:r.identity.bridge_session_id,control_enabled:true,request_id:uid()});
  assert.equal((await r.mouse.status(alice,{})).enabled,true);
  const changed = {...r.hardware,board_boot_id:uid()}; await led.bind(r.actor,changed);
  await assert.rejects(r.mouse.enqueue(alice,'pointer.click',{idempotency_key:uid(),wait_ms:0}));
});


test("software: device status exposes the real granted mouse scope and exits screen-only state", async () => {
 const l=lab(),r=await mouseReady(l),state=await l.service.status(r.actor);
 assert.equal(state.capabilities['hid.mouse.relative'],true);
 assert.equal(state.capabilities['hid.mouse.click'],true);
 assert.equal(state.screen_only,false);assert.equal(state.session?.control_enabled,true);
 assert.deepEqual(state.control_scope,['hid.mouse.relative','hid.mouse.click','hid.mouse.scroll']);
 await r.mouse.stop(alice,{});const stopped=await l.service.status(r.actor);
 assert.equal(stopped.screen_only,true);assert.equal(stopped.session?.control_enabled,false);assert.deepEqual(stopped.control_scope,[]);
});

function geometryWaitMouse(l:ReturnType<typeof lab>,onFirstSleep:()=>Promise<void>|void){
 let now=0,first=true;const sleeps:number[]=[];
 const mouse=new MouseControl(l.service,{now:()=>now,sleep:async(ms:number)=>{now+=ms;l.tick(ms);sleeps.push(ms);if(first){first=false;await onFirstSleep();}}});
 return {mouse,sleeps,elapsed:()=>now};
}

test("software: R2 view fallback exposes geometry from its returned image without private capture fields",async()=>{
 const l=lab(),r=await running(l),writer=edge(l),reader=edge(l);await writer.service.acceptFrame(r.actor,r.metadata,r.bytes);await writer.flush();
 l.db.raw.exec("UPDATE sb_frames SET inline_jpeg=NULL");reader.cache.clear(r.actor.id);
 const result=await reader.service.viewScreen(alice,{wait_ms:0});assert.equal(result.state,"available");assert.equal(result.trace?.source,"r2");
 for(const key of ["width","height","native_width_px","native_height_px","orientation","orientation_epoch"] as const)assert.equal(result.metadata?.[key],r.metadata[key]);
 assert.equal(result.metadata?.clock_probe_id,undefined);assert.deepEqual(Buffer.from(result.image!,"base64"),Buffer.from(r.bytes));
});

test("software: absolute mouse maps image endpoints and center without relative acceleration",()=>{
 assert.deepEqual(absoluteMouseRequest({x:0,y:0,image_width:886,image_height:1918,orientation_epoch:0}).payload,{x:0,y:0});
 assert.deepEqual(absoluteMouseRequest({x:885,y:1917,image_width:886,image_height:1918,orientation_epoch:0}).payload,{x:32767,y:32767});
 assert.deepEqual(absoluteMouseRequest({x:442.5,y:958.5,image_width:886,image_height:1918,orientation_epoch:0}).payload,{x:16384,y:16384});
 for(const args of [{x:-1,y:0},{x:886,y:0},{x:0,y:1918},{x:NaN,y:0},{x:0,y:Infinity}]) assert.throws(()=>absoluteMouseRequest({...args,image_width:886,image_height:1918,orientation_epoch:0}));
 assert.throws(()=>absoluteMouseRequest({x:0,y:0,image_width:1,image_height:1918,orientation_epoch:0}));
});

test("software: scaled JPEG coordinates keep source dimensions separate from capture dimensions",async()=>{
 const l=lab(),r=await mouseReady(l),hardware={...r.hardware,capabilities:{...r.hardware.capabilities,"hid.mouse.absolute":true}};
 await new LEDControl(l.service).bind(r.actor,hardware);await l.service.acceptFrame(r.actor,r.metadata,r.bytes);
 const command=await r.mouse.enqueue(alice,"pointer.move_absolute",{x:7.5,y:15.5,image_width:16,image_height:32,orientation_epoch:0,idempotency_key:uid(),wait_ms:0});
 assert.deepEqual(command.payload,{x:16384,y:16384});assert.equal(command.precondition?.source_width,16);assert.equal(command.precondition?.capture_width,1206);
});

// All records below are isolated software fixtures. They are not phone samples.
const browseRegion = { x:0, y:0, width:1, height:1 };
const browseScene = (label:string):Scene => ({required:[{text:label,region:browseRegion}],forbidden:[]});
const browseStep = (from="列表 List",to="详情 Detail") => ({before:browseScene(from),after:browseScene(to),action:{kind:"click",target:{text:from,region:browseRegion}}});
async function delayImageRowUntilAfterFirstViewRead(l:ReturnType<typeof lab>,runID:string) {
  const row=l.db.raw.prepare("SELECT * FROM sb_browse_images WHERE run_id=?").get(runID)!;
  const columns=Object.keys(row),restore=l.db.raw.prepare("INSERT INTO sb_browse_images("+columns.join(",")+") VALUES("+columns.map(()=>"?").join(",")+")");
  l.db.raw.prepare("DELETE FROM sb_browse_images WHERE run_id=?").run(runID);
  const prepare=l.db.prepare.bind(l.db);let reads=0;
  l.db.prepare=sql=>{const statement=prepare(sql),bind=statement.bind.bind(statement);if(sql.includes(" AS image_row"))statement.bind=(...values:unknown[])=>{const bound=bind(...values),first=bound.first.bind(bound);bound.first=async<T>()=>{const snapshot=await first<T>();if(++reads===1)restore.run(...columns.map(key=>row[key]));return snapshot;};return bound;};return statement;};
  return ()=>reads;
}

test("software: expired heartbeat cannot present historical USB as a current connection",async()=>{
  const l=lab(),r=await mouseReady(l);assert.equal((await r.mouse.status(alice,{device_id:r.actor.id})).usb_connected,true);
  l.tick(11000);const offline=await r.mouse.status(alice,{device_id:r.actor.id});
  assert.equal(offline.online,false);assert.equal(offline.enabled,false);assert.equal(offline.usb_connected,false);assert.equal(offline.last_reported_usb_connected,true);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_mouse_commands").get()!.n,0);
});

test("software: phone revocation requires explicit scope while owner MCP stop stays available",async()=>{
 const l=lab(),r=await mouseReady(l);
 for(const body of [{control_enabled:false},{control_enabled:false,bridge_session_id:r.identity.bridge_session_id},{control_enabled:false,expected_control_epoch:1}]){
  await assert.rejects(r.mouse.grant(r.actor,body),/REVOKE_SCOPE_REQUIRED/);assert.equal((await r.mouse.status(alice,{})).enabled,true);
 }
 await r.mouse.stop(alice,{device_id:r.actor.id});assert.equal((await r.mouse.status(alice,{})).enabled,false);
});

test("software: old phone revoke cannot clear a newer grant in the same session",async()=>{
 const l=lab(),r=await mouseReady(l);const first=await r.mouse.status(alice,{});
 const epoch=Number(l.db.raw.prepare("SELECT control_epoch FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!.control_epoch);
 await r.mouse.grant(r.actor,{bridge_session_id:r.identity.bridge_session_id,control_enabled:true,request_id:uid()});
 const result=await r.mouse.grant(r.actor,{control_enabled:false,bridge_session_id:r.identity.bridge_session_id,expected_control_epoch:epoch});
 assert.equal(first.enabled,true);assert.ok("scope_matched" in result);assert.equal(result.scope_matched,false);assert.equal((await r.mouse.status(alice,{})).enabled,true);
});

test("software: scoped phone revoke is idempotent and only cancels its own epoch",async()=>{
 const l=lab(),r=await mouseReady(l),epoch=Number(l.db.raw.prepare("SELECT control_epoch FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!.control_epoch);
 const c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
 const body={control_enabled:false,bridge_session_id:r.identity.bridge_session_id,expected_control_epoch:epoch};
 const firstStop=await r.mouse.grant(r.actor,body);assert.ok("scope_matched" in firstStop);assert.equal(firstStop.scope_matched,true);assert.equal((await r.mouse.get(alice,c.command_id)).state,"cancelled");
 const secondStop=await r.mouse.grant(r.actor,body);assert.ok("scope_matched" in secondStop);assert.equal(secondStop.scope_matched,false);assert.equal(Number(l.db.raw.prepare("SELECT control_epoch FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!.control_epoch),epoch+1);
});

test("software: foreign scoped revoke and write-time grant replacement leave current grant intact",async()=>{
 for(const race of [false,true]){
  const l=lab(),r=await mouseReady(l),epoch=Number(l.db.raw.prepare("SELECT control_epoch FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!.control_epoch);
  if(race){const batch=l.db.batch.bind(l.db);l.db.batch=async statements=>{l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");return batch(statements);};}
  const result=await r.mouse.grant(r.actor,{control_enabled:false,bridge_session_id:race?r.identity.bridge_session_id:uid(),expected_control_epoch:epoch});
  assert.ok("scope_matched" in result);assert.equal(result.scope_matched,false);assert.equal((await r.mouse.status(alice,{})).enabled,true);
 }
});

test("software: invalid wait budgets cannot leave an undisclosed queued mouse action",async()=>{
  const l=lab(),r=await mouseReady(l),before=l.db.requests;
  for(const wait_ms of [-1,3001,0.5])await assert.rejects(r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms}));
  assert.equal(l.db.requests,before);assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_mouse_commands").get()!.n,0);
});

test("software: concurrent conflicting mouse intents retain exactly one idempotent winner",async()=>{
  const l=lab(),r=await mouseReady(l),key=uid(),prepare=l.db.prepare.bind(l.db);let reads=0,release!:()=>void;
  const both=new Promise<void>(resolve=>{release=resolve;});
  l.db.prepare=sql=>{const stmt=prepare(sql),bind=stmt.bind.bind(stmt);if(sql.includes("c.id AS prior_id"))stmt.bind=(...values:unknown[])=>{const bound=bind(...values),all=bound.all.bind(bound);bound.all=async<T>()=>{const result=await all<T>();if(++reads===2)release();await both;return result;};return bound;};return stmt;};
  const outcomes=await Promise.allSettled([1,2].map(dx=>r.mouse.enqueue(alice,"pointer.move_relative",{dx,dy:0,idempotency_key:key,wait_ms:0})));
  assert.equal(reads,2);assert.equal(outcomes.filter(value=>value.status==="fulfilled").length,1);
  const rejected=outcomes.find(value=>value.status==="rejected");assert.ok(rejected?.status==="rejected");assert.match(String(rejected.reason),/IDEMPOTENCY_CONFLICT/);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_mouse_commands").get()!.n,1);
});

test("software: enqueue expiry and insertion roll back together on a write failure",async()=>{
  const l=lab(),r=await mouseReady(l),first=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});l.tick(5001);
  const batch=l.db.batch.bind(l.db);l.db.batch=async statements=>{statements[1].execute=()=>{throw Error("injected transaction failure");};return batch(statements);};
  await assert.rejects(r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0}),/injected transaction failure/);
  assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(first.command_id)!.state,"queued");
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_mouse_commands").get()!.n,1);
});

test("software: delayed admission commit returns expired status instead of a fresh queue claim",async()=>{
  const l=lab(),r=await mouseReady(l),batch=l.db.batch.bind(l.db);let delayed=false;
  l.db.batch=async statements=>{const result=await batch(statements);if(!delayed){delayed=true;l.tick(5001);}return result;};
  const result=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});assert.equal(result.state,"expired");
  assert.equal(result.verification,"not_confirmed");assert.equal(result.app_effect_observed,false);
});
test("software: D1 read timing reaches native text with exact age UTC and no extra query or write",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const prepare=l.db.prepare.bind(l.db),logs:Record<string,unknown>[]=[];
  l.db.prepare=sql=>{const stmt=prepare(sql),bind=stmt.bind.bind(stmt);stmt.bind=(...values:unknown[])=>{
    const bound=bind(...values),all=bound.all.bind(bound);bound.all=async<T>()=>{
      const result=await all<T>();Object.assign(result,{meta:{timings:{sql_duration_ms:3.75,secret:"DO_NOT_EXPORT"},duration:999,rows_read:5,
        served_by_region:"APAC",served_by_colo:"NRT",served_by_primary:false,query:"DO_NOT_EXPORT"}});
      l.tick(7);return result;
    };return bound;
  };return stmt;};
  const before=l.db.requests,changes=l.db.raw.prepare("SELECT total_changes() AS n").get()!.n;
  const request=new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28","cf-placement":"remote-PDX"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen",arguments:{device_id:r.actor.id,include_read_timing:true,max_age_ms:1200,wait_for_new_ms:0}}})});
  Object.defineProperty(request,"cf",{value:{colo:"SIN",city:"DO_NOT_EXPORT"}});
  const entered=Date.now()-30;
  const response=await runWithBridgeContext({waitUntil:()=>{},workerFetchStartedUTC:entered,workerPlacement:()=>observeWorkerPlacement(request)},
    ()=>handleMcp(request,{engine:()=>e.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:value=>logs.push(value)}}));
  const rpc=(await response.json() as RpcReply).result,text=JSON.parse(rpc.content.find(b=>b.type==="text")!.text!),timing=text.trace.native_transport,meta=record(rpc.structuredContent.metadata);
  assert.equal(l.db.requests-before,1);assert.equal(l.db.raw.prepare("SELECT total_changes() AS n").get()!.n,changes);
  assert.equal(timing.d1_timing.sql_duration_ms,3.75);assert.equal(timing.d1_timing.sql_duration_samples,1);assert.equal(timing.d1_timing.sql_duration_complete,true);
  assert.equal(timing.d1_timing.rows_read,5);assert.deepEqual(timing.d1_timing.served_by_regions,["APAC"]);assert.deepEqual(timing.d1_timing.contexts,["read_snapshot"]);
  assert.deepEqual(timing.d1_timing.served_by_colos,["NRT"]);assert.deepEqual(timing.d1_timing.served_by_primary,[false]);
  assert.deepEqual(timing.worker_placement,{ingress_colo:"SIN",reported_placement:"remote-PDX"});
  assert.equal(timing.worker_fetch_started_utc_ms,entered);
  assert.equal(timing.worker_fetch_to_handler_ms,timing.handler_started_utc_ms-entered);
  assert.equal(timing.frame_age_reported_at_server_utc_ms,l.now());assert.equal(meta.age_reported_at_server_utc_ms,l.now());
  assert.equal(meta.age_ms,Number(meta.age_reported_at_server_utc_ms)-Number(meta.capture_lower_server_utc_ms));assert.ok(Number(meta.age_ms)<=1200);
  assert.equal(meta.age_timing_point,"server_before_tool_result_serialization");assert.equal(timing.serialization_phase,"before_final_json_encode");
  assert.equal(timing.image_payload.image_blocks,1);assert.equal(timing.image_payload.encoded_chars,Buffer.from(r.bytes).toString("base64").length);
  assert.ok(Buffer.byteLength(JSON.stringify(rpc.structuredContent))<2520,"Opted-in read diagnostics plus the bounded image handoff");
  assert.equal(JSON.stringify(timing).includes("DO_NOT_EXPORT"),false);assert.equal(rpc.content.find(b=>b.type==="image")!.data,Buffer.from(r.bytes).toString("base64"));
  const metrics=logs[0].metrics as Record<string,{calls:number}>;assert.equal(metrics.summary_serialize.calls,1);assert.equal(metrics.serialize.calls,1);
  assert.match(response.headers.get("Server-Timing")!,/sb_summary_encode;dur=/);assert.match(response.headers.get("Server-Timing")!,/sb_response_encode;dur=/);
});

test("software: D1 read timing is an explicit boolean opt-in on the existing native tool",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  let observed=0;
  const invoke=async(method:string,params:Record<string,unknown>,caller=()=>alice)=>{
    const request=new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28","cf-placement":"remote-PDX"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
    const response=await runWithBridgeContext({waitUntil:()=>{},workerFetchStartedUTC:Date.now()-30,
      workerPlacement:()=>{observed++;return observeWorkerPlacement(request);}},
      ()=>handleMcp(request,{engine:()=>e.service,caller,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}}));
    const payload=await response.json() as any;return payload.result??payload;
  };
  const catalog=record(await invoke("tools/list",{})),tool=(catalog.tools as unknown[]).map(record).find(t=>t.name==="read_screen")!;
  const flag=record(record(record(tool.inputSchema).properties).include_read_timing);assert.equal(flag.type,"boolean");assert.equal(flag.default,false);
  for(const value of [null,1,"true",{},[]]){
    const before=l.db.requests,result=await invoke("tools/call",{name:"read_screen",arguments:{device_id:r.actor.id,include_read_timing:value,wait_for_new_ms:0}});
    assert.equal(result.isError,true);assert.equal(result.structuredContent.error,"INVALID_ARGUMENTS");assert.equal(l.db.requests,before);
  }
  const result=await invoke("tools/call",{name:"read_screen",arguments:{device_id:r.actor.id,include_read_timing:false,wait_for_new_ms:0}});
  const timing=record(record(result.structuredContent.trace).native_transport),metadata=record(result.structuredContent.metadata);
  assert.equal(timing.d1_timing,undefined);assert.equal(metadata.age_reported_at_server_utc_ms,undefined);
  assert.equal(timing.worker_placement,undefined);assert.equal(timing.worker_fetch_started_utc_ms,undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(result.structuredContent))<1720);
  const denied=await invoke("tools/call",{name:"read_screen",arguments:{device_id:r.actor.id,include_read_timing:true,wait_for_new_ms:0}},
    ()=>{throw new BridgeError("UNAUTHENTICATED",401);});
  assert.equal(denied.error.code,-32001);
  assert.equal(JSON.stringify(denied).includes("remote-PDX"),false);
  assert.equal(observed,0);
  const malformed=new Request("https://test.example/mcp",{headers:{"cf-placement":"anything-SECRET"}});
  Object.defineProperty(malformed,"cf",{value:{colo:"not-a-colo"}});
  assert.equal(observeWorkerPlacement(malformed),undefined);
});

test("software: D1 commit timing sums batch metadata once and reuses the existing owner metric",async()=>{
  const {l,r,e,permit,request,next}=await framePermitFixture(),batch=l.db.batch.bind(l.db);
  let commitStatements=0;
  l.db.batch=async statements=>{const values=await batch(statements);
    if(statements.some(s=>s.sql.startsWith("INSERT INTO sb_observations"))){commitStatements=statements.length;
      for(const [i,value] of values.entries())Object.assign(value as object,{meta:{...record(record(value).meta),timings:{sql_duration_ms:i+0.25},duration:999,rows_read:i,served_by_region:"APAC",query:"PRIVATE_SQL"}});
    }return values;
  };
  l.tick(50);const meta=next(2,50),before=l.db.requests;
  const accepted=await e.service.acceptFrameRequest(request(permit),meta,async()=>r.bytes),timing=record(accepted).d1_commit_timing as D1Timing;
  assert.equal(l.db.requests-before,1);assert.equal(commitStatements,5);assert.equal(timing.operations,1);assert.equal(timing.statement_count,5);
  assert.equal(timing.sql_duration_ms,11.25);assert.equal(timing.sql_duration_samples,5);assert.equal(timing.sql_duration_complete,true);
  assert.equal(timing.rows_read,10);assert.deepEqual(timing.contexts,["frame_commit"]);assert.ok(timing.wall_ms!==null&&timing.wall_ms>=0);
  assert.equal(JSON.stringify(timing).includes("PRIVATE_SQL"),false);
  await e.flush();
  const metrics=await e.service.metricsFor(alice,r.actor.id),row=metrics.recent.find(v=>v.frame_id===meta.frame_id&&v.kind==="upload")!;
  assert.deepEqual(row.detail?.d1_commit_timing,timing);await assert.rejects(e.service.metricsFor(bob,r.actor.id),/NOT_FOUND/);
});

test("software: D1 read retries accumulate observed SQL metadata without changing the 1200 ms gate",async()=>{
  let monotonic=0;const l=lab(false,{now:()=>monotonic,sleep:async ms=>{monotonic+=ms;l.tick(ms);}}),r=await running(l),e=edge(l);
  const service=new BridgeEngine({db:l.db as unknown as D1Database,bucket:l.bucket as unknown as R2Bucket,now:l.now,cache:e.cache,readTiming:{now:()=>monotonic,sleep:async ms=>{monotonic+=ms;l.tick(ms);}}});
  await e.service.acceptFrame(r.actor,r.metadata,r.bytes);l.db.raw.prepare("UPDATE sb_frames SET capture_lower=?").run(l.now()-1200);
  let reads=0;const prepare=l.db.prepare.bind(l.db);
  l.db.prepare=sql=>{const stmt=prepare(sql),bind=stmt.bind.bind(stmt);stmt.bind=(...values:unknown[])=>{
    const bound=bind(...values),all=bound.all.bind(bound);bound.all=async<T>()=>{
      const result=await all<T>();reads++;Object.assign(result,{meta:reads===1?{timings:{sql_duration_ms:2},rows_read:4,served_by_region:"APAC"}:{duration:3,served_by_region:"UNKNOWN_PRIVATE"}});
      if(reads===1){l.tick(1);monotonic+=1;}else if(reads===2){
        for(const row of result.results as Record<string,unknown>[])if(row.frame_id)row.capture_lower=l.now()-700;
      }return result;
    };return bound;
  };return stmt;};
  const changes=l.db.raw.prepare("SELECT total_changes() AS n").get()!.n,before=l.db.requests;
  const result=await service.readScreen(alice,{device_id:r.actor.id,max_age_ms:1200,wait_for_new_ms:500});
  assert.equal(result.state,"available");assert.equal(result.metadata?.age_ms,700);assert.equal(reads,2);assert.equal(l.db.requests-before,2);
  assert.equal(l.db.raw.prepare("SELECT total_changes() AS n").get()!.n,changes);
  const timing=record(result.trace?.d1_timing);assert.equal(timing.operations,2);assert.equal(timing.statement_count,2);assert.equal(timing.sql_duration_ms,5);assert.equal(timing.sql_duration_complete,true);
  assert.equal(timing.rows_read,4);assert.equal(timing.rows_read_samples,1);assert.equal(timing.rows_read_complete,false);assert.equal(timing.duration_fallback_samples,1);assert.deepEqual(timing.served_by_regions,["APAC"]);
});

test("software: MCP timing preserves bound batches, failures and R2 bodies without logging private values",async()=>{
  const l=lab(),logs:Record<string,unknown>[]=[],trace=new McpPerformance({log:value=>logs.push(value)}),db=trace.database(l.db as unknown as D1Database),bucket=trace.bucket(l.bucket as unknown as R2Bucket);
  assert.equal((await db.prepare("SELECT ? AS v").bind("PRIVATE SQL VALUE").first<{v:string}>())?.v,"PRIVATE SQL VALUE");
  const batch=await db.batch<{v:string}>([db.prepare("SELECT ? AS v").bind("PRIVATE BATCH VALUE")]);assert.equal(batch[0].results[0].v,"PRIVATE BATCH VALUE");
  await assert.rejects(db.prepare("SELECT * FROM private_missing_table").all(),/no such table/);
  await bucket.put("PRIVATE STORAGE KEY",new Uint8Array([1,2,3]));const body=await bucket.get("PRIVATE STORAGE KEY");assert.deepEqual([...new Uint8Array(await body!.arrayBuffer())],[1,2,3]);
  trace.finish(new Response());const metrics=logs[0].metrics as Record<string,{calls:number;failures:number}>;
  assert.equal(metrics.d1.calls,3);assert.equal(metrics.d1.failures,1);assert.equal(metrics.r2.calls,2);assert.equal(metrics.r2_body.calls,1);
  assert.equal(JSON.stringify(logs).includes("PRIVATE"),false);assert.equal(JSON.stringify(logs).includes("private_missing_table"),false);
});
test("software: image forwarding aliases are visible before ordinary read instructions",async()=>{
  const l=lab();
  for(const modern of [false,true])for(const method of ["initialize","tools/list"]){
    const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json",...(modern?{"MCP-Protocol-Version":"2026-07-28"}:{})},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params:method==="initialize"?{protocolVersion:modern?"2026-07-28":"2025-11-25"}:{}})}),{engine:()=>l.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
    const result=(await response.json() as RpcReply).result as unknown as Record<string,unknown>;
    const instructions=method==="initialize"?String(result.instructions):String((result.tools as Array<{name:string;description:string}>).find(t=>t.name==="read_screen")?.description);
    const beginning=instructions.slice(0,420);
    assert.match(beginning,/content_items/);assert.match(beginning,/MCP content/);
    assert.match(beginning,/structuredContent.*metadata/);assert.match(beginning,/image\(block\)/);
  }
});

test("software: Live display preserves one real frame across image carriers without granting input authority",async()=>{
  const l=lab(),r=await running(l),e=edge(l);
  await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const source=Buffer.from(r.bytes).toString("base64");
  const release:string[]=[];
  for(const [format,mime] of [["original_jpeg","image/jpeg"],["compact_jpeg","image/jpeg"],["compact_png","image/png"]]){
    const request=new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen_live",arguments:{device_id:r.actor.id,image_format:format,wait_for_new_ms:0}}})});
    const response=await handleMcp(request,{engine:()=>e.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}},imageReleaseLog:entry=>{if(entry.event==="live_display_rendition")release.push(String(entry.source_frame_id));}});
    const result=(await response.json() as RpcReply).result;
    assert.equal(result.isError,false);
    assert.equal(result.content.length,2);
    const [image,description]=result.content;
    assert.equal(image.type,"image");
    assert.equal(image.mimeType,mime);
    if(format==="original_jpeg")assert.equal(image.data,source);
    else if(format==="compact_png")assert.equal(Buffer.from(image.data,"base64").subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    else assert.equal(jpeg.decode(Buffer.from(image.data,"base64")).width,r.metadata.width);
    const visible=JSON.parse(description.text!);
    assert.deepEqual(visible,result.structuredContent);
    const visibleImage=record(visible.image);
    assert.equal(visibleImage.format,format);
    assert.equal(visibleImage.view_only,true);
    assert.equal(visible.metadata,undefined);
    assert.equal(visible.source_point_proof,undefined);
    assert.equal(visible.click_at_source,undefined);
    assert.equal(visible.source_frame_id,undefined);
    assert.ok(Number(response.headers.get("X-SaySo-Frame-Age-Ms"))<2000);
  }
  assert.deepEqual(release,[r.metadata.frame_id,r.metadata.frame_id,r.metadata.frame_id]);
});

test("software: Live display suppresses pixels after the final freshness check or for another owner",async()=>{
  const l=lab(),r=await running(l),e=edge(l);
  await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  for(const user of [bob,alice]){
    const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen_live",arguments:{device_id:r.actor.id,wait_for_new_ms:0}}})}),{engine:()=>e.service,caller:()=>user,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}},refreshImageReleaseClock:async()=>{l.tick(2001);return true;},imageReleaseLog:entry=>assert.notEqual(entry.event,"live_display_rendition")});
    const result=(await response.json() as RpcReply).result;
    assert.equal(result.content.some(block=>block.type==="image"),false);
    assert.equal(result.structuredContent.image,undefined);
    assert.equal(response.headers.get("X-SaySo-Frame-Age-Ms"),null);
  }
});

test("software: native image-read timing survives metadata loss with unchanged pixels and one read-only snapshot",async()=>{
  for(const modern of [true,false])for(const state of ["available","repeated","unavailable","unchanged"]){
    const l=lab(),r=await running(l),e=edge(l);
    if(state!=="unavailable")await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
    if(state==="repeated"){l.tick(6000);await presentRepeated(l,r,1);}
    if(state==="unavailable")await e.service.stop(r.actor,r.identity.bridge_session_id,true);
    const reference=state==="unchanged"?(await e.service.readScreen(alice,{wait_for_new_ms:0})).image_ref:undefined;
    const before=l.db.requests,changes=l.db.raw.prepare("SELECT total_changes() AS n").get()!.n;
    const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json",...(modern?{"MCP-Protocol-Version":"2026-07-28"}:{}),"X-Private":"SECRET_HEADER"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen",arguments:{device_id:r.actor.id,wait_for_new_ms:0,...(reference?{if_unchanged_since:reference}:{})}}})}),{engine:()=>e.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
    const rpc=(await response.json() as RpcReply).result,text=JSON.parse(rpc.content.find(b=>b.type==="text")!.text!);
    // Discard _meta and structuredContent: the connector must retain this
    // exact request's small timing projection in its ordinary text block.
    const timing=text.trace?.native_transport as Record<string,unknown>;
    assert.ok(timing,"image-read timing is absent from the visible text result");
    assert.deepEqual(timing,(rpc.structuredContent.trace as Record<string,unknown>).native_transport as Record<string,unknown>);
    assert.equal(timing.request_id,rpc.structuredContent.mcp_request_id);assert.equal(timing.request_id,response.headers.get("X-SaySo-Request-ID"));
    assert.equal(timing.timing_point,"before_tool_result_serialization");assert.equal(timing.d1_calls,1);
    assert.ok(Number(timing.handler_elapsed_ms_at_result)>=Number(timing.d1_sum_ms));
    assert.deepEqual(Object.keys(timing).sort(),["request_id","timing_point","handler_elapsed_ms_at_result","d1_calls","d1_sum_ms"].sort());
    for(const value of [r.actor.id,alice.id,r.token,"SECRET_HEADER","SELECT"])assert.equal(JSON.stringify(timing).includes(value),false);
    assert.equal(l.db.requests-before,1);assert.equal(l.db.raw.prepare("SELECT total_changes() AS n").get()!.n,changes);
    assert.equal(rpc.structuredContent.state,state==="repeated"?"unavailable":state);
    const images=rpc.content.filter(b=>b.type==="image");assert.equal(images.length,state==="available"?1:0);
    const delivery=rpc._meta.image_delivery as Record<string,unknown>;
    assert.ok(delivery,"read_screen must expose its actual outgoing image blocks without logging pixels");
    assert.equal(delivery.stage,"server_result");assert.equal(delivery.image_blocks,images.length);
    assert.deepEqual(delivery.mime_types,images.map(b=>b.mimeType));
    assert.equal(delivery.encoded_chars,images.reduce((sum,b)=>sum+(b.data?.length??0),0));
    assert.equal(delivery.render_required,images.length>0);
    assert.equal(delivery.mode,images.length?"image_content":state==="unchanged"?"reuse_image_ref":"no_image");
    if(state==="unchanged")assert.equal(rpc.structuredContent.image_ref,reference);
    assert.equal(rpc.structuredContent.image_blocks,images.length);
    assert.equal(text.image_blocks,images.length);
    if(images.length)assert.equal(images[0].data,Buffer.from(r.bytes).toString("base64"));
  }
});

test("software: image timing includes pre-read authentication delay separately from database service time",async()=>{
  const l=lab(),r=await running(l),e=edge(l);await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  let elapsed=0;const prepare=l.db.prepare.bind(l.db);
  l.db.prepare=sql=>{const statement=prepare(sql),bind=statement.bind.bind(statement);statement.bind=(...values:unknown[])=>{const bound=bind(...values),all=bound.all.bind(bound);bound.all=async<T>()=>{const result=await all<T>();elapsed+=400;return result;};return bound;};return statement;};
  const before=l.db.requests;
  const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"read_screen",arguments:{wait_for_new_ms:0}}})}),{engine:()=>e.service,caller:()=>{elapsed+=5000;return alice;},origin:"https://test.example",toolAudience:"development",performance:{now:()=>elapsed,log:()=>{}}});
  const rpc=(await response.json() as RpcReply).result,text=JSON.parse(rpc.content.find(b=>b.type==="text")!.text!);
  assert.equal(text.trace.native_transport.handler_elapsed_ms_at_result,5400);
  assert.equal(text.trace.native_transport.d1_sum_ms,400);assert.equal(text.trace.native_transport.d1_calls,1);assert.equal(l.db.requests-before,1);
});

test("software: paired click timing reaches the native structured result without extra reads",async()=>{
  const c=await pairedPhonePoint();
  await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
  c.l.tick(351);const {meta}=await capturedAtPhoneMono(c.l,c.r,10351,2);
  const args={...c.args,device_id:c.r.actor.id,wait_ms:1000};
  const baselineStart=c.l.db.requests;
  const original=await new MouseControl(c.l.service).clickAt(alice,args);
  const baseline=c.l.db.requests-baselineStart;
  const beginWall=Date.now();let elapsed=0;
  const batch=c.l.db.batch.bind(c.l.db);
  c.l.db.batch=async statements=>{const result=await batch(statements);elapsed+=125;return result;};
  const before=c.l.db.requests;
  const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"click_at",arguments:args}})}),
    {retention:false,engine:()=>c.l.service,caller:()=>{elapsed+=400;return alice;},origin:"https://test.example",toolAudience:"development",performance:{now:()=>elapsed,log:()=>{}}});
  const rpc=(await response.json() as RpcReply).result;
  const timing=(rpc.structuredContent.trace as Record<string,unknown>|undefined)?.native_transport as Record<string,unknown>;
  assert.ok(timing,"the native click result has no timing projection");
  assert.equal(rpc.structuredContent.command_id,original.command_id);
  assert.equal(rpc.structuredContent.state,"board_acked");
  assert.equal((rpc.structuredContent.after_screen as {metadata:Record<string,unknown>}).metadata.frame_id,meta.frame_id);
  assert.equal(rpc.content.find(block=>block.type==="image")?.data,Buffer.from(c.r.bytes).toString("base64"));
  assert.equal(c.l.db.requests-before,baseline);
  assert.equal(timing.request_id,rpc.structuredContent.mcp_request_id);
  assert.equal(timing.request_id,response.headers.get("X-SaySo-Request-ID"));
  assert.equal(timing.timing_point,"before_tool_result_serialization");
  assert.ok(Number(timing.handler_started_utc_ms)>=beginWall&&Number(timing.handler_started_utc_ms)<=Date.now());
  assert.equal(timing.move_enqueue_ms,125);
  assert.equal(timing.handler_elapsed_ms_at_result,525);
  assert.equal(timing.d1_calls,baseline);
  assert.equal(timing.d1_sum_ms,125);
  assert.equal(JSON.parse(rpc.content.find(block=>block.type==="text")!.text!).trace,undefined);
});

test("software: timing mirror can be verified through the non-phone profile tool without device reads",async()=>{
  const l=lab(),before=l.db.requests;
  const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"get_profile",arguments:{}}})}),{retention:false,engine:()=>l.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}}});
  const result=(await response.json() as RpcReply).result,timing=((result.structuredContent.trace as Record<string,unknown>).native_transport as Record<string,unknown>);
  assert.equal(result.structuredContent.id,alice.id);assert.equal(l.db.requests-before,0);assert.equal(timing.d1_calls,0);assert.equal(timing.request_id,result.structuredContent.mcp_request_id);assert.equal(JSON.stringify(timing).includes(alice.id),false);
});
test("software: MCP tracing is isolated, logs no rejected input and cannot fail the tool when its sink fails",async()=>{
  const l=lab(),logs:Record<string,unknown>[]=[],invoke=(body:string,failSink=false)=>handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json"},body}),{engine:()=>l.service,caller:()=>{throw new BridgeError("UNAUTHENTICATED",401);},origin:"https://test.example",toolAudience:"development",performance:{log:value=>{logs.push(value);if(failSink)throw Error("log sink down");}}});
  const denied=await(await invoke(JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"get_profile",arguments:{},_meta:{private:"SECRET REJECTED INPUT"}}}),true)).json() as RpcReply;
  assert.equal((denied as any).error.code,-32001);assert.equal(logs[0].outcome,"error");assert.equal((logs[0].metrics as Record<string,{failures:number}>).auth.failures,1);
  const invalid=await invoke("{SECRET INVALID JSON");assert.equal(invalid.status,401);assert.equal(logs.length,2);assert.notEqual(logs[0].request_id,logs[1].request_id);assert.equal((logs[1].metrics as Record<string,{failures:number}>).auth.failures,1);assert.equal((logs[1].metrics as Record<string,unknown>).parse,undefined);assert.equal(JSON.stringify(logs).includes("SECRET"),false);
});

test("software: mouse result polling expires and reads in one owner-scoped database batch",async()=>{
  const l=lab(),r=await mouseReady(l),command=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  let count=l.db.requests;assert.equal((await r.mouse.get(alice,command.command_id)).state,"queued");assert.equal(l.db.requests-count,1);
  l.tick(6000);const changes=l.db.raw.prepare("SELECT total_changes() AS n").get()!.n;
  await assert.rejects(r.mouse.get(bob,command.command_id),/NOT_FOUND/);assert.equal(l.db.raw.prepare("SELECT total_changes() AS n").get()!.n,changes);
  assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(command.command_id)!.state,"queued");
  count=l.db.requests;assert.equal((await r.mouse.get(alice,command.command_id)).state,"expired");assert.equal(l.db.requests-count,1);
  l.db.raw.exec("UPDATE sb_devices SET revoked=1");await assert.rejects(r.mouse.get(alice,command.command_id),/NOT_FOUND/);
});
test("software: mouse start is one atomic scope check and does not extend an elapsed command budget",async()=>{
  const l=lab(),r=await mouseReady(l),command=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});await r.mouse.claim(r.actor,r.identity,0);
  for(const change of [{broadcast_id:uid()},{worker_id:uid()},{bridge_session_id:uid()},{lease_epoch:r.identity.lease_epoch+1},{control_epoch:command.control_epoch+1}]){
    await assert.rejects(r.mouse.start(r.actor,command.command_id,{...r.identity,control_epoch:command.control_epoch,...change}));
    assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(command.command_id)!.state,"claimed");
  }
  const count=l.db.requests,started=await r.mouse.start(r.actor,command.command_id,{...r.identity,control_epoch:command.control_epoch});assert.equal(l.db.requests-count,1);assert.ok(started.ttl_remaining_ms<=2500);
  const other=await mouseReady(l),c=await other.mouse.enqueue(alice,"pointer.click",{device_id:other.actor.id,idempotency_key:uid(),wait_ms:0});await other.mouse.claim(other.actor,other.identity,0);
  l.db.prepare=sql=>new Statement(l.db.raw,sql,()=>l.tick(5500));
  const delayed=await other.mouse.start(other.actor,c.command_id,{...other.identity,control_epoch:c.control_epoch});assert.equal(delayed.ttl_remaining_ms,0);
});
test("software: current phone can settle expired execution as typed no-input failure without granting control",async()=>{
  const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,c.command_id,{...r.identity,control_epoch:c.control_epoch});l.tick(6000);
  assert.equal((await r.mouse.get(alice,c.command_id)).state,"outcome_unknown");
  const body={...r.identity,state:"failed",board_receipt:{},error:"MOUSE_DISPATCH_BUDGET_EXPIRED"};
  const settled=await r.mouse.result(r.actor,c.command_id,body);assert.equal(settled.state,"failed");assert.equal(settled.input_not_submitted,true);assert.equal(settled.app_effect_observed,false);assert.equal(settled.verification,"not_confirmed");
  assert.equal((await r.mouse.status(alice,{device_id:r.actor.id})).enabled,true);
  assert.equal((await r.mouse.result(r.actor,c.command_id,body)).state,"failed");
  await assert.rejects(r.mouse.result(r.actor,c.command_id,{...body,error:"OTHER"}),/RESULT_CONFLICT/);
});

test("software: App portrait refusal is retained and returned to the model without a board receipt",async()=>{
  const l=lab(),r=await mouseReady(l),command=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  await r.mouse.claim(r.actor,r.identity,0);
  await r.mouse.start(r.actor,command.command_id,{...r.identity,control_epoch:command.control_epoch});
  const body={...r.identity,state:"failed",board_receipt:{},input_submitted:false,error:"ROTATE_TO_PORTRAIT"};
  await assert.rejects(r.mouse.result(r.actor,command.command_id,{...body,input_submitted:true}),/NO_INPUT_PROOF_CONFLICT/);
  const settled=await r.mouse.result(r.actor,command.command_id,body);
  assert.equal(settled.error,"ROTATE_TO_PORTRAIT");assert.equal(settled.input_not_submitted,true);
  const response=await liveMcp(l.service,"get_mouse_result",{command_id:command.command_id});
  assert.equal(response.result.structuredContent.error,"ROTATE_TO_PORTRAIT");
  assert.equal(response.result.structuredContent.state,"failed");
});

test("software: paired App portrait refusal preserves the move reason and unsent child",async()=>{
  const fixture=await pairedPhonePoint();
  const fail={state:"failed",input_submitted:false,board_receipt:{},finished_client_mono_ms:null,error:"ROTATE_TO_PORTRAIT"};
  await fixture.r.mouse.result(fixture.r.actor,fixture.move.command_id,{...fixture.r.identity,...fail,
    point_result:{protocol:PAIRED_MOUSE_POINT,click:{...fail,error:"POINT_CLICK_NOT_SUBMITTED"}}});
  assert.equal((await fixture.r.mouse.get(alice,fixture.move.command_id)).error,"ROTATE_TO_PORTRAIT");
  assert.equal((await fixture.r.mouse.get(alice,fixture.click.command_id)).input_not_submitted,true);
  const model=await liveMcp(fixture.l.service,"click_at",fixture.args);
  assert.equal(record(model.result.structuredContent.move_result).error,"ROTATE_TO_PORTRAIT");
  assert.match(model.result.content.filter(part=>part.type==="text").map(part=>part.text).join(" "),/ROTATE_TO_PORTRAIT/);
});
test("software: no-input recovery cannot cross grant, board, capture, worker or device fences",async()=>{
  for(const condition of ["control","boot","capture","worker","revoked","grant"]){
    const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,c.command_id,{...r.identity,control_epoch:c.control_epoch});l.tick(6000);await r.mouse.get(alice,c.command_id);
    if(condition==="control")l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");
    if(condition==="boot")l.db.raw.exec("UPDATE sb_hardware SET board_boot_id='"+uid()+"'");
    if(condition==="capture")l.db.raw.exec("UPDATE sb_sessions SET capture_state='paused'");
    if(condition==="worker")l.db.raw.exec("UPDATE sb_devices SET lease_epoch=lease_epoch+1");
    if(condition==="revoked")l.db.raw.exec("UPDATE sb_devices SET revoked=1");
    if(condition==="grant")l.db.raw.exec("UPDATE sb_sessions SET mouse_enabled=0,mouse_until=0");
    await assert.rejects(r.mouse.result(r.actor,c.command_id,{...r.identity,state:"failed",board_receipt:{},error:"MOUSE_DISPATCH_BUDGET_EXPIRED"}));
    assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(c.command_id)!.state,"outcome_unknown");
  }
});
test("software: late actual acknowledgements remain unknown and cannot later become no-input",async()=>{
  const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,c.command_id,{...r.identity,control_epoch:c.control_epoch});l.tick(6000);
  const ack={...r.identity,state:"board_acked",board_receipt:{command_id:c.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}},finished_client_mono_ms:100};
  await assert.rejects(r.mouse.result(r.actor,c.command_id,ack),/STALE_MOUSE_RECEIPT/);
  const value=await r.mouse.get(alice,c.command_id);assert.equal(value.state,"outcome_unknown");assert.equal(value.input_not_submitted,false);assert.equal(value.app_effect_observed,false);assert.ok(value.board_receipt);
  await assert.rejects(r.mouse.result(r.actor,c.command_id,{...r.identity,state:"failed",board_receipt:{},error:"MOUSE_DISPATCH_BUDGET_EXPIRED"}),/RESULT_CONFLICT/);
});
test("software: committed USB uncertainty cannot be downgraded by a no-input claim",async()=>{
  const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,c.command_id,{...r.identity,control_epoch:c.control_epoch});
  await r.mouse.result(r.actor,c.command_id,{...r.identity,state:"outcome_unknown",board_receipt:{},error:"USB_OUTCOME_UNKNOWN"});
  await assert.rejects(r.mouse.result(r.actor,c.command_id,{...r.identity,state:"failed",board_receipt:{},error:"MOUSE_DISPATCH_BUDGET_EXPIRED"}),/RESULT_CONFLICT/);
  assert.equal((await r.mouse.get(alice,c.command_id)).input_not_submitted,false);
});

test("software: contradictory no-input claims cannot create a retryable result",async()=>{
  const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,c.command_id,{...r.identity,control_epoch:c.control_epoch});
  for(const body of [{state:"failed",board_receipt:{effect:{hid_reports_sent:true}}},{state:"outcome_unknown",board_receipt:{}}]){
    await assert.rejects(r.mouse.result(r.actor,c.command_id,{...r.identity,...body,error:"MOUSE_DISPATCH_BUDGET_EXPIRED"}),/NO_INPUT_PROOF_CONFLICT/);
    assert.equal((await r.mouse.get(alice,c.command_id)).state,"executing");
  }
  const ack=await r.mouse.result(r.actor,c.command_id,{...r.identity,state:"board_acked",board_receipt:{command_id:c.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}},finished_client_mono_ms:1});
  assert.equal(ack.input_not_submitted,false);assert.equal(ack.state,"board_acked");
});

test("software: mouse receipt commits in two D1 calls and identical replay is one read",async()=>{
  const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,c.command_id,{...r.identity,control_epoch:c.control_epoch});
  const body={...r.identity,state:"board_acked",board_receipt:{command_id:c.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}},finished_client_mono_ms:100};
  let count=l.db.requests;const ack=await r.mouse.result(r.actor,c.command_id,body);assert.equal(l.db.requests-count,2);assert.equal(ack.state,"board_acked");
  count=l.db.requests;assert.equal((await r.mouse.result(r.actor,c.command_id,body)).state,"board_acked");assert.equal(l.db.requests-count,1);
  await r.mouse.stop(alice,{});assert.equal((await r.mouse.result(r.actor,c.command_id,body)).state,"board_acked");assert.equal((await r.mouse.status(alice,{device_id:r.actor.id})).enabled,false);
});
test("software: concurrent identical receipts converge and contradictory receipts cannot replace them",async()=>{
  const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,c.command_id,{...r.identity,control_epoch:c.control_epoch});
  const body={...r.identity,state:"board_acked",board_receipt:{command_id:c.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}},finished_client_mono_ms:100};
  const replies=await Promise.all([r.mouse.result(r.actor,c.command_id,body),r.mouse.result(r.actor,c.command_id,structuredClone(body))]);assert.ok(replies.every(x=>x.state==="board_acked"));
  await assert.rejects(r.mouse.result(r.actor,c.command_id,{...body,finished_client_mono_ms:101}),/RESULT_CONFLICT/);
  assert.equal(l.db.raw.prepare("SELECT count(*) AS n FROM sb_mouse_commands").get()!.n,1);
});
test("software: receipt CAS rechecks authority changed after the joined context read",async()=>{
  for(const condition of ["control","boot","worker","grant","capture","revoked"]){
    const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,c.command_id,{...r.identity,control_epoch:c.control_epoch});
    const prepare=l.db.prepare.bind(l.db);let changed=false;
    l.db.prepare=sql=>{const statement=prepare(sql),bind=statement.bind.bind(statement);statement.bind=(...values:unknown[])=>{const bound=bind(...values),first=bound.first.bind(bound);bound.first=async<T>()=>{const value=await first<T>();if(!changed&&sql.startsWith("SELECT c.*")&&sql.includes(" AS live_session")){changed=true;const mutation={control:"UPDATE sb_sessions SET control_epoch=control_epoch+1",boot:"UPDATE sb_hardware SET board_boot_id='"+uid()+"'",worker:"UPDATE sb_devices SET lease_epoch=lease_epoch+1",grant:"UPDATE sb_sessions SET mouse_enabled=0,mouse_until=0",capture:"UPDATE sb_sessions SET capture_state='paused'",revoked:"UPDATE sb_devices SET revoked=1"}[condition]!;l.db.raw.exec(mutation);}return value;};return bound;};return statement;};
    await assert.rejects(r.mouse.result(r.actor,c.command_id,{...r.identity,state:"board_acked",board_receipt:{command_id:c.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}},finished_client_mono_ms:100}));
    assert.equal(changed,true);assert.notEqual(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(c.command_id)!.state,"board_acked");
  }
});
test("software: claim expiry and returning row share a batch without duplicate winners",async()=>{
  const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  const count=l.db.requests,claimed=await r.mouse.claim(r.actor,r.identity,0);assert.equal(l.db.requests-count,2);assert.equal(claimed?.command_id,c.command_id);
  const again=await r.mouse.claim(r.actor,r.identity,0);assert.equal(again,null);
  await assert.rejects(r.mouse.claim(r.actor,{...r.identity,worker_id:uid()},0),/STALE_LEASE/);
  assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(c.command_id)!.state,"claimed");
});
test("software: simultaneous valid claimers have one winner in the expiry-claim transaction",async()=>{
  const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});
  const replies=await Promise.all([r.mouse.claim(r.actor,r.identity,0),r.mouse.claim(r.actor,r.identity,0)]);assert.equal(replies.filter(x=>x?.command_id===c.command_id).length,1);
});
test("software: joined receipt snapshot does not accept a worker lease elapsed during IO",async()=>{
  const l=lab(),r=await mouseReady(l),c=await r.mouse.enqueue(alice,"pointer.click",{idempotency_key:uid(),wait_ms:0});await r.mouse.claim(r.actor,r.identity,0);await r.mouse.start(r.actor,c.command_id,{...r.identity,control_epoch:c.control_epoch});
  l.db.prepare=sql=>new Statement(l.db.raw,sql,()=>l.tick(11000));
  await assert.rejects(r.mouse.result(r.actor,c.command_id,{...r.identity,state:"board_acked",board_receipt:{command_id:c.command_id,board_boot_id:r.hardware.board_boot_id,state:"executed",effect:{hid_reports_sent:true}},finished_client_mono_ms:100}),/STALE_LEASE/);
  assert.notEqual(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(c.command_id)!.state,"board_acked");
});

async function liveMcp(service:BridgeEngine,name:string,args:Record<string,unknown>,log=()=>{},refreshImageReleaseClock?:()=>Promise<boolean>,caller=alice,
  createImageReleaseClockSampler?:()=>ImageReleaseClockSampler,signal?:AbortSignal,performanceNow?:()=>number,retention=false){
  const releaseEvents:Record<string,unknown>[]=[];
  const response=await handleMcp(new Request("https://test.example/mcp",{
    method:"POST",signal,headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args}}),
  }),{retention,engine:()=>service,caller:()=>caller,origin:"https://test.example",toolAudience:"development",performance:{log,now:performanceNow},refreshImageReleaseClock,createImageReleaseClockSampler,
    imageReleaseLog:entry=>releaseEvents.push(entry)});
  const {result}=await response.json() as RpcReply;
  return {result,images:result.content.filter(block=>block.type==="image"),age:response.headers.get("X-SaySo-Frame-Age-Ms"),response,releaseEvents};
}

test("software: default paired click reports bounded authenticated receipt timing with no extra D1 calls",async()=>{
  const healthyCalls:number[]=[];
  for(const mode of ["fresh","custom_wait","custom_settle","missing_frame","changed_scope","egress_scope","wrong_owner"]){
    let mono=0,reads=0;
    const l=lab(false,{now:()=>mono,sleep:async ms=>{mono+=ms;l.tick(ms);}}),c=await pairedPhonePoint(true,undefined,l);
    const batch=l.db.batch.bind(l.db),dispatchTimes:number[]=[];
    l.db.batch=async statements=>{
      if(!statements.some(statement=>statement.sql.includes("c.id IN (?,?)")))return batch(statements);
      dispatchTimes.push(l.now());
      l.tick(12);
      const result=await batch(statements);
      l.tick(30);
      if(++reads===2){
        await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
        if(mode!=="missing_frame"){
          l.tick(400);
          await capturedAtPhoneMono(l,c.r,10400,2,{source_seq:2});
          if(mode==="egress_scope")l.db.raw.prepare("UPDATE sb_frames SET capture_lower=?").run(l.now()-1940);
        }
        if(mode==="changed_scope")l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");
      }
      return result;
    };
    const {wait_ms:_wait,...args}=c.args;
    const reply=await liveMcp(l.service,"click_at",{...args,device_id:c.r.actor.id,
      ...(mode==="custom_wait"?{wait_ms:5900}:mode==="custom_settle"?{settle_ms:301}:{})},()=>{},async()=>{
      if(mode==="egress_scope"){
        l.tick(70);
        l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");
      }
      return true;
    },mode==="wrong_owner"?bob:alice);
    const result=reply.result.structuredContent,trace=record(result.trace??{}),phase=trace.paired_click_timing;
    const healthy=["fresh","custom_wait","custom_settle"].includes(mode);
    if(healthy){
      assert.equal(result.command_id,c.click.command_id,mode);
      assert.equal(result.state,"board_acked",mode);
      assert.equal(reply.images.length,1,mode);
      healthyCalls.push(Number(record(trace.native_transport).d1_calls));
    }else assert.equal(reply.images.length,0,mode);
    const clickReleases=reply.releaseEvents.filter(event=>event.paired_click);
    if(mode==="wrong_owner")assert.deepEqual(clickReleases,[]);
    else {
      assert.equal(clickReleases.length,1,mode);
      const release=clickReleases[0],event=record(release.paired_click);
      assert.equal(release.event,"live_image_release",mode);
      assert.equal(release.request_id,result.mcp_request_id,mode);
      assert.equal(event.click_command_id,c.click.command_id,mode);
      const candidates=record(event.lookups);
      assert.ok(Number(candidates.sampled)>=3,mode);
      assert.ok((candidates.attempts as unknown[]).length<=8,mode);
      const db=record(event.lookup_d1_timing);
      assert.ok(Number(db.operations)>=3,mode);
      assert.doesNotMatch(JSON.stringify(event),/idempotency_key|device_id|owner_id|source_view_proof|image\/jpeg|SELECT/);
      if(healthy){
        assert.equal(event.selected_frame_id,record(record(result.after_screen).metadata).frame_id,mode);
        assert.equal(event.release_age_upper_ms,Number(reply.age),mode);
        assert.equal(event.release_headroom_ms,2000-Number(reply.age),mode);
        assert.equal(candidates.frames_redacted,false,mode);
      }else{
        assert.equal(event.selected_frame_id,null,mode);
        assert.equal(event.release_headroom_ms,null,mode);
        assert.equal(candidates.frames_redacted,true,mode);
        assert.ok((candidates.attempts as Record<string,unknown>[]).every(attempt=>attempt.frame_id===null),mode);
      }
    }
    if(mode!=="fresh"&&mode!=="missing_frame"){
      assert.equal(phase,undefined,mode);
      if(mode==="wrong_owner")assert.equal(reply.result.isError,true);
      if(mode==="changed_scope")assert.equal(record(result.after_screen).reason,"AFTER_COMMAND_SCOPE_CHANGED");
      if(mode==="egress_scope")assert.equal(record(result.after_screen).release_failure,"frame_expired");
      continue;
    }
    const timing=record(phase),admission=record(timing.admission),receipt=record(timing.receipt);
    assert.equal(admission.path,"fast",mode);
    assert.equal(admission.reused,true,mode);
    assert.equal(receipt.d1_calls,3,mode);
    assert.equal(receipt.pending_count,2,mode);
    const samples=[receipt.first_pending,receipt.latest_pending,receipt.first_terminal].map(record);
    for(const [index,sample] of samples.entries()){
      assert.equal(sample.worker_dispatch_utc_ms,dispatchTimes[index],mode);
      assert.equal(sample.d1_read_utc_ms,dispatchTimes[index]+12,mode);
      assert.ok(Number(sample.worker_return_utc_ms)>=dispatchTimes[index]+42,mode);
      assert.equal(sample.click_state,index<2?"executing":"board_acked",mode);
      assert.equal(sample.move_state,index<2?"executing":"board_acked",mode);
    }
    assert.equal(receipt.d1_elapsed_ms,samples.reduce((sum,sample)=>sum+Number(sample.worker_return_utc_ms)-Number(sample.worker_dispatch_utc_ms),0),mode);
    assert.doesNotMatch(JSON.stringify(timing),/frame_id|device_id|owner_id|command_id|SELECT/);
    if(mode==="missing_frame")assert.ok(["WAITING_POST_COMMAND_FRAME","NO_FRESH_FRAME"].includes(String(record(result.after_screen).reason)));
  }
  assert.deepEqual(healthyCalls,[4,4,4]);
});

test("software: paired claim diagnostics preserve remaining grant lifetime",async()=>{
  const c=await pairedPhonePoint(false),original=console.info;
  c.l.tick(2800);await capturedAtPhoneMono(c.l,c.r,12800,2,{source_seq:2});
  const events:Record<string,unknown>[]=[];
  console.info=value=>{
    const event=JSON.parse(String(value));
    if(event.event==="paired_click_claim"){events.push(event);c.l.tick(100);}
  };
  try{
    const grant=await c.r.mouse.claim(c.r.actor,c.phone,0);
    assert.ok(grant&&"ttl_remaining_ms" in grant);
    assert.equal(grant.ttl_remaining_ms,Date.parse(grant.expires_at)-c.l.now());
    assert.equal(events.length,1);
    assert.equal(events[0].click_command_id,c.click.command_id);
    assert.deepEqual(record(events[0].d1_timing).contexts,["paired_claim"]);
  }finally{console.info=original;}
});

test("software: paired image release diagnostic runs after the response at the freshness boundary",async()=>{
  const c=await pairedPhonePoint();
  await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
  c.l.tick(400);
  await capturedAtPhoneMono(c.l,c.r,10400,2,{source_seq:2});
  c.l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE device_id=?").run(c.l.now()-1999,c.r.actor.id);
  const jobs:Promise<unknown>[]=[],logs:Record<string,unknown>[]=[];
  const args={...c.args,wait_ms:undefined};
  const response=await runWithBridgeContext({waitUntil:job=>jobs.push(job)},()=>handleMcp(new Request("https://test.example/mcp",{
    method:"POST",headers:{"Content-Type":"application/json","MCP-Protocol-Version":"2026-07-28"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"click_at",arguments:{...args,device_id:c.r.actor.id}}}),
  }),{engine:()=>c.l.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development",performance:{log:()=>{}},refreshImageReleaseClock:async()=>true,
    imageReleaseLog:entry=>{logs.push(entry);c.l.tick(100);}}));
  assert.equal(response.headers.get("X-SaySo-Frame-Age-Ms"),"1999");
  assert.equal(logs.length,0);
  assert.equal(jobs.length,2); // Existing release diagnostic plus T36 background persistence.
  await Promise.all(jobs);
  assert.equal(logs.length,1);
  const persisted=c.l.db.raw.prepare("SELECT data_json FROM sb_timing_journal WHERE record_key=?").get(response.headers.get("X-SaySo-Request-ID")) as {data_json:string};
  const journal=JSON.parse(persisted.data_json);
  assert.equal(journal.image_count,1);assert.equal(journal.age_upper_ms,1999);
  assert.equal(journal.frame_id,record(record(logs[0].paired_click)).selected_frame_id);
  const event=record(logs[0].paired_click);
  assert.equal(event.release_headroom_ms,1);
  assert.equal(event.click_command_id,c.click.command_id);
});

test("software: paired shadow observes real commits without changing D1 calls, input or egress gates",async()=>{
  const counts:Record<string,number>={};
  for(const mode of ["enabled","disabled","saved","custom","abort","scope_changed","egress_drop","hook_exception"]){
    const registry=new PairedClickShadowRegistry(),abort=new AbortController();
    const l=lab(false,undefined,undefined,mode==="disabled"?false:registry),c=await pairedPhonePoint(false,undefined,l);
    if(mode!=="saved")l.db.raw.exec("DELETE FROM sb_mouse_commands");
    if(mode==="hook_exception"){
      registry.receiptCommitted=()=>{throw Error("private shadow callback");};
      registry.frameCommitted=()=>{throw Error("private shadow callback");};
    }
    let polls=0,moveID="",clickID="";
    const batch=l.db.batch.bind(l.db);
    l.db.batch=async statements=>{
      const result=await batch(statements);
      if(statements.some(statement=>statement.sql.includes("c.id IN (?,?)"))&&++polls===1){
        const granted=await c.r.mouse.claim(c.r.actor,c.phone,0);assert.ok(granted);
        moveID=granted.command_id;clickID=String(granted.paired_click_command_id);
        if(mode==="abort")abort.abort();
        const body={...c.body,board_receipt:{...c.body.board_receipt,command_id:moveID},
          point_result:{...c.body.point_result,click:{...c.body.point_result.click,board_receipt:{...c.body.point_result.click.board_receipt,command_id:clickID}}}};
        await c.r.mouse.result(c.r.actor,moveID,body);
        if(mode==="scope_changed")l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");
        l.tick(450);
        const receiver=edge(l,undefined,mode==="disabled"?false:registry);
        await receiver.service.acceptFrame(c.r.actor,{...c.r.metadata,frame_id:uid(),frame_seq:2,source_seq:2,
          capture_mono_ms:10450,capture_offset_ms:450,captured_at:new Date(l.now()+450).toISOString()},c.r.bytes);
      }
      return result;
    };
    const {wait_ms:_wait,...base}=c.args;
    const reply=await liveMcp(l.service,"click_at",{...base,device_id:c.r.actor.id,
      ...(mode==="custom"?{wait_ms:5900}:{})},()=>{},async()=>{
        if(mode==="egress_drop"){l.tick(2200);l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");}
        return true;
      },alice,undefined,abort.signal);
    const result=reply.result.structuredContent,trace=record(result.trace??{}),shadow=trace.paired_click_shadow;
    assert.equal(result.state,"board_acked",mode);assert.equal(result.command_id,clickID,mode);
    assert.equal(result.move_command_id,moveID,mode);assert.equal(registry.registrations,0,mode);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2,mode);
    counts[mode]=Number(record(trace.native_transport).d1_calls);
    if(["scope_changed","egress_drop","abort"].includes(mode))assert.equal(reply.images.length,0,mode);
    else assert.equal(reply.images.length,1,mode);
    if(mode==="enabled"||mode==="hook_exception"){
      const numbers=record(shadow);assert.equal(numbers.registered,1,mode);
      assert.equal(numbers.receipt_commit_notice_seen,mode==="enabled"?1:0,mode);
      assert.equal(numbers.eligible_frame_commit_notices,mode==="enabled"?1:0,mode);
      assert.ok(Object.values(numbers).every(x=>typeof x==="number"&&Number.isFinite(x)),mode);
      for(const secret of [alice.id,c.r.actor.id,moveID,clickID,"private shadow callback"])assert.equal(JSON.stringify(numbers).includes(secret),false,mode);
    }else assert.equal(shadow,undefined,mode);
  }
  for(const mode of ["disabled","saved","custom","abort","hook_exception"])assert.equal(counts[mode],counts.enabled,mode);
});

async function lateReleaseFixture(afterCommand=false, onWait?:()=>Promise<void>) {
  let clock=0;
  const waits:number[]=[];
  const l=lab(false,{now:()=>clock,sleep:async ms=>{waits.push(ms);advance(ms);await onWait?.();}},new FrameUploadPermits("78".repeat(32)));
  const confirmed=afterCommand?await acknowledgedMouse(l):undefined;
  const r=confirmed??await running(l);
  const first=await capturedAtPhoneMono(l,r,10020,1,{source_seq:1});
  l.tick(950);
  const advance=(ms:number)=>{clock+=ms;l.tick(ms);};
  const counts=()=>({writes:l.db.raw.prepare("SELECT total_changes() n").get()!.n,
    commands:l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,
    refreshes:l.db.raw.prepare("SELECT count(*) n FROM sb_refreshes").get()!.n});
  const args={wait_for_new_ms:250,max_age_ms:999,device_id:r.actor.id,
    ...(confirmed?{after_command_id:confirmed.command.command_id,after_command_min_gap_ms:10}:{})};
  const snapshots=afterFirstScreenSnapshot(l,async()=>{});
  return {l,r,first,args,advance,counts,snapshots,waits,
    publish:(extra:Record<string,unknown>={})=>capturedAtPhoneMono(l,r,10970,2,{source_seq:2,...extra})};
}

function unpackOrdinaryReadAttempts(diagnostic:Record<string,unknown>){
  assert.equal(diagnostic.schema,"ordinary_read_attempts.v1");
  const columns=diagnostic.columns as string[];
  return (diagnostic.attempts as unknown[][]).map(row=>{
    assert.equal(row.length,columns.length);
    return Object.fromEntries(columns.map((column,index)=>[column,row[index]]));
  });
}

test("software: opted ordinary read logs the same D1 query's dispatch, SELECT, return and release without changing the result",async()=>{
  const l=lab(),r=await running(l);
  await capturedAtPhoneMono(l,r,10000,1,{source_seq:1});
  let reads=0,selects=0;
  const prepare=l.db.prepare.bind(l.db);
  l.db.prepare=sql=>{
    const statement=prepare(sql);
    if(sql.startsWith("WITH candidates AS")){
      reads++;
      if(sql.includes(" AS d1_read_at_utc_ms"))selects++;
      const bind=statement.bind.bind(statement);
      statement.bind=(...values:unknown[])=>{
        const bound=bind(...values),all=bound.all.bind(bound);
        bound.all=async<T>()=>{l.tick(11);const rows=await all<T>();l.tick(17);return rows;};
        return bound;
      };
    }
    return statement;
  };
  const args={device_id:r.actor.id,wait_for_new_ms:0};
  const start=l.now();
  const opted=await liveMcp(l.service,"read_screen",{...args,include_read_timing:true},()=>{},async()=>{l.tick(3);return true;});
  assert.equal(reads,1);
  assert.equal(selects,1);
  assert.equal(opted.images.length,1);
  assert.equal(opted.releaseEvents.length,1);
  const witness=opted.releaseEvents[0],diagnostic=record(witness.ordinary_read);
  const [attempt]=unpackOrdinaryReadAttempts(diagnostic);
  assert.equal(witness.request_id,opted.result.structuredContent.mcp_request_id);
  assert.equal(diagnostic.frames_redacted,false);
  assert.equal(diagnostic.sampled,1);
  assert.equal(diagnostic.dropped,0);
  assert.equal(attempt.phase,"initial");
  assert.equal(attempt.reason,"available");
  assert.equal(attempt.worker_dispatch_utc_ms,start);
  assert.equal(attempt.d1_read_at_utc_ms,start+11);
  assert.equal(attempt.worker_return_utc_ms,start+28);
  assert.equal(diagnostic.prepared_at_worker_utc_ms,start+28);
  assert.equal(diagnostic.release_checked_at_worker_utc_ms,start+31);
  assert.equal(attempt.frame_id,record(opted.result.structuredContent.metadata).frame_id);
  assert.equal(attempt.age_upper_at_worker_return_ms,Number(attempt.age_upper_at_d1_ms)+17);
  assert.equal(opted.result.structuredContent.ordinary_read,undefined);
  assert.equal(opted.result._meta.ordinary_read,undefined);
  const log=JSON.stringify(witness);
  for(const secret of [r.token,r.actor.id,alice.id,r.identity.bridge_session_id,r.identity.broadcast_id,r.identity.worker_id])
    assert.ok(!log.includes(String(secret)));
  const defaultRead=await liveMcp(l.service,"read_screen",args);
  assert.equal(reads,2);
  assert.equal(selects,1);
  assert.equal(defaultRead.images[0].data,opted.images[0].data);
  assert.equal(defaultRead.releaseEvents[0].ordinary_read,undefined);
  const conditional=await liveMcp(l.service,"read_screen",{...args,include_read_timing:true,if_unchanged_since:defaultRead.result.structuredContent.image_ref});
  assert.equal(conditional.result.structuredContent.state,"unchanged");
  assert.equal(conditional.releaseEvents[0].ordinary_read,undefined);
  assert.equal(selects,1);
});

test("software: ordinary read diagnostics join late recovery and redact prior frames when authorization disappears",async()=>{
  for(const revoked of [false,true]){
    let f:Awaited<ReturnType<typeof lateReleaseFixture>>;
    f=await lateReleaseFixture(false,async()=>{await f.publish();});
    let gates=0;
    const reply=await liveMcp(f.l.service,"read_screen",{...f.args,include_read_timing:true},()=>{},async()=>{
      if(++gates===1){
        f.advance(20);
        if(revoked)f.l.db.raw.exec("UPDATE sb_devices SET revoked=1");
      }
      return true;
    });
    assert.equal(reply.releaseEvents.length,1);
    const witness=reply.releaseEvents[0],diagnostic=record(witness.ordinary_read);
    assert.equal(witness.request_id,reply.result.structuredContent.mcp_request_id);
    assert.equal(diagnostic.frames_redacted,revoked);
    assert.equal(diagnostic.sampled,revoked?2:3);
    const attempts=unpackOrdinaryReadAttempts(diagnostic);
    assert.deepEqual(attempts.map(attempt=>attempt.phase),revoked?["initial","release_successor"]:["initial","release_successor","release_successor"]);
    if(revoked){
      assert.equal(reply.images.length,0);
      assert.ok(attempts.every(a=>a.frame_id===null&&a.frame_seq===null&&a.capture_lower_server_utc_ms===null&&a.age_upper_at_d1_ms===null&&a.age_upper_at_worker_return_ms===null));
      assert.equal(attempts[1].d1_read_at_utc_ms,null);
      assert.doesNotMatch(JSON.stringify(witness),new RegExp(String(f.first.meta.frame_id)));
    }else{
      assert.equal(reply.images.length,1);
      assert.equal(attempts[0].frame_id,f.first.meta.frame_id);
      assert.equal(attempts[1].reason,"frame_too_old");
      assert.equal(attempts[2].frame_id,record(reply.result.structuredContent.metadata).frame_id);
      assert.equal(diagnostic.release_checked_at_worker_utc_ms,f.l.now());
    }
  }
});

test("software: ordinary read diagnostics retain the full default window and log lookup errors once",async()=>{
  for(const lookupError of [false,true]){
    let clock=0;
    const l=lab(false,{now:()=>clock,sleep:async ms=>{clock+=ms;l.tick(ms);}}),r=await running(l);
    l.db.raw.prepare("UPDATE sb_devices SET worker_expires=? WHERE id=?").run(l.now()+60_000,r.actor.id);
    const reads=afterFirstScreenSnapshot(l,async()=>{if(lookupError)throw Error("PRIVATE D1 DETAIL");});
    const reply=await liveMcp(l.service,"read_screen",{device_id:r.actor.id,include_read_timing:true});
    assert.equal(reply.images.length,0);
    assert.equal(reply.releaseEvents.length,1);
    const witness=reply.releaseEvents[0],diagnostic=record(witness.ordinary_read);
    assert.equal(witness.request_id,reply.result.structuredContent.mcp_request_id);
    assert.equal(diagnostic.sampled,reads());
    const attempts=unpackOrdinaryReadAttempts(diagnostic);
    assert.equal(attempts.length,lookupError?1:32);
    assert.equal(attempts[0].attempt,1);
    assert.equal(attempts.at(-1)?.attempt,reads());
    assert.equal(diagnostic.dropped,reads()-attempts.length);
    if(!lookupError)assert.equal(attempts[1].phase,"retry");
    if(lookupError){
      assert.equal(witness.drop_reason,"READ_ERROR");
      assert.equal(diagnostic.frames_redacted,true);
      assert.equal(attempts[0].reason,"lookup_error");
      assert.equal(attempts[0].d1_read_at_utc_ms,null);
      assert.doesNotMatch(JSON.stringify(witness),/PRIVATE D1 DETAIL/);
    }
  }
});

test("software: ordinary read timing clips at 48 compact rows and always keeps the first attempt",()=>{
  const timing=new OrdinaryReadTiming(),origin=1794306658004;
  timing.observeAuthority("scope-for-fixture-only");
  for(let i=1;i<=52;i++){
    const attempt=timing.begin(i===1?"initial":"retry",origin+i*400);
    Object.assign(attempt,{d1_read_at_utc_ms:origin+i*400+140,worker_return_utc_ms:origin+i*400+283,
      frame_id:uid(),frame_seq:2500+i,capture_lower_server_utc_ms:origin+i*400-800.12345,reason:"frame_too_old"});
  }
  const diagnostic=timing.snapshot(),attempts=unpackOrdinaryReadAttempts(diagnostic);
  assert.equal(diagnostic.sampled,52);
  assert.equal(diagnostic.dropped,4);
  assert.deepEqual(attempts.map(attempt=>attempt.attempt),[1,...Array.from({length:47},(_,index)=>index+6)]);
  const serialized=JSON.stringify(diagnostic);
  assert.ok(Buffer.byteLength(serialized)<10_000);
  assert.ok(!serialized.includes("scope-for-fixture-only"));
});

test("software: late release retry returns one newer actual JPEG and original after-command proof",async()=>{
  for(const clockAvailable of [true,false]){
    const f=await lateReleaseFixture(true),before=f.counts();
    let gates=0,newer:Awaited<ReturnType<typeof f.publish>>|undefined,afterUpload:ReturnType<typeof f.counts>|undefined;
    const reply=await liveMcp(f.l.service,"read_screen",f.args,()=>{},async()=>{
      if(++gates===1){
        f.advance(20);newer=await f.publish();afterUpload=f.counts();
        return clockAvailable;
      }
      f.advance(5);return true;
    });
    assert.equal(f.snapshots(),2);
    assert.equal(gates,2);
    assert.equal(reply.images.length,1);
    assert.ok(Number(reply.age)>=0&&Number(reply.age)<1000);
    const summary=reply.result.structuredContent,meta=record(summary.metadata),proof=record(summary.after_command);
    assert.equal(meta.frame_id,newer?.meta.frame_id);
    assert.equal(meta.source_seq,2);
    assert.equal(proof.command_id,f.args.after_command_id);
    assert.equal(proof.relation,"capture_after_phone_board_ack");
    assert.equal(proof.minimum_gap_ms,10);
    assert.equal(record(summary.recovery).retry_trigger,"late_image_release");
    assert.equal(record(summary.recovery).lookups,2);
    assert.match(reply.response.headers.get("Server-Timing")!,/sb_late_release_retry;dur=/);
    assert.deepEqual(f.counts(),afterUpload);
    assert.equal(f.counts().commands,before.commands);
    assert.equal(f.counts().refreshes,before.refreshes);
    assert.equal(reply.releaseEvents.length,1);
    assert.equal(reply.releaseEvents[0].image_count,1);
  }
});

test("software: late release retry refuses unsafe scope, geometry, sequence and unchanged reference results",async()=>{
  for(const mode of ["same","source_sequence","missing_source_sequence","control","geometry","stale_geometry","stale_worker","stale_broadcast",
    "revoked","expired","unknown_clock","database_error","unchanged_reference"]){
    const f=await lateReleaseFixture();
    if(mode==="database_error")afterFirstScreenSnapshot(f.l,async()=>{throw Error("PRIVATE READ FAILURE");},2);
    const view=mode==="unchanged_reference"?await f.l.service.readScreen(alice,{wait_for_new_ms:0}):null;
    const reads=f.snapshots();
    let gates=0,afterUpload:ReturnType<typeof f.counts>|undefined;
    const reply=await liveMcp(f.l.service,"read_screen",{...f.args,...(view?{if_unchanged_since:view.image_ref}:{})},()=>{},async()=>{
      gates++;f.advance(20);
      if(mode==="source_sequence")await f.publish({source_seq:1});
      if(mode==="missing_source_sequence")await f.publish({source_seq:undefined});
      if(mode==="control"){
        await f.publish();
        f.l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");
      }
      if(mode==="geometry")await f.publish({orientation_epoch:1});
      if(mode==="stale_geometry")f.l.db.raw.exec("UPDATE sb_frames SET metadata=json_set(metadata,'$.orientation_epoch',1)");
      if(mode==="stale_worker")f.l.db.raw.prepare("UPDATE sb_devices SET worker_id=?").run(uid());
      if(mode==="stale_broadcast")f.l.db.raw.prepare("UPDATE sb_frames SET metadata=json_set(metadata,'$.broadcast_id',?)").run(uid());
      if(mode==="revoked")f.l.db.raw.exec("UPDATE sb_devices SET revoked=1");
      if(mode==="expired")f.l.db.raw.prepare("UPDATE sb_frames SET expires_at=?").run(f.l.now());
      if(mode==="unknown_clock")f.l.db.raw.exec("UPDATE sb_frames SET capture_lower=NULL");
      afterUpload=f.counts();
      return true;
    });
    const transient=mode==="same"||mode==="source_sequence";
    assert.equal(f.snapshots()-reads,view?1:transient?3:2,mode);
    assert.deepEqual(f.waits,transient?[150]:[],mode);
    assert.equal(gates,1);
    assert.equal(reply.images.length,0);
    assert.equal(reply.result.structuredContent.state,"unavailable");
    assert.equal(reply.result.structuredContent.image_ref,undefined);
    assert.equal(reply.result.structuredContent.source_view_proof,undefined);
    assert.doesNotMatch(JSON.stringify(reply.result),/PRIVATE READ FAILURE|authorized_release_successor_miss/);
    assert.deepEqual(f.counts(),afterUpload);
  }
});

test("software: a certified transient late successor miss permits exactly one serial lookup within the original deadline",async()=>{
  for(const mode of ["too_old","no_newer_capture","slow_first_snapshot","second_gate_expired"]){
    let publish=async()=>{};
    const f=await lateReleaseFixture(true,()=>publish());
    let successor:string|undefined,afterUpload:ReturnType<typeof f.counts>|undefined,gates=0;
    publish=async()=>{successor=(await f.publish()).meta.frame_id;afterUpload=f.counts();};
    if(mode==="slow_first_snapshot")afterFirstScreenSnapshot(f.l,async()=>{f.advance(197);await publish();},2);
    const reply=await liveMcp(f.l.service,"read_screen",{...f.args,wait_for_new_ms:mode==="second_gate_expired"?2000:250},()=>{},async()=>{
      if(++gates===1){
        if(mode==="no_newer_capture")return false;
        f.advance(20);
      }else if(mode==="second_gate_expired")f.advance(1000);
      return true;
    });
    assert.equal(f.snapshots(),3,mode);
    assert.equal(gates,2,mode);
    assert.deepEqual(f.waits,mode==="slow_first_snapshot"?[]:[150],mode);
    assert.deepEqual(f.counts(),afterUpload,mode);
    if(mode==="second_gate_expired"){
      assert.equal(reply.images.length,0);
      assert.equal(reply.result.structuredContent.source_view_proof,undefined);
      continue;
    }
    assert.equal(reply.images.length,1);
    assert.ok(Number(reply.age)>=0&&Number(reply.age)<1000);
    const summary=reply.result.structuredContent;
    assert.equal(record(summary.metadata).frame_id,successor);
    assert.equal(record(summary.after_command).command_id,f.args.after_command_id);
    assert.equal(record(summary.recovery).lookups,3);
    assert.equal(record(summary.recovery).retry_count,2);
    assert.equal(record(summary.recovery).retry_wait_ms,mode==="slow_first_snapshot"?0:150);
    assert.doesNotMatch(JSON.stringify(reply.result),/authorized_release_successor_miss/);
  }
});

test("software: late release wrapper and ordinary polling share one budget origin",async()=>{
  let clock=0,clockReads=0;
  const l=lab(false,{now:()=>{if(++clockReads===2)clock=100;return clock;},sleep:async ms=>{clock+=ms;l.tick(ms);}});
  const r=await running(l);
  await capturedAtPhoneMono(l,r,10020,1,{source_seq:1});
  l.tick(2200);
  clock=0;clockReads=0;
  const reads=afterFirstScreenSnapshot(l,async()=>{clock=210;l.tick(210);});
  const {result}=await l.service.readScreenWithReleaseRetry(alice,{device_id:r.actor.id,wait_for_new_ms:200},uid());
  assert.equal(result.state,"unavailable");
  assert.equal(reads(),1,"No ordinary retry may start after the outer deadline");
  assert.equal(result.trace?.retry_budget_exhausted,true);
});

test("software: ordinary late release searches past two transient successor misses in the original window",async()=>{
  let f:Awaited<ReturnType<typeof lateReleaseFixture>>,next:string|undefined;
  let waits=0,gates=0;
  f=await lateReleaseFixture(false,async()=>{
    if(++waits===2)next=(await f.publish()).meta.frame_id;
  });
  const reply=await liveMcp(f.l.service,"read_screen",{...f.args,wait_for_new_ms:500},()=>{},async()=>{
    if(++gates===1)f.advance(20);
    return true;
  });
  assert.deepEqual(f.waits,[150,150]);
  assert.equal(f.snapshots(),4);
  assert.equal(reply.images.length,1);
  assert.equal(record(reply.result.structuredContent.metadata).frame_id,next);
  assert.equal(record(reply.result.structuredContent.recovery).lookups,4);
  assert.equal(gates,2);
  assert.equal(reply.releaseEvents.length,1);
});

test("software: ordinary late release replacements obey one cadence, deadline and authorization fence",async()=>{
  for(const mode of ["next","deadline","revoked","after_command"]){
    const f=await lateReleaseFixture(mode==="after_command");
    const {l,r}=f;
    let gates=0,third:string|undefined;
    const reply=await liveMcp(l.service,"read_screen",{...f.args,wait_for_new_ms:mode==="deadline"?150:500},()=>{},async()=>{
      if(++gates===1){
        f.advance(20);
        await f.publish();
        l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE device_id=?").run(l.now()-990,r.actor.id);
      }else if(gates===2){
        f.advance(10);
        if(mode==="revoked")l.db.raw.exec("UPDATE sb_devices SET revoked=1");
        if(mode==="next")third=(await capturedAtPhoneMono(l,r,10980,3,{source_seq:3})).meta.frame_id;
      }
      return true;
    },alice,undefined,undefined,l.now);
    const resumed=mode==="next"||mode==="revoked";
    assert.equal(f.snapshots(),resumed?3:2,mode);
    assert.equal(gates,mode==="next"?3:2,mode);
    assert.deepEqual(f.waits,resumed?[140]:[],mode);
    assert.equal(reply.images.length,mode==="next"?1:0,mode);
    assert.equal(reply.releaseEvents.length,1,mode);
    if(mode==="next"){
      assert.equal(record(reply.result.structuredContent.metadata).frame_id,third);
      assert.equal(record(reply.result.structuredContent.recovery).lookups,3);
      assert.match(reply.response.headers.get("Server-Timing")!,/sb_late_release_retry;dur=150$/);
    }else{
      assert.equal(reply.result.structuredContent.metadata,undefined);
      assert.equal(reply.result.structuredContent.source_view_proof,undefined);
    }
  }
});

test("software: ordinary late release does not search again after an unproved replacement clock",async()=>{
  for(const mode of ["clock_unavailable","clock_reversed"]){
    const f=await lateReleaseFixture();
    let gates=0;
    const reply=await liveMcp(f.l.service,"read_screen",{...f.args,wait_for_new_ms:500,include_read_timing:true},()=>{},async()=>{
      if(++gates===1){
        f.advance(20);
        await f.publish();
        return true;
      }
      if(mode==="clock_reversed")f.l.tick(-1);
      return mode==="clock_reversed";
    });
    assert.equal(f.snapshots(),2,mode);
    assert.equal(gates,2,mode);
    assert.deepEqual(f.waits,[],mode);
    assert.equal(reply.images.length,0,mode);
    assert.equal(reply.result.structuredContent.release_failure,mode);
    assert.equal(reply.result.structuredContent.source_view_proof,undefined,mode);
  }
});

test("software: late release retry shares the original deadline through lookup, spacing and final clock",async()=>{
  for(const mode of ["before_lookup","during_lookup","spacing","final_clock","second_expiry"]){
    const f=await lateReleaseFixture(),wait=mode==="second_expiry"?2000:mode==="spacing"?150:50;
    let gates=0;
    if(mode==="during_lookup")afterFirstScreenSnapshot(f.l,async()=>f.advance(30),2);
    const reply=await liveMcp(f.l.service,"read_screen",{...f.args,wait_for_new_ms:wait},()=>{},async()=>{
      if(++gates===1){
        f.advance(mode==="before_lookup"?50:20);
        if(mode!=="spacing")await f.publish();
      }else f.advance(mode==="second_expiry"?1000:30);
      return true;
    });
    assert.equal(f.snapshots(),mode==="before_lookup"?1:mode==="second_expiry"?9:2,mode);
    assert.equal(gates,["before_lookup","during_lookup","spacing"].includes(mode)?1:2,mode);
    assert.deepEqual(f.waits,mode==="second_expiry"?[150,150,150,150,150,150]:[],mode);
    assert.equal(reply.images.length,0);
    assert.equal(reply.age,null);
    assert.equal(reply.result.structuredContent.state,"unavailable");
    assert.equal(reply.result.structuredContent.source_view_proof,undefined);
    assert.equal(reply.releaseEvents.length,1);
    if(mode==="final_clock")assert.equal(reply.releaseEvents[0].drop_reason,"READ_DEADLINE_EXPIRED");
  }
});

test("software: strict live MCP drops serialized JPEG and explicit unchanged evidence when late",async()=>{
  const l=lab(),r=await running(l),e=edge(l);
  await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const setAge=l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE device_id=?");
  const fresh=await liveMcp(e.service,"read_screen",{wait_for_new_ms:0});
  const reference=fresh.result.structuredContent.image_ref;
  for(const args of [{},{if_unchanged_since:reference}]){
    setAge.run(l.now()-1990,r.actor.id);
    const before=l.db.requests;
    // MCP logs after producing its response, so the fixture crosses the
    // age boundary after the original image or reference was serialized.
    const expired=await liveMcp(e.service,"read_screen",{wait_for_new_ms:0,...args},()=>l.tick(10));
    const summary=expired.result.structuredContent;
    assert.equal(summary.state,"unavailable");
    assert.equal(summary.reason,"LIVE_FRAME_FRESHNESS_UNPROVEN_AT_RELEASE");
    assert.equal(summary.image_ref,undefined);
    assert.equal(summary.image_blocks,0);
    assert.equal(record(summary.recovery??{}).release_timing,undefined);
    assert.equal(expired.result._meta.frame_metadata,undefined);
    assert.equal(expired.images.length,0);
    assert.equal(expired.age,null);
    assert.equal(l.db.requests-before,1);
    assert.equal(expired.response.headers.get("X-SaySo-Request-ID"),summary.mcp_request_id);
  }
});

test("software: strict live MCP click_at after-image can expire without losing the original receipt",async()=>{
  const c=await pairedPhonePoint();
  await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
  c.l.tick(351);
  const {meta}=await capturedAtPhoneMono(c.l,c.r,10351,2);
  const args={...c.args,device_id:c.r.actor.id,wait_ms:1000};
  const setAge=c.l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE device_id=?");
  setAge.run(c.l.now()-1999.9,c.r.actor.id);
  const count=()=>c.l.db.raw.prepare("SELECT count(*) AS n FROM sb_mouse_commands").get()!.n;
  const before=count();
  const fresh=await liveMcp(c.l.service,"click_at",args);
  const original=fresh.result.structuredContent;
  assert.equal(original.state,"board_acked");
  assert.equal(fresh.images.length,1);
  const after=original.after_screen as Record<string,Record<string,unknown>>;
  assert.equal(after.metadata.frame_id,meta.frame_id);
  assert.equal(after.after_command.command_id,original.command_id);
  setAge.run(c.l.now()-1990,c.r.actor.id);
  const expired=await liveMcp(c.l.service,"click_at",args,()=>c.l.tick(10));
  const retained=expired.result.structuredContent;
  assert.equal(expired.images.length,0);
  assert.equal(retained.command_id,original.command_id);
  assert.equal(retained.state,"board_acked");
  assert.deepEqual(retained.board_receipt,original.board_receipt);
  assert.deepEqual(retained.receipt_observation,original.receipt_observation);
  assert.equal(retained.observation_state,"unavailable");
  assert.equal((retained.after_screen as Record<string,unknown>).reason,"LIVE_FRAME_FRESHNESS_UNPROVEN_AT_RELEASE");
  assert.equal(count(),before);
  const originalRead=await liveMcp(c.l.service,"read_screen",{after_command_id:original.command_id,wait_for_new_ms:0,max_age_ms:1499});
  assert.equal(originalRead.images.length,0);
  assert.equal(originalRead.result.structuredContent.state,"unavailable");
  setAge.run(c.l.now()-1500,c.r.actor.id);
  const postCommandArgs={after_command_id:original.command_id,after_command_min_gap_ms:300,wait_for_new_ms:0};
  const postCommand=await liveMcp(c.l.service,"read_screen",postCommandArgs);
  assert.equal(postCommand.images.length,1);
  assert.equal(Number(postCommand.age),1500);
  assert.equal(record(postCommand.result.structuredContent.after_command).command_id,original.command_id);
  const laterGap=await liveMcp(c.l.service,"read_screen",{...postCommandArgs,after_command_min_gap_ms:400});
  assert.equal(laterGap.images.length,0);
  assert.equal(laterGap.result.structuredContent.reason,"WAITING_POST_COMMAND_FRAME");
  assert.equal(count(),before);
});

test("software: paired late release with an explicit total budget uses one current-scope snapshot after the ordinary window",async()=>{
  for(const mode of ["success","same","revoked","no_initial_grant","grant_expires_at_release","lookup_deadline","replacement_expired","clock_unavailable","clock_reversed","aborted"]){
    let mono=0,clockChecks=0,successor:string|undefined;
    const abort=new AbortController();
    const l=lab(false,{now:()=>mono,sleep:async ms=>{mono+=ms;l.tick(ms);}});
    const c=await pairedPhonePoint(true,undefined,l);
    await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
    l.tick(351);
    const {meta:first}=await capturedAtPhoneMono(l,c.r,10351,2,{source_seq:2});
    l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE device_id=?").run(l.now()-1821,c.r.actor.id);
    if(mode==="no_initial_grant")l.db.raw.exec("UPDATE sb_sessions SET mouse_enabled=0");
    const receiptRows=l.db.raw.prepare("SELECT * FROM sb_mouse_commands ORDER BY id").all();
    const snapshots=afterFirstScreenSnapshot(l,async()=>{
      if(mode==="lookup_deadline")mono+=510;
    },2);
    const {wait_ms:_wait,...defaultArgs}=c.args;
    const reply=await liveMcp(l.service,"click_at",{...defaultArgs,device_id:c.r.actor.id,wait_ms:6000},()=>{},async()=>{
      clockChecks++;
      if(mode==="clock_unavailable")return false;
      if(mode==="clock_reversed"){l.tick(-10);return true;}
      if(clockChecks===1){
        // Expire the prepared JPEG at the final clock check. The independent
        // monotonic observation timer has also just passed its ordinary limit.
        l.tick(298);mono+=2010;
        if(mode!=="same"){
          successor=(await capturedAtPhoneMono(l,c.r,10649,3,{source_seq:3})).meta.frame_id;
        }
        if(mode==="revoked")l.db.raw.exec("UPDATE sb_sessions SET mouse_enabled=0");
        if(mode==="grant_expires_at_release")l.db.raw.prepare("UPDATE sb_sessions SET mouse_until=?").run(l.now()+40);
        if(mode==="aborted")abort.abort();
      }else if(mode==="replacement_expired")l.tick(2000);
      else if(mode==="grant_expires_at_release")l.tick(40);
      return true;
    },alice,undefined,abort.signal);
    const summary=reply.result.structuredContent,after=record(summary.after_screen);
    assert.equal(summary.command_id,c.click.command_id,mode);
    assert.equal(summary.state,"board_acked",mode);
    assert.deepEqual(l.db.raw.prepare("SELECT * FROM sb_mouse_commands ORDER BY id").all(),receiptRows,mode);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_refreshes").get()!.n,0,mode);
    const noSuccessor=["clock_unavailable","clock_reversed","aborted","no_initial_grant"].includes(mode);
    assert.equal(snapshots(),noSuccessor?1:2,mode);
    if(mode==="success"){
      assert.equal(reply.images.length,1);
      assert.equal(record(after.metadata).frame_id,successor);
      assert.notEqual(record(after.metadata).frame_id,first.frame_id);
      const proof=record(after.after_command);
      assert.equal(proof.command_id,c.click.command_id);
      assert.equal(proof.phone_ack_mono_ms,10050);
      assert.equal(proof.minimum_gap_ms,300);
      assert.ok(Number(proof.lower_gap_ms)>300);
      assert.ok(Number(reply.age)<1000);
      assert.equal(record(after.recovery).retry_trigger,"late_image_release");
      assert.equal(record(after.recovery).retry_count,1);
    }else{
      assert.equal(reply.images.length,0,mode);
      assert.equal(after.metadata,null,mode);
      assert.equal(after.after_command,null,mode);
      const timing=record(record(after.recovery).attempt_timing);
      const phases=(timing.attempts as Record<string,unknown>[]).filter(row=>row.phase==="release_successor");
      assert.equal(phases.length,noSuccessor?0:1,mode);
      if(mode==="replacement_expired"){
        // The replacement was authorized in this same scope; only its final
        // clock check expired. Follow the existing frame-ID diagnostic policy.
        assert.equal(phases[0].frame_id,successor);
      }else assert.ok(phases.every(row=>row.frame_id===null&&row.inline_jpeg_chars===0),mode);
    }
  }
});

test("software: paired click_at release shares one bounded recovery against the original receipt",async()=>{
  const secondLookup=new Set(["same","source","second_successor","second_ack","second_deadline"]);
  for(const mode of ["fresh","successor","same","source","geometry","control","ack","old_ack","read_error","clock_unavailable","deadline_before","deadline_during","deadline_release","replacement_expiry","custom_settle","second_successor","second_ack","second_deadline","short_successor","short_mismatch"]){
    let mono=0,gates=0,successor:string|undefined,writesAfterPublish:unknown;
    let duringSpacing=async()=>{};
    const waits:number[]=[],l=lab(false,{now:()=>mono,sleep:async ms=>{waits.push(ms);mono+=ms;l.tick(ms);await duringSpacing();}});
    const short=mode.startsWith("short_"),shortCue=mode==="short_cue";
    const savedGap=short&&mode!=="short_mismatch"?120:300;
    const c=await pairedPhonePoint(true,shortCue?{supported:true}:undefined,l,savedGap);
    await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
    const firstOffset=50+savedGap+1,ready=shortCue?{ready_cue_supported:true,ready_cue_command_id:c.click.command_id}:{};
    l.tick(firstOffset);
    const {meta:first}=await capturedAtPhoneMono(l,c.r,10000+firstOffset,2,{source_seq:2,...ready});
    const args={...c.args,device_id:c.r.actor.id,wait_ms:1000,...(short?{settle_ms:120}:mode==="custom_settle"?{settle_ms:150}:{})};
    l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE device_id=?").run(l.now()-1990,c.r.actor.id);
    const receiptRows=()=>l.db.raw.prepare("SELECT * FROM sb_mouse_commands ORDER BY id").all();
    const expected=receiptRows(),changes=()=>l.db.raw.prepare("SELECT total_changes() n").get()!.n;
    // This idempotent readback uses one standalone original observation.
    // Count the optional successor snapshots without counting the paired batch.
    const reads=afterFirstScreenSnapshot(l,async()=>{
      if(mode==="read_error")throw Error("PRIVATE SNAPSHOT FAILURE");
      if(mode==="deadline_during")mono+=1000;
    },2);
    const changeAck=()=>l.db.raw.prepare("UPDATE sb_mouse_commands SET phone_ack_mono_ms=10049 WHERE id=?").run(c.click.command_id);
    duringSpacing=async()=>{
      if(mode==="second_deadline")mono+=1000;
      if(!["second_successor","second_ack","second_deadline"].includes(mode))return;
      successor=(await capturedAtPhoneMono(l,c.r,10520,3,{source_seq:3})).meta.frame_id;
      if(mode==="second_ack")changeAck();
      writesAfterPublish=changes();
    };
    const reply=await liveMcp(l.service,"click_at",args,()=>{},async()=>{
      if(mode==="clock_unavailable"){gates++;return false;}
      if(++gates===1){
        if(mode==="fresh")return true;
        l.tick(20);
        if(mode==="deadline_before")mono+=1000;
        if(!["same","old_ack","second_successor","second_ack","second_deadline"].includes(mode)){
          const {meta}=await capturedAtPhoneMono(l,c.r,10020+firstOffset,3,{
            source_seq:mode==="source"?2:3,...ready,...(mode==="geometry"?{orientation_epoch:1}:{})});
          successor=meta.frame_id;
        }
        if(mode==="control")l.db.raw.exec("UPDATE sb_sessions SET control_epoch=control_epoch+1");
        if(mode==="ack"||mode==="old_ack")changeAck();
        writesAfterPublish=changes();
      }else if(mode==="deadline_release")mono+=1000;
      else if(mode==="replacement_expiry")l.tick(2000);
      return true;
    });
    const summary=reply.result.structuredContent,after=record(summary.after_screen),readBack=await c.r.mouse.get(alice,c.click.command_id);
    const valid=["fresh","successor","second_successor","short_successor"].includes(mode);
    assert.equal(reply.images.length,valid?1:0,mode);
    assert.equal(reads(),["fresh","clock_unavailable","deadline_before","custom_settle","short_mismatch"].includes(mode)?1:
      secondLookup.has(mode)&&mode!=="second_deadline"?3:2,mode);
    assert.equal(gates,["successor","second_successor","deadline_release","replacement_expiry","short_successor","clock_unavailable"].includes(mode)?2:1,mode);
    assert.deepEqual(waits,secondLookup.has(mode)?[150]:[],mode);
    assert.equal(summary.command_id,c.click.command_id,mode);
    assert.equal(summary.move_command_id,c.move.command_id,mode);
    assert.equal(summary.state,"board_acked",mode);
    assert.deepEqual(summary.board_receipt,readBack.board_receipt,mode);
    assert.equal(record(summary.receipt_observation).phone_ack_mono_ms,10050,mode);
    assert.equal(receiptRows().length,2,mode);
    if(!["ack","old_ack","second_ack"].includes(mode))assert.deepEqual(receiptRows(),expected,mode);
    if(writesAfterPublish!==undefined)assert.equal(changes(),writesAfterPublish,mode);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_refreshes").get()!.n,0,mode);
    assert.equal(reply.releaseEvents.length,1,mode);
    const releaseRecovery=record(after.recovery),timing=record(releaseRecovery.release_timing??{});
    if(valid){
      const proof=record(after.after_command),metadata=record(after.metadata);
      assert.equal(metadata.frame_id,mode==="fresh"?first.frame_id:successor,mode);
      assert.equal(proof.command_id,c.click.command_id,mode);
      assert.equal(proof.phone_ack_mono_ms,10050,mode);
      assert.equal(proof.minimum_gap_ms,short?120:300,mode);
      if(mode==="short_successor")assert.ok(Number(proof.lower_gap_ms)>120&&Number(proof.lower_gap_ms)<300);
      assert.equal(proof.scope_matches_at_snapshot,true,mode);
      assert.ok(Number(reply.age)>=0&&Number(reply.age)<2000,mode);
      assert.equal(releaseRecovery.attempt_timing,undefined,mode);
      assert.equal(releaseRecovery.release_timing,undefined,mode);
      if(mode!=="fresh"){
        const recovery=record(after.recovery);
        assert.equal(recovery.retry_trigger,"late_image_release");
        assert.equal(recovery.retry_count,mode==="second_successor"?2:1,mode);
      }
    }else{
      assert.equal(after.reason,"LIVE_FRAME_FRESHNESS_UNPROVEN_AT_RELEASE",mode);
      assert.equal(after.release_failure,mode==="clock_unavailable"?"clock_unavailable":
        mode==="deadline_release"?"deadline_expired":"frame_expired",mode);
      assert.equal(after.metadata,null,mode);
      assert.equal(after.after_command,null,mode);
      assert.equal(reply.age,null,mode);
      if(mode!=="short_cue"){
        assert.equal(timing.phase,"after_serialization_clock_check",mode);
        const attempts=record(releaseRecovery.attempt_timing),rows=attempts.attempts as Record<string,unknown>[];
        assert.ok(rows.length>0&&rows.length<=8,mode);
        assert.equal(attempts.frames_redacted,!["custom_settle","replacement_expiry","short_mismatch"].includes(mode),mode);
        if(attempts.frames_redacted){
          assert.equal(timing.candidate_frame_id,undefined,mode);
          assert.equal(timing.prepared_at_server_utc_ms,undefined,mode);
          assert.ok(rows.every(row=>row.frame_id===null&&row.capture_lower_server_utc_ms===null&&row.inline_jpeg_chars===0),mode);
        }
        if(mode==="custom_settle"){
          assert.equal(timing.candidate_frame_id,first.frame_id);
          assert.ok(rows.some(row=>row.frame_id===first.frame_id));
          assert.equal(timing.prepared_age_upper_ms,1990);
          assert.equal(timing.checked_age_upper_ms,2010);
          assert.equal(timing.prepared_headroom_ms,10);
          assert.equal(timing.checked_headroom_ms,-10);
          assert.equal(timing.prepare_to_check_ms,20);
          assert.equal(timing.retry_requested,false);
        }
        if(mode==="control"||mode==="ack")assert.equal(timing.retry_requested,true,mode);
      }else assert.equal(releaseRecovery.release_timing,undefined,mode);
    }
    assert.doesNotMatch(JSON.stringify(reply.result),/PRIVATE SNAPSHOT FAILURE|authorized_release_successor_miss/);
  }
});

test("software: paired click_at distinguishes a candidate already stale before serialization",async t=>{
  let mono=0;
  t.mock.method(performance,"now",()=>mono);
  t.mock.timers.enable({apis:["setTimeout"]});
  const l=lab(false,{now:()=>mono,sleep:async ms=>{mono+=ms;}}),c=await pairedPhonePoint(true,undefined,l);
  await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
  l.tick(351);
  await capturedAtPhoneMono(l,c.r,10351,2,{source_seq:2});
  l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE device_id=?").run(l.now()-1990,c.r.actor.id);
  const reads=afterFirstScreenSnapshot(l,async()=>{});
  const prepare=l.service.prepareActionAfterReleaseRetry.bind(l.service);
  l.service.prepareActionAfterReleaseRetry=(...args)=>{
    const original=prepare(...args);
    mono+=10;
    l.tick(15); // Passage of time after the successful read, before JSON encode.
    return original;
  };
  let releaseClockChecks=0;
  const reply=await liveMcp(l.service,"click_at",{...c.args,device_id:c.r.actor.id,wait_ms:10},()=>{},async()=>{
    releaseClockChecks++;return true;
  });
  const result=reply.result.structuredContent,after=record(result.after_screen),recovery=record(after.recovery),timing=record(recovery.release_timing);
  assert.equal(result.state,"board_acked");
  assert.equal(result.command_id,c.click.command_id);
  assert.equal(after.release_failure,"frame_expired");
  assert.equal(after.metadata,null);
  assert.equal(reply.images.length,0);
  assert.equal(releaseClockChecks,0);
  assert.equal(timing.phase,"before_serialization");
  assert.equal(timing.prepared_age_upper_ms,2005);
  assert.equal(timing.prepared_headroom_ms,-5);
  assert.equal(timing.checked_age_upper_ms,null);
  assert.equal(timing.prepare_to_check_ms,null);
  assert.ok(Array.isArray(record(recovery.attempt_timing).attempts));
  assert.equal(reads(),1);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2);
});

test("software: paired click_at can recheck its release clock once without submitting input",async()=>{
  for(const mode of ["same_image","throw_first","clock_unavailable","no_profile","deadline_before","deadline_during",
    "clock_reversed","frame_expired","replacement_clock_unavailable"]){
    let mono=0,gates=0,successor:string|undefined;
    const waits:number[]=[],l=lab(false,{now:()=>mono,sleep:async ms=>{waits.push(ms);mono+=ms;}});
    const c=await pairedPhonePoint(true,undefined,l);
    await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
    l.tick(351);
    const {meta:first}=await capturedAtPhoneMono(l,c.r,10351,2,{source_seq:2});
    l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE device_id=?").run(l.now()-1980,c.r.actor.id);
    const commands=()=>l.db.raw.prepare("SELECT * FROM sb_mouse_commands ORDER BY id").all();
    const saved=commands(),reads=afterFirstScreenSnapshot(l,async()=>{});
    const args={...c.args,device_id:c.r.actor.id,wait_ms:1000,...(mode==="no_profile"?{settle_ms:150}:{})};
    const expired=mode==="frame_expired"||mode==="replacement_clock_unavailable";
    const result=await liveMcp(l.service,"click_at",args,()=>{},async()=>{
      if(++gates===1){
        if(mode==="deadline_before")mono+=1000;
        if(mode==="throw_first")throw Error("PRIVATE CLOCK FAILURE");
        return false;
      }
      if(gates===2){
        if(mode==="deadline_during")mono+=1000;
        if(mode==="clock_unavailable")return false;
        if(expired){
          l.tick(21);
          successor=(await capturedAtPhoneMono(l,c.r,10372,3,{source_seq:3})).meta.frame_id;
        }else l.tick(mode==="clock_reversed"?-5:5);
        return true;
      }
      return mode!=="replacement_clock_unavailable";
    });
    const summary=result.result.structuredContent,after=record(summary.after_screen);
    const valid=mode==="same_image"||mode==="throw_first"||mode==="frame_expired";
    const noRecheck=mode==="no_profile"||mode==="deadline_before";
    assert.equal(result.images.length,valid?1:0,mode);
    assert.equal(reads(),expired?2:1,mode);
    assert.equal(gates,noRecheck?1:expired?3:2,mode);
    assert.deepEqual(waits,[],mode);
    assert.deepEqual(commands(),saved,mode);
    assert.equal(summary.command_id,c.click.command_id,mode);
    assert.equal(summary.move_command_id,c.move.command_id,mode);
    assert.equal(summary.state,"board_acked",mode);
    assert.equal(record(summary.receipt_observation).phone_ack_mono_ms,10050,mode);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_refreshes").get()!.n,0,mode);
    assert.equal(result.releaseEvents.length,1,mode);
    assert.equal(result.releaseEvents[0].clock_rechecked,noRecheck?undefined:true,mode);
    if(valid){
      assert.equal(record(after.metadata).frame_id,successor??first.frame_id,mode);
      assert.equal(record(after.after_command).command_id,c.click.command_id,mode);
      assert.equal(record(after.after_command).minimum_gap_ms,300,mode);
      assert.ok(Number(result.age)>=0&&Number(result.age)<2000,mode);
      assert.equal(after.release_failure,undefined,mode);
    }else{
      assert.equal(result.age,null,mode);
      assert.equal(after.reason,"LIVE_FRAME_FRESHNESS_UNPROVEN_AT_RELEASE",mode);
      assert.equal(after.release_failure,mode==="deadline_during"?"deadline_expired":
        mode==="clock_reversed"?"clock_reversed":"clock_unavailable",mode);
      assert.equal(after.metadata,null,mode);
      assert.equal(after.after_command,null,mode);
    }
    assert.doesNotMatch(JSON.stringify(result.result),/PRIVATE CLOCK FAILURE/);
  }
});

test("software: a retained post-serialization clock read certifies only its fresh candidate within deadline",async t=>{
  t.mock.timers.enable({apis:["setTimeout"]});
  const signal=()=>{let resolve!:()=>void;const promise=new Promise<void>(complete=>{resolve=complete;});return {promise,resolve};};
  for(const mode of ["fresh","expired","replacement","deadline"]){
    let mono=0,reads=0,samplers=0;
    const l=lab(false,{now:()=>mono,sleep:async ms=>{mono+=ms;l.tick(ms);}}),c=await pairedPhonePoint(true,undefined,l);
    await c.r.mouse.result(c.r.actor,c.move.command_id,c.body);
    l.tick(351);
    const first=(await capturedAtPhoneMono(l,c.r,10351,2,{source_seq:2})).meta;
    l.db.raw.prepare("UPDATE sb_frames SET capture_lower=?").run(l.now()-(mode==="expired"||mode==="replacement"?1950:900));
    const started=Array.from({length:3},signal),pending=Array.from({length:3},signal);
    const create=()=>{
      samplers++;
      return imageReleaseClockSampler(()=>{const i=reads++;started[i].resolve();return pending[i].promise;},l.now);
    };
    const advance=(ms:number)=>{mono+=ms;l.tick(ms);t.mock.timers.tick(ms);};
    const response=liveMcp(l.service,"click_at",{...c.args,device_id:c.r.actor.id,wait_ms:1000},()=>{},undefined,alice,create);
    await started[0].promise;
    if(mode==="deadline")mono=1000;
    advance(50);
    if(mode!=="deadline"){
      await started[1].promise;
      advance(15);
      if(mode==="replacement")await capturedAtPhoneMono(l,c.r,10416,3,{source_seq:3});
      pending[0].resolve();
      if(mode==="replacement"){
        await started[2].promise;
        advance(50);
      }
    }
    const result=await response,summary=result.result.structuredContent,after=record(summary.after_screen);
    assert.equal(summary.command_id,c.click.command_id,mode);
    assert.equal(summary.state,"board_acked",mode);
    assert.equal(result.images.length,mode==="fresh"?1:0,mode);
    assert.equal(reads,mode==="deadline"?1:mode==="replacement"?3:2,mode);
    assert.equal(samplers,mode==="replacement"?2:1,mode);
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,2,mode);
    if(mode==="fresh"){
      assert.equal(record(after.metadata).frame_id,first.frame_id);
      assert.equal(result.age,"965");
    }else assert.equal(after.release_failure,mode==="expired"?"frame_expired":"clock_unavailable",mode);
  }
});

test("software: strict live MCP refreshes the hosted clock after serialization and fails closed without that I/O",async()=>{
  const l=lab(),r=await running(l),e=edge(l);
  await e.service.acceptFrame(r.actor,r.metadata,r.bytes);
  const setAge=l.db.raw.prepare("UPDATE sb_frames SET capture_lower=? WHERE device_id=?");
  for(const mode of ["eligible","late","clock_unavailable","clock_error","clock_reversed"]){
    setAge.run(l.now()-1980,r.actor.id);
    let serialized=false,calls=0;
    const result=await liveMcp(e.service,"read_screen",{wait_for_new_ms:0},()=>{serialized=true;},async()=>{
      assert.equal(serialized,true);
      calls++;
      // The fake Worker clock stays frozen until the post-serialization I/O.
      if(mode==="clock_error")throw Error("mock clock I/O failure");
      if(mode==="clock_unavailable")return false;
      l.tick(mode==="eligible"?15:mode==="late"?20:-1);
      return true;
    });
    assert.equal(calls,1);
    assert.equal(result.images.length,mode==="eligible"?1:0);
    assert.equal(result.age,mode==="eligible"?"1995":null);
    assert.equal(result.result.structuredContent.state,mode==="eligible"?"available":"unavailable");
    assert.deepEqual(result.releaseEvents,[{event:"live_image_release",request_id:result.result.structuredContent.mcp_request_id,
      image_count:mode==="eligible"?1:0,age_upper_ms:mode==="eligible"?1995:null,
      drop_reason:mode==="eligible"?null:mode==="late"?"FRESHNESS_UNPROVEN_AT_RELEASE":
        mode==="clock_reversed"?"RELEASE_CLOCK_REVERSED":"RELEASE_CLOCK_UNAVAILABLE"}]);
  }
});


test("software: ordinary read release clock rechecks an authorized JPEG once inside the original deadline",async()=>{
  const f=await lateReleaseFixture(),before=f.counts(),checks:boolean[]=[];
  const reply=await liveMcp(f.l.service,"read_screen",{...f.args,include_read_timing:true},
    ()=>{},undefined,alice,()=>async recheck=>{checks.push(recheck);return recheck;});
  assert.deepEqual(checks,[false,true]);
  assert.equal(f.snapshots(),1);
  assert.equal(reply.images.length,1);
  assert.equal(record(reply.result.structuredContent.metadata).frame_id,f.first.meta.frame_id);
  assert.ok(Number(reply.age)>=0&&Number(reply.age)<1000);
  assert.equal(reply.releaseEvents[0].clock_rechecked,true);
  assert.deepEqual(f.counts(),before);
});

test("software: ordinary read release clock preserves an exact newer same-scope fallback after expiry",async()=>{
  const f=await lateReleaseFixture(),checks:boolean[]=[];
  let newer:Awaited<ReturnType<typeof f.publish>>|undefined,samplers=0;
  const reply=await liveMcp(f.l.service,"read_screen",{...f.args,include_read_timing:true},
    ()=>{},undefined,alice,()=>{
      const original=++samplers===1;
      return async recheck=>{
        checks.push(recheck);
        if(!original)return true;
        if(!recheck)return false;
        f.advance(20);
        newer=await f.publish();
        return true;
      };
    });
  assert.deepEqual(checks,[false,true,false]);
  assert.equal(f.snapshots(),2);
  assert.equal(reply.images.length,1);
  assert.equal(record(reply.result.structuredContent.metadata).frame_id,newer?.meta.frame_id);
  assert.ok(Number(reply.age)>=0&&Number(reply.age)<1000);
});

test("software: ordinary read release clock failures stay bounded and redact the rejected frame",async()=>{
  const cases=[
    {name:"no_wait",wait:0,failure:"clock_unavailable",checks:[false],snapshots:1},
    {name:"deadline",wait:5,failure:"deadline_expired",checks:[false,true],snapshots:1},
    {name:"clock_unavailable",wait:50,failure:"clock_unavailable",checks:[false,true],snapshots:2},
    {name:"clock_reversed",wait:50,failure:"clock_reversed",checks:[false],snapshots:2},
    {name:"expired",wait:50,failure:"frame_expired",checks:[false,true],snapshots:2},
    {name:"revoked",wait:50,failure:"frame_expired",checks:[false,true],snapshots:2},
  ];
  for(const c of cases){
    const f=await lateReleaseFixture(),checks:boolean[]=[];
    const reply=await liveMcp(f.l.service,"read_screen",{...f.args,wait_for_new_ms:c.wait,include_read_timing:true},
      ()=>{},undefined,alice,()=>async recheck=>{
        checks.push(recheck);
        if(c.name==="clock_reversed"){f.l.tick(-1);return true;}
        if(!recheck||c.name==="clock_unavailable")return false;
        if(c.name==="deadline")f.advance(6);
        if(c.name==="expired"||c.name==="revoked")f.advance(20);
        if(c.name==="revoked")f.l.db.raw.exec("UPDATE sb_devices SET revoked=1");
        return true;
      });
    assert.deepEqual(checks,c.checks,c.name);
    assert.equal(f.snapshots(),c.snapshots,c.name);
    assert.equal(reply.images.length,0,c.name);
    assert.equal(reply.age,null,c.name);
    assert.equal(reply.result.structuredContent.state,"unavailable",c.name);
    assert.equal(reply.result.structuredContent.release_failure,c.failure,c.name);
    assert.equal(record(reply.result.structuredContent.release_timing).clock_rechecked,c.checks.includes(true),c.name);
    assert.equal(reply.result.structuredContent.metadata,undefined,c.name);
    assert.equal(reply.result.structuredContent.image_ref,undefined,c.name);
    assert.equal(reply.result.structuredContent.source_view_proof,undefined,c.name);
    assert.ok(!JSON.stringify(reply.result).includes(f.first.meta.frame_id),c.name);
  }
});

test("software: model-decided drag preserves exact endpoints despite animation and rejects changed authority",async t=>{
  for(const mode of ["model","legacy","revoked","wrong_geometry","claim_revoked"]){
    await t.test(mode,async()=>{
      const {l,r,args,source,count,led,caps}=await realDragFixture();
      await led.bind(r.actor,{...r.identity,...r.hardware,capabilities:{...caps,
        "sayso.action_geometry.v1":mode!=="legacy","sayso.drag_model_decision.v1":true,
        "sayso.drag_cloud_acceptance.v1":true}});
      l.tick(4500);
      const bytes=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,137)},65).data;
      await capturedAtPhoneMono(l,{...r,bytes},14400,2,{source_seq:2,content_sha256:await hash(bytes)});
      if(mode==="revoked")l.db.raw.prepare("UPDATE sb_sessions SET mouse_enabled=0").run();
      const input=mode==="wrong_geometry"?{...args,orientation_epoch:1}:args;
      const reply=await liveMcp(l.service,"drag_at",input),value=reply.result.structuredContent;
      if(["legacy","revoked","wrong_geometry"].includes(mode)){
        assert.equal(value.error,mode==="legacy"?"DRAG_NOT_READY":"DRAG_FRAME_OR_CONTROL_CHANGED");
        assert.equal(count(),0);
      }else{
        assert.equal(value.state,"queued",JSON.stringify(value));
        const saved=l.db.raw.prepare("SELECT precondition FROM sb_mouse_commands WHERE id=?").get(String(value.command_id))!;
        const pre=JSON.parse(String(saved.precondition));
        assert.equal(pre.source_frame_id,source.frame_id);
        assert.equal(pre.drag_review_mode,"model_decision.v1");
        assert.equal(pre.drag_source_sha256,source.content_sha256);
        assert.equal(pre.source_from_x,args.from_x);
        assert.equal(pre.source_to_y,args.to_y);
        if(mode==="claim_revoked")l.db.raw.prepare("UPDATE sb_sessions SET mouse_enabled=0").run();
        const claim=await r.mouse.claim(r.actor,r.identity,0);
        if(mode==="claim_revoked")assert.equal(claim,null);
        else assert.equal(claim?.precondition.drag_review_mode,"model_decision.v1");
        assert.equal(count(),1);
      }
    });
  }
});

function seedStoppedMouse(l:ReturnType<typeof lab>,r:Awaited<ReturnType<typeof running>>,state:string,attempted:number|null=0,owner=r.actor.owner_id){
  const id=uid();l.db.raw.prepare("INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,control_epoch,created_at,expires_at,input_attempted,receipt) VALUES(?,?,?,?,?,?,'pointer.click','{}','fixture',?,?,1,?,?,?,?)")
    .run(id,owner,r.actor.id,r.identity.bridge_session_id,uid(),uid(),uid(),state,l.now(),l.now()+5000,attempted,'{"original":"retained"}');return id;
}
function seedStoppedBrowse(l:ReturnType<typeof lab>,r:Awaited<ReturnType<typeof running>>,leased:boolean){
  const id=uid();l.db.raw.prepare("INSERT INTO sb_browse_runs(id,owner_id,device_id,intent_key,intent_digest,session_id,broadcast_id,worker_id,lease_epoch,control_epoch,hardware_id,board_boot_id,hardware_metadata,calibration_id,settings_hash,orientation_epoch,state,queue_json,plan_keys_json,lease_seq,created_at,expires_at) VALUES(?,?,?,?,'fixture',?,?,?,?,1,?,?,'{}',?,'fixture',0,'active','[{}]','[]',?,?,?)")
    .run(id,r.actor.owner_id,r.actor.id,uid(),r.identity.bridge_session_id,r.identity.broadcast_id,r.identity.worker_id,r.identity.lease_epoch,uid(),uid(),uid(),leased?1:0,l.now(),l.now()+5000);return id;
}
test("S6 stop without selection stops every owned device without hardware or readiness",async()=>{
  const l=lab(),a=await running(l),b=await running(l),foreign=await running(l,bob);
  l.db.raw.exec("UPDATE sb_sessions SET mouse_enabled=1,mouse_until=9999999999999");
  l.db.raw.prepare("UPDATE sb_devices SET worker_expires=0 WHERE id=?").run(a.actor.id);
  const first=seedStoppedMouse(l,a,"queued"),second=seedStoppedMouse(l,b,"executing"),other=seedStoppedMouse(l,foreign,"queued");
  const mouse=new MouseControl(l.service),result=await mouse.stop(alice,{});
  assert.equal(result.scope,"all_owned_devices");assert.equal(result.board_release_confirmed,false);
  assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(first)!.state,"cancelled");
  assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(second)!.state,"outcome_unknown");
  assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(other)!.state,"queued");
  assert.equal(l.db.raw.prepare("SELECT mouse_enabled FROM sb_sessions WHERE id=?").get(foreign.identity.bridge_session_id)!.mouse_enabled,1);
  const epochs=l.db.raw.prepare("SELECT id,control_epoch FROM sb_sessions ORDER BY id").all();
  assert.equal((await mouse.stop(alice,{})).already_stopped,true);assert.deepEqual(l.db.raw.prepare("SELECT id,control_epoch FROM sb_sessions ORDER BY id").all(),epochs);
});
test("S6 selected, ended, absent and foreign devices are safe idempotent stops",async()=>{
  const l=lab(),a=await running(l),b=await running(l),foreign=await running(l,bob),mouse=new MouseControl(l.service);
  const first=seedStoppedMouse(l,a,"queued"),second=seedStoppedMouse(l,b,"queued"),other=seedStoppedMouse(l,foreign,"queued");
  await mouse.stop(alice,{device_id:a.actor.id});
  assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(first)!.state,"cancelled");
  assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(second)!.state,"queued");
  await mouse.stop(alice,{device_id:foreign.actor.id});assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(other)!.state,"queued");
  assert.equal((await mouse.stop(alice,{device_id:uid()})).already_stopped,true);
  await l.service.stop(a.actor,a.identity.bridge_session_id);assert.equal((await mouse.stop(alice,{device_id:a.actor.id})).already_stopped,true);
  assert.equal((await new MouseControl(lab().service).stop(alice,{})).already_stopped,true);
});
test("S3 session stop terminalizes mouse and historical browse records without losing receipts",async()=>{
  for(const leased of [false,true]){
    const l=lab(),r=await running(l),other=await running(l),foreign=await running(l,bob);
    const states=["queued","claimed","embedded","executing","board_acked","outcome_unknown","failed"];
    const ids=states.map(state=>seedStoppedMouse(l,r,state));const attempted=seedStoppedMouse(l,r,"claimed",1);
    const protectedIDs=[seedStoppedMouse(l,other,"queued"),seedStoppedMouse(l,foreign,"queued"),seedStoppedMouse(l,r,"queued",0,bob.id)];
    const browse=seedStoppedBrowse(l,r,leased);
    await l.service.stop(r.actor,r.identity.bridge_session_id,true);
    for(let i=0;i<states.length;i++){
      const row=l.db.raw.prepare("SELECT state,receipt FROM sb_mouse_commands WHERE id=?").get(ids[i])!;
      assert.equal(row.state,i<3?"cancelled":i===3?"outcome_unknown":states[i]);assert.equal(row.receipt,'{"original":"retained"}');
    }
    assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(attempted)!.state,"outcome_unknown");
    for(const id of protectedIDs)assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(id)!.state,"queued");
    assert.equal(l.db.raw.prepare("SELECT state FROM sb_browse_runs WHERE id=?").get(browse)!.state,leased?"outcome_unknown":"cancelled");
    const saved=l.db.raw.prepare("SELECT * FROM sb_mouse_commands ORDER BY id").all();await l.service.stop(r.actor,r.identity.bridge_session_id,true);
    assert.deepEqual(l.db.raw.prepare("SELECT * FROM sb_mouse_commands ORDER BY id").all(),saved);
  }
});

test("S6 active grant with no commands is stopped once, and a missing hardware row does not block MCP Stop",async()=>{
  const l=lab(),r=await running(l);l.db.raw.prepare("UPDATE sb_sessions SET mouse_enabled=1,mouse_until=? WHERE id=?").run(l.now()+5000,r.identity.bridge_session_id);
  const first=(await liveMcp(l.service,"stop_mouse",{})).result.structuredContent;
  assert.equal(first.stopped,true);assert.equal(first.already_stopped,false);
  assert.equal((await new MouseControl(l.service).stop(alice,{})).already_stopped,true);
});

test("P4 terminal text is removed while original idempotency and receipts remain",async()=>{
  const {l,r,id,args}=await focusedTextAfterFixture(false);
  const original=l.db.raw.prepare("SELECT * FROM sb_mouse_commands WHERE id=?").get(id)!;
  assert.equal(JSON.parse(String(original.payload)).text,undefined);
  assert.equal(JSON.parse(String(original.payload)).text_redacted,true);
  const repeat=await liveMcp(l.service,"type_text_in_field",{...args,wait_ms:0});
  assert.equal(repeat.result.structuredContent.command_id,id);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE device_id=?").get(r.actor.id)!.n,1);
  assert.equal(l.db.raw.prepare("SELECT digest FROM sb_mouse_commands WHERE id=?").get(id)!.digest,original.digest);
  const changed=await liveMcp(l.service,"type_text_in_field",{...args,text:"different",wait_ms:0});assert.equal(changed.result.isError,true);
});
test("P4 stopping and expiry maintenance redact text without deleting uncertain evidence",async()=>{
  const l=lab(),r=await running(l),id=seedStoppedMouse(l,r,"executing",1);
  l.db.raw.prepare("UPDATE sb_mouse_commands SET kind='keyboard.type_text',payload=? WHERE id=?").run(JSON.stringify({text:"private-code",submit_enter:true}),id);
  await new MouseControl(l.service).stop(alice,{});
  const row=l.db.raw.prepare("SELECT * FROM sb_mouse_commands WHERE id=?").get(id)!;
  assert.equal(row.state,"outcome_unknown");assert.deepEqual(JSON.parse(String(row.payload)),{submit_enter:true,text_redacted:true});assert.ok(row.receipt);
  const queued=seedStoppedMouse(l,r,"queued");l.db.raw.prepare("UPDATE sb_mouse_commands SET kind='keyboard.type_text',payload=?,expires_at=? WHERE id=?").run('{"text":"pending-secret"}',l.now()-300001,queued);
  await l.service.pruneMetadata();assert.equal(JSON.parse(String(l.db.raw.prepare("SELECT payload FROM sb_mouse_commands WHERE id=?").get(queued)!.payload)).text,undefined);
});
test("P4 revoke deletes owned device commands and sessions but preserves another owner",async()=>{
  const l=lab(),a=await running(l),b=await running(l,bob),id=seedStoppedMouse(l,a,"executing",1),other=seedStoppedMouse(l,b,"queued");
  await l.service.revoke(alice,a.actor.id);
  assert.equal(l.db.raw.prepare("SELECT id FROM sb_mouse_commands WHERE id=?").get(id),undefined);
  assert.equal(l.db.raw.prepare("SELECT id FROM sb_sessions WHERE id=?").get(a.identity.bridge_session_id),undefined);
  assert.ok(l.db.raw.prepare("SELECT id FROM sb_mouse_commands WHERE id=?").get(other));
});

test("P4 missing redaction migration blocks new text but preserves original-ID reads",async()=>{
  const {l,r,id,args}=await focusedTextAfterFixture(false);
  l.db.raw.exec("DROP TRIGGER sb_mouse_terminal_text_update");
  const count=()=>l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n;
  const before=count();
  const reply=await liveMcp(l.service,"type_text_in_field",{...args,idempotency_key:uid(),wait_ms:0});
  assert.equal(reply.result.structuredContent.error,"PRIVACY_STORAGE_NOT_READY");assert.equal(count(),before);
  const original=await liveMcp(l.service,"get_mouse_result",{command_id:id});assert.equal(original.result.structuredContent.command_id,id);
  assert.equal((await r.mouse.status(alice,{device_id:r.actor.id})).privacy_storage_ready,false);
});
test("P4 seven-day compaction retains duplicate and input-order barriers and protects user stop tombstones",async()=>{
  const l=lab(),r=await running(l),id=seedStoppedMouse(l,r,"board_acked",1);
  l.db.raw.prepare("UPDATE sb_mouse_commands SET expires_at=?,payload=? WHERE id=?").run(l.now()-7*86400000-1,'{"x":123,"y":456}',id);
  const original=l.db.raw.prepare("SELECT digest,idempotency_key,session_id,control_epoch,input_attempted FROM sb_mouse_commands WHERE id=?").get(id);
  l.db.raw.prepare("UPDATE sb_sessions SET state='stopped',blocked=1,stopped_at=? WHERE id=?").run(l.now()-8*86400000,r.identity.bridge_session_id);
  await l.service.pruneMetadata("maintenance");
  const row=l.db.raw.prepare("SELECT * FROM sb_mouse_commands WHERE id=?").get(id)!;assert.equal(row.receipt,null);assert.deepEqual(JSON.parse(String(row.payload)),{details_redacted:true});
  assert.deepEqual(l.db.raw.prepare("SELECT digest,idempotency_key,session_id,control_epoch,input_attempted FROM sb_mouse_commands WHERE id=?").get(id),original);
  assert.ok(l.db.raw.prepare("SELECT id FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id));
});

test("P4 retired text digests cannot replay; rotated keys preserve original result retrieval",async()=>{
  const {l,r,id,args}=await focusedTextAfterFixture(false);
  const before=l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n;
  assert.match(String(l.db.raw.prepare("SELECT digest FROM sb_mouse_commands WHERE id=?").get(id)!.digest),/^hmac-v1:[0-9a-f]{64}$/);
  const rotated=new BridgeEngine({db:l.db as unknown as D1Database,bucket:l.bucket as unknown as R2Bucket,now:l.now,framePermits:new FrameUploadPermits("cd".repeat(32))});
  const conflict=await liveMcp(rotated,"type_text_in_field",{...args,wait_ms:0});
  assert.equal(conflict.result.structuredContent.error,"IDEMPOTENCY_CONFLICT");
  assert.equal((await liveMcp(rotated,"get_mouse_result",{command_id:id})).result.structuredContent.command_id,id);
  l.db.raw.prepare("UPDATE sb_mouse_commands SET digest=? WHERE id=?").run("retired-unkeyed-text",id);
  assert.equal((await liveMcp(l.service,"type_text_in_field",{...args,wait_ms:0})).result.structuredContent.error,"IDEMPOTENCY_CONFLICT");
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_mouse_commands").get()!.n,before);
});

test("P4 authenticated MCP usage cleans abandoned text without image uploads",async()=>{
  const l=lab(),r=await running(l),id=seedStoppedMouse(l,r,"queued");
  l.db.raw.prepare("UPDATE sb_mouse_commands SET kind='keyboard.type_text',payload=?,expires_at=? WHERE id=?").run('{"text":"123456"}',l.now()-300001,id);
  await liveMcp(l.service,"stop_mouse",{},undefined,undefined,alice,undefined,undefined,undefined,true);
  const row=l.db.raw.prepare("SELECT state,payload FROM sb_mouse_commands WHERE id=?").get(id)!;
  assert.equal(row.state,"cancelled");assert.equal(JSON.parse(String(row.payload)).text,undefined);
});

test("P4 migration erases legacy text SHA digests and retires queued and attempted commands",async()=>{
  const l=lab(),r=await running(l);
  const ids=[seedStoppedMouse(l,r,"queued"),seedStoppedMouse(l,r,"executing",1),seedStoppedMouse(l,r,"board_acked",1)];
  for(const id of ids)l.db.raw.prepare("UPDATE sb_mouse_commands SET kind='keyboard.type_text',digest=?,payload=? WHERE id=?").run("a".repeat(64),'{"text":"123456"}',id);
  l.db.raw.exec("DROP TRIGGER sb_mouse_text_digest_required");
  l.db.raw.exec(readFileSync("drizzle/0027_retire_unkeyed_text_digests.sql","utf8"));
  for(const [i,id] of ids.entries()) {
    const row=l.db.raw.prepare("SELECT * FROM sb_mouse_commands WHERE id=?").get(id)!;
    assert.equal(row.digest,"retired-unkeyed-text");assert.equal(JSON.parse(String(row.payload)).text,undefined);
    assert.equal(row.state,["cancelled","outcome_unknown","board_acked"][i]);
  }
});

test("S6 stop_session without an ID stops all owned sessions and preserves other owners",async()=>{
 const l=lab(),a=await running(l),b=await running(l),other=await running(l,bob);
 const queued=seedStoppedMouse(l,a,"queued"),executing=seedStoppedMouse(l,b,"executing",1);
 const reply=await liveMcp(l.service,"stop_session",{});assert.equal(reply.result.structuredContent.stopped,true);
 assert.deepEqual(new Set(reply.result.structuredContent.stopped_sessions as string[]),new Set([a.identity.bridge_session_id,b.identity.bridge_session_id]));
 assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(queued)!.state,"cancelled");
 assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(executing)!.state,"outcome_unknown");
 assert.equal(l.db.raw.prepare("SELECT state FROM sb_sessions WHERE id=?").get(other.identity.bridge_session_id)!.state,"active");
 const repeated=(await liveMcp(l.service,"stop_session",{})).result.structuredContent;assert.equal(repeated.already_stopped,true);assert.equal(repeated.cloud_image_cleared,null);
 const foreignSelector=(await liveMcp(l.service,"stop_session",{bridge_session_id:other.identity.bridge_session_id})).result.structuredContent;assert.equal(foreignSelector.selector_fallback,true);assert.equal(foreignSelector.selector_fallback_reason,"not_found");assert.equal(l.db.raw.prepare("SELECT state FROM sb_sessions WHERE id=?").get(other.identity.bridge_session_id)!.state,"active");
});
test("S6 bulk session stop continues after a cleanup failure and reports uncertainty",async()=>{
 const l=lab(),a=await running(l),b=await running(l);const stop=l.service.stop.bind(l.service);let calls=0;
 l.service.stop=async(...args)=>{calls++;if(args[1]===a.identity.bridge_session_id)throw Error("fixture failure");return stop(...args);};
 const result=(await liveMcp(l.service,"stop_session",{})).result.structuredContent;
 assert.equal(calls,2);assert.equal(result.stopped,false);assert.equal(result.input_control_enabled,null);assert.equal((result.failed_sessions as any[]).length,1);
 assert.equal(l.db.raw.prepare("SELECT state FROM sb_sessions WHERE id=?").get(b.identity.bridge_session_id)!.state,"stopped");
});

test("S6 malformed stop selectors fall back to all owned targets and disclose that scope",async t=>{
 for(const name of ["stop_mouse","stop_session"] as const)for(const selector of [null,"","   ","My iPhone",12,{},[],"11111111-1111-4111-8111-111111111111 extra"]){
  await t.test(`${name}: ${JSON.stringify(selector)}`,async()=>{
   const l=lab(),a=await running(l),b=await running(l),other=await running(l,bob);
   const first=seedStoppedMouse(l,a,"queued"),second=seedStoppedMouse(l,b,"executing",1),foreign=seedStoppedMouse(l,other,"queued");
   const key=name==="stop_mouse"?"device_id":"bridge_session_id";
   const reply=(await liveMcp(l.service,name,{[key]:selector})).result;
   assert.equal(reply.isError,false);assert.equal(reply.structuredContent.stopped,true);assert.equal(reply.structuredContent.selector_fallback,true);
   assert.equal(reply.structuredContent.scope,name==="stop_mouse"?"all_owned_devices":"all_owned_sessions");
   assert.match(String(reply.structuredContent.selector_notice),/Invalid ID/);
   const compact=JSON.parse(reply.content.find(x=>x.type==="text")!.text!);assert.equal(compact.selector_fallback,true);assert.match(compact.selector_notice,/Invalid ID/);
   assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(first)!.state,"cancelled");
   assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(second)!.state,"outcome_unknown");
   assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(foreign)!.state,"queued");
   assert.equal(l.db.raw.prepare("SELECT state FROM sb_sessions WHERE id=?").get(other.identity.bridge_session_id)!.state,"active");
   const again=(await liveMcp(l.service,name,{[key]:selector})).result.structuredContent;assert.equal(again.already_stopped,true);
   assert.equal(name==="stop_mouse"?again.board_release_confirmed:again.system_broadcast_stop_confirmed,false);
  });
 }
});
test("S6 matching UUIDs stay narrow, unmatched UUIDs stop all owned targets without exposing other owners",async()=>{
 for(const name of ["stop_mouse","stop_session"] as const)for(const mode of ["owned","foreign","missing"]){
  const l=lab(),a=await running(l),b=await running(l),other=await running(l,bob);
  const key=name==="stop_mouse"?"device_id":"bridge_session_id";
  const target=(r:typeof a)=>name==="stop_mouse"?r.actor.id:r.identity.bridge_session_id;
  const first=seedStoppedMouse(l,a,"queued"),second=seedStoppedMouse(l,b,"queued"),foreign=seedStoppedMouse(l,other,"queued");
  const value=mode==="owned"?target(a).toUpperCase():mode==="foreign"?target(other):uid();
  const reply=(await liveMcp(l.service,name,{[key]:value})).result.structuredContent;
  assert.equal(reply.stopped,true);assert.equal(reply.selector_fallback,mode!=="owned");
  if(mode!=="owned"){assert.equal(reply.selector_fallback_reason,"not_found");assert.match(String(reply.selector_notice),/No matching owned target/);}
  assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(first)!.state,"cancelled");
  assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(second)!.state,mode==="owned"?"queued":"cancelled");
  assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(foreign)!.state,"queued");
 }
});

test("W29 old stopped session ID stops current owned sessions and preserves other owners",async()=>{
 const l=lab(),old=await running(l);await l.service.stop(old.actor,old.identity.bridge_session_id,true);
 const a=await running(l),b=await running(l),other=await running(l,bob);
 const queued=seedStoppedMouse(l,a,"queued"),executing=seedStoppedMouse(l,b,"executing",1),foreign=seedStoppedMouse(l,other,"queued");
 const reply=(await liveMcp(l.service,"stop_session",{bridge_session_id:old.identity.bridge_session_id})).result;
 assert.equal(reply.isError,false);assert.equal(reply.structuredContent.scope,"all_owned_sessions");assert.equal(reply.structuredContent.selector_fallback_reason,"stale_session");
 assert.equal(JSON.parse(reply.content.find(x=>x.type==="text")!.text!).selector_fallback_reason,"stale_session");
 assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(queued)!.state,"cancelled");assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(executing)!.state,"outcome_unknown");
 assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(foreign)!.state,"queued");
 for(const r of [a,b])assert.equal(l.db.raw.prepare("SELECT state FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id)!.state,"stopped");
 assert.equal(reply.structuredContent.system_broadcast_stop_confirmed,false);
});
test("W29 a stopped ID without ongoing sessions still retries its image cleanup",async()=>{
 const l=lab(),r=await running(l);await l.service.stop(r.actor,r.identity.bridge_session_id,true);
 const key=`screens/${alice.id}/${r.actor.id}/${r.identity.bridge_session_id}/retry`;await l.bucket.put(key,new Uint8Array([1]));
 const reply=(await liveMcp(l.service,"stop_session",{bridge_session_id:r.identity.bridge_session_id})).result.structuredContent;
 assert.equal(reply.stopped,true);assert.equal(reply.selector_fallback,false);assert.equal(reply.scope,"selected_session");assert.equal(l.bucket.values.has(key),false);
});
test("W29 stale session fallback reports cleanup failures without skipping current stops",async()=>{
 const l=lab(),old=await running(l);await l.service.stop(old.actor,old.identity.bridge_session_id,true);const current=await running(l);
 const stop=l.service.stop.bind(l.service);l.service.stop=async(...args)=>{if(args[1]===old.identity.bridge_session_id)throw Error("cleanup fixture");return stop(...args);};
 const reply=(await liveMcp(l.service,"stop_session",{bridge_session_id:old.identity.bridge_session_id})).result.structuredContent;
 assert.equal(reply.stopped,false);assert.equal(reply.selector_fallback_reason,"stale_session");assert.equal((reply.failed_sessions as any[])[0].bridge_session_id,old.identity.bridge_session_id);
 assert.equal(l.db.raw.prepare("SELECT state FROM sb_sessions WHERE id=?").get(current.identity.bridge_session_id)!.state,"stopped");
});
test("W30 mouse stop resolves scope in one mutation-first D1 batch",async()=>{
 for(const mode of ["omitted","invalid","owned","missing","foreign"]){
  const l=lab(),a=await running(l),b=await running(l),other=await running(l,bob);
  const first=seedStoppedMouse(l,a,"queued"),second=seedStoppedMouse(l,b,"executing",1),foreign=seedStoppedMouse(l,other,"queued");
  const value=mode==="omitted"?undefined:mode==="invalid"?"phone":mode==="owned"?a.actor.id:mode==="foreign"?other.actor.id:uid();
  const before=l.db.requests;const original=l.db.batch.bind(l.db);let observed:string[]=[];l.db.batch=async statements=>{observed=statements.map(s=>s.sql);return original(statements);};
  const reply=await new MouseControl(l.service).stop(alice,value===undefined?{}:{device_id:value});
  assert.equal(l.db.requests-before,1,mode);assert.match(observed[0],/^UPDATE sb_sessions/);assert.match(observed.at(-1)!,/^SELECT CASE/);assert.equal(reply.already_stopped,false);
  assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(first)!.state,"cancelled");assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(second)!.state,mode==="owned"?"executing":"outcome_unknown");assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(foreign)!.state,"queued");
  assert.equal(reply.device_id,mode==="owned"?a.actor.id:null);assert.equal(reply.selector_fallback,["invalid","missing","foreign"].includes(mode));
  const count=l.db.requests;const repeated=await new MouseControl(l.service).stop(alice,value===undefined?{}:{device_id:value});assert.equal(l.db.requests-count,1);assert.equal(repeated.already_stopped,true);assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(second)!.state,mode==="owned"?"executing":"outcome_unknown");
 }
});
test("W30 failed command finalization rolls back the control stop",async()=>{
 const l=lab(),r=await running(l),id=seedStoppedMouse(l,r,"queued");
 const before=l.db.raw.prepare("SELECT mouse_enabled,control_epoch FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id);
 l.db.raw.exec("CREATE TRIGGER stop_fixture_failure BEFORE UPDATE ON sb_mouse_commands BEGIN SELECT RAISE(ABORT,'stop fixture rollback'); END");
 await assert.rejects(new MouseControl(l.service).stop(alice,{}),/stop fixture rollback/);
 assert.deepEqual(l.db.raw.prepare("SELECT mouse_enabled,control_epoch FROM sb_sessions WHERE id=?").get(r.identity.bridge_session_id),before);assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(id)!.state,"queued");
});

test("W29 stale session on the same phone cannot leave its replacement sharing",async()=>{
 const l=lab(),old=await running(l);await l.service.stop(old.actor,old.identity.bridge_session_id,true);
 const broadcast=uid(),created=await l.service.createSession(old.actor,{mode:"broadcast",broadcast_id:broadcast,request_id:uid(),control_enabled:false});
 const worker=uid(),claim=await l.service.claimWorker(old.actor,{bridge_session_id:created.bridge_session_id,broadcast_id:broadcast,worker_id:worker,worker_kind:"broadcast"});
 const current={...old,identity:{bridge_session_id:created.bridge_session_id,broadcast_id:broadcast,worker_id:worker,lease_epoch:claim.lease_epoch}};
 const pending=seedStoppedMouse(l,current,"queued"),before=l.db.raw.prepare("SELECT lease_epoch FROM sb_devices WHERE id=?").get(old.actor.id)!.lease_epoch as number;
 const result=(await liveMcp(l.service,"stop_session",{bridge_session_id:old.identity.bridge_session_id})).result.structuredContent;
 assert.equal(result.stopped,true);assert.equal(result.selector_fallback_reason,"stale_session");assert.equal(l.db.raw.prepare("SELECT state FROM sb_sessions WHERE id=?").get(created.bridge_session_id)!.state,"stopped");
 assert.equal(l.db.raw.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").get(pending)!.state,"cancelled");
 const device=l.db.raw.prepare("SELECT lease_epoch,current_session FROM sb_devices WHERE id=?").get(old.actor.id)!;assert.equal(device.current_session,null);assert.equal(device.lease_epoch,before+1);
});

// E2-02 Fix A: real firmware -> App filter -> scoped server bind contract.
import {existsSync} from "node:fs";
import {appBinding} from "./fixtures/app-capability-filter.ts";
test("Fix A: omitted LED capability binds, persists false and grants no LED scope", async()=>{
  const l=lab(),{actor}=await paired(l),led=new LEDControl(l.service);
  const bound=await led.bind(actor,{hardware_id:uid(),board_boot_id:uid(),protocol_version:"1.0",transport:"usb_ncm",descriptor_version:"software-no-led",capabilities:{"hid.mouse.click":true}});
  assert.equal(bound.bound,true); assert.deepEqual(bound.control_scope,[]);
  const board=await led.hardware(actor),meta=JSON.parse(board.metadata);
  assert.equal(Object.hasOwn(meta.capabilities,"led.set"),true);assert.equal(meta.capabilities["led.set"],false);
  assert.deepEqual(meta.led_config,{});
});
test("Fix A: missing and null LED config both bind as empty while nonobjects remain invalid",async()=>{
  for(const value of [undefined,null,{},"bad",[]]){
    const l=lab(),{actor}=await paired(l),led=new LEDControl(l.service);
    const body={hardware_id:uid(),board_boot_id:uid(),protocol_version:"1.0",transport:"usb_ncm",descriptor_version:"software-no-led",capabilities:{"led.set":false},...(value===undefined?{}:{led_config:value})};
    if(typeof value==="string"||Array.isArray(value))await assert.rejects(led.bind(actor,body),{code:"INVALID_BODY",status:422});
    else {assert.equal((await led.bind(actor,body)).bound,true);assert.deepEqual(JSON.parse((await led.hardware(actor)).metadata).led_config,{});}
  }
});
test("Fix A: every present nonboolean LED declaration is rejected with 422",async()=>{
  for(const value of [null,"false",0,1,{},[],undefined]){
    const l=lab(),{actor}=await paired(l);
    await assert.rejects(new LEDControl(l.service).bind(actor,{hardware_id:uid(),board_boot_id:uid(),protocol_version:"1.0",transport:"usb_ncm",descriptor_version:"software-no-led",capabilities:{"led.set":value}}),{code:"INVALID_CAPABILITIES",status:422});
  }
});
test("Fix A: set_led reports unsupported before diagnostic setup and never enqueues",async()=>{
  for(const explicitDevice of [true,false]){
    const l=lab(),{actor}=await paired(l),led=new LEDControl(l.service);
    await led.bind(actor,{hardware_id:uid(),board_boot_id:uid(),protocol_version:"1.0",transport:"usb_ncm",descriptor_version:"software-no-led",capabilities:{"led.set":false}});
    const response=await handleMcp(new Request("https://test.example/mcp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"set_led",arguments:{on:true,wait_ms:0,...(explicitDevice?{device_id:actor.id}:{})}}})}),{engine:()=>l.service,caller:()=>alice,origin:"https://test.example",toolAudience:"development"});
    const reply=await response.json() as RpcReply;assert.equal(reply.result.isError,true);assert.equal(reply.result.structuredContent.error,"LED_NOT_CONFIGURED");
    assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_led_commands").get()!.n,0);
    await assert.rejects(led.createSession(actor,{mode:"foreground_diagnostic",control_enabled:true,request_id:uid()}),/LED_NOT_CONFIGURED/);
  }
});
test("Fix A: rebind without LED cannot deliver queued or claimed commands",async()=>{
  for(const state of ["queued","claimed"]){
    const l=lab(),r=await ledReady(l),command=await r.led.set(alice,{on:true,wait_ms:0});
    if(state==="claimed")assert.equal((await r.led.claim(r.actor,r.identity,0))?.command_id,command.command_id);
    await r.led.bind(r.actor,{...r.hardware,capabilities:{"led.set":false}});
    if(state==="queued")assert.equal(await r.led.claim(r.actor,r.identity,0),null);
    else await assert.rejects(r.led.start(r.actor,command.command_id,{...r.identity,control_epoch:1}),/COMMAND_EXPIRED_OR_CONNECTION_CHANGED/);
    await assert.rejects(r.led.heartbeat(r.actor,{...r.identity,capture_state:"stopped",usb_connected:true,board_boot_id:r.hardware.board_boot_id}),/LED_NOT_CONFIGURED/);
    await assert.rejects(r.led.set(alice,{device_id:r.actor.id,on:true,wait_ms:0}),/LED_NOT_CONFIGURED/);
    assert.equal(l.db.raw.prepare("SELECT state FROM sb_led_commands WHERE id=?").get(command.command_id)!.state,state);
  }
});
test("Fix A: LED capability lost between precheck and enqueue is atomically fenced",async()=>{
  const l=lab(),r=await ledReady(l),stmt=l.service.stmt.bind(l.service);let changed=false;
  l.service.stmt=(sql:string,...values:unknown[])=>{
    if(sql.startsWith("INSERT INTO sb_led_commands")&&!changed){
      changed=true;l.db.raw.prepare("UPDATE sb_hardware SET metadata=json_set(metadata,'$.capabilities.\"led.set\"',json('false')) WHERE device_id=?").run(r.actor.id);
    }
    return stmt(sql,...values);
  };
  await assert.rejects(r.led.set(alice,{device_id:r.actor.id,on:true,wait_ms:0}),/COMMAND_BUSY_OR_CONNECTION_CHANGED/);
  assert.equal(changed,true);assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_led_commands").get()!.n,0);
});
test("Fix A: actual test-dual and production-usb info survive App filtering and scoped bind",async()=>{
  const fixtures=JSON.parse(readFileSync("tests/fixtures/firmware-info-c12806a.json","utf8"));
  assert.equal(fixtures.firmware_commit,"c12806abb91066627add3b3ea659aa285a0ba01f");
  assert.deepEqual(fixtures.samples.map((s:{profile:string})=>s.profile),["production-usb","test-dual"]);
  for(const sample of fixtures.samples){
    const l=lab(),r=await running(l),led=new LEDControl(l.service),body=appBinding(sample.info);
    assert.equal(Object.hasOwn(sample.info.capabilities,"led.set"),false);assert.equal(Object.hasOwn(sample.info,"led_config"),false);
    assert.equal(Object.hasOwn(body.capabilities,"led.set"),false);assert.equal(body.capabilities["hid.keyboard.ascii"],false);assert.equal(body.led_config,null);
    const result=await led.bind(r.actor,{...r.identity,...body});assert.equal(result.bound,true);assert.equal(result.lease_epoch,r.identity.lease_epoch);
    const stored=JSON.parse((await led.hardware(r.actor)).metadata);
    assert.equal(stored.capabilities["led.set"],false);assert.equal(stored.capabilities["sayso.focused_text"],true);assert.equal(stored.capabilities["sayso.drag_at"],true);assert.deepEqual(stored.led_config,{});
  }
});
test("Fix A: firmware/App fixture provenance detects sibling source drift",async t=>{
  const fixtures=JSON.parse(readFileSync("tests/fixtures/firmware-info-c12806a.json","utf8"));
  const firmware=["../firmware","../../../firmware"].find(p=>existsSync(p+"/main/board_identity.cpp"));
  if(firmware)for(const [path,digest] of Object.entries(fixtures.source_sha256))assert.equal(await hash(readFileSync(firmware+"/"+path)),digest,path);
  else t.diagnostic("Sibling firmware unavailable; using pinned compiled info fixtures.");
  const storage=["../../../sayso_app/Shared/Storage.swift","../../../../../sayso_app/Shared/Storage.swift"].find(existsSync);
  if(storage){
    const source=readFileSync(storage,"utf8").replaceAll("\r\n","\n");
    const method=source.slice(source.indexOf("    func currentActionCapabilities("),source.indexOf("    var pointerSettingsVersionPrepared:"));
    assert.equal(method,readFileSync("tests/fixtures/app-current-action-capabilities.swift.txt","utf8").replaceAll("\r\n","\n"));
  }else t.diagnostic("Sibling App unavailable; using documented Swift filter snapshot.");
});
