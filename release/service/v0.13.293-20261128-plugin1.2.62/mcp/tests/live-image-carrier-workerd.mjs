import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Log, LogLevel, Miniflare } from "miniflare";
import sharp from "sharp";
import { frameAcceptanceEvidenceSQL } from "../lib/frame-acceptance-evidence.ts";

const candidate = dirname(dirname(fileURLToPath(import.meta.url)));
const compiled = join(candidate, "dist", "server");
const config = JSON.parse(readFileSync(join(compiled, "wrangler.json"), "utf8"));
const entry = join(compiled, config.main);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const archive = process.env.SAYSO_LIVE_CARRIER_ARCHIVE ?? join(dirname(candidate), "iphone11-c124-replug-maps-full_map_confirmation.jpg");
const jpeg = readFileSync(archive);
const sha256 = digest(jpeg);
assert.equal(sha256, "cdbbc8c8987d12e0c403dbb588fa25f9613cf1217815784c2ec2513e60774d55");

function jsModules(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(item => item.isDirectory()
    ? jsModules(join(path, item.name)) : item.name.endsWith(".js") ? [join(path, item.name)] : []);
}

let networkCalls = 0;
const worker = new Miniflare({
  modulesRoot: compiled,
  modules: [entry, ...jsModules(compiled).filter(path => path !== entry)]
    .map(path => ({ type: "ESModule", path, contents: readFileSync(path, "utf8") })),
  compatibilityDate: config.compatibility_date,
  compatibilityFlags: config.compatibility_flags,
  bindings: { SAYSO_FRAME_PERMIT_HMAC_KEY_HEX: "ab".repeat(32) },
  d1Databases: { DB: "offline-live-carrier" },
  r2Buckets: { BUCKET: "offline-live-carrier" },
  outboundService: () => { networkCalls++; return new Response("Offline fixture", { status: 403 }); },
  log: new Log(LogLevel.NONE),
  handleRuntimeStdio(stdout, stderr) {
    for (const stream of [stdout, stderr]) stream.resume();
  },
});

const owner = "offline-live-image-owner";
const [device, session, broadcast, workerID, frame] = Array.from({ length: 5 }, () => randomUUID());
const mcp = async (method, params, actor = owner) => {
  const response = await worker.dispatchFetch("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2026-07-28",
      "oai-authenticated-user-id": actor, "Accept-Encoding": "identity" },
    body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method, params }),
    signal: AbortSignal.timeout(6000),
  });
  assert.equal(response.status, 200);
  return { age: response.headers.get("X-SaySo-Frame-Age-Ms"), ...await response.json() };
};
const read = (format, actor) => mcp("tools/call", { name: "read_screen_live", arguments: {
  device_id: device, image_format: format, wait_for_new_ms: 0,
} }, actor);

