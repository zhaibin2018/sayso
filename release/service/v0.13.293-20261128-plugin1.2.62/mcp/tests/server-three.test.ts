import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { DB, Bucket } from "./fixtures/retention.ts";
import { BridgeEngine, BridgeError } from "../lib/bridge-engine.ts";
import { FrameUploadPermits } from "../lib/frame-upload-permit.ts";
import { MouseControl, SYSTEM_SEARCH_KIND } from "../lib/mouse-control.ts";
import { openAppSearch, searchReady } from "../lib/open-app-search.ts";
import { appSearchFence } from "../lib/app-search-fence.ts";
import { cancelCurrentOperation } from "../lib/operation-cancel.ts";
import { McpPerformance } from "../lib/mcp-performance.ts";
import { setDebugScope } from "../lib/debug-scope.ts";
import {
  recordMinimalCall,
  takeMinimalCalls,
  minimalCallQueueStatus,
  minimalCallProjection,
  minimalCallTTL,
} from "../lib/minimal-call-journal.ts";
import { withMcpHotPath } from "../lib/hot-path-context.ts";
import { modelResultProjection } from "../lib/model-result-projection.ts";
import { observedCallGap } from "../lib/minimal-call-gap.ts";
import { getDebugReport } from "../lib/debug-report.ts";
import { handleMcp } from "../lib/mcp-protocol.ts";
import {runWithBridgeContext} from "../lib/bridge-context.ts";
import { recordToolActivity } from "../lib/tool-activity.ts";

function fixture() {
  const db = new DB(),
    [device, session, broadcast, worker, hardware, boot, searchID, frame] = Array.from(
      { length: 8 },
      randomUUID,
    ),
    owner = { id: "offline-owner", label: "fixture" },
    now = Date.now();
  const caps = Object.fromEntries(
    [
      "hid.mouse.absolute",
      "hid.mouse.click",
      "sayso.action_geometry.v1",
      "sayso.focused_text",
      "sayso.focused_text.no_visual.v1",
      "hid.keyboard.ascii_stable",
      "sayso.focused_text_clear_before_input",
      "hid.keyboard.ascii_clear_stable",
      "sayso.cancel_current.v1",
    ].map((k) => [k, true]),
  );
  db.raw
    .prepare(
      "INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,confirmed_at,created_at,current_session,worker_id,lease_epoch,worker_expires) VALUES(?,?,'Fixture','not-a-secret',?,?,?,?,?,7,?)",
    )
    .run(device, owner.id, now + 90000, now, now, session, worker, now + 90000);
  db.raw
    .prepare(
      "INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,mode,mouse_enabled,input_end,control_epoch) VALUES(?,?,?,?,?,'fixture','active','active',?,'broadcast',1,?,2)",
    )
    .run(session, owner.id, device, broadcast, randomUUID(), now, now + 90000);
  db.raw
    .prepare(
      "INSERT INTO sb_hardware(device_id,owner_id,hardware_id,board_boot_id,metadata,usb_connected) VALUES(?,?,?,?,?,1)",
    )
    .run(device, owner.id, hardware, boot, JSON.stringify({ capabilities: caps }));
  const e = new BridgeEngine({
    db: db as unknown as D1Database,
    bucket: new Bucket() as unknown as R2Bucket,
    framePermits: new FrameUploadPermits("ab".repeat(32)),
  });
  const metadata = {
    device_id: device,
    bridge_session_id: session,
    broadcast_id: broadcast,
    worker_id: worker,
    worker_id_at_read: worker,
    lease_epoch: 7,
    control_epoch_at_read: 2,
    frame_id: frame,
    orientation_epoch: 0,
    width: 16,
    height: 32,
    capture_clock_verified: true,
    age_ms: 100,
  };
  const effect = { hid_reports_sent: true, system_search_stable: true, all_released: true };
  const receipt = {
    command_id: searchID,
    board_boot_id: boot,
    state: "executed",
    subcommand_index: 0,
    error: null,
    effect,
  };
  const search = {
    command_id: searchID,
    device_id: device,
    bridge_session_id: session,
    kind: SYSTEM_SEARCH_KIND,
    state: "board_acked",
    control_epoch: 2,
    error: null,
    board_receipt: receipt,
    receipt_observation: {
      valid_for_capture_order: true,
      scope: { worker_id: worker, lease_epoch: 7 },
    },
    image: "QUJD",
    after_screen: {
      state: "available",
      metadata,
      after_command: {
        command_id: searchID,
        command_state: "board_acked",
        relation: "capture_after_phone_board_ack",
        scope_matches_at_snapshot: true,
      },
    },
  };
  return {
    db,
    e,
    owner,
    now,
    device,
    session,
    broadcast,
    worker,
    hardware,
    boot,
    searchID,
    frame,
    search,
    metadata,
    receipt,
  };
}

