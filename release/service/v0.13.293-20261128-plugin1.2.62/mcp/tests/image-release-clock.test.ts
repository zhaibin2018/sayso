import assert from "node:assert/strict";
import {test} from "node:test";
import {imageReleaseClockSampler} from "../lib/image-release-clock.ts";

function deferredRead() {
  let complete!:()=>void,fail!:(reason:Error)=>void;
  const completion=new Promise<void>((resolve,reject)=>{complete=resolve;fail=reject;});
  return {completion,complete,fail};
}

test("a timed-out first release read can complete inside the existing recheck window",async t=>{
  t.mock.timers.enable({apis:["Date","setTimeout"],now:0});
  for(const secondRejects of [false,true]){
    const first=deferredRead(),second=deferredRead();
    let reads=0;
    const sample=imageReleaseClockSampler(()=>++reads===1?first.completion:second.completion);
    const initial=sample(false);
    t.mock.timers.tick(50);
    assert.equal(await initial,false);
    const recheck=sample(true);
    t.mock.timers.tick(15);
    if(secondRejects)second.fail(Error("test failure"));
    first.complete();
    assert.equal(await recheck,true);
    assert.equal(await sample(true),false);
    assert.equal(reads,2);
  }
});

test("an ordinary completed cache miss uses one read and a first failure can use its existing retry",async t=>{
  t.mock.timers.enable({apis:["Date","setTimeout"],now:0});
  let reads=0;
  const healthy=imageReleaseClockSampler(async()=>{reads++;return undefined;});
  assert.equal(await healthy(false),true);
  assert.equal(reads,1);
  const firstError=imageReleaseClockSampler(async()=>{if(++reads===2)throw Error("test failure");});
  assert.equal(await firstError(false),false);
  assert.equal(await firstError(true),true);
  assert.equal(reads,3);
  const unavailable=imageReleaseClockSampler(undefined);
  assert.equal(await unavailable(false),false);
  assert.equal(await unavailable(true),false);
});

test("the total release window never restarts and a replacement cannot borrow a clock read",async t=>{
  t.mock.timers.enable({apis:["Date","setTimeout"],now:0});
  const first=deferredRead(),next=deferredRead();
  let originalReads=0,replacementReads=0;
  const original=imageReleaseClockSampler(()=>++originalReads===1?first.completion:next.completion);
  const initial=original(false);
  t.mock.timers.tick(50);
  assert.equal(await initial,false);
  t.mock.timers.tick(30);
  const recheck=original(true);
  const replacement=imageReleaseClockSampler(()=>{replacementReads++;return next.completion;});
  const replacementInitial=replacement(false);
  t.mock.timers.tick(20);
  assert.equal(await recheck,false);
  t.mock.timers.tick(1);
  first.complete();
  t.mock.timers.tick(29);
  assert.equal(await replacementInitial,false);
  assert.equal(await original(true),false);
  assert.equal(originalReads,2);
  assert.equal(replacementReads,1);
});

test("a frozen pre-serialization timestamp does not shorten a normal 50ms I/O race",async t=>{
  t.mock.timers.enable({apis:["setTimeout"]});
  let now=0;
  const read=deferredRead(),sample=imageReleaseClockSampler(()=>read.completion,()=>now);
  const initial=sample(false);
  now=70; // The clock only advanced once this genuine I/O completed.
  read.complete();
  assert.equal(await initial,true);
});

test("nonfinite, reversed and beyond-window retained callbacks cannot certify release",async t=>{
  t.mock.timers.enable({apis:["setTimeout"]});
  for(const finishedAt of [NaN,Infinity,-1,101]){
    let now=0,reads=0,settled=false;
    const first=deferredRead(),second=deferredRead();
    const sample=imageReleaseClockSampler(()=>++reads===1?first.completion:second.completion,()=>now);
    const initial=sample(false);
    t.mock.timers.tick(50);
    assert.equal(await initial,false);
    const recheck=sample(true).then(result=>{settled=true;return result;});
    now=finishedAt;
    first.complete();
    for(let tick=0;tick<10;tick++)await Promise.resolve();
    assert.equal(settled,false);
    t.mock.timers.tick(50);
    assert.equal(await recheck,false);
  }
});
