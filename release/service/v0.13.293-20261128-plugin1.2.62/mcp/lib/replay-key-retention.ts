import {stageHotWrite} from "./hot-path-context.ts";
import {createHash} from 'node:crypto';
/** Generated structural keys contain only UUIDs/digests; they are protocol links,
 * never copied user text. Keep them stable for the companion-command SQL joins. */
const opaqueGenerated=/^(?:click-at:[0-9a-f]{64}:(?:move|click)|app-search-query:[0-9a-f-]{36}:(?:shortcut|text)|parked-press:[0-9a-f-]{36})$/;
export const storedReplayKey=(raw:string)=>opaqueGenerated.test(raw)?raw:'rk1:'+createHash('sha256').update(raw,'utf8').digest('hex');
/** Normalize a legacy key atomically before any new admission uses its hash.
 * The digest of the request remains unchanged, including keyed text digests. */
export async function commandReplayKey(db:D1Database,table:'sb_mouse_commands'|'sb_led_commands',owner:string,device:unknown,raw:string){
  const key=storedReplayKey(raw);
  if(key!==raw){const statement=db.prepare(`UPDATE ${table} SET idempotency_key=?,replay_key_version=1 WHERE owner_id=? AND (? IS NULL OR device_id=?) AND idempotency_key=? AND replay_key_version=0`)
    .bind(key,owner,typeof device==='string'?device:null,typeof device==='string'?device:null,raw);
    if(!stageHotWrite(db,statement))await statement.run();}
  return key;
}
/** Bounded legacy sweep; never deletes a replay row or changes a request digest. */
export async function migrateReplayKeyPage(db:D1Database,guard:{token:string;now:number}){
  let changed=0;
  for(const table of ['sb_mouse_commands','sb_led_commands','sb_browse_runs'] as const){
    const column=table==='sb_browse_runs'?'intent_key':'idempotency_key';
    const eligible=table==='sb_browse_runs'?" AND state<>'active' AND queue_json='[]' AND plan_keys_json='{}' AND input_json IS NULL AND checkpoint_json IS NULL":'';
    const rows=await db.prepare(`SELECT rowid AS row_id,${column} AS idempotency_key FROM ${table} WHERE replay_key_version=0${eligible} LIMIT 100`).all<{row_id:number;idempotency_key:string}>();
    if(!rows.results.length)continue;
    const result=await db.batch(rows.results.map(r=>db.prepare(`UPDATE ${table} SET ${column}=?,replay_key_version=1 WHERE rowid=? AND replay_key_version=0 AND EXISTS(SELECT 1 FROM sb_maintenance_state WHERE id=1 AND lock_token=? AND lock_until>?)`).bind(storedReplayKey(r.idempotency_key),r.row_id,guard.token,guard.now)));
    changed+=result.reduce((n,r)=>n+r.meta.changes,0);
  }
  return changed;
}
