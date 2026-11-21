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

const mode=process.argv[2];
const bareModes=["visual-point-bare-implicit","visual-point-bare-explicit","visual-point-bare-expired","visual-point-bare-tamper",
  "visual-point-bare-geometry-after-admission","visual-point-bare-revoked-after-admission"];
assert.ok(["maps","immediate","wrong-scene","initial-fallback","relook","relook-fallback","relook-expired","relook-expired-consumed","missing","tampered","revoked","no-v4","race","maps-click","maps-ttl","maps-center",
  "release-recovered","release-clock","release-double","visual-read-age","visual-point-legacy","visual-point-implicit",
  "visual-point-explicit","visual-point-tamper","visual-point-scope","visual-point-geometry","visual-point-later",
  "visual-point-expired","visual-point-no-release","visual-point-cap-lost","visual-point-browse-later","visual-point-immediate",
  "visual-point-clock-drop","visual-point-late-acceptance","parked-press","parked-press-no-claim","parked-press-later",
  "parked-press-ambiguous","parked-press-off-target","parked-press-stale","parked-press-cached",
  "parked-press-selector-unreleased","parked-press-selector-expired","parked-press-selector-later",
  "parked-press-selector-outside-original","parked-press-selector-default-window","parked-press-selector-center",
  "visual-point-center","visual-point-center-explicit","visual-point-center-tamper","visual-point-center-expired",
  "visual-point-center-no-release","visual-point-center-edge","visual-point-center-single-axis","visual-point-center-raw",
  "visual-point-center-current","visual-point-center-current-hash","visual-point-center-current-changed",
  "visual-point-center-expired-implicit","visual-point-center-preview","visual-point-center-ledger-after",
  "parked-press-clock-drop","parked-press-no-alias","parked-press-selector-normalized",
  "parked-press-selector-normalized-invalid","parked-press-selector-normalized-distance","parked-press-selector-mixed-invalid",
  "point-recheck","point-recheck-scope","point-recheck-unknown","point-recheck-old",
  "direct-spotlight","direct-spotlight-default","direct-spotlight-point-png","direct-spotlight-unsigned","direct-spotlight-jpeg","direct-spotlight-relook","direct-spotlight-scope","direct-spotlight-clear",
  "visual-point-historical","visual-point-geometry-after-admission","visual-point-revoked-after-admission",
  "synthetic-carrier","drag-cloud-confirmation","search-busy-resume","search-busy-no-visual","search-busy-intervening-input",...bareModes].includes(mode));