test("T97 minimal projection contains only allowlisted numeric/enumerated data", () => {
  const data = minimalCallProjection(
    {
      result: {
        isError: true,
        structuredContent: {
          error: "TEXT_UNCONFIRMED",
          state: "outcome_unknown",
          payload: { text: "PRIVATE" },
          proof: "PRIVATE",
          coordinates: [1, 2],
        },
        content: [
          { type: "text", text: "PRIVATE" },
          { type: "image", data: "QUJD", mimeType: "image/jpeg" },
        ],
      },
    },
    123,
  );
  assert.equal(data.image_count, 1);
  assert.equal(data.image_bytes, 3);
  assert.equal(data.text_utf8_bytes, 7);
  assert.ok(data.structured_utf8_bytes > 0);
  assert.equal(data.result_state, "outcome_unknown");
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE|QUJD|proof|coordinates|payload/);
});

async function record(
  f: ReturnType<typeof fixture>,
  time = f.now,
  extra: Record<string, unknown> = {},
) {
  const trace = new McpPerformance({ log: () => {} });
  trace.identify("tools/call", "read_screen", ["read_screen"]);
  setDebugScope(trace, f.owner.id, {
    device_id: f.device,
    text: "PRIVATE",
    source_point_proof: "PRIVATE",
    x: 99,
  });
  await recordMinimalCall(
    f.e.db,
    trace,
    time,
    10,
    time + 5,
    15,
    {
      result: {
        structuredContent: {
          state: "available",
          device_id: f.device,
          bridge_session_id: f.session,
          ...extra,
        },
        content: [{ type: "text", text: "PRIVATE" }],
      },
    },
    123,
  );
  return trace.requestID;
}
async function existingWrite(f: ReturnType<typeof fixture>) {
  return withMcpHotPath(() =>
    f.e.batch([f.e.stmt("UPDATE sb_sessions SET last_tool_at=? WHERE id=?", f.now, f.session)]),
  );
}
test("T97 piggybacks an existing write without another D1 call, with TTL and scope quotas", async (t) => {
  const f = fixture();
  let batches = 0;
  const original = f.db.batch.bind(f.db);
  t.mock.method(f.db, "batch", async (items: Parameters<DB["batch"]>[0]) => {
    batches++;
    return original(items);
  });
  await record(f);
  assert.equal(batches, 0);
  assert.equal(minimalCallQueueStatus(f.e.db).pending, 1);
  const results = await existingWrite(f);
  assert.equal(batches, 1);
  assert.equal(results.length, 1);
  let rows = f.db.raw.prepare("SELECT data_json FROM sb_timing_journal").all();
  assert.equal(rows.length, 1);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE|source_point_proof|coordinates/);
  for (const row of rows)
    assert.equal(Object.hasOwn(JSON.parse(String(row.data_json)), "x"), false);
  await record(f, f.now - minimalCallTTL - 1);
  await existingWrite(f);
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_timing_journal").get()!.n, 1);
  for (let i = 0; i < 205; i++) {
    await record(f, f.now + i);
    if (i % 16 === 15) await existingWrite(f);
  }
  while (minimalCallQueueStatus(f.e.db).pending) await existingWrite(f);
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_timing_journal").get()!.n, 200);
});
test("T97 erasure and ownership changes block delayed journal resurrection", async () => {
  for (const mutation of [
    "UPDATE sb_devices SET revoked=1",
    "UPDATE sb_devices SET owner_id='other'",
  ]) {
    const f = fixture();
    await record(f);
    f.db.raw.exec(mutation);
    await existingWrite(f);
    assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_timing_journal").get()!.n, 0);
  }
});
test("T97 failed business batch requeues only metadata and does not replay business writes", async () => {
  const f = fixture();
  await record(f);
  await assert.rejects(
    withMcpHotPath(() => f.e.batch([f.e.stmt("INSERT INTO no_such_table VALUES(1)")])),
  );
  assert.equal(minimalCallQueueStatus(f.e.db).pending, 1);
  await existingWrite(f);
  assert.equal(minimalCallQueueStatus(f.e.db).pending, 0);
});
test("T97 production diagnostics=false still records minimal rows", () => {
  const script = `globalThis.__SAYSO_DIAGNOSTICS__=false;
    const {recordMinimalCall,minimalCallQueueStatus}=await import('./lib/minimal-call-journal.ts');
    const {McpPerformance}=await import('./lib/mcp-performance.ts');const {setDebugScope}=await import('./lib/debug-scope.ts');
    const db={};const t=new McpPerformance({log:()=>{}});t.identify('tools/call','read_screen',['read_screen']);setDebugScope(t,'offline',{});
    await recordMinimalCall(db,t,1,1,2,2,{result:{content:[],structuredContent:{state:'unavailable'}}},50);
    if(minimalCallQueueStatus(db).pending!==1)throw Error('production disabled minimal record');`;
  const r = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
});
test("debug report includes observed gaps, byte counts and best-effort coverage without secrets", async () => {
  const f = fixture();
  await record(f, f.now - 100);
  await record(f, f.now - 50);
  await existingWrite(f);
  const report = (await getDebugReport(f.e, f.owner, { device_id: f.device }, "offline.invalid"))
    .report;
  assert.match(report, /完整调用记录/);
  assert.match(report, /boundary_elapsed_ms/);
  assert.match(report, /不是纯模型思考时间/);
  assert.doesNotMatch(report, /PRIVATE/);
  assert.equal(
    observedCallGap(
      { released_utc_ms: 100, device_states: [{ session_id: "a" }] },
      { received_utc_ms: 99, device_states: [{ session_id: "a" }] },
    ).gap_ms,
    null,
  );
});

