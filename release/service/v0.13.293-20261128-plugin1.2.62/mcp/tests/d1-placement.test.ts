import { test } from "node:test";
import assert from "node:assert/strict";
import { DB, Bucket } from "./fixtures/retention.ts";
import { observeD1Placement, placementBatch, placementJSON, placementTiming, parsePlacementJSON } from "../lib/d1-placement.ts";
import { runMaintenance } from "../lib/retention-maintenance.ts";
import { McpPerformance } from "../lib/mcp-performance.ts";

const reply = (meta: Record<string, unknown>) => ({ meta });
const sample = { served_by_region: "APAC", served_by_colo: "SIN", served_by_primary: true };
const fixture = () => { const local = new DB(); return { local, db: local as unknown as D1Database }; };
const stored = (local: DB) => local.raw.prepare("SELECT d1_placement_json FROM sb_maintenance_state WHERE id=1").get()!.d1_placement_json;

test("D1 placement keeps one correlated reply and four allowlisted fields, including false", () => {
  const { db } = fixture();
  assert.equal(placementJSON(db), null);
  observeD1Placement(db, [reply({ ...sample, query: "SECRET_SQL", content: "PRIVATE_CONTENT", device_id: "PRIVATE_DEVICE" }),
    reply({ served_by_colo: "NRT", served_by_primary: false })], 123);
  assert.deepEqual(JSON.parse(placementJSON(db)!), { served_by_region: null, served_by_colo: "NRT", served_by_primary: false, recorded_at_ms: 123 });
  assert.doesNotMatch(placementJSON(db)!, /SECRET|PRIVATE|APAC|SIN/);
  observeD1Placement(db, reply({ served_by_region: "secret", served_by_colo: "<private>", served_by_primary: "true" }), 124);
  observeD1Placement(db, reply(sample), NaN);
  observeD1Placement(db, reply(sample), 122);
  assert.equal(JSON.parse(placementJSON(db)!).recorded_at_ms, 123);
  assert.equal(parsePlacementJSON('{"recorded_at_ms":123,"served_by_colo":"PRIVATE"}'), null);
});

test("D1 placement piggybacks one RPC, preserves business changes/order/results and never regresses durable time", async () => {
  const { db, local } = fixture();
  const batch = local.batch.bind(local); let calls = 0;
  local.batch = async statements => { calls++; return batch(statements); };
  observeD1Placement(db, reply(sample), 123);
  const result = await placementBatch(db, [db.prepare("UPDATE sb_maintenance_state SET backlog=7 WHERE id=1"),
    db.prepare("UPDATE sb_maintenance_state SET failures=3 WHERE id=1 AND changes()=1 RETURNING failures")], () => 124);
  assert.equal(calls, 1); assert.equal(result.length, 2);
  assert.equal(result[0].meta.changes, 1); assert.equal(result[1].results[0].failures, 3);
  assert.deepEqual(JSON.parse(String(stored(local))), { ...sample, recorded_at_ms: 123 });
  local.raw.prepare("UPDATE sb_maintenance_state SET d1_placement_json=?").run(JSON.stringify({ ...sample, served_by_colo: "NRT", recorded_at_ms: 500 }));
  await placementBatch(db, [db.prepare("UPDATE sb_maintenance_state SET backlog=8")], () => 126);
  assert.equal(JSON.parse(String(stored(local))).recorded_at_ms, 500);
  local.raw.prepare("CREATE TRIGGER placement_failure BEFORE UPDATE OF backlog ON sb_maintenance_state WHEN NEW.backlog=9 BEGIN SELECT RAISE(ABORT,'INJECTED_FAILURE'); END").run();
  await assert.rejects(placementBatch(db, [db.prepare("UPDATE sb_maintenance_state SET backlog=9")], () => 127), /INJECTED_FAILURE/);
  assert.equal(local.raw.prepare("SELECT backlog FROM sb_maintenance_state").get()!.backlog, 8);
});

test("D1 upload/command/read timing always opts into placement; reads do not write and later maintenance flushes", async () => {
  const { db, local } = fixture();
  const before = local.raw.prepare("SELECT total_changes() n").get()!.n;
  for (const context of ["frame_commit", "command_and_read_snapshot", "read_snapshot"] as const) {
    const timing = placementTiming(db, 123, context, reply(sample), 1);
    assert.deepEqual(timing.served_by_colos, ["SIN"]); assert.deepEqual(timing.served_by_primary, [true]);
  }
  assert.equal(local.raw.prepare("SELECT total_changes() n").get()!.n, before);
  assert.equal(stored(local), null);
  await runMaintenance(db, new Bucket() as unknown as R2Bucket, "owner", () => 1000);
  assert.deepEqual(JSON.parse(String(stored(local))), { ...sample, recorded_at_ms: 123 });
});

test("D1 read placement survives request-local performance proxies and stays isolated between DB bindings", async () => {
  const { db, local } = fixture(), other = fixture();
  const readDB = new McpPerformance({log:()=>{}}).database(db);
  const writeDB = new McpPerformance({log:()=>{}}).database(db);
  placementTiming(readDB, 123, "read_snapshot", reply(sample), 1);
  assert.equal(placementJSON(other.db), null);
  await placementBatch(writeDB, [writeDB.prepare("UPDATE sb_maintenance_state SET backlog=1 WHERE id=1")], () => 124);
  assert.deepEqual(JSON.parse(String(stored(local))), { ...sample, recorded_at_ms: 123 });
});
