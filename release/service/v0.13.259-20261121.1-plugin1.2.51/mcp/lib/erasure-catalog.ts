// Children precede their parents: a run is retained until all dependent rows are gone.
export const erasureTables = [
  "sb_browse_leases", "sb_browse_journal", "sb_browse_images", "sb_browse_runs",
  "sb_released_system_search_field_proofs", "sb_frames", "sb_screen_texts",
  "sb_refreshes", "sb_clock_probes", "sb_observations", "sb_metrics", "sb_voice_bench",
  "sb_mouse_point_ready", "sb_pointer_ready", "sb_browse_ready", "sb_browse_calibrations",
  "sb_mouse_commands", "sb_led_commands", "sb_manual_requests", "sb_app_search_queries",
  "sb_hardware", "sb_sessions", "sb_pair_codes", "sb_pairing_requests", "sb_devices", "sb_rate_windows", "sb_timing_journal",
] as const;
export type ErasureScope = "sharing" | "device" | "site";
export type ErasureJob = {
  id: string; scope: ErasureScope; owner_id: string | null; device_id: string | null;
  session_id: string | null; state: "requested" | "processing" | "partial" | "failed" | "complete";
  requested_at: number; updated_at: number; phase: number; deleted_rows: number;
  deleted_objects: number; error: string | null; lock_token: string | null; lock_until: number;
  r2_verified_at: number | null;
};

// Shared by the R2 writer and deletion job. Closed scopes remain closed even at complete.
export const closedWriteSQL = `EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND
  (j.scope='site' OR (j.owner_id=? AND j.device_id=? AND (j.scope='device' OR j.session_id=?))))`;

export function erasurePredicate(table: string, job: ErasureJob): { sql: string; values: unknown[] } {
  if (job.scope === "site") return { sql: "1", values: [] };
  if (job.scope === "sharing") {
    if (!["sb_frames", "sb_screen_texts", "sb_browse_images"].includes(table)) return { sql: "0", values: [] };
    return { sql: "owner_id=? AND device_id=? AND session_id=?", values: [job.owner_id, job.device_id, job.session_id] };
  }
  if (table === "sb_timing_journal") return {sql:"json_valid(data_json) AND EXISTS(SELECT 1 FROM json_each(data_json,'$.scope_device_ids') WHERE value=?)",values:[job.device_id]};
  if (table === "sb_rate_windows") return { sql: "0", values: [] };
  if (["sb_browse_leases", "sb_browse_journal"].includes(table))
    return { sql: "run_id IN (SELECT id FROM sb_browse_runs WHERE owner_id=? AND device_id=?)", values: [job.owner_id, job.device_id] };
  if (["sb_clock_probes", "sb_observations"].includes(table))
    return { sql: "device_id=?", values: [job.device_id] };
  return { sql: `owner_id=? AND ${table === "sb_devices" ? "id" : "device_id"}=?`, values: [job.owner_id, job.device_id] };
}
