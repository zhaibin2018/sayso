import { AsyncLocalStorage } from "node:async_hooks";
import { BridgeError } from "./bridge-engine.ts";
import { deferBridgeDiagnostic } from "./bridge-context.ts";
import { frameD1Diagnostic } from "./frame-d1-diagnostic.ts";

export const frameErrorStages = [
  "METADATA_PARSE",
  "BODY_READ",
  "AUTH_SNAPSHOT",
  "BUSINESS_CHECK",
  "REJECTION_RECORD",
  "FRAME_TRANSACTION",
  "FRAME_TRANSACTION_PREPARE",
  "FRAME_TRANSACTION_PREFLIGHT",
  "FRAME_TRANSACTION_PLACEMENT_PREPARE",
  "FRAME_TRANSACTION_BATCH",
  "FRAME_TRANSACTION_PLACEMENT_OBSERVE",
  "R2_PUT",
  "R2_HEAD",
  "R2_CLEANUP",
  "RETURN",
  "ATOMIC_RECHECK",
  "FALLBACK",
] as const;
type Stage = (typeof frameErrorStages)[number];
type IDs = { device_id?: string; session_id?: string; broadcast_id?: string; frame_id?: string };
type State = IDs & {
  request_id: string;
  route: "/v1/device/frame" | "/v1/device/frame-observation";
  stage: Stage;
  business_reason?: "OLD_CAPTURE" | "CLOCK_UNCERTAIN";
  logged: Set<unknown>;
  active: boolean;
  failed_statement_index?: number | null;
  frame_statement_count?: number;
  batch_prefix_count?: number;
  batch_journal_count?: number;
  placement_statement_count?: number;
};
const context = new AsyncLocalStorage<State>();
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const businessCodes = new Set(
  (
    "UNAUTHENTICATED STALE_SESSION STALE_LEASE CAPTURE_PAUSED FRAME_ID_REUSED OLD_FRAME OLD_ORIENTATION " +
    "OLD_CAPTURE CLOCK_UNCERTAIN INVALID_REFRESH INVALID_CLOCK_PROBE STALE_FRAME_OR_LEASE NEED_IMAGE " +
    "UNKNOWN_FRAME_FIELD INVALID_UUID INVALID_NUMBER IMAGE_TOO_LARGE INVALID_ORIENTATION INVALID_CAPTURE_TIME " +
    "INVALID_HASH SIMULATION_DISABLED INVALID_READY_CUE INVALID_CLOCK_METADATA UNSUPPORTED_TRANSFORM " +
    "INVALID_CLIENT_TIMING INVALID_BODY INVALID_CONTENT_LENGTH HASH_MISMATCH DIMENSION_MISMATCH INVALID_IMAGE " +
    "BODY_TOO_LARGE METADATA_TIMEOUT JPEG_REQUIRED EVENT_CLOCK_INVALID_BODY EVENT_CLOCK_HEADER " +
    "EVENT_CLOCK_DOWNGRADE EVENT_CLOCK_SCOPE_CHANGED EVENT_CLOCK_PROBE_SCOPE_CHANGED SIGNING_CONFIGURATION_INVALID"
  ).split(" "),
);
// Literal schema identifiers only. Neither a matched suffix nor any SQL/bind value is copied.
const schemaNames = [
  "sb_observations.id",
  "sb_observations.device_id",
  "sb_observations.frame_id",
  "sb_observations.created_at",
  "sb_observations.acceptance_json",
  ..."device_id owner_id session_id frame_id frame_seq lease_epoch image_key sha256 metadata capture_lower received_at expires_at storage_ready inline_jpeg"
    .split(" ")
    .map((c) => "sb_frames." + c),
  ..."id owner_id device_id kind frame_id bytes duration_ms decode_ms store_ms created_at detail_json"
    .split(" ")
    .map((c) => "sb_metrics." + c),
  "sb_maintenance_state.d1_placement_json",
  "sb_sessions.event_clock",
  "sb_hardware.metadata",
] as const;