test("open_app_search waits for its confirmed search image before exactly one type, and replay observes only", async (t) => {
  const f = fixture();
  let release!: (value: any) => void, started!: (value?: unknown) => void;
  const seen = new Promise((resolve) => {
    started = resolve;
  });
  let typed = 0;
  t.mock.method(MouseControl.prototype, "enqueueObserved", async () => {
    started();
    return (await new Promise((resolve) => {
      release = resolve;
    })) as any;
  });
  t.mock.method(
    MouseControl.prototype,
    "enqueueAuthorizedFieldObserved",
    async (
      ...[_user, args, requestID, options]: Parameters<
        MouseControl["enqueueAuthorizedFieldObserved"]
      >
    ) => {
      typed++;
      assert.equal(args.text, "Maps");
      assert.equal(args.submit, undefined);
      assert.equal(args.submit_enter, undefined);
      assert.ok(options?.serverSearch?.shortcut);
      return { ...f.search, kind: "keyboard.type_text", command_id: randomUUID() } as any;
    },
  );
  const args = { device_id: f.device, app_name: "Maps", idempotency_key: "once" };
  const pending = openAppSearch(f.e, f.owner, args, randomUUID());
  await seen;
  assert.equal(typed, 0);
  const concurrent = await openAppSearch(f.e, f.owner, args, randomUUID());
  assert.equal(concurrent.code, "OPERATION_ALREADY_STARTED");
  assert.equal(typed, 0);
  release(f.search);
  const result = await pending;
  assert.equal(typed, 1);
  assert.equal(result.code, "NEEDS_TARGET_REVIEW");
  assert.equal(result.enter_sent, false);
  const replay = await openAppSearch(f.e, f.owner, args, randomUUID());
  assert.equal(typed, 1);
  assert.equal(replay.code, "NEEDS_TARGET_REVIEW");
});
test("unknown search/type retains its preallocated original command ID without resubmission", async (t) => {
  const f = fixture();
  let searchAttempts = 0,
    typeAttempts = 0,
    original: string | undefined;
  t.mock.method(
    MouseControl.prototype,
    "enqueueObserved",
    async (...[_u, _k, _a, _r, options]: Parameters<MouseControl["enqueueObserved"]>) => {
      searchAttempts++;
      original = options?.commandID;
      throw Error("lost response");
    },
  );
  t.mock.method(MouseControl.prototype, "getSpotlightObserved", async () => {
    throw Error("lookup unavailable");
  });
  const first = await openAppSearch(
    f.e,
    f.owner,
    { device_id: f.device, app_name: "Maps", idempotency_key: "unknown-search" },
    randomUUID(),
  );
  assert.equal(first.command_id, original);
  assert.equal(first.search_command_id, original);
  assert.equal(first.code, "SEARCH_NOT_OPEN");
  assert.equal(searchAttempts, 1);
  t.mock.method(MouseControl.prototype, "enqueueObserved", async () => f.search as any);
  t.mock.method(
    MouseControl.prototype,
    "enqueueAuthorizedFieldObserved",
    async (
      ...[_u, _a, _r, options]: Parameters<MouseControl["enqueueAuthorizedFieldObserved"]>
    ) => {
      typeAttempts++;
      original = options?.commandID;
      throw Error("lost input response");
    },
  );
  const args = { device_id: f.device, app_name: "Maps", idempotency_key: "unknown-type" };
  const second = await openAppSearch(f.e, f.owner, args, randomUUID());
  assert.equal(second.command_id, original);
  assert.equal(second.type_command_id, original);
  assert.equal(second.code, "TEXT_UNCONFIRMED");
  await openAppSearch(f.e, f.owner, args, randomUUID());
  assert.equal(typeAttempts, 1);
});
test("T97 records the final guard's zero-image result and compact preserves its recovery state", async (t) => {
  const f = fixture();
  t.mock.method(
    f.e,
    "readScreenWithReleaseRetry",
    async () =>
      ({
        result: {
          state: "available",
          image: "QUJD",
          metadata: { ...f.metadata, capture_lower_server_utc_ms: Date.now() - 5000 },
        },
      }) as any,
  );
  const jobs:Promise<unknown>[]=[];
  const response = await runWithBridgeContext({waitUntil:job=>{jobs.push(job);}},()=>handleMcp(
    new Request("https://offline.invalid/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "read_screen",
          arguments: { device_id: f.device, wait_for_new_ms: 0, result_projection: "compact_v1" },
        },
      }),
    }),
    {
      engine: () => f.e,
      caller: () => f.owner,
      origin: "https://offline.invalid",
      retention: false,
      recordToolCall: (user) => recordToolActivity(f.e, user),
      performance: { log: () => {} },
    },
  ));
  await Promise.all(jobs);
  const body = (await response.json()) as any;
  assert.equal(body.result.content.filter((b: any) => b.type === "image").length, 0);
  await existingWrite(f);
  const row = JSON.parse(
    String(
      f.db.raw
        .prepare("SELECT data_json FROM sb_timing_journal WHERE record_key LIKE 'minimal:%'")
        .get()!.data_json,
    ),
  );
  assert.equal(row.image_count, 0);
  assert.equal(row.image_bytes, 0);
  assert.ok(row.text_utf8_bytes > 0);
  assert.ok(row.structured_utf8_bytes > 0);
});
test("open_app_search search failures, missing after-image, unknown and Stop never type", async (t) => {
  const f = fixture();
  let typed = 0;
  t.mock.method(MouseControl.prototype, "enqueueAuthorizedFieldObserved", async () => {
    typed++;
    throw Error("must not type");
  });
  for (const mode of ["unknown", "missing", "failed", "stopped", "scope"]) {
    t.mock.method(
      MouseControl.prototype,
      "enqueueObserved",
      async () =>
        ({
          ...f.search,
          ...(mode === "unknown"
            ? { state: "outcome_unknown" }
            : mode === "missing"
              ? { image: undefined }
              : mode === "failed"
                ? { state: "failed" }
                : mode === "stopped"
                  ? { state: "cancelled" }
                  : {
                      after_screen: {
                        ...f.search.after_screen,
                        metadata: { ...f.metadata, control_epoch_at_read: 3 },
                      },
                    }),
        }) as any,
    );
    const result = await openAppSearch(
      f.e,
      f.owner,
      { device_id: f.device, app_name: "Maps", idempotency_key: mode },
      randomUUID(),
    );
    assert.equal(result.code, mode === "stopped" ? "STOPPED" : "SEARCH_NOT_OPEN");
    assert.equal(result.enter_sent, false);
  }
  assert.equal(typed, 0);
});
test("Stop closes the persistent parent even between the two commands", async (t) => {
  const f = fixture();
  t.mock.method(MouseControl.prototype, "enqueueObserved", async () => {
    await cancelCurrentOperation(f.e, f.owner, f.device, undefined, 0);
    return f.search as any;
  });
  const result = await openAppSearch(
    f.e,
    f.owner,
    { device_id: f.device, app_name: "Maps", idempotency_key: "stop-gap" },
    randomUUID(),
  );
  assert.equal(result.code, "STOPPED");
  assert.equal(
    f.db.raw
      .prepare("SELECT count(*) n FROM sb_mouse_commands WHERE kind='keyboard.type_text'")
      .get()!.n,
    0,
  );
});
test("search input fence requires current parent scope, exact stable receipt, unchanged pixels and no later input", async () => {
  const f = fixture(),
    op = randomUUID(),
    sha = createHash("sha256").update("ABC").digest("hex");
  f.db.raw
    .prepare(
      "INSERT INTO sb_app_search_queries(id,owner_id,device_id,digest,created_at,reason,native_review_state) VALUES(?,?,?,'fixture',?,'OPEN_APP_SEARCH_ACTIVE',?)",
    )
    .run(
      op,
      f.owner.id,
      f.device,
      f.now,
      JSON.stringify({
        session: f.session,
        broadcast: f.broadcast,
        worker: f.worker,
        lease: 7,
        control: 2,
        hardware: f.hardware,
        boot: f.boot,
      }),
    );
  f.db.raw
    .prepare(
      "INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,control_epoch,created_at,expires_at,worker_id,lease_epoch,receipt,result_digest,input_attempted,phone_ack_mono_ms) VALUES(?,?,?,?,?,?,'keyboard.open_search','{}','fixture','fixture','board_acked',2,?,?,?,7,?,'fixture',1,100)",
    )
    .run(
      f.searchID,
      f.owner.id,
      f.device,
      f.session,
      f.hardware,
      f.boot,
      f.now,
      f.now + 90000,
      f.worker,
      JSON.stringify(f.receipt),
    );
  f.db.raw
    .prepare(
      "INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,capture_lower,received_at,expires_at,storage_ready) VALUES(?,?,?,?,1,7,'offline',?,?,?, ?,?,1)",
    )
    .run(
      f.device,
      f.owner.id,
      f.session,
      f.frame,
      sha,
      JSON.stringify({ orientation_epoch: 0 }),
      f.now - 100,
      f.now,
      f.now + 30000,
    );
  const fence = appSearchFence(
    { operation: op, shortcut: f.searchID, sha256: sha, orientation: 0 },
    String(f.now),
  );
  const query =
    "SELECT 1 ok FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session JOIN sb_hardware h ON h.device_id=d.id WHERE " +
    fence.sql;
  assert.ok(f.db.raw.prepare(query).get(...(fence.values as [])));
  for (const mutation of [
    "UPDATE sb_sessions SET control_epoch=3",
    "UPDATE sb_frames SET sha256='changed'",
    "UPDATE sb_mouse_commands SET cancel_requested=1",
    "UPDATE sb_app_search_queries SET reason='STOPPED',finished_at=1",
  ]) {
    f.db.raw.exec("SAVEPOINT reject");
    f.db.raw.exec(mutation);
    assert.equal(f.db.raw.prepare(query).get(...(fence.values as [])), undefined, mutation);
    f.db.raw.exec("ROLLBACK TO reject; RELEASE reject");
  }
});
test("composite search reobserves a replaced image after a proven zero-insert type rejection", async (t) => {
  const f = fixture();
  let searches = 0,
    attempts = 0,
    observations = 0;
  t.mock.method(
    MouseControl.prototype,
    "enqueueObserved",
    async (...[_u, _k, _a, _r, options]: Parameters<MouseControl["enqueueObserved"]>) => {
      searches++;
      const id = options!.commandID! as typeof f.searchID;
      f.search.command_id = id;
      f.search.after_screen.after_command.command_id = id;
      f.receipt.command_id = id;
      f.db.raw
        .prepare(
          "INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,control_epoch,created_at,expires_at,worker_id,lease_epoch,receipt,result_digest,phone_ack_mono_ms) VALUES(?,?,?,?,?,?,'keyboard.open_search','{}','fixture','shortcut','board_acked',2,?,?,?,7,?,'fixture',100)",
        )
        .run(
          id,
          f.owner.id,
          f.device,
          f.session,
          f.hardware,
          f.boot,
          f.now,
          f.now + 90000,
          f.worker,
          JSON.stringify(f.receipt),
        );
      // A new capture replaces the just-observed search image before type admission.
      f.db.raw
        .prepare(
          "INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,capture_lower,received_at,expires_at,storage_ready) VALUES(?,?,?,?,2,7,'offline',?,?,?, ?,?,1)",
        )
        .run(
          f.device,
          f.owner.id,
          f.session,
          randomUUID(),
          createHash("sha256").update("DEF").digest("hex"),
          JSON.stringify({ orientation_epoch: 0 }),
          f.now,
          f.now,
          f.now + 30000,
        );
      return f.search as any;
    },
  );
  t.mock.method(
    MouseControl.prototype,
    "getSpotlightObserved",
    async (_user: unknown, id: string) => {
      assert.equal(id, f.search.command_id, "only observe the original search");
      observations++;
      return { ...f.search, image: Buffer.from("DEF").toString("base64") } as any;
    },
  );
  const admit = MouseControl.prototype.enqueueAuthorizedFieldObserved;
  t.mock.method(
    MouseControl.prototype,
    "enqueueAuthorizedFieldObserved",
    async function (this: MouseControl,
      ...[user, args, request, options]: Parameters<MouseControl["enqueueAuthorizedFieldObserved"]>
    ) {
      attempts++;
      const result = await admit.call(
        this,
        user,
        { ...args, wait_ms: 0, observe_after: false },
        request,
        options,
      );
      assert.ok(result);
      return { ...f.search, command_id: result.command_id, kind: "keyboard.type_text" } as any;
    },
  );
  const result = await openAppSearch(
    f.e,
    f.owner,
    { device_id: f.device, app_name: "Maps", idempotency_key: "head-race" },
    randomUUID(),
  );
  assert.equal(
    result.code,
    "NEEDS_TARGET_REVIEW",
    JSON.stringify({ code: result.code, step_error: result.step_error }),
  );
  assert.equal(searches, 1);
  assert.equal(attempts, 2);
  assert.equal(observations, 1);
  assert.equal(
    f.db.raw
      .prepare("SELECT count(*) n FROM sb_mouse_commands WHERE kind='keyboard.type_text'")
      .get()!.n,
    1,
  );
});

