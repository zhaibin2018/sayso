export type D1TimingContext = "read_snapshot" | "command_and_read_snapshot" | "frame_commit" | "metadata_prune" |
  "paired_enqueue" | "paired_claim" | "paired_receipt_commit";

export type D1Timing = {
  version: 1;
  contexts: D1TimingContext[];
  operations: number;
  statement_count: number;
  wall_ms: number | null;
  sql_duration_ms: number | null;
  sql_duration_samples: number;
  sql_duration_complete: boolean;
  duration_fallback_samples: number;
  rows_read: number | null;
  rows_read_samples: number;
  rows_read_complete: boolean;
  served_by_regions: string[];
  served_by_colos?: string[];
  served_by_primary?: boolean[];
};

const contexts: readonly D1TimingContext[] = ["read_snapshot", "command_and_read_snapshot", "frame_commit", "metadata_prune",
  "paired_enqueue", "paired_claim", "paired_receipt_commit"];
const regions = new Set(["WNAM", "ENAM", "WEUR", "EEUR", "APAC", "OC"]);
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const rows = (value: unknown): value is number => nonnegative(value) && Number.isSafeInteger(value);
const validColo = (value: unknown): value is string => typeof value === "string" && /^[A-Z]{3}$/.test(value);
const maxReportedColos = 4;

function sumObserved(values: number[], integer = false): number | null {
  if (!values.length) return null;
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isFinite(total) || (integer && !Number.isSafeInteger(total))) return null;
  }
  return total;
}

/** D1 SQL durations exclude network time. Totals cover only the counted samples. */
export function d1Timing(context: D1TimingContext, results: unknown, wallMS: unknown, expectedStatements = 1, includeProviderPlacement = false): D1Timing {
  const expectedValid = Number.isSafeInteger(expectedStatements) && expectedStatements > 0;
  const expected = expectedValid ? expectedStatements : 1;
  const returned = Array.isArray(results) ? results : record(results) ? [results] : [];
  const shapeComplete = expectedValid && returned.length === expected;
  const sql: number[] = [], readRows: number[] = [], served: string[] = [];
  const placement = includeProviderPlacement ? { colos: [] as string[], primary: [] as boolean[] } : undefined;
  let fallback = 0;
  // A malformed result count never becomes complete. Extra statements cannot
  // inflate this operation's declared coverage or contribute unrequested data.
  for (const result of returned.slice(0, expected)) {
    const meta = record(record(result)?.meta);
    if (!meta) continue;
    const timings = record(meta.timings);
    const nestedPresent = timings !== null && Object.prototype.hasOwnProperty.call(timings, "sql_duration_ms");
    const duration = nestedPresent ? timings.sql_duration_ms : meta.duration;
    if (nonnegative(duration)) {
      sql.push(duration);
      if (!nestedPresent) fallback++;
    }
    if (rows(meta.rows_read)) readRows.push(meta.rows_read);
    if (typeof meta.served_by_region === "string" && regions.has(meta.served_by_region) && !served.includes(meta.served_by_region)) {
      served.push(meta.served_by_region);
    }
    if (placement) {
      if (validColo(meta.served_by_colo) && placement.colos.length < maxReportedColos && !placement.colos.includes(meta.served_by_colo)) {
        placement.colos.push(meta.served_by_colo);
      }
      if (typeof meta.served_by_primary === "boolean" && !placement.primary.includes(meta.served_by_primary)) {
        placement.primary.push(meta.served_by_primary);
      }
    }
  }
  const sqlTotal = sumObserved(sql), rowTotal = sumObserved(readRows, true);
  return {
    version: 1,
    contexts: contexts.includes(context) ? [context] : [],
    operations: 1,
    statement_count: expected,
    wall_ms: nonnegative(wallMS) ? wallMS : null,
    sql_duration_ms: sqlTotal,
    sql_duration_samples: sql.length,
    sql_duration_complete: shapeComplete && sql.length === expected && sqlTotal !== null,
    duration_fallback_samples: fallback,
    rows_read: rowTotal,
    rows_read_samples: readRows.length,
    rows_read_complete: shapeComplete && readRows.length === expected && rowTotal !== null,
    served_by_regions: served,
    ...(placement?.colos.length ? { served_by_colos: placement.colos } : {}),
    ...(placement?.primary.length ? { served_by_primary: placement.primary } : {}),
  };
}

/** Keep delete/update write counts separate from the ordinary read timing wire. */
export function d1PruneTiming(results:unknown,wallMS:number,expectedStatements:number) {
  const timing=d1Timing("metadata_prune",results,wallMS,expectedStatements);
  const returned=Array.isArray(results)?results:[];
  const written=returned.slice(0,timing.statement_count).map(result=>record(record(result)?.meta)?.rows_written).filter(rows);
  const total=sumObserved(written,true);
  return {...timing,rows_written:total,rows_written_samples:written.length,
    rows_written_complete:returned.length===expectedStatements&&written.length===expectedStatements&&total!==null};
}

function mergeObserved(a: number | null, aSamples: number, b: number | null, bSamples: number, integer = false) {
  // Null with observed samples means an unrepresentable sum, not missing data.
  if ((a === null && aSamples > 0) || (b === null && bSamples > 0)) return null;
  return sumObserved([...(a === null ? [] : [a]), ...(b === null ? [] : [b])], integer);
}

export function mergeD1Timing(a: D1Timing, b: D1Timing): D1Timing {
  const sql = mergeObserved(a.sql_duration_ms, a.sql_duration_samples, b.sql_duration_ms, b.sql_duration_samples);
  const rowCount = mergeObserved(a.rows_read, a.rows_read_samples, b.rows_read, b.rows_read_samples, true);
  const colos = a.served_by_colos || b.served_by_colos
    ? [...new Set([...(a.served_by_colos ?? []), ...(b.served_by_colos ?? [])])].slice(0, maxReportedColos) : undefined;
  const primary = a.served_by_primary || b.served_by_primary
    ? [...new Set([...(a.served_by_primary ?? []), ...(b.served_by_primary ?? [])])] : undefined;
  return {
    version: 1,
    contexts: [...new Set([...a.contexts, ...b.contexts].filter(value => contexts.includes(value)))],
    operations: a.operations + b.operations,
    statement_count: a.statement_count + b.statement_count,
    // Wall time is measured once per operation, never once per batch result.
    // Unlike SQL samples, there is no wall-coverage counter: missing stays null.
    wall_ms: a.wall_ms === null || b.wall_ms === null ? null : sumObserved([a.wall_ms, b.wall_ms]),
    sql_duration_ms: sql,
    sql_duration_samples: a.sql_duration_samples + b.sql_duration_samples,
    sql_duration_complete: a.sql_duration_complete && b.sql_duration_complete && sql !== null,
    duration_fallback_samples: a.duration_fallback_samples + b.duration_fallback_samples,
    rows_read: rowCount,
    rows_read_samples: a.rows_read_samples + b.rows_read_samples,
    rows_read_complete: a.rows_read_complete && b.rows_read_complete && rowCount !== null,
    served_by_regions: [...new Set([...a.served_by_regions, ...b.served_by_regions].filter(value => regions.has(value)))],
    ...(colos?.length ? { served_by_colos: colos } : {}),
    ...(primary?.length ? { served_by_primary: primary } : {}),
  };
}
