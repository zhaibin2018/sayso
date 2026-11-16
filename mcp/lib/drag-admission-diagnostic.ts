import {diagnosticFlagSQL,diagnosticJSONSQL,dragReviewJoinsSQL,dragReviewedDiagnosticsSQL} from "./source-view-proof.ts";

export type DragAdmissionRejection={ready:number;capabilities_ready:number;diagnostic_json:string};

/** Replaces the no-command readiness read inside the original D1 batch. */
export function dragAdmissionRejectionSQL(databaseNow:string,authority:(clock:string)=>string,
  capabilities:readonly [string,string,string],fences:Record<string,string>) {
  const at="r.now",intent="r.intent";
  const ready="d.revoked=0 AND s.state='active' AND h.device_id IS NOT NULL";
  const capabilityTests=capabilities.map(name=>"json_type(h.metadata,'$.capabilities.\""+name+"\"')='true'");
  const [absoluteCapability,boardCapability,appCapability]=capabilityTests;
  const flags=diagnosticJSONSQL({},{
    device_present:"d.id IS NOT NULL",device_not_revoked:"d.revoked=0",
    session_present:"s.id IS NOT NULL",session_active:"s.state='active'",
    session_device_matches:"s.device_id=d.id",broadcast_mode:"s.mode='broadcast'",
    capture_active:"s.capture_state='active'",worker_live:"d.worker_expires>"+at,
    board_present:"h.device_id IS NOT NULL",board_connected:"h.usb_connected=1",
    grant_enabled:"s.mouse_enabled=1",grant_live:"s.mouse_until>"+at,
    absolute_capability:absoluteCapability,board_drag_capability:boardCapability,app_drag_capability:appCapability,
    admission_capabilities_ready:capabilities.map(name=>"json_extract(h.metadata,'$.capabilities.\""+name+"\"')=1").join(" AND "),
    authority_eligible:authority(at),admission_time_remaining:at+"<r.cutoff",
    ...fences,
  });
  const diagnostics=diagnosticJSONSQL({snapshot_utc_ms:at,control_epoch:"s.control_epoch",lease_epoch:"d.lease_epoch",
    admission:flags,view:dragReviewedDiagnosticsSQL(at,intent)},{});
  // Materialize the miss first so successful admissions never read the head
  // or its acceptance rows for diagnostics.
  return `WITH request AS (SELECT max(?,${databaseNow}) AS now,? AS intent,? AS device_id,? AS owner_id,? AS idem,? AS cutoff),
    rejection AS MATERIALIZED (
      SELECT r.* FROM request r WHERE NOT EXISTS(
        SELECT 1 FROM sb_mouse_commands c JOIN sb_devices prior ON prior.id=c.device_id AND prior.owner_id=c.owner_id
        JOIN sb_sessions live ON live.id=prior.current_session AND live.owner_id=prior.owner_id AND live.state='active'
        JOIN sb_hardware board ON board.device_id=prior.id AND board.owner_id=prior.owner_id
        WHERE c.owner_id=r.owner_id AND c.device_id=r.device_id AND c.idempotency_key=r.idem AND prior.revoked=0
      )
    )
    SELECT ${diagnosticFlagSQL(ready)} AS ready,
      ${diagnosticFlagSQL(capabilityTests.join(" AND "))} AS capabilities_ready,${diagnostics} AS diagnostic_json
    FROM rejection r
    LEFT JOIN sb_devices d ON d.id=r.device_id AND d.owner_id=r.owner_id
    LEFT JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id
    LEFT JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
    LEFT JOIN sb_frames f ON f.device_id=d.id AND f.owner_id=d.owner_id
    ${dragReviewJoinsSQL(intent)}`;
}

export function logDragAdmissionRejection(requestID:string,deviceID:string,sourceFrameID:string,diagnostic:string) {
  try {
    console.info(JSON.stringify({event:"drag_admission_rejected",request_id:requestID,device_id:deviceID,
      source_frame_id:sourceFrameID,snapshot:JSON.parse(diagnostic)}));
  } catch { /* Diagnostics never change the original MCP error. */ }
}
