import test from "node:test";
import assert from "node:assert/strict";
import { PointClaimHints } from "../lib/command-wakeup.ts";
const scope = {
  owner: "offline",
  device: "fixture",
  session: "session",
  worker: "worker",
  lease: 1,
  control: 1,
};
test("A2 wake hints: exact scope, lost-notification race, timeout and disconnect are bounded", async () => {
  const hints = new PointClaimHints();
  let expire!: () => void;
  const wait = hints.wait(
    scope,
    0,
    () =>
      new Promise<void>((r) => {
        expire = r;
      }),
    250,
  );
  hints.record({ ...scope, control: 2 }, 1, 1000);
  hints.record(scope, 1, 1000);
  assert.equal(await wait, true);
  expire();
  assert.equal(
    await hints.wait(
      scope,
      0,
      async () => {
        throw Error("must not sleep");
      },
      250,
    ),
    true,
  );
  assert.equal(await hints.wait(scope, hints.version(scope), async () => {}, 250), false);
  await assert.rejects(
    hints.wait(
      scope,
      hints.version(scope),
      async () => {
        throw Error("offline");
      },
      250,
    ),
    /offline/,
  );
});
