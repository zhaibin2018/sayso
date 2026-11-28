import { d1Timing, type D1TimingContext } from "./d1-timing.ts";
import { frameTransactionPhase } from "./frame-error-classification.ts";

const regions = new Set(["WNAM", "ENAM", "WEUR", "EEUR", "APAC", "OC"]);
type Placement = { served_by_region: string | null; served_by_colo: string | null;
  served_by_primary: boolean | null; recorded_at_ms: number };
const latest = new WeakMap<D1Database, Placement>();
const sources = new WeakMap<D1Database, D1Database>();
const source = (db: D1Database) => sources.get(db) ?? db;
/** Request-local performance proxies share only this content-free buffer with their binding. */
export function shareD1Placement(wrapper: D1Database, db: D1Database) { sources.set(wrapper, source(db)); }
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** One provider reply, never independently merged region/colo/primary arrays. */
function placement(meta: unknown, at: unknown): Placement | null {
  const m = object(meta);
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0 || at > 8.64e15 - 28_800_000) return null;
  const region = typeof m.served_by_region === "string" && regions.has(m.served_by_region) ? m.served_by_region : null;
  const colo = typeof m.served_by_colo === "string" && /^[A-Z]{3}$/.test(m.served_by_colo) ? m.served_by_colo : null;
  const primary = typeof m.served_by_primary === "boolean" ? m.served_by_primary : null;
  return region === null && colo === null && primary === null ? null :
    { served_by_region: region, served_by_colo: colo, served_by_primary: primary, recorded_at_ms: at };
}

export function observeD1Placement(db: D1Database, results: unknown, at: number) {
  for (const result of Array.isArray(results) ? results : [results]) {
    const sample = placement(object(result).meta, at);
    if (sample && sample.recorded_at_ms >= (latest.get(source(db))?.recorded_at_ms ?? -1)) latest.set(source(db), sample);
  }
}

/** Append only to an ALREADY WRITING batch. Results/changes() inside it keep their indices/order.
 * The saved sample predates this batch; no follow-up RPC is made to save its own reply.
 * Reads only observe in RAM. Isolate eviction may discard an unflushed sample. */
export async function placementBatch<T = Record<string, unknown>>(
  db: D1Database, statements: D1PreparedStatement[], now: () => number,
): Promise<D1Result<T>[]> {
  const sample = latest.get(source(db));
  frameTransactionPhase("FRAME_TRANSACTION_PLACEMENT_PREPARE");
  const save = sample ? [db.prepare(`UPDATE sb_maintenance_state SET d1_placement_json=? WHERE id=1
    AND COALESCE(json_extract(d1_placement_json,'$.recorded_at_ms'),-1)<=?`)
    .bind(JSON.stringify(sample), sample.recorded_at_ms)] : [];
  frameTransactionPhase("FRAME_TRANSACTION_BATCH", undefined, undefined, save.length);
  const results = await db.batch<T>([...statements, ...save]);
  const original = results.slice(0, statements.length);
  frameTransactionPhase("FRAME_TRANSACTION_PLACEMENT_OBSERVE");
  observeD1Placement(db, original, now());
  return original;
}

/** Keep provider placement opt-in independent of the production diagnostics switch. */
export function placementTiming(db: D1Database, at: number, context: D1TimingContext,
  results: unknown, wallMS: number, count = 1) {
  observeD1Placement(db, results, at);
  return d1Timing(context, results, wallMS, count, true);
}

export function placementJSON(db: D1Database): string | null {
  const sample = latest.get(source(db));
  return sample ? JSON.stringify(sample) : null;
}

export function parsePlacementJSON(value: unknown): Placement | null {
  if (typeof value !== "string" || value.length > 192) return null;
  try { const data = object(JSON.parse(value)); return placement(data, data.recorded_at_ms); }
  catch { return null; }
}
