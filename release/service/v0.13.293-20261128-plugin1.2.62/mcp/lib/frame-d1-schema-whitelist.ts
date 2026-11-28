// Generated from db/schema.ts and drizzle/*.sql; never extend with observed user/provider text.
export const schemaRaiseMessages = [
  "ERASURE_PARENT_MISSING",
  "ERASURE_SCOPE_CLOSED",
  "MAINTENANCE_BACKLOG_LIMIT",
  "SHARE_CONTROL_UPGRADE_REQUIRED",
  "STALE_CAPTURE_GENERATION",
  "STORAGE_KEY_BUSY",
  "STORAGE_KEY_RETIRED",
  "TEXT_DIGEST_REQUIRED"
] as const;
export const schemaConstraintNames = [
  "sb_browse_calibration_request",
  "sb_browse_lease_seq",
  "sb_browse_run_active_device",
  "sb_browse_run_intent",
  "sb_devices_token_hash_unique",
  "sb_led_idempotency_idx",
  "sb_mouse_idempotency_idx",
  "sb_pair_codes_code_hash_unique",
  "sb_pointer_successor_idx",
  "sb_sessions_request_idx"
] as const;
