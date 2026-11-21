/** Appends metadata proof to the existing replay marker within the SAME frame
 * transaction. No extra D1 RPC; independent of deferred metrics/log writes.
 * A marker without a matching committed fresh image never acquires proof. */
export function frameAcceptanceEvidenceSQL(clock:string) {
  const keys=["bridge_session_id","broadcast_id","worker_id","lease_epoch","frame_id","capture_mono_ms","capture_clock_verified","source_seq","content_sha256","orientation_epoch","width","height","native_width_px","native_height_px","orientation","transform_version","content_rect","provenance"];
  // SQLite's JSON serializer rounds REALs. Preserve the phone clock's
  // original JSON number and write the server REAL with round-trip precision.
  const metadata="json_object("+keys.map(key=>"'"+key+"',"+(key==="capture_mono_ms"?
    "f.metadata -> '$.capture_mono_ms'":"json_extract(f.metadata,'$."+key+"')")).join(",")+")";
  const captureLower="json(printf('%!.17g',f.capture_lower))";
  const frame="current_frame.device_id=sb_observations.device_id AND current_frame.frame_id=sb_observations.frame_id";
  const current="EXISTS(SELECT 1 FROM sb_frames current_frame JOIN sb_sessions s ON s.id=current_frame.session_id AND s.owner_id=current_frame.owner_id JOIN sb_hardware h ON h.device_id=current_frame.device_id AND h.owner_id=current_frame.owner_id WHERE "+frame+
    " AND (current_frame.storage_ready=1 OR length(current_frame.inline_jpeg)>0) AND s.mouse_enabled=1 AND s.mouse_until>"+clock+
    " AND h.usb_connected=1 AND (json_extract(h.metadata,'$.capabilities.\"sayso.action_geometry.v1\"')=1 OR json_extract(h.metadata,'$.capabilities.\"sayso.focused_text.no_visual.v1\"')=1 OR json_extract(h.metadata,'$.capabilities.\"sayso.system_search.scope_only.v1\"')=1))";
  return "UPDATE sb_observations SET acceptance_json=(SELECT json_object('metadata',"+metadata+",'capture_lower_ms',"+captureLower+",'commit_server_ms',"+clock+",'owner_id',f.owner_id,'control_epoch',s.control_epoch,'frame_seq',f.frame_seq) FROM sb_frames f JOIN sb_sessions s ON s.id=f.session_id AND s.device_id=f.device_id AND s.owner_id=f.owner_id WHERE f.device_id=sb_observations.device_id AND f.frame_id=sb_observations.frame_id AND f.capture_lower IS NOT NULL AND f.capture_lower>"+clock+"-1500 AND f.capture_lower<="+clock+"+100) WHERE id=? AND acceptance_json IS NULL AND ("+current+")";
}
