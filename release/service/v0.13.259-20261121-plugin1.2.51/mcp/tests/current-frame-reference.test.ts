import {test} from "node:test";
import assert from "node:assert/strict";
import {FrameUploadPermits} from "../lib/frame-upload-permit.ts";
import type {VisualReadPointProof} from "../lib/compound-query-view-proof.ts";

const uuid="11111111-1111-4111-8111-111111111111";
const reference:VisualReadPointProof={device:uuid,session:uuid,broadcast:uuid,worker:uuid,
  frame:uuid,hardware:uuid,boot:uuid,lease:1,control:1,frameSeq:1,sourceSeq:1,
  captureMono:10000,captureLower:1000,sha256:"1".repeat(64),issued:1500,expires:16500,
  geometry:[16,32,16,32,"portrait",0,0,0,16,32,"1"],origin:"visual_read",command:"visual_read"};
test("current source signature has no 15-second action-use deadline",async()=>{
  const signer=new FrameUploadPermits("0123456789abcdef".repeat(4));
  const token=await signer.issueVisualReadPointProof("owner",reference);assert.ok(token);
  assert.ok(await signer.verifyVisualReadPointProof("owner",token,17000));
  assert.ok(await signer.verifyVisualReadPointProof("owner",token,90000000));
  assert.equal(await signer.verifyVisualReadPointProof("another-owner",token,17000),null);
  const [body,signature]=token.split(".");
  const altered=JSON.parse(Buffer.from(body,"base64url").toString());altered.device="22222222-2222-4222-8222-222222222222";
  assert.equal(await signer.verifyVisualReadPointProof("owner",Buffer.from(JSON.stringify(altered)).toString("base64url")+"."+signature,17000),null);
});
test("old source-signature domain is rejected rather than used as compatibility fallback",async()=>{
  const signer=new FrameUploadPermits("0123456789abcdef".repeat(4));
  const old=await (signer as any).issueReleasedActionView("sayso.visual-read-point.v1","owner",reference);
  assert.equal(await signer.verifyVisualReadPointProof("owner",old,2000),null);
});
