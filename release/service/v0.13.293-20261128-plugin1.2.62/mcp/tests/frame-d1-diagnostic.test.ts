import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Miniflare } from "miniflare";
import { schemaWhitelist } from "../scripts/generate-frame-d1-whitelist.mjs";
import { schemaRaiseMessages, schemaConstraintNames } from "../lib/frame-d1-schema-whitelist.ts";
import { frameD1Diagnostic } from "../lib/frame-d1-diagnostic.ts";
import {
  withFrameErrors,
  frameStatement,
  frameTransactionBatch,
  logFrameFailure,
} from "../lib/frame-error-classification.ts";
import { placementBatch, observeD1Placement } from "../lib/d1-placement.ts";

test("D213 schema whitelist is exhaustive and frozen to repository literals", () => {
  const actual = schemaWhitelist(process.cwd());
  assert.deepEqual([...schemaRaiseMessages], actual.raises);
  assert.deepEqual([...schemaConstraintNames], actual.constraints);
  assert.equal(actual.raises.length, 8);
});

test("D213 exact trigger/constraint matches reject prefixes, suffixes, SQL and private text", () => {
  for (const code of schemaRaiseMessages) {
    for (const message of [
      code,
      "D1_ERROR: " + code,
      "D1_ERROR: " + code + ": SQLITE_CONSTRAINT",
      "D1_ERROR: " + code + ": SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)",
    ]) {
      const result = frameD1Diagnostic(new Error(message));
      assert.equal(result.d1_message_match, "RAISE_MESSAGE");
      assert.equal(result.schema_message, code);
      assert.equal(result.error_message_length, message.length);
    }
    for (const message of [
      "PRIVATE " + code,
      code + " PRIVATE",
      "D1_ERROR: PRIVATE_SQL " + code,
      "D1_ERROR: " + code + ": PRIVATE",
    ]) {
      assert.deepEqual(frameD1Diagnostic(new Error(message)), {
        d1_message_match: "UNMATCHED",
        error_message_length: message.length,
      });
    }
  }
  for (const name of schemaConstraintNames) {
    assert.equal(
      frameD1Diagnostic(new Error("UNIQUE constraint failed: index '" + name + "'")).schema_message,
      name,
    );
    assert.equal(
      frameD1Diagnostic(new Error("CHECK constraint failed: " + name)).schema_message,
      name,
    );
  }
  const cause = new Error("MAINTENANCE_BACKLOG_LIMIT"),
    outer = new Error("D1_ERROR", { cause });
  assert.equal(frameD1Diagnostic(outer).schema_message, "MAINTENANCE_BACKLOG_LIMIT");
  const hostile = Object.defineProperty({}, "message", {
    get() {
      throw Error("PRIVATE_GETTER");
    },
  });
  assert.deepEqual(frameD1Diagnostic(hostile), {
    d1_message_match: "UNMATCHED",
    error_message_length: 0,
  });
});

test("D213 synthetic SQLite trigger error identifies repository message and rolls back", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE sb_frames(device_id TEXT); CREATE TABLE sb_maintenance_state(id INTEGER,overloaded INTEGER); INSERT INTO sb_maintenance_state VALUES(1,1)",
    );
    const migration = readFileSync("drizzle/0032_retention_maintenance.sql", "utf8");
    db.exec(migration.match(/CREATE TRIGGER sb_frames_backlog[\s\S]*?END;/)![0]);
    assert.throws(
      () => db.exec("INSERT INTO sb_frames VALUES('PRIVATE_DEVICE')"),
      (error: unknown) => {
        assert.equal(frameD1Diagnostic(error).schema_message, "MAINTENANCE_BACKLOG_LIMIT");
        return true;
      },
    );
    assert.equal(db.prepare("SELECT count(*) AS n FROM sb_frames").get()!.n, 0);
  } finally {
    db.close();
  }
});

test("D213 workerd batch trigger logs exact message, unavailable provider index, and placement phase", async () => {
  const runtime = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('offline')}}",
    compatibilityDate: "2026-05-22",
    d1Databases: { DB: "frame-d1-offline" },
  });
  const logs: Record<string, unknown>[] = [],
    original = console.error;
  console.error = (value) => logs.push(JSON.parse(value));
  try {
    const db = (await runtime.getD1Database("DB")) as unknown as D1Database;
    await db.prepare("CREATE TABLE offline_frame(id INTEGER PRIMARY KEY)").run();
    await db
      .prepare(
        "CREATE TRIGGER offline_abort BEFORE INSERT ON offline_frame BEGIN SELECT RAISE(ABORT,'MAINTENANCE_BACKLOG_LIMIT'); END",
      )
      .run();
    await withFrameErrors(
      new Request("https://offline.invalid/v1/device/frame", { method: "POST" }),
      async () => {
        frameTransactionBatch(1);
        try {
          await placementBatch(db, [db.prepare("INSERT INTO offline_frame VALUES(1)")], Date.now);
        } catch (error) {
          logFrameFailure(error);
        }
      },
    );
    assert.equal(logs[0].schema_message, "MAINTENANCE_BACKLOG_LIMIT", JSON.stringify(logs[0]));
    assert.equal(logs[0].stage, "FRAME_TRANSACTION_BATCH");
    assert.equal(logs[0].failed_statement_index, null);
    assert.equal(logs[0].statement_index_basis, "UNAVAILABLE");
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM offline_frame").first<{ n: number }>())!.n,
      0,
    );
  } finally {
    console.error = original;
    await runtime.dispose();
  }
});

test("D213 prepare indices and placement preparation remain separate without extra D1 calls", async () => {
  const logs: Record<string, unknown>[] = [],
    original = console.error;
  console.error = (value) => logs.push(JSON.parse(value));
  try {
    const request = () =>
      new Request("https://offline.invalid/v1/device/frame", { method: "POST" });
    await withFrameErrors(request(), async () => {
      frameStatement(2);
      logFrameFailure(new Error("PRIVATE_BIND"));
    });
    assert.equal(logs[0].failed_statement_index, 2);
    assert.equal(logs[0].stage, "FRAME_TRANSACTION_PREPARE");
    let batches = 0;
    const db = {
      prepare() {
        throw Error("PRIVATE_PLACEMENT");
      },
      async batch() {
        batches++;
        return [{ meta: {}, results: [], success: true }];
      },
    } as unknown as D1Database;
    observeD1Placement(db, { meta: { served_by_region: "APAC" } }, 100);
    await withFrameErrors(request(), async () => {
      frameTransactionBatch(1);
      try {
        await placementBatch(db, [{} as D1PreparedStatement], () => 100);
      } catch (error) {
        logFrameFailure(error);
      }
    });
    assert.equal(logs[1].stage, "FRAME_TRANSACTION_PLACEMENT_PREPARE");
    assert.equal(logs[1].failed_statement_index, null);
    assert.equal(batches, 0);
    const normal = {
      async batch() {
        batches++;
        return [{ meta: {}, results: [{ accepted: true }], success: true }];
      },
    } as unknown as D1Database;
    await withFrameErrors(request(), async () => {
      frameTransactionBatch(1);
      const result = await placementBatch(normal, [{} as D1PreparedStatement], () => 100);
      assert.deepEqual(result[0].results, [{ accepted: true }]);
    });
    assert.equal(batches, 1);
    assert.equal(logs.length, 2);
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE|stack|headers|body|sql|bind/i);
  } finally {
    console.error = original;
  }
});
