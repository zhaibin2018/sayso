import {hash} from './bridge-engine.ts';

// Request-local observations only; never retain a request, error or gate value.
export type GateRevisionTrace = {cold_cache:boolean;waiting_in_flight:boolean;cache_hit:boolean};
export const gateRevisionTrace = ():GateRevisionTrace => ({cold_cache:false,waiting_in_flight:false,cache_hit:false});

// Optimized frame/claim routes perform atomic authentication without calling
// authenticate(). Persist revocation before those paths at least every 240 s.
export function gateRevisionGuard() {
  // Only completed successes survive requests. An I/O Promise belongs to its
  // creating request and may never settle after that request ends or is cancelled.
  let checked:string|undefined,next=0;
  return async(env:{DB?:D1Database;SAYSO_SITE_GATE_TOKEN?:string},now=Date.now(),trace?:GateRevisionTrace)=>{
    if(!env.DB)return;
    const digest=await hash(env.SAYSO_SITE_GATE_TOKEN??'missing-gate');
    if(checked===digest&&now<next){if(trace)trace.cache_hit=true;return;}
    const db=env.DB;
    if(trace)trace.cold_cache=true;
    // Concurrent misses deliberately repeat this idempotent revocation check.
    await db.prepare('UPDATE sb_devices SET revoked=1 WHERE revoked=0 AND pairing_gate_hash IS NOT NULL AND pairing_gate_hash<>?').bind(digest).run();
    checked=digest;next=now+240_000;
  };
}
