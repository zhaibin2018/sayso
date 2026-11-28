type Options={plan:string;device:string;owner:string;tokenHash:string;frames:string[]};
export type PointerResultContext={live_at_snapshot:number;parent_json:string|null;accepted_json:string};
/** Reused at read AND write. Only an unchanged live source can become success;
 * historical/late metadata may be retained without reviving that source. */
export function pointerResultAuthoritySQL(command:string,clock:string) {
  return `EXISTS(SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
    WHERE d.id=${command}.device_id AND d.owner_id=${command}.owner_id AND d.revoked=0 AND d.token_expires>${clock}
    AND d.worker_id=json_extract(${command}.payload,'$.scope.worker_id') AND d.lease_epoch=json_extract(${command}.payload,'$.scope.lease_epoch') AND d.worker_expires>${clock}
    AND s.id=${command}.session_id AND s.broadcast_id=json_extract(${command}.payload,'$.scope.broadcast_id') AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.input_end>${clock} AND s.control_epoch=${command}.control_epoch
    AND h.usb_connected=1 AND h.hardware_id=${command}.hardware_id AND h.board_boot_id=${command}.board_boot_id AND json_extract(h.metadata,'$.capabilities."hid.mouse.absolute"')=1 AND json_extract(h.metadata,'$.capabilities."hid.mouse.click"')=1
    AND json_extract(h.metadata,'$.descriptor_version')=json_extract(${command}.payload,'$.scope.descriptor_version') AND ${command}.expires_at>${clock})`;
}
/** Exact marker IDs use their primary key, not asynchronous metrics or an
 * arbitrary one-minute window. All evidence/parent/live facts share a snapshot. */
export function pointerResultSnapshotQuery(o:Options,clock:string) {
  return {sql:`SELECT c.*,CASE WHEN ${pointerResultAuthoritySQL("c",clock)} THEN 1 ELSE 0 END AS live_at_snapshot,
    (SELECT json_object('id',p.id,'state',p.state,'expires_at',p.expires_at,'result_digest',p.result_digest,'payload',json(p.payload),'receipt',json(p.receipt)) FROM sb_mouse_commands p WHERE p.id=c.predecessor_id AND p.owner_id=c.owner_id AND p.device_id=c.device_id AND p.kind='pointer.local_plan') AS parent_json,
    (SELECT json_group_array(json_object('frame_id',a.frame_id,'acceptance',json(a.acceptance_json))) FROM sb_observations a WHERE a.device_id=c.device_id AND a.acceptance_json IS NOT NULL AND a.id IN (SELECT c.device_id||':'||value FROM json_each(?))) AS accepted_json
    FROM sb_mouse_commands c JOIN sb_devices own ON own.id=c.device_id AND own.owner_id=c.owner_id
    WHERE c.id=? AND c.device_id=? AND c.owner_id=? AND c.kind='pointer.local_plan' AND own.revoked=0 AND own.token_hash=? AND own.token_expires>${clock}`,
    values:[JSON.stringify(o.frames),o.plan,o.device,o.owner,o.tokenHash]};
}
