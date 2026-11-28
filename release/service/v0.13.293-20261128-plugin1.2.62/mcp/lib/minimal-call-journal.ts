import { debugObject as object, debugUUID as uuid, getDebugScope } from "./debug-scope.ts";
import type { McpPerformance } from "./mcp-performance.ts";
import { runtimeVersion } from "./runtime-identity.ts";
import { createHash } from "node:crypto";
import { debugCode } from "./debug-reasons.ts";

export const minimalCallTTL = 86_400_000;
const perDevice = 200,
  globalCap = 2000,
  queueCap = 200,
  batchCap = 16;
const aliases = new WeakMap<object, object>();
type Entry = {
  owner: string;
  device: string | null;
  session: string | null;
  command: string | null;
  data: Record<string, unknown>;
};
type Queue = { entries: Entry[]; dropped: number };
const queues = new WeakMap<object, Queue>();
function root(db: object): object {
  return aliases.get(db) ?? db;
}
export function shareMinimalCalls(proxy: object, db: object) {
  aliases.set(proxy, root(db));
}
function queue(db: object) {
  const key = root(db);
  let q = queues.get(key);
  if (!q) {
    q = { entries: [], dropped: 0 };
    queues.set(key, q);
  }
  return q;
}
export const minimalCallQueueStatus = (db: object) => ({
  pending: queue(db).entries.length,
  dropped: queue(db).dropped,
});
const number = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const code = (v: unknown) => (typeof v === "string" ? debugCode(v) : null);
const utf8 = (v: unknown) =>
  new TextEncoder().encode(typeof v === "string" ? v : (JSON.stringify(v) ?? "")).byteLength;
const states = new Set([
  "queued",
  "claimed",
  "executing",
  "board_acked",
  "failed",
  "outcome_unknown",
  "cancelled",
  "expired",
  "available",
  "repeated",
  "unavailable",
  "pending",
  "unchanged",
  "paused",
  "error",
]);

/** Project the already-serialized FINAL envelope; never clone/decode image data. */
export function minimalCallProjection(body: unknown, responseBytes: number | null) {
  const envelope = object(body),
    result = object(envelope.result),
    summary = object(result.structuredContent);
  const blocks = Array.isArray(result.content) ? result.content.map(object) : [];
  const images = blocks.filter((b) => b.type === "image" && typeof b.data === "string");
  const chars = images.reduce((n, b) => n + (b.data as string).length, 0);
  const imageBytes = images.reduce((n, b) => {
    const s = b.data as string;
    return (
      n +
      Math.max(0, Math.floor((s.length * 3) / 4) - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0))
    );
  }, 0);
  return {
    outcome:
      result.isError === true || envelope.error !== undefined
        ? "error"
        : [
              "SEARCH_NOT_OPEN",
              "TEXT_UNCONFIRMED",
              "STOPPED",
              "OPERATION_ALREADY_STARTED",
              "OPERATION_UNCONFIRMED",
            ].includes(String(summary.code))
          ? "incomplete"
          : "ok",
    error_code:
      code(summary.error) ??
      ([-32700, -32600, -32601, -32602, -32603, -32001].includes(
        Number(object(envelope.error).code),
      )
        ? object(envelope.error).code
        : null),
    result_code: code(summary.code),
    reason_code: code(summary.reason),
    result_state: states.has(String(summary.state)) ? summary.state : null,
    image_count: images.length,
    image_bytes: imageBytes,
    base64_chars: chars,
    text_utf8_bytes: blocks.filter((b) => b.type === "text").reduce((n, b) => n + utf8(b.text), 0),
    structured_utf8_bytes: utf8(result.structuredContent),
    response_bytes: responseBytes ?? utf8(body),
  };
}

/** No database access. Tail persistence is deliberately coupled to later business writes. */
export function recordMinimalCall(
  db: D1Database,
  trace: McpPerformance,
  startUTC: number,
  startMono: number,
  endUTC: number,
  endMono: number,
  body: unknown,
  bytes: number | null,
  exception = false,
) {
  const scope = getDebugScope(trace),
    snapshot = trace.journalSnapshot();
  if (!scope || snapshot.rpc !== "tools/call") return;
  const summary = object(object(object(body).result).structuredContent);
  const metadata = object(summary.metadata ?? object(summary.after_screen).metadata);
  const data = {
    schema_version: 1,
    runtime_version: runtimeVersion,
    record_kind: "minimal_call",
    rpc: "tools/call",
    tool: snapshot.tool,
    request_id: trace.requestID,
    scope_owner_hash: createHash("sha256").update(scope.owner, "utf8").digest("hex"),
    received_utc_ms: startUTC,
    fetch_utc_ms: startUTC,
    released_utc_ms: endUTC,
    started_mono_ms: startMono,
    released_mono_ms: endMono,
    boundary_elapsed_ms: Math.max(0, endMono - startMono),
    cross_instance_utc_uncertainty_ms: null,
    ...minimalCallProjection(body, bytes),
    ...(exception ? { outcome: "error", error_code: "UNHANDLED_EXCEPTION" } : {}),
  };
  const q = queue(db);
  if (q.entries.length >= queueCap) {
    q.entries.shift();
    q.dropped++;
  }
  q.entries.push({
    owner: scope.owner,
    device: uuid(summary.device_id) ?? uuid(metadata.device_id) ?? scope.device,
    session: uuid(summary.bridge_session_id) ?? uuid(metadata.bridge_session_id) ?? scope.session,
    command:
      snapshot.tool === "open_app_search" && summary.state === "outcome_unknown"
        ? null
        : (uuid(summary.command_id) ?? scope.command),
    data,
  });
}

