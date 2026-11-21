import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installPairingGate} from '../scripts/install-pairing-gate.mjs';

// Synthetic gates only; none of these capabilities contacts Sites.
function fixture() {
  let stored:string|undefined,issued=0,writes=0;
  const gate='offline-synthetic-platform-gate';
  const hooks={assertOwnerOnly:async()=>true,readGate:async()=>stored,
    issueGate:async()=>{issued++;return gate;},
    storeGate:async(name:string,value:string)=>{assert.equal(name,'SAYSO_SITE_GATE_TOKEN');writes++;stored=value;}};
  return {gate,hooks,counts:()=>({issued,writes})};
}
test('T92 missing gate cannot issue implicitly or accept truthy consent',async()=>{
  const f=fixture();
  for(const gateIssuanceApproved of [undefined,false,'true',1,{}]) {
    await assert.rejects(installPairingGate({...f.hooks,gateIssuanceApproved}),/PAIR_INSTALL_GATE_CONSENT_REQUIRED/);
  }
  assert.deepEqual(f.counts(),{issued:0,writes:0});
});
test('T92 reuses returned platform gate and reads protected storage back without issuance',async()=>{
  const f=fixture();
  assert.deepEqual(await installPairingGate({...f.hooks,readPlatformGate:async()=>f.gate}),{configured:true,created:false});
  assert.deepEqual(f.counts(),{issued:0,writes:1});
  assert.deepEqual(await installPairingGate({...f.hooks,gateIssuanceApproved:true}),{configured:true,created:false});
  assert.deepEqual(f.counts(),{issued:0,writes:1});
});
test('T92 explicit approval permits one issuance, never rotation of a configured gate',async()=>{
  const f=fixture();
  assert.deepEqual(await installPairingGate({...f.hooks,gateIssuanceApproved:true}),{configured:true,created:true});
  assert.deepEqual(await installPairingGate(f.hooks),{configured:true,created:false});
  assert.deepEqual(f.counts(),{issued:1,writes:1});
});
test('T92 invalid or unreadable existing platform gate fails closed without issuance or upstream details',async()=>{
  const f=fixture();
  for(const readPlatformGate of [async()=> 'bad gate',async()=>{throw Error('private upstream details');}]) {
    await assert.rejects(installPairingGate({...f.hooks,readPlatformGate,gateIssuanceApproved:true}),
      error=>String(error)==='Error: PAIR_INSTALL_GATE_FAILED');
  }
  await assert.rejects(installPairingGate({...f.hooks,readPlatformGate:async()=>f.gate,readGate:async()=>undefined}),/PAIR_INSTALL_GATE_FAILED/);
  assert.equal(f.counts().issued,0);
});
