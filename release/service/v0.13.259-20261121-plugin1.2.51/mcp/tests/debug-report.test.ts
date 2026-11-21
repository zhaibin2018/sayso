import { test } from "node:test";
import assert from "node:assert/strict";
import { DB } from "./fixtures/retention.ts";
import { getDebugReport, debugSGT } from "../lib/debug-report.ts";
import { debugHash } from "../lib/debug-scope.ts";
import { handleMcp } from "../lib/mcp-protocol.ts";
import { runWithBridgeContext } from "../lib/bridge-context.ts";
import { mcpToolsForAudience } from "../lib/mcp-tool-catalog.ts";
import { BridgeError, type BridgeEngine } from "../lib/bridge-engine.ts";
import { writeJournal, journalTTL } from "../lib/timing-journal.ts";
import { DataErasure } from "../lib/data-erasure.ts";
import { Bucket } from "./fixtures/retention.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = Date.parse("2026-11-21T01:52:31.204Z"),
  device = id(1),
  session = id(2),
  owner = { id: "owner-private", label: "secret@example.com" };
function fixture(paired = true) {
  const db = new DB();
  const pair = (d = device, o = owner.id) =>
    db.raw
      .prepare(
        "INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,created_at,current_session,worker_expires,last_seen) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        d,
        o,
        "PRIVATE_DEVICE",
        "SECRET_TOKEN_" + d,
        now + 86400_000,
        now - 600_000,
        d === device ? session : null,
        now + 60_000,
        now - 100,
      );
  if (paired) {
    pair();
    db.raw
      .prepare(
        "INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,mode,mouse_enabled,mouse_until,control_epoch,mouse_grant_request) VALUES(?,?,?,?,?,?,'active','active',?,'broadcast',1,?,7,?)",
      )
      .run(
        session,
        owner.id,
        device,
        id(3),
        id(4),
        "SECRET_BODY_HASH",
        now - 590_000,
        now + 512_000,
        id(5),
      );
    db.raw
      .prepare(
        "INSERT INTO sb_hardware(device_id,owner_id,hardware_id,board_boot_id,metadata,usb_connected) VALUES(?,?,?,?,?,1)",
      )
      .run(
        device,
        owner.id,
        id(6),
        id(7),
        JSON.stringify({
          password: "SECRET_PASSWORD",
          firmware: "SECRET_FIRMWARE",
          text: "PRIVATE_TYPED_TEXT",
        }),
      );
    db.raw
      .prepare(
        "INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,capture_lower,received_at,expires_at,inline_jpeg) VALUES(?,?,?,?,18342,1,?,?,?,?,?,?,?)",
      )
      .run(
        device,
        owner.id,
        session,
        id(8),
        "SECRET_IMAGE_KEY",
        "SECRET_IMAGE_HASH",
        JSON.stringify({
          orientation: "portrait",
          text: "PRIVATE_TYPED_TEXT",
          proof: "SECRET_PROOF",
          image: "SECRET_PIXELS",
        }),
        now - 600,
        now - 500,
        now + 30_000,
        "SECRET_PIXELS",
      );
  }
  const service = { db: db as unknown as D1Database, now: () => now } as BridgeEngine;
  const row = async (
    n: number,
    at: number,
    data: Record<string, unknown> = {},
    d = device,
    o = owner.id,
  ) => {
    db.raw
      .prepare("INSERT INTO sb_timing_journal(record_key,received_utc_ms,data_json) VALUES(?,?,?)")
      .run(
        id(n),
        at,
        JSON.stringify({
          rpc: "tools/call",
          request_id: id(n),
          tool: "click_at",
          scope_owner_hash: await debugHash(o),
          scope_device_ids: [d],
          target_key: await debugHash("point:5:12"),
          outcome: "ok",
          result_state: "board_acked",
          server_elapsed_ms: 12.3,
          frame_seq: 18342,
          ...data,
        }),
      );
  };
  return {
    db,
    service,
    pair,
    row,
    report: (args: Record<string, unknown> = {}) =>
      getDebugReport(service, owner, args, "saysoapp.chatgpt.site"),
  };
}
async function rpc(
  service: BridgeEngine,
  name: string,
  args: Record<string, unknown> = {},
  authenticated = true,
  retention = true,
) {
  const jobs: Promise<unknown>[] = [];
  const response = await runWithBridgeContext(
    {
      waitUntil: (job) => {
        jobs.push(job);
      },
    },
    () =>
      handleMcp(
        new Request("https://sayso.example.invalid/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        }),
        {
          retention,
          engine: () => service,
          caller: () => {
            if (!authenticated) throw new BridgeError("UNAUTHENTICATED", 401);
            return owner;
          },
          origin: "https://sayso.example.invalid",
          performance: { log: () => {} },
        },
      ),
  );
  const body = (await response.json()) as any;
  await Promise.all(jobs);
  return { body, response };
}

test("D132 normal report retains every field, millisecond SGT, newest first and complete window summary", async () => {
  const f = fixture();
  await f.row(10, now - 1000);
  await f.row(11, now - 500, {
    outcome: "error",
    error_code: "FIELD_CONTROL_CHANGED_OR_BUSY",
    result_state: "failed",
  });
  const { report } = await f.report({ limit: 1 });
  for (const field of [
    "SaySo 调试报告",
    "2026-11-21 09:52:31.204 SGT（UTC+8）",
    "【环境】",
    "Site：saysoapp",
    "App：未知",
    "固件：未知",
    "【当前状态】",
    "已允许",
    "剩余 512 秒",
    "代数 7",
    "帧 #18342，年龄 0.6 秒，竖屏，静止=否",
    "【最近操作】",
    "第几次尝试",
    "【最近状态变化】",
    "【汇总】",
    "| click_at | 2 | 1 |",
    "| FIELD_CONTROL_CHANGED_OR_BUSY | 1 |",
  ])
    assert.ok(report.includes(field), field);
  assert.ok(report.includes(id(11)));
  assert.ok(!report.includes(id(10)));
  assert.match(report, /\| 2 \|\n/);
  assert.equal(debugSGT(Date.parse("2026-11-20T23:59:59.999Z")), "2026-11-21 07:59:59.999 SGT");
});

test("D132 empty records and no paired device keep all report sections", async () => {
  for (const paired of [true, false]) {
    const { report } = await fixture(paired).report();
    for (const field of [
      "【环境】",
      "【当前状态】",
      "【最近操作】",
      "【最近状态变化】",
      "【汇总】",
      "（无可用记录）",
      "现存 0 条操作",
    ])
      assert.ok(report.includes(field));
  }
});

test("T87 report includes finite segments, frame UUID, uncertainty and observational O/P/G",async()=>{
  const f=fixture();
  await f.row(91,now-100,{frame_id:id(8),fetch_utc_ms:now-110,handler_utc_ms:now-105,released_utc_ms:now-80,
    boundary_elapsed_ms:30,handler_to_release_ms:25,session_id:session});
  await f.row(92,now-50,{fetch_utc_ms:now-60,handler_utc_ms:now-50,released_utc_ms:now-20,
    boundary_elapsed_ms:40,handler_to_release_ms:30,session_id:session,previous_request_id:id(91),previous_link_qualified:true});
  const {report}=await f.report();
  for(const text of ["【每次调用分段】","误差 ms","缺失原因","服务端边界外残差","【相邻调用】","O_i ms","G_i ms",id(8),"encoding","not_recorded"])
    assert.ok(report.includes(text),text);
  assert.ok(report.includes("| 30 | 50 | 20 |"));
  assert.doesNotMatch(report,/纯模型时间|模型耗时/);
});

test("D132 foreign owner/device and unscoped legacy records cannot appear", async () => {
  const f = fixture();
  f.pair(id(20));
  f.pair(id(21), "other-owner");
  await f.row(30, now - 200, {}, id(20));
  await f.row(31, now - 100, {}, device, "other-owner");
  await f.row(32, now - 50, { scope_owner_hash: undefined });
  await f.row(33, now - 25, { command_id: id(34) });
  const { report } = await f.report({ device_id: device });
  for (const n of [20, 21, 30, 31, 32, 34]) assert.ok(!report.includes(id(n)));
  await assert.rejects(f.report(), (e: any) => e.code === "CHOOSE_DEVICE");
  await assert.rejects(f.report({ device_id: id(21) }), (e: any) => e.code === "NOT_FOUND");
  f.db.raw.prepare("UPDATE sb_devices SET revoked=1 WHERE id=?").run(device);
  await assert.rejects(f.report({ device_id: device }), (e: any) => e.code === "NOT_FOUND");
});

test("D132 strict allowlist removes credentials, typed text, images, labels and arbitrary error strings", async () => {
  const f = fixture();
  await f.row(40, now - 100, {
    text: "PRIVATE_TYPED_TEXT",
    password: "SECRET_PASSWORD",
    token: "SECRET_TOKEN",
    proof: "SECRET_PROOF",
    signature: "SECRET_SIGNATURE",
    key: "SECRET_KEY",
    image: "SECRET_PIXELS",
    email: "secret@example.com",
    arguments: { text: "PRIVATE_TYPED_TEXT" },
    error_code: "SECRET_CREDENTIAL_VALUE",
    outcome: "error",
    result_state: "failed",
    frame_seq: "SECRET_PIXELS",
  });
  await f.row(41, now - 90, { tool: "SECRET_TOOL" });
  const { body } = await rpc(f.service, "get_debug_report");
  const raw = JSON.stringify(body);
  assert.equal(body.result.isError, false);
  assert.equal(body.result.content.length, 1);
  assert.equal(body.result.content[0].text, body.result.structuredContent.report);
  assert.doesNotMatch(
    raw,
    /SECRET_|PRIVATE_|secret@example|owner-private|body_hash|scope_owner_hash|target_key|data:image/,
  );
  assert.match(raw, /UNKNOWN_ERROR/);
  assert.equal(
    body.result.content.some((v: any) => v.type === "image"),
    false,
  );
});

test("D132 report RPC is authenticated, read-only and creates no journal or retention writes", async () => {
  const f = fixture();
  await f.row(50, now - 100);
  const before = f.db.raw.prepare("SELECT total_changes() n").get()!.n;
  const result = await rpc(f.service, "get_debug_report");
  assert.equal(result.body.result.isError, false);
  assert.equal(f.db.raw.prepare("SELECT total_changes() n").get()!.n, before);
  const denied = await rpc(f.service, "get_debug_report", {}, false);
  assert.equal(denied.response.status, 401);
  assert.equal(denied.body.result, undefined);
  const tool = mcpToolsForAudience().find((t) => t.name === "get_debug_report")!;
  assert.deepEqual(tool.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
});

test("D1 environment shows only validated database placement, including unpaired and missing data", async () => {
  for (const paired of [false,true]) {
    const f=fixture(paired), args=paired?{device_id:device}:{};
    assert.match((await getDebugReport(f.service,owner,args,"fixture.invalid")).report,/数据库位置：还没有记录/);
    for (const primary of [true,false,null]) {
      f.db.raw.prepare("UPDATE sb_maintenance_state SET d1_placement_json=?").run(JSON.stringify({served_by_region:"APAC",served_by_colo:"SIN",served_by_primary:primary,recorded_at_ms:now}));
      const before=f.db.raw.prepare("SELECT total_changes() n").get()!.n;
      const report=(await getDebugReport(f.service,owner,args,"fixture.invalid")).report;
      assert.ok(report.includes(`数据库位置：APAC / SIN（${primary===true?"主库":primary===false?"副本":"主副库未知"}`),report);
      assert.ok(report.includes(debugSGT(now)));
      assert.equal(f.db.raw.prepare("SELECT total_changes() n").get()!.n,before);
    }
    f.db.raw.prepare("UPDATE sb_maintenance_state SET d1_placement_json=?").run('{"served_by_region":"PRIVATE","served_by_colo":"SECRET","recorded_at_ms":123}');
    const report=(await getDebugReport(f.service,owner,args,"fixture.invalid")).report;
    assert.match(report,/数据库位置：还没有记录/); assert.doesNotMatch(report,/PRIVATE|SECRET/);
  }
});

test("D132 parameter limits, bounds and unknown arguments are enforced by server", async () => {
  const f = fixture();
  for (const args of [
    { minutes: 61 },
    { minutes: 0 },
    { minutes: 1.1 },
    { minutes: "15" },
    { minutes: null },
    { limit: 51 },
    { limit: 0 },
    { limit: 1.5 },
    { limit: null },
    { device_id: "foreign" },
    { text: "PRIVATE_TYPED_TEXT" },
  ]) {
    const { body } = await rpc(f.service, "get_debug_report", args);
    assert.equal(body.result.isError, true, JSON.stringify(args));
    assert.ok(body.result.structuredContent.error);
  }
  for (const args of [
    { minutes: 1, limit: 1 },
    { minutes: 60, limit: 50 },
  ])
    assert.equal((await rpc(f.service, "get_debug_report", args)).body.result.isError, false);
});

test("D132 retries separate targets/tools, count at 60 seconds, reset after 60 seconds and look behind display window", async () => {
  const f = fixture();
  await f.row(90, now - 181_000);
  await f.row(91, now - 121_000);
  await f.row(60, now - 61_000);
  await f.row(61, now - 1000);
  await f.row(62, now - 500, { target_key: await debugHash("other") });
  await f.row(63, now - 400, { tool: "move_mouse_to" });
  await f.row(64, now - 300, { tool: "type_text_in_field", result_state: "queued" });
  let report = (await f.report({ minutes: 1 })).report;
  const line = report.split("\n").find((v) => v.includes(id(61)))!;
  assert.match(line, /\| 4 \|$/);
  for (const n of [62, 63, 64])
    assert.match(
      report.split("\n").find((v) => v.includes(id(n)))!,
      /\| 1 \|$/,
    );
  assert.match(report, /\| type_text_in_field \| 1 \| 0 \|/);
  await f.row(65, now - 100, { target_key: await debugHash("gap") });
  await f.row(66, now - 60_101, { target_key: await debugHash("gap") });
  report = (await f.report({ minutes: 1 })).report;
  assert.match(
    report.split("\n").find((v) => v.includes(id(65)))!,
    /\| 1 \|$/,
  );
});

test("D132 actual journal enrichment persists scope but never input, identity labels, credentials or images", async () => {
  const f = fixture(),
    text = "4111-1111-1111-1111";
  await rpc(
    f.service,
    "type_text_in_field",
    { device_id: device, idempotency_key: "PRIVATE_KEY", text },
    true,
    false,
  );
  const rows = f.db.raw.prepare("SELECT data_json FROM sb_timing_journal").all();
  assert.equal(rows.length, 1);
  const value = JSON.parse(String(rows[0].data_json));
  assert.equal(value.scope_owner_hash, await debugHash(owner.id));
  assert.deepEqual(value.scope_device_ids, [device]);
  assert.equal(value.reason_code, "SENSITIVE_INPUT_USER_MUST_TYPE");
  assert.doesNotMatch(
    JSON.stringify(rows),
    /4111|PRIVATE_|SECRET_|secret@example|owner-private|idempotency|proof|signature/,
  );
});

test("D132 scoped journal follows L04 device erasure, fences delayed writes and preserves other devices", async () => {
  const f = fixture();
  f.pair(id(70));
  await f.row(71, now - 100);
  await f.row(72, now - 50, {}, id(70));
  const jobs = new DataErasure(f.service.db, new Bucket() as unknown as R2Bucket, () => now),
    job = id(73);
  await jobs.request({ id: job, scope: "device", owner: owner.id, device });
  for (let i = 0; i < 100 && (await jobs.status(job)).state !== "complete"; i++)
    await jobs.advance(job);
  assert.equal((await jobs.status(job)).state, "complete");
  assert.deepEqual(
    f.db.raw
      .prepare("SELECT record_key FROM sb_timing_journal")
      .all()
      .map((v) => v.record_key),
    [id(72)],
  );
  await writeJournal(
    f.service.db,
    id(74),
    now,
    { scope_owner_hash: await debugHash(owner.id), scope_device_ids: [device] },
    now,
  );
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_timing_journal").get()!.n, 1);
  await writeJournal(
    f.service.db,
    id(75),
    now,
    { scope_owner_hash: await debugHash(owner.id), scope_device_ids: [id(70)] },
    now,
  );
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_timing_journal").get()!.n, 2);
});

test("D132 display cap keeps newest fifty, summary spans window and expired journal data stays private", async () => {
  const f = fixture();
  for (let n = 100; n < 160; n++) await f.row(n, now - 1000 + n);
  await f.row(160, now - journalTTL - 1);
  await f.row(161, now + 1);
  const { report } = await f.report({ minutes: 60, limit: 50 });
  assert.match(report, /现存 60 条操作/);
  assert.ok(!report.includes(id(109)));
  assert.ok(report.includes(id(110)));
  assert.ok(report.includes(id(159)));
  assert.ok(!report.includes(id(160)));
  assert.ok(!report.includes(id(161)));
  assert.ok(report.indexOf(id(159)) < report.indexOf(id(110)));
});

test("D132 tool descriptions and parameter descriptions contain zero approval-direction wording", () => {
  const pattern =
    /approval|classifier|\b(?:low|high)[ -]risk\b|\b(?:no|without|skip) confirmation\b|without asking|(?:no|without|without repeated) (?:additional |extra )?permission(?: questions)?|needs no additional permission|do not ask which app|无需确认|无须确认|批准|不必等批准卡片/i;
  const texts: string[] = [];
  for (const tool of mcpToolsForAudience("development")) {
    texts.push(tool.description);
    for (const parameter of Object.values(tool.inputSchema.properties))
      if (typeof (parameter as any).description === "string")
        texts.push((parameter as any).description);
  }
  assert.equal(texts.filter((value) => pattern.test(value)).length, 0);
});
