import { test } from "node:test";
import assert from "node:assert/strict";
import { d1PruneTiming, d1Timing, mergeD1Timing, type D1TimingContext } from "../lib/d1-timing.ts";

test("D1 timing: missing metadata stays null while measured zero stays complete", () => {
  const missing = d1Timing("read_snapshot", { results: [] }, undefined);
  assert.equal(missing.wall_ms, null);
  assert.equal(missing.sql_duration_ms, null);
  assert.equal(missing.rows_read, null);
  assert.equal(missing.sql_duration_samples, 0);
  assert.equal(missing.rows_read_samples, 0);
  assert.equal(missing.sql_duration_complete, false);
  assert.equal(missing.rows_read_complete, false);
  const zero = d1Timing("read_snapshot", { meta: { timings: { sql_duration_ms: 0 }, rows_read: 0 } }, 0);
  assert.equal(zero.wall_ms, 0);
  assert.equal(zero.sql_duration_ms, 0);
  assert.equal(zero.rows_read, 0);
  assert.equal(zero.sql_duration_complete, true);
  assert.equal(zero.rows_read_complete, true);
});

test("D1 timing: nested SQL duration wins and malformed present fields never use fallback", () => {
  assert.equal(d1Timing("frame_commit", { meta: { timings: { sql_duration_ms: 1.25 }, duration: 99 } }, 3).sql_duration_ms, 1.25);
  for (const value of [null, undefined, "2", -1, NaN, Infinity, {}, []]) {
    const timing = d1Timing("frame_commit", { meta: { timings: { sql_duration_ms: value }, duration: 7 } }, 3);
    assert.equal(timing.sql_duration_ms, null);
    assert.equal(timing.duration_fallback_samples, 0);
  }
  for (const timings of [undefined, null, {}, []]) {
    const timing = d1Timing("frame_commit", { meta: { timings, duration: 0.125 } }, 3);
    assert.equal(timing.sql_duration_ms, 0.125);
    assert.equal(timing.duration_fallback_samples, 1);
    assert.equal(timing.sql_duration_complete, true);
  }
});

