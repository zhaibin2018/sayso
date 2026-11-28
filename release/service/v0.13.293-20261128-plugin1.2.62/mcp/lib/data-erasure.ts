import { erasureTables, erasurePredicate, type ErasureJob, type ErasureScope } from "./erasure-catalog.ts";

const limit = 100;
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const pendingScope = (job: ErasureJob) => job.scope === "site" ? { sql: "1", values: [] } : {
  sql: `owner_id=? AND device_id=?${job.scope === "sharing" ? " AND session_id=?" : ""}`,
  values: [job.owner_id, job.device_id, ...(job.scope === "sharing" ? [job.session_id] : [])],
};
type ErasureRequest = { id: string; scope: ErasureScope; owner?: string; device?: string; session?: string };
export function validateErasureRequest(input: ErasureRequest) {
  if (!uuid(input.id) || !["sharing", "device", "site"].includes(input.scope) ||
      (input.scope === "site" ? input.owner !== undefined || input.device !== undefined || input.session !== undefined :
        typeof input.owner !== "string" || !input.owner.length || input.owner.length > 256 || !uuid(input.device) ||
        (input.scope === "sharing" ? !uuid(input.session) : input.session !== undefined))) throw Error("INVALID_ERASURE_REQUEST");
}

export class DataErasure {
  db: D1Database; bucket: R2Bucket; now: () => number;
  constructor(db: D1Database, bucket: R2Bucket, now = Date.now) { this.db = db; this.bucket = bucket; this.now = now; }
  private stmt(sql: string, ...values: unknown[]) { return this.db.prepare(sql).bind(...values); }
  async status(id: string) {
    if (!uuid(id)) throw Error("INVALID_ERASURE_REQUEST");
    const job = await this.stmt("SELECT * FROM sb_erasure_jobs WHERE id=?", id).first<ErasureJob & { r2_cursor: string | null }>();
    if (!job) throw Error("ERASURE_JOB_NOT_FOUND");
    return job;
  }
  async request(input: ErasureRequest) {
    validateErasureRequest(input);
    const values = [input.id, input.scope, input.owner ?? null, input.device ?? null, input.session ?? null];
    const existing = await this.stmt("SELECT id FROM sb_erasure_jobs WHERE id=?", input.id).first();
    if (!existing && input.scope !== "site") {
      const owned = await this.stmt(`SELECT id FROM ${input.scope === "sharing" ? "sb_sessions WHERE id=? AND device_id=? AND owner_id=?" : "sb_devices WHERE id=? AND owner_id=?"}`,
        ...(input.scope === "sharing" ? [input.session, input.device, input.owner] : [input.device, input.owner])).first();
      if (!owned) throw Error("ERASURE_TARGET_NOT_FOUND");
    }
    await this.stmt(`INSERT INTO sb_erasure_jobs(id,scope,owner_id,device_id,session_id,state,requested_at,updated_at)
      VALUES(?,?,?,?,?,'requested',?,?) ON CONFLICT(id) DO NOTHING`, ...values, this.now(), this.now()).run();
    const job = await this.status(input.id);
    if ([job.id, job.scope, job.owner_id, job.device_id, job.session_id].some((value, i) => value !== values[i])) throw Error("ERASURE_IDEMPOTENCY_CONFLICT");
    return job;
  }
  /** One bounded page per call. Lease CAS protects checkpoints across isolates. */
  async advance(id: string) {
    await this.status(id);
    const token = crypto.randomUUID(), now = this.now();
    const locked = await this.stmt(`UPDATE sb_erasure_jobs SET state='processing',lock_token=?,lock_until=?,updated_at=?,error=NULL
      WHERE id=? AND state<>'complete' AND (lock_token IS NULL OR lock_until<=?) RETURNING *`, token, now + 60000, now, id, now)
      .first<ErasureJob & { r2_cursor: string | null }>();
    if (!locked) return this.status(id);
    const patch = async (sql: string, ...values: unknown[]) => this.stmt(`UPDATE sb_erasure_jobs SET ${sql},updated_at=?,lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=?`,
      ...values, this.now(), id, token).run();
    try {
      const job = locked;
      if (job.phase < erasureTables.length) {
        const table = erasureTables[job.phase], predicate = erasurePredicate(table, job);
        const rows = await this.db.batch([
          this.stmt(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${predicate.sql} LIMIT ${limit})
            AND EXISTS(SELECT 1 FROM sb_erasure_jobs WHERE id=? AND lock_token=?)`, ...predicate.values, id, token),
          this.stmt(`UPDATE sb_erasure_jobs SET deleted_rows=deleted_rows+changes(),
            phase=phase+CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE ${predicate.sql}) THEN 0 ELSE 1 END,
            state='partial',updated_at=?,lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=?`, ...predicate.values, this.now(), id, token),
        ]);
        void rows;
      } else if (job.phase < erasureTables.length + 2) {
        const kind = job.phase === erasureTables.length ? "screens" : "browse";
        const prefix = kind + "/" + (job.scope === "site" ? "" : `${job.owner_id}/${job.device_id}/` +
          (job.scope === "sharing" && kind === "screens" ? `${job.session_id}/` : ""));
        const page = await this.bucket.list({ prefix, limit, ...(job.r2_cursor ? { cursor: job.r2_cursor } : {}) });
        const keys: string[] = [];
        for (const object of page.objects) {
          if (!object.key.startsWith(prefix)) throw Error("ERASURE_PREFIX_MISMATCH");
          if (job.scope === "sharing" && kind === "browse") {
            const runID = object.key.split("/").at(-2);
            const run = await this.stmt("SELECT session_id FROM sb_browse_runs WHERE id=? AND owner_id=? AND device_id=?", runID, job.owner_id, job.device_id).first<{ session_id: string }>();
            if (!run) throw Error("UNATTRIBUTABLE_BROWSE_OBJECT");
            if (run.session_id !== job.session_id) continue;
          }
          keys.push(object.key);
        }
        if (keys.length) await this.bucket.delete(keys);
        if (page.truncated && !page.cursor) throw Error("ERASURE_CURSOR_MISSING");
        // A crash after delete but before checkpoint safely repeats this page.
        await patch("state='partial',deleted_objects=deleted_objects+?,r2_cursor=?,phase=phase+?", keys.length, page.truncated ? page.cursor : null, page.truncated ? 0 : 1);
      } else {
        const pending = pendingScope(job);
        const writes = await this.stmt(`SELECT id,image_key FROM sb_storage_writes WHERE is_gc<>2 AND (${pending.sql}) LIMIT ${limit}`, ...pending.values).all<{ id: string; image_key: string }>();
        if (writes.results.length) {
          // Delete currently visible intent keys, but never retire an unresolved writer by age.
          await this.bucket.delete(writes.results.map(row => row.image_key));
          await patch("state='partial',error='IN_FLIGHT_STORAGE_WRITES',phase=?,r2_cursor=NULL", erasureTables.length);
        } else {
          if(job.scope!=="site") {
            const orphan=await this.stmt(`SELECT 1 FROM sb_browse_leases WHERE NOT EXISTS(SELECT 1 FROM sb_browse_runs r WHERE r.id=run_id)
              UNION ALL SELECT 1 FROM sb_browse_journal WHERE NOT EXISTS(SELECT 1 FROM sb_browse_runs r WHERE r.id=run_id) LIMIT 1`).first();
            if(orphan)throw Error("UNATTRIBUTABLE_D1_CHILDREN");
          }
          // Verify every table again; do not trust a historical checkpoint alone.
          const checks = await this.db.batch(erasureTables.map(table => {
            const p = erasurePredicate(table, job);
            return this.stmt(`SELECT 1 FROM ${table} WHERE ${p.sql} LIMIT 1`, ...p.values);
          }));
          const dirty = checks.findIndex(row => row.results.length > 0);
          if (dirty >= 0) await patch("state='partial',phase=?,r2_cursor=NULL", dirty);
          else if (job.r2_verified_at === null) {
            // A separate full second pass also covers writes that settled during the first scan.
            await patch("state='partial',phase=?,r2_cursor=NULL,r2_verified_at=?", erasureTables.length, this.now());
          } else {
            await this.stmt(`DELETE FROM sb_storage_writes WHERE is_gc=2 AND (${pending.sql})`,...pending.values).run();
            await patch("state='complete',error=NULL");
          }
        }
      }
    } catch(error) {
      // Error text can contain provider details: persist a fixed code only.
      const code=error instanceof Error&&["UNATTRIBUTABLE_D1_CHILDREN","UNATTRIBUTABLE_BROWSE_OBJECT"].includes(error.message)?error.message:"ERASURE_PAGE_FAILED";
      await patch("state='failed',error=?",code);
    }
    return this.status(id);
  }
}
