import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameUploadPermits, type FrameUploadPermit } from "../lib/frame-upload-permit.ts";
import type {SourceViewProof} from "../lib/source-view-proof.ts";

// Public deterministic fixtures, never deployment secrets.
const key = "0123456789abcdef".repeat(4);
const permit: FrameUploadPermit = {
  device: "device", owner: "owner", session: "session", broadcast: "broadcast",
  worker: "worker", lease: 4, probe: "probe", probeCreated: 100, probeExpires: 2000, expires: 1000,
};

test("shared frame permit: independent instances with the same 256-bit key verify", async () => {
  const issuer = new FrameUploadPermits(key), verifier = new FrameUploadPermits(key.toUpperCase());
  const encoded = await issuer.issue("token-hash", permit);
  assert.deepEqual(await verifier.verify("token-hash", encoded, 999), permit);
  assert.equal(await verifier.verify("token-hash", encoded, 1000), null);
});

test("shared frame permit: different keys, tokens and modified payloads do not verify", async () => {
  const issuer = new FrameUploadPermits(key), verifier = new FrameUploadPermits(key);
  const encoded = await issuer.issue("token-hash", permit);
  assert.equal(await new FrameUploadPermits("fedcba9876543210".repeat(4)).verify("token-hash", encoded, 999), null);
  assert.equal(await verifier.verify("other-token-hash", encoded, 999), null);
  const [, proof] = encoded.split(".");
  const changed = Buffer.from(JSON.stringify({ ...permit, owner: "other-owner" })).toString("base64url");
  assert.equal(await verifier.verify("token-hash", changed + "." + proof, 999), null);
});

test("shared frame permit: absent or malformed configuration explicitly refuses signing", async () => {
  for (const invalid of [undefined, null, 7, {}, "", "a".repeat(63), "a".repeat(65), "g".repeat(64), " " + key, key + "\n"]) {
    const issuer = new FrameUploadPermits(invalid), verifier = new FrameUploadPermits(invalid);
    await assert.rejects(issuer.issue("token-hash",permit),/SIGNING_CONFIGURATION_INVALID/);
    await assert.rejects(verifier.issue("token-hash",permit),/SIGNING_CONFIGURATION_INVALID/);
  }
});

test("source view proof: a shared key verifies only the same owner and cannot cross the frame permit domain",async()=>{
  const proof:SourceViewProof={
    device:crypto.randomUUID(),session:crypto.randomUUID(),broadcast:crypto.randomUUID(),
    worker:crypto.randomUUID(),frame:crypto.randomUUID(),lease:1,control:2,frameSeq:3,sourceSeq:4,
    captureMono:7000,captureLower:9000,issued:10000,expires:12000,
    sha256:"a".repeat(64),geometry:[16,32,16,32,"portrait",0,0,0,16,32,"1"],
  };
  const writer=new FrameUploadPermits(key),reader=new FrameUploadPermits(key);
  const signed=(await writer.issueSourceViewProof("owner",proof))!;
  assert.ok(signed);
  assert.deepEqual(await reader.verifySourceViewProof("owner",signed,11999),proof);
  assert.equal(await reader.verifySourceViewProof("other-owner",signed,10001),null);
  assert.equal(await reader.verifySourceViewProof("owner",signed,12000),null);
  assert.equal(await reader.verify("owner",signed,10001),null);
  const permitToken=await writer.issue("owner",{...permit,expires:13000});
  assert.equal(await reader.verifySourceViewProof("owner",permitToken,10001),null);
  assert.equal(await new FrameUploadPermits().issueSourceViewProof("owner",proof),undefined);
});