test("D1 timing: invalid numeric metadata is not coerced and rows require safe integers", () => {
  for (const value of [null, undefined, "1", -1, NaN, Infinity, false]) {
    const timing = d1Timing("read_snapshot", { meta: { duration: value, rows_read: value } }, value);
    assert.equal(timing.sql_duration_ms, null);
    assert.equal(timing.rows_read, null);
    assert.equal(timing.wall_ms, null);
  }
  for (const value of [0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(d1Timing("read_snapshot", { meta: { rows_read: value } }, 0).rows_read, null);
  }
});

test("D1 timing: batch preserves fractional SQL sums and counts wall time once", () => {
  const timing = d1Timing("command_and_read_snapshot", [
    { meta: { timings: { sql_duration_ms: 0.125 }, rows_read: 2, served_by_region: "APAC" } },
    { meta: { duration: 0.375, rows_read: 3, served_by_region: "APAC" } },
  ], 9.75, 2);
  assert.equal(timing.operations, 1);
  assert.equal(timing.statement_count, 2);
  assert.equal(timing.wall_ms, 9.75);
  assert.equal(timing.sql_duration_ms, 0.5);
  assert.equal(timing.sql_duration_samples, 2);
  assert.equal(timing.duration_fallback_samples, 1);
  assert.equal(timing.rows_read, 5);
  assert.equal(timing.rows_read_samples, 2);
  assert.equal(timing.sql_duration_complete, true);
  assert.equal(timing.rows_read_complete, true);
  assert.deepEqual(timing.served_by_regions, ["APAC"]);
});

test("D1 timing: partial or mismatched results never claim complete coverage", () => {
  const partial = d1Timing("frame_commit", [
    { meta: { duration: 2, rows_read: 4 } },
    { meta: { timings: { sql_duration_ms: null }, rows_read: 0 } },
  ], 10, 2);
  assert.equal(partial.sql_duration_ms, 2);
  assert.equal(partial.sql_duration_samples, 1);
  assert.equal(partial.sql_duration_complete, false);
  assert.equal(partial.rows_read, 4);
  assert.equal(partial.rows_read_complete, true);
  for (const results of [[], [{ meta: { duration: 1, rows_read: 2 } }], [
    { meta: { duration: 1, rows_read: 2 } }, { meta: { duration: 3, rows_read: 4 } },
    { meta: { duration: 1000, rows_read: 1000, served_by_region: "OC" } },
  ]]) {
    const timing = d1Timing("read_snapshot", results, 2, 2);
    assert.equal(timing.sql_duration_complete, false);
    assert.equal(timing.rows_read_complete, false);
    assert.equal(timing.statement_count, 2);
    assert.ok(timing.sql_duration_samples <= 2);
    assert.ok(!timing.served_by_regions.includes("OC"));
  }
  const extra = d1Timing("read_snapshot", [{ meta: { duration: 1 } }, { meta: { duration: 2 } }], 1);
  assert.equal(extra.sql_duration_ms, 1);
  assert.equal(extra.sql_duration_complete, false);
});

test("D1 timing: merging retains observed-only sums, missing coverage, and unique enums", () => {
  const a = d1Timing("read_snapshot", { meta: { duration: 0.125, rows_read: 2, served_by_region: "ENAM" } }, 4.25);
  const b = d1Timing("frame_commit", [
    { meta: { timings: { sql_duration_ms: 0.375 }, rows_read: 3, served_by_region: "APAC" } }, {},
  ], 5.75, 2);
  const merged = mergeD1Timing(a, b);
  assert.equal(merged.operations, 2);
  assert.equal(merged.statement_count, 3);
  assert.equal(merged.wall_ms, 10);
  assert.equal(merged.sql_duration_ms, 0.5);
  assert.equal(merged.sql_duration_samples, 2);
  assert.equal(merged.sql_duration_complete, false);
  assert.equal(merged.duration_fallback_samples, 1);
  assert.equal(merged.rows_read, 5);
  assert.equal(merged.rows_read_samples, 2);
  assert.equal(merged.rows_read_complete, false);
  assert.deepEqual(merged.contexts, ["read_snapshot", "frame_commit"]);
  assert.deepEqual(merged.served_by_regions, ["ENAM", "APAC"]);
  const missing = mergeD1Timing(a, d1Timing("read_snapshot", null, null));
  assert.equal(missing.sql_duration_ms, 0.125);
  assert.equal(missing.sql_duration_samples, 1);
  assert.equal(missing.wall_ms, null);
  assert.deepEqual(missing.contexts, ["read_snapshot"]);
});

test("D1 timing: malformed expected counts and aggregate overflow remain incomplete", () => {
  for (const expected of [0, -1, 1.5, NaN, Infinity]) {
    const timing = d1Timing("read_snapshot", { meta: { duration: 1, rows_read: 2 } }, 0, expected);
    assert.equal(timing.statement_count, 1);
    assert.equal(timing.sql_duration_complete, false);
    assert.equal(timing.rows_read_complete, false);
  }
  const large = d1Timing("frame_commit", { meta: { duration: Number.MAX_VALUE, rows_read: Number.MAX_SAFE_INTEGER } }, Number.MAX_VALUE);
  const overflow = mergeD1Timing(large, large);
  assert.equal(overflow.wall_ms, null);
  assert.equal(overflow.sql_duration_ms, null);
  assert.equal(overflow.rows_read, null);
  assert.equal(overflow.sql_duration_samples, 2);
  assert.equal(overflow.sql_duration_complete, false);
  assert.equal(overflow.rows_read_complete, false);
  assert.equal(mergeD1Timing(overflow, d1Timing("read_snapshot", {}, 1)).sql_duration_ms, null);
});

test("D1 timing: allowlist never reads rows or includes queries, tokens, or arbitrary strings", () => {
  const result = {
    meta: { duration: 2, rows_read: 1, served_by_region: "secret-region", query: "SECRET QUERY", token: "SECRET TOKEN" },
    get results(): never { throw new Error("Result rows must not be inspected"); },
  };
  const timing = d1Timing("read_snapshot", result, 3);
  assert.deepEqual(timing.served_by_regions, []);
  const serialized = JSON.stringify(timing);
  assert.ok(!serialized.includes("SECRET"));
  assert.ok(!serialized.includes("secret-region"));
  assert.deepEqual(Object.keys(timing).sort(), ["version", "contexts", "operations", "statement_count", "wall_ms", "sql_duration_ms",
    "sql_duration_samples", "sql_duration_complete", "duration_fallback_samples", "rows_read", "rows_read_samples", "rows_read_complete", "served_by_regions"].sort());
  assert.deepEqual(d1Timing("SECRET CONTEXT" as D1TimingContext, result, 1).contexts, []);
  for (const region of ["WNAM", "ENAM", "WEUR", "EEUR", "APAC", "OC"]) {
    assert.deepEqual(d1Timing("read_snapshot", { meta: { served_by_region: region } }, 1).served_by_regions, [region]);
  }
});

test("D1 timing: pruning reports only safe rows-written samples from the expected batch",()=>{
  const timing=d1PruneTiming([{meta:{rows_written:0}},{meta:{rows_written:"5"}},{meta:{rows_written:10}}],3,2);
  assert.deepEqual(timing.contexts,["metadata_prune"]);
  assert.equal(timing.rows_written,0);
  assert.equal(timing.rows_written_samples,1);
  assert.equal(timing.rows_written_complete,false);
  const overflow=d1PruneTiming([{meta:{rows_written:Number.MAX_SAFE_INTEGER}},{meta:{rows_written:1}}],3,2);
  assert.equal(overflow.rows_written,null);
  assert.equal(overflow.rows_written_complete,false);
});

test("D1 timing: explicit provider metadata is bounded, typed and survives retry merging",()=>{
  const raw=[{meta:{served_by_region:"WNAM",served_by_colo:"SJC",served_by_primary:true}},
    {meta:{served_by_colo:"SEA",served_by_primary:false}},
    {meta:{served_by_colo:"secret-location",served_by_primary:"true"}}];
  const ordinary=d1Timing("read_snapshot",raw,2,3);
  assert.equal(ordinary.served_by_colos,undefined);
  assert.equal(ordinary.served_by_primary,undefined);
  const placement=d1Timing("read_snapshot",raw,2,3,true);
  assert.deepEqual(placement.served_by_regions,["WNAM"]);
  assert.deepEqual(placement.served_by_colos,["SJC","SEA"]);
  assert.deepEqual(placement.served_by_primary,[true,false]);
  const retry=d1Timing("read_snapshot",["SJC","NRT","PDX","SIN","DFW"].map(served_by_colo=>({meta:{served_by_colo,served_by_primary:false}})),3,5,true);
  const merged=mergeD1Timing(placement,retry);
  assert.deepEqual(merged.served_by_colos,["SJC","SEA","NRT","PDX"]);
  assert.deepEqual(merged.served_by_primary,[true,false]);
});
