import {placementJSON} from "./d1-placement.ts";
import {migrateReplayKeyPage} from "./replay-key-retention.ts";
import {DataErasure} from './data-erasure.ts';
import {retentionPolicies,RETENTION_PAGE_SIZE,DAY} from './retention-policy.ts';
import {retentionGC} from './retention-gc.ts';

export const MAINTENANCE_BACKLOG_LIMIT=10_000;
export const MAINTENANCE_INTERVAL_MS=60_000;
const leaseMS=120_000;
const requestNext=new WeakMap<D1Database,number>();
type State={due_at:number;lock_token:string|null;lock_until:number;prefix:string;cursor:string|null;last_success_at:number|null;last_attempt_at:number|null;failures:number;backlog:number;overloaded:number};
export async function maintenanceStatus(db:D1Database){
  const state=await db.prepare('SELECT due_at,lock_until,last_success_at,last_attempt_at,failures,backlog,overloaded FROM sb_maintenance_state WHERE id=1').first();
  const runs=await db.prepare('SELECT source,started_at,finished_at,state,d1_changes,deleted_objects,backlog,backlog_capped,error FROM sb_maintenance_runs ORDER BY started_at DESC,id DESC LIMIT 5').all();
  return {state,runs:runs.results};
}
/** Both owner MCP and authenticated ordinary traffic use this same due-only CAS.
 * SQL is bounded by policy count * 100; R2 is one page of 100; one erasure page.
 * A failed/abandoned run cannot update success watermarks or another lease's cursor. */
