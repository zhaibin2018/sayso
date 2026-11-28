// Offline smoke against the built production Worker; no remote bindings or phones.
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {Miniflare} from "miniflare";
import jpeg from "jpeg-js";
import {frameHeaders} from "../lib/device-frame-headers.ts";
import {framePermitHeader} from "../lib/frame-upload-permit.ts";

const root=resolve("dist/server"),entry=join(root,"index.js");
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(join(dir,item.name)):item.name.endsWith(".js")?[join(dir,item.name)]:[]);
const sha=value=>createHash("sha256").update(value).digest("hex");
let outbound=0;
const runtime=new Miniflare({modulesRoot:root,modules:[entry,...files(root).filter(p=>p!==entry)].map(path=>({type:"ESModule",path,contents:readFileSync(path,"utf8")})),
  compatibilityDate:"2026-05-15",compatibilityFlags:["nodejs_compat"],d1Databases:{DB:"hot-path-production-offline"},r2Buckets:{BUCKET:"hot-path-production-offline"},
  bindings:{SAYSO_FRAME_PERMIT_HMAC_KEY_HEX:"ab".repeat(32)},outboundService:()=>{outbound++;return new Response("Offline",{status:403});}});
try{
  const gateRejected=await runtime.dispatchFetch('https://offline.invalid/v1/device/status');
  assert.equal(gateRejected.status,503);assert.equal(gateRejected.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await gateRejected.json(),{error:'PAIR_UNAVAILABLE'});
  const db=await runtime.getD1Database("DB"),[device,session,broadcast,worker,hardware,boot]=Array.from({length:6},randomUUID),owner="offline-hot-path-owner",token="z".repeat(43),now=Date.now();
  const schema=readdirSync("drizzle").filter(name=>name.endsWith(".sql")).sort().flatMap(name=>readFileSync(join("drizzle",name),"utf8").split("--> statement-breakpoint").map(sql=>sql.trim()).filter(Boolean));
  await db.batch(schema.map(sql=>db.prepare(sql)));
  await db.batch([
    db.prepare("INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,confirmed_at,created_at,current_session,lease_epoch,worker_id,worker_expires) VALUES(?,?,'Offline fixture',?,?,?,?,?,7,?,?)").bind(device,owner,sha(token),now+90000,now,now,session,worker,now+90000),
    db.prepare("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,control_epoch,mouse_enabled,ui_blocked,control_protocol,mode) VALUES(?,?,?,?,?,?,'active','active',?,1,0,0,'share.v1','broadcast')").bind(session,owner,device,broadcast,randomUUID(),"offline",now),
    db.prepare("INSERT INTO sb_share_control(owner_id,device_id,broadcast_id,control_protocol) VALUES(?,?,?,'share.v1')").bind(owner,device,broadcast),
    db.prepare("INSERT INTO sb_hardware(device_id,owner_id,hardware_id,board_boot_id,metadata,usb_connected) VALUES(?,?,?,?,?,1)").bind(device,owner,hardware,boot,JSON.stringify({capabilities:{"hid.mouse.absolute":true,"hid.mouse.click":true,"sayso.action_geometry.v1":true,"hid.mouse.scroll":true,"hid.mouse.drag_absolute":true,"hid.mouse.drag_absolute.v2":true,"sayso.drag_at":true,
      "sayso.focused_text":true,"sayso.focused_text.no_visual.v1":true,"hid.keyboard.ascii_stable":true,
      "sayso.focused_text_clear_before_input":true,"hid.keyboard.ascii_clear_stable":true,"sayso.cancel_current.v1":true,
      "hid.keyboard.system_search":true,"sayso.system_search":true,"sayso.system_search.scope_only.v1":true}})),
  ]);
  const scope={bridge_session_id:session,broadcast_id:broadcast,worker_id:worker,lease_epoch:7};
  const post=(path,body,headers={})=>runtime.dispatchFetch("http://localhost"+path,{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const grant=await post("/v1/device/mouse/grant",{...scope,control_protocol:"share.v1",intent_seq:1,expected_control_epoch:1,
    request_id:randomUUID(),control_enabled:true,hardware_id:hardware,board_boot_id:boot},{Authorization:"Bearer "+token});
  assert.equal(grant.status,200);assert.equal((await grant.json()).control_epoch,2);
  assert.equal((await db.prepare("SELECT intent_seq FROM sb_share_control WHERE device_id=?").bind(device).first()).intent_seq,1);
  // Warm G independently; it remains an outer, separately counted guard.
  const initialized=await post("/mcp",{jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2026-07-28"}},{"oai-authenticated-user-id":owner});
  assert.equal(initialized.status,200);
  const probeResponse=await post("/v1/device/clock-probes",{frame_permit_scope:scope},{Authorization:"Bearer "+token});
  assert.equal(probeResponse.status,200);const probe=await probeResponse.json();assert.equal(typeof probe.frame_upload_permit,"string");
  const bytes=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,150)},70).data;
  const metadata={...scope,frame_id:randomUUID(),frame_seq:1,source_seq:1,captured_at:probe.server_time,capture_age_ms:0,capture_mono_ms:10000,
    width:16,height:32,native_width_px:16,native_height_px:32,orientation:"portrait",orientation_epoch:0,content_rect:{x:0,y:0,width:16,height:32},transform_version:"1",
    provenance:"device_capture",sampling_reason:"initial",content_sha256:sha(bytes),capture_clock_verified:true,clock_probe_id:probe.clock_probe_id,capture_offset_ms:0,clock_rtt_ms:10};
  const headers={Authorization:"Bearer "+token,"Content-Type":"image/jpeg","Content-Length":String(bytes.length),[framePermitHeader]:probe.frame_upload_permit,"X-Frame-Geometry":JSON.stringify(metadata)};
  for(const [key,name] of Object.entries(frameHeaders))if(metadata[key]!=null)headers[name]=String(metadata[key]);
  const upload=await runtime.dispatchFetch("http://localhost/v1/device/frame",{method:"POST",headers,body:bytes});
  assert.equal(upload.status,200);assert.equal((await upload.json()).accepted_frame_id,metadata.frame_id);
  const read=await post("/mcp",{jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"read_screen",arguments:{device_id:device,wait_for_new_ms:0}}},{"oai-authenticated-user-id":owner,"MCP-Protocol-Version":"2026-07-28"});
  assert.equal(read.status,200);const result=(await read.json()).result,images=result.content.filter(block=>block.type==="image");
  assert.equal(images.length,1);assert.equal(images[0].data,Buffer.from(bytes).toString("base64"));assert.equal(result.structuredContent.image_handoff.source_frame_id,metadata.frame_id);
  assert.match(read.headers.get("Server-Timing"),/sb_d1;dur=[^;]+;desc="sum of 2 calls"/);
  assert.deepEqual(result.content.map(b=>b.type),["text","image"]);
  assert.deepEqual(Object.keys(result.structuredContent),["image_handoff"]);
  let source=result.structuredContent.image_handoff,seq=1;
  const mcp=async(name,args)=>{
    const response=await post("/mcp",{jsonrpc:"2.0",id:3,method:"tools/call",params:{name,arguments:args}},{"oai-authenticated-user-id":owner,"MCP-Protocol-Version":"2026-07-28"});
    assert.equal(response.status,200);const value=(await response.json()).result;assert.equal(value.isError,false,name+": "+value.structuredContent?.error);return {response,value};
  };
  const raw={...scope,control_epoch:2,raw_dispatch_protocol:"raw_mouse_claim_start.v1",point_protocol:"paired_mouse_point.v1",spotlight_dispatch_protocol:"spotlight_claim_start.v1"};
  // Negotiate the existing paired protocol before the first source-bound click.
  const empty=await post("/v1/device/mouse/commands/claim",raw,{Authorization:"Bearer "+token});assert.equal(empty.status,204);
  for(const name of ["click_at","move_mouse_to","drag_at","scroll_mouse","type_text_in_field","open_system_search"]){
    const args={device_id:device,idempotency_key:randomUUID(),wait_ms:name==="move_mouse_to"?3000:0,...(name==="move_mouse_to"?{}:{observe_after:false}),
      ...(name==="click_at"?{source_frame_id:source.source_frame_id,x:7,y:15,image_width:16,image_height:32,orientation_epoch:0}:
      name==="move_mouse_to"?{x:7,y:15,image_width:16,image_height:32,orientation_epoch:0}:
      name==="drag_at"?{source_frame_id:source.source_frame_id,from_x:2,from_y:4,to_x:12,to_y:28,image_width:16,image_height:32,orientation_epoch:0}:
      name==="scroll_mouse"?{steps:1}:name==="type_text_in_field"?{text:"offline fixture",clear_before_input:false}:{})};
    const pending=mcp(name,args);
    const queued=name==="move_mouse_to"?null:(await pending).value.structuredContent;
    let claimResponse; const claimDeadline=Date.now()+5000;
    do {claimResponse=await post("/v1/device/mouse/commands/claim",raw,{Authorization:"Bearer "+token});
      if(claimResponse.status===200)break;assert.equal(claimResponse.status,204,name);await new Promise(r=>setTimeout(r,10));
    }while(Date.now()<claimDeadline);
    assert.equal(claimResponse.status,200,name);
    const grant=await claimResponse.json(),id=grant.command_id,ack=10000+Date.now()-Date.parse(probe.server_time);
    const body={...scope,state:"board_acked",input_submitted:true,error:null,finished_client_mono_ms:ack,mouse_mode_confirmed:true,restored_mouse_boot_id:boot,
      board_receipt:{command_id:id,board_boot_id:boot,state:"executed",subcommand_index:0,error:null,started_uptime_ms:1000,finished_uptime_ms:1350,
        effect:{hid_reports_sent:true,...(name==="drag_at"?{}:{all_released:true,ascii_stable:true,system_search_stable:true}),
          ...(["click_at","move_mouse_to"].includes(name)?{absolute_requested_x:grant.payload.x,absolute_requested_y:grant.payload.y}:{})}},
      ...(name==="click_at"?{point_result:{protocol:"paired_mouse_point.v1",click:{state:"board_acked",input_submitted:true,error:null,finished_client_mono_ms:ack,
        board_receipt:{command_id:grant.paired_click_command.command_id,board_boot_id:boot,state:"executed",effect:{hid_reports_sent:true}}}}}:{})};
    const receipt=await post(`/v1/device/mouse/commands/${id}/result`,body,{Authorization:"Bearer "+token,...(grant.point_receipt_proof?{"X-SaySo-Point-Receipt-Proof":grant.point_receipt_proof}:{})});assert.equal(receipt.status,200,name+" receipt");
    const duplicate=await post("/v1/device/mouse/commands/claim",raw,{Authorization:"Bearer "+token});assert.equal(duplicate.status,204,name+" duplicate");
    await new Promise(resolve=>setTimeout(resolve,360));
    const elapsed=Date.now()-Date.parse(probe.server_time),next={...metadata,frame_id:randomUUID(),frame_seq:++seq,source_seq:seq,captured_at:new Date().toISOString(),capture_mono_ms:10000+elapsed,capture_offset_ms:elapsed};
    const nextHeaders={...headers,"X-Frame-Geometry":JSON.stringify(next)};
    for(const [key,header] of Object.entries(frameHeaders))if(next[key]!=null)nextHeaders[header]=String(next[key]);
    const uploaded=await runtime.dispatchFetch("http://localhost/v1/device/frame",{method:"POST",headers:nextHeaders,body:bytes});assert.equal(uploaded.status,200,name+" upload "+(uploaded.status===200?"":JSON.stringify(await uploaded.json())));
    const observed=name==="move_mouse_to"?(await pending).value:(await mcp("get_mouse_result",{command_id:queued.command_id,include_after_screen:true})).value;
    assert.equal(observed.content.filter(block=>block.type==="image").length,1,name+" after image "+JSON.stringify(observed.structuredContent));
    assert.equal(observed.structuredContent.image_handoff.source_frame_id,next.frame_id,name+" exact frame");
    assert.deepEqual(observed.content.map(b=>b.type),["text","image"]);
    assert.equal(observed.structuredContent.after_screen.metadata,undefined);
    assert.equal(observed.structuredContent.state,"board_acked");
    assert.equal(observed.structuredContent.app_effect_observed,false);
    source=observed.structuredContent.image_handoff;
  }
  const claimNext=async()=>{
    const deadline=Date.now()+6000;
    while(Date.now()<deadline){const r=await post("/v1/device/mouse/commands/claim",raw,{Authorization:"Bearer "+token});
      if(r.status===200)return r.json();assert.equal(r.status,204);await new Promise(resolve=>setTimeout(resolve,20));}
    throw Error("Offline composite command missing");
  };
  const acknowledge=async grant=>{
    const ack=10000+Date.now()-Date.parse(probe.server_time);
    const r=await post(`/v1/device/mouse/commands/${grant.command_id}/result`,{...scope,state:"board_acked",input_submitted:true,error:null,
      finished_client_mono_ms:ack,mouse_mode_confirmed:true,restored_mouse_boot_id:boot,
      board_receipt:{command_id:grant.command_id,board_boot_id:boot,state:"executed",subcommand_index:0,error:null,started_uptime_ms:1000,finished_uptime_ms:1350,
        effect:{hid_reports_sent:true,all_released:true,ascii_stable:true,system_search_stable:true,...(grant.kind==="keyboard.type_text"?{clear_before_input:true}: {})}}},{Authorization:"Bearer "+token});
    assert.equal(r.status,200,"composite receipt");
  };
  const nextImage=async()=>{
    await new Promise(resolve=>setTimeout(resolve,360));
    const elapsed=Date.now()-Date.parse(probe.server_time),next={...metadata,frame_id:randomUUID(),frame_seq:++seq,source_seq:seq,captured_at:new Date().toISOString(),capture_mono_ms:10000+elapsed,capture_offset_ms:elapsed};
    const h={...headers,"X-Frame-Geometry":JSON.stringify(next)};for(const [key,name]of Object.entries(frameHeaders))if(next[key]!=null)h[name]=String(next[key]);
    assert.equal((await runtime.dispatchFetch("http://localhost/v1/device/frame",{method:"POST",headers:h,body:bytes})).status,200);return next;
  };
  const compositeArgs={device_id:device,app_name:"Maps",idempotency_key:randomUUID()};
  const combined=mcp("open_app_search",compositeArgs);
  const shortcut=await claimNext();assert.equal(shortcut.kind,"keyboard.open_search");await acknowledge(shortcut);await nextImage();
  const typed=await claimNext();assert.equal(typed.kind,"keyboard.type_text");assert.equal(typed.payload.text,"Maps");
  assert.equal(typed.payload.submit_enter,undefined);await acknowledge(typed);const last=await nextImage();
  const completed=(await combined).value;
  assert.equal(completed.structuredContent.code,"NEEDS_TARGET_REVIEW");assert.equal(completed.structuredContent.enter_sent,false);
  assert.equal(completed.structuredContent.search_command_id,shortcut.command_id);assert.equal(completed.structuredContent.type_command_id,typed.command_id);
  assert.equal(completed.structuredContent.image_handoff.source_frame_id,last.frame_id);assert.equal(completed.content.filter(b=>b.type==="image").length,1);
  assert.deepEqual(completed.content.map(b=>b.type),["text","image"]);assert.ok(completed.content[0].text.length<180);
  assert.equal(completed.structuredContent.after_screen.metadata,undefined);
  await mcp("open_app_search",compositeArgs);assert.equal((await post("/v1/device/mouse/commands/claim",raw,{Authorization:"Bearer "+token})).status,204);
  // Stop between the search receipt and the input admission; the old parent can never resume.
  const cancelled=mcp("open_app_search",{...compositeArgs,idempotency_key:randomUUID()});
  const interrupted=await claimNext();assert.equal(interrupted.kind,"keyboard.open_search");await acknowledge(interrupted);
  await mcp("cancel_current_operation",{device_id:device});const cancelledFrame=await nextImage();
  const stopped=(await cancelled).value;assert.equal(stopped.structuredContent.code,"STOPPED");
  assert.equal(stopped.content.filter(b=>b.type==="image").length,1,"Stop retains the last qualified observation");
  assert.equal(stopped.structuredContent.after_screen.metadata.frame_id,cancelledFrame.frame_id);
  assert.equal(stopped.structuredContent.image_observation,"before_unconfirmed_step");assert.equal(stopped.structuredContent.image_handoff,undefined);
  assert.equal(stopped.structuredContent.verification,"not_confirmed");assert.equal(stopped.structuredContent.board_receipt,undefined);
  assert.equal((await post("/v1/device/mouse/commands/claim",raw,{Authorization:"Bearer "+token})).status,204);
  // Each call persists independently after release, without another tool call.
  await new Promise(resolve=>setTimeout(resolve,100));
  const alias=await mcp("stop_mouse",{device_id:device});
  assert.equal(alias.value.structuredContent.screen_sharing_stopped,false);
  assert.equal((await mcp("get_mouse_state",{device_id:device})).value.structuredContent.enabled,true);
  const phoneStop=await post("/v1/device/mouse/grant",{...scope,control_enabled:false,expected_control_epoch:2,intent_seq:2},{Authorization:"Bearer "+token});
  assert.equal(phoneStop.status,200);assert.equal((await phoneStop.json()).scope_matched,true);
  const state=await mcp("get_mouse_state",{device_id:device});
  assert.equal(state.value.structuredContent.enabled,false);assert.equal(state.value.structuredContent.broadcast_id,broadcast);
  const retained=(await db.prepare("SELECT data_json FROM sb_timing_journal WHERE record_key LIKE 'minimal:%'").all()).results.map(row=>JSON.parse(row.data_json));
  const calls=retained.filter(row=>row.record_kind==="complete_call"),companions=retained.filter(row=>row.record_kind==="command_companion");
  assert.ok(companions.length>0);assert.ok(companions.every(row=>row.command_id&&row.device_id===device&&row.session_id===session&&row.enqueued_utc_ms!=null));
  assert.ok(calls.length>=10,"production minimal calls are retained");
  assert.ok(calls.some(row=>row.tool==="read_screen"&&row.image_count===1&&row.image_bytes===bytes.length));
  assert.ok(calls.some(row=>row.tool==="open_app_search"&&row.result_code==="STOPPED"),"Unadmitted preallocated steps still produce a minimal call record");
  for(const call of calls){assert.ok(call.released_utc_ms>=call.received_utc_ms);assert.ok(call.released_mono_ms>=call.started_mono_ms);assert.equal(typeof call.text_utf8_bytes,"number");}
  assert.doesNotMatch(JSON.stringify(calls),/Maps|QUJD|source_point_proof|payload|Bearer/);
  const phone=async (route,body)=>{
    const response=await post("/v1/device/"+route,body,{Authorization:"Bearer "+token});
    assert.ok(response.ok,route+" "+response.status);
    return response.json();
  };
  const legacyBroadcast=randomUUID(),legacyWorker=randomUUID();
  const legacySession=await phone("sessions",{mode:"broadcast",control_enabled:false,broadcast_id:legacyBroadcast,request_id:randomUUID()});
  const legacyIdentity={bridge_session_id:legacySession.bridge_session_id,broadcast_id:legacyBroadcast,worker_id:legacyWorker};
  const lease=await phone("worker/claim",{...legacyIdentity,worker_kind:"broadcast"});
  const legacyScope={...legacyIdentity,lease_epoch:lease.lease_epoch};
  const beat={...legacyScope,capture_state:"active",usb_connected:true,board_boot_id:boot,mouse_relay_enabled:true};
  assert.equal((await phone("worker/heartbeat",beat)).directive,"all_release");
  const manual=await phone("mouse/grant",{bridge_session_id:legacyIdentity.bridge_session_id,control_enabled:true,request_id:randomUUID()});
  assert.equal(manual.enabled,true);assert.ok(manual.grant_remaining_ms>590_000 && manual.grant_remaining_ms<=600_000);
  const renewal=await phone("mouse/grant",{...legacyScope,control_enabled:true,automatic_connected:true,renewal:true,expected_control_epoch:manual.control_epoch,
    hardware_id:hardware,board_boot_id:boot,request_id:randomUUID()});
  assert.equal(renewal.control_epoch,manual.control_epoch);assert.equal((await phone("worker/heartbeat",beat)).directive,"continue");
  assert.equal((await phone("mouse/grant",{bridge_session_id:legacyIdentity.bridge_session_id,control_enabled:false,expected_control_epoch:manual.control_epoch})).scope_matched,true);
  assert.equal((await phone("worker/heartbeat",beat)).directive,"all_release");
  await db.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").bind(device).run();
  const revoked=await post("/v1/device/clock-probes",{frame_permit_scope:scope},{Authorization:"Bearer "+token});assert.equal(revoked.status,401);
  assert.equal(outbound,0);
  console.log("Production Worker offline smoke passed: 2-call read, six primitive action chains, composite search/type with no Return, exact final image, read-only replay, mid-step cancel, hidden stop alias, phone stop, legacy grant and renewal, production minimal calls, revoked token; outbound=0.");
}finally{await runtime.dispose();}
