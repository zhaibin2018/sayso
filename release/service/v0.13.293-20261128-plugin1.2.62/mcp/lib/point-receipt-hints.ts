import type { Command } from "./mouse-control.ts";
export type ClaimedReceipt = { move: Command; click: Command; broadcast: string; expires: number };
// An authenticated grant supplies the immutable rows for a short same-
// process receipt fast path. It never substitutes for the live write fence.
export class PointReceiptHints {
  private claims = new Map<string, ClaimedReceipt>();
  private key(tokenHash: string, command: string) {
    return JSON.stringify([tokenHash, command]);
  }
  record(
    tokenHash: string,
    move: Command,
    click: Command,
    broadcast: string,
    now: number,
    tokenExpires: number,
  ) {
    const expires = Math.min(move.expires_at, click.expires_at, tokenExpires, now + 2000);
    if (
      expires <= now ||
      move.state !== "executing" ||
      click.state !== "executing" ||
      move.result_digest ||
      click.result_digest
    )
      return;
    const key = this.key(tokenHash, move.id);
    this.claims.delete(key);
    if (this.claims.size >= 64) this.claims.delete(this.claims.keys().next().value!);
    this.claims.set(key, { move: { ...move }, click: { ...click }, broadcast, expires });
  }
  take(tokenHash: string, command: string, now: number) {
    const key = this.key(tokenHash, command),
      claim = this.claims.get(key);
    this.claims.delete(key);
    return claim && claim.expires > now ? claim : undefined;
  }
}
export const livePointReceiptHints = new PointReceiptHints();