export function withFrameErrors<T>(request: Request, work: () => Promise<T>): Promise<T> {
  const route = new URL(request.url).pathname;
  if (
    request.method !== "POST" ||
    (route !== "/v1/device/frame" && route !== "/v1/device/frame-observation")
  )
    return work();
  const ray = request.headers.get("cf-ray");
  const request_id = ray && /^[0-9a-f]{16}(?:-[A-Z]{3})?$/.test(ray) ? ray : crypto.randomUUID();
  const state: State = {
    request_id,
    route,
    stage: "METADATA_PARSE",
    logged: new Set(),
    active: true,
  };
  return context.run(state, async () => {
    try {
      return await work();
    } finally {
      state.active = false;
    }
  });
}
export function frameStage(stage: Stage, business_reason?: State["business_reason"]) {
  const state = context.getStore();
  if (state?.active) {
    state.stage = stage;
    state.business_reason = business_reason;
    state.failed_statement_index = undefined;
    state.frame_statement_count = undefined;
    state.batch_prefix_count = undefined;
    state.batch_journal_count = undefined;
    state.placement_statement_count = undefined;
  }
}
/** Zero-based index within the original frame plan, before hot-path prefixes. */
export function frameStatement(index: number) {
  const state = context.getStore();
  if (state?.active) {
    state.stage = "FRAME_TRANSACTION_PREPARE";
    state.failed_statement_index = index;
  }
}
export function frameTransactionBatch(count: number) {
  const state = context.getStore();
  if (state?.active) {
    state.stage = "FRAME_TRANSACTION_BATCH";
    state.failed_statement_index = null;
    state.frame_statement_count = count;
  }
}
/** Existing calls only: phase boundaries cannot add a database await. */
export function frameTransactionPhase(
  stage: Stage,
  prefix?: number,
  journal?: number,
  placement?: number,
) {
  const state = context.getStore();
  if (!state?.active || state.frame_statement_count === undefined) return;
  state.stage = stage;
  if (prefix !== undefined) state.batch_prefix_count = prefix;
  if (journal !== undefined) state.batch_journal_count = journal;
  if (placement !== undefined) state.placement_statement_count = placement;
}
/** Call only after existing authentication/metadata checks; scope comes from the verified row/permit. */
export function verifiedFrameIDs(
  device: string,
  meta?: Record<string, unknown>,
  scope?: { id: string; broadcast_id: string },
) {
  const state = context.getStore();
  if (!state?.active || !uuid.test(device)) return;
  state.device_id = device.toLowerCase();
  if (typeof meta?.frame_id === "string" && uuid.test(meta.frame_id))
    state.frame_id = meta.frame_id.toLowerCase();
  if (
    scope &&
    scope.id === meta?.bridge_session_id &&
    scope.broadcast_id === meta?.broadcast_id &&
    uuid.test(scope.id) &&
    uuid.test(scope.broadcast_id)
  ) {
    state.session_id = scope.id.toLowerCase();
    state.broadcast_id = scope.broadcast_id.toLowerCase();
  }
}
function messages(error: unknown): string {
  const parts: string[] = [],
    seen = new Set<unknown>();
  // D1 may embed the long prepared statement before the actual reason. Scan
  // both ends in memory; only the fixed enum projection ever leaves this function.
  const bounded = (value: string) =>
    value.length <= 16384 ? value : value.slice(0, 8192) + "\n" + value.slice(-8192);
  let current = error;
  for (let depth = 0; current != null && !seen.has(current) && depth < 4; depth++) {
    seen.add(current);
    if (typeof current === "string") {
      parts.push(bounded(current));
      break;
    }
    if (typeof current !== "object") break;
    // D1 wrappers may carry cross-realm/plain causes. Read data properties only,
    // never getters, SQL, parameter arrays, or arbitrary object serialization.
    const message = Object.getOwnPropertyDescriptor(current, "message")?.value;
    if (typeof message === "string") parts.push(bounded(message));
    current = Object.getOwnPropertyDescriptor(current, "cause")?.value;
  }
  return parts.join("\n");
}
export function classifyFrameException(error: unknown, stage: Stage) {
  if (error instanceof BridgeError)
    return {
      exception: "BUSINESS_REJECT",
      reason: businessCodes.has(error.code) ? error.code : "OTHER_BUSINESS",
    };
  const message = messages(error);
  const exact = frameD1Diagnostic(error);
  const trigger = exact.d1_message_match !== "UNMATCHED" ? exact.schema_message : undefined;
  const constraint = message.match(
    /\b(UNIQUE|NOT NULL|FOREIGN KEY|CHECK) constraint failed(?:: ([a-z_]+\.[a-z_]+))?/i,
  );
  if (trigger || constraint) {
    const kind = constraint?.[1].toUpperCase().replaceAll(" ", "_");
    const name = schemaNames.find((name) => name === constraint?.[2]);
    return {
      exception: "D1_CONSTRAINT",
      constraint: trigger ?? kind + (name ? ":" + name : ":OTHER"),
    };
  }
  const reasons: [RegExp, string][] = [
    [/Cannot perform I\/O on behalf of a different request|I\/O.*different request/i, "D1_IO_CONTEXT"],
    [/Expression tree is too large/i, "D1_EXPRESSION_DEPTH"],
    [/too many levels of trigger recursion/i, "D1_TRIGGER_RECURSION"],
    [/parser stack overflow/i, "D1_PARSER_STACK"],
    [/too many columns/i, "D1_COLUMN_LIMIT"],
    [/too many terms in compound SELECT/i, "D1_COMPOUND_SELECT_LIMIT"],
    [/too many arguments on function/i, "D1_FUNCTION_ARGUMENT_LIMIT"],
    [/too many bound parameters|too many parameters/i, "D1_VARIABLE_LIMIT"],
    [/query string is too large|statement too long|SQL statement too long/i, "D1_SQL_LENGTH_LIMIT"],
    [/LIKE or GLOB pattern too complex/i, "D1_PATTERN_LIMIT"],
    [/out of memory/i, "D1_MEMORY_LIMIT"],
    [/database schema has changed/i, "D1_SCHEMA_CHANGED"],
    [/datatype mismatch/i, "D1_SQLITE_TYPE_MISMATCH"],
    [/Failed to parse body as JSON/i, "D1_INVALID_UPSTREAM_JSON"],
    [/SQL logic error/i, "D1_SQL_ERROR"],
    [
      /cannot start a transaction|cannot commit|cannot rollback|use the.*transaction.*API/i,
      "D1_TRANSACTION_CONTROL",
    ],
    [/free tier daily row write limit/i, "D1_DAILY_ROW_WRITE_LIMIT"],
    [/free tier daily row read limit/i, "D1_DAILY_ROW_READ_LIMIT"],
    [/maximum account storage limit/i, "D1_ACCOUNT_STORAGE_LIMIT"],
    [/Exceeded maximum DB size/i, "D1_DATABASE_SIZE_LIMIT"],
    [/No SQL statements detected/i, "D1_NO_STATEMENTS"],
    [/Requests queued for too long/i, "D1_QUEUE_TIMEOUT"],
    [/Too many requests queued/i, "D1_QUEUE_FULL"],
    [/Too many resources consumed within a 10 second window/i, "D1_RESOURCE_RATE_LIMIT"],
    [/D1 DB is overloaded/i, "D1_OVERLOADED"],
    [/exceeded its memory limit/i, "D1_MEMORY_RESET"],
    [/exceeded its CPU time limit/i, "D1_CPU_RESET"],
    [/storage operation exceeded timeout/i, "D1_STORAGE_TIMEOUT"],
    [/\btimeout\b|\btimed out\b/i, "D1_TIMEOUT"],
    [/query result exceeded the maximum response size/i, "D1_RESPONSE_SIZE_LIMIT"],
    [/reset because its code was updated/i, "D1_CODE_RESET"],
    [/Internal error while starting up D1 DB storage/i, "D1_STARTUP_RESET"],
    [/Internal error in D1 DB storage/i, "D1_STORAGE_RESET"],
    [/Cannot resolve D1 DB due to transient issue/i, "D1_RESOLVE_TRANSIENT"],
    [/Network connection lost/i, "D1_NETWORK_LOST"],
    [/Replica disconnected from primary/i, "D1_REPLICA_DISCONNECTED"],
    [/read from request stream because client disconnected/i, "D1_CLIENT_DISCONNECTED"],
    [/too many SQL variables/i, "D1_VARIABLE_LIMIT"],
    [/too many SQL statements|too many statements in.*batch/i, "D1_STATEMENT_LIMIT"],
    [/too many subrequests|too many API requests/i, "D1_SUBREQUEST_LIMIT"],
    [/\bSQLITE_READONLY\b|readonly database|read-only database/i, "D1_READ_ONLY"],
    [/\bSQLITE_AUTH\b|not authorized/i, "D1_SQL_AUTH"],
    [/\bSQLITE_FULL\b|database or disk is full/i, "D1_STORAGE_FULL"],
    [/\bSQLITE_CORRUPT\b|database disk image is malformed/i, "D1_CORRUPT"],
    [/no such function/i, "D1_NO_SUCH_FUNCTION"],
    [/D1_COLUMN_NOTFOUND/i, "D1_NO_SUCH_COLUMN"],
    [/internal error/i, "D1_INTERNAL"],
    [/\bD1_TYPE_ERROR\b|Type '[^']{1,40}' not supported for value/i, "D1_UNSUPPORTED_TYPE"],
    [/wrong number of (?:parameter|binding)|number of (?:bound )?parameters/i, "D1_BIND_COUNT"],
    [/\bno such column\b|has no column named/i, "D1_NO_SUCH_COLUMN"],
    [/\bno such table\b/i, "D1_NO_SUCH_TABLE"],
    [/\bmalformed JSON\b/i, "D1_MALFORMED_JSON"],
    [/JSON path error|bad JSON path/i, "D1_JSON_PATH"],
    [/\bSQLITE_BUSY\b|database is locked/i, "D1_BUSY"],
    [/\bSQLITE_TOOBIG\b|string or blob too big/i, "D1_TOO_BIG"],
    [/\bSQLITE_ERROR\b|syntax error/i, "D1_SQL_ERROR"],
    [/\bD1_ERROR\b|\bD1_EXEC_ERROR\b|\bD1_RESET\b/i, "D1_UNCLASSIFIED"],
  ];
  const reason = reasons.find(([pattern]) => pattern.test(message))?.[1];
  if (reason) return { exception: "D1_OTHER", reason };
  if (error instanceof SyntaxError) return { exception: "JSON" };
  if (stage.startsWith("R2_") || /\bR2(?:Error|_ERROR)\b/.test(message)) return { exception: "R2" };
  if (stage === "BODY_READ") return { exception: "STREAM" };
  if (
    stage.startsWith("FRAME_TRANSACTION") ||
    ["AUTH_SNAPSHOT", "REJECTION_RECORD", "ATOMIC_RECHECK"].includes(stage)
  )
    return { exception: "D1_OTHER", reason: "D1_OTHER" };
  return { exception: "UNKNOWN" };
}
/** Error branches only. No I/O, free text, raw error objects, or added awaited work. */
export function logFrameFailure(error: unknown) {
  try {
    const state = context.getStore();
    if (!state?.active || state.logged.has(error)) return;
    state.logged.add(error);
    const {
      request_id,
      route,
      stage,
      device_id,
      session_id,
      broadcast_id,
      frame_id,
      business_reason,
    } = state;
    const projected = JSON.stringify({
      request_id,
      route,
      device_id,
      session_id,
      broadcast_id,
      frame_id,
      stage,
      ...classifyFrameException(error, stage),
      ...(stage.startsWith("FRAME_TRANSACTION")
        ? {
            ...frameD1Diagnostic(error),
            failed_statement_index: state.failed_statement_index ?? null,
            statement_index_basis:
              state.failed_statement_index == null ? "UNAVAILABLE" : "FRAME_PLAN_ZERO_BASED",
            frame_statement_count: state.frame_statement_count,
            batch_prefix_count: state.batch_prefix_count,
            batch_journal_count: state.batch_journal_count,
            placement_statement_count: state.placement_statement_count,
          }
        : {}),
      ...(business_reason ? { business_reason } : {}),
    });
    deferBridgeDiagnostic(() => {
      try {
        console.error(projected);
      } catch {
        /* Diagnostics cannot change a response. */
      }
    });
  } catch {
    /* Malformed exceptions and logging failures cannot replace the original error. */
  }
}