export async function runMaintenance(db:D1Database,bucket:R2Bucket,source:'owner'|'request'|'legacy',clock=Date.now){
  const now=clock(),token=crypto.randomUUID();
  // A local optimization avoids D1 on every frame. Durable CAS remains authority
  // across isolates and for every owner reminder; this is never a timer.
  if(source==='request'){
    if((requestNext.get(db)??0)>now)return {attempted:false};
    requestNext.set(db,now+MAINTENANCE_INTERVAL_MS);
  }
  const stmt=(sql:string,...args:unknown[])=>db.prepare(sql).bind(...args);
  const location=placementJSON(db);
  const state=await stmt(`UPDATE sb_maintenance_state SET lock_token=?,lock_until=?,last_attempt_at=?,
    d1_placement_json=CASE WHEN ? IS NOT NULL AND COALESCE(json_extract(d1_placement_json,'$.recorded_at_ms'),-1)<=json_extract(?,'$.recorded_at_ms')
      THEN ? ELSE d1_placement_json END
    WHERE id=1 AND due_at<=? AND (lock_token IS NULL OR lock_until<=?) RETURNING *`,token,now+leaseMS,now,location,location,location,now,now).first<State>();
  if(!state)return {attempted:false};
  const guard="EXISTS(SELECT 1 FROM sb_maintenance_state WHERE id=1 AND lock_token=? AND lock_until>?)";
  let changes=0,deleted=0,backlog=0,capped=false,prefix=state.prefix,cursor=state.cursor;
  const count=async(sql:string,...values:unknown[])=>{
    const row=await stmt(`SELECT count(*) AS n FROM (${sql} LIMIT ?)`,...values,MAINTENANCE_BACKLOG_LIMIT+1).first<{n:number}>();
    return row?.n??0;
  };
  const owns=async()=>!!await stmt('SELECT 1 FROM sb_maintenance_state WHERE id=1 AND lock_token=? AND lock_until>?',token,clock()).first();
  try{
    await db.batch([
      stmt("UPDATE sb_maintenance_runs SET state='failed',finished_at=?,error='LEASE_EXPIRED' WHERE state='running'",now),
      stmt("INSERT INTO sb_maintenance_runs(id,source,started_at,state) VALUES(?,?,?,'running')",token,source,now),
      stmt('DELETE FROM sb_maintenance_runs WHERE started_at<? OR id IN (SELECT id FROM sb_maintenance_runs ORDER BY started_at DESC,id DESC LIMIT -1 OFFSET 200)',now-7*DAY),
    ]);
    const policies=retentionPolicies(now);
    const results=await db.batch(policies.map(p=>stmt(`${p.set?`UPDATE ${p.table} SET ${p.set}`:`DELETE FROM ${p.table}`} WHERE rowid IN (SELECT rowid FROM ${p.table} WHERE ${p.where} LIMIT ${RETENTION_PAGE_SIZE}) AND ${guard}`,...p.values,token,clock())));
    changes+=results.reduce((n,r)=>n+r.meta.changes,0);
    changes+=await migrateReplayKeyPage(db,{token,now:clock()});
    if(!await owns())throw Error('LEASE_EXPIRED');
    const gc=await retentionGC(db,bucket,prefix,cursor,now);deleted=gc.deleted;
    cursor=gc.cursor;
    if(!gc.truncated){prefix=prefix==='screens/'?'browse/':'screens/';cursor=null;}
    await stmt(`UPDATE sb_maintenance_state SET prefix=?,cursor=? WHERE id=1 AND lock_token=? AND lock_until>?`,prefix,cursor,token,clock()).run();
    // Only continue already-authorized jobs. A reminder never creates a scope.
    const job=await stmt("SELECT id FROM sb_erasure_jobs WHERE state<>'complete' AND (lock_token IS NULL OR lock_until<=?) ORDER BY updated_at,id LIMIT 1",clock()).first<{id:string}>();
    if(!await owns())throw Error('LEASE_EXPIRED');
    if(job){const next=await new DataErasure(db,bucket,clock).advance(job.id);if(next.state==='failed')throw Error('ERASURE_PAGE_FAILED');}
    for(const p of policies){backlog+=await count(`SELECT 1 FROM ${p.table} WHERE ${p.where}`,...p.values);if(backlog>MAINTENANCE_BACKLOG_LIMIT){capped=true;break;}}
    backlog+=await count('SELECT 1 FROM sb_mouse_commands WHERE replay_key_version=0');
    backlog+=await count('SELECT 1 FROM sb_led_commands WHERE replay_key_version=0');
    backlog+=await count("SELECT 1 FROM sb_browse_runs WHERE replay_key_version=0 AND state<>'active' AND queue_json='[]' AND plan_keys_json='{}' AND input_json IS NULL AND checkpoint_json IS NULL");
    backlog+=await count("SELECT 1 FROM sb_erasure_jobs WHERE state<>'complete'");
    backlog+=await count('SELECT 1 FROM sb_storage_writes WHERE is_gc<>2');
    backlog+=gc.remaining;
    capped ||= backlog>MAINTENANCE_BACKLOG_LIMIT;
    backlog=Math.min(backlog,MAINTENANCE_BACKLOG_LIMIT+1);
    const outcome=capped?'failed':backlog||state.prefix!=='browse/'||gc.truncated?'partial':'success';
    if(!await owns())throw Error('LEASE_EXPIRED');
    await db.batch([
      stmt(`UPDATE sb_maintenance_runs SET state=?,finished_at=?,d1_changes=?,deleted_objects=?,backlog=?,backlog_capped=?,error=? WHERE id=? AND ${guard}`,outcome,clock(),changes,deleted,backlog,capped?1:0,capped?'BACKLOG_LIMIT':null,token,token,clock()),
      stmt(`UPDATE sb_maintenance_state SET due_at=?,last_success_at=CASE WHEN ?='success' THEN ? ELSE last_success_at END,failures=CASE WHEN ?='failed' THEN failures+1 ELSE 0 END,backlog=?,overloaded=?,lock_token=NULL,lock_until=0 WHERE id=1 AND lock_token=? AND lock_until>?`,clock()+MAINTENANCE_INTERVAL_MS,outcome,clock(),outcome,backlog,capped?1:0,token,clock()),
    ]);
  }catch{
    // Even a failed R2 page reports a bounded current backlog, never provider text.
    try{
      backlog=0;
      for(const p of retentionPolicies(now)){backlog+=await count(`SELECT 1 FROM ${p.table} WHERE ${p.where}`,...p.values);if(backlog>MAINTENANCE_BACKLOG_LIMIT)break;}
      backlog+=await count('SELECT 1 FROM sb_storage_writes WHERE is_gc<>2');
      backlog+=await count("SELECT 1 FROM sb_erasure_jobs WHERE state<>'complete'");
      capped=backlog>MAINTENANCE_BACKLOG_LIMIT;backlog=Math.min(backlog,MAINTENANCE_BACKLOG_LIMIT+1);
    }catch{/* If D1 itself is unreachable the prior durable backlog remains authoritative. */}
    await db.batch([
      stmt(`UPDATE sb_maintenance_runs SET state='failed',finished_at=?,d1_changes=?,deleted_objects=?,backlog=?,backlog_capped=?,error='MAINTENANCE_PAGE_FAILED' WHERE id=? AND ${guard}`,clock(),changes,deleted,backlog,capped?1:0,token,token,clock()),
      stmt('UPDATE sb_maintenance_state SET failures=failures+1,due_at=?,backlog=?,overloaded=?,lock_token=NULL,lock_until=0 WHERE id=1 AND lock_token=? AND lock_until>?',clock()+MAINTENANCE_INTERVAL_MS,backlog,capped?1:0,token,clock()),
    ]);
  }
  return {attempted:true,...await maintenanceStatus(db)};
}
