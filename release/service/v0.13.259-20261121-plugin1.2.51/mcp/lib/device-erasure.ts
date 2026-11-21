import { BridgeError, type BridgeEngine, type User } from "./bridge-engine.ts";
import { DataErasure } from "./data-erasure.ts";

/** Public disconnect starts bounded work; continuation uses separate admin auth. */
export async function requestDeviceErasure(service: BridgeEngine, user: User, device: string) {
  const existing=await service.stmt("SELECT id FROM sb_erasure_jobs WHERE scope='device' AND owner_id=? AND device_id=? ORDER BY requested_at LIMIT 1",user.id,device).first<{id:string}>();
  const target=await service.stmt("SELECT current_session FROM sb_devices WHERE owner_id=? AND id=?",user.id,device).first<{current_session:string|null}>();
  if(!existing&&!target)throw new BridgeError("NOT_FOUND",404);
  const jobs=new DataErasure(service.db,service.bucket,service.now),id=existing?.id??crypto.randomUUID();
  await jobs.request({id,scope:"device",owner:user.id,device});
  const job=await jobs.advance(id);
  return {session:target?.current_session,result:{revoked:true,device_id:device,erasure_job_id:id,
    erasure_state:job.state,cloud_image_cleared:job.state==="complete",retained_safety_fence:true}};
}
