import { sqliteTable, text, integer, real, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const pairingRequests = sqliteTable("sb_pairing_requests", {
  requestId:text("request_id").primaryKey(),ownerId:text("owner_id").notNull(),ownerLabel:text("owner_label").notNull(),
  publicKey:text("public_key").notNull(),createdAt:integer("created_at"),codeExpiresAt:integer("code_expires_at"),expiresAt:integer("expires_at").notNull(),issuedAt:integer("issued_at"),
  codeHash:text("code_hash").unique(),gateHash:text("gate_hash"),usedAt:integer("used_at"),deviceId:text("device_id").unique(),
});
export const pairCodes = sqliteTable("sb_pair_codes", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), ownerLabel: text("owner_label").notNull(),
  codeHash: text("code_hash").notNull().unique(), expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"), requestId: text("request_id"), deviceId: text("device_id"),
});
export const devices = sqliteTable("sb_devices", {
  pairingGateHash:text("pairing_gate_hash"),
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(), tokenExpires: integer("token_expires").notNull(),
  revoked: integer("revoked").notNull().default(0), confirmedAt: integer("confirmed_at"), createdAt: integer("created_at").notNull(),
  currentSession: text("current_session"), leaseEpoch: integer("lease_epoch").notNull().default(0),
  workerId: text("worker_id"), workerExpires: integer("worker_expires").notNull().default(0), lastSeen: integer("last_seen").notNull().default(0),
  blockedBroadcast: text("blocked_broadcast"),
  heartbeatSeq: integer("heartbeat_seq").notNull().default(0),
  heartbeatWriteToken: text("heartbeat_write_token"),
}, t => [index("sb_devices_owner_idx").on(t.ownerId)]);
export const sessions = sqliteTable("sb_sessions", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(),
  broadcastId: text("broadcast_id").notNull(), requestId: text("request_id").notNull(), bodyHash: text("body_hash").notNull(),
  state: text("state").notNull(), captureState: text("capture_state").notNull(), createdAt: integer("created_at").notNull(),
  eventClock: text("event_clock"),
  blocked: integer("blocked").notNull().default(0),
  mode: text("mode").notNull().default("broadcast"),
  diagnosticEnabled: integer("diagnostic_enabled").notNull().default(0),
  controlEpoch: integer("control_epoch").notNull().default(0),
  lastToolAt: integer("last_tool_at").notNull().default(0),
  stopReason: text("stop_reason"), stoppedAt: integer("stopped_at"),
  mouseEnabled: integer("mouse_enabled").notNull().default(0), mouseUntil: integer("mouse_until").notNull().default(0),
  controlProtocol:text("control_protocol").notNull().default("legacy"),
  grantSource:text("grant_source"),
  idleSeconds:integer("idle_seconds").notNull().default(0),
  uiGeneration:text("ui_generation"),uiBlocked:integer("ui_blocked").notNull().default(1),
  inputEnd: integer("input_end").notNull().default(0),
  mouseGrantRequest: text("mouse_grant_request"),
}, t => [uniqueIndex("sb_sessions_request_idx").on(t.deviceId, t.requestId)]);
export const shareControl = sqliteTable("sb_share_control", {
  ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(), broadcastId: text("broadcast_id").notNull(),
  controlProtocol:text("control_protocol").notNull().default("legacy"),
  automatic: integer("automatic").notNull().default(0), stopped: integer("stopped").notNull().default(0),
  intentSeq: integer("intent_seq").notNull().default(0),
}, t => [primaryKey({ columns: [t.ownerId,t.deviceId,t.broadcastId] })]);
export const probes = sqliteTable("sb_clock_probes", {
  eventClock: text("event_clock"),
  id: text("id").primaryKey(), deviceId: text("device_id").notNull(), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const refreshes = sqliteTable("sb_refreshes", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(), sessionId: text("session_id").notNull(),
  broadcastId: text("broadcast_id").notNull(), state: text("state").notNull(), workerId: text("worker_id"), leaseEpoch: integer("lease_epoch"),
  createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(), minSeq: integer("min_seq").notNull(),
  minCaptureMono: real("min_capture_mono").notNull(), error: text("error"),
}, t => [index("sb_refresh_claim_idx").on(t.deviceId, t.sessionId, t.state, t.expiresAt)]);
export const frames = sqliteTable("sb_frames", {
  deviceId: text("device_id").primaryKey(), ownerId: text("owner_id").notNull(), sessionId: text("session_id").notNull(),
  frameId: text("frame_id").notNull(), frameSeq: integer("frame_seq").notNull(), leaseEpoch: integer("lease_epoch").notNull(),
  imageKey: text("image_key").notNull(), sha256: text("sha256").notNull(), metadata: text("metadata").notNull(),
  captureLower: real("capture_lower"), receivedAt: integer("received_at").notNull(), expiresAt: integer("expires_at").notNull(),
  storageReady: integer("storage_ready").notNull().default(1),
  inlineJpeg: text("inline_jpeg"),
  repeatPresentedAt: real("repeat_presented_at"),
  repeatReceivedAt: integer("repeat_received_at"),
  repeatPhoneMonoMS: real("repeat_phone_mono_ms"),
  repeatSequence: integer("repeat_sequence").notNull().default(0),
});
export const observations = sqliteTable("sb_observations", {
  id: text("id").primaryKey(), deviceId: text("device_id").notNull(), frameId: text("frame_id").notNull(), createdAt: integer("created_at").notNull(),
  acceptanceJson: text("acceptance_json"),
}, t => [index("sb_observations_created_idx").on(t.createdAt)]);
export const releasedSystemSearchFieldProofs = sqliteTable("sb_released_system_search_field_proofs", {
  ownerId: text("owner_id").notNull(),
  deviceId: text("device_id").notNull(),
  commandId: text("command_id").notNull(),
  frameId: text("frame_id").notNull(),
  proof: text("proof").notNull(),
  sourceJson: text("source_json"),
  expiresAt: real("expires_at").notNull(),
}, t => [
  primaryKey({ columns: [t.ownerId, t.deviceId, t.commandId, t.frameId] }),
  index("sb_released_system_search_field_expiry").on(t.expiresAt),
]);
export const screenTexts = sqliteTable("sb_screen_texts", {
  deviceId: text("device_id").primaryKey(), ownerId: text("owner_id").notNull(), sessionId: text("session_id").notNull(),
  frameId: text("frame_id").notNull(), frameSeq: integer("frame_seq").notNull(), leaseEpoch: integer("lease_epoch").notNull(),
  captureMono: real("capture_mono").notNull(), orientationEpoch: integer("orientation_epoch").notNull(),
  metadata: text("metadata").notNull(), payload: text("payload").notNull(), captureLower: real("capture_lower"),
  receivedAt: integer("received_at").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const manualRequests = sqliteTable("sb_manual_requests", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(), message: text("message").notNull(),
  state: text("state").notNull(), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const rateWindows = sqliteTable("sb_rate_windows", {
  id: text("id").primaryKey(), count: integer("count").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const metrics = sqliteTable("sb_metrics", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(), kind: text("kind").notNull(),
  frameId: text("frame_id"), bytes: integer("bytes").notNull(), durationMs: real("duration_ms").notNull(),
  decodeMs: real("decode_ms"), storeMs: real("store_ms"), createdAt: integer("created_at").notNull(),
  detail: text("detail_json"),
}, t => [index("sb_metrics_device_time_idx").on(t.ownerId, t.deviceId, t.createdAt),index("sb_metrics_created_idx").on(t.createdAt)]);
export const voiceBench = sqliteTable("sb_voice_bench", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(),
  scenario: text("scenario").notNull(), createdAt: integer("created_at").notNull(), completedAt: integer("completed_at"),
  firstResponseMs: real("first_response_ms"), totalMs: real("total_ms"),
}, t => [index("sb_voice_bench_owner_time_idx").on(t.ownerId, t.createdAt)]);

export const hardware = sqliteTable("sb_hardware", {
  deviceId: text("device_id").primaryKey(), ownerId: text("owner_id").notNull(),
  hardwareId: text("hardware_id").notNull(), boardBootId: text("board_boot_id").notNull(),
  metadata: text("metadata").notNull(), usbConnected: integer("usb_connected").notNull().default(0),
});
export const ledCommands = sqliteTable("sb_led_commands", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(),
  sessionId: text("session_id").notNull(), hardwareId: text("hardware_id").notNull(), boardBootId: text("board_boot_id").notNull(),
  requestedOn: integer("requested_on").notNull(), idempotencyKey: text("idempotency_key").notNull(), replayKeyVersion:integer("replay_key_version").notNull().default(0),
  state: text("state").notNull(), workerId: text("worker_id"), leaseEpoch: integer("lease_epoch"), controlEpoch: integer("control_epoch").notNull(),
  createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(),
  receipt: text("receipt"), resultDigest: text("result_digest"), error: text("error"),
}, t => [uniqueIndex("sb_led_idempotency_idx").on(t.ownerId, t.deviceId, t.idempotencyKey), index("sb_led_claim_idx").on(t.deviceId, t.sessionId, t.state, t.expiresAt)]);

export const mouseCommands = sqliteTable("sb_mouse_commands", {
  cancelRequested: integer("cancel_requested").notNull().default(0),
  cancelReceipt: text("cancel_receipt"),
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(),
  sessionId: text("session_id").notNull(), hardwareId: text("hardware_id").notNull(), boardBootId: text("board_boot_id").notNull(),
  kind: text("kind").notNull(), payload: text("payload").notNull(), digest: text("digest").notNull(), idempotencyKey: text("idempotency_key").notNull(), replayKeyVersion:integer("replay_key_version").notNull().default(0),
  precondition: text("precondition"),
  predecessorId: text("predecessor_id"),
  state: text("state").notNull(), workerId: text("worker_id"), leaseEpoch: integer("lease_epoch"), controlEpoch: integer("control_epoch").notNull(),
  createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(), receipt: text("receipt"), resultDigest: text("result_digest"), error: text("error"),
  phoneAckMonoMs: real("phone_ack_mono_ms"), eventClock: text("event_clock"),
  inputAttempted: integer("input_attempted"),
}, t => [
  uniqueIndex("sb_mouse_idempotency_idx").on(t.ownerId,t.deviceId,t.idempotencyKey),
  index("sb_mouse_claim_idx").on(t.deviceId,t.sessionId,t.state,t.expiresAt),
  index("sb_mouse_active_device_idx").on(t.deviceId,t.state)
    .where(sql`${t.state} IN ('queued','claimed','executing','embedded')`),
  uniqueIndex("sb_pointer_successor_idx").on(t.ownerId,t.deviceId,t.predecessorId).where(sql`${t.predecessorId} IS NOT NULL`),
]);

export const appSearchQueries = sqliteTable("sb_app_search_queries", {
  id: text("id").notNull(), ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(),
  digest: text("digest").notNull(), createdAt: integer("created_at").notNull(),
  finishedAt: integer("finished_at"), reason: text("reason"), nativeReviewState: text("native_review_state"),
}, t => [primaryKey({columns:[t.ownerId,t.id]})]);

// Capability only, not authority. Its exact live scope must match every use.
export const mousePointReady = sqliteTable("sb_mouse_point_ready", {
  deviceId:text("device_id").primaryKey(),ownerId:text("owner_id").notNull(),sessionId:text("session_id").notNull(),
  workerId:text("worker_id").notNull(),leaseEpoch:integer("lease_epoch").notNull(),controlEpoch:integer("control_epoch").notNull(),
  protocol:text("protocol").notNull(),updatedAt:integer("updated_at").notNull(),
});

export const browseCalibrations = sqliteTable("sb_browse_calibrations", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(),
  requestId: text("request_id").notNull(), digest: text("digest").notNull(),
  hardwareId: text("hardware_id").notNull(), boardBootId: text("board_boot_id").notNull(), descriptor: text("descriptor").notNull(),
  settingsHash: text("settings_hash").notNull(), orientationEpoch: integer("orientation_epoch").notNull(),
  sourceWidth: integer("source_width").notNull(), sourceHeight: integer("source_height").notNull(),
  proof: text("proof").notNull(), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(),
}, t => [uniqueIndex("sb_browse_calibration_request").on(t.deviceId, t.requestId)]);
export const browseReady = sqliteTable("sb_browse_ready", {
  deviceId: text("device_id").primaryKey(), ownerId: text("owner_id").notNull(), sessionId: text("session_id").notNull(),
  workerId: text("worker_id").notNull(), leaseEpoch: integer("lease_epoch").notNull(), controlEpoch: integer("control_epoch").notNull(),
  protocol: text("protocol").notNull(), calibrationId: text("calibration_id").notNull(), settingsHash: text("settings_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});
// Ephemeral phone-attested perception readiness, separate from control grants.
export const pointerReady = sqliteTable("sb_pointer_ready", {
  deviceId: text("device_id").primaryKey(), ownerId: text("owner_id").notNull(),
  sessionId: text("session_id").notNull(), workerId: text("worker_id").notNull(),
  leaseEpoch: integer("lease_epoch").notNull(), controlEpoch: integer("control_epoch").notNull(),
  calibrationId: text("calibration_id").notNull(), profileId: text("profile_id").notNull(),
  sourceGeneration: integer("source_generation").notNull(), scopeJson: text("scope_json").notNull(),
  expiresAt: integer("expires_at").notNull(),
  prefetchProtocol: text("prefetch_protocol"),
});
export const browseRuns = sqliteTable("sb_browse_runs", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(),
  intentKey: text("intent_key").notNull(), replayKeyVersion:integer("replay_key_version").notNull().default(0), intentDigest: text("intent_digest").notNull(),
  sessionId: text("session_id").notNull(), broadcastId: text("broadcast_id").notNull(),
  workerId: text("worker_id").notNull(), leaseEpoch: integer("lease_epoch").notNull(), controlEpoch: integer("control_epoch").notNull(),
  hardwareId: text("hardware_id").notNull(), boardBootId: text("board_boot_id").notNull(), hardwareMetadata: text("hardware_metadata").notNull(),
  calibrationId: text("calibration_id").notNull(), settingsHash: text("settings_hash").notNull(), orientationEpoch: integer("orientation_epoch").notNull(),
  state: text("state").notNull(), queueJson: text("queue_json").notNull(), planKeysJson: text("plan_keys_json").notNull(),
  tailStepId: text("tail_step_id"), nextIndex: integer("next_index").notNull().default(0), revision: integer("revision").notNull().default(0),
  leaseSeq: integer("lease_seq").notNull().default(0), leaseRequestId: text("lease_request_id"), lastLeaseId: text("last_lease_id"),
  inputJson: text("input_json"), checkpointSeq: integer("checkpoint_seq").notNull().default(0), checkpointJson: text("checkpoint_json"),
  error: text("error"), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(), headExpiresAt: integer("head_expires_at"),
}, t => [
  uniqueIndex("sb_browse_run_intent").on(t.ownerId, t.deviceId, t.intentKey),
  uniqueIndex("sb_browse_run_active_device").on(t.deviceId).where(sql`${t.state} = 'active'`),
  index("sb_browse_scope_lock").on(t.deviceId,t.sessionId,t.controlEpoch,t.state),
]);
export const browseLeases = sqliteTable("sb_browse_leases", {
  id: text("id").primaryKey(), runId: text("run_id").notNull(), seq: integer("seq").notNull(),
  requestId: text("request_id").notNull(), issuedAt: integer("issued_at").notNull(), expiresAt: integer("expires_at").notNull(),
}, t => [uniqueIndex("sb_browse_lease_seq").on(t.runId, t.seq)]);
export const browseJournal = sqliteTable("sb_browse_journal", {
  stepId: text("step_id").primaryKey(), runId: text("run_id").notNull(), planId: text("plan_id").notNull(), stepIndex: integer("step_index").notNull(),
  inputDigest: text("input_digest").notNull(), observationDigest: text("observation_digest").notNull(), evidence: text("evidence").notNull(),
  createdAt: integer("created_at").notNull(),
}, t => [index("sb_browse_journal_run").on(t.runId, t.stepIndex)]);

export const browseImages = sqliteTable("sb_browse_images", {
  runId: text("run_id").primaryKey(), ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(), sessionId: text("session_id").notNull(),
  stepId: text("step_id").notNull(), frameId: text("frame_id").notNull(), checkpointSeq: integer("checkpoint_seq").notNull(),
  imageKey: text("image_key").notNull(), sha256: text("sha256").notNull(), imageDigest: text("image_digest").notNull(), metadata: text("metadata").notNull(),
  captureLower: integer("capture_lower").notNull(), expiresAt: integer("expires_at").notNull(),
}, t => [index("sb_browse_image_expiry").on(t.expiresAt)]);

// Diagnostic-only, bounded metadata; no tool arguments, identities or image contents.
export const timingJournal = sqliteTable("sb_timing_journal", {
  id: integer("id").primaryKey({autoIncrement:true}), recordKey:text("record_key").notNull().unique(),
  receivedUTC:integer("received_utc_ms").notNull(), dataJSON:text("data_json").notNull(),
}, t=>[index("sb_timing_journal_received").on(t.receivedUTC)]);

// L04 safety metadata intentionally survives erasure; it contains no credentials/content.
export const erasureJobs = sqliteTable("sb_erasure_jobs", {
  id: text("id").primaryKey(), scope: text("scope").notNull(), ownerId: text("owner_id"),
  deviceId: text("device_id"), sessionId: text("session_id"), state: text("state").notNull(),
  requestedAt: integer("requested_at").notNull(), updatedAt: integer("updated_at").notNull(),
  fenced: integer("fenced").notNull().default(0), phase: integer("phase").notNull().default(0),
  deletedRows: integer("deleted_rows").notNull().default(0), deletedObjects: integer("deleted_objects").notNull().default(0),
  error: text("error"), lockToken: text("lock_token"), lockUntil: integer("lock_until").notNull().default(0),
  r2Cursor: text("r2_cursor"), r2VerifiedAt: integer("r2_verified_at"),
}, t=>[index("sb_erasure_scope").on(t.deviceId,t.sessionId)]);
export const storageWrites = sqliteTable("sb_storage_writes", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), deviceId: text("device_id").notNull(),
  sessionId: text("session_id").notNull(), imageKey: text("image_key").notNull(), startedAt: integer("started_at").notNull(),
  isGC: integer("is_gc").notNull().default(0),
}, t=>[index("sb_storage_write_scope").on(t.deviceId,t.sessionId),index("sb_storage_write_key").on(t.imageKey)]);

export const maintenanceState=sqliteTable('sb_maintenance_state',{
 d1PlacementJson:text('d1_placement_json'),
 id:integer('id').primaryKey(),dueAt:integer('due_at').notNull().default(0),lockToken:text('lock_token'),lockUntil:integer('lock_until').notNull().default(0),
 prefix:text('prefix').notNull().default('screens/'),cursor:text('cursor'),lastSuccessAt:integer('last_success_at'),lastAttemptAt:integer('last_attempt_at'),
 failures:integer('failures').notNull().default(0),backlog:integer('backlog').notNull().default(0),overloaded:integer('overloaded').notNull().default(0),
});
export const maintenanceRuns=sqliteTable('sb_maintenance_runs',{
 id:text('id').primaryKey(),source:text('source').notNull(),startedAt:integer('started_at').notNull(),finishedAt:integer('finished_at'),state:text('state').notNull(),
 d1Changes:integer('d1_changes').notNull().default(0),deletedObjects:integer('deleted_objects').notNull().default(0),backlog:integer('backlog').notNull().default(0),
 backlogCapped:integer('backlog_capped').notNull().default(0),error:text('error'),
},t=>[index('sb_maintenance_run_time').on(t.startedAt)]);
