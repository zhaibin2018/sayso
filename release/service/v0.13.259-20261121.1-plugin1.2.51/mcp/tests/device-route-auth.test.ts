import {test} from "node:test";
import assert from "node:assert/strict";
import {handleDeviceRequest} from "../lib/device-api.ts";
import type {BridgeEngine} from "../lib/bridge-engine.ts";

test("authenticated malformed unpair input cannot mutate the device",async()=>{
  let revoked=0;
  const service={authenticate:async()=>({id:"device",owner_id:"owner"}),revoke:async()=>{revoked++;return {};}} as unknown as BridgeEngine;
  const response=await handleDeviceRequest(new Request("https://fixture.invalid/v1/device/unpair",{method:"POST",body:"malformed"}),{engine:()=>service});
  assert.ok(response.status>=400);assert.equal(revoked,0);
});

test("authenticated heartbeat and session stop schedule retention after the operation",async()=>{
  for(const path of ["worker/heartbeat","sessions/00000000-0000-4000-8000-000000000001/stop"]) {
    const events:string[]=[];
    const service={
      authenticate:async()=>({id:"device",owner_id:"owner"}),
      session:async()=>({mode:"broadcast"}),
      heartbeat:async()=>{events.push("heartbeat");return {};},
      stop:async()=>{events.push("stop");return {};},
      scheduleBackground:()=>false,
      pruneMetadata:async()=>{events.push("retention");throw Error("offline database failure");},
    } as unknown as BridgeEngine;
    const response=await handleDeviceRequest(new Request("https://fixture.invalid/v1/device/"+path,{method:"POST",body:"{}"}),{engine:()=>service});
    assert.equal(response.status,200);
    assert.deepEqual(events,[path.startsWith("worker")?"heartbeat":"stop","retention"]);
  }
});
