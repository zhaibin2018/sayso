// Advisory scheduling only: no payload, permission or capture-time cache.
// Each work callback must still check its exact record ID and expiration in DB.
// Only for latest-row storage where replacement already removes old content;
// never use this to suppress retention jobs for an append-only evidence ledger.
type Ticket = { revision: number; state: "scheduled" | "superseded" | "running" | "done" };
const pending = new WeakMap<object, Map<string, Ticket>>();
const maximumTrackedKeys = 256;

/** Revision must be DB-enforced and strictly ordered within key (for OCR:
 * device/session/lease key, frame_seq revision). Never use response arrival.
 * Returns true when obsolete scheduled work is suppressed. Separate isolates
 * may do extra exact-ID deletes, just as before; they cannot delete a new row. */
export function scheduleLatestExpiryCleanup(
  scope: object, key: string,
  schedule: (job: () => Promise<void>) => boolean,
  work: () => Promise<void>,
  revision: number,
): boolean {
  if (!Number.isSafeInteger(revision) || revision < 0) throw Error("INVALID_CLEANUP_REVISION");
  let entries = pending.get(scope);
  if (!entries) { entries = new Map(); pending.set(scope, entries); }
  const current = entries, ticket: Ticket = { revision, state: "scheduled" };
  const existing = current.get(key);
  if (existing && existing.revision >= revision && ["scheduled", "running"].includes(existing.state)) return true;
  // Do not invalidate older work if scheduling is unavailable or throws.
  const registered = schedule(async () => {
    if (ticket.state !== "scheduled") return;
    ticket.state = "running";
    try { await work(); }
    finally {
      ticket.state = "done";
      if (current.get(key) === ticket) current.delete(key);
    }
  });
  if (!registered) { ticket.state = "done"; return false; }
  const previous = current.get(key);
  // Also defend against a scheduler that registers newer work reentrantly.
  if (previous && previous.revision >= revision && ["scheduled", "running"].includes(previous.state)) { ticket.state = "superseded"; return true; }
  const superseded = previous?.state === "scheduled";
  if (superseded) previous.state = "superseded";
  current.delete(key); current.set(key, ticket);
  // Eviction does NOT cancel the evicted key's task: its final row still needs
  // cleanup. Losing this hint may cost an extra guarded delete, never retention.
  if (current.size > maximumTrackedKeys) current.delete(current.keys().next().value!);
  return superseded;
}
