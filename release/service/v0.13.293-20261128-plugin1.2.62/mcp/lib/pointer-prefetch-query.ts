export const POINTER_PREFETCH="pointer_prefetch.v1";
type Options={device:string;owner:string;session:string;broadcast:string;worker:string;lease:number;control:number;parent:string;nonce?:string;priorWorkerUntil?:number};
export type PrefetchCommand={id:string;device_id:string;session_id:string;hardware_id:string;board_boot_id:string;kind:string;payload:string;state:string;control_epoch:number;expires_at:number;predecessor_id:string|null};
export function pointerPrefetchEnvelope(row:PrefetchCommand|null,now:number) {
  if(!row||!row.predecessor_id||row.kind!=="pointer.local_plan"||row.state!=="executing"||row.expires_at<=now)return null;
  return {command_id:row.id,kind:row.kind,payload:JSON.parse(row.payload),state:row.state,control_epoch:row.control_epoch,device_id:row.device_id,bridge_session_id:row.session_id,hardware_id:row.hardware_id,board_boot_id:row.board_boot_id,
    predecessor_plan_id:row.predecessor_id,prefetch_protocol:POINTER_PREFETCH,activation:"after_local_predecessor_completion",ttl_remaining_ms:Math.max(0,Math.min(15000,row.expires_at-now))};
}
export function pointerPrefetchEnvelopes(rows:PrefetchCommand[],now:number,parent:string) {
  const byParent=new Map(rows.filter(row=>row.predecessor_id!==null).map(row=>[row.predecessor_id!,row])),result:NonNullable<ReturnType<typeof pointerPrefetchEnvelope>>[]=[];
  for(let i=0;i<5;i++){const next=byParent.get(parent),envelope=pointerPrefetchEnvelope(next??null,now);if(!next||!envelope)break;result.push(envelope);parent=next.id;}
  return result;
}
/** App-only activation grant carried in the EXISTING heartbeat transaction.
 * The transaction nonce excludes old/duplicate heartbeat writes. This never
 * creates a control grant, and the phone must still observe parent completion. */
export function pointerPrefetchQuery(o:Options,clock:string) {
  const fence=o.nonce?"d.heartbeat_write_token=? AND ?>"+clock:"changes()=1";
  return {sql:`UPDATE sb_mouse_commands SET state='executing',worker_id=?,lease_epoch=? WHERE id IN (
    WITH RECURSIVE lineage(id,depth) AS (SELECT id,0 FROM sb_mouse_commands WHERE id=? AND owner_id=? AND device_id=? UNION ALL SELECT c.id,lineage.depth+1 FROM sb_mouse_commands c JOIN lineage ON c.predecessor_id=lineage.id WHERE lineage.depth<4 AND c.owner_id=? AND c.device_id=?)
    SELECT c.id FROM sb_mouse_commands c JOIN sb_mouse_commands p ON p.id=c.predecessor_id AND p.owner_id=c.owner_id AND p.device_id=c.device_id
    JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id
    JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id
    JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
    JOIN sb_pointer_ready w ON w.device_id=d.id AND w.owner_id=d.owner_id
    JOIN sb_browse_calibrations k ON k.id=w.calibration_id AND k.owner_id=d.owner_id AND k.device_id=d.id
    WHERE d.id=? AND d.owner_id=? AND d.revoked=0 AND ${fence} AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>${clock}
    AND s.id=? AND s.broadcast_id=? AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.input_end>${clock} AND s.control_epoch=?
    AND h.usb_connected=1 AND h.hardware_id=c.hardware_id AND h.hardware_id=p.hardware_id AND h.board_boot_id=c.board_boot_id AND h.board_boot_id=p.board_boot_id
    AND json_extract(h.metadata,'$.capabilities."hid.mouse.absolute"')=1 AND json_extract(h.metadata,'$.capabilities."hid.mouse.click"')=1 AND json_extract(h.metadata,'$.descriptor_version')=json_extract(c.payload,'$.scope.descriptor_version')
    AND c.kind='pointer.local_plan' AND p.kind=c.kind AND p.id IN (SELECT id FROM lineage) AND p.state IN ('queued','claimed','executing','succeeded') AND p.session_id=s.id AND p.control_epoch=s.control_epoch AND p.expires_at>${clock}
    AND EXISTS(SELECT 1 FROM sb_mouse_commands origin WHERE origin.id=? AND origin.owner_id=d.owner_id AND origin.device_id=d.id AND origin.session_id=s.id AND origin.control_epoch=s.control_epoch AND origin.kind=c.kind AND origin.state IN ('executing','succeeded') AND origin.expires_at>${clock} AND json_extract(origin.payload,'$.scope')=w.scope_json)
    AND c.session_id=s.id AND c.control_epoch=s.control_epoch AND c.expires_at>${clock} AND (c.state='queued' OR (c.state='executing' AND c.worker_id=d.worker_id AND c.lease_epoch=d.lease_epoch))
    AND w.prefetch_protocol='pointer_prefetch.v1' AND w.session_id=s.id AND w.worker_id=d.worker_id AND w.lease_epoch=d.lease_epoch AND w.control_epoch=s.control_epoch AND w.expires_at>${clock} AND k.expires_at>${clock}
    AND json_extract(c.payload,'$.scope')=w.scope_json AND json_extract(p.payload,'$.scope')=w.scope_json
    AND json_extract(c.payload,'$.profile_id')=w.profile_id AND json_extract(p.payload,'$.profile_id')=w.profile_id
    AND json_extract(c.payload,'$.source_generation')=w.source_generation AND json_extract(p.payload,'$.source_generation')=w.source_generation
    ) RETURNING *`,values:[o.worker,o.lease,o.parent,o.owner,o.device,o.owner,o.device,o.device,o.owner,...(o.nonce?[o.nonce,o.priorWorkerUntil]:[]),o.worker,o.lease,o.session,o.broadcast,o.control,o.parent]};
}