test("confirmed search waits for images delayed 1-3 seconds and exhausts only the original budget", async (t) => {
  let clock = 0;
  t.mock.method(performance, "now", () => clock);
  for (const arrivesAt of [1000, 3000, Infinity]) {
    clock = 0;
    const f = fixture();
    let searches = 0,
      typed = 0,
      observations = 0;
    const missing = {
      ...f.search,
      image: undefined,
      after_screen: { state: "unavailable", reason: "WAITING_POST_COMMAND_FRAME" },
    };
    t.mock.method(MouseControl.prototype, "enqueueObserved", async () => {
      searches++;
      return missing as any;
    });
    t.mock.method(
      MouseControl.prototype,
      "getSpotlightObserved",
      async (...[_u, id, _r, options]: Parameters<MouseControl["getSpotlightObserved"]>) => {
        assert.equal(id, f.searchID);
        assert.equal(options!.operationDeadline, 12000);
        observations++;
        clock += 1000;
        return (clock >= arrivesAt ? f.search : missing) as any;
      },
    );
    t.mock.method(MouseControl.prototype, "enqueueAuthorizedFieldObserved", async () => {
      typed++;
      return { ...f.search, kind: "keyboard.type_text", command_id: randomUUID() } as any;
    });
    const args = { device_id: f.device, app_name: "Maps", idempotency_key: "delayed" };
    const result = await openAppSearch(f.e, f.owner, args, randomUUID());
    assert.equal(searches, 1);
    assert.equal(
      result.code,
      arrivesAt === Infinity ? "APP_SEARCH_BUDGET_EXHAUSTED" : "NEEDS_TARGET_REVIEW",
    );
    assert.equal(typed, arrivesAt === Infinity ? 0 : 1);
    assert.equal(observations, arrivesAt === Infinity ? 12 : arrivesAt / 1000);
    if (arrivesAt === Infinity) {
      assert.equal(result.budget_ms, 12000);
      assert.equal(result.completed_step, "search_command_acked");
      assert.equal(result.type_command_id, null);
      assert.equal(result.image, undefined);
    }
    await openAppSearch(f.e, f.owner, args, randomUUID());
    assert.equal(searches, 1, "parent replay cannot reopen search");
    assert.equal(typed, arrivesAt === Infinity ? 0 : 1, "parent replay cannot type again");
  }
});

