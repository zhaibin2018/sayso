import { createHash } from "node:crypto";
import { deferBridgeTask } from "./bridge-context.ts";
import { debugObject,journalDebugData } from "./debug-scope.ts";
import { minimalCallProjection } from "./minimal-call-journal.ts";
import {completeActionJournalScope,writeProductionJournal} from "./action-journal.ts";
import type { McpPerformance } from "./mcp-performance.ts";
import { runtimeVersion } from "./runtime-identity.ts";
import { completeCallImageProjection } from "./call-image-journal.ts";

type Call = { owner: string; method: string | null; tool: string | null;
  mcp_session_hash: string | null; parameters: Record<string, unknown> };
const calls = new WeakMap<McpPerformance, Call>();
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** Only scalar allowlisted arguments survive; identifiers become presence flags. */
export function completeCallParameters(value: unknown) {
  const args = debugObject(value), safe: Record<string, unknown> = {};
  for (const key of ["result_projection", "wait_for_new_ms", "max_age_ms", "after_command_min_gap_ms",
    "include_read_timing", "settle_ms", "submit", "clear_before_input"])
    if (Object.hasOwn(args, key) && (args[key] === null || typeof args[key] === "string" ||
      typeof args[key] === "boolean" || (typeof args[key] === "number" && Number.isFinite(args[key])))) safe[key] = args[key];
  for (const key of ["if_unchanged_since", "after_command_id", "device_id", "source_frame_id", "idempotency_key"])
    safe[key] = args[key] !== undefined && args[key] !== null;
  if (typeof args.text === "string") safe.text_chars = Array.from(args.text).length;
  return safe;
}

export function captureCompleteCall(trace: McpPerformance, owner: string, body: unknown, session: string | null) {
  const rpc = debugObject(body), params = debugObject(rpc.params);
  calls.set(trace, { owner, method: typeof rpc.method === "string" ? rpc.method : null,
    tool: rpc.method === "tools/call" && typeof params.name === "string" ? params.name : null,
    mcp_session_hash: session ? digest(session).slice(0, 24) : null,
    parameters: rpc.method === "tools/call" ? completeCallParameters(params.arguments) : {} });
}

/** A separate deferred batch, never the business-write queue. No D1 I/O before yield. */
export function recordCompleteCall(db: () => D1Database, trace: McpPerformance,
  startUTC: number, startMono: number, endUTC: number, endMono: number,
  body: unknown, bytes: number | null, exception = false, response?: Response) {
  const call = calls.get(trace);
  if (!call) return;
  const data = { schema_version: 2, record_kind: "complete_call", runtime_version: runtimeVersion,
    method: call.method, rpc: call.method, tool: call.tool, request_id: trace.requestID,
    mcp_session_hash: call.mcp_session_hash, parameters: call.parameters,
    scope_owner_hash: digest(call.owner), scope_kind: "owner", scope_device_ids: [], device_states: [],
    coverage: "wait_until_per_request", received_utc_ms: startUTC, fetch_utc_ms: startUTC,
    released_utc_ms: endUTC, started_mono_ms: startMono, released_mono_ms: endMono,
    boundary_elapsed_ms: Math.max(0, endMono - startMono), cross_instance_utc_uncertainty_ms: null,
    ...minimalCallProjection(body, bytes),
    ...(exception ? { outcome: "error", error_code: "UNHANDLED_EXCEPTION" } : {}) };
  // Projection is frozen at release; JSON encoding, DB acquisition and writes run later.
  deferBridgeTask(async () => {
    let finalBody = body;
    if(response){const raw=await response.arrayBuffer();let value:unknown=null;try{value=JSON.parse(new TextDecoder().decode(raw));}catch{}
      finalBody=value;Object.assign(data,minimalCallProjection(value,raw.byteLength));}
    Object.assign(data, completeCallImageProjection(trace, finalBody));
    const database = db();
    try{Object.assign(data,await journalDebugData(database,trace,debugObject(debugObject(debugObject(finalBody).result).structuredContent),endUTC));}
    catch{/* Keep the call even when the optional device-state snapshot is unavailable. */}
    try{Object.assign(data,await completeActionJournalScope(database,trace,call.owner,finalBody));}
    catch{/* An enrichment miss cannot discard the complete call or change its response. */}
    await writeProductionJournal(database,"minimal:"+trace.requestID,startUTC,data);
  });
}
