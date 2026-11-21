import {DataErasure} from './data-erasure.ts';
import type {BridgeEngine, Device} from './bridge-engine.ts';
/** Existing authenticated stop owns this scope. Repeated stops resume the same job. */
export async function requestSharingErasure(service: BridgeEngine, device: Device, session: string) {
  const old=await service.stmt("SELECT id FROM sb_erasure_jobs WHERE scope='sharing' AND owner_id=? AND device_id=? AND session_id=? ORDER BY requested_at LIMIT 1",device.owner_id,device.id,session).first<{id:string}>();
  const jobs=new DataErasure(service.db,service.bucket,service.now),id=old?.id??crypto.randomUUID();
  await jobs.request({id,scope:'sharing',owner:device.owner_id,device:device.id,session});
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
