import {test} from "node:test";
import assert from "node:assert/strict";
import {boundedBody} from "../lib/bounded-body.ts";

test("bounded body: exact byte cap and default reader behavior are preserved",async()=>{
  const make=(body:string)=>new Request("https://test.example/",{method:"POST",body});
  assert.equal(new TextDecoder().decode(await boundedBody(make("abcd"),4)),"abcd");
  await assert.rejects(boundedBody(make("abcde"),4),/BODY_TOO_LARGE/);
  assert.equal((await boundedBody(new Request("https://test.example/"),4)).length,0);
});
test("bounded body: a stalled metadata stream is cancelled by its own deadline",async()=>{
  let cancelled=false;const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode("{"));},cancel(){cancelled=true;}});
  const request=new Request("https://test.example/",{method:"POST",body,duplex:"half"} as RequestInit);
  await assert.rejects(boundedBody(request,16384,15),/METADATA_TIMEOUT/);assert.equal(cancelled,true);
});
test("bounded body: a slow cancellation cannot hold an oversized body open",async()=>{
  const body=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(5));},cancel(){return new Promise(()=>{});}});
  const request=new Request("https://test.example/",{method:"POST",body,duplex:"half"} as RequestInit);
  await assert.rejects(boundedBody(request,4,100),/BODY_TOO_LARGE/);
});
