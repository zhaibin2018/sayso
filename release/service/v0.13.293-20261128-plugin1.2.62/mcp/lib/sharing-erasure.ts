import {DataErasure, validateErasureRequest} from './data-erasure.ts';
import type {BridgeEngine, Device} from './bridge-engine.ts';
export const erasureJobUUID = "lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))";

/** Existing authenticated stop owns this scope. Repeated stops resume the same job. */
export async function requestSharingErasure(service: BridgeEngine, device: Device, session: string, reason: string) {
  const candidate = crypto.randomUUID();
  validateErasureRequest({id:candidate, scope:'sharing', owner:device.owner_id, device:device.id, session});
  const now = service.now();
  const scope = [device.owner_id, device.id, session];
  // If the running extension has already reconnected, a delayed stop
  // receipt still ends the same broadcast, including its current session.
  const targets = `owner_id=? AND device_id=? AND (id=? OR
    (state='active' AND mode='broadcast' AND broadcast_id=(SELECT broadcast_id FROM sb_sessions WHERE id=?)))`;
  const targetScope = [...scope,session];
  await service.db.batch([
    service.stmt(`UPDATE sb_hardware SET usb_connected=0 WHERE device_id=? AND EXISTS
      (SELECT 1 FROM sb_devices WHERE id=? AND current_session IN (SELECT id FROM sb_sessions WHERE ${targets}))`,
      device.id,device.id,...targetScope),
    service.stmt(`UPDATE sb_sessions SET stop_reason=? WHERE ${targets} AND blocked=0
      AND (state='active' OR stop_reason='offline_timeout')`,reason,...targetScope),
    service.stmt(`INSERT INTO sb_erasure_jobs(id,scope,owner_id,device_id,session_id,state,requested_at,updated_at)
      SELECT CASE WHEN id=? THEN ? ELSE ${erasureJobUUID} END,'sharing',owner_id,device_id,id,'requested',?,?
      FROM sb_sessions WHERE ${targets} AND NOT EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.scope='sharing'
        AND j.owner_id=sb_sessions.owner_id AND j.device_id=sb_sessions.device_id AND j.session_id=sb_sessions.id)`,
      session,candidate,now,now,...targetScope),
  ]);
  const jobRow = await service.stmt("SELECT id FROM sb_erasure_jobs WHERE scope='sharing' AND owner_id=? AND device_id=? AND session_id=? ORDER BY requested_at LIMIT 1",
    ...scope).first<{id:string}>();
  if (!jobRow) throw Error("ERASURE_TARGET_NOT_FOUND");
  const id=jobRow.id, jobs=new DataErasure(service.db,service.bucket,service.now);
  // Single latest-frame/OCR rows can be removed immediately. The persistent job
  // covers all remaining pages and any failure, without making stop depend on R2.
  const keys=await service.stmt("SELECT image_key FROM sb_frames WHERE owner_id=? AND device_id=? AND session_id=? LIMIT 1",device.owner_id,device.id,session).all<{image_key:string}>();
  await service.db.batch(['sb_frames','sb_screen_texts','sb_refreshes'].map(t=>service.stmt(`DELETE FROM ${t} WHERE owner_id=? AND device_id=? AND session_id=?`,device.owner_id,device.id,session)));
  try{
    if(keys.results.length)await service.bucket.delete(keys.results.map(r=>r.image_key));
    const prefix=`screens/${device.owner_id}/${device.id}/${session}/`,page=await service.bucket.list({prefix,limit:100});
    if(page.objects.some(o=>!o.key.startsWith(prefix)))throw Error('ERASURE_PREFIX_MISMATCH');
    if(page.objects.length)await service.bucket.delete(page.objects.map(o=>o.key));
  }catch{/* Durable scope job retries; no content/error detail is recorded here. */}
  const job=await jobs.advance(id);
  return {erasure_job_id:id,erasure_state:job.state,cloud_image_cleared:job.state==='complete'};
}
