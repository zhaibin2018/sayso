import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {Log,LogLevel,Miniflare} from "miniflare";
import jpegCodec from "jpeg-js";
import {frameAcceptanceEvidenceSQL} from "../lib/frame-acceptance-evidence.ts";

const candidate=dirname(dirname(fileURLToPath(import.meta.url)));
const compiled=join(candidate,"dist","server");
const config=JSON.parse(readFileSync(join(compiled,"wrangler.json"),"utf8"));
const entry=join(compiled,config.main);
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const fixture=process.env.SAYSO_HISTORICAL_FRAME??join(dirname(candidate),"iphone11-c124-replug-maps-full_map_confirmation.jpg");
const jpeg=readFileSync(fixture);
const jpegSHA=sha256(jpeg);
assert.equal(jpegSHA,"cdbbc8c8987d12e0c403dbb588fa25f9613cf1217815784c2ec2513e60774d55");

function jsFiles(path) {
  return readdirSync(path,{withFileTypes:true}).flatMap(item=>item.isDirectory()?
    jsFiles(join(path,item.name)):item.name.endsWith(".js")?[join(path,item.name)]:[]);
}
let outbound=0;
const runtime=new Miniflare({
  modulesRoot:compiled,
  modules:[entry,...jsFiles(compiled).filter(path=>path!==entry)]
    .map(path=>({type:"ESModule",path,contents:readFileSync(path,"utf8")})),
  compatibilityDate:config.compatibility_date,
  compatibilityFlags:config.compatibility_flags,
  bindings:{SAYSO_FRAME_PERMIT_HMAC_KEY_HEX:"ab".repeat(32)},
  d1Databases:{DB:"offline-no-visual-field"},
  r2Buckets:{BUCKET:"offline-no-visual-field"},
  outboundService:()=>{outbound++;return new Response("Offline fixture",{status:403});},
  log:new Log(LogLevel.NONE),
  handleRuntimeStdio(stdout,stderr){stdout.resume();stderr.resume();},
});
const owner="offline-no-visual-field-owner",token="v".repeat(43);
const [device,session,broadcast,worker,hardware,boot]=Array.from({length:6},()=>randomUUID());
const noVisualCapability="sayso.focused_text.no_visual.v1";
const clearAppCapability="sayso.focused_text_clear_before_input";
const clearBoardCapability="hid.keyboard.ascii_clear_stable";
const clearReady="focused_text_clear_before_input_ready";
const expectedRuntime=process.env.SAYSO_TEST_RUNTIME??"0.13.220";
const scope={bridge_session_id:session,broadcast_id:broadcast,worker_id:worker,lease_epoch:7,control_epoch:2};
const raw={...scope,raw_dispatch_protocol:"raw_mouse_claim_start.v1",point_protocol:"paired_mouse_point.v1"};
const claimArgs={...raw,spotlight_dispatch_protocol:"spotlight_claim_start.v1"};
const route="/v1/device/mouse/commands/";
const pointHandoff=process.env.SAYSO_TEST_ACTION_POINT_PROOF==="1";
const pointCaps={"hid.mouse.absolute":true,"hid.mouse.relative":true,"hid.mouse.click":true,
  "sayso.reviewed_point.v1":true,"sayso.reviewed_point_crops.v2":true,"sayso.reviewed_point_crops.v3":true,
  "sayso.reviewed_point_crops.v4":true,"sayso.reviewed_point_crops.visual_read.v1":true};
const boardCapabilities={"led.set":false,"sayso.focused_text":true,"hid.keyboard.ascii_stable":true,
  "sayso.focused_text_submit_enter":true,"hid.keyboard.ascii_enter_stable":true,[noVisualCapability]:true,
  [clearAppCapability]:true,[clearBoardCapability]:true};

