const badSigning=process.env.SAYSO_TEST_BAD_SIGNING==="1";
const configurationChecked=Symbol("configuration_checked");
import {currentActionCapabilities} from "../lib/current-action-capabilities.ts";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {crc32} from "node:zlib";
import {readFileSync,readdirSync,writeFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {Miniflare} from "miniflare";
import jpeg from "jpeg-js";
import {makeLiveImagePreview} from "../lib/live-image-preview.ts";
import {frameAcceptanceEvidenceSQL} from "../lib/frame-acceptance-evidence.ts";
import {reviewedPointTTLCapability,reviewedPointTTLProfile,scopedSearchTTLCapability,scopedSearchTTLProfile} from "../lib/raw-claim-ttl.ts";

const mode="current-chain";
const dragCloudFixture=mode==="drag-cloud-confirmation";
const syntheticCarrier=mode==="synthetic-carrier";
const searchInterveningInput=mode==="search-busy-intervening-input";
const searchNoVisual=mode==="search-busy-no-visual"||searchInterveningInput;
const busyResume=mode==="search-busy-resume"||searchNoVisual;
const newApp=mode==="maps-ttl",mapsCenter=mode==="maps-center",openMaps=mode==="maps-click"||newApp||mapsCenter;
const confirmAppOpen=openMaps||searchNoVisual;
const releaseFixture=mode.startsWith("release-");
const visualReadFixture=mode==="visual-read-age";
const visualPointFixture=true;
const historicalPoint=mode==="visual-point-historical";
const parkedPressFixture=mode.startsWith("parked-press");
const pointRecheck=mode.startsWith("point-recheck");
const directSpotlight=mode.startsWith("direct-spotlight");
const directDefaultClear=mode==="direct-spotlight-clear";
const pressProtocol="reviewed_press_after_move.v1",pressCapability="sayso."+pressProtocol;
const visualClockDrop=mode==="visual-point-clock-drop";
const parkedClockDrop=mode==="parked-press-clock-drop";
const clockFixture=releaseFixture||visualClockDrop||parkedClockDrop;
const visualPointCap="sayso.action_geometry.v1";
const rollback=process.env.SAYSO_REPLAY_TTL_ROLLBACK==="1";
assert.ok(!rollback||newApp);
const ownCandidate=dirname(dirname(fileURLToPath(import.meta.url)));
const candidate=rollback?join(dirname(ownCandidate),"host-reviewed-open-app-integrated-sites-candidate"):ownCandidate;
const evidence=process.env.SAYSO_TEST_EVIDENCE??dirname(candidate),root=join(candidate,"dist","server"),entry=join(root,"index.js");
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const read=(folder,file,expected)=>{
  const bytes=readFileSync(join(evidence,folder,file));
  assert.equal(sha(bytes),expected);
  return {sha:expected,base64:bytes.toString("base64")};
};
const searchFolder="ac-search-0421-iphone11-reviewed-point-motion-20261112";
const focus=read(searchFolder,"11-crop-timing-search-reviewed.jpg","7bbc83ba96e14610571528b8cfde8e0c6f3aa3b3bdc64d7088dc3995b87fd06b");
const current=read(searchFolder,"12-crop-timing-before-first-move.jpg","d0fc51b2980dedd63783f3227f5eb671ba822fbdb178281c88acb59a90699261");
const wrong=read("maps-handoff-original-20261111T185207-9855c72a","focus-original-id-after.jpg",
  "c0e03f8482c37407ac4b9f62cd9e189b24c55af0f91e244c0cd6e91ca213767a");
const result=read("ac-search-0421-live-iphone11-20261112","08-maps-installed-result.jpg",
  "1f31f117246dc5da153f227f7a3e8a28c8881ca40309ecd04cfb7127d90415a6");
const foreground=confirmAppOpen?read("ac-search-0421-live-iphone11-20261112","13-maps-foreground.jpg",
  "9f0b426394270789a8e56857a9a4b6eeea22c52aa9654796d8440c9c4f163ba4"):undefined;
const pointerArchive="../../evidence/private/maps-iphone11-pointer-target-20261113";
const pointerAway=parkedPressFixture?read(pointerArchive,"pointer-away.jpg","f70ffacd55df7093098c5daf69f1dda0638b8d6a07a01817d3a0568e820b3743"):undefined;
const pointerParked=parkedPressFixture?read(pointerArchive,"pointer-on-field.jpg","8ef5134604b95e18573e758b6ecc230b8d4b98d19521f25ec93eb63a508e8eaa"):undefined;
function noisyJPEG(){
  const width=444,height=960,data=Buffer.alloc(width*height*4);
  let random=0x7eb14f21;
  for(let i=0;i<data.length;i+=4){
    random^=random<<13; random^=random>>>17; random^=random<<5;
    data[i]=(random>>>16)&255;data[i+1]=(random>>>8)&255;data[i+2]=random&255;data[i+3]=255;
  }
  const bytes=jpeg.encode({data,width,height},86).data;
  const photo={sha:sha(bytes),base64:bytes.toString("base64")};
  // Force a valid qualified JPEG that exceeds the compact PNG size bound.
  assert.equal(makeLiveImagePreview(photo.base64,"png"),null);
  return photo;
}
const files=path=>readdirSync(path,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(join(path,item.name)):
  item.name.endsWith(".js")?[join(path,item.name)]:[]);
let outbound=0;
let clockSamples=0,releaseSuccessor;
let denyParkedClock=false;
const wireAge=new WeakMap();
const workerModules=[entry,...files(root).filter(path=>path!==entry)]
  .map(path=>({type:"ESModule",path,contents:readFileSync(path,"utf8")}));
// This fixture wraps the untouched compiled entry. Only the native cache
// clock boundary is perturbed. Device/command/receipt and D1 remain the real Worker.
const clockWrapper={type:"ESModule",path:join(root,"fixture-release-clock.mjs"),contents:`
import {env} from "cloudflare:workers";
import worker from "./index.js";
let nextAgeShift=0;
const nativeNow=Date.now.bind(Date);
Date.now=()=>{const shift=nextAgeShift;nextAgeShift=0;return nativeNow()+shift;};
const nativeOpen=caches.open.bind(caches);
Object.defineProperty(caches,"open",{value:async name=>{
  if(name!=="sayso-release-clock-v1")return nativeOpen(name);
  return {match:async ()=>{
    const response=await env.FIXTURE_RELEASE_CLOCK.fetch("http://fixture.invalid/release-clock");
    if(!response.ok)throw Error("fixture clock unavailable");
    nextAgeShift=Number(response.headers.get("x-fixture-age-shift")??0);
    return undefined;
  }};
}});
export default worker;
`};
const mf=new Miniflare({modulesRoot:root,modules:clockFixture?[clockWrapper,...workerModules]:workerModules,
  compatibilityDate:"2026-05-15",compatibilityFlags:["nodejs_compat"],
  bindings:mode==="direct-spotlight-unsigned"?{}:{SAYSO_FRAME_PERMIT_HMAC_KEY_HEX:badSigning?"bad":"ab".repeat(32),SAYSO_RETENTION_MAINTENANCE_KEY_HEX:"cd".repeat(32)},
  ...(!syntheticCarrier?{d1Databases:{DB:"host-search"},r2Buckets:{BUCKET:"host-search"}}:{}),
  ...(clockFixture?{serviceBindings:{FIXTURE_RELEASE_CLOCK:async()=>{
    const sample=++clockSamples;
    if(visualClockDrop)return new Response(null,{status:503});
    if(parkedClockDrop)return new Response(null,denyParkedClock?{status:503}:{headers:{"x-fixture-age-shift":"0"}});
    if(sample===1)releaseSuccessor=await publish(current,11400);
    if(sample===1||mode==="release-clock"&&sample===2)return new Response(null,{status:503});
    const shift=mode==="release-double"||mode==="release-recovered"&&sample===2?2100:0;
    return new Response(null,{headers:{"x-fixture-age-shift":String(shift)}});
  }}}:{}),
  outboundService:()=>{outbound++;return new Response("Offline",{status:403});}});
const [device,session,broadcast,worker,hardware,boot]=Array.from({length:6},()=>randomUUID());
const owner="offline-host-review-owner",token="f".repeat(43);
const scope={bridge_session_id:session,broadcast_id:broadcast,worker_id:worker,lease_epoch:7,control_epoch:2};
const phone={...scope,raw_dispatch_protocol:"raw_mouse_claim_start.v1",
  point_protocol:"paired_mouse_point.v1",spotlight_dispatch_protocol:"spotlight_claim_start.v1",
  ...(parkedPressFixture?{reviewed_press_protocol:pressProtocol}:{}),
  ...(newApp||historicalPoint?{raw_dispatch_ttl_profiles:[scopedSearchTTLProfile,reviewedPointTTLProfile]}:{})};
const route="/v1/device/mouse/commands/",auth={Authorization:"Bearer "+token};
const post=(path,body,headers={})=>mf.dispatchFetch("http://localhost"+path,{method:"POST",
  headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(14500)});
async function rpc(method,params,actor=owner){
  const response=await post("/mcp",{jsonrpc:"2.0",id:randomUUID(),method,params},
    {"oai-authenticated-user-id":actor,"MCP-Protocol-Version":"2026-07-28","Accept-Encoding":"identity"});
  assert.equal(response.status,200,await response.clone().text());
  const result=(await response.json()).result;
  if(releaseFixture||visualReadFixture||visualPointFixture)wireAge.set(result,response.headers.get("X-SaySo-Frame-Age-Ms"));
  return result;
}
const call=(name,args,actor=owner)=>rpc("tools/call",{name,arguments:args},actor);
const search=(args,actor=owner)=>call("search_app_with_vision",args,actor);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(read){
  const limit=performance.now()+2400;
  for(;;){
    const value=await read();
    if(value)return value;
    assert.ok(performance.now()<limit,"fixture deadline");
    await pause(10);
  }
}
let db,sequence=0;
const acceptance=frameAcceptanceEvidenceSQL("CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)");
async function publish(photo,mono,fixtureAge=10){
  const frame=randomUUID(),now=Date.now(),capture=now-fixtureAge+.54,seq=++sequence;
  const meta={...scope,frame_id:frame,frame_seq:seq,source_seq:seq,capture_mono_ms:mono,
    capture_clock_verified:true,provenance:"device_capture",width:444,height:960,native_width_px:828,native_height_px:1792,
    orientation:"portrait",orientation_epoch:0,content_rect:{x:0,y:0,width:444,height:960},transform_version:"1",content_sha256:photo.sha};
  await db.batch([
    db.prepare("INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,capture_lower,received_at,expires_at,storage_ready,inline_jpeg) VALUES(?,?,?,?,?,7,?,?,?,?,?,?,1,?) ON CONFLICT(device_id) DO UPDATE SET frame_id=excluded.frame_id,frame_seq=excluded.frame_seq,image_key=excluded.image_key,sha256=excluded.sha256,metadata=excluded.metadata,capture_lower=excluded.capture_lower,received_at=excluded.received_at,expires_at=excluded.expires_at,storage_ready=1,inline_jpeg=excluded.inline_jpeg")
      .bind(device,owner,session,frame,seq,"fixture:"+frame,photo.sha,JSON.stringify(meta),capture,now,now+30000,photo.base64),
    db.prepare("INSERT INTO sb_observations(id,device_id,frame_id,created_at) VALUES(?,?,?,?)").bind(device+":"+frame,device,frame,now),
    db.prepare(acceptance).bind(device+":"+frame),
  ]);
  return {frame,capture,seq};
}
async function claim(kind){
  const row=await waitFor(()=>db.prepare("SELECT id FROM sb_mouse_commands WHERE kind=? AND state='queued'").bind(kind).first());
  const response=await post(route+"claim",phone,auth);
  assert.equal(response.status,200,await response.clone().text());
  const action=await response.json();
  assert.equal(action.command_id,row.id);
  return action;
}
async function acknowledge(action,mono,effect,extra={},signedPoint=false){
  const id=action.command_id;
  const response=await post(route+id+"/result",{...scope,state:"board_acked",finished_client_mono_ms:mono,...extra,
    board_receipt:{command_id:id,board_boot_id:boot,state:"executed",subcommand_index:0,error:null,started_uptime_ms:1000,finished_uptime_ms:1000+(action.payload?.duration_ms??20),
      effect:{hid_reports_sent:true,...effect}}},signedPoint?
    {...auth,"X-SaySo-Point-Receipt-Proof":action.point_receipt_proof}:auth);
  assert.equal(response.status,200,await response.clone().text());
  assert.equal((await response.json()).state,"board_acked");
}
const count=async kind=>Number((await db.prepare("SELECT count(*) n FROM sb_mouse_commands WHERE kind=?").bind(kind).first()).n);
function savedMove(id) {
  return db.prepare("SELECT id,digest,precondition FROM sb_mouse_commands WHERE id=?").bind(id).first();
}
async function reviewPointWire(move,storedSource,geometryPolicy=true){
  const stored=JSON.parse((await savedMove(move.command_id)).precondition);
  assert.deepEqual(stored.point_source,storedSource);
  assert.equal(move.precondition.point_motion_policy,undefined);
  assert.equal(move.paired_click_command.precondition.point_motion_policy,undefined);
  assert.equal(move.paired_click_command.precondition.point_source,undefined);
  assert.equal(move.precondition.source_frame_id,storedSource.frame_id);
  for(const key of ["source_x","source_y","source_width","source_height","capture_width","capture_height","orientation","orientation_epoch","point"])
    assert.deepEqual(move.precondition[key],stored[key],key);
  if(geometryPolicy){
    assert.equal(stored.point_motion_policy,"geometry_only.v1");
    assert.equal(move.precondition.point_source,undefined);
    assert.equal(move.raw_dispatch_ttl_profile,undefined);
    assert.ok(move.ttl_remaining_ms>0&&move.ttl_remaining_ms<=2500);
  }else{
    assert.equal(stored.point_motion_policy,undefined);
    assert.deepEqual(move.precondition.point_source,storedSource);
  }
}
if(syntheticCarrier){
  try{
    const initialized=await rpc("initialize",{protocolVersion:"2026-07-28"});
    assert.equal(initialized.serverInfo.version,process.env.SAYSO_TEST_RUNTIME??"0.13.218");
    const result={};
    for(const image_format of ["png","jpeg"])for(const response_layout of ["mixed","content_only"]){
      const response=await call("read_benchmark_frame",{case_id:"c09",image_format,response_layout,match_payload_size:true});
      assert.equal(response.isError,false,JSON.stringify(response.structuredContent));
      assert.equal(response.resultType,"complete");
      assert.equal(!!response.structuredContent,response_layout==="mixed");
      assert.equal(response.content[0].mimeType,"image/"+image_format);
      assert.equal(response.content[0].data.length,52668);
      assert.ok(!/ParcelDesk-395/.test(response.content[1].text));
      const bytes=Buffer.from(response.content[0].data,"base64");
      assert.equal(bytes.length,39501);
      if(image_format==="png"){
        const offset=22691-12,size=bytes.readUInt32BE(offset),end=offset+8+size;
        assert.equal(bytes.subarray(offset+4,offset+8).toString(),"npAd");
        assert.equal(crc32(bytes.subarray(offset+4,end)),bytes.readUInt32BE(end));
      }else assert.equal(bytes.readUInt16BE(0),0xffd8);
      result[image_format+"_"+response_layout]=sha(bytes);
    }
    assert.equal(result.png_mixed,result.png_content_only);
    assert.equal(result.jpeg_mixed,result.jpeg_content_only);
    assert.equal(outbound,0);
    console.log(JSON.stringify({mode,worker_sha256:sha(readFileSync(entry)),case:"c09",
      image_bytes:39501,base64_chars:52668,matrix:result,device_bindings:false,outbound_requests:outbound}));
  }finally{await mf.dispose();}
}
function verifyJPEG(reply,photo,frame,command){
  const {content,structuredContent}=reply;
  assert.ok(content.some(block=>block.type==="text"));
  const images=content.filter(block=>block.type==="image");
  assert.equal(images.length,1,JSON.stringify(structuredContent));
  assert.equal(images[0].data,photo.base64);
  const after=structuredContent.after_screen;
  assert.equal(after.metadata.frame_id,frame.frame);
  assert.equal(after.after_command.command_id,command);
  assert.ok(after.metadata.age_ms<2000);
  assert.equal(typeof after.source_point_proof,"string","Every current action image must carry its source signature");
  frame.proof=after.source_point_proof;
  return after;
}
function verifyHostReviewImage(reply,photo,frame,command,mime,initial){
  const compact=JSON.parse(reply.content.find(item=>item.type==="text").text),fields=reply.structuredContent;
  const images=reply.content.filter(block=>block.type==="image");
  assert.equal(fields.state,"review_required");
  assert.equal(images.length,1);
  assert.equal(images[0].mimeType,mime);
  assert.equal(fields.review_frame_id,frame.frame);
  const after=fields.after_screen;
  assert.equal(after.metadata.frame_id,frame.frame);
  assert.equal(after.metadata.width,444);
  assert.equal(after.metadata.height,960);
  assert.equal(after.after_command.command_id,command);
  assert.ok(after.metadata.age_ms<2000);
  assert.equal(typeof after.source_point_proof,"string","Every current action image must carry its source signature");
  frame.proof=after.source_point_proof;
  const expected={mime_type:mime,width:mime==="image/png"?222:444,height:mime==="image/png"?480:960,
    stage:initial?"initial":"relook",purpose:"spotlight_focus_review",coordinate_space:"normalized_full_frame"};
  if(mime==="image/png"){
    const data=Buffer.from(images[0].data,"base64");
    assert.equal(data.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    assert.equal(data.readUInt32BE(16),expected.width);
    assert.equal(data.readUInt32BE(20),expected.height);
    assert.equal(images[0].data,makeLiveImagePreview(photo.base64,"png").data);
    assert.notEqual(sha(data),photo.sha);
  }else assert.equal(images[0].data,photo.base64);
  assert.deepEqual(fields.review_image,expected);
  assert.deepEqual(compact.review_image,expected);
  assert.deepEqual(compact.search_app_review,{preparation_id:fields.preparation_id,device_id:device,review_frame_id:frame.frame});
  assert.equal(compact.click_at_source,undefined);
  assert.equal(compact.relook_focus_available,initial?true:undefined);
  assert.equal(fields.relook_focus_available,initial?true:undefined);
  if(initial)assert.match(compact.review_image_instruction,/once.*relook_focus=true/);
  else assert.equal(compact.review_image_instruction,undefined);
  return after;
}

if(!syntheticCarrier)try{
  db=await mf.getD1Database("DB");
  const schema=readdirSync(join(candidate,"drizzle")).filter(name=>name.endsWith(".sql")).sort()
    .flatMap(name=>readFileSync(join(candidate,"drizzle",name),"utf8").split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean));
  await db.batch(schema.map(sql=>db.prepare(sql)));
  const now=Date.now();
  const capabilities={"hid.mouse.absolute":true,"hid.keyboard.system_search":true,"sayso.system_search":true,
    "sayso.system_search.scope_only.v1":true,"hid.keyboard.ascii_stable":true,"sayso.focused_text":true,
    "sayso.model_reviewed_field_crops.v2":true,"sayso.model_reviewed_field_crops.v3":true,
    "sayso.model_reviewed_field_crops.v4":mode!=="no-v4",
    ...(dragCloudFixture?{"hid.mouse.drag_absolute":true,"sayso.drag_at":true,
      "sayso.drag_model_decision.v1":true,"sayso.drag_reference_10s.v1":true,"sayso.drag_cloud_acceptance.v1":true}:{}),
    ...(visualReadFixture?{"hid.mouse.click":true}:{}),
    ...(confirmAppOpen?{"hid.mouse.click":true,"sayso.reviewed_point_crops.v2":true,
      "sayso.reviewed_point_crops.v3":true,"sayso.reviewed_point_crops.v4":true}:{}),
    ...(visualPointFixture||pointRecheck?{"hid.mouse.click":true,"sayso.reviewed_point_crops.v2":true,
      "sayso.reviewed_point_crops.v3":true,"sayso.reviewed_point_crops.v4":true,[visualPointCap]:mode!=="visual-point-legacy"}:{}),
    ...(parkedPressFixture?{"hid.mouse.click":true,"sayso.reviewed_point_crops.v2":true,"sayso.reviewed_point_crops.v3":true,
      "sayso.reviewed_point_crops.v4":true,[visualPointCap]:true,[pressCapability]:true}:{}),
    ...(searchNoVisual||directSpotlight?{"sayso.focused_text.no_visual.v1":true}:{}),
    ...(directSpotlight?{"hid.mouse.click":true,"sayso.reviewed_point_crops.v2":true}:{}),
    ...(mode==="direct-spotlight-point-png"?{"sayso.reviewed_point_crops.v3":true,"sayso.reviewed_point_crops.v4":true,[visualPointCap]:true}:{}),
    ...(directDefaultClear?{"sayso.focused_text_clear_before_input":true,"hid.keyboard.ascii_clear_stable":true}:{}),
    ...(newApp||historicalPoint?{"led.set":true,[scopedSearchTTLCapability]:true,[reviewedPointTTLCapability]:true}:{})};
  Object.assign(capabilities,{
    "hid.mouse.click":true,"hid.mouse.scroll":true,"hid.mouse.drag_absolute":true,"hid.mouse.drag_absolute.v2":true,
    "sayso.drag_at":true,"sayso.action_geometry.v1":true,"sayso.drag_model_decision.v1":true,"sayso.drag_cloud_acceptance.v1":true,
    "sayso.focused_text.no_visual.v1":true,"sayso.focused_text_clear_before_input":true,"hid.keyboard.ascii_clear_stable":true,
    "sayso.focused_text_submit_enter":true,"hid.keyboard.ascii_enter_stable":true
  });
  const currentCaps=currentActionCapabilities(capabilities,"usb_ncm");
  for(const key of Object.keys(capabilities))delete capabilities[key];
  Object.assign(capabilities,currentCaps);
  phone.spotlight_dispatch_protocol="spotlight_claim_start.v1";
  await db.batch([
    db.prepare("INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,confirmed_at,created_at,current_session,lease_epoch,worker_id,worker_expires) VALUES(?,?,'Offline host review',?,?,?,?,?,7,?,?)")
      .bind(device,owner,sha(token),now+90000,now,now,session,worker,now+90000),
    db.prepare("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,control_epoch,mouse_enabled,input_end,mode) VALUES(?,?,?,?,?,?,'active','active',?,2,1,?,'broadcast')")
      .bind(session,owner,device,broadcast,randomUUID(),"offline",now,now+90000),
    db.prepare("INSERT INTO sb_hardware(device_id,owner_id,hardware_id,board_boot_id,metadata,usb_connected) VALUES(?,?,?,?,?,1)")
      .bind(device,owner,hardware,boot,JSON.stringify({capabilities})),
  ]);
  if(newApp){
    const bound=await post("/v1/device/hardware/bind",{...scope,hardware_id:hardware,board_boot_id:boot,
      protocol_version:"1.0",transport:"usb_ncm",descriptor_version:"offline-negotiated-raw-claim",led_config:{},capabilities},auth);
    assert.equal(bound.status,200,await bound.clone().text());
    const status=(await call("get_mouse_state",{device_id:device})).structuredContent;
    assert.equal(status.capabilities[scopedSearchTTLCapability],rollback?undefined:true);
    assert.equal(status.capabilities[reviewedPointTTLCapability],rollback?undefined:true);
  }
  const diagnosticResponse=await post("/mcp/development",{jsonrpc:"2.0",id:1,method:"tools/list"},{"oai-authenticated-user-id":owner});
  if(process.env.SAYSO_TEST_DIAGNOSTICS==="1")assert.equal(diagnosticResponse.status,200);else {assert.equal(diagnosticResponse.status,404);assert.equal((await post("/v1/voice-benchmark",{}, {"oai-authenticated-user-id":owner})).status,404);}
  const maintenanceAuth={"X-SaySo-Retention-Key":"cd".repeat(32)};
  assert.equal((await post("/internal/retention",{})).status,401);
  assert.equal((await post("/internal/retention",{},maintenanceAuth)).status,200);
  if(badSigning){
    const state=await call("get_mouse_state",{device_id:device});
    assert.equal(state.structuredContent.error,"SIGNING_CONFIGURATION_INVALID");assert.equal(state.structuredContent.signing_available,false);
    assert.equal((await post(route+"claim",phone,auth)).status,503);
    const invalidStop=await call("stop_mouse",{device_id:"My phone"});assert.equal(invalidStop.structuredContent.stopped,true);assert.equal(invalidStop.structuredContent.selector_fallback,true);
    const invalidSessionStop=await call("stop_session",{bridge_session_id:null});assert.equal(invalidSessionStop.structuredContent.stopped,true);assert.equal(invalidSessionStop.structuredContent.selector_fallback,true);
    assert.equal(await count("keyboard.type_text"),0);
    console.log(JSON.stringify({mode:"invalid-signing-configuration",input_blocked:true,stop_available:true,maintenance_available:true,actual_phone_actions:0}));
    throw configurationChecked;
  }
  assert.equal((await post(route+"claim",phone,auth)).status,204);

  assert.equal((await rpc("initialize",{protocolVersion:"2026-07-28"})).serverInfo.version,"0.13.256");
  const catalogue=(await rpc("tools/list",{})).tools;
  for(const name of ["stop_mouse","stop_session"])assert.equal(catalogue.find(t=>t.name===name).annotations.idempotentHint,true);
  assert.equal(catalogue.find(t=>t.name==="stop_session").annotations.destructiveHint,true);
  assert.equal(catalogue.find(t=>t.name==="type_text_in_field").annotations.destructiveHint,true);
  const invalid=await call("click_at",{unexpected:"SECRET-ARG-VALUE"});assert.equal(invalid.isError,true);assert.deepEqual(invalid.structuredContent.invalid_arguments.unknown,["unexpected"]);assert.deepEqual(invalid.structuredContent.invalid_arguments.missing,[...catalogue.find(t=>t.name==="click_at").inputSchema.required].sort());assert.equal(JSON.stringify(invalid).includes("SECRET-ARG-VALUE"),false);
  assert.equal((await mf.dispatchFetch("http://localhost/mcp",{method:"POST",headers:{"content-type":"application/json"},body:"{invalid"})).status,401);

  for(const name of ["search_app_with_vision","prepare_app_search","type_google_map_in_spotlight"])
    assert.equal(catalogue.some(x=>x.name===name),false);
  const retired=["screen-text","app-search-preparations/00000000-0000-4000-8000-000000000000/result",
    "pointer-actions/ready","browse/calibration","browse/ready","browse/active","browse/take","browse/input",
    "browse/observe","browse/checkpoint","browse/image","browse/halt","capture-requests/claim",
    "capture-requests/00000000-0000-4000-8000-000000000000/result"];
  for(const path of retired){const response=await post("/v1/device/"+path,{},auth);assert.equal(response.status,410,path);}
  for(const body of [{...phone,app_search_protocol:"app_search_prepare.v1"},{...phone,reviewed_press_protocol:"reviewed_press_after_move.v1"}]){
    const response=await post(route+"claim",body,auth);assert.equal(response.status,422);
  }
  assert.equal(Number((await db.prepare("SELECT count(*) n FROM sb_mouse_commands").first()).n),0);
  const calls=[],frames=[];
  const invoke=(name,args)=>{calls.push(name);console.log("CHAIN_START",name);const pending=call(name,args);pending.then(r=>console.log("CHAIN_RESULT",name,JSON.stringify({state:r.structuredContent?.state,error:r.structuredContent?.error})),e=>console.error("CHAIN_TRANSPORT",name,String(e)));return pending;};
  const first=await publish(result,10000);
  const initial=await invoke("read_screen",{device_id:device,wait_for_new_ms:0});
  assert.equal(initial.content.filter(x=>x.type==="image").length,1);
  assert.equal(typeof initial.structuredContent.source_point_proof,"string","Current-only capabilities must issue an actual released source signature");
  first.proof=initial.structuredContent.source_point_proof;
  let before=first,mono=10000;
  async function clickPoint(label){
    const source=before;
    mono+=1;await publish(current,mono);
    const pending=invoke("click_at",{device_id:device,source_frame_id:source.frame,source_point_proof:source.proof,x:77,y:146,
      image_width:444,image_height:960,orientation_epoch:0,idempotency_key:randomUUID()});
    const move=await claim("pointer.move_absolute"),click=move.precondition.point.click_command_id;
    assert.equal(move.precondition.source_frame_id,source.frame);assert.equal(move.precondition.point_source,undefined);
    await acknowledge(move,mono+20,{absolute_requested_x:move.payload.x,absolute_requested_y:move.payload.y},{
      input_submitted:true,point_result:{protocol:"paired_mouse_point.v1",click:{state:"board_acked",input_submitted:true,error:null,
        finished_client_mono_ms:mono+30,board_receipt:{command_id:click,board_boot_id:boot,state:"executed",subcommand_index:0,error:null,effect:{hid_reports_sent:true}}}}
    },true);
    mono+=450;const after=await publish(wrong,mono);const reply=await pending;
    assert.equal(reply.structuredContent.screen_changed_since_source,true);assert.ok(reply.structuredContent.source_age_ms>=0);
    const compact=JSON.parse(reply.content.find(block=>block.type==="text").text);assert.equal(compact.screen_changed_since_source,true);
    verifyJPEG(reply,wrong,after,click);frames.push({label,source:source.frame,after:after.frame});before=after;
  }
  const searchPending=invoke("open_system_search",{device_id:device,idempotency_key:randomUUID()});
  const search=await claim("keyboard.open_search");
  assert.equal(search.precondition.system_search_mode,"scope_only.v1");
  assert.equal(search.precondition.system_search_frame_id,undefined);
  await acknowledge(search,mono+20,{system_search_stable:true,all_released:true},{input_submitted:true});
  mono+=450;const searchAfter=await publish(focus,mono);verifyJPEG(await searchPending,focus,searchAfter,search.command_id);
  frames.push({label:"system_search",source:before.frame,after:searchAfter.frame});before=searchAfter;
  const namePending=invoke("type_text_in_field",{device_id:device,text:"Google Maps",idempotency_key:randomUUID()});
  const named=await claim("keyboard.type_text");
  assert.equal(named.payload.submit_enter,undefined);
  await acknowledge(named,mono+20,{ascii_stable:true,all_released:true,clear_before_input:true},{input_submitted:true,mouse_mode_confirmed:true,restored_mouse_boot_id:boot});
  mono+=450;const nameAfter=await publish(result,mono);verifyJPEG(await namePending,result,nameAfter,named.command_id);
  frames.push({label:"app_name",source:before.frame,after:nameAfter.frame});before=nameAfter;
  await clickPoint("open_installed_app");
  const typing=invoke("type_text_in_field",{device_id:device,text:"Changi airport",submit:"enter",idempotency_key:randomUUID()});
  const typed=await claim("keyboard.type_text");
  assert.match((await db.prepare("SELECT digest FROM sb_mouse_commands WHERE id=?").bind(typed.command_id).first()).digest,/^hmac-v1:[0-9a-f]{64}$/);
  assert.deepEqual(typed.payload,{text:"Changi airport",submit_enter:true,clear_before_input:true});
  assert.equal(typed.precondition.field_input_validation,"no_visual_v1");
  await acknowledge(typed,mono+20,{ascii_stable:true,all_released:true,enter_sent:true,clear_before_input:true},{
    input_submitted:true,mouse_mode_confirmed:true,restored_mouse_boot_id:boot
  });
  mono+=450;const typedAfter=await publish(result,mono);const typedReply=await typing;
  assert.equal(JSON.parse((await db.prepare("SELECT payload FROM sb_mouse_commands WHERE id=?").bind(typed.command_id).first()).payload).text,undefined);
  verifyJPEG(typedReply,result,typedAfter,typed.command_id);frames.push({label:"type_return",source:before.frame,after:typedAfter.frame});before=typedAfter;
  // Deliberate model-delay case: exact original source remains bound while a
  // fresh, pixel-different current head exists. This is not a performance sample.
  await pause(11050);mono+=11050;await publish(current,mono);
  const dragAge=Date.now()-before.capture;assert.ok(dragAge>10000);
  const dragging=invoke("drag_at",{device_id:device,source_frame_id:before.frame,from_x:220,from_y:700,to_x:220,to_y:400,
    image_width:444,image_height:960,orientation_epoch:0,idempotency_key:randomUUID()});
  const dragged=await claim("pointer.drag_absolute");
  assert.equal(dragged.precondition.drag_source_confirmation,"server_accepted_geometry.v1");
  assert.equal(dragged.precondition.source_frame_id,before.frame);
  assert.equal(dragged.precondition.drag_source_seq,before.seq);
  await acknowledge(dragged,mono+20,{absolute_drag_v2:true,all_released:true,button_report_id:2,position_report_id:3,
    motion_reports_sent:Math.ceil(dragged.payload.duration_ms/24),final_x:dragged.payload.to_x,final_y:dragged.payload.to_y},{input_submitted:true});
  mono+=450;const dragAfter=await publish(wrong,mono);const dragReply=await dragging;
  verifyJPEG(dragReply,wrong,dragAfter,dragged.command_id);frames.push({label:"drag",source:before.frame,after:dragAfter.frame});before=dragAfter;
  const scrolling=invoke("scroll_mouse",{device_id:device,steps:-2,idempotency_key:randomUUID()});
  const wheel=await claim("pointer.scroll");
  await acknowledge(wheel,mono+20,{wheel_units_sent:-2,wheel_reports_sent:2},{input_submitted:true});
  mono+=450;const wheelAfter=await publish(result,mono);const wheelReply=await scrolling;
  verifyJPEG(wheelReply,result,wheelAfter,wheel.command_id);frames.push({label:"scroll",source:before.frame,after:wheelAfter.frame});before=wheelAfter;
  await clickPoint("next_target");
  assert.deepEqual(calls,["read_screen","open_system_search","type_text_in_field","click_at","type_text_in_field","drag_at","scroll_mouse","click_at"]);
  assert.equal(await count("pointer.move_absolute"),2);assert.equal(await count("pointer.click"),2);
  assert.equal(await count("keyboard.open_search"),1);assert.equal(await count("keyboard.type_text"),2);assert.equal(await count("pointer.drag_absolute"),1);assert.equal(await count("pointer.scroll"),1);
  // S6: Stop must work without a hardware/readiness row and be idempotent.
  await db.prepare("DELETE FROM sb_hardware WHERE device_id=?").bind(device).run();
  const stopped=await call("stop_mouse",{device_id:randomUUID()});
  assert.equal(stopped.structuredContent.selector_fallback_reason,"not_found");
  assert.equal(stopped._meta.sayso_performance.metrics.d1.calls,1,"mouse Stop must have one D1 round trip");
  assert.equal(stopped.structuredContent.selector_fallback,true);
  assert.equal(stopped.structuredContent.stopped,true);assert.equal(stopped.structuredContent.already_stopped,false);
  assert.equal((await call("stop_mouse",{})).structuredContent.already_stopped,true);
  // S3: terminalize an original queued record even after control was stopped.
  const queued=randomUUID();
  await db.prepare("INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,control_epoch,created_at,expires_at) VALUES(?,?,?,?,?,?,'pointer.click','{}','fixture',?,'queued',2,?,?)")
    .bind(queued,owner,device,session,hardware,boot,randomUUID(),Date.now(),Date.now()+5000).run();
  const staleSession=randomUUID();
  await db.prepare("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,mode) SELECT ?,owner_id,device_id,?,?,'fixture','stopped','stopped',created_at,'broadcast' FROM sb_sessions WHERE id=?").bind(staleSession,randomUUID(),randomUUID(),session).run();
  const sessionStop=await call("stop_session",{bridge_session_id:staleSession});assert.equal(sessionStop.structuredContent.selector_fallback_reason,"stale_session");assert.equal(sessionStop.structuredContent.stopped,true);assert.equal(sessionStop.structuredContent.selector_fallback,true);
  assert.equal((await db.prepare("SELECT state FROM sb_sessions WHERE id=?").bind(session).first()).state,"stopped");
  assert.equal((await db.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").bind(queued).first()).state,"cancelled");
  console.log(JSON.stringify({mode:"current-chain",runtime:"0.13.256",worker_sha256:sha(readFileSync(entry)),calls,frames,
    drag_original_age_ms:dragAge,independent_intermediate_reads:0,historical_jpegs:true,fixture_receipts:true,
    actual_phone_actions:0,retired_http_routes_rejected:retired.length,outbound_requests:outbound}));
} catch(error){if(error!==configurationChecked){console.error("CURRENT_CHAIN_ASSERTION",error.stack??String(error));throw error;}} finally {await mf.dispose();}
