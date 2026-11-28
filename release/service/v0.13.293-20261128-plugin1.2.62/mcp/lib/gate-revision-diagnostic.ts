import {classifyFrameException} from './frame-error-classification.ts';
import type {GateRevisionTrace} from './pairing-gate-revision.ts';

// Only literal route names leave this module. Paths can contain pairing tokens
// or arbitrary user text; neither those paths nor their query strings are safe.
const routes=new Set([
  '/','/pair','/mcp','/mcp/development','/health','/api/pair/install','/api/pair/redeem',
  ...('frame frame-observation status clock-probes worker/heartbeat worker/grant '+
    'mouse/commands/claim mouse/commands/start mouse/commands/result mouse/commands/renew '+
    'led/commands/claim led/commands/start led/commands/result').split(' ').map(p=>'/v1/device/'+p),
]);
const methods=new Set(['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']);

/** Called only by the top-level gate catch. No database work or raw exceptions. */
export function logGateRevisionFailure(request:Request,error:unknown,trace:GateRevisionTrace,startedMono:number){
  try{
    const path=new URL(request.url).pathname,ray=request.headers.get('cf-ray');
    const classified=classifyFrameException(error,trace.cold_cache||trace.waiting_in_flight?'AUTH_SNAPSHOT':'RETURN');
    console.error(JSON.stringify({
      stage:'GATE_REVISION',
      route:routes.has(path)?path:'/OTHER',
      method:methods.has(request.method)?request.method:'OTHER',
      request_id:ray&&/^[0-9a-f]{16}(?:-[A-Z]{3})?$/.test(ray)?ray:crypto.randomUUID(),
      exception:classified.exception,
      ...(classified.reason?{reason:classified.reason}:{}),
      elapsed_ms:Math.max(0,Math.round(performance.now()-startedMono)),
      cold_cache:trace.cold_cache,
      waiting_in_flight:trace.waiting_in_flight,
      cache_hit:trace.cache_hit,
    }));
  }catch{/* A malformed exception or a failed logger must preserve the 503. */}
}
