import {test} from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {FrameUploadPermits} from "../lib/frame-upload-permit.ts";
import {makePointReceiptProof,pointReceiptProofJSON,pointReceiptProofMaximum} from "../lib/point-receipt-proof.ts";

// Public test key only; production uses the existing private Site binding.
const key="0123456789abcdef".repeat(4),token="fixture-token-hash";
const id=(n:number)=>`${String(n).padStart(8,"0")}-1111-4111-8111-111111111111`;
function pair(){
  const shared={owner_id:"fixture-owner",device_id:id(3),session_id:id(4),hardware_id:id(5),board_boot_id:id(6),worker_id:id(7),
    lease_epoch:2,control_epoch:1,created_at:100,expires_at:5000,state:"executing",receipt:null,result_digest:null,error:null,phone_ack_mono_ms:null,input_attempted:null};
  return {move:{...shared,id:id(1),kind:"pointer.move_absolute",payload:'{"x":1,"y":2}',digest:"a".repeat(64),predecessor_id:null,
      precondition:JSON.stringify({point:{protocol:"paired_mouse_point.v1",click_command_id:id(2)}})},
    click:{...shared,id:id(2),kind:"pointer.click",payload:'{"button":"left"}',digest:"b".repeat(64),predecessor_id:id(1),precondition:'{"source_x":1}'}};
}

test("point receipt proof: canonical immutable rows cross instances and never extend2s",async()=>{
  const {move,click}=pair(),a=new FrameUploadPermits(key),b=new FrameUploadPermits(key);
  const proof=await a.issuePointReceiptProof(token,move,click,id(8),1000,10000);assert.ok(proof&&proof.length<=pointReceiptProofMaximum);
  const reversed=(v:object)=>Object.fromEntries(Object.entries(v).reverse());
  assert.equal(await a.issuePointReceiptProof(token,{...reversed(move),private_extra:"DO_NOT_INCLUDE"},reversed(click),id(8),1000,10000),proof);
  assert.equal(Buffer.from(proof.split('.')[0],"base64url").toString().includes("DO_NOT_INCLUDE"),false);
  const verified=await b.verifyPointReceiptProof(token,move.id,proof,2999);assert.ok(verified);
  assert.deepEqual(verified.move,move);assert.deepEqual(verified.click,click);assert.equal(verified.expires,3000);
  assert.equal(await b.verifyPointReceiptProof(token,move.id,proof,999),null);
  assert.equal(await b.verifyPointReceiptProof(token,move.id,proof,3000),null);
  const short=await a.issuePointReceiptProof(token,move,click,id(8),1000,1200);assert.ok(short);
  assert.equal(await b.verifyPointReceiptProof(token,move.id,short,1200),null);
});

test("point receipt proof: token, URL id, signing key, payload and canonical encoding are bound",async()=>{
  const {move,click}=pair(),a=new FrameUploadPermits(key),proof=(await a.issuePointReceiptProof(token,move,click,id(8),1000,10000))!;
  assert.equal(await a.verifyPointReceiptProof("other-token",move.id,proof,1001),null);
  assert.equal(await a.verifyPointReceiptProof(token,click.id,proof,1001),null);
  assert.equal(await new FrameUploadPermits("fedcba9876543210".repeat(4)).verifyPointReceiptProof(token,move.id,proof,1001),null);
  const [payload,signature]=proof.split('.');
  assert.equal(await a.verifyPointReceiptProof(token,move.id,payload+'.'+(signature[0]==='A'?'B':'A')+signature.slice(1),1001),null);
  assert.equal(await a.verifyPointReceiptProof(token,move.id,proof+'=',1001),null);
  assert.equal(await a.verifyPointReceiptProof(token,move.id,"a".repeat(8193),1001),null);
  const raw=JSON.parse(Buffer.from(payload,"base64url").toString());raw.move.payload='{"x":9,"y":2}';
  assert.equal(await a.verifyPointReceiptProof(token,move.id,Buffer.from(JSON.stringify(raw)).toString("base64url")+'.'+signature,1001),null);
  assert.equal(await a.verify(token,proof,1001),null,"A receipt proof cannot be used as an upload permit");
});

test("point receipt proof: malformed signed context and noncanonical JSON remain fallback-only",async()=>{
  const {move,click}=pair(),a=new FrameUploadPermits(key),env=makePointReceiptProof(move,click,id(8),1000,10000)!;
  const sign=(json:string)=>{const payload=Buffer.from(json).toString("base64url");return payload+'.'+createHmac("sha256",Buffer.from(key,"hex")).update(JSON.stringify(["sayso.point-receipt-preparation.v1",token,move.id,payload])).digest("base64url");};
  for(const modify of [
    (x:typeof env)=>{x.expires=3001;},(x:typeof env)=>{x.click.board_boot_id=id(9);},
    (x:typeof env)=>{x.click.predecessor_id=id(9);},(x:typeof env)=>{x.move.kind="keyboard.open_search";},
    (x:typeof env)=>{x.move.precondition='{}';},(x:typeof env)=>{x.click.payload='{"button":"right"}';},
  ]){const value=structuredClone(env);modify(value);assert.equal(await a.verifyPointReceiptProof(token,move.id,sign(pointReceiptProofJSON(value)),1001),null);}
  assert.equal(await a.verifyPointReceiptProof(token,move.id,sign(JSON.stringify(env,null,2)),1001),null);
});

test("point receipt proof: no stable key or nonfresh pair adds no claim field",async()=>{
  const {move,click}=pair();
  for(const invalid of [undefined,"bad-key"]){const codec=new FrameUploadPermits(invalid);assert.equal(await codec.issuePointReceiptProof(token,move,click,id(8),1000,10000),undefined);}
  const codec=new FrameUploadPermits(key);
  for(const patch of [{state:"queued"},{result_digest:"known"},{receipt:"{}"},{input_attempted:0}])assert.equal(await codec.issuePointReceiptProof(token,{...move,...patch},click,id(8),1000,10000),undefined);
  assert.equal(await codec.issuePointReceiptProof(token,move,click,id(8),5000,10000),undefined);
});
