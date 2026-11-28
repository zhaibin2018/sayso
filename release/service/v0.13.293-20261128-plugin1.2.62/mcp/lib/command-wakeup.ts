export type PointClaimScope = {
  owner: string;
  device: string;
  session: string;
  worker: string;
  lease: number;
  control: number;
};
// A completed enqueue can move one existing claim query earlier in this
// process. Keep timing data only. The normal D1 claim still grants authority.
export class PointClaimHints {
  private waiters = new Map<string, Set<() => void>>();
  private revisions = new Map<string, number>();
  private marks = new Map<string, { at: number; expires: number }>();
  private key(scope: PointClaimScope) {
    return JSON.stringify([
      scope.owner,
      scope.device,
      scope.session,
      scope.worker,
      scope.lease,
      scope.control,
    ]);
  }
  record(scope: PointClaimScope, at: number, commandExpires: number) {
    const expires = Math.min(commandExpires, at + 250);
    if (expires <= at) return;
    const key = this.key(scope);
    this.marks.delete(key);
    if (this.marks.size >= 64) this.marks.delete(this.marks.keys().next().value!);
    this.marks.set(key, { at, expires });
    this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
    if (this.revisions.size > 64) this.revisions.delete(this.revisions.keys().next().value!);
    for (const wake of this.waiters.get(key) ?? []) wake();
  }
  version(scope: PointClaimScope) {
    return this.revisions.get(this.key(scope)) ?? 0;
  }
  async wait(
    scope: PointClaimScope,
    version: number,
    sleep: (ms: number) => Promise<void>,
    ms: number,
  ) {
    const key = this.key(scope);
    if (this.version(scope) !== version) return true;
    // Bounded process-local hints, never execution authority. A different
    // isolate or a lost notification falls back to the original D1 interval.
    if (this.waiters.size >= 64 && !this.waiters.has(key)) return sleep(ms).then(() => false);
    const peers = this.waiters.get(key) ?? new Set<() => void>();
    if (peers.size >= 4) return sleep(ms).then(() => false);
    this.waiters.set(key, peers);
    let wake!: () => void;
    const event = new Promise<boolean>((resolve) => {
      wake = () => resolve(true);
      peers.add(wake);
    });
    try {
      return await Promise.race([event, sleep(ms).then(() => false)]);
    } finally {
      peers.delete(wake);
      if (!peers.size) this.waiters.delete(key);
    }
  }
  hasNewCommit(scope: PointClaimScope, since: number, now: number) {
    const mark = this.marks.get(this.key(scope));
    return mark !== undefined && mark.at > since && mark.at <= now && now < mark.expires;
  }
}
export const livePointClaimHints = new PointClaimHints();
