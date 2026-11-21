import { closedWriteSQL } from "./erasure-catalog.ts";

export function erasureSafeSchedule(schedule?: (delay: number, job: () => Promise<void>) => void) {
  return schedule ? (delay: number, job: () => Promise<void>) => schedule(delay,async()=>{
    try { await job(); } catch(error) {
      // A revoked upload's late diagnostic write is intentionally refused.
      if(!(error instanceof Error && error.message.includes("ERASURE_SCOPE_CLOSED")))throw error;
    }
  }) : undefined;
}

/** Register BEFORE R2 I/O. An interrupted writer stays visible until reconciled;
 * elapsed time alone is never evidence that an outstanding write has finished. */
export function erasureAwareBucket(db: D1Database, bucket: R2Bucket, now: () => number): R2Bucket {
  return new Proxy(bucket, { get(target, property) {
    if (property !== "put") {
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
    return async (key: string, ...args: unknown[]) => {
      const parts = key.split("/");
      if (!["screens", "browse"].includes(parts[0])) throw Error("UNKNOWN_PRIVATE_STORAGE_PREFIX");
      const prefix=parts[0], owner=parts.slice(1,-3).join("/"), device=parts.at(-3), scope=parts.at(-2);
      if (!owner || !device || !scope || !parts.at(-1)) throw Error("INVALID_PRIVATE_STORAGE_KEY");
      const run = prefix === "browse" ? await db.prepare("SELECT session_id FROM sb_browse_runs WHERE id=? AND owner_id=? AND device_id=?")
        .bind(scope, owner, device).first<{ session_id: string }>() : null;
      const session = prefix === "screens" ? scope : run?.session_id;
      if (!session) throw Error("ERASURE_PARENT_MISSING");
      const id = crypto.randomUUID();
      await db.prepare("INSERT INTO sb_storage_writes(id,owner_id,device_id,session_id,image_key,started_at) VALUES(?,?,?,?,?,?)")
        .bind(id, owner, device, session, key, now()).run();
      let settled = false;
      try {
        const result = await (target.put as (...values: unknown[]) => Promise<unknown>).call(target, key, ...args);
        const closed = await db.prepare(`SELECT ${closedWriteSQL} AS closed`).bind(owner, device, session).first<{ closed: number }>();
        if (closed?.closed) { await target.delete(key); settled = true; throw Error("ERASURE_SCOPE_CLOSED"); }
        settled = true;
        return result;
      } catch (error) {
        // A rejected PUT may still have committed. Keep the intent on failed cleanup.
        if (!settled) { await target.delete(key); settled = true; }
        throw error;
      } finally {
        if (settled) await db.prepare("DELETE FROM sb_storage_writes WHERE id=?").bind(id).run();
      }
    };
  } }) as R2Bucket;
}
