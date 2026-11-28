import {retentionPolicies,RETENTION_PAGE_SIZE} from './retention-policy.ts';
import {retentionGC} from './retention-gc.ts';
/** Internal one-page primitive, not an HTTP writer. All production triggers use
 * the durable due-only runner; retained for isolated migration/GC acceptance. */
export async function retentionPage(db:D1Database,bucket:R2Bucket,input:{prefix:'screens/'|'browse/';cursor?:string},now=Date.now()){
 if(!['screens/','browse/'].includes(input.prefix)||input.cursor!==undefined&&(typeof input.cursor!=='string'||input.cursor.length>4096))throw Error('INVALID_RETENTION_PAGE');
 const results=await db.batch(retentionPolicies(now).map(p=>db.prepare(`${p.set?`UPDATE ${p.table} SET ${p.set}`:`DELETE FROM ${p.table}`} WHERE rowid IN (SELECT rowid FROM ${p.table} WHERE ${p.where} LIMIT ${RETENTION_PAGE_SIZE})`).bind(...p.values)));
 const gc=await retentionGC(db,bucket,input.prefix,input.cursor??null,now);
 return {d1_changes:results.reduce((n,r)=>n+r.meta.changes,0),deleted_objects:gc.deleted,busy_objects:gc.busy,next_cursor:gc.cursor,has_more:gc.truncated,prefix:input.prefix,requires_repeat:true};
}
