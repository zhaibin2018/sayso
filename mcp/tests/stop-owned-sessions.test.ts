import test from "node:test";
import assert from "node:assert/strict";
import { stopOwnedSessions } from "../lib/stop-owned-sessions.ts";
import type { BridgeEngine } from "../lib/bridge-engine.ts";
test("a slow session cleanup does not delay starting stop on another phone", async () => {
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    second = new Promise<void>((r) => {
      started = r;
    });
  const service = {
    stmt: () => ({
      all: async () => ({ results: [{ target_session_id: "a" }, { target_session_id: "b" }] }),
    }),
    stop: async (_device: unknown, id: string) => {
      if (id === "a") await gate;
      else started();
    },
  } as unknown as BridgeEngine;
  const task = stopOwnedSessions(service, { id: "owner", label: "owner" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      second,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("second stop blocked behind cleanup")), 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    release();
  }
  const result = await task;
  assert.equal(result.stopped, true);
  assert.deepEqual(new Set(result.stopped_sessions), new Set(["a", "b"]));
  assert.equal(result.system_broadcast_stop_confirmed, false);
});
