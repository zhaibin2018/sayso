type Options={owner:string;device:string;key:string};
/** An owned device/prior key must remain visible when its phone is offline.
 * Live/ready joins are optional; a prior plan never becomes fresh input. */
export function pointerAdmissionSnapshotQuery(o:Options,clock:string) {
  const fields=["device_id","owner_id","session_id","worker_id","lease_epoch","control_epoch","calibration_id","profile_id","source_generation","scope_json","expires_at","prefetch_protocol"];
  const ready="json_object("+fields.map(x=>"'"+x+"',w."+x).join(",")+")";
  return {sql:`SELECT d.*,c.id AS prior_id,c.kind AS prior_kind,c.digest AS prior_digest,
    s.id AS sid,s.broadcast_id,s.control_epoch,s.mouse_until,h.hardware_id,h.board_boot_id,h.metadata AS hardware_metadata,
    CASE WHEN w.device_id IS NOT NULL THEN ${ready} ELSE NULL END AS ready_json
    FROM sb_devices d LEFT JOIN sb_mouse_commands c ON c.device_id=d.id AND c.owner_id=d.owner_id AND c.idempotency_key=?
    LEFT JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id
      AND d.token_expires>${clock} AND d.worker_expires>${clock} AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.mouse_until>${clock}
    LEFT JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id AND h.usb_connected=1
    LEFT JOIN sb_pointer_ready w ON w.device_id=d.id AND w.owner_id=d.owner_id AND w.expires_at>${clock}
    WHERE d.id=? AND d.owner_id=? AND d.revoked=0`,values:[o.key,o.device,o.owner]};
}
