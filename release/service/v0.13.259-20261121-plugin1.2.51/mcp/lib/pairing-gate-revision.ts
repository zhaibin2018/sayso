import {hash} from './bridge-engine.ts';

// Optimized frame/claim routes perform atomic authentication without calling
// authenticate(). Persist revocation before those paths at least every 240 s.
export function gateRevisionGuard() {
  let checked:string|undefined,next=0,inFlight:Promise<void>|undefined;
  return async(env:{DB?:D1Database;SAYSO_SITE_GATE_TOKEN?:string},now=Date.now())=>{
    if(!env.DB)return;
    const digest=await hash(env.SAYSO_SITE_GATE_TOKEN??'missing-gate');
    if(checked===digest&&now<next)return;
    if(inFlight){await inFlight;if(checked===digest&&now<next)return;}
    const db=env.DB;
    inFlight=(async()=>{
      await db.prepare('UPDATE sb_devices SET revoked=1 WHERE revoked=0 AND pairing_gate_hash IS NOT NULL AND pairing_gate_hash<>?').bind(digest).run();
      checked=digest;next=now+240_000;
    })();
    try {await inFlight;}finally{inFlight=undefined;}
  };
}
