import {workerFetchStartedUTC} from "./bridge-context.ts";
import {extendedRawClaimTTLMS,ordinaryRawClaimTTLMS,reviewedPointTTLProfile} from "./raw-claim-ttl.ts";

const obj=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const uuid=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const number=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>=0;

/** Call only after the existing authenticated claim succeeds. No body/header data is copied. */
export function logAuthorizedPairedGrant(command:unknown,routeStarted:number,replyReady:number,
  log:(value:Record<string,unknown>)=>void=value=>console.info(JSON.stringify(value))) {
  try {
    const c=obj(command),child=obj(c?.paired_click_command);
    const point=obj(obj(c?.precondition)?.point_source);
    const extended=c?.raw_dispatch_ttl_profile===reviewedPointTTLProfile&&point?.protocol===reviewedPointTTLProfile&&
      (point.origin==="linked_text"||point.origin==="typed"||point.origin==="visual_read");
    if(!c||!child||c.state!=="executing"||c.kind!=="pointer.move_absolute"||c.point_protocol!=="paired_mouse_point.v1"||
      c.raw_dispatch_protocol!=="raw_mouse_claim_start.v1"||!uuid(c.command_id)||!uuid(child.command_id)||child.command_id===c.command_id||
      child.state!=="executing"||child.kind!=="pointer.click"||child.predecessor_command_id!==c.command_id||
      !number(c.claim_pregrant_elapsed_ms)||c.claim_pregrant_elapsed_ms>60000||!number(c.ttl_remaining_ms)||
      c.ttl_remaining_ms>(extended?extendedRawClaimTTLMS:ordinaryRawClaimTTLMS)||c.raw_dispatch_ttl_profile!==undefined&&!extended||
      !number(routeStarted)||!number(replyReady))return;
    const entry=workerFetchStartedUTC(),hasEntry=number(entry),ordered=replyReady>=routeStarted&&(!hasEntry||entry<=routeStarted);
    log({event:"paired_grant_route_timing",command_id:c.command_id,route_started_utc_ms:routeStarted,reply_ready_utc_ms:replyReady,
      claim_pregrant_elapsed_ms:c.claim_pregrant_elapsed_ms,ttl_remaining_ms:c.ttl_remaining_ms,
      ...(extended?{raw_dispatch_ttl_profile:reviewedPointTTLProfile}:{}),
      paired_dispatch_probe_attested:uuid(c.paired_dispatch_probe_id)?1:0,worker_entry_available:hasEntry?1:0,clock_ordered:ordered?1:0,
      ...(hasEntry?{worker_fetch_started_utc_ms:entry}:{}),
      ...(ordered?{route_to_reply_ready_ms:replyReady-routeStarted,...(hasEntry?{worker_fetch_to_route_ms:routeStarted-entry}:{} )}:{})});
  }catch{/* Diagnostics must never reject or alter the granted command. */}
}
