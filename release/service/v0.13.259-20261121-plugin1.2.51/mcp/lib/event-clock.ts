/** Wire-only codec. Existing DB comparison columns are private compatibility
 * coordinates, interpreted exclusively inside one immutable authenticated scope.
 * No private phone origin is known by this service. UTC/ESP/intervals are opaque. */
export const eventClockVersion = "broadcast_elapsed_ms.v1";
export type EventClock = {version:typeof eventClockVersion;device_id:string;bridge_session_id:string;broadcast_id:string;worker_id:string;clock_domain_id:string};
const ids=["device_id","bridge_session_id","broadcast_id","worker_id","clock_domain_id"] as const;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const integer=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
export function readEventClock(value:unknown):EventClock {
  if(!object(value)||Object.keys(value).length!==6||value.version!==eventClockVersion||ids.some(k=>typeof value[k]!=="string"||!uuid.test(value[k] as string)))throw new Error("EVENT_CLOCK_SCOPE");
  return value as EventClock;
}
export function clockJSON(clock:EventClock) {return JSON.stringify(Object.fromEntries(["version",...ids].map(k=>[k,clock[k as keyof EventClock]])));}
export const clockFields:Record<string,string>={capture_mono_ms:"capture_elapsed_lower_ms",finished_client_mono_ms:"input_finished_elapsed_upper_ms",
  refresh_received_mono_ms:"refresh_received_elapsed_upper_ms",presentation_mono_ms:"presentation_elapsed_lower_ms",source_capture_mono_ms:"source_capture_elapsed_lower_ms",
  capture_lower_phone_mono_ms:"capture_elapsed_lower_ms",phone_ack_mono_ms:"input_finished_elapsed_upper_ms",captureMono:"capture_elapsed_lower_ms",moveAck:"move_finished_elapsed_upper_ms",move_ack_phone_mono_ms:"move_ack_elapsed_upper_ms"};
const inbound:Record<string,string>={capture_elapsed_lower_ms:"capture_mono_ms",input_finished_elapsed_upper_ms:"finished_client_mono_ms",
  refresh_received_elapsed_upper_ms:"refresh_received_mono_ms",presentation_elapsed_lower_ms:"presentation_mono_ms",source_capture_elapsed_lower_ms:"source_capture_mono_ms",move_ack_elapsed_upper_ms:"move_ack_phone_mono_ms"};
const omitted=new Set(["source_pts_ms","callback_mono_ms","client_timing"]);
function walk(value:unknown,clock:EventClock,decode:boolean,proof:boolean):unknown {
  if(Array.isArray(value))return value.map(v=>walk(v,clock,decode,proof));
  if(!object(value))return value;
  const result:Record<string,unknown>={};
  for(const [key,v] of Object.entries(value)){
    if(key==="board_receipt"||key==="receipts"){result[key]=v;continue;}
    if(key==="event_clock"){
      if(clockJSON(readEventClock(v))!==clockJSON(clock))throw new Error("EVENT_CLOCK_SCOPE_CHANGED");
      result[key]=clock;continue;
    }
    if(decode&&Object.hasOwn(clockFields,key))throw new Error("EVENT_CLOCK_MIXED_FIELDS");
    if(!decode&&omitted.has(key))continue;
    let target=decode?(inbound[key]??key):(clockFields[key]??key);
    if(proof&&decode){if(key==="capture_elapsed_lower_ms")target="captureMono";if(key==="move_finished_elapsed_upper_ms")target="moveAck";}
    if(target!==key){
      if(v!==null&&!integer(v))throw new Error("EVENT_CLOCK_NUMBER");
      result[target]=v;
    }else if((decode&&key==="capture_from_probe_lower_ms")||(!decode&&key==="capture_offset_ms")){
      if(typeof v!=="number"||!Number.isSafeInteger(v))throw new Error("EVENT_CLOCK_INTERVAL");
      result[decode?"capture_offset_ms":"capture_from_probe_lower_ms"]=v;
    }else if(key==="phone_clock")result[key]=eventClockVersion;
    else {
      if(/mono|uptime|_pts/i.test(key))throw new Error("EVENT_CLOCK_UNREVIEWED_COORDINATE");
      result[key]=walk(v,clock,decode,proof);
    }
  }
  return result;
}
const originalWireBodies=new WeakMap<object,string>();
export function rememberWireBody(body:Record<string,unknown>,bytes:Uint8Array){originalWireBodies.set(body,new TextDecoder().decode(bytes));}
export function resultDigestBytes(body:Record<string,unknown>){return originalWireBodies.get(body)??JSON.stringify(body);}
export function publicEventResult<T>(value:T):T {
  if(!object(value))return value;
  const find=(v:unknown):EventClock|null=>{
    if(!object(v))return null;
    if(v.event_clock!=null)return readEventClock(v.event_clock);
    for(const item of Object.values(v)){if(object(item)){const found=find(item);if(found)return found;}}
    return null;
  };
  const clock=find(value);return clock?encodeEventBody(value,clock):value;
}
export function decodeEventBody(value:Record<string,unknown>,clock:EventClock):Record<string,unknown> {
  const result=walk(value,clock,true,false) as Record<string,unknown>;
  result.event_clock=clock;return result;
}
export function encodeEventBody<T>(value:T,clock:EventClock):T {
  const result=walk(value,clock,false,false) as Record<string,unknown>;
  if(object(result))result.event_clock=clock;
  return result as T;
}
export function encodeClockProof<T>(value:T):T {
  if(!object(value)||value.event_clock==null)return value;
  return walk(value,readEventClock(value.event_clock),false,true) as T;
}
export function decodeClockProof(value:unknown):unknown {
  if(!object(value)||value.event_clock==null)return value;
  return walk(value,readEventClock(value.event_clock),true,true);
}
