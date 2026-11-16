import {diagnosticFlagSQL,diagnosticJSONSQL} from "./source-view-proof.ts";

export type FocusedFieldAdmissionRejection={ready:number;metadata:string|null;diagnostic_json:string};

type AdmissionGates={
  authority:string;
  head:string;
  headFresh:string;
  source:string;
  protectedSourceCTE:string;
  capabilities:string;
  fences:Record<string,string>;
};

/** The original D1 batch samples these gates only when admission has no saved command. */
export function focusedFieldAdmissionRejectionSQL(databaseNow:string,gates:AdmissionGates) {
  const at="clock.now",source="r.source_frame_id",sameFrame="f.frame_id="+source;
  const accepted=(field:string)=>"json_extract(a.acceptance_json,'$."+field+"')";
  const scopeMatch=[
    accepted("metadata.bridge_session_id")+"=s.id",
    accepted("metadata.broadcast_id")+"=s.broadcast_id",
    accepted("metadata.worker_id")+"=d.worker_id",
    accepted("metadata.lease_epoch")+"=d.lease_epoch",
    ...["orientation_epoch","width","height"].map(field=>accepted("metadata."+field)+"=json_extract(f.metadata,'$."+field+"')"),
  ].join(" AND ");
  const sourceCapture="CASE WHEN "+sameFrame+" THEN f.capture_lower ELSE "+accepted("capture_lower_ms")+" END";
  const head=diagnosticJSONSQL({age_ms:at+"-f.capture_lower",frame_seq:"f.frame_seq"},{
    present:"f.frame_id IS NOT NULL",fresh:gates.headFresh,
    pixels_available:"f.storage_ready=1 OR length(f.inline_jpeg)>0",
    eligible:gates.head,
  });
  const reference=diagnosticJSONSQL({age_ms:at+"-("+sourceCapture+")"},{
    is_current_head:sameFrame,acceptance_present:"a.acceptance_json IS NOT NULL",
    accepted_scope_matches:scopeMatch,
    accepted_control_matches:accepted("control_epoch")+"=s.control_epoch",
    original_action_eligible:gates.protectedSourceCTE?
      "EXISTS(SELECT 1 FROM protected_field_source p WHERE p.reviewed_id=a.id AND p.head_id=f.frame_id)":"0",
    eligible:gates.source,
  });
  const admission=diagnosticJSONSQL({},{
    device_present:"d.id IS NOT NULL",device_not_revoked:"d.revoked=0",
    worker_live:"d.worker_expires>"+at,session_active:"s.state='active'",
    broadcast_mode:"s.mode='broadcast'",capture_active:"s.capture_state='active'",
    grant_enabled:"s.mouse_enabled=1",grant_live:"s.mouse_until>"+at,
    board_connected:"h.usb_connected=1",authority_eligible:gates.authority,
    capabilities_eligible:gates.capabilities,...gates.fences,
  });
  const snapshot=diagnosticJSONSQL({snapshot_utc_ms:at,control_epoch:"s.control_epoch",lease_epoch:"d.lease_epoch",
    admission,head,reference},{});
  return `WITH clock AS MATERIALIZED (SELECT max(?,${databaseNow}) AS now)${gates.protectedSourceCTE},
    request AS (SELECT ? AS device_id,? AS owner_id,? AS idem,? AS source_frame_id),
    rejection AS MATERIALIZED (
      SELECT r.* FROM request r WHERE NOT EXISTS(
        SELECT 1 FROM sb_mouse_commands c
        JOIN sb_devices prior ON prior.id=c.device_id AND prior.owner_id=c.owner_id
        JOIN sb_sessions live ON live.id=prior.current_session AND live.owner_id=prior.owner_id AND live.state='active'
        JOIN sb_hardware board ON board.device_id=prior.id AND board.owner_id=prior.owner_id
        WHERE c.owner_id=r.owner_id AND c.device_id=r.device_id AND c.idempotency_key=r.idem AND prior.revoked=0
      )
    )
    SELECT ${diagnosticFlagSQL("d.revoked=0 AND s.state='active' AND h.device_id IS NOT NULL")} AS ready,
      h.metadata,${snapshot} AS diagnostic_json
    FROM rejection r CROSS JOIN clock
    LEFT JOIN sb_devices d ON d.id=r.device_id AND d.owner_id=r.owner_id
    LEFT JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id
    LEFT JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
    LEFT JOIN sb_frames f ON f.device_id=d.id AND f.owner_id=d.owner_id
    LEFT JOIN sb_observations a ON a.id=d.id||':'||r.source_frame_id AND a.device_id=d.id`;
}

export function logFocusedFieldAdmissionRejection(requestID:string,sourceFrameID:string,diagnostic:string) {
  try {
    const snapshot=JSON.parse(diagnostic);
    const failed=Object.entries(snapshot.admission).filter(([,value])=>value===0).map(([key])=>key);
    if(snapshot.head.eligible!==1)failed.push("current_head");
    if(snapshot.reference.eligible!==1)failed.push("reference_frame");
    console.info(JSON.stringify({event:"focused_text_admission_rejected",request_id:requestID,
      source_frame_id:sourceFrameID,failed_conditions:failed,snapshot}));
  } catch { /* Preserve the existing tool error if diagnostics cannot be logged. */ }
}
