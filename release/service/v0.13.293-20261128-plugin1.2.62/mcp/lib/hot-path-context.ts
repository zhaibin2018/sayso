import {AsyncLocalStorage} from "node:async_hooks";
import {frameStage,logFrameFailure,frameTransactionPhase} from "./frame-error-classification.ts";
import {BridgeError,deviceTokenHash,type BridgeEngine,type User} from "./bridge-engine.ts";
import {clockJSON,readEventClock,type EventClock} from "./event-clock.ts";
import {databaseNowSQL} from "./screen-snapshot-query.ts";
import {takeMinimalCalls,minimalCallQueueStatus} from "./minimal-call-journal.ts";

type Atomic={token:string;body:Record<string,unknown>;clock:EventClock|null};
type Context={active:boolean;atomic?:Atomic;deferActivity?:boolean;pending:D1PreparedStatement[];pendingDB?:D1Database;ledger?:D1PreparedStatement[];stageLedger?:boolean;ledgerCommitted?:boolean};
const current=new AsyncLocalStorage<Context>();
const originals=new WeakMap<D1PreparedStatement,D1PreparedStatement>();
export const snapshotClock=Symbol("snapshot_event_clock");
const errors=new Set(["UNAUTHENTICATED","STALE_SESSION","EVENT_CLOCK_DOWNGRADE","EVENT_CLOCK_SCOPE_CHANGED","EVENT_CLOCK_PROBE_SCOPE_CHANGED","STATIC_RELEASE_CHANGED"]);

/** SQLite CASE evaluates only its selected arm. A failed assertion raises a
 * runtime JSON-path error: D1 rolls back the WHOLE batch, including its writes.
 * The fixed code is public; no request data is put in an error string. */
