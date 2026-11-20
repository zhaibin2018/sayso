import {test} from "node:test";
import assert from "node:assert/strict";
import {advancingReadDelayMS,type AdvancingReadFrame} from "../lib/read-policy.ts";

const a:AdvancingReadFrame={scope:"owner/device/session/worker/lease/control/broadcast/orientation",frame:"a",sequence:1,source:21,captureMono:100,captureLower:1000};
const b:AdvancingReadFrame={...a,frame:"b",sequence:2,source:22,captureMono:200,captureLower:1100};
const input={ordinary:true,delay:220,requestStarted:0,attemptStarted:150,now:230,deadline:15000,previous:a,current:b};

test("read cadence policy: advancing old captures use existing150ms spacing only in the early window",()=>{
  assert.equal(advancingReadDelayMS(input),70);
  assert.equal(advancingReadDelayMS({...input,now:400,delay:50}),0,"D1 itself already spent the spacing");
  assert.equal(advancingReadDelayMS({...input,now:2000,attemptStarted:1920}),220);
  assert.equal(advancingReadDelayMS({...input,now:1950,attemptStarted:1870}),220,"Do not start a fast retry beyond the early window");
  assert.equal(advancingReadDelayMS({...input,now:1950,attemptStarted:1700}),0);
  assert.equal(advancingReadDelayMS({...input,deadline:250}),220,"A retry must start before the original deadline");
});

test("read cadence policy: unknown, quiet, repeated and changed scope preserve normal backoff",()=>{
  assert.equal(advancingReadDelayMS({...input,ordinary:false}),220,"after-command and conditional paths never opt in");
  for(const current of [undefined,a,{...b,scope:"other"},{...b,frame:a.frame},{...b,sequence:1},{...b,source:21},
    {...b,source:null},{...b,captureMono:100},{...b,captureLower:1000},{...b,captureLower:NaN}]){
    assert.equal(advancingReadDelayMS({...input,current}),220);
  }
  assert.equal(advancingReadDelayMS({...input,previous:undefined}),220);
  assert.equal(advancingReadDelayMS({...input,previous:{...a,source:null},current:{...b,source:null}}),70,"Legacy source sequence can be absent only on both real-clock samples");
});

test("read cadence policy: never expands a budget, shortens minimum spacing or hides invalid timing",()=>{
  assert.equal(advancingReadDelayMS({...input,delay:20}),20);
  for(const timing of [{now:-1},{now:149},{requestStarted:231},{now:Infinity},{deadline:230},{delay:NaN}]){
    const q={...input,...timing};assert.ok(Object.is(advancingReadDelayMS(q),q.delay));
  }
  for(let spent=0;spent<150;spent+=7.25){
    const now=150+spent,delay=advancingReadDelayMS({...input,now});assert.ok(now+delay>=300);
  }
});
