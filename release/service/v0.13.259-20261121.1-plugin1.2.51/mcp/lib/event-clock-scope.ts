import {BridgeError,need,record,uuid,type BridgeEngine,type Device} from "./bridge-engine.ts";
import {clockJSON,readEventClock,eventClockVersion,type EventClock} from "./event-clock.ts";

/** A NULL column is the legacy protocol, permanently for that session. */
export async function requireEventClock(engine:BridgeEngine,device:Pick<Device,"id"|"owner_id">,body:Record<string,unknown>):Promise<EventClock|null>{
  const supplied=body.event_clock;
  const session=body.bridge_session_id??(supplied==null?null:record(supplied).bridge_session_id);
  if(session==null){need(supplied==null,"EVENT_CLOCK_SCOPE",422);return null;}
  const row=await engine.stmt("SELECT event_clock FROM sb_sessions WHERE id=? AND device_id=? AND owner_id=?",session,device.id,device.owner_id).first<{event_clock:string|null}>();
  need(row,"STALE_SESSION");
  let clock:EventClock|null=null;
  try {
    if(row.event_clock===null)need(supplied==null,"EVENT_CLOCK_DOWNGRADE",422);
    else {
      clock=readEventClock(supplied);
      need(clockJSON(clock)===row.event_clock&&clock.device_id===device.id&&clock.bridge_session_id===session,"EVENT_CLOCK_SCOPE_CHANGED",422);
      for(const key of ["bridge_session_id","broadcast_id","worker_id"] as const)if(body[key]!=null)need(body[key]===clock[key],"EVENT_CLOCK_SCOPE_CHANGED",422);
    }
    const probe=body.clock_probe_id??(body.repeated_frame==null?null:record(body.repeated_frame).clock_probe_id);
    if(probe!=null){
      const reference=await engine.stmt("SELECT event_clock FROM sb_clock_probes WHERE id=? AND device_id=?",uuid(probe),device.id).first<{event_clock:string|null}>();
      need(reference&&reference.event_clock===(clock?clockJSON(clock):null),"EVENT_CLOCK_PROBE_SCOPE_CHANGED",422);
    }
    return clock;
  }catch(error){if(error instanceof BridgeError)throw error;throw new BridgeError("EVENT_CLOCK_SCOPE_CHANGED",422);}
}
export function sessionClockDeclaration(device:Device,body:Record<string,unknown>,session:string):EventClock|null{
  if(body.event_clock_request==null)return null;
  const declaration=record(body.event_clock_request);
  try{
    need(Object.keys(declaration).length===5&&body.mode==="broadcast","EVENT_CLOCK_DECLARATION",422);
    const clock=readEventClock({...declaration,bridge_session_id:session});
    need(clock.device_id===device.id&&clock.broadcast_id===body.broadcast_id&&clock.version===eventClockVersion,"EVENT_CLOCK_SCOPE_CHANGED",422);
    return clock;
  }catch(error){if(error instanceof BridgeError)throw error;throw new BridgeError("EVENT_CLOCK_DECLARATION",422);}
}
