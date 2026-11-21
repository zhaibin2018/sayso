const pageSize=100;
/** Persistent per-key GC intents and retirement fences make deletion retries safe.
 * Unsettled PUTs remain blocked/visible; elapsed time is not proof of completion. */
export async function retentionGC(db:D1Database,bucket:R2Bucket,prefix:string,cursor:string|null,now:number) {
  if(!['screens/','browse/'].includes(prefix))throw Error('INVALID_GC_PREFIX');
  const stmt=(sql:string,...args:unknown[])=>db.prepare(sql).bind(...args);
  const page=await bucket.list({prefix,limit:pageSize,...(cursor?{cursor}:{})});
  if(page.truncated&&!page.cursor)throw Error('GC_CURSOR_MISSING');
  // A DELETE may have committed before a crash lost its D1 checkpoint. Such a
  // key is absent from list(), so resume persisted GC intents independently.
  const pending=await stmt('SELECT image_key FROM sb_storage_writes WHERE is_gc=1 AND substr(image_key,1,?)=? LIMIT ?',prefix.length,prefix,pageSize).all<{image_key:string}>();
  const selected=[...new Set([...pending.results.map(r=>r.image_key),...page.objects.map(o=>o.key)])].slice(0,pageSize);
  const deferred=page.objects.some(o=>!selected.includes(o.key));
  let deleted=0,busy=0;
  for(const key of selected){
    const object={key};
    if(!object.key.startsWith(prefix))throw Error('GC_PREFIX_MISMATCH');
    const parts=object.key.split('/'),owner=parts.slice(1,-3).join('/'),device=parts.at(-3),scope=parts.at(-2);
    if(!owner||!device||!scope||!parts.at(-1))throw Error('INVALID_GC_KEY');
    const session=prefix==='screens/'?scope:(await stmt('SELECT session_id FROM sb_browse_runs WHERE id=? AND owner_id=? AND device_id=?',scope,owner,device).first<{session_id:string}>())?.session_id??'unknown';
    // Resume a previous uncertain DELETE of this immutable key. Never retire a PUT.
    let lock=await stmt('SELECT id,is_gc FROM sb_storage_writes WHERE image_key=? ORDER BY is_gc LIMIT 1',object.key).first<{id:string;is_gc:number}>();
    const resumed=!!lock;
    if(lock?.is_gc===0){busy++;continue;}
    if(!lock){
      lock={id:crypto.randomUUID(),is_gc:1};
      try{await stmt('INSERT INTO sb_storage_writes(id,owner_id,device_id,session_id,image_key,started_at,is_gc) VALUES(?,?,?,?,?,?,1)',lock.id,owner,device,session,object.key,now).run();}
      catch(error){if(error instanceof Error&&/STORAGE_KEY_BUSY/.test(error.message)){busy++;continue;}throw error;}
    }
    const live=await stmt(`SELECT EXISTS(SELECT 1 FROM sb_frames WHERE image_key=? AND expires_at>?) OR EXISTS(SELECT 1 FROM sb_browse_images WHERE image_key=? AND expires_at>?) AS live`,object.key,now,object.key,now).first<{live:number}>();
    if(live?.live){if(!resumed)await stmt('DELETE FROM sb_storage_writes WHERE id=? AND is_gc=1',lock.id).run();else busy++;continue;}
    await bucket.delete(object.key); // On failure retain the intent, cursor and fixed error.
    await stmt('UPDATE sb_storage_writes SET is_gc=2 WHERE id=? AND is_gc=1',lock.id).run();
    deleted++;
  }
  const remaining=busy+page.objects.filter(o=>!selected.includes(o.key)).length+(page.truncated?1:0);
  return {deleted,busy,remaining,truncated:deferred||page.truncated,cursor:deferred?cursor:page.truncated?page.cursor!:null};
}
