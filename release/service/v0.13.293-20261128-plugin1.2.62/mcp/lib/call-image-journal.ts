import { createHash } from "node:crypto";
import { debugObject, debugUUID } from "./debug-scope.ts";
import { debugCode } from "./debug-reasons.ts";
import type { McpPerformance } from "./mcp-performance.ts";

/** Private metadata only: symbols survive internal spreads but never JSON encoding. */
export const callFrameIngress = Symbol("call_frame_ingress");
const releases = new WeakMap<McpPerformance, Record<string, unknown>>();
const scopes = new WeakMap<McpPerformance, Record<string, unknown>>();
export const completeCallImageScope = (trace:McpPerformance) => scopes.get(trace)??{};
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
export const callImageFields = ["returned_frame_id", "frame_seq", "source_seq",
  "capture_lower_server_utc_ms", "released_check_utc_ms", "age_upper_ms", "clock_verified",
  "static_repeated", "image_sha256", "image_width", "image_height", "frame_ingress_server_utc_ms"] as const;

/** Request-local release witness; no I/O, image decode, hashing or public fields. */
export function observeCompleteCallImage(trace: McpPerformance, metadata: Record<string, unknown>,
  count: number, age: number | null, checkedAt?: number | null) {
  const clock=debugObject(metadata.event_clock);
  scopes.set(trace,count===1?{device_id:debugUUID(metadata.device_id??clock.device_id),
    session_id:debugUUID(metadata.bridge_session_id??clock.bridge_session_id),
    broadcast_id:debugUUID(metadata.broadcast_id??clock.broadcast_id),clock_domain_id:debugUUID(metadata.clock_domain_id??clock.clock_domain_id)}:{});
  releases.set(trace, count === 1 ? {
    returned_frame_id: debugUUID(metadata.frame_id), frame_seq: number(metadata.frame_seq),
    source_seq: number(metadata.source_seq), capture_lower_server_utc_ms: number(metadata.capture_lower_server_utc_ms),
    released_check_utc_ms: number(checkedAt), age_upper_ms: number(age),
    clock_verified: typeof metadata.capture_clock_verified === "boolean" ? metadata.capture_clock_verified : null,
    static_repeated: metadata.is_repeated === true && debugObject(metadata.static_screen).proven === true,
    image_width: number(metadata.width), image_height: number(metadata.height),
    frame_ingress_server_utc_ms: number((metadata as Record<PropertyKey, unknown>)[callFrameIngress]),
  } : { released_check_utc_ms: number(checkedAt) });
}

/** Run ONLY in the deferred complete-call task, against the final delivered envelope. */
export function completeCallImageProjection(trace: McpPerformance, body: unknown) {
  const result = debugObject(debugObject(body).result), summary = debugObject(result.structuredContent);
  const after = debugObject(summary.after_screen);
  const images = Array.isArray(result.content) ? result.content.map(debugObject)
    .filter(block => block.type === "image" && typeof block.data === "string") : [];
  const fields: Record<string, unknown> = Object.fromEntries(callImageFields.map(key => [key, null]));
  const release = releases.get(trace);
  if (images.length === 1) {
    Object.assign(fields, release);
    if (images[0].mimeType === "image/jpeg")
      fields.image_sha256 = createHash("sha256").update(Buffer.from(images[0].data as string, "base64")).digest("hex");
  } else if (release) fields.released_check_utc_ms = release.released_check_utc_ms ?? null;
  return { ...fields, result_code: typeof (summary.code ?? summary.reason ?? after.reason ?? summary.error) === "string"
    ? debugCode(summary.code ?? summary.reason ?? after.reason ?? summary.error) : null };
}
