import {test} from "node:test";
import assert from "node:assert/strict";
import {handleDeviceRequest} from "../lib/device-api.ts";
import {BridgeError, type BridgeEngine} from "../lib/bridge-engine.ts";

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
    const response=await handleDeviceRequest(new Request("https://fixture.invalid/v1/device/"+path,{method:"POST",headers:{Authorization:"Bearer "+"x".repeat(43)},body:"{}"}),{engine:()=>service});
    assert.equal(response.status,200);
    assert.deepEqual(events,[path.startsWith("worker")?"heartbeat":"stop","retention"]);
  }
});

test("fresh authenticated status adds service time only to the requesting client",async()=>{
  for(const session of [null,{bridge_session_id:"current"}]) {
    const legacy={device_id:"fixture",session};
    let clockReads=0;
    const service={
      authenticate:async(request:Request)=>{
        if(request.headers.get("Authorization")!=="Bearer fixture")throw new BridgeError("UNAUTHORIZED",401);
        return {id:"fixture"};
      },
      status:async()=>legacy, now:()=>{clockReads++;return 1795737600001;},
    } as unknown as BridgeEngine;
    for(const [fresh,authenticated] of [[false,true],[true,true],[true,false]]) {
      const headers=new Headers();
      if(fresh)headers.set("Cache-Control","no-store");
      if(authenticated)headers.set("Authorization","Bearer fixture");
      const response=await handleDeviceRequest(new Request("https://fixture.invalid/v1/device/status",{headers}),{engine:()=>service});
      assert.equal(response.status,authenticated?200:401);
      const body=await response.json() as Record<string,unknown>;
      if(authenticated)assert.deepEqual(body,fresh?{...legacy,server_time_ms:1795737600001}:legacy);
      else assert.equal(body.server_time_ms,undefined);
    }
    assert.equal(clockReads,1);
  }
});
