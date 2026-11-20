import { BridgeError, BridgeEngine, finite, hash, integer, need, record, text, uid, uuid, type Device, type User } from "./bridge-engine.ts";
import { scheduleLatestExpiryCleanup } from "./latest-expiry-cleanup.ts";

function rectangle(value: unknown, width: number, height: number) {
  const r = record(value);
  need(Object.keys(r).every(key => ["x", "y", "width", "height"].includes(key)), "INVALID_OCR_BOUNDS", 422);
  const x = finite(r.x, 0, width), y = finite(r.y, 0, height), w = finite(r.width, 0, width), h = finite(r.height, 0, height);
  need(x + w <= width + 0.001 && y + h <= height + 0.001, "INVALID_OCR_BOUNDS", 422);
}
export function validateDocument(raw: unknown, meta: Record<string, unknown>) {
  const p = record(raw), keys = "schema engine recognition_level coordinate_space actionability image_width image_height recognition_revision recognition_languages full_text blocks barcodes recognition_ms truncated omitted_blocks omitted_candidates warnings".split(" ");
  need(Object.keys(p).every(key => keys.includes(key)), "UNKNOWN_OCR_FIELD", 422);
  need(p.schema === "screen_text.v1" && p.engine === "apple_vision" && p.recognition_level === "accurate", "INVALID_OCR_SCHEMA", 422);
  need(p.coordinate_space === "pixels_top_left" && p.actionability === "not_inferred", "INVALID_OCR_COORDINATES", 422);
  const width = integer(p.image_width, 1, 8192), height = integer(p.image_height, 1, 8192);
  need(width === meta.width && height === meta.height && width === meta.native_width_px && height === meta.native_height_px, "OCR_DIMENSION_MISMATCH", 422);
  integer(p.recognition_revision, 1, 100); finite(p.recognition_ms, 0, 300_000);
  text(p.full_text, 131_072, true);
  need(Array.isArray(p.recognition_languages) && p.recognition_languages.length <= 16, "INVALID_OCR_LANGUAGES", 422);
  for (const language of p.recognition_languages) text(language, 32);
  need(typeof p.truncated === "boolean", "INVALID_OCR_TRUNCATION", 422);
  integer(p.omitted_blocks, 0); integer(p.omitted_candidates, 0);
  need(Array.isArray(p.warnings) && p.warnings.length <= 16, "INVALID_OCR_WARNINGS", 422);
  for (const warning of p.warnings) text(warning, 160);
  need(Array.isArray(p.blocks) && p.blocks.length <= 1024, "TOO_MANY_OCR_BLOCKS", 413);
  const ids = new Set();
  for (const rawBlock of p.blocks) {
    const b = record(rawBlock);
    need(Object.keys(b).every(key => ["id", "text", "confidence", "bounds", "candidates"].includes(key)), "UNKNOWN_OCR_BLOCK_FIELD", 422);
    text(b.id, 32); need(!ids.has(b.id), "DUPLICATE_OCR_ID", 422); ids.add(b.id);
    text(b.text, 16_384); finite(b.confidence, 0, 1); rectangle(b.bounds, width, height);
    need(Array.isArray(b.candidates) && b.candidates.length >= 1 && b.candidates.length <= 3, "INVALID_OCR_CANDIDATES", 422);
    for (const candidate of b.candidates) { const c = record(candidate); need(Object.keys(c).every(key => ["text", "confidence"].includes(key)), "INVALID_OCR_CANDIDATE", 422); text(c.text, 16_384); finite(c.confidence, 0, 1); }
    const first = record(b.candidates[0]); need(first.text === b.text && first.confidence === b.confidence, "OCR_CANDIDATE_MISMATCH", 422);
  }
  need(p.full_text === p.blocks.map(block => record(block).text).join("\n"), "OCR_TEXT_MISMATCH", 422);
  need(Array.isArray(p.barcodes) && p.barcodes.length <= 64, "TOO_MANY_BARCODES", 413);
  for (const barcode of p.barcodes) { const b = record(barcode); need(Object.keys(b).every(key => ["symbology", "payload", "confidence", "bounds"].includes(key)), "INVALID_BARCODE", 422); text(b.symbology, 80); if (b.payload != null) text(b.payload, 16_384, true); finite(b.confidence, 0, 1); rectangle(b.bounds, width, height); }
  const serialized = JSON.stringify(p);
  need(new TextEncoder().encode(serialized).length <= 196_608, "OCR_PAYLOAD_TOO_LARGE", 413);
  return { p, serialized };
}