try {
  const db = await worker.getD1Database("DB");
  const schema = readdirSync(join(candidate, "drizzle")).filter(name => name.endsWith(".sql")).sort()
    .flatMap(name => readFileSync(join(candidate, "drizzle", name), "utf8").split("--> statement-breakpoint"))
    .map(sql => sql.trim()).filter(Boolean);
  await db.batch(schema.map(sql => db.prepare(sql)));
  const initialized = await mcp("initialize", { protocolVersion: "2026-07-28" });
  const version = initialized.result?.serverInfo?.version;
  assert.equal(version, process.env.SAYSO_TEST_RUNTIME ?? "0.13.216");

  const now = Date.now(), liveUntil = now + 90000;
  const metadata = {
    bridge_session_id: session, broadcast_id: broadcast, worker_id: workerID, lease_epoch: 7, control_epoch: 2,
    frame_id: frame, frame_seq: 1, source_seq: 1, capture_mono_ms: 10000, capture_clock_verified: true,
    provenance: "device_capture", width: 444, height: 960, native_width_px: 828, native_height_px: 1792,
    orientation: "portrait", orientation_epoch: 0, content_rect: { x: 0, y: 0, width: 444, height: 960 },
    transform_version: "1", content_sha256: sha256,
  };
  const acceptance = frameAcceptanceEvidenceSQL("CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)");
  await db.batch([
    db.prepare("INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,confirmed_at,created_at,current_session,lease_epoch,worker_id,worker_expires) VALUES(?,?,'Offline carrier',?,?,?,?,?,7,?,?)")
      .bind(device, owner, digest("fixture token"), liveUntil, now, now, session, workerID, liveUntil),
    db.prepare("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,control_epoch,mouse_enabled,input_end,mode) VALUES(?,?,?,?,?,?,'active','active',?,2,0,?,'broadcast')")
      .bind(session, owner, device, broadcast, randomUUID(), "offline", now, liveUntil),
    db.prepare("INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,capture_lower,received_at,expires_at,storage_ready,inline_jpeg) VALUES(?,?,?,?,1,7,?,?,?,?,?,?,1,?)")
      .bind(device, owner, session, frame, "fixture:" + frame, sha256, JSON.stringify(metadata), now - 10, now, liveUntil, jpeg.toString("base64")),
    db.prepare("INSERT INTO sb_observations(id,device_id,frame_id,created_at) VALUES(?,?,?,?)").bind(device + ":" + frame, device, frame, now),
    db.prepare(acceptance).bind(device + ":" + frame),
  ]);

  const reports = {};
  for (const format of ["original_jpeg", "compact_jpeg", "compact_png"]) {
    const response = await read(format);
    assert.ok(response.age !== null && Number(response.age) < 2000);
    assert.equal(response.result?.content?.length, 2, response.result?.content?.find(block => block.type === "text")?.text);
    const [image, text] = response.result.content;
    const shown = JSON.parse(text.text);
    assert.deepEqual(shown, response.result.structuredContent);
    assert.deepEqual(Object.keys(shown).sort(), ["image", "mcp_request_id", "runtime_version", "state"]);
    assert.equal(shown.image.view_only, true);
    assert.equal(shown.image.format, format);
    const mime = format.endsWith("png") ? "image/png" : "image/jpeg";
    assert.equal(image.mimeType, mime);
    assert.equal(shown.image.mime_type, mime);
    const bytes = Buffer.from(image.data, "base64"), compact = format.startsWith("compact_");
    const decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    const expected = compact ? [222, 480] : [444, 960];
    assert.deepEqual([decoded.info.width, decoded.info.height], expected);
    assert.deepEqual([shown.image.width, shown.image.height], expected);
    if (compact) assert.ok(bytes.length <= 49152);
    else assert.equal(digest(bytes), sha256);
    reports[format] = { bytes: bytes.length, width: expected[0], height: expected[1], final_age_ms: Number(response.age) };
  }

  const compatible = await mcp("tools/call", { name: "read_screen", arguments: {
    device_id: device, if_unchanged_since: "00000000-0000-8000-a000-000000000001", wait_for_new_ms: 0,
  } });
  assert.equal(compatible.result?.content?.[0]?.mimeType, "image/png");
  assert.equal(compatible.result?.structuredContent?.image?.format, "compact_png");
  assert.equal(compatible.result?.structuredContent?.source_point_proof, undefined);
  assert.equal(Buffer.from(compatible.result.content[0].data, "base64").length, reports.compact_png.bytes);

  const otherOwner = await read("compact_png", "offline-unrelated-owner");
  await db.prepare("UPDATE sb_frames SET capture_lower=? WHERE device_id=?").bind(Date.now() - 2500, device).run();
  const expired = await read("compact_png");
  for (const blocked of [otherOwner, expired]) {
    assert.equal(blocked.age, null);
    assert.equal(blocked.result.content.filter(block => block.type === "image").length, 0);
    assert.equal(blocked.result.structuredContent.image, undefined);
  }
  for (const table of ["sb_mouse_commands", "sb_released_system_search_field_proofs"]) {
    assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n, 0);
  }
  assert.equal(networkCalls, 0);
  console.log(JSON.stringify({ runtime: version, worker_sha256: digest(readFileSync(entry)), carriers: reports,
    denied_other_owner: true, denied_expired: true, action_rows: 0, proof_rows: 0, outbound: networkCalls }));
} finally {
  await worker.dispose();
}