export function sqlAssertion(db:D1Database,predicate:string,values:unknown[],code:string){
  if(!errors.has(code))throw new Error("Unknown SQL assertion");
  return db.prepare(`SELECT CASE WHEN (${predicate}) THEN 1 ELSE json_extract('[]','$[SAYSO_${code}') END AS valid`).bind(...values);
}
export function atomicState(){const c=current.getStore();return c?.active?c.atomic:undefined;}
export function setAtomicBody(body:Record<string,unknown>){
  const a=atomicState();if(!a)return null;a.body=body;
  try {a.clock=body.event_clock==null?null:readEventClock(body.event_clock);return a.clock;}
  catch {throw new BridgeError("EVENT_CLOCK_SCOPE_CHANGED",422);}
}
export function atomicPrefix(db:D1Database){
  const a=atomicState();if(!a)return [];
  const auth=`SELECT id,owner_id FROM sb_devices WHERE token_hash=? AND revoked=0 AND token_expires>${databaseNowSQL}`;
  const plan=[sqlAssertion(db,`EXISTS(${auth})`,[a.token],"UNAUTHENTICATED")];
  // Bind only bounded primitives, even on the unauthenticated error path.
  const selector=(v:unknown)=>v==null?null:typeof v==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)?v:"";
  const b=a.body,session=selector(b.bridge_session_id??a.clock?.bridge_session_id),clock=a.clock?clockJSON(a.clock):null;
  if(session!=null){
    const owned=`SELECT s.* FROM sb_sessions s JOIN (${auth}) d ON s.device_id=d.id AND s.owner_id=d.owner_id WHERE s.id=?`;
    plan.push(sqlAssertion(db,`EXISTS(${owned})`,[a.token,session],"STALE_SESSION"));
    plan.push(sqlAssertion(db,`EXISTS(${owned} AND s.event_clock IS ?)`,[a.token,session,clock],a.clock?"EVENT_CLOCK_SCOPE_CHANGED":"EVENT_CLOCK_DOWNGRADE"));
    if(a.clock){
      plan.push(sqlAssertion(db,`EXISTS(${owned} AND s.device_id=? AND s.broadcast_id=? AND ?=? AND (? IS NULL OR ?=?) AND (? IS NULL OR ?=?))`,
        [a.token,session,a.clock.device_id,a.clock.broadcast_id,session,a.clock.bridge_session_id,selector(b.broadcast_id),selector(b.broadcast_id),a.clock.broadcast_id,selector(b.worker_id),selector(b.worker_id),a.clock.worker_id],"EVENT_CLOCK_SCOPE_CHANGED"));
    }
    const repeat=b.repeated_frame as Record<string,unknown>|undefined,probe=b.clock_probe_id??repeat?.clock_probe_id;
    if(probe!=null)plan.push(sqlAssertion(db,`EXISTS(SELECT 1 FROM sb_clock_probes p JOIN (${auth}) d ON d.id=p.device_id WHERE p.id=? AND p.event_clock IS ?)`,[a.token,selector(probe)?.toLowerCase(),clock],"EVENT_CLOCK_PROBE_SCOPE_CHANGED"));
  }else if(a.clock)throw new BridgeError("EVENT_CLOCK_SCOPE_CHANGED",422);
  plan.push(db.prepare(`UPDATE sb_devices SET confirmed_at=${databaseNowSQL} WHERE token_hash=? AND revoked=0 AND token_expires>${databaseNowSQL} AND confirmed_at IS NULL`).bind(a.token));
  return plan;
}
function translate(error:unknown):never {
  const message=String(error instanceof Error?error.message:error);
  const code=message.match(/SAYSO_([A-Z_]+)/)?.[1];
  if(code&&errors.has(code))throw new BridgeError(code,code==="UNAUTHENTICATED"?401:code.startsWith("EVENT_CLOCK")?422:409);
  throw error;
}
export async function hotBatch<T>(e:BridgeEngine,statements:D1PreparedStatement[],execute:(items:D1PreparedStatement[])=>Promise<D1Result<T>[]>){
  const c=current.getStore();
  if(!c?.active)return execute(statements.map(s=>originals.get(s)??s));
  if(c.stageLedger){c.ledger??=[];c.ledger.push(...statements.map(s=>originals.get(s)??s));return statements.map(()=>({success:true,results:[],meta:{changes:0}})) as unknown as D1Result<T>[];}
  frameTransactionPhase("FRAME_TRANSACTION_PREFLIGHT");
  const pending=c.pending.splice(0),prefix=[...atomicPrefix(e.db),...pending];
  const calls=takeMinimalCalls(e.db);
  frameTransactionPhase("FRAME_TRANSACTION_BATCH",prefix.length,calls.statements.length);
  try{const result=await execute([...prefix,...statements,...calls.statements].map(s=>originals.get(s)??s));calls.complete(true);return result.slice(prefix.length,prefix.length+statements.length);}
  catch(error){calls.complete(false);if(String(error).includes("SAYSO_STATIC_CONTEXT_REQUIRED"))c.pending.unshift(...pending);return translate(error);}
}
export function hotStatement(e:BridgeEngine,statement:D1PreparedStatement):D1PreparedStatement {
  if(!current.getStore()?.active)return statement;
  const wrapped=new Proxy(statement,{get(target,key,receiver){
    if(key==="first"||key==="all"||key==="run")return async(column?:string)=>{
      const c=current.getStore();
      if(!c?.active||(!c.atomic&&!c.pending.length&&!((key==="run")&&minimalCallQueueStatus(e.db).pending)))return (Reflect.get(target,key,target) as (column?:string)=>unknown).call(target,column);
      const [result]=await hotBatch(e,[target],items=>e.db.batch(items));
      if(key==="first"){const row=result.results[0]??null;return column&&row?(row as Record<string,unknown>)[column]:row;}
      return result;
    };
    return Reflect.get(target,key,receiver);
  }});originals.set(wrapped,statement);return wrapped;
}
export async function withAtomicDevice<T>(request:Request,work:()=>Promise<T>,e:BridgeEngine){
  return current.run({active:true,atomic:{token:await deviceTokenHash(request),body:{},clock:null},pending:[]},async()=>{
    try{return await work();}
    catch(error){
      // Even syntax/payload failures must pass authentication before revealing
      // their error. This is an exceptional RPC, never a normal-path prefix.
      logFrameFailure(error);frameStage("ATOMIC_RECHECK");
      try {await e.db.batch(atomicPrefix(e.db));}catch(authError){logFrameFailure(authError);return translate(authError);}
      throw error;
    }finally{current.getStore()!.active=false;}
  });
}
export async function withMcpHotPath<T>(work:()=>Promise<T>){
  return current.run({active:true,pending:[]},async()=>{try{return await work();}finally{
    const c=current.getStore()!;c.active=false;c.ledger=[];
    if(c.pending.length&&c.pendingDB)await flushPendingHotWrites();
  }});
}
export async function flushPendingHotWrites(){
  const c=current.getStore();if(!c?.pending.length||!c.pendingDB)return;
  const calls=takeMinimalCalls(c.pendingDB);
  try{await c.pendingDB.batch([...c.pending.splice(0),...calls.statements]);calls.complete(true);}catch(error){calls.complete(false);throw error;}
}
export function stageHotWrite(db:D1Database,statement:D1PreparedStatement){const c=current.getStore();if(!c?.active||!c.deferActivity)return false;c.pendingDB=db;c.pending.push(statement);return true;}
export function deferReadActivity(enabled:boolean){const c=current.getStore();if(c?.active)c.deferActivity=enabled;}
export function stageToolActivity(e:BridgeEngine,user:User){
  const c=current.getStore();if(!c?.active)return false;c.pendingDB=e.db;if(!c.deferActivity)return false;
  c.pendingDB=e.db;
  c.pending.push(e.db.prepare("UPDATE sb_sessions SET last_tool_at=max(last_tool_at,?) WHERE owner_id=? AND state='active'").bind(e.now(),user.id));return true;
}
export function hotDatabase(){return current.getStore()?.pendingDB;}
export async function stageReleaseLedger<T>(work:()=>Promise<T>){
  const c=current.getStore();if(!c?.active)return work();
  const ledger:D1PreparedStatement[]=[];c.ledger=ledger;c.ledgerCommitted=false;
  // Only this proof-retention branch may stage SQL. Sibling waitUntil/cache
  // work inherits the parent context and continues to execute normally.
  const child={...c,ledger,stageLedger:true};
  return current.run(child,async()=>{try{return await work();}finally{child.active=false;}});
}
export function takeReleaseLedger(){const c=current.getStore();return c?.active?c.ledger?.splice(0)??[]:[];}
export function resetReleaseLedger(){takeReleaseLedger();}
export function markLedgerCommitted(){const c=current.getStore();if(c?.active)c.ledgerCommitted=true;}
export function consumeLedgerCommit(){const c=current.getStore();if(!c?.active)return false;const committed=c.ledgerCommitted===true;c.ledgerCommitted=false;return committed;}