/** Append to ONE existing write batch. Never issue I/O or steal its result indexes. */
export function takeMinimalCalls(db: D1Database, now = Date.now()) {
  const q = queue(db),
    entries = q.entries.splice(0, batchCap);
  if (!entries.length)
    return { statements: [] as D1PreparedStatement[], complete: (_ok: boolean) => {} };
  const statements = entries.map((entry) =>
    !entry.device && !entry.session && !entry.command
      ? db
          .prepare(
            `INSERT INTO sb_timing_journal(record_key,received_utc_ms,data_json)
      SELECT ?,?,json_set(?,'$.scope_device_ids',json('[]'),'$.device_states',json('[]'),'$.scope_kind','owner','$.coverage','best_effort_next_existing_write')
      WHERE ?>=? AND NOT EXISTS(SELECT 1 FROM sb_erasure_jobs e WHERE e.fenced=1 AND e.scope='site')
      ON CONFLICT(record_key) DO UPDATE SET data_json=excluded.data_json`,
          )
          .bind(
            "minimal:" + entry.data.request_id,
            entry.data.received_utc_ms,
            JSON.stringify(entry.data),
            entry.data.received_utc_ms,
            now - minimalCallTTL,
          )
      : db
          .prepare(
            `INSERT INTO sb_timing_journal(record_key,received_utc_ms,data_json)
    SELECT ?,?,json_set(?, '$.scope_device_ids',json_array(d.id),'$.device_states',json_array(json_object('device_id',d.id,'session_id',?)),
      '$.command_id',?,'$.coverage','best_effort_next_existing_write')
    FROM sb_devices d LEFT JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id
    WHERE d.owner_id=? AND d.revoked=0 AND (? IS NULL OR d.id=?)
      AND (? IS NULL OR s.id=?) AND (? IS NULL OR EXISTS(SELECT 1 FROM sb_mouse_commands c WHERE c.id=? AND c.owner_id=d.owner_id AND c.device_id=d.id))
      AND (? IS NOT NULL OR ? IS NOT NULL OR ? IS NOT NULL OR (SELECT count(*) FROM sb_devices x WHERE x.owner_id=d.owner_id AND x.revoked=0)=1)
      AND ?>=? AND NOT EXISTS(SELECT 1 FROM sb_erasure_jobs e WHERE e.fenced=1 AND (e.scope='site' OR (e.device_id=d.id AND (e.scope='device' OR e.session_id=s.id))))
    ON CONFLICT(record_key) DO UPDATE SET data_json=excluded.data_json`,
          )
          .bind(
            "minimal:" + entry.data.request_id,
            entry.data.received_utc_ms,
            JSON.stringify(entry.data),
            entry.session,
            entry.command,
            entry.owner,
            entry.device,
            entry.device,
            entry.session,
            entry.session,
            entry.command,
            entry.command,
            entry.device,
            entry.session,
            entry.command,
            entry.data.received_utc_ms,
            now - minimalCallTTL,
          ),
  );
  statements.push(
    db
      .prepare(
        "DELETE FROM sb_timing_journal WHERE record_key LIKE 'minimal:%' AND received_utc_ms<?",
      )
      .bind(now - minimalCallTTL),
  );
  // Per-scope pruning cannot evict a different device's quota.
  statements.push(
    db
      .prepare(
        `DELETE FROM sb_timing_journal WHERE id IN (SELECT id FROM
    (SELECT id,row_number() OVER(PARTITION BY json_extract(data_json,'$.scope_owner_hash'),json_extract(data_json,'$.scope_device_ids[0]') ORDER BY received_utc_ms DESC,id DESC) AS n
      FROM sb_timing_journal WHERE record_key LIKE 'minimal:%') WHERE n>?)`,
      )
      .bind(perDevice),
  );
  statements.push(
    db
      .prepare(
        "DELETE FROM sb_timing_journal WHERE record_key LIKE 'minimal:%' AND id NOT IN (SELECT id FROM sb_timing_journal WHERE record_key LIKE 'minimal:%' ORDER BY received_utc_ms DESC,id DESC LIMIT ?)",
      )
      .bind(globalCap),
  );
  return {
    statements,
    complete: (ok: boolean) => {
      if (!ok) {
        q.entries.unshift(...entries);
        if (q.entries.length > queueCap) {
          q.dropped += q.entries.length - queueCap;
          q.entries.length = queueCap;
        }
      }
    },
  };
}
