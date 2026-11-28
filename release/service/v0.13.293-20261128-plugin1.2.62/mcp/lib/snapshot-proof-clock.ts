import {snapshotClock} from "./hot-path-context.ts";
import type {BridgeEngine} from "./bridge-engine.ts";
import type {EventClock} from "./event-clock.ts";
export async function snapshotProofClock<T extends {session:string}>(e:BridgeEngine,view:T):Promise<T> {
    if(snapshotClock in view){const clock=(view as T&{[snapshotClock]:string|null})[snapshotClock];return clock?{...view,event_clock:JSON.parse(clock) as EventClock}:view;}
    const row=await e.stmt("SELECT event_clock FROM sb_sessions WHERE id=?",view.session).first<{event_clock:string|null}>();
    return row?.event_clock ? {...view,event_clock:JSON.parse(row.event_clock) as EventClock} : view;
}
