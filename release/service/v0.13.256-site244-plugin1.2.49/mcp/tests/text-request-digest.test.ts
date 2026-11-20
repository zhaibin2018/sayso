import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { FrameUploadPermits } from "../lib/frame-upload-permit.ts";
import { opportunisticRetention } from "../lib/opportunistic-retention.ts";

test("text digest uses domain-separated keyed HMAC and binds scope and request key", async () => {
  const secret = "ab".repeat(32),
    signer = new FrameUploadPermits(secret);
  const args = ["owner", "device", "request-key", "123456"] as const;
  const digest = await signer.textRequestDigest(...args);
  assert.equal(
    digest,
    "hmac-v1:" +
      createHmac("sha256", Buffer.from(secret, "hex"))
        .update(JSON.stringify(["sayso.text-idempotency.v1", ...args]))
        .digest("hex"),
  );
  assert.equal(await new FrameUploadPermits(secret).textRequestDigest(...args), digest);
  for (let i = 0; i < args.length; i++) {
    const changed = [...args] as [string, string, string, string];
    changed[i] += "changed";
    assert.notEqual(await signer.textRequestDigest(...changed), digest);
  }
  assert.notEqual(await new FrameUploadPermits("cd".repeat(32)).textRequestDigest(...args), digest);
  await assert.rejects(
    new FrameUploadPermits().textRequestDigest(...args),
    /SIGNING_CONFIGURATION_INVALID/,
  );
});

test("opportunistic cleanup runs inline or scheduled and never prevents stop on failure", async () => {
  let calls = 0,
    job: undefined | (() => Promise<void>);
  const service = {
    scheduleBackground: () => false,
    pruneMetadata: async () => {
      calls++;
      throw Error("fixture");
    },
  };
  await opportunisticRetention(service as any);
  assert.equal(calls, 1);
  service.scheduleBackground = ((_delay: number, run: () => Promise<void>) => {
    job = run;
    return true;
  }) as any;
  await opportunisticRetention(service as any);
  assert.equal(calls, 1);
  await job!();
  assert.equal(calls, 2);
});
