import { test } from "node:test";
import assert from "node:assert/strict";
import { DB, Bucket } from "./fixtures/retention.ts";
import { DAY } from "../lib/retention-policy.ts";
import { maintenanceHealth, retentionInventory } from "../lib/maintenance-health.ts";
import {
  runMaintenance,
  MAINTENANCE_CATCHUP_INTERVAL_MS,
  MAINTENANCE_INTERVAL_MS,
} from "../lib/retention-maintenance.ts";
import { getDebugReport } from "../lib/debug-report.ts";

const fixture = () => {
  const db = new DB(),
    bucket = new Bucket();
  let now = 20 * DAY;
  const put = db.raw.prepare(
    "INSERT INTO sb_metrics(id,owner_id,device_id,kind,bytes,duration_ms,created_at) VALUES(?,'owner','device','upload',1,1,?)",
  );
  let sequence = 0;
  return {
    db,
    bucket,
    now: () => now,
    tick: (ms: number) => (now += ms),
    seed: (n: number, at = now - DAY) => {
      db.raw.exec("BEGIN");
      for (let i = 0; i < n; i++) put.run(String(sequence++), at);
      db.raw.exec("COMMIT");
    },
    run: (source: "owner" | "request" = "owner") =>
      runMaintenance(db as any, bucket as any, source, () => now),
  };
};

test("D215 missing owner and high backlog are explicit health alarms without granting maintenance access", () => {
  assert.equal(maintenanceHealth({ backlog: 6999 }, undefined, 0).owner_configured, false);
  assert.equal(maintenanceHealth({ backlog: 6999 }, "owner", 0).warning, false);
  const high = maintenanceHealth({ backlog: 7000, due_at: 0, failures: 3 }, "owner", 120001);
  assert.equal(high.warning, true);
  assert.equal(high.overdue, true);
  assert.equal(high.failures, 3);
  assert.equal(maintenanceHealth({ overloaded: 1, backlog: 10001 }, "owner", 0).overloaded, true);
});

test("D215 whitelist inventory is read-only, counts the exact TTL boundary and preserves unsettled writes and retired fences", async () => {
  const f = fixture();
  f.seed(3);
  f.seed(2, f.now() - DAY + 1);
  for (const [id, gc] of [
    ["put", 0],
    ["gc", 1],
    ["retired", 2],
  ] as const)
    f.db.raw
      .prepare(
        "INSERT INTO sb_storage_writes(id,owner_id,device_id,session_id,image_key,started_at,is_gc) VALUES(?,'PRIVATE_OWNER','d','s',?,0,?)",
      )
      .run(id, "screens/PRIVATE_OWNER/d/s/" + id, gc);
  const before = f.db.raw.prepare("SELECT total_changes() AS n").get()!.n;
  const counts = await retentionInventory(f.db as any, f.now());
  assert.deepEqual(
    counts.tables.find((r) => r.table === "sb_metrics"),
    { table: "sb_metrics", due: 3, not_due: 2 },
  );
  assert.deepEqual(counts.storage, { unsettled_puts: 1, pending_gc: 1, retired_fences: 1 });
  assert.equal(f.db.raw.prepare("SELECT total_changes() AS n").get()!.n, before);
  assert.doesNotMatch(JSON.stringify(counts), /PRIVATE_OWNER|screens\/|image_key|token/);
});

test("D215 debug report retains its envelope, warns on missing owner, and restricts site-wide counters to the pinned owner", async () => {
  const f = fixture(),
    service = { db: f.db as any, now: f.now };
  f.seed(2);
  f.db.raw.exec("UPDATE sb_maintenance_state SET backlog=7000");
  const missing = await getDebugReport(service, { id: "owner", label: "" }, {}, "fixture.invalid");
  assert.deepEqual(Object.keys(missing), ["report"]);
  assert.match(missing.report, /MAINTENANCE_OWNER_NOT_CONFIGURED/);
  assert.match(missing.report, /MAINTENANCE_BACKLOG_HIGH/);
  assert.doesNotMatch(missing.report, /sb_metrics/);
  const other = await getDebugReport(
    service,
    { id: "other", label: "" },
    {},
    "fixture.invalid",
    "owner",
  );
  assert.doesNotMatch(other.report, /sb_metrics/);
  const own = await getDebugReport(
    service,
    { id: "owner", label: "" },
    {},
    "fixture.invalid",
    "owner",
  );
  assert.match(own.report, /sb_metrics \| 2 \| 0/);
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_maintenance_runs").get()!.n, 0);
});

test("D215 recovery snapshots precede cleanup; due/CAS catchup drains only expired rows and automatically releases the breaker", async (t) => {
  const f = fixture();
  f.seed(11201);
  f.seed(3, f.now());
  await f.run("request");
  let state = f.db.raw.prepare("SELECT * FROM sb_maintenance_state").get()!;
  assert.equal(state.overloaded, 1);
  assert.equal(state.due_at, f.now() + MAINTENANCE_CATCHUP_INTERVAL_MS);
  assert.equal((await f.run("request")).attempted, false);
  f.tick(MAINTENANCE_CATCHUP_INTERVAL_MS);
  const logs: string[] = [];
  t.mock.method(console, "info", (value: string) => logs.push(value));
  const both = await Promise.all([f.run("request"), f.run()]);
  assert.equal(both.filter((r) => r.attempted).length, 1);
  const snapshot = JSON.parse(logs[0]);
  assert.equal(snapshot.event, "maintenance_backlog_inventory");
  assert.deepEqual(
    snapshot.tables.find((r: any) => r.table === "sb_metrics"),
    { table: "sb_metrics", due: 11101, not_due: 3 },
  );
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_metrics").get()!.n, 10104);
  assert.equal(
    f.db.raw.prepare("SELECT overloaded FROM sb_maintenance_state").get()!.overloaded,
    1,
  );
  f.tick(MAINTENANCE_CATCHUP_INTERVAL_MS);
  await f.run("request");
  state = f.db.raw.prepare("SELECT * FROM sb_maintenance_state").get()!;
  assert.equal(state.overloaded, 0);
  assert.equal(state.backlog, 9101);
  assert.equal(state.failures, 0);
  for (let i = 0; i < 100; i++) {
    f.tick(MAINTENANCE_CATCHUP_INTERVAL_MS);
    await f.run("request");
  }
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_metrics").get()!.n, 3);
  // Once no due rows remain, return to the normal one-minute background cadence.
  state = f.db.raw.prepare("SELECT * FROM sb_maintenance_state").get()!;
  assert.equal(state.due_at, (state.last_attempt_at as number) + MAINTENANCE_INTERVAL_MS);
});

test("D215 sustained expiry above the old 100/minute capacity catches up without raising the backlog cap", async () => {
  const f = fixture();
  f.seed(7200);
  await f.run("request");
  for (let minute = 0; minute < 8; minute++) {
    f.seed(300);
    for (let page = 0; page < 12; page++) {
      f.tick(5000);
      await f.run("request");
    }
    const state = f.db.raw.prepare("SELECT backlog,overloaded FROM sb_maintenance_state").get()!;
    assert.equal(state.overloaded, 0);
    assert.ok(Number(state.backlog) < 7200);
  }
  assert.ok(Number(f.db.raw.prepare("SELECT count(*) n FROM sb_metrics").get()!.n) < 1000);
});