test("modern projection keeps safety/recovery fields and proofs exact; legacy remains compatible", () => {
  for (const state of ["board_acked", "outcome_unknown", "failed", "cancelled"]) {
    const raw = {
      state,
      command_id: "original",
      move_command_id: "move",
      verification: "verified",
      input_not_submitted: false,
      typed_count: 2,
      typed_count_exact: true,
      board_receipt: {
        signature: "DIAGNOSTIC",
        effect: { typed_count: 2, typed_count_exact: true, all_released: false },
      },
      after_screen: {
        state: "unavailable",
        release_failure: "clock_unavailable",
        metadata: { frame_id: "actual", age_ms: 100 },
        source_point_proof: "exact-proof",
      },
      trace: { secret: "DIAGNOSTIC" },
      payload: { text: "PRIVATE" },
    };
    const projected = modelResultProjection("click_at", raw, true, "legacy");
    for (const key of [
      "state",
      "command_id",
      "move_command_id",
      "verification",
      "input_not_submitted",
      "typed_count",
      "typed_count_exact",
      "after_screen",
    ])
      assert.deepEqual(projected.summary[key], raw[key as keyof typeof raw]);
    assert.doesNotMatch(JSON.stringify(projected), /DIAGNOSTIC|PRIVATE/);
    assert.equal(modelResultProjection("click_at", raw, false, "legacy").summary, raw);
  }
  const source = readFileSync("lib/open-app-search.ts", "utf8");
  assert.doesNotMatch(source, /submit\s*:\s*["']enter|submit_enter\s*:\s*true/);
});


test("D207 search shares the 12000ms deadline across admission, both steps and both images",async t=>{
  for(const phase of ["parent","search","type"]){
    const f=fixture();let clock=0,typed=0;const passed:number[]=[];
    t.mock.method(performance,"now",()=>clock);
    if(phase==="parent"){const batch=f.e.batch.bind(f.e);t.mock.method(f.e,"batch",async(...args:Parameters<typeof batch>)=>{const result=await batch(...args);clock=12001;return result;});}
    t.mock.method(MouseControl.prototype,"enqueueObserved",async(...[_u,_k,_a,_r,o]:Parameters<MouseControl["enqueueObserved"]>)=>{
      passed.push(o!.operationDeadline!);clock=phase==="search"?12001:11900;return f.search as any;
    });
    t.mock.method(MouseControl.prototype,"enqueueAuthorizedFieldObserved",async(...[_u,_a,_r,o]:Parameters<MouseControl["enqueueAuthorizedFieldObserved"]>)=>{
      typed++;passed.push(o!.operationDeadline!);clock=12001;return {...f.search,kind:"keyboard.type_text"} as any;
    });
    const result=await openAppSearch(f.e,f.owner,{device_id:f.device,app_name:"Maps",idempotency_key:phase},randomUUID());
    assert.equal(result.code,"APP_SEARCH_BUDGET_EXHAUSTED");assert.equal(result.step,phase==="type"?"type_name":"open_search");
    assert.equal(result.completed_step,phase==="parent"?"none":phase==="search"?"search_command_acked":"type_after_image");
    assert.equal(typed,phase==="type"?1:0);assert.equal(result.image,undefined);assert.equal(result.enter_sent,false);
    assert.ok(passed.every(d=>d===12000));assert.equal(f.db.raw.prepare("SELECT finished_at IS NOT NULL AS done FROM sb_app_search_queries").get()!.done,1);
    t.mock.restoreAll();
  }
});


import {commandJournalScope,completeActionJournalScope,writeProductionJournal} from "../lib/action-journal.ts";
import {captureCompleteCall,recordCompleteCall} from "../lib/complete-call-journal.ts";
import {journalCommand} from "../lib/timing-journal.ts";
import {debugHash} from "../lib/debug-scope.ts";
function journalFixture(){
  const f=fixture(),clock=randomUUID(),parent=randomUUID(),child=randomUUID();
  const event={device_id:f.device,bridge_session_id:f.session,broadcast_id:f.broadcast,clock_domain_id:clock};
  f.db.raw.prepare("UPDATE sb_sessions SET event_clock=? WHERE id=?").run(JSON.stringify(event),f.session);
  const add=(id:string,kind:string,key:string,predecessor:string|null=null)=>f.db.raw.prepare(`INSERT INTO sb_mouse_commands
    (id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,
      control_epoch,created_at,expires_at,worker_id,lease_epoch,predecessor_id,event_clock)
    VALUES(?,?,?,?,?,?,?,'{}',?,?,'board_acked',2,?,?,?,7,?,?)`).run(id,f.owner.id,f.device,f.session,
      f.hardware,f.boot,kind,kind==="keyboard.type_text"?"hmac-v1:"+"a".repeat(64):"fixture",key,f.now,f.now+90000,f.worker,predecessor,JSON.stringify(event));
  add(parent,"pointer.move_absolute","parent");add(child,"pointer.click","child",parent);
  return {...f,clock,parent,child,add};
}
test("D207 production call and companion scope retain verified links and both phase timestamps only after waitUntil",async()=>{
  const f=journalFixture(),db=f.db as unknown as D1Database,trace=new McpPerformance({log:()=>{}}),jobs:Promise<unknown>[]=[];
  const command=f.db.raw.prepare("SELECT * FROM sb_mouse_commands WHERE id=?").get(f.child) as any;
  setDebugScope(trace,f.owner.id,{device_id:f.device});
  captureCompleteCall(trace,f.owner.id,{method:"tools/call",params:{name:"click_at",arguments:{}}},null);
  const body={result:{structuredContent:{command_id:f.child,state:"board_acked"},content:[]}};
  runWithBridgeContext({waitUntil:j=>{jobs.push(j);}},()=>{
    recordCompleteCall(()=>db,trace,f.now,0,f.now+10,10,body,100);
    journalCommand(db,command,"claim",f.now+1);journalCommand(db,command,"receipt",f.now+2);
  });
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_timing_journal").get()!.n,0);
  await Promise.all(jobs);
  const rows=f.db.raw.prepare("SELECT data_json FROM sb_timing_journal").all().map(r=>JSON.parse(String(r.data_json)));
  const call=rows.find(r=>r.record_kind==="complete_call"),companion=rows.find(r=>r.record_kind==="command_companion");
  for(const row of [call,companion]){assert.equal(row.device_id,f.device);assert.equal(row.session_id,f.session);
    assert.equal(row.broadcast_id,f.broadcast);assert.equal(row.clock_domain_id,f.clock);assert.equal(row.command_id,f.child);
    assert.equal(row.parent_command_id,f.parent);assert.equal(row.enqueued_utc_ms,f.now);}
  assert.equal(companion.claimed_utc_ms,f.now+1);assert.equal(companion.receipt_utc_ms,f.now+2);
  assert.deepEqual((await commandJournalScope(db,f.owner.id,f.parent))!.child_command_ids,[f.child]);
  assert.equal(await commandJournalScope(db,"other-owner",f.child),null);
  assert.equal(await commandJournalScope(db,f.owner.id,f.child,randomUUID()),null);
  assert.doesNotMatch(JSON.stringify(rows),/payload|fixture|token_hash|PRIVATE/);
  const {report}=await getDebugReport(f.e,f.owner,{device_id:f.device},"offline.invalid");
  assert.match(report,/parent_command_id/);assert.match(report,/receipt_utc_ms/);
  assert.equal(report.split("| tools/call | click_at | "+trace.requestID+" |").length-1,1,"one complete call per request");
});
test("D207 composite journal resolves retained search/type IDs; preallocated missing children stay null",async()=>{
  const f=journalFixture(),db=f.db as unknown as D1Database,operation=randomUUID(),search=randomUUID(),typed=randomUUID();
  f.db.raw.prepare("INSERT INTO sb_app_search_queries(id,owner_id,device_id,digest,created_at,reason,native_review_state) VALUES(?,?,?,'fixture',?,'SEARCH_NOT_OPEN','{}')")
    .run(operation,f.owner.id,f.device,f.now);
  const trace=new McpPerformance({log:()=>{}});setDebugScope(trace,f.owner.id,{device_id:f.device});
  const body={result:{structuredContent:{operation_id:operation,search_command_id:search,type_command_id:typed}}};
  let fields=await completeActionJournalScope(db,trace,f.owner.id,body);
  assert.equal(fields.search_command_id,null);assert.equal(fields.type_command_id,null);
  f.add(search,SYSTEM_SEARCH_KIND,`app-search-query:${operation}:shortcut`);
  f.add(typed,"keyboard.type_text",`app-search-query:${operation}:text`);
  fields=await completeActionJournalScope(db,trace,f.owner.id,body);
  assert.equal(fields.operation_id,operation);assert.equal(fields.search_command_id,search);assert.equal(fields.type_command_id,typed);
  assert.deepEqual(fields.child_command_ids,[search,typed]);
});
test("D207 production journal keeps 24h/200-row cap and site/device/session erasure fences including delayed enrichment misses",async()=>{
  const f=journalFixture(),db=f.db as unknown as D1Database,ownerHash=await debugHash(f.owner.id);
  const data={device_id:f.device,session_id:f.session,scope_device_ids:[f.device],scope_owner_hash:ownerHash,
    device_states:[{device_id:f.device,session_id:f.session}]};
  for(let i=0;i<202;i++)await writeProductionJournal(db,"minimal:cap:"+i,f.now,{...data,request_id:randomUUID()});
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_timing_journal").get()!.n,200);
  await writeProductionJournal(db,"minimal:expired",Date.now()-minimalCallTTL-1,data);
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_timing_journal WHERE record_key='minimal:expired'").get()!.n,0);
  for(const scope of ["site","device","sharing"]){
    f.db.raw.prepare("INSERT INTO sb_erasure_jobs(id,scope,owner_id,device_id,session_id,requested_at,phase,state,fenced,updated_at) VALUES(?,?,?,?,?,?,0,'requested',0,?)")
      .run(randomUUID(),scope,scope==="site"?null:f.owner.id,scope==="site"?null:f.device,scope==="sharing"?f.session:null,f.now,f.now);
    await writeProductionJournal(db,"minimal:blocked:"+scope,f.now,{...data,device_id:null,session_id:null});
    assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_timing_journal WHERE record_key=?").get("minimal:blocked:"+scope)!.n,0);
    f.db.raw.exec("DELETE FROM sb_erasure_jobs");
  }
});
