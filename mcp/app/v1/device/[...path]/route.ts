import { engine, bounded, json, failure } from "../../../../lib/bridge-runtime";
import { record, text, uuid, integer, BridgeError } from "../../../../lib/bridge-engine";
import { LEDControl } from "../../../../lib/led-control";
import { MouseControl, livePointClaimHints, livePointReceiptHints } from "../../../../lib/mouse-control";
import { ScreenText } from "../../../../lib/screen-text";
import { BrowseControl } from "../../../../lib/browse-control";
import { PointerActionControl } from "../../../../lib/pointer-actions";
import { AppSearchControl } from "../../../../lib/app-search-control";
import {logAuthorizedPairedGrant} from "../../../../lib/paired-grant-timing";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const routeStartedUTC=Date.now();
  try {
    const service = engine(), url = new URL(request.url), path = url.pathname.replace(/^\/v1\/device\//, "");
    const readJSON = async (timeoutMS?:number) => record(JSON.parse(new TextDecoder().decode(await bounded(request, 16_384,timeoutMS)) || "{}"));
    const withReadyCue=(meta:Record<string,unknown>,hasJPEG:boolean)=>{
      delete meta.ready_cue_supported;
      delete meta.ready_cue_command_id;
      delete meta.loading_cue_supported;
      delete meta.loading_cue_command_id;
      delete meta.maps_tiles_cue_supported;
      if(request.headers.get("X-SaySo-Ready-Cue-Supported")==="1"){
        meta.ready_cue_supported=true;
        if(request.headers.get("X-SaySo-Maps-Tiles-Cue-Supported")==="1")meta.maps_tiles_cue_supported=true;
        const matched=request.headers.get("X-SaySo-Ready-Cue-Command");
        if(hasJPEG&&matched!==null)meta.ready_cue_command_id=matched;
        if(request.headers.get("X-SaySo-Loading-Cue-Supported")==="1"){
          meta.loading_cue_supported=true;
          const loading=request.headers.get("X-SaySo-Loading-Cue-Command");
          if(hasJPEG&&loading!==null)meta.loading_cue_command_id=loading;
        }
      }
      return meta;
    };
    if (path === "pair" && request.method === "POST") return json(await service.redeem(await readJSON(), request.headers.get("cf-connecting-ip") ?? "site-service"));
    if (path === "screen-text" && request.method === "POST") return json(await new ScreenText(service).acceptRequest(request, record(JSON.parse(new TextDecoder().decode(await bounded(request, 262_144))))));
    if (path === "frame" && request.method === "POST") {
      return json(await service.acceptFrameRequest(request, () => {
      const meta: Record<string, unknown> = {};
      const fields: Record<string, string> = { bridge_session_id: "X-Bridge-Session-ID", broadcast_id: "X-Broadcast-ID", worker_id: "X-Worker-ID", lease_epoch: "X-Lease-Epoch", frame_id: "X-Frame-ID", frame_seq: "X-Frame-Seq", captured_at: "X-Captured-At", capture_age_ms: "X-Capture-Age-Ms", capture_mono_ms: "X-Capture-Mono-Ms", width: "X-Width", height: "X-Height", native_width_px: "X-Native-Width", native_height_px: "X-Native-Height", orientation: "X-Orientation", orientation_epoch: "X-Orientation-Epoch", content_sha256: "X-Content-SHA256", after_command_id: "X-After-Command-ID", refresh_request_id: "X-Refresh-Request-ID", refresh_received_mono_ms: "X-Refresh-Received-Mono-Ms", clock_probe_id: "X-Clock-Probe-ID", capture_offset_ms: "X-Capture-Offset-Ms", clock_rtt_ms: "X-Clock-Rtt-Ms", provenance: "X-Frame-Provenance" };
      const numeric = new Set("lease_epoch frame_seq capture_age_ms capture_mono_ms width height native_width_px native_height_px orientation_epoch refresh_received_mono_ms capture_offset_ms clock_rtt_ms".split(" "));
      for (const [key, header] of Object.entries(fields)) { const value = request.headers.get(header); if (value != null) meta[key] = numeric.has(key) ? Number(value) : value; }
      const geometry = request.headers.get("X-Frame-Geometry"); if (geometry) Object.assign(meta, record(JSON.parse(geometry)));
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("image/jpeg")) throw new BridgeError("JPEG_REQUIRED", 415);
      return withReadyCue(meta,true);
      }, limit => bounded(request, limit ?? 1024 * 1024)));
    }
    if (path === "frame-observation" && request.method === "POST") return json(await service.acceptObservationRequest(request,async()=>withReadyCue(await readJSON(1500),false)));
    if (path === "mouse/commands/claim" && request.method === "POST") {
      const command=await new MouseControl(service,{claimHints:livePointClaimHints,receiptHints:livePointReceiptHints}).claimRequest(request,async()=>({body:await readJSON(1500),
        waitMS:integer(Number(url.searchParams.get("wait_ms")??0),0,10_000)}));
      logAuthorizedPairedGrant(command,routeStartedUTC,Date.now());
      return command?json(command):new Response(null,{status:204});
    }
    const mouseResult=path.match(/^mouse\/commands\/([0-9a-f-]+)\/result$/i);
    if(mouseResult&&request.method==="POST")return json(await new MouseControl(service,{receiptHints:livePointReceiptHints}).resultRequest(request,mouseResult[1],async()=>{
      const body=await readJSON();
      integer(Number(url.searchParams.get("wait_ms")??0),0,10_000);
      return body;
    }));
    const device = await service.authenticate(request);
    if (request.method === "GET" && path === "status") return json(await service.status(device));
    if (request.method === "GET" && path === "requests") {
      const rows = await service.stmt("SELECT id AS request_id,message,state FROM sb_manual_requests WHERE device_id=? AND owner_id=? AND expires_at>?", device.id, device.owner_id, service.now()).all();
      return json(rows.results);
    }
    if (request.method !== "POST") throw new BridgeError("NOT_FOUND", 404);
    const searchPreparationResult=path.match(/^app-search-preparations\/([0-9a-f-]+)\/result$/i);
    if(searchPreparationResult)return json(await new AppSearchControl(service).result(device,searchPreparationResult[1],await readJSON()));
    if(path.startsWith("pointer-actions/")) {
      const pointer=new PointerActionControl(service),body=record(JSON.parse(new TextDecoder().decode(await bounded(request,262_144))));
      if(path==="pointer-actions/ready")return json(await pointer.ready(device,body));
      const result=path.match(/^pointer-actions\/([0-9a-f-]+)\/result$/i);
      if(result)return json(await pointer.result(device,result[1],body));
      throw new BridgeError("NOT_FOUND",404);
    }
    if (path.startsWith("browse/")) {
      const browse = new BrowseControl(service);
      const body = record(JSON.parse(new TextDecoder().decode(await bounded(request, path === "browse/calibration" ? 65_536 : ["browse/checkpoint","browse/image"].includes(path) ? 524_288 : 262_144))));
      if (path === "browse/calibration") return json(await browse.calibrate(device,body));
      if (path === "browse/ready") return json(await browse.ready(device,body));
      if (path === "browse/active") { const run=await browse.active(device,body);return run?json(run):new Response(null,{status:204}); }
      if (path === "browse/take") return json(await browse.take(device,body));
      if (path === "browse/input") return json(await browse.input(device,body));
      if (path === "browse/observe") return json(await browse.observe(device,body));
      if (path === "browse/checkpoint") return json(await browse.checkpoint(device,body));
      if (path === "browse/image") return json(await browse.image(device,body));
      if (path === "browse/halt") return json(await browse.halt(device,body));
      throw new BridgeError("NOT_FOUND",404);
    }
    const body = await readJSON(), leds = new LEDControl(service);
    const mouse = new MouseControl(service);
    const wait = integer(Number(url.searchParams.get("wait_ms") ?? 0), 0, 10_000);
    if (path === "mouse/grant") return json(await mouse.grant(device, body));
    const mouseStart = path.match(/^mouse\/commands\/([0-9a-f-]+)\/start$/i);
    if (mouseStart) return json(await mouse.start(device,mouseStart[1],body));
    if (path === "hardware/bind") return json(await leds.bind(device, body));
    if (path === "sessions") return json(body.mode === "foreground_diagnostic" ? await leds.createSession(device, body) : await service.createSession(device, body));
    if (path === "worker/claim") return json(await service.claimWorker(device, body));
    if (path === "worker/heartbeat") {
      const session = await service.session(device, body);
      return json(session.mode === "foreground_diagnostic" ? await leds.heartbeat(device, body) : await service.heartbeat(device, body));
    }
    if (path === "clock-probes") return json(await service.clockProbe(device, body.frame_permit_scope));
    if (path === "capture-requests/claim") { const refresh = await service.claimRefresh(device, body, wait); return refresh ? json(refresh) : new Response(null, { status: 204 }); }
    const result = path.match(/^capture-requests\/([0-9a-f-]+)\/result$/i);
    if (result) {
      const session = await service.session(device, body);
      await service.stmt("UPDATE sb_refreshes SET state='failed',error=? WHERE id=? AND device_id=? AND session_id=? AND worker_id=? AND lease_epoch=? AND state='claimed'", text(body.error, 80), uuid(result[1]), device.id, session.id, uuid(body.worker_id), integer(body.lease_epoch, 1)).run();
      return json({ accepted: true });
    }
    const stopping = path.match(/^sessions\/([0-9a-f-]+)\/stop$/i);
    if (stopping) return json(await service.stop(device, uuid(stopping[1]), body.reason === "USER_STOPPED", body.reason == null ? "phone_stop" : text(body.reason, 300)));
    if (path === "state") {
      const session = await service.session(device, body, false);
      if (body.capture_state === "stopped") return json(await service.stop(device, session.id, true));
      if (body.capture_state !== "active" && body.capture_state !== "paused") throw new BridgeError("INVALID_CAPTURE_STATE", 422);
      await service.stmt("UPDATE sb_sessions SET capture_state=? WHERE id=? AND state='active'", body.capture_state, session.id).run();
      return json({ accepted: true, control_enabled: false });
    }
    if (path === "unpair") return json(await service.revoke({ id: device.owner_id, label: "" }, device.id));
    if (path === "push-token") return json({ notification_status: "not_configured" });
    if (path.startsWith("requests/") && path.endsWith("/ack")) {
      if (!["seen", "ready", "declined"].includes(String(body.state))) throw new BridgeError("INVALID_STATE", 422);
      await service.stmt("UPDATE sb_manual_requests SET state=? WHERE id=? AND device_id=? AND owner_id=?", body.state, uuid(path.split("/")[1]), device.id, device.owner_id).run();
      return json({ accepted: true });
    }
    if (path === "commands/claim") {
      const command = await leds.claim(device, body, wait);
      return command ? json(command) : new Response(null, { status: 204 });
    }
    const commandAction = path.match(/^commands\/([0-9a-f-]+)\/(start|result)$/i);
    if (commandAction) return json(commandAction[2] === "start" ? await leds.start(device, commandAction[1], body) : await leds.result(device, commandAction[1], body));
    throw new BridgeError("VIEW_ONLY_ENDPOINT_UNAVAILABLE", 403);
  } catch (error) { return failure(error); }
}
export const GET = handle;
export const POST = handle;