function post(path,body,headers={}) {
  return runtime.dispatchFetch("http://localhost"+path,{method:"POST",headers:{"Content-Type":"application/json",...headers},
    body:JSON.stringify(body),signal:AbortSignal.timeout(6000)});
}
const devicePost=(suffix,body)=>post(route+suffix,body,{Authorization:"Bearer "+token});
async function rpc(method,params,actor=owner) {
  const response=await post("/mcp",{jsonrpc:"2.0",id:randomUUID(),method,params},{
    "MCP-Protocol-Version":"2026-07-28","oai-authenticated-user-id":actor,"Accept-Encoding":"identity"});
  assert.equal(response.status,200,await response.clone().text());
  return {result:(await response.json()).result,age:response.headers.get("X-SaySo-Frame-Age-Ms")};
}
const tool=(name,args,actor)=>rpc("tools/call",{name,arguments:args},actor);

try {
  const db=await runtime.getD1Database("DB");
  const schema=readdirSync(join(candidate,"drizzle")).filter(name=>name.endsWith(".sql")).sort()
    .flatMap(name=>readFileSync(join(candidate,"drizzle",name),"utf8").split("--> statement-breakpoint"))
    .map(sql=>sql.trim()).filter(Boolean);
  await db.batch(schema.map(sql=>db.prepare(sql)));
  const now=Date.now(),liveUntil=now+90000;
  await db.batch([
    db.prepare("INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,confirmed_at,created_at,current_session,lease_epoch,worker_id,worker_expires) VALUES(?,?,'Offline field',?,?,?,?,?,7,?,?)")
      .bind(device,owner,sha256(token),liveUntil,now,now,session,worker,liveUntil),
    db.prepare("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,control_epoch,mouse_enabled,input_end,mode) VALUES(?,?,?,?,?,?,'active','active',?,2,1,?,'broadcast')")
      .bind(session,owner,device,broadcast,randomUUID(),"offline",now,liveUntil),
  ]);
  const count=async table=>Number((await db.prepare("SELECT count(*) n FROM "+table).first()).n);
  assert.equal((await rpc("initialize",{protocolVersion:"2026-07-28"})).result.serverInfo.version,expectedRuntime);
  const tools=(await rpc("tools/list",{})).result.tools;
  const fieldTool=tools.find(entry=>entry.name==="type_text_in_field");
  assert.equal(fieldTool.inputSchema.properties.clear_before_input.type,"boolean");
  assert.match(fieldTool.inputSchema.properties.clear_before_input.description,/Defaults to selecting and deleting/);
  assert.equal(fieldTool.inputSchema.required.includes("clear_before_input"),false);
  const status=async()=>{
    const {result}=await tool("get_mouse_state",{device_id:device});
    const compact=JSON.parse(result.content.find(item=>item.type==="text").text);
    for(const flag of [clearReady,"focused_text_no_visual_ready","focused_text_submit_enter_ready"])
      assert.equal(compact[flag],result.structuredContent[flag]);
    return result.structuredContent;
  };
  async function boardState(capabilities,transport="usb_ncm"){
    const response=await post("/v1/device/hardware/bind",{...scope,protocol_version:"1.0",transport,
      hardware_id:hardware,board_boot_id:boot,descriptor_version:"offline-field-v1",capabilities,led_config:{}},
      {Authorization:"Bearer "+token});
    assert.equal(response.status,200,await response.clone().text());
    await db.prepare("UPDATE sb_hardware SET usb_connected=1 WHERE device_id=?").bind(device).run();
  }
  await boardState(boardCapabilities,"usb_midi");
  assert.equal((await status())[clearReady],undefined);
  await boardState(boardCapabilities);
  assert.equal((await status())[clearReady],true);
  assert.equal(await count("sb_frames"),0);
  assert.equal(await count("sb_observations"),0);
  const args={device_id:device,text:"Changi airport",submit:"enter",wait_ms:0,observe_after:false,idempotency_key:randomUUID()};
  const type=(patch={},actor)=>tool("type_text_in_field",{...args,...patch},actor);
  for(const invalid of ["true",null]){
    assert.equal((await type({clear_before_input:invalid})).result.structuredContent.error,"INVALID_FIELD_CLEAR");
  }
  for(const submit of ["enter",undefined]){
    const tooLong=await type({text:"a".repeat(61),submit});
    assert.equal(tooLong.result.structuredContent.error,"FIELD_CLEAR_TEXT_TOO_LONG");
  }
  assert.equal(await count("sb_mouse_commands"),0);
  for(const capability of [clearAppCapability,clearBoardCapability,noVisualCapability]){
    await boardState({...boardCapabilities,[capability]:false});
    assert.equal((await status())[clearReady],undefined);
    const unavailable=await type({source_frame_id:randomUUID(),
      field:{x:.2,y:.5,width:.6,height:.05},landmark:{text:"Different scene",region:{x:.2,y:.2,width:.5,height:.05}}});
    assert.equal(unavailable.result.structuredContent.error,"FOCUSED_TEXT_CLEAR_NOT_READY");
    assert.equal(await count("sb_mouse_commands"),0);
  }
  await boardState(boardCapabilities);
  const replacementText="Changi airport".padEnd(60,".");
  const replace=(options={})=>type({text:replacementText,...options});
  const first=await Promise.all([replace(),replace({clear_before_input:true}),replace()]);
  const command=first[0].result.structuredContent.command_id;
  assert.match(command,/^[0-9a-f-]{36}$/);
  for(const outcome of first){
    assert.equal(outcome.result.isError,false,JSON.stringify(outcome.result.structuredContent));
    assert.equal(outcome.result.structuredContent.command_id,command);
    assert.equal(outcome.result.structuredContent.state,"queued");
    assert.equal(outcome.result.content.filter(item=>item.type==="image").length,0);
  }
  assert.equal(await count("sb_mouse_commands"),1);
  const stored=await db.prepare("SELECT * FROM sb_mouse_commands WHERE id=?").bind(command).first();
  assert.deepEqual(JSON.parse(stored.payload),{text:replacementText,submit_enter:true,clear_before_input:true});
  const dispatchPrecondition={spotlight_transport:"stable_usb",field_input_validation:"no_visual_v1"};
  assert.deepEqual(JSON.parse(stored.precondition),{...dispatchPrecondition,capture_min_gap_ms:300});
  assert.equal(stored.worker_id,worker);
  assert.equal(stored.lease_epoch,7);
  assert.equal((await replace({clear_before_input:false})).result.structuredContent.error,"IDEMPOTENCY_CONFLICT");
  assert.equal((await type({clear_before_input:true,text:"Different query"})).result.structuredContent.error,"IDEMPOTENCY_CONFLICT");
  assert.equal((await type({idempotency_key:randomUUID()})).result.isError,true);
  assert.equal((await type({idempotency_key:randomUUID()},"offline-unrelated-owner")).result.isError,true);
  assert.equal(await count("sb_mouse_commands"),1);
  for(const metadata of [raw,{...raw,reviewed_press_protocol:"reviewed_press_after_move.v1",
    app_search_protocol:"app_search_prepare_claim_start.v1",raw_dispatch_ttl_profiles:["scope_only_system_search.v1","reviewed_point_crop.v4"]}]){
    const response=await devicePost("claim",metadata);
    assert.equal(response.status,204,await response.text());
  }
  {const response=await devicePost(command+"/start",scope);assert.ok(response.status>=400);assert.notEqual(response.status,500,await response.text());}
  assert.equal((await db.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").bind(command).first()).state,"queued");

  for(const capability of [clearAppCapability,clearBoardCapability]){
    await boardState({...boardCapabilities,[capability]:false});
    assert.equal((await devicePost("claim",claimArgs)).status,204);
    assert.equal((await db.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").bind(command).first()).state,"queued");
  }
  await boardState(boardCapabilities);
  const contenders=await Promise.all([devicePost("claim",claimArgs),devicePost("claim",claimArgs)]);
  assert.deepEqual(contenders.map(response=>response.status).sort(),[200,204]);
  const claimed=await contenders.find(response=>response.status===200).json();
  assert.equal(claimed.command_id,command);
  assert.equal(claimed.state,"executing");
  assert.equal(claimed.spotlight_dispatch_protocol,claimArgs.spotlight_dispatch_protocol);
  assert.deepEqual(claimed.precondition,dispatchPrecondition);
  assert.deepEqual(claimed.payload,JSON.parse(stored.payload));
  assert.ok(claimed.ttl_remaining_ms>0&&claimed.ttl_remaining_ms<=15000);
  assert.equal(await count("sb_frames"),0);
  const ack=10000;
  const receipt={command_id:command,board_boot_id:boot,state:"executed",subcommand_index:0,error:null,
    effect:{hid_reports_sent:true,ascii_stable:true,all_released:true,enter_sent:true,clear_before_input:true}};
  const result={...scope,state:"board_acked",finished_client_mono_ms:ack,mouse_mode_confirmed:true,
    restored_mouse_boot_id:boot,original_receipt_read:false,input_submitted:true,board_receipt:receipt};
  for(const wrong of [{...receipt,board_boot_id:randomUUID()},
    {...receipt,effect:{...receipt.effect,all_released:false}},
    {...receipt,effect:{...receipt.effect,enter_sent:false}},
    {...receipt,effect:{...receipt.effect,clear_before_input:undefined}},
    {...receipt,effect:{...receipt.effect,clear_before_input:false}}]){
    assert.equal((await devicePost(command+"/result",{...result,board_receipt:wrong})).status,422);
  }
  const accepted=await devicePost(command+"/result",result);
  assert.equal(accepted.status,200,await accepted.clone().text());
  const acceptedBody=await accepted.json();
  assert.equal(acceptedBody.state,"board_acked");
  assert.equal(acceptedBody.board_receipt.spotlight.focus_frame_id,null);
  assert.equal(acceptedBody.board_receipt.spotlight.enter_sent,true);
  assert.equal(acceptedBody.board_receipt.spotlight.clear_sent,true);
  assert.equal((await devicePost(command+"/result",result)).status,200);
  assert.equal((await devicePost(command+"/result",{...result,finished_client_mono_ms:ack+1})).status,409);

  if(pointHandoff)await boardState({...boardCapabilities,...pointCaps});
  const frame=randomUUID(),captureUTC=Date.now()-20;
  const metadata={...scope,frame_id:frame,frame_seq:1,source_seq:1,capture_mono_ms:ack+450,
    capture_clock_verified:true,provenance:"device_capture",width:444,height:960,native_width_px:828,native_height_px:1792,
    orientation:"portrait",orientation_epoch:0,content_rect:{x:0,y:0,width:444,height:960},transform_version:"1",
    content_sha256:jpegSHA};
  const acceptance=frameAcceptanceEvidenceSQL("CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)");
  await db.batch([
    db.prepare("INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,capture_lower,received_at,expires_at,storage_ready,inline_jpeg) VALUES(?,?,?,?,1,7,?,?,?,?,?,?,1,?)")
      .bind(device,owner,session,frame,"fixture:"+frame,jpegSHA,JSON.stringify(metadata),captureUTC,Date.now(),liveUntil,jpeg.toString("base64")),
    db.prepare("INSERT INTO sb_observations(id,device_id,frame_id,created_at) VALUES(?,?,?,?)").bind(device+":"+frame,device,frame,Date.now()),
    db.prepare(acceptance).bind(device+":"+frame),
  ]);
  const after=await tool("get_mouse_result",{command_id:command,include_after_screen:true});
  const images=after.result.content.filter(item=>item.type==="image");
  assert.equal(images.length,1,JSON.stringify(after.result.structuredContent));
  assert.match(after.result.structuredContent.after_image_instruction,/Do not call read_screen/);
  assert.equal(sha256(Buffer.from(images[0].data,"base64")),jpegSHA);
  assert.equal(after.result.structuredContent.after_screen.metadata.frame_id,frame);
  assert.equal(after.result.structuredContent.after_screen.after_command.command_id,command);
  assert.equal(after.result.structuredContent.after_screen.after_command.lower_gap_ms,450);
  assert.equal(after.result.structuredContent.after_screen.source_query_proof,undefined);
  const compact=JSON.parse(after.result.content.find(item=>item.type==="text").text);
  assert.equal(compact.after_image_instruction,after.result.structuredContent.after_image_instruction);
  assert.equal(compact.enter_sent,true);
  assert.equal(compact.clear_sent,true);
  assert.deepEqual(compact.after_screen,{
    state:"available",metadata:{device_id:device,frame_id:frame,width:444,height:960,orientation_epoch:0},
    after_command:{command_id:command,lower_gap_ms:450},
  });
  if(pointHandoff){
    assert.equal(compact.click_at_source.source_frame_id,frame);
    assert.equal(compact.click_at_source.source_point_proof,after.result.structuredContent.after_screen.source_point_proof);
    assert.match(compact.click_at_instruction,/No new read_screen/);
  }else assert.equal(compact.click_at_source,undefined);
  assert.ok(Number(after.age)>0&&Number(after.age)<2000);
  if(pointHandoff){
    for(let i=0;i<20&&await count("sb_released_system_search_field_proofs")===0;i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(await count("sb_released_system_search_field_proofs"),1);
    // Advance the live head without reading it through MCP. The old after-image
    // remains the selected source; this reproduced the native center rejection.
    const decoded=jpegCodec.decode(jpeg,{useTArray:true});decoded.data[0]^=255;
    const changedJPEG=Buffer.from(jpegCodec.encode(decoded,65).data),changedHash=sha256(changedJPEG);
    assert.notEqual(changedHash,jpegSHA);
    const nextFrame=randomUUID(),nextMetadata={...metadata,content_sha256:changedHash,frame_id:nextFrame,frame_seq:2,source_seq:2,capture_mono_ms:ack+460};
    await db.batch([
      db.prepare("UPDATE sb_frames SET frame_id=?,frame_seq=2,metadata=?,capture_lower=?,received_at=?,sha256=?,inline_jpeg=? WHERE device_id=?")
        .bind(nextFrame,JSON.stringify(nextMetadata),Date.now()-10,Date.now(),changedHash,changedJPEG.toString("base64"),device),
      db.prepare("INSERT INTO sb_observations(id,device_id,frame_id,created_at) VALUES(?,?,?,?)").bind(device+":"+nextFrame,device,nextFrame,Date.now()),
      db.prepare(acceptance).bind(device+":"+nextFrame),
    ]);
    const source=compact.click_at_source;
    const point={...source,x:0,y:0,settle_ms:Number(process.env.SAYSO_TEST_POINT_SETTLE_MS??300),target_region:{x:.1,y:.2,width:.3,height:.1},
      landmark_region:{x:.6,y:.6,width:.2,height:.1},idempotency_key:randomUUID(),wait_ms:0};
    const before=await count("sb_mouse_commands");
    assert.equal((await tool("click_at",{...point,source_frame_id:randomUUID()})).result.isError,true);
    assert.equal((await tool("click_at",point,"unrelated-owner")).result.isError,true);
    assert.equal(await count("sb_mouse_commands"),before);
    // The implicit ledger and the explicit token both resolve the exact frame.
    const {source_point_proof:token,...implicit}=point;
    const click=await tool("click_at",implicit);
    assert.equal(click.result.structuredContent.state,"embedded",JSON.stringify(click.result));
    const explicit=await tool("click_at",point);
    assert.equal(explicit.result.structuredContent.command_id,click.result.structuredContent.command_id);
    assert.equal(explicit.result.structuredContent.state,"embedded");
    assert.equal(await count("sb_mouse_commands"),before+2);
    await db.prepare("DELETE FROM sb_mouse_commands WHERE kind IN ('pointer.move_absolute','pointer.click')").run();
  }else assert.equal(await count("sb_released_system_search_field_proofs"),0);

  const ordinary={idempotency_key:randomUUID(),text:"Next query",submit:undefined,clear_before_input:false};
  const second=(await type(ordinary)).result.structuredContent.command_id;
  assert.equal((await type(ordinary)).result.structuredContent.command_id,second);
  assert.equal((await type({...ordinary,clear_before_input:undefined})).result.structuredContent.error,"IDEMPOTENCY_CONFLICT");
  assert.match(second,/^[0-9a-f-]{36}$/);
  const secondRow=await db.prepare("SELECT payload FROM sb_mouse_commands WHERE id=?").bind(second).first();
  assert.deepEqual(JSON.parse(secondRow.payload),{text:ordinary.text});
  const noCap={...boardCapabilities,[noVisualCapability]:false};
  await boardState(noCap);
  assert.equal((await devicePost("claim",claimArgs)).status,204);
  assert.equal((await type({idempotency_key:randomUUID(),clear_before_input:false})).result.structuredContent.error,"FOCUSED_TEXT_NO_VISUAL_NOT_READY");
  await boardState(boardCapabilities);
  await db.prepare("UPDATE sb_sessions SET input_end=? WHERE id=?").bind(Date.now()-1,session).run();
  assert.equal((await devicePost("claim",claimArgs)).status,204);
  assert.ok((await type({idempotency_key:randomUUID()})).result.isError);
  assert.equal((await db.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").bind(second).first()).state,"expired");
  assert.equal(await count("sb_mouse_commands"),2);
  await db.prepare("UPDATE sb_sessions SET input_end=? WHERE id=?").bind(Date.now()+90000,session).run();
  const legacyOnly={...boardCapabilities,[clearAppCapability]:false,[clearBoardCapability]:false};
  await boardState(legacyOnly);
  const longestAppend=await type({...ordinary,idempotency_key:randomUUID(),text:"a".repeat(64)});
  assert.equal(longestAppend.result.structuredContent.state,"queued");
  assert.equal(longestAppend.result.structuredContent.precondition.capture_min_gap_ms,300);
  assert.equal(longestAppend.result.structuredContent.after_image_instruction,undefined);
  assert.deepEqual(longestAppend.result.structuredContent.payload,{text:"a".repeat(64)});
  await db.prepare("UPDATE sb_mouse_commands SET state='expired' WHERE state='queued'").run();
  const immediate=await type({...ordinary,idempotency_key:randomUUID(),settle_ms:0});
  assert.equal(immediate.result.structuredContent.state,"queued");
  assert.equal(immediate.result.structuredContent.precondition.capture_min_gap_ms,0);
  // Exercise the positive legacy claim/start path as well as its denied text path.
  await db.prepare("UPDATE sb_mouse_commands SET state='expired' WHERE state IN ('queued','claimed','executing')").run();
  await boardState({...boardCapabilities,"hid.mouse.relative":true,"hid.mouse.click":true});
  const moved=await tool("move_mouse",{device_id:device,dx:1,dy:0,idempotency_key:randomUUID(),wait_ms:0,observe_after:false});
  assert.equal(moved.result.structuredContent.state,"queued",JSON.stringify(moved.result));
  const legacyClaim=await devicePost("claim",scope);
  assert.equal(legacyClaim.status,200,await legacyClaim.clone().text());
  const legacyCommand=await legacyClaim.json();assert.equal(legacyCommand.state,"claimed");
  const legacyStart=await devicePost(legacyCommand.command_id+"/start",scope);
  assert.equal(legacyStart.status,200,await legacyStart.clone().text());
  assert.equal((await legacyStart.json()).state,"executing");
  assert.equal(outbound,0);
  console.log(JSON.stringify({runtime:expectedRuntime,worker_sha256:sha256(readFileSync(entry)),no_frame_admission:true,after_image_point_handoff_without_read:pointHandoff,
    concurrent_admissions:3,won_claims:1,legacy_claims_blocked:true,legacy_pointer_started:true,changing_payload_conflicts:true,no_focus_id_receipt:true,
    wrong_boot_release_enter_clear_rejected:5,clear_capability_admission_and_claim_verified:true,
    default_clears:true,explicit_append_supported_without_clear_capability:true,typed_after_image:{real_archived_jpeg:true,synthetic_ack_gap_ms:450,age_ms:Number(after.age),
      compact_handoff:true},
    capability_and_expired_grant_blocked:true,device_writes_outside_fixture:0,outbound}));
} finally {
  await runtime.dispose();
}
