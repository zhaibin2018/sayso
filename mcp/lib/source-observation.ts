/** Diagnostic projection in the existing admission readback; no extra read or gate. */
export function sourceObservationSQL(now: number) {
  const proof = "json_extract(c.precondition,'$.point_query_origin')";
  const accepted = "CASE WHEN json_valid(a.acceptance_json) THEN a.acceptance_json END";
  const capture = `COALESCE(json_extract(${proof},'$.captureLower'),json_extract(${accepted},'$.capture_lower_ms'))`;
  const hash = `COALESCE(json_extract(${proof},'$.sha256'),json_extract(${accepted},'$.metadata.content_sha256'))`;
  return `(SELECT json_object('source_age_ms',CASE WHEN ${capture}<=${now} THEN ${now}-${capture} END,
    'screen_changed_since_source',CASE WHEN ${hash} IS NOT NULL THEN f.sha256<>${hash} END,
    'source_observed_at_server_utc_ms',${now}) FROM sb_frames f
    LEFT JOIN sb_observations a ON a.id=c.device_id||':'||json_extract(c.precondition,'$.source_frame_id')
    WHERE f.device_id=c.device_id AND f.owner_id=c.owner_id) AS source_observation_json`;
}
export function sourceObservationFields(raw?: string | null) {
  const value = raw ? JSON.parse(raw) : {};
  return {
    source_age_ms: typeof value.source_age_ms === "number" ? value.source_age_ms : null,
    screen_changed_since_source:
      value.screen_changed_since_source == null ? null : value.screen_changed_since_source === 1,
    source_observed_at_server_utc_ms: value.source_observed_at_server_utc_ms ?? null,
  };
}