export class ScreenText {
  private engine: BridgeEngine;
  private readNow:()=>number;
  private readSleep:(milliseconds:number)=>Promise<void>;
  constructor(engine: BridgeEngine, timing: {now?:()=>number;sleep?:(milliseconds:number)=>Promise<void>} = {}) {
    this.engine = engine;this.readNow=timing.now??(()=>performance.now());this.readSleep=timing.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  }
  async acceptRequest(request: Request, body: Record<string, unknown>) {
    const match = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,512})$/);
    need(match, "UNAUTHENTICATED", 401);
    return this.commit(body, "d.token_hash=? AND d.token_expires>?", [await hash(match[1]), this.engine.now()]);
  }
  async accept(device: Device, body: Record<string, unknown>) {
    return this.commit(body, "d.id=? AND d.owner_id=?", [device.id, device.owner_id]);
  }
  private async commit(body: Record<string, unknown>, auth: string, authValues: unknown[]) {
    const started = performance.now(), e = this.engine;
    let frameID: unknown;
    let commitTiming: Record<string,number> = {};
    try {
      need(Object.keys(body).every(key => ["metadata", "ocr"].includes(key)), "UNKNOWN_OCR_ENVELOPE_FIELD", 422);
      const meta = e.validateMetadata(record(body.metadata), 8192), { p, serialized } = validateDocument(body.ocr, meta);
      frameID = meta.frame_id;
      need(meta.content_sha256 === await hash(p.full_text as string), "OCR_HASH_MISMATCH", 422);
      need(meta.capture_clock_verified === true && !meta.refresh_request_id && meta.clock_probe_id, "CLOCK_UNCERTAIN");
      const probe = uuid(meta.clock_probe_id), offset = finite(meta.capture_offset_ms, -300_000, 60_000), rtt = finite(meta.clock_rtt_ms, 0, 2000), now = e.now();
      const lower = "(p.created_at+?-50)";
      // One database round trip; each write binds live authentication, session,
      // worker, conservative clock, and increasing capture order atomically.
      const joins = " FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id JOIN sb_clock_probes p ON p.id=? AND p.device_id=d.id AND p.expires_at>?";
      const guard = " WHERE " + auth + " AND d.revoked=0 AND d.current_session=? AND d.worker_id=? AND d.lease_epoch=? AND d.worker_expires>? AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.broadcast_id=? AND " + lower + " BETWEEN ? AND ? AND ABS(?-" + lower + ")<=30000 AND NOT EXISTS(SELECT 1 FROM sb_screen_texts t WHERE t.device_id=d.id AND t.session_id=s.id AND (t.frame_seq>=? OR t.capture_mono>=? OR t.orientation_epoch>?))";
      const guards = [probe, now, ...authValues, meta.bridge_session_id, meta.worker_id, meta.lease_epoch, now, meta.broadcast_id, offset, now - 2000, now + 100, Date.parse(meta.captured_at as string), offset, meta.frame_seq, meta.capture_mono_ms, meta.orientation_epoch];
      const batchStarted=performance.now();
      const results = await e.db.batch([
        e.stmt("INSERT INTO sb_observations(id,device_id,frame_id,created_at) SELECT d.id||':'||?,d.id,?,?" + joins + guard, meta.frame_id, meta.frame_id, now, ...guards),
        e.stmt("INSERT INTO sb_screen_texts(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,capture_mono,orientation_epoch,metadata,payload,capture_lower,received_at,expires_at) SELECT d.id,d.owner_id,s.id,?,?,?,?,?,?,?," + lower + ",?,?" + joins + guard + " AND EXISTS(SELECT 1 FROM sb_observations o WHERE o.id=d.id||':'||? AND o.created_at=?) ON CONFLICT(device_id) DO UPDATE SET owner_id=excluded.owner_id,session_id=excluded.session_id,frame_id=excluded.frame_id,frame_seq=excluded.frame_seq,lease_epoch=excluded.lease_epoch,capture_mono=excluded.capture_mono,orientation_epoch=excluded.orientation_epoch,metadata=excluded.metadata,payload=excluded.payload,capture_lower=excluded.capture_lower,received_at=excluded.received_at,expires_at=excluded.expires_at", meta.frame_id, meta.frame_seq, meta.lease_epoch, meta.capture_mono_ms, meta.orientation_epoch, JSON.stringify(meta), serialized, offset, now, now + 15000, ...guards, meta.frame_id, now),
        e.stmt("SELECT d.id AS device_id,d.current_session,d.worker_id,d.lease_epoch,d.worker_expires,s.state,s.capture_state,s.broadcast_id,p.created_at AS probe_created,t.frame_id AS accepted_frame FROM sb_devices d LEFT JOIN sb_sessions s ON s.id=d.current_session LEFT JOIN sb_clock_probes p ON p.id=? AND p.device_id=d.id AND p.expires_at>? LEFT JOIN sb_screen_texts t ON t.device_id=d.id WHERE " + auth + " AND d.revoked=0", probe, now, ...authValues),
      ]);
      commitTiming={pre_batch_ms:batchStarted-started,batch_roundtrip_ms:performance.now()-batchStarted};
      const row = results[2].results?.[0] as { device_id: string; current_session: string; worker_id: string; lease_epoch: number; worker_expires: number; state: string; capture_state: string; broadcast_id: string; probe_created: number | null; accepted_frame: string | null } | undefined;
      need(row, "UNAUTHENTICATED", 401);
      // A committed row still needs retention cleanup even if its response
      // later rejects an expired capture or worker lease.
      let cleanupSuperseded=false;
      if (results[1].meta.changes === 1) cleanupSuperseded=scheduleLatestExpiryCleanup(e.db,`${row.device_id}:${meta.bridge_session_id}:${meta.lease_epoch}`,
        job=>e.scheduleBackground(15_100,job),
        async()=>{await e.stmt("DELETE FROM sb_screen_texts WHERE device_id=? AND frame_id=? AND expires_at<=?",row.device_id,meta.frame_id,e.now()).run();},meta.frame_seq as number);
      need(row.current_session === meta.bridge_session_id && row.broadcast_id === meta.broadcast_id && row.state === "active", "STALE_SESSION");
      need(row.worker_id === meta.worker_id && row.lease_epoch === meta.lease_epoch && row.worker_expires > e.now(), "STALE_LEASE");
      need(row.capture_state === "active", "CAPTURE_NOT_ACTIVE"); need(row.probe_created != null, "INVALID_CLOCK_PROBE");
      const captureLower = row.probe_created + offset - 50, age = e.now() - captureLower;
      commitTiming={...commitTiming,capture_age_at_batch_issue_ms:now-captureLower,freshness_margin_at_batch_issue_ms:2000-(now-captureLower),capture_age_after_batch_ms:age};
      need(captureLower <= e.now() + 100 && rtt <= 2000 && Math.abs(Date.parse(meta.captured_at as string) - captureLower) <= 30000, "CLOCK_UNCERTAIN");
      need(age <= 2000, results[1].meta.changes === 1 ? "OCR_EXPIRED_DURING_COMMIT" : "OLD_OR_UNVERIFIED_OCR_CAPTURE");
      need(results[1].meta.changes === 1 && row.accepted_frame === meta.frame_id, "STALE_OCR_CAPTURE");
      const elapsed = performance.now() - started;
      console.info(JSON.stringify({ event: "screen_text_upload", revision: "0.10.3", frame_id: meta.frame_id, blocks: (p.blocks as unknown[]).length, bytes: new TextEncoder().encode(serialized).length, ocr_ms: p.recognition_ms, client: meta.client_timing, sampling_reason: meta.sampling_reason, handler_ms: elapsed, capture_age_ms: age,clock_rtt_ms:rtt,reported_processing_age_ms:meta.capture_age_ms,freshness_remaining_ms:Math.max(0,2000-age),cleanup_superseded:cleanupSuperseded,...commitTiming,lookups: 1 }));
      return { accepted_frame_id: meta.frame_id, received_at: new Date(now).toISOString(), frame_visible_ms: elapsed, next_upload_after_ms: 0, storage_pending: false, capture_age_ms: age, freshness_limit_ms: 2000 };
    } catch (error) {
      const code = error instanceof BridgeError ? error.code : String(error).includes("UNIQUE constraint failed: sb_observations.id") ? "FRAME_ID_REUSED" : "INTERNAL_ERROR";
      console.warn(JSON.stringify({ event: "screen_text_upload_rejected", revision: "0.10.3", frame_id: frameID ?? null, code, handler_ms: performance.now() - started,...commitTiming }));
      if (code === "FRAME_ID_REUSED") throw new BridgeError(code); throw error;
    }
  }
  async read(user: User, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const started = this.readNow(), wait = args.wait_ms == null ? 1200 : integer(args.wait_ms, 0, 1200);
    const readID=uid();let polls=0,terminalPoll=false,maxPollMS=0;
    const finish=(snapshot:{value:Record<string,unknown>;diagnostics:Record<string,unknown>})=>{
      const elapsed=this.readNow()-started;
      return {...snapshot.value,trace:{revision:"0.10.2",read_id:readID,read_ms:elapsed,wait_limit_ms:wait,poll_count:polls,terminal_poll_used:terminalPoll,poll_window_overrun_ms:Math.max(0,elapsed-wait),maximum_poll_ms:maxPollMS,last_poll:snapshot.diagnostics}};
    };
    for (;;) {
      const snapshot=await this.readOnce(user,args,readID,++polls),result=snapshot.value;
      maxPollMS=Math.max(maxPollMS,Number(snapshot.diagnostics.poll_ms));
      const remaining=wait-(this.readNow()-started);
      if(result.state!=="unavailable" || result.reason!=="NO_FRESH_SCREEN_TEXT" || remaining<=0)return finish(snapshot);
      // Spend the last partial slot on one final authenticated read instead
      // of sleeping to the deadline and returning a superseded miss.
      if(remaining<=60){if(terminalPoll)return finish(snapshot);terminalPoll=true;continue;}
      await this.readSleep(60);
      if(this.readNow()-started>=wait)return finish(snapshot);
    }
  }
  private async readOnce(user: User, args: Record<string, unknown>,readID:string,poll:number) {
    const e = this.engine, started = this.readNow(), now = e.now(), maxAge = args.max_age_ms == null ? 2000 : Math.min(2000, integer(args.max_age_ms, 100, 3000));
    const device = args.device_id == null ? null : uuid(args.device_id), expectedSession = args.bridge_session_id == null ? null : uuid(args.bridge_session_id);
    const rows = await e.stmt("WITH candidates AS (SELECT d.id AS device,d.lease_epoch,d.worker_expires,s.id AS session,s.capture_state FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id WHERE d.owner_id=? AND d.revoked=0 AND s.state='active' AND s.mode='broadcast' AND (s.capture_state='paused' OR d.worker_expires>?) AND (? IS NULL OR d.id=?) AND (? IS NULL OR s.id=?) ORDER BY (s.capture_state='active') DESC,d.created_at DESC LIMIT 2), counts AS (SELECT count(*) AS active_count FROM candidates WHERE capture_state='active') SELECT c.*,t.frame_id,t.capture_lower,t.expires_at,t.metadata,CASE WHEN n.active_count=1 AND c.capture_state='active' AND t.capture_lower>=? AND t.capture_lower<=? AND t.expires_at>? THEN t.payload ELSE NULL END AS payload FROM candidates c CROSS JOIN counts n LEFT JOIN sb_screen_texts t ON t.device_id=c.device AND t.owner_id=? AND t.session_id=c.session AND t.lease_epoch=c.lease_epoch", user.id, now, device, device, expectedSession, expectedSession, now - maxAge, now + 100, now, user.id).all<{ device: string; session: string; capture_state: string; worker_expires: number; frame_id: string | null; capture_lower: number | null; expires_at: number | null; metadata: string | null; payload: string | null }>();
    const requestID = uid();
    const finish = (value: Record<string, unknown>,details:Record<string,unknown>={}) => {
      const metadata = value.metadata && typeof value.metadata === "object" ? value.metadata as Record<string, unknown> : {};
      const diagnostics={poll_ms:this.readNow()-started,cause:value.reason??null,...details};
      console.info(JSON.stringify({ event: "screen_text_read", revision: "0.10.2", request_id: requestID,read_id:readID,poll,state: value.state, reason: value.reason ?? null,
        frame_id: metadata.frame_id ?? null, age_ms: metadata.age_ms ?? value.age_ms ?? null,handler_ms:diagnostics.poll_ms,lookups:1,diagnostics }));
      return {value,diagnostics};
    };
    const active = rows.results.filter(row => row.capture_state === "active");
    if (active.length > 1) return finish({ state: "choose_device", devices: active.map(row => ({ device_id: row.device })) });
    const row = active[0];
    if (!row) return finish(rows.results.length ? { state: "paused", reason: "CAPTURE_PAUSED" } : { state: "unavailable", reason: "START_SAYSO_BROADCAST" });
    const age = row.capture_lower == null ? null : Math.max(0, e.now() - row.capture_lower);
    const metadata=row.metadata?JSON.parse(row.metadata) as Record<string,unknown>:{};
    const timing=metadata.client_timing && typeof metadata.client_timing==="object"&&!Array.isArray(metadata.client_timing)?metadata.client_timing as Record<string,unknown>:{};
    const numeric=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0?v:null;
    const details={source_age_ms:age,source_probe_rtt_ms:numeric(metadata.clock_rtt_ms),source_reported_processing_age_ms:numeric(metadata.capture_age_ms),source_ocr_ms:numeric(timing.ocr_ms),source_queue_ms:numeric(timing.queue_ms),worker_remaining_ms:Math.max(0,row.worker_expires-e.now()),observed_frame_id:row.frame_id};
    const cause=row.worker_expires<=e.now()?"WORKER_EXPIRED":!row.frame_id||row.capture_lower==null?"NO_FRAME":row.capture_lower>e.now()+100?"CAPTURE_CLOCK_FUTURE":age!>maxAge?"CAPTURE_TOO_OLD":(row.expires_at??0)<=e.now()?"RECORD_EXPIRED":!row.payload?"PAYLOAD_NOT_SELECTED":null;
    if(cause)return finish({state:"unavailable",reason:"NO_FRESH_SCREEN_TEXT",format:row.frame_id?"ocr":undefined,age_ms:age},{...details,cause});
    return finish({ state: "available", format: "ocr", metadata: { device_id: row.device, bridge_session_id: row.session, frame_id: row.frame_id, captured_at: metadata.captured_at, age_ms: age, stale: false, freshness_limit_ms: maxAge, width: metadata.width, height: metadata.height, orientation: metadata.orientation, orientation_epoch: metadata.orientation_epoch }, ocr: JSON.parse(row.payload!) },details);
  }
}