const dragCloudFixture=mode==="drag-cloud-confirmation";
const syntheticCarrier=mode==="synthetic-carrier";
const searchInterveningInput=mode==="search-busy-intervening-input";
const searchNoVisual=mode==="search-busy-no-visual"||searchInterveningInput;
const busyResume=mode==="search-busy-resume"||searchNoVisual;
const newApp=mode==="maps-ttl",mapsCenter=mode==="maps-center",openMaps=mode==="maps-click"||newApp||mapsCenter;
const confirmAppOpen=openMaps||searchNoVisual;
const releaseFixture=mode.startsWith("release-");
const visualReadFixture=mode==="visual-read-age";
const visualPointFixture=mode.startsWith("visual-point-");
const historicalPoint=mode==="visual-point-historical";
const parkedPressFixture=mode.startsWith("parked-press");
const pointRecheck=mode.startsWith("point-recheck");
const directSpotlight=mode.startsWith("direct-spotlight");
const directDefaultClear=mode==="direct-spotlight-clear";
const pressProtocol="reviewed_press_after_move.v1",pressCapability="sayso."+pressProtocol;
const visualClockDrop=mode==="visual-point-clock-drop";
const parkedClockDrop=mode==="parked-press-clock-drop";
const clockFixture=releaseFixture||visualClockDrop||parkedClockDrop;
const visualPointCap="sayso.reviewed_point_crops.visual_read.v1";
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
  bindings:mode==="direct-spotlight-unsigned"?{}:{SAYSO_FRAME_PERMIT_HMAC_KEY_HEX:"ab".repeat(32)},
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
  return {frame,capture};
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
    board_receipt:{command_id:id,board_boot_id:boot,state:"executed",subcommand_index:0,error:null,
      effect:{hid_reports_sent:true,all_released:true,...effect}}},signedPoint?
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
  await db.batch([
    db.prepare("INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,confirmed_at,created_at,current_session,lease_epoch,worker_id,worker_expires) VALUES(?,?,'Offline host review',?,?,?,?,?,7,?,?)")
      .bind(device,owner,sha(token),now+90000,now,now,session,worker,now+90000),
    db.prepare("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,control_epoch,mouse_enabled,mouse_until,mode) VALUES(?,?,?,?,?,?,'active','active',?,2,1,?,'broadcast')")
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
  assert.equal((await post(route+"claim",phone,auth)).status,204);
  const args={device_id:device,preparation_id:randomUUID(),query:"Google Maps"};
  const tools=await rpc("tools/list",{});
  assert.equal(tools.tools.some(tool=>tool.name==="search_app_with_vision"),mode!=="direct-spotlight-unsigned");
  const initialized=await rpc("initialize",{protocolVersion:"2026-07-28"});
  assert.equal(initialized.serverInfo.version,rollback?"0.13.204":process.env.SAYSO_TEST_RUNTIME??"0.13.218");
  let referenceAge,afterAge,originalID,clickResult,searchGrant,pointGrant,releaseEvidence,visualReads,visualPoint,parkedPress,busyEvidence;
  if(dragCloudFixture){
    const original=await publish(focus,10000);
    await publish(current,10100);
    const args={device_id:device,source_frame_id:original.frame,from_x:220,from_y:700,to_x:220,to_y:400,
      image_width:444,image_height:960,orientation_epoch:0,idempotency_key:randomUUID()};
    const failedCall=call("drag_at",args),first=await claim("pointer.drag_absolute");
    assert.equal(first.precondition.drag_source_confirmation,"server_accepted_frame.v1");
    assert.equal(first.precondition.drag_source_sha256,focus.sha);
    assert.notEqual(first.precondition.drag_source_sha256,current.sha);
    const rejected=await post(route+first.command_id+"/result",{...scope,state:"failed",input_submitted:false,
      error:"DRAG_REVIEWED_FRAME_UNAVAILABLE",board_receipt:{}},auth);
    assert.equal(rejected.status,200,await rejected.clone().text());
    const fail=await failedCall;assert.equal(fail.structuredContent.input_not_submitted,true);
    assert.equal(fail.content.filter(b=>b.type==="image").length,0);
    const succeeded=call("drag_at",{...args,idempotency_key:randomUUID()}),second=await claim("pointer.drag_absolute");
    assert.equal(second.precondition.drag_source_sha256,focus.sha);
    const ack=await post(route+second.command_id+"/result",{...scope,state:"board_acked",input_submitted:true,
      finished_client_mono_ms:10200,board_receipt:{command_id:second.command_id,board_boot_id:boot,
        state:"executed",subcommand_index:0,error:null,started_uptime_ms:100,finished_uptime_ms:450,
        effect:{hid_reports_sent:true}}},auth);
    assert.equal(ack.status,200,await ack.clone().text());
    const after=await publish(current,10520),done=await succeeded;
    assert.equal(done.structuredContent.state,"board_acked");verifyJPEG(done,current,after,second.command_id);
    const wrong=await call("drag_at",{...args,source_frame_id:randomUUID(),idempotency_key:randomUUID()});
    assert.equal(wrong.isError,true);assert.equal(await count("pointer.drag_absolute"),2);
  }else if(directSpotlight){
    const compact=reply=>JSON.parse(reply.content.find(item=>item.type==="text").text);
    const status=(await call("get_mouse_state",{device_id:device})).structuredContent;
    assert.equal(status.system_search_scope_only_ready,true);
    assert.equal(status.focused_text_no_visual_ready,true);
    const opts={device_id:device,idempotency_key:randomUUID()};
    const jpegOverride=mode==="direct-spotlight-jpeg"||mode==="direct-spotlight-default";
    const open=call("open_system_search",{...opts,...(mode==="direct-spotlight-default"?{}:{image_format:jpegOverride?"original_jpeg":"compact_png"})});
    const shortcut=await claim("keyboard.open_search");
    originalID=shortcut.command_id;
    assert.deepEqual(shortcut.payload,{});
    assert.deepEqual(shortcut.precondition,{system_search_mode:"scope_only.v1",capture_min_gap_ms:300});
    await acknowledge(shortcut,10000,{system_search_stable:true});
    const focused=await publish(focus,11000);
    const first=await open;
    function verifyFocus(reply,source,photo,mimeType){
      const {structuredContent:fields}=reply;
      const b=compact(reply);
      assert.equal(reply.content[0].type,"text");
      assert.equal(Object.keys(b)[0],"image_handoff");
      assert.equal(Object.keys(fields)[0],"image_handoff");
      assert.equal(b.image_handoff.source_frame_id,source.frame);
      assert.equal(fields.state,"board_acked");
      assert.equal(fields.command_id,originalID);
      assert.equal(fields.after_screen.metadata.frame_id,source.frame);
      assert.equal(fields.after_screen.metadata.width,444);
      assert.equal(fields.after_screen.metadata.height,960);
      assert.equal(fields.after_screen.after_command.command_id,originalID);
      assert.equal(fields.after_screen.after_command.scope_matches_at_snapshot,true);
      assert.equal(fields.after_screen.after_command.relation,"capture_after_phone_board_ack");
      assert.equal(fields.after_screen.after_command.phone_ack_mono_ms,10000);
      assert.ok(fields.after_screen.metadata.age_ms<2000);
      const actual=reply.content.filter(item=>item.type==="image");
      assert.equal(actual.length,1);
      assert.equal(actual[0].mimeType,mimeType);
      if(mimeType==="image/png"){
        assert.equal(Buffer.from(actual[0].data,"base64").subarray(0,8).toString("hex"),"89504e470d0a1a0a");
        assert.equal(actual[0].data,makeLiveImagePreview(photo.base64,"png").data);
      }else assert.equal(actual[0].data,photo.base64);
      assert.deepEqual(fields.focus_image,{mime_type:mimeType,width:mimeType==="image/png"?222:444,
        height:mimeType==="image/png"?480:960,purpose:"spotlight_focus",coordinate_space:"normalized_full_frame"});
      assert.deepEqual(b.focus_image,fields.focus_image);
      assert.equal(b.after_screen.metadata.frame_id,source.frame);
      assert.equal(b.after_screen.after_command.command_id,originalID);
      if(mode==="direct-spotlight-point-png"){
        assert.equal(b.click_at_source.source_frame_id,source.frame);
        assert.equal(b.click_at_source.image_width,444);
        assert.equal(b.click_at_source.image_height,960);
        assert.equal(typeof b.click_at_source.source_point_proof,"string");
        assert.equal(b.image_handoff.displayed_width,222);
        assert.equal(b.image_handoff.image_width,444);
      }else assert.equal(b.click_at_source,undefined);
      assert.equal(b.search_app_review,undefined);
      return fields.after_screen;
    }
    const original=verifyFocus(first,focused,focus,jpegOverride?"image/jpeg":"image/png");
    if(mode==="direct-spotlight-unsigned")assert.equal(original.source_field_proof,undefined);
    else{
      const proof=JSON.parse(Buffer.from(original.source_field_proof.split(".")[0],"base64url").toString("utf8"));
      assert.equal(proof.frame,focused.frame);
      assert.equal(proof.command,originalID);
      assert.equal(proof.sha256,focus.sha);
    }
    if(mode==="direct-spotlight-relook"){
      const newer=await publish(current,11400);
      const readBack=await call("get_mouse_result",{command_id:originalID,include_after_screen:true,
        image_format:"compact_png",after_command_min_gap_ms:Math.ceil(original.after_command.lower_gap_ms)});
      const later=verifyFocus(readBack,newer,current,"image/png");
      assert.ok(later.after_command.lower_gap_ms>original.after_command.lower_gap_ms);
    }
    assert.equal((await db.prepare("SELECT count(*) n FROM sb_app_search_queries").first()).n,0);
    const key=randomUUID(),field={device_id:device,text:"Google Maps",idempotency_key:key,settle_ms:300,
      ...(directDefaultClear?{}:{clear_before_input:false})};
    if(mode==="direct-spotlight-scope"){
      const other=await call("get_mouse_result",{command_id:originalID,include_after_screen:true,image_format:"compact_png"},"different-owner");
      assert.equal(other.isError,true);
      assert.equal(other.content.filter(item=>item.type==="image").length,0);
      await db.prepare("UPDATE sb_sessions SET mouse_enabled=0,control_epoch=control_epoch+1 WHERE id=?").bind(session).run();
      await publish(current,11400);
      const read=await call("get_mouse_result",{command_id:originalID,include_after_screen:true,image_format:"compact_png"});
      assert.equal(read.content.filter(item=>item.type==="image").length,0);
      assert.equal(read.structuredContent.focus_image,undefined);
      const typed=await call("type_text_in_field",field);
      assert.equal(typed.isError,true);
      assert.equal(await count("keyboard.type_text"),0);
    }else{
      const type=call("type_text_in_field",field);
      const typed=await claim("keyboard.type_text");
      assert.deepEqual(typed.payload,{text:"Google Maps",...(directDefaultClear?{clear_before_input:true}:{})});
      assert.deepEqual(typed.precondition,{spotlight_transport:"stable_usb",field_input_validation:"no_visual_v1"});
      await acknowledge(typed,12000,{ascii_stable:true,...(directDefaultClear?{clear_before_input:true}:{})},
        {input_submitted:true,mouse_mode_confirmed:true,restored_mouse_boot_id:boot});
      const found=await publish(result,12450);
      const done=await type;
      const after=verifyJPEG(done,result,found,typed.command_id);
      assert.equal(after.after_command.lower_gap_ms,450);
      assert.equal(done.structuredContent.focus_image,undefined);
      const typedSource=compact(done).after_screen.metadata;
      assert.equal(typedSource.frame_id,found.frame);
      const {x,y,image_width,image_height,orientation_epoch}= {x:77,y:146,image_width:typedSource.width,
        image_height:typedSource.height,orientation_epoch:typedSource.orientation_epoch};
      const opening=call("click_at",{device_id:device,source_frame_id:typedSource.frame_id,x,y,image_width,image_height,orientation_epoch,
        target_region:{x:35/444,y:103/960,width:84/444,height:82/960},landmark_region:{x:19/444,y:65/960,width:61/444,height:21/960},
        idempotency_key:randomUUID()});
      const move=await claim("pointer.move_absolute");
      assert.equal(move.precondition.source_frame_id,found.frame);
      const click=move.precondition.point.click_command_id;
      await acknowledge(move,12500,{absolute_requested_x:move.payload.x,absolute_requested_y:move.payload.y},{
        input_submitted:true,point_result:{protocol:"paired_mouse_point.v1",click:{state:"board_acked",input_submitted:true,
          error:null,finished_client_mono_ms:12530,board_receipt:{command_id:click,board_boot_id:boot,state:"executed",
            subcommand_index:0,error:null,effect:{hid_reports_sent:true}}}},
      });
      const opened=await publish(wrong,12950);
      verifyJPEG(await opening,wrong,opened,click);
      const blocked=await call("get_mouse_result",{command_id:typed.command_id,include_after_screen:true,image_format:"compact_png"});
      assert.equal(blocked.structuredContent.error,"INVALID_ARGUMENTS");
      assert.equal(await count("keyboard.type_text"),1);
      assert.equal(await count("pointer.move_absolute"),1);
      assert.equal(await count("pointer.click"),1);
    }
    assert.equal(await count("keyboard.open_search"),1);
    assert.equal((await db.prepare("SELECT count(*) n FROM sb_app_search_queries").first()).n,0);
  }else if(pointRecheck){
    const first=await publish(result,10000);
    const prior=await call("read_screen",{device_id:device,wait_for_new_ms:0});
    assert.equal(prior.structuredContent.metadata.frame_id,first.frame);
    await waitFor(()=>db.prepare("SELECT proof FROM sb_released_system_search_field_proofs WHERE command_id='visual_read' AND frame_id=?")
      .bind(first.frame).first());
    const target={x:35/444,y:103/960,width:84/444,height:82/960};
    const landmark={x:19/444,y:65/960,width:61/444,height:21/960};
    const point={...JSON.parse(prior.content.find(block=>block.type==="text").text).click_at_source,
      x:0,y:0,target_region:target,landmark_region:landmark,idempotency_key:randomUUID(),
      ...(mode==="point-recheck"?{}:{observe_after:false})};
    const initial=call("click_at",point);
    const move=await claim("pointer.move_absolute");
    assert.equal(move.precondition.point_source,undefined);
    assert.equal(JSON.parse((await savedMove(move.command_id)).precondition).point_source.origin,"visual_read");
    const click=move.precondition.point.click_command_id;
    await pause(45);
    const successor=mode==="point-recheck-old"?undefined:await publish(current,10500);
    const uncertain=mode==="point-recheck-unknown";
    const receipt=await post(route+move.command_id+"/result",{...scope,state:uncertain?"outcome_unknown":"failed",
      error:uncertain?"USB_OUTCOME_UNKNOWN":"MOUSE_PRECONDITION_FAILED",input_submitted:uncertain,board_receipt:{},
      finished_client_mono_ms:null,point_result:{protocol:"paired_mouse_point.v1",click:{state:"failed",
        input_submitted:false,error:"POINT_CLICK_NOT_SUBMITTED",board_receipt:{},finished_client_mono_ms:null}}},auth);
    assert.equal(receipt.status,200,await receipt.clone().text());
    const initialReply=await initial;
    if(mode==="point-recheck-scope")await db.prepare("UPDATE sb_hardware SET board_boot_id=? WHERE device_id=?")
      .bind(randomUUID(),device).run();
    const checked=await call("get_mouse_result",{command_id:click,include_after_screen:true});
    for(const reply of [initialReply,checked]){
      const fields=reply.structuredContent,compact=JSON.parse(reply.content.find(block=>block.type==="text").text);
      const images=reply.content.filter(block=>block.type==="image");
      assert.equal(fields.state,"failed");
      assert.equal(fields.error,"POINT_CLICK_NOT_SUBMITTED");
      assert.equal(fields.command_id,click);
      assert.equal(fields.input_not_submitted,true);
      if(mode==="point-recheck"){
        assert.equal(fields.workflow_state,"review_required");
        assert.equal(fields.after_screen.reason,"REVIEW_POINT_AGAIN");
        assert.equal(fields.after_screen.after_command,null);
        assert.equal(fields.after_screen.metadata.frame_id,successor.frame);
        assert.notEqual(fields.after_screen.metadata.is_repeated,true);
        assert.equal(images.length,1);
        assert.equal(sha(Buffer.from(images[0].data,"base64")),current.sha);
        assert.ok(typeof fields.after_screen.source_point_proof==="string");
        assert.equal(compact.workflow_state,"review_required");
        assert.equal(compact.after_screen.after_command,null);
        assert.deepEqual(compact.click_at_source,{device_id:device,source_frame_id:successor.frame,image_width:444,image_height:960,
          orientation_epoch:0,source_point_proof:fields.after_screen.source_point_proof});
        assert.deepEqual(compact.move_result,{state:"failed",error:"MOUSE_PRECONDITION_FAILED",input_attempted:false});
        assert.match(compact.click_at_instruction,/new idempotency key once/);
      }else{
        assert.equal(images.length,0);
        assert.equal(fields.workflow_state,undefined);
        assert.equal(compact.click_at_source,undefined);
      }
    }
    assert.equal(await count("pointer.move_absolute"),1);
    assert.equal(await count("pointer.click"),1);
    if(mode==="point-recheck"){
      await waitFor(()=>db.prepare("SELECT proof FROM sb_released_system_search_field_proofs WHERE command_id='visual_read' AND frame_id=?")
        .bind(successor.frame).first());
      const next={...checked.structuredContent.click_at_source,x:0,y:0,target_region:target,landmark_region:landmark,
        idempotency_key:randomUUID(),wait_ms:0,observe_after:false};
      await db.prepare("DELETE FROM sb_released_system_search_field_proofs WHERE command_id='visual_read' AND frame_id=?")
        .bind(successor.frame).run();
      const missingLedger=await call("click_at",next);
      assert.equal(missingLedger.structuredContent.error,"VISUAL_READ_POINT_PROOF_INVALID");
      assert.equal(await count("pointer.move_absolute"),1);
      assert.equal(await count("pointer.click"),1);
      const release=await call("get_mouse_result",{command_id:click,include_after_screen:true});
      await waitFor(()=>db.prepare("SELECT proof FROM sb_released_system_search_field_proofs WHERE command_id='visual_read' AND frame_id=?")
        .bind(successor.frame).first());
      const retry=await call("click_at",{...next,...release.structuredContent.click_at_source});
      assert.equal(retry.structuredContent.workflow_stage,"point_pending");
      const repeated=await claim("pointer.move_absolute");
      assert.notEqual(repeated.command_id,move.command_id);
      assert.equal(repeated.precondition.point_source,undefined);
      assert.equal(JSON.parse((await savedMove(repeated.command_id)).precondition).point_source.frame_id,successor.frame);
      assert.equal(await count("pointer.move_absolute"),2);
      assert.equal(await count("pointer.click"),2);
    }
  }else if(parkedPressFixture){
    const first=await publish(pointerAway,10000);
    const read=await call("read_screen",{device_id:device,wait_for_new_ms:0});
    assert.equal(read.structuredContent.metadata.frame_id,first.frame);
    assert.ok(typeof read.structuredContent.source_point_proof==="string");
    await waitFor(()=>db.prepare("SELECT proof FROM sb_released_system_search_field_proofs WHERE command_id='visual_read' AND frame_id=?")
      .bind(first.frame).first());
    if(parkedClockDrop)denyParkedClock=true;
    const target={x:.13,y:.064,width:.58,height:.047},landmark={x:.03,y:.113,width:.15,height:.028};
    const point={device_id:device,source_frame_id:first.frame,x:175,y:86,image_width:444,image_height:960,
      orientation_epoch:0,target_region:target,landmark_region:landmark,idempotency_key:randomUUID(),wait_ms:0};
    const cached=mode==="parked-press-cached"||mode.startsWith("parked-press-selector-")||parkedClockDrop||mode==="parked-press-no-alias";
    const defaultWindow=mode.endsWith("default-window");
    const {wait_ms:_wait,...defaultPoint}=point;
    const beganAt=performance.now();
    const began=call("click_at",{...defaultPoint,...(defaultWindow?{}:{wait_ms:cached?1800:1000}),observe_after:cached});
    const move=await claim("pointer.move_absolute");
    const failedID=move.precondition.point.click_command_id,ambiguous=mode==="parked-press-ambiguous";
    if(defaultWindow)await pause(Math.max(0,2600-(performance.now()-beganAt)));
    await acknowledge(move,10050,{absolute_requested_x:move.payload.x,absolute_requested_y:move.payload.y},{
      input_submitted:true,point_result:{protocol:"paired_mouse_point.v1",click:{state:ambiguous?"outcome_unknown":"failed",
        input_submitted:ambiguous,error:ambiguous?"USB_OUTCOME_UNKNOWN":"MOUSE_PRECONDITION_FAILED",board_receipt:{}}}});
    if(mode==="parked-press-no-alias"){
      // Keep actual JPEG visible but omit support for parked proof/alias.
      await db.prepare("UPDATE sb_hardware SET metadata=json_remove(metadata,?) WHERE device_id=?")
        .bind('$.capabilities."'+pressCapability+'"',device).run();
    }
    if(defaultWindow)await pause(Math.max(0,6200-(performance.now()-beganAt)));
    const parked=cached?await publish(pointerParked,defaultWindow?13750:10450):null;
    const original=await began;
    assert.equal(move.command_id,original.structuredContent.move_command_id);
    assert.equal(original.content.filter(block=>block.type==="image").length,
      cached&&!parkedClockDrop&&mode!=="parked-press-no-alias"?1:0);
    const originalCompact=JSON.parse(original.content.find(block=>block.type==="text").text);
    assert.equal(originalCompact.click_command_id,originalCompact.state==="review_required"?undefined:failedID);
    assert.equal(originalCompact.click_submitted,ambiguous?true:false);
    assert.equal(originalCompact.input_not_submitted,ambiguous?undefined:true);
    const parkedFrame=parked??await publish(pointerParked,10450);
    const checked=cached?original:await call("get_mouse_result",{command_id:failedID,include_after_screen:true});
    if(parkedClockDrop||mode==="parked-press-no-alias"){
      assert.equal(checked.structuredContent.state,"failed");
      assert.equal(checked.structuredContent.error,"MOUSE_PRECONDITION_FAILED");
      assert.equal(checked.structuredContent.workflow_state,undefined);
      assert.equal(checked.structuredContent.next_action,undefined);
      assert.equal(checked.structuredContent.after_screen.parked_click,undefined);
      assert.equal(checked.isError,false);
      assert.equal(originalCompact.state,"failed");
      assert.equal(originalCompact.error,"MOUSE_PRECONDITION_FAILED");
      assert.equal(originalCompact.next_action,undefined);
      assert.equal(originalCompact.parked_click,undefined);
      if(parkedClockDrop){
        assert.equal(checked.structuredContent.after_screen.reason,"LIVE_FRAME_FRESHNESS_UNPROVEN_AT_RELEASE");
        assert.equal(await db.prepare("SELECT 1 FROM sb_released_system_search_field_proofs WHERE command_id=?").bind(failedID).first(),null);
      }
    }else if(ambiguous){
      assert.equal(checked.structuredContent.state,"outcome_unknown");
      assert.equal(checked.content.filter(block=>block.type==="image").length,0);
      assert.equal(checked.structuredContent.after_screen.source_point_proof,undefined);
    }else{
      assert.equal(checked.structuredContent.state,"failed");
      assert.equal(checked.structuredContent.input_not_submitted,true);
      assert.equal(checked.structuredContent.command_id,failedID);
      const after=verifyJPEG(checked,pointerParked,parkedFrame,move.command_id),proof=after.source_point_proof;
      assert.ok(typeof proof==="string");
      const compact=JSON.parse(checked.content.find(block=>block.type==="text").text);
      assert.equal(checked.structuredContent.workflow_state,"review_required");
      assert.equal(checked.structuredContent.error,"MOUSE_PRECONDITION_FAILED");
      assert.equal(checked.isError,false);
      assert.equal(compact.state,"review_required");
      assert.equal(compact.original_click_state,"failed");
      assert.equal(compact.click_submitted,false);
      assert.equal(compact.error,undefined);
      assert.deepEqual(checked.structuredContent.next_action,{tool:"click_at",source:after.parked_click});
      assert.equal(compact.next_action,undefined);
      assert.equal(compact.input_not_submitted,true);
      assert.equal(compact.command_id,undefined);
      assert.equal(compact.move_command_id,undefined);
      assert.equal(compact.after_screen,undefined);
      assert.deepEqual(compact.parked_click,after.parked_click);
      assert.match(compact.parked_click.source_frame_id,/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      assert.notEqual(compact.parked_click.source_frame_id,parkedFrame.frame);
      assert.match(compact.parked_click_instruction,/visible pointer center as fractions/);
      await waitFor(()=>db.prepare("SELECT proof FROM sb_released_system_search_field_proofs WHERE command_id=? AND frame_id=?")
        .bind(failedID,parkedFrame.frame).first());
      const alias=after.parked_click.source_frame_id;
      const aliasRow=()=>db.prepare("SELECT proof FROM sb_released_system_search_field_proofs WHERE command_id='parked_move_selector' AND frame_id=?")
        .bind(alias).first();
      await waitFor(aliasRow);
      const normalized=mode==="parked-press-selector-normalized";
      const normalizedDistance=mode==="parked-press-selector-normalized-distance";
      const invalidNormalized=mode==="parked-press-selector-normalized-invalid";
      const cursorX=mode==="parked-press-selector-center"?0:mode==="parked-press-selector-outside-original"?183:177;
      const resumed=cached?{...point,...compact.parked_click,x:normalized?cursorX/443:
        normalizedDistance?184/443:invalidNormalized?.01:mode.endsWith("mixed-invalid")?cursorX/443:cursorX,
        y:normalized||invalidNormalized||normalizedDistance?86/959:mode==="parked-press-selector-center"?0:86,
        idempotency_key:randomUUID()}:{...point,source_frame_id:parkedFrame.frame,source_point_proof:proof,
        resume_failed_click_command_id:failedID,resume_cursor_x:mode==="parked-press-off-target"?190:175,
        resume_cursor_y:86,idempotency_key:randomUUID()};
      if(["parked-press-later","parked-press-selector-later"].includes(mode)){
        const unrelated=await call("click_mouse",{device_id:device,wait_ms:0,observe_after:false,idempotency_key:randomUUID()});
        assert.equal(unrelated.structuredContent.state,"queued");
        const sent=await claim("pointer.click");
        await acknowledge(sent,10460,{}, {input_submitted:true});
      }else if(mode==="parked-press-stale"){
        await pause(Math.max(0,2100-(Date.now()-parkedFrame.capture)));
      }else if(mode==="parked-press-selector-unreleased"){
        await db.prepare("DELETE FROM sb_released_system_search_field_proofs WHERE command_id='parked_move_selector' AND frame_id=?")
          .bind(alias).run();
        assert.equal(await aliasRow(),null);
      }else if(mode==="parked-press-selector-expired"){
        await db.prepare("UPDATE sb_released_system_search_field_proofs SET expires_at=? WHERE command_id='parked_move_selector' AND frame_id=?")
          .bind(Date.now()-1,alias).run();
      }else if(mode==="parked-press-selector-outside-original"){
        // Shift only the verified original crop fixture edge within this
        // artificial case. The new model crop still contains the cursor.
        await db.prepare("UPDATE sb_mouse_commands SET precondition=json_set(precondition,'$.point_source.target_region.width',0.284) WHERE id=?")
          .bind(move.command_id).run();
      }
      if(["parked-press-later","parked-press-off-target","parked-press-stale","parked-press-selector-later",
          "parked-press-selector-unreleased","parked-press-selector-expired","parked-press-selector-outside-original",
          "parked-press-selector-center","parked-press-selector-normalized-invalid","parked-press-selector-normalized-distance",
          "parked-press-selector-mixed-invalid"].includes(mode)){
        const denied=await call("click_at",resumed);
        const expected=mode==="parked-press-off-target"||mode.endsWith("outside-original")||mode.endsWith("selector-center")||
          invalidNormalized||normalizedDistance||mode.endsWith("mixed-invalid")?"REVIEWED_PRESS_LANDING_INVALID":
          mode.endsWith("unreleased")||mode.endsWith("expired")?"REVIEWED_PRESS_SOURCE_PROOF_INVALID":"REVIEWED_PRESS_FRAME_OR_CONTROL_CHANGED";
        assert.equal(denied.structuredContent.error,expected,JSON.stringify(denied.structuredContent));
      }else{
        const direct=mode==="parked-press"||mode==="parked-press-cached"||defaultWindow||normalized?
          call("click_at",{...resumed,wait_ms:4000}):undefined;
        if(direct)await waitFor(()=>db.prepare("SELECT id FROM sb_mouse_commands WHERE predecessor_id=? AND state='queued'")
          .bind(failedID).first());
        const concurrent=await Promise.all([call("click_at",resumed),call("click_at",resumed)]);
        const ids=concurrent.map(reply=>reply.structuredContent.click_command_id);
        assert.ok(typeof ids[0]==="string",JSON.stringify(concurrent[0].structuredContent));
        assert.equal(ids[0],ids[1]);
        const other=await call("click_at",{...resumed,idempotency_key:randomUUID()});
        assert.equal(other.structuredContent.error,"IDEMPOTENCY_CONFLICT");
        for(const include of [false,true]){
          const status=await call("get_mouse_result",{command_id:failedID,include_after_screen:include});
          assert.equal(status.structuredContent.recovery_click_command_id,ids[0]);
          assert.equal(status.content.filter(block=>block.type==="image").length,0);
        }
        if(mode==="parked-press-no-claim"){
          const {reviewed_press_protocol,...olderPhone}=phone;
          assert.equal((await post(route+"claim",olderPhone,auth)).status,204);
          assert.equal((await post(route+ids[0]+"/start",olderPhone,auth)).status,409);
        }else{
          const reply=await post(route+"claim",phone,auth);
          assert.equal(reply.status,200,await reply.clone().text());
          const press=await reply.json();
          assert.equal(press.command_id,ids[0]);
          assert.equal(press.kind,"pointer.click");
          assert.deepEqual(press.payload,{button:"left"});
          assert.deepEqual(Object.keys(press.precondition),["reviewed_press"]);
          const wire=press.precondition.reviewed_press;
          assert.equal(wire.protocol,pressProtocol);
          assert.equal(wire.original_move_id,move.command_id);
          assert.equal(wire.original_click_id,failedID);
          assert.equal(wire.move_ack_phone_mono_ms,10050);
          assert.deepEqual(wire.point_source,{protocol:"reviewed_point_crop.v4",origin:"parked_move",frame_id:parkedFrame.frame,
            content_sha256:pointerParked.sha,target_region:target,landmark_region:landmark});
          assert.equal(wire.source_x,175);
          assert.ok(Math.abs(wire.cursor_x-(cached?177:175))<1e-9);
          assert.ok(Math.abs(wire.cursor_y-86)<1e-9);
          const artifact=process.env.SAYSO_PARKED_PRESS_CLAIM_OUTPUT;
          if(artifact)writeFileSync(artifact,JSON.stringify(press,null,2)+"\n");
          const pressAck=defaultWindow?13800:10500;
          await acknowledge(press,pressAck,{}, {input_submitted:true});
          const focused=await publish(wrong,pressAck+450);
          const final=await direct;
          const focusedAfter=verifyJPEG(final,wrong,focused,press.command_id);
          assert.equal(JSON.parse(final.content.find(block=>block.type==="text").text).after_screen.metadata.frame_id,focused.frame);
          assert.ok(typeof focusedAfter.source_field_proof==="string");
          const confirmedRelook=await call("get_mouse_result",{command_id:press.command_id,include_after_screen:true});
          assert.equal(JSON.parse(confirmedRelook.content.find(block=>block.type==="text").text).after_screen.metadata.frame_id,focused.frame);
          await waitFor(()=>db.prepare("SELECT proof FROM sb_released_system_search_field_proofs WHERE command_id=? AND frame_id=?")
            .bind(press.command_id,focused.frame).first());
          const text=call("type_text_in_field",{device_id:device,source_frame_id:focused.frame,
            source_after_command_id:press.command_id,wait_ms:2000,idempotency_key:randomUUID(),text:"Changi airport",clear_before_input:false,
            field:{x:.15,y:.065,width:.5,height:.045},landmark:{text:"Recent",region:{x:.12,y:.25,width:.25,height:.04}}});
          const typed=await claim("keyboard.type_text");
          assert.deepEqual(typed.precondition.focus_source,{protocol:"model_reviewed_field_crops.v4",origin:"parked_press",
            frame_id:focused.frame,content_sha256:wrong.sha});
          const textAck=pressAck+500;
          await acknowledge(typed,textAck,{ascii_stable:true},{spotlight_focus_frame_id:focused.frame,
            restored_mouse_boot_id:boot,mouse_mode_confirmed:true,input_submitted:true});
          const query=await publish(result,textAck+450);
          const textResult=await text;
          const typedAfter=verifyJPEG(textResult,result,query,typed.command_id);
          for(const observation of [textResult,await call("get_mouse_result",{command_id:typed.command_id,include_after_screen:true})]){
            const handoff=JSON.parse(observation.content.find(block=>block.type==="text").text);
            assert.equal(handoff.enter_sent,false);
            assert.deepEqual(handoff.click_at_source,{source_frame_id:query.frame,device_id:device,
              image_width:444,image_height:960,orientation_epoch:0,source_query_proof:observation.structuredContent.after_screen.source_query_proof});
            assert.ok(typeof handoff.click_at_source.source_query_proof==="string");
          }
          assert.ok(typeof typedAfter.source_query_proof==="string");
          parkedPress={original_move_id:move.command_id,original_failed_click_id:failedID,press_id:press.command_id,
            original_move_gap_ms:after.after_command.lower_gap_ms,exact_actual_parked_jpeg:true,
            same_call_parked_image:cached,parked_image_after_default_action_window:defaultWindow,normalized_cursor:normalized,
            after_press_gap_ms:focusedAfter.after_command.lower_gap_ms,
            same_call_after:true,typed_input:typed.payload.text,exact_typed_query_handoff:true,duplicate_claims:1};
        }
      }
    }
    assert.equal(await count("pointer.move_absolute"),1);
    const recoveryRows=(await db.prepare("SELECT id,state FROM sb_mouse_commands WHERE predecessor_id=?").bind(failedID).all()).results;
    assert.equal(recoveryRows.length,["parked-press","parked-press-cached","parked-press-no-claim",
      "parked-press-selector-normalized"].includes(mode)||defaultWindow?1:0);
  }else if(visualPointFixture){
    const variant=mode.slice("visual-point-".length);
    const bare=variant.startsWith("bare-");
    const center=variant==="center"||variant.startsWith("center-");
    const modeKey=bare?variant.slice("bare-".length):center?(variant==="center"?"implicit":variant.slice("center-".length)):variant;
    const exactHeadCenter=["current","current-hash","current-changed","preview"].includes(modeKey)||center&&modeKey==="no-release";
    const blocksClaim=["cap-lost","geometry-after-admission","revoked-after-admission"].includes(modeKey);
    const immediate=modeKey==="immediate"||historicalPoint||blocksClaim||center&&!["expired","explicit","implicit","no-release"].includes(modeKey);
    const first=await publish(result,10000,immediate||modeKey==="no-release"?10:modeKey==="late-acceptance"?1500:1000);
    if(!immediate&&modeKey!=="no-release")await pause(Math.max(0,1500-(Date.now()-first.capture)));
    const source=modeKey==="no-release"||exactHeadCenter?null:await call(modeKey==="implicit"?"view_screen":
      modeKey==="explicit"?"get_latest_screen":"read_screen",{device_id:device,
        ...(modeKey==="implicit"?{wait_ms:0}:modeKey==="explicit"?{bridge_session_id:session,wait_ms:0}:{wait_for_new_ms:0})});
    const proof=source?.structuredContent.source_point_proof;
    let compactHandoff=false;
    if(source){
      const images=source.content.filter(block=>block.type==="image");
      const compact=JSON.parse(source.content.find(block=>block.type==="text").text);
      if(visualClockDrop){
        assert.equal(images.length,0);
        assert.equal(source.structuredContent.metadata,undefined);
        assert.equal(compact.source_point_proof,undefined);
        assert.equal(wireAge.get(source),null);
      }else{
        assert.equal(source.structuredContent.metadata.frame_id,first.frame);
        assert.ok(Number(wireAge.get(source))>=(immediate?0:1500)&&Number(wireAge.get(source))<2000);
        assert.equal(images.length,1);
        assert.equal(sha(Buffer.from(images[0].data,"base64")),result.sha);
        if(modeKey!=="legacy"){
          assert.equal(compact.source_point_proof,undefined);
          assert.equal(compact.image_ref,undefined);
          assert.equal(compact.mcp_request_id,undefined);
          assert.deepEqual(compact.click_at_source,{device_id:device,source_frame_id:first.frame,image_width:444,
            image_height:960,orientation_epoch:0,source_point_proof:proof});
          assert.match(compact.click_at_instruction,/x=0 and y=0 together/);
          compactHandoff=true;
        }else assert.equal(compact.source_point_proof,undefined);
      }
    }
    const proofExpected=!exactHeadCenter&&!["legacy","no-release","clock-drop"].includes(modeKey);
    assert.equal(typeof proof,proofExpected?"string":"undefined");
    const ledger=()=>db.prepare("SELECT proof FROM sb_released_system_search_field_proofs WHERE owner_id=? AND device_id=? AND command_id='visual_read' AND frame_id=?")
      .bind(owner,device,first.frame).first();
    if(proofExpected&&!immediate)await waitFor(ledger);
    else if(!proofExpected)assert.equal(await ledger(),null);
    if(modeKey==="expired-implicit"){
      await waitFor(ledger);
      await db.prepare("UPDATE sb_released_system_search_field_proofs SET expires_at=? WHERE command_id='visual_read' AND frame_id=?")
        .bind(Date.now()-10,first.frame).run();
    }
    const delayed=immediate?0:modeKey==="no-release"?500:modeKey==="expired"?17300:6800;
    if(!immediate)await pause(Math.max(0,delayed-(Date.now()-first.capture)));
    const current=immediate?first:await publish(result,10000+delayed);
    if(modeKey==="scope")await db.prepare("UPDATE sb_hardware SET board_boot_id=? WHERE device_id=?").bind(randomUUID(),device).run();
    if(modeKey==="geometry")await db.prepare("UPDATE sb_frames SET metadata=json_set(metadata,'$.orientation_epoch',1) WHERE frame_id=?")
      .bind(current.frame).run();
    if(modeKey==="later"){
      const written=await call("click_mouse",{device_id:device,wait_ms:0,observe_after:false,idempotency_key:randomUUID()});
      assert.equal(written.structuredContent.state,"queued");
      const input=await claim("pointer.click");
      await acknowledge(input,10000+delayed+20,{}, {input_submitted:true});
    }
    if(modeKey==="browse-later"){
      const run=randomUUID(),lease=randomUUID(),issued=Math.ceil(first.capture+3000);
      await db.batch([
        db.prepare("INSERT INTO sb_browse_runs(id,owner_id,device_id,intent_key,intent_digest,session_id,broadcast_id,worker_id,lease_epoch,control_epoch,hardware_id,board_boot_id,hardware_metadata,calibration_id,settings_hash,orientation_epoch,state,queue_json,plan_keys_json,lease_seq,last_lease_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,7,2,?,?,?,?,?,0,'handoff','[]','{}',2,?,?,?)")
          .bind(run,owner,device,randomUUID(),"fixture",session,broadcast,worker,hardware,boot,"{}",randomUUID(),"fixture",lease,Math.floor(first.capture-5000),issued+2500),
        db.prepare("INSERT INTO sb_browse_leases(id,run_id,seq,request_id,issued_at,expires_at) VALUES(?,?,2,?,?,?)")
          .bind(lease,run,randomUUID(),issued,issued+2500),
      ]);
    }
    const point={device_id:device,source_frame_id:first.frame,x:center?0:77,y:center&&modeKey!=="single-axis"?0:146,image_width:444,image_height:960,
      orientation_epoch:0,...(bare?{}:{target_region:{x:35/444,y:103/960,width:(modeKey==="edge"?3:84)/444,height:82/960},
      landmark_region:{x:19/444,y:65/960,width:61/444,height:21/960}}),idempotency_key:randomUUID()};
    const positive=["implicit","explicit","immediate","historical","current","current-hash","current-changed","ledger-after","legacy","no-release"].includes(modeKey);
    const args={...point,...(modeKey==="tamper"?{source_point_proof:proof+"x"}:
      ["explicit","expired","ledger-after"].includes(modeKey)||!center&&immediate?{source_point_proof:proof}:{})};
    const startAge=Date.now()-first.capture;
    assert.ok(startAge>=delayed);
    if(modeKey==="preview"){
      const preview=await call("read_screen_live",{device_id:device,image_format:"compact_png",wait_for_new_ms:0});
      assert.equal(preview.structuredContent.image.view_only,true);
      assert.equal(preview.structuredContent.frame_id,undefined);
      assert.equal(preview.structuredContent.click_at_source,undefined);
      assert.equal(preview.content.find(block=>block.type==="image").mimeType,"image/png");
      const rejected=await call("click_at",{...args,source_frame_id:undefined,source_point_proof:undefined});
      assert.equal(rejected.structuredContent.error,"REVIEWED_POINT_CROP_SOURCE_REQUIRED");
      assert.equal(await count("pointer.move_absolute"),0);
      assert.equal(await count("pointer.click"),0);
    }else if(positive){
      let historicalID;
      if(historicalPoint){
        const queued=await call("click_at",{...args,wait_ms:0});
        historicalID=queued.structuredContent.move_command_id;
        await db.prepare("UPDATE sb_mouse_commands SET precondition=json_remove(precondition,'$.point_motion_policy') WHERE id=?")
          .bind(historicalID).run();
        const original=await savedMove(historicalID);
        const same=await call("click_at",{...args,wait_ms:0});
        assert.equal(same.structuredContent.move_command_id,historicalID);
        assert.deepEqual(await savedMove(historicalID),original);
      }
      const changingHead=["current-hash","current-changed"].includes(modeKey);
      let delayedProofWrite;
      if(modeKey==="ledger-after"){
        await waitFor(ledger);
        const row=await db.prepare("SELECT * FROM sb_released_system_search_field_proofs WHERE command_id='visual_read' AND frame_id=?")
          .bind(first.frame).first();
        assert.equal(row.proof,proof);
        await db.prepare("DELETE FROM sb_released_system_search_field_proofs WHERE command_id='visual_read' AND frame_id=?")
          .bind(first.frame).run();
        assert.equal(await ledger(),null);
        // Simulate the asynchronous released proof briefly missing from D1.
        // The valid request must wait one bounded re-read before admission.
        const columns=Object.keys(row);
        delayedProofWrite=pause(48).then(()=>db.prepare("INSERT INTO sb_released_system_search_field_proofs("+columns.join(",")+
          ") VALUES("+columns.map(()=>"?").join(",")+")").bind(...columns.map(key=>row[key])).run());
      }
      const opening=changingHead?null:call("click_at",args);
      if(changingHead){
        const queued=await call("click_at",{...args,wait_ms:0,observe_after:false});
        assert.equal(queued.structuredContent.workflow_stage,"point_pending");
        await publish(modeKey==="current-changed"?wrong:result,10500);
      }
      const move=await claim("pointer.move_absolute");
      if(delayedProofWrite)await delayedProofWrite;
      if(historicalID){
        assert.equal(move.command_id,historicalID);
        assert.equal(move.raw_dispatch_ttl_profile,reviewedPointTTLProfile);
        assert.ok(move.ttl_remaining_ms>4000&&move.ttl_remaining_ms<=5000);
      }
      if(center){
        const target=point.target_region;
        assert.equal(move.precondition.source_x,(target.x+target.width/2)*443);
        assert.equal(move.precondition.source_y,(target.y+target.height/2)*959);
        assert.deepEqual(move.payload,{x:Math.round((target.x+target.width/2)*32767),y:Math.round((target.y+target.height/2)*32767)});
      }
      await reviewPointWire(move,{...(exactHeadCenter||modeKey==="legacy"||modeKey==="no-release"?{protocol:"reviewed_point_crop.v2"}:
          {protocol:"reviewed_point_crop.v4",origin:"visual_read"}),
        frame_id:first.frame,content_sha256:result.sha,...(bare?{}:{target_region:point.target_region,landmark_region:point.landmark_region})},!historicalPoint);
      const saved=JSON.parse((await savedMove(move.command_id)).precondition);
      assert.equal(saved.point_center_policy,exactHeadCenter?"exact_head.v1":undefined);
      assert.equal(move.precondition.point_center_policy,undefined);
      assert.equal(move.paired_click_command.precondition.point_center_policy,undefined);
      assert.ok(typeof move.point_receipt_proof==="string");
      const click=move.precondition.point.click_command_id,liveMono=changingHead?10500:10000+delayed;
      await acknowledge(move,liveMono+15,{absolute_requested_x:move.payload.x,absolute_requested_y:move.payload.y},{
        input_submitted:true,point_result:{protocol:"paired_mouse_point.v1",click:{state:"board_acked",input_submitted:true,
          error:null,finished_client_mono_ms:liveMono+30,board_receipt:{command_id:click,board_boot_id:boot,state:"executed",
            subcommand_index:0,error:null,effect:{hid_reports_sent:true}}}},
      },true);
      const opened=await publish(wrong,liveMono+450);
      const openedReply=opening?await opening:await call("get_mouse_result",{command_id:click,include_after_screen:true});
      const after=verifyJPEG(openedReply,wrong,opened,click);
      const compactClick=JSON.parse(openedReply.content.find(block=>block.type==="text").text);
      assert.equal(compactClick.command_id,click);
      assert.deepEqual(compactClick.after_screen,{state:"available",
        metadata:{device_id:device,frame_id:opened.frame,width:444,height:960,orientation_epoch:0},
        after_command:{command_id:click,lower_gap_ms:after.after_command.lower_gap_ms},
        ...(typeof after.source_field_proof==="string"?{source_field_proof:after.source_field_proof}:{})});
      assert.equal(await count("pointer.move_absolute"),1);
      assert.equal(await count("pointer.click"),1);
    }else if(blocksClaim){
      const queued=await call("click_at",{...args,wait_ms:0,observe_after:false});
      assert.equal(queued.structuredContent.workflow_stage,"point_pending");
      if(modeKey==="cap-lost")await db.prepare("UPDATE sb_hardware SET metadata=json_remove(metadata,?) WHERE device_id=?")
        .bind('$.capabilities."'+visualPointCap+'"',device).run();
      if(modeKey==="geometry-after-admission"){
        await publish(result,10500);
        await db.prepare("UPDATE sb_frames SET metadata=json_set(metadata,'$.orientation_epoch',1) WHERE device_id=?").bind(device).run();
      }
      if(modeKey==="revoked-after-admission")
        await db.prepare("UPDATE sb_sessions SET mouse_enabled=0,control_epoch=control_epoch+1 WHERE id=?").bind(session).run();
      assert.equal((await post(route+"claim",phone,auth)).status,204);
      const parent=await db.prepare("SELECT state FROM sb_mouse_commands WHERE id=?").bind(queued.structuredContent.move_command_id).first();
      assert.ok(["queued","expired","failed","outcome_unknown"].includes(parent?.state));
    }else if(modeKey==="raw"){
      const {source_frame_id:_frame,target_region:_target,landmark_region:_landmark,...raw}=args;
      const queued=await call("click_at",{...raw,wait_ms:0,observe_after:false});
      assert.equal(queued.structuredContent.workflow_stage,"point_pending");
      const move=await claim("pointer.move_absolute");
      assert.deepEqual(move.payload,{x:0,y:0});
      assert.equal(move.precondition.point_source,undefined);
    }else{
      const rejected=await call("click_at",args);
      const expected=["expired","tamper","expired-implicit"].includes(modeKey)?"VISUAL_READ_POINT_PROOF_INVALID":
        ["edge","single-axis"].includes(modeKey)?"REVIEWED_POINT_TARGET_MARGIN":
        center&&["no-release","expired-implicit"].includes(modeKey)?"REVIEWED_TARGET_CENTER_REQUIRES_RELEASED_IMAGE":"REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED";
      assert.equal(rejected.structuredContent.error,expected,JSON.stringify(rejected.structuredContent));
      if(expected==="REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED"){
        const details=rejected.structuredContent.admission_diagnostic;
        assert.equal(details.diagnostic_timing,"after_rejection");
        assert.equal(details.source_frame_id,first.frame);
        assert.ok(details.conditions&&Object.keys(details.conditions).length);
        assert.equal(rejected.structuredContent.input_not_submitted,true);
        const compact=JSON.parse(rejected.content.find(item=>item.type==="text").text);
        assert.deepEqual(compact.admission_diagnostic,details);
        assert.equal(compact.input_not_submitted,true);
        assert.equal(rejected.content.filter(item=>item.type==="image").length,0);
      }
      assert.equal(await count("pointer.move_absolute"),0);
      assert.equal(await count("pointer.click"),modeKey==="later"?1:0);
    }
    visualPoint={source_frame:first.frame,source_release_age_ms:source?Number(wireAge.get(source)):null,
      source_age_at_click_ms:startAge,explicit_proof:typeof args.source_point_proof==="string",proof_issued:proofExpected,
      immediate_no_ledger_wait:immediate,compact_handoff:compactHandoff,
      exact_qualified_click:positive,center_requested:center,moves:await count("pointer.move_absolute"),clicks:await count("pointer.click")};
  }else if(visualReadFixture){
    const routes=[
      ["read_screen",{wait_for_new_ms:0}],
      ["view_screen",{wait_ms:0}],
      ["get_latest_screen",{bridge_session_id:session,wait_ms:0}],
    ];
    visualReads=[];
    for(const [name,extra] of routes){
      const current=await publish(result,10000+sequence*100,1250);
      const args={device_id:device,...extra};
      const reply=await call(name,args);
      const imageBlocks=reply.content.filter(block=>block.type==="image");
      const age=Number(wireAge.get(reply));
      assert.equal(reply.structuredContent.state,"available");
      assert.equal(reply.structuredContent.metadata.frame_id,current.frame);
      assert.equal(reply.structuredContent.metadata.stale,false);
      assert.ok(age>1000&&age<2000);
      assert.equal(imageBlocks.length,1);
      assert.equal(sha(Buffer.from(imageBlocks[0].data,"base64")),result.sha);
      const smaller=await call(name,{...args,max_age_ms:1000});
      assert.equal(smaller.content.filter(block=>block.type==="image").length,0);
      const expired=await publish(result,10000+sequence*100,2050);
      const rejected=await call(name,{...args,...(name==="read_screen"?{allow_repeated:true}:{})});
      assert.equal(rejected.isError,false);
      assert.equal(rejected.content.filter(block=>block.type==="image").length,0);
      assert.equal(wireAge.get(rejected),null);
      visualReads.push({tool:name,frame:current.frame,egress_age_ms:age,explicit_1000_rejected:true,
        stale_frame:expired.frame,stale_rejected:true,real_jpeg_sha256:result.sha});
    }
    assert.equal(await count("keyboard.open_search"),0);
    assert.equal(await count("keyboard.type_text"),0);
    const original=await call("click_mouse",{device_id:device,idempotency_key:randomUUID(),observe_after:false,wait_ms:0});
    assert.equal(original.structuredContent.state,"queued",JSON.stringify(original.structuredContent));
    const click=await claim("pointer.click");
    await acknowledge(click,12000,{}, {input_submitted:true});
    const after=await publish(result,12400,1250);
    const postArgs={device_id:device,wait_for_new_ms:0,after_command_id:click.command_id,after_command_min_gap_ms:300};
    const later=await call("read_screen",postArgs),laterImage=later.content.filter(block=>block.type==="image");
    const age=Number(wireAge.get(later));
    assert.equal(later.structuredContent.after_command.command_id,click.command_id);
    assert.equal(later.structuredContent.metadata.frame_id,after.frame);
    assert.ok(age>1000&&age<2000);
    assert.equal(laterImage.length,1);
    assert.equal(sha(Buffer.from(laterImage[0].data,"base64")),result.sha);
    const premature=await call("read_screen",{...postArgs,after_command_min_gap_ms:400});
    assert.equal(premature.structuredContent.reason,"WAITING_POST_COMMAND_FRAME");
    assert.equal(premature.content.filter(block=>block.type==="image").length,0);
    assert.equal(await count("pointer.click"),1);
    visualReads.push({tool:"read_screen(after_command_id)",frame:after.frame,egress_age_ms:age,
      exact_ack_order:true,real_jpeg_sha256:result.sha,fixture_input_commands:1});
  }else if(mode==="no-v4"){
    assert.equal((await search(args)).structuredContent.error,"APP_SEARCH_HOST_REVIEW_UNAVAILABLE");
    assert.equal(await count("keyboard.open_search"),0);
  }else{
    const first=search(args),shortcut=await claim("keyboard.open_search");
    originalID=shortcut.command_id;
    const compactText=reply=>JSON.parse(reply.content.find(item=>item.type==="text").text);
    if(busyResume){
      const same=search({...args,preparation_id:randomUUID()});
      const different=search({...args,preparation_id:randomUUID(),query:"Taobao"});
      for(const [proofExpected,reply] of [[true,await same],[false,await different]]){
        const {structuredContent:summary}=reply,compact=compactText(reply);
        assert.equal(reply.isError,false);
        assert.equal(summary.state,"search_busy");
        assert.equal(summary.reason,"APP_SEARCH_QUERY_BUSY");
        assert.equal(summary.can_resume,proofExpected);
        assert.equal(summary.active_preparation_id,proofExpected?args.preparation_id:undefined);
        assert.ok(summary.retry_after_ms>0&&summary.retry_after_ms<=60000);
        assert.equal(reply.content.filter(item=>item.type==="image").length,0);
        assert.equal(summary.command_id,undefined);
        assert.equal(summary.shortcut_command_id??null,null);
        assert.equal(summary.text_command_id??null,null);
        for(const field of ["state","reason","can_resume","active_preparation_id","retry_after_ms"])
          assert.equal(compact[field],summary[field]);
      }
      const privateReply=await search({...args,preparation_id:randomUUID()},"other-owner");
      assert.equal(privateReply.structuredContent.active_preparation_id,undefined);
      assert.equal(compactText(privateReply).active_preparation_id,undefined);
      assert.equal((await db.prepare("SELECT count(*) n FROM sb_app_search_queries").first()).n,1);
      assert.equal(await count("keyboard.open_search"),1);
      busyEvidence={same_query_scoped_resume:true,different_query_hidden:true,other_owner_hidden:true,extra_shortcuts:0};
    }
    if(newApp){
      assert.equal(shortcut.raw_dispatch_ttl_profile,rollback?undefined:scopedSearchTTLProfile);
      if(rollback)assert.equal(shortcut.ttl_remaining_ms,2500);
      else assert.ok(shortcut.ttl_remaining_ms>4000&&shortcut.ttl_remaining_ms<=5000);
      const received=Date.now();
      if(!rollback)await pause(2750);
      searchGrant={ttl_ms:shortcut.ttl_remaining_ms,profile:shortcut.raw_dispatch_ttl_profile,
        fixture_ack_wait_ms:Date.now()-received};
      if(!rollback)assert.ok(searchGrant.fixture_ack_wait_ms>2500&&searchGrant.fixture_ack_wait_ms<searchGrant.ttl_ms);
    }
    await acknowledge(shortcut,10000,{system_search_stable:true});
    const initialPhoto=mode==="initial-fallback"?noisyJPEG():mode==="wrong-scene"?wrong:focus;
    let source=mode==="missing"?null:await publish(initialPhoto,11000);
    let began=await first;
    if(newApp&&!rollback&&began.structuredContent.state!=="review_required"){
      assert.equal(began.content.filter(block=>block.type==="image").length,0);
      began=await call("get_app_search_query_result",{preparation_id:args.preparation_id,relook_focus:true});
      searchGrant.used_original_relook=true;
    }
    if(releaseFixture){
      const initial=source;
      assert.ok(initial&&releaseSuccessor&&initial.frame!==releaseSuccessor.frame);
      const records=()=>db.prepare("SELECT frame_id FROM sb_released_system_search_field_proofs WHERE owner_id=? AND command_id=?")
        .bind(owner,originalID).all();
      if(mode==="release-double"){
        assert.equal(began.structuredContent.state,"review_image_unavailable");
        assert.equal(began.structuredContent.after_screen.reason,"LIVE_FRAME_FRESHNESS_UNPROVEN_AT_RELEASE");
        assert.equal(began.structuredContent.after_screen.release_failure,"frame_expired");
        assert.equal(began.structuredContent.review_frame_id,undefined);
        assert.equal(began.content.filter(block=>block.type==="image").length,0);
        assert.equal(wireAge.get(began),null);
        await waitFor(async()=>{
          const row=await db.prepare("SELECT native_review_state AS phase FROM sb_app_search_queries WHERE id=?").bind(args.preparation_id).first();
          return row?.phase==="host:initial:none";
        });
        assert.equal(clockSamples,3);
        for(const candidate of [initial,releaseSuccessor]){
          const denied=await search({...args,review:{source_frame_id:candidate.frame,scene:"unverified"}});
          assert.equal(denied.structuredContent.error,"APP_SEARCH_REVIEW_FRAME_CHANGED");
        }
        assert.deepEqual((await records()).results,[]);
        assert.equal(await count("keyboard.type_text"),0);
        const relook=()=>call("get_app_search_query_result",{preparation_id:args.preparation_id,relook_focus:true});
        assert.equal((await relook()).content.filter(block=>block.type==="image").length,0);
        const used=clockSamples;
        assert.equal((await relook()).content.filter(block=>block.type==="image").length,0);
        assert.equal(clockSamples,used);
        assert.deepEqual((await records()).results,[]);
        releaseEvidence={initial_frame:initial.frame,replacement_frame:releaseSuccessor.frame,terminal_unavailable:true,
          qualified_images:0,retained_proofs:0,clock_samples:clockSamples};
      }else{
        source=releaseSuccessor;
        assert.equal(began.structuredContent.review_frame_id,source.frame);
        const after=verifyHostReviewImage(began,current,source,originalID,"image/png",true);
        assert.ok(after.after_command.lower_gap_ms>1000);
        assert.equal(after.recovery.retry_trigger,"late_image_release");
        assert.ok(Number(wireAge.get(began))>0&&Number(wireAge.get(began))<2000);
        assert.equal(clockSamples,3);
        await waitFor(async()=>{
          const row=await db.prepare("SELECT native_review_state AS phase FROM sb_app_search_queries WHERE id=?").bind(args.preparation_id).first();
          return row?.phase.includes(source.frame);
        });
        assert.deepEqual((await records()).results,[{frame_id:source.frame}]);
        releaseEvidence={initial_frame:initial.frame,replacement_frame:source.frame,qualified_images:1,
          retained_proofs:1,release_age_ms:Number(wireAge.get(began)),clock_samples:clockSamples};
      }
    }else if(source){
      assert.equal(began.structuredContent.state,"review_required");
      assert.equal(began.structuredContent.review_frame_id,source.frame);
      verifyHostReviewImage(began,initialPhoto,source,originalID,
        mode==="initial-fallback"?"image/jpeg":"image/png",!searchGrant?.used_original_relook);
      if(mode!=="immediate"){
        await waitFor(async()=>{
          const row=await db.prepare("SELECT native_review_state AS phase FROM sb_app_search_queries WHERE id=?").bind(args.preparation_id).first();
          return row?.phase.includes(source.frame);
        });
        const saved=await db.prepare("SELECT proof FROM sb_released_system_search_field_proofs WHERE owner_id=? AND device_id=? AND command_id=? AND frame_id=?")
          .bind(owner,device,originalID,source.frame).first();
        const proof=JSON.parse(Buffer.from(saved.proof.split(".")[0],"base64url").toString("utf8"));
        assert.equal(proof.sha256,initialPhoto.sha); // The original JPEG hash persists even for initial PNG.
      }
    }else{
      assert.equal(began.structuredContent.state,"review_image_unavailable");
      assert.equal(began.structuredContent.review_image,undefined);
      const compact=compactText(began);
      assert.equal(compact.relook_focus_available,true);
      assert.match(compact.review_image_instruction,/once.*relook_focus=true/);
    }
    if(busyResume){
      const compact=compactText(began);
      assert.equal(compact.state,"review_required");
      assert.equal(compact.preparation_id,args.preparation_id);
      assert.equal(compact.review_frame_id,source.frame);
      assert.equal(compact.shortcut_command_id,originalID);
      assert.deepEqual(compact.search_app_review,{preparation_id:args.preparation_id,device_id:device,review_frame_id:source.frame});
      assert.equal(began.content.filter(item=>item.type==="image").length,1);
      busyEvidence.initial_compact_frame_id=compact.review_frame_id;
    }
    const expiryFixture=mode.startsWith("relook-expired");
    if(expiryFixture){
      const phase=(await db.prepare("SELECT native_review_state AS phase FROM sb_app_search_queries WHERE id=?")
        .bind(args.preparation_id).first()).phase;
      await db.prepare("UPDATE sb_app_search_queries SET created_at=?,native_review_state=? WHERE id=?")
        .bind(Date.now()-61000,mode==="relook-expired-consumed"?"host:consumed":phase.replace(/^host:initial:/,"host:relook:"),args.preparation_id).run();
      await publish(current,11400);
      const expired=await call("get_app_search_query_result",{preparation_id:args.preparation_id,relook_focus:true});
      assert.equal(expired.structuredContent.state,"outcome_unknown");
      const reason=mode==="relook-expired-consumed"?null:"SPOTLIGHT_REVIEW_EXPIRED";
      assert.equal(expired.structuredContent.reason,reason);
      assert.equal(compactText(expired).reason,reason);
      assert.equal(compactText(expired).review_image_instruction,undefined);
      assert.equal(expired.structuredContent.review_frame_id,undefined);
      assert.equal(expired.structuredContent.review_image,undefined);
      assert.equal(expired.content.filter(block=>block.type==="image").length,0);
      assert.equal(await count("keyboard.open_search"),1);
      assert.equal(await count("keyboard.type_text"),0);
    }
    if(["relook","missing","relook-fallback"].includes(mode)||busyResume){
      const before=source,reference=mode==="relook-fallback"?noisyJPEG():current;
      source=await publish(reference,11400);
      const relook=await call("get_app_search_query_result",{preparation_id:busyResume?compactText(began).preparation_id:args.preparation_id,
        relook_focus:true});
      const after=verifyHostReviewImage(relook,reference,source,originalID,mode==="relook-fallback"?"image/jpeg":"image/png",false);
      if(busyResume){
        const compact=compactText(relook);
        assert.equal(compact.preparation_id,args.preparation_id);
        assert.equal(compact.review_frame_id,source.frame);
        assert.equal(compact.shortcut_command_id,originalID);
        assert.deepEqual(compact.search_app_review,{preparation_id:args.preparation_id,device_id:device,review_frame_id:source.frame});
        const metadata=after.metadata;
        assert.equal(metadata.device_id,device);
        assert.equal(metadata.bridge_session_id,session);
        assert.equal(metadata.broadcast_id,broadcast);
        assert.equal(metadata.worker_id,worker);
        assert.equal(metadata.worker_id_at_read,worker);
        assert.equal(metadata.lease_epoch,scope.lease_epoch);
        assert.equal(metadata.control_epoch_at_read,scope.control_epoch);
        assert.equal(after.after_command.command_id,originalID);
        assert.equal(after.after_command.phone_ack_mono_ms,10000);
        assert.equal(after.after_command.scope_matches_at_snapshot,true);
        assert.equal(after.after_command.relation,"capture_after_phone_board_ack");
        busyEvidence.relook_compact_frame_id=compact.review_frame_id;
        busyEvidence.relook_scope_verified=true;
      }
      if(before)assert.ok(after.after_command.lower_gap_ms>began.structuredContent.after_screen.after_command.lower_gap_ms);
      await waitFor(async()=>{
        const row=await db.prepare("SELECT native_review_state AS phase FROM sb_app_search_queries WHERE id=?").bind(args.preparation_id).first();
        return row?.phase.includes(source.frame);
      });
      const stored=await db.prepare("SELECT proof FROM sb_released_system_search_field_proofs WHERE owner_id=? AND device_id=? AND command_id=? AND frame_id=?")
        .bind(owner,device,originalID,source.frame).first();
      const proof=JSON.parse(Buffer.from(stored.proof.split(".")[0],"base64url").toString("utf8"));
      assert.equal(proof.frame,source.frame);
      assert.equal(proof.command,originalID);
      assert.equal(proof.sha256,reference.sha); // Original JPEG, never the delivered display PNG.
      assert.equal(await count("keyboard.type_text"),0);
      assert.equal(await count("keyboard.open_search"),1);
      assert.equal((await call("get_app_search_query_result",{preparation_id:args.preparation_id,relook_focus:true})).content.filter(b=>b.type==="image").length,0);
      if(before)assert.equal((await search({...args,review:{source_frame_id:before.frame,scene:"unverified"}})).structuredContent.error,
        "APP_SEARCH_REVIEW_FRAME_CHANGED");
    }
    const verdict={source_frame_id:busyResume?busyEvidence.relook_compact_frame_id:source.frame,
      scene:"spotlight",empty:true,field:{x:.105,y:.589,width:.75,height:.042},
      landmark:{text:"Siri Suggestions",region:{x:.041,y:.066,width:.31,height:.026}},placeholder:"Search"};
    const oversizedFallback=mode.endsWith("-fallback");
    if(mode!=="immediate"&&!expiryFixture&&!oversizedFallback){
      assert.equal((await search({...args,review:verdict},"other-owner")).structuredContent.error,"INVALID_APP_SEARCH_CONTINUATION");
      assert.equal((await search({...args,review:{...verdict,source_frame_id:randomUUID()}})).structuredContent.error,"APP_SEARCH_REVIEW_FRAME_CHANGED");
      assert.equal(await count("keyboard.type_text"),0);
    }
    if(searchInterveningInput){
      const later=await call("click_mouse",{device_id:device,observe_after:false,wait_ms:0,idempotency_key:randomUUID()});
      assert.equal(later.structuredContent.state,"queued",JSON.stringify(later.structuredContent));
      const click=await claim("pointer.click");
      await acknowledge(click,11420,{}, {input_submitted:true});
      await publish(current,11800);
      const rejected=await search({...args,review:verdict});
      assert.equal(rejected.structuredContent.state,"stopped");
      assert.equal(rejected.structuredContent.reason,"APP_SEARCH_ORIGINAL_CONTROL_CHANGED");
      assert.equal(compactText(rejected).reason,"APP_SEARCH_ORIGINAL_CONTROL_CHANGED");
      assert.equal(rejected.content.filter(item=>item.type==="image").length,0);
      assert.equal(await count("keyboard.type_text"),0);
      assert.equal(await count("keyboard.open_search"),1);
      assert.equal(await count("pointer.click"),1);
      busyEvidence.intervening_input_blocked_text=true;
    }else if(mode==="release-double"||expiryFixture||oversizedFallback){
      assert.equal(await count("keyboard.type_text"),0);
    }else if(mode==="race"){
      const id=args.preparation_id,read=()=>db.prepare("SELECT native_review_state AS phase FROM sb_app_search_queries WHERE id=?").bind(id).first();
      const set=phase=>db.prepare("UPDATE sb_app_search_queries SET native_review_state=? WHERE id=?").bind(phase,id).run();
      const final=(await read()).phase;
      assert.match(final,/^host:initial:/);
      // Hold the operation in its real pre-commit phase to exercise readers
      // that arrive before the asynchronous proof transaction settles.
      await set("host:initial");
      const relook=()=>call("get_app_search_query_result",{preparation_id:id,relook_focus:true});
      const pending=await Promise.all([relook(),search({...args,review:verdict})]);
      for(const reply of pending){
        assert.equal(reply.structuredContent.state,"review_release_pending");
        assert.equal(reply.content.filter(block=>block.type==="image").length,0);
      }
      assert.equal((await read()).phase,"host:initial");
      await set(final);
      const competing=await Promise.all([relook(),relook()]);
      assert.ok(competing.every(reply=>reply.content.filter(block=>block.type==="image").length===0));
      await waitFor(async()=>(await read()).phase==="host:relook:none");
      assert.equal(await count("keyboard.type_text"),0);
    }else if(mode==="wrong-scene"){
      const stopped=await search({...args,review:{source_frame_id:source.frame,scene:"unverified"}});
      assert.equal(stopped.structuredContent.reason,"SPOTLIGHT_FOCUS_UNVERIFIED");
      await search({...args,review:verdict});
      assert.equal(await count("keyboard.type_text"),0);
    }else if(mode==="tampered"||mode==="revoked"){
      if(mode==="tampered")await db.prepare("UPDATE sb_released_system_search_field_proofs SET proof='tampered' WHERE frame_id=?").bind(source.frame).run();
      else await db.prepare("UPDATE sb_sessions SET mouse_enabled=0 WHERE id=?").bind(session).run();
      const rejected=(await search({...args,review:verdict})).structuredContent;
      assert.equal(rejected.error??rejected.reason,"FIELD_FRAME_OR_CONTROL_CHANGED");
      assert.equal(await count("keyboard.type_text"),0);
    }else{
      if(mode==="maps"||openMaps)await pause(Math.max(0,10600-(Date.now()-source.capture)));
      referenceAge=Date.now()-source.capture;
      const mono=mode==="immediate"?11000:12000+referenceAge;
      const head=mode==="immediate"?source:await publish(current,mono);
      const continued=search({...args,review:verdict});
      const typed=await claim("keyboard.type_text");
      assert.equal(typed.raw_dispatch_ttl_profile,undefined);
      assert.equal(typed.payload.text,args.query);
      assert.equal(typed.payload.submit_enter,undefined);
      if(searchNoVisual){
        assert.deepEqual(typed.payload,{text:args.query});
        assert.deepEqual(typed.precondition,{spotlight_transport:"stable_usb",field_input_validation:"no_visual_v1"});
      }else assert.deepEqual(typed.precondition.focus_source,{protocol:"model_reviewed_field_crops.v4",frame_id:source.frame,
        content_sha256:mode==="maps"||mode==="immediate"||openMaps?focus.sha:current.sha,origin:"system_search"});
      await search({...args,review:verdict});
      await acknowledge(typed,mono+20,{ascii_stable:true},
        {...(searchNoVisual?{input_submitted:true}:{spotlight_focus_frame_id:head.frame}),
          mouse_mode_confirmed:true,restored_mouse_boot_id:boot});
      const after=await publish(result,mono+450);
      const done=await continued;
      assert.equal(done.structuredContent.state,"query_confirmed");
      const queryImage=verifyJPEG(done,result,after,typed.command_id);
      afterAge=queryImage.metadata.age_ms;
      assert.equal(await count("keyboard.type_text"),1);
      if(busyResume){
        const compact=compactText(done);
        assert.equal(compact.state,"query_confirmed");
        assert.equal(compact.preparation_id,args.preparation_id);
        assert.equal(compact.shortcut_command_id,originalID);
        assert.equal(compact.text_command_id,typed.command_id);
        assert.equal(compact.after_screen.metadata.frame_id,after.frame);
        assert.equal(compact.after_screen.metadata.device_id,device);
        assert.equal(compact.after_screen.after_command.command_id,typed.command_id);
        assert.ok(typeof queryImage.source_query_proof==="string");
        assert.deepEqual(compact.click_at_source,{source_frame_id:after.frame,device_id:device,
          image_width:444,image_height:960,orientation_epoch:0,source_query_proof:queryImage.source_query_proof});
        busyEvidence.query_compact_frame_id=compact.after_screen.metadata.frame_id;
        busyEvidence.no_visual_input=searchNoVisual;
      }
      if(confirmAppOpen){
        assert.equal((await call("get_mouse_state",{device_id:device})).structuredContent.reviewed_point_scope_bound_ready,true);
        const proof=queryImage.source_query_proof;
        assert.ok(typeof proof==="string"&&proof.length>30);
        const referenceDelay=searchNoVisual?4100:14500;
        await pause(Math.max(0,referenceDelay-(Date.now()-after.capture)));
        const retained=await db.prepare("SELECT proof FROM sb_released_system_search_field_proofs WHERE owner_id=? AND device_id=? AND command_id=? AND frame_id=?")
          .bind(owner,device,typed.command_id,after.frame).first();
        assert.equal(retained?.proof,proof);
        const liveMono=queryImage.after_command.capture_lower_phone_mono_ms+referenceDelay;
        const live=await publish(result,liveMono);
        assert.notEqual(live.frame,after.frame);
        const sourceArgs=searchNoVisual?compactText(done).click_at_source:
          {device_id:device,source_frame_id:after.frame,image_width:444,image_height:960,orientation_epoch:0,source_query_proof:proof};
        const {source_query_proof,...point}={...sourceArgs,x:77,y:146,target_region:{x:35/444,y:103/960,width:84/444,height:82/960},
          landmark_region:{x:19/444,y:65/960,width:61/444,height:21/960}};
        const withoutProof=await call("click_at",{...point,idempotency_key:randomUUID()});
        assert.equal(withoutProof.structuredContent.error,"REVIEWED_POINT_FRAME_OR_CONTROL_CHANGED");
        const tampered=await call("click_at",{...point,idempotency_key:randomUUID(),source_query_proof:proof+"x"});
        assert.equal(tampered.structuredContent.error,"COMPOUND_QUERY_VIEW_PROOF_INVALID");
        assert.equal(await count("pointer.move_absolute"),0);
        assert.equal(await count("pointer.click"),0);
        const sourceAge=Date.now()-after.capture;
        assert.ok(sourceAge>=referenceDelay);
        const opening=call("click_at",{...point,...(mapsCenter?{x:0,y:0}:{}),idempotency_key:randomUUID(),source_query_proof});
        const move=await claim("pointer.move_absolute");
        await reviewPointWire(move,{protocol:"reviewed_point_crop.v4",origin:"typed",
          frame_id:after.frame,content_sha256:result.sha,target_region:point.target_region,landmark_region:point.landmark_region},!rollback);
        if(mapsCenter){
          const target=point.target_region;
          assert.equal(move.precondition.source_x,(target.x+target.width/2)*443);
          assert.equal(move.precondition.source_y,(target.y+target.height/2)*959);
        }
        const click=move.precondition.point.click_command_id;
        const clickAckMono=liveMono+30;
        if(newApp){
          assert.equal(move.raw_dispatch_ttl_profile,undefined);
          assert.ok(move.ttl_remaining_ms<=2500);
          pointGrant={ttl_ms:move.ttl_remaining_ms,profile:move.raw_dispatch_ttl_profile};
        }
        await acknowledge(move,liveMono+15,{absolute_requested_x:move.payload.x,absolute_requested_y:move.payload.y},{
          input_submitted:true,point_result:{protocol:"paired_mouse_point.v1",click:{state:"board_acked",input_submitted:true,
            error:null,finished_client_mono_ms:clickAckMono,board_receipt:{command_id:click,board_boot_id:boot,state:"executed",
              subcommand_index:0,error:null,effect:{hid_reports_sent:true}}}},
        });
        const opened=await publish(foreground,clickAckMono+420);
        const finished=await opening;
        assert.equal(finished.structuredContent.state,"board_acked");
        const landing=verifyJPEG(finished,foreground,opened,click);
        assert.equal(await count("pointer.move_absolute"),1);
        assert.equal(await count("pointer.click"),1);
        clickResult={query_source_age_ms:sourceAge,query_reference_sha256:result.sha,click_command_id:click,
          foreground_age_ms:landing.metadata.age_ms,foreground_sha256:foreground.sha,moves:1,clicks:1};
      }
    }
    await search(args);
    assert.equal(await count("keyboard.open_search"),1);
  }
  assert.equal(outbound,0);
  console.log(JSON.stringify({mode,worker_sha256:sha(readFileSync(entry)),historical_jpegs:true,fixture_receipts:true,
    original_shortcut:originalID,reference_age_ms:referenceAge,query_after_age_ms:afterAge,deliberate_ledger_wait:mode!=="immediate",
    shortcuts:await count("keyboard.open_search"),texts:await count("keyboard.type_text"),click_result:clickResult,
    search_grant:searchGrant,point_grant:pointGrant,release_evidence:releaseEvidence,visual_reads:visualReads,visual_point:visualPoint,
    parked_press:parkedPress,busy_resume:busyEvidence,jpeg_fallback_fixture:mode.endsWith("-fallback"),rollback,
    actual_phone_actions:0,outbound_requests:outbound}));
}finally{await mf.dispose();}
