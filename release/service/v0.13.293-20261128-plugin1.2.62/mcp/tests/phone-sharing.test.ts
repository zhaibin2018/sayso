import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {BridgeEngine,type Device,hash} from '../lib/bridge-engine.ts';
import {otherSharingPhones,renamePhone,replacementHeartbeat,phoneSharingInstructions} from '../lib/phone-sharing.ts';
import {runMaintenance} from '../lib/retention-maintenance.ts';
import {expireOfflineSharing,offlineSharingGraceMS} from '../lib/stale-sharing.ts';
import {handleMcp} from '../lib/mcp-protocol.ts';
import {handleDeviceRequest} from '../lib/device-api.ts';
import {cancelCurrentOperation} from '../lib/operation-cancel.ts';
import {controlGuide,controlWorkflows} from '../lib/control-guide.ts';

class Statement {
  raw:DatabaseSync;sql:string;values:(string|number|null)[];
  constructor(raw:DatabaseSync,sql:string,values:(string|number|null)[]=[]){this.raw=raw;this.sql=sql;this.values=values;}
  bind(...values:(string|number|null)[]){return new Statement(this.raw,this.sql,values);}
  execute(mode:string){const q=this.raw.prepare(this.sql);if(mode==='first')return q.get(...this.values)??null;
    if(mode==='all'||q.columns().length)return {success:true,results:q.all(...this.values),meta:{}};
    return {success:true,results:[],meta:{changes:Number(q.run(...this.values).changes)}};}
  async first(){return this.execute('first');}async all(){return this.execute('all');}async run(){return this.execute('run');}
}
class DB {
  raw=new DatabaseSync(':memory:');
  constructor(){for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())this.raw.exec(readFileSync('drizzle/'+f,'utf8'));}
  prepare(sql:string){return new Statement(this.raw,sql);}
  async batch(statements:Statement[]){this.raw.exec('BEGIN IMMEDIATE');try{const r=statements.map(s=>s.execute('run'));this.raw.exec('COMMIT');return r;}catch(e){this.raw.exec('ROLLBACK');throw e;}}
}
function lab(parallel=false){
  const db=new DB(),deleted:string[]=[],keys=new Set<string>();
  let now=Date.now();
  const bucket={delete:async(keys:string|string[])=>{deleted.push(...(Array.isArray(keys)?keys:[keys]));},list:async({prefix}:{prefix:string})=>({objects:[...keys].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})};
  const engine=()=>new BridgeEngine({db:db as unknown as D1Database,bucket:bucket as unknown as R2Bucket,now:()=>now,diagnosticParallelSharing:parallel});
  async function phone(name:string,owner='owner'){
    const id=crypto.randomUUID(),token='a'.repeat(32)+id.replaceAll('-','');
    db.raw.prepare('INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,confirmed_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,owner,name,await hash(token),now+86400000,now,now);
    return {device:db.raw.prepare('SELECT * FROM sb_devices WHERE id=?').get(id) as unknown as Device,token};
  }
  return {db,deleted,keys,engine,phone,advance:(ms:number)=>{now+=ms;}};
}
function startBody(){return {mode:'broadcast',control_enabled:false,request_id:crypto.randomUUID(),broadcast_id:crypto.randomUUID()};}
async function start(e:BridgeEngine,d:Device){const body=startBody(),s=await e.createSession(d,body),worker=crypto.randomUUID();
  const lease=await e.claimWorker(d,{bridge_session_id:s.bridge_session_id,broadcast_id:body.broadcast_id,worker_id:worker,worker_kind:'broadcast'});
  return {...body,bridge_session_id:s.bridge_session_id,worker_id:worker,lease_epoch:lease.lease_epoch,capture_state:'active',usb_connected:false};}

test('D147 new broadcast atomically replaces same-owner sharing, clears frames/input and preserves other owners',async()=>{
  const l=lab(),a=await l.phone('iPhone 11'),b=await l.phone('iPhone 16 Pro'),c=await l.phone('Other owner','other');
  const one=await start(l.engine(),a.device),foreign=await start(l.engine(),c.device);
  l.db.raw.prepare('UPDATE sb_sessions SET mouse_enabled=1,input_end=?,control_epoch=7 WHERE id=?').run(Date.now()+10000,one.bridge_session_id);
  const key=`screens/owner/${a.device.id}/${one.bridge_session_id}/frame.jpg`;
  l.db.raw.prepare('INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,received_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(a.device.id,'owner',one.bridge_session_id,crypto.randomUUID(),1,one.lease_epoch,key,'digest','{}',Date.now(),Date.now()+10000);
  l.keys.add(key);
  const two=await start(l.engine(),b.device);
  const old=l.db.raw.prepare('SELECT * FROM sb_sessions WHERE id=?').get(one.bridge_session_id)!;
  assert.equal(old.state,'stopped');assert.equal(old.capture_state,'stopped');assert.equal(old.mouse_enabled,0);assert.equal(old.input_end,0);assert.ok(Number(old.control_epoch)>7);assert.equal(old.blocked,1);assert.equal(old.stop_reason,'sharing_replaced');
  const oldPhone=l.db.raw.prepare('SELECT * FROM sb_devices WHERE id=?').get(a.device.id)!;
  assert.equal(oldPhone.current_session,null);assert.equal(oldPhone.worker_expires,0);assert.ok(Number(oldPhone.lease_epoch)>one.lease_epoch);
  assert.equal(l.db.raw.prepare('SELECT count(*) n FROM sb_frames WHERE device_id=?').get(a.device.id)!.n,0);
  assert.ok(l.deleted.includes(key));assert.equal(l.db.raw.prepare('SELECT fenced FROM sb_erasure_jobs WHERE session_id=?').get(one.bridge_session_id)!.fenced,1);
  assert.equal((await l.engine().session(c.device,foreign)).state,'active');assert.equal((await l.engine().session(b.device,two)).state,'active');
  await assert.rejects(l.engine().session(a.device,one),{code:'STALE_SESSION'});
});

test('D147 preflight returns only other same-owner names/states and has no write/cancel effect',async()=>{
  const l=lab(),a=await l.phone('Old phone'),b=await l.phone('New phone'),foreign=await l.phone('Private name','foreign');
  const one=await start(l.engine(),a.device);await start(l.engine(),foreign.device);
  const before=JSON.stringify(l.db.raw.prepare('SELECT * FROM sb_sessions ORDER BY id').all());
  assert.deepEqual(await otherSharingPhones(l.engine(),b.device),{phones:[{name:'Old phone',state:'active'}]});
  assert.equal(JSON.stringify(l.db.raw.prepare('SELECT * FROM sb_sessions ORDER BY id').all()),before);
  assert.equal((await l.engine().session(a.device,one)).state,'active');
  const response=await handleDeviceRequest(new Request('https://fixture.invalid/v1/device/sharing/preflight',{headers:{authorization:'Bearer '+b.token}}),{engine:l.engine});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{phones:[{name:'Old phone',state:'active'}]});
});

test('D147 simultaneous creates from separate engines leave the last transaction sharing; retry cannot take it back',async()=>{
  const l=lab(),a=await l.phone('A'),b=await l.phone('B'),x=startBody(),y=startBody();
  const responses=await Promise.all([l.engine().createSession(a.device,x),l.engine().createSession(b.device,y)]);
  const rows=l.db.raw.prepare("SELECT * FROM sb_sessions WHERE owner_id='owner' AND state='active'").all();assert.equal(rows.length,1);
  const winner=rows[0];assert.equal(winner.id,responses[1].bridge_session_id);
  await assert.rejects(l.engine().createSession(a.device,x),{code:'SHARING_REPLACED'});
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_sessions WHERE owner_id='owner' AND state='active'").get()!.n,1);
});

test('D147 offline old phone receives replacement on heartbeat after reconnect; no session revival or uploads',async()=>{
  const l=lab(),a=await l.phone('Offline'),b=await l.phone('New'),one=await start(l.engine(),a.device);
  await start(l.engine(),b.device);
  const response=await handleDeviceRequest(new Request('https://fixture.invalid/v1/device/worker/heartbeat',{method:'POST',headers:{authorization:'Bearer '+a.token,'content-type':'application/json'},body:JSON.stringify(one)}),{engine:l.engine});
  assert.equal(response.status,200);const body=await response.json() as Record<string,unknown>;
  assert.equal(body.sharing_replaced,true);assert.equal(body.reason,'SHARING_REPLACED');assert.equal(body.directive,'all_release');assert.equal(body.local_lease_max_ms,0);
  assert.equal((await replacementHeartbeat(l.engine(),b.device,one)),null);
  await assert.rejects(l.engine().claimWorker(a.device,one),{code:'SHARING_REPLACED'});
  await assert.rejects(l.engine().createSession(a.device,{...startBody(),broadcast_id:one.broadcast_id}),{code:'SHARING_REPLACED'});
  assert.throws(()=>l.db.raw.prepare('INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,received_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(a.device.id,'owner',one.bridge_session_id,crypto.randomUUID(),2,one.lease_epoch,'late','digest','{}',Date.now(),Date.now()+1000),/ERASURE_SCOPE_CLOSED/);
});

test('D147 diagnostic parallel option is explicit; cancellation still accepts no device selector',async()=>{
  const l=lab(true),a=await l.phone('A'),b=await l.phone('B');await start(l.engine(),a.device);await start(l.engine(),b.device);
  assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_sessions WHERE state='active'").get()!.n,2);
  const result=await cancelCurrentOperation(l.engine(),{id:'owner',label:'Owner'},undefined,undefined,0);assert.ok(result);assert.equal(result.phones.length,2);assert.deepEqual(result.phones.map(p=>p.name).sort(),['A','B']);
  await l.engine().createSession(b.device,startBody());assert.equal(l.db.raw.prepare("SELECT count(*) n FROM sb_sessions WHERE state='active'").get()!.n,2);
});

test('D147 rename is device/owner bound and returned in read result and concise text without selecting a phone',async()=>{
  const l=lab(),a=await l.phone('iPhone 11'),b=await l.phone('Foreign','other');await start(l.engine(),a.device);
  assert.deepEqual(await renamePhone(l.engine(),a.device,{name:' My phone '}),{name:'My phone'});
  assert.equal(l.db.raw.prepare('SELECT name FROM sb_devices WHERE id=?').get(b.device.id)!.name,'Foreign');
  for(const name of ['', ' ', 'x'.repeat(81),'a\nb'])await assert.rejects(renamePhone(l.engine(),a.device,{name}),{status:422});
  const request=new Request('https://fixture.invalid/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'read_screen',arguments:{wait_for_new_ms:0}}})});
  const response=await handleMcp(request,{engine:l.engine,caller:()=>({id:'owner',label:'Owner'}),origin:'https://fixture.invalid',retention:false});
  const value=await response.json() as {result:{structuredContent:Record<string,unknown>;content:{type:string;text?:string}[]}};
  assert.equal(value.result.structuredContent.device_name,'My phone');assert.equal(JSON.parse(value.result.content.find(c=>c.type==='text')!.text!).device_name,'My phone');
  const rename=await handleDeviceRequest(new Request('https://fixture.invalid/v1/device/name',{method:'POST',headers:{authorization:'Bearer '+a.token,'content-type':'application/json'},body:JSON.stringify({name:'Updated'})}),{engine:l.engine});
  assert.equal(rename.status,200);assert.deepEqual(await rename.json(),{name:'Updated'});
});

test('D147 every workflow guide retains bilingual phone naming instructions',()=>{
  assert.match(phoneSharingInstructions,/手机名称/);assert.match(phoneSharingInstructions,/phone name/);
  for(const workflow of controlWorkflows)assert.ok(JSON.stringify(controlGuide(workflow)).includes(phoneSharingInstructions));
});

test('D147 production ignores a true diagnostic dependency and caller-supplied parallel flag',()=>{
  const script=`globalThis.__SAYSO_DIAGNOSTICS__=false;
    const {DB,Bucket}=await import('./tests/fixtures/retention.ts');
    const {BridgeEngine}=await import('./lib/bridge-engine.ts');
    const db=new DB(),bucket=new Bucket(),now=Date.now(),e=new BridgeEngine({db,bucket,diagnosticParallelSharing:true,now:()=>now});
    if(e.diagnosticParallelSharing)throw Error('Production parallel option enabled');
    for(const name of ['A','B']){
      const id=crypto.randomUUID();db.raw.prepare('INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,confirmed_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,'owner',name,id,now+10000,now,now);
      const device=db.raw.prepare('SELECT * FROM sb_devices WHERE id=?').get(id);
      await e.createSession(device,{mode:'broadcast',control_enabled:false,request_id:crypto.randomUUID(),broadcast_id:crypto.randomUUID(),diagnosticParallelSharing:true});
    }
    if(db.raw.prepare("SELECT count(*) n FROM sb_sessions WHERE state='active'").get().n!==1)throw Error('Concurrent production shares');`;
  const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
});

for (const [path, reason] of [['stop','USER_STOPPED'], ['state','ReplayKit'], ['stop','BROADCAST_FINISHED']]) {
  test(`T112 authenticated ${path} (${reason}) ends exactly that broadcast; late replay preserves the new share`,async()=>{
    const l=lab(), a=await l.phone('old'), b=await l.phone('new');
    const engine=l.engine(), one=await start(engine,a.device);
    const stop=(token:string, replay=false)=>handleDeviceRequest(new Request('https://fixture.invalid/v1/device/'+
      (path==='state'&&!replay ? 'state' : `sessions/${one.bridge_session_id}/stop`),{
      method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({...one,reason,capture_state:'stopped'})}),{engine:l.engine});
    assert.notEqual((await stop(b.token)).status,200);
    assert.equal((await stop(a.token)).status,200);
    assert.deepEqual((await otherSharingPhones(engine,b.device)).phones,[]);
    const newShare=await start(engine,a.device);
    assert.equal((await stop(a.token,true)).status,200);
    assert.equal((await engine.session(a.device,newShare)).state,'active');
    assert.equal(l.db.raw.prepare('SELECT count(*) n FROM sb_erasure_jobs WHERE session_id=?').get(one.bridge_session_id)!.n,1);
  });
}

test('T112 racing explicit stop and expiry create one erasure job',async()=>{
  const l=lab(), a=await l.phone('old'), b=await l.phone('new'), e=l.engine(), one=await start(e,a.device);
  l.advance(70_000);
  await Promise.all([e.stop(a.device,one.bridge_session_id),e.stop(a.device,one.bridge_session_id),otherSharingPhones(e,b.device)]);
  assert.equal(l.db.raw.prepare('SELECT count(*) n FROM sb_erasure_jobs WHERE session_id=?').get(one.bridge_session_id)!.n,1);
});

test('T112 killed extension or prolonged disconnection expires at the offline grace boundary on preflight',async()=>{
  const l=lab(), a=await l.phone('old'), b=await l.phone('new'), foreign=await l.phone('other','foreign');
  const e=l.engine(), one=await start(e,a.device), other=await start(e,foreign.device);
  l.advance(10_000+offlineSharingGraceMS-1);
  assert.deepEqual((await otherSharingPhones(e,b.device)).phones,[{name:'old',state:'active'}]);
  l.advance(1);
  const denied=await handleDeviceRequest(new Request('https://fixture.invalid/v1/device/sharing/preflight'),{engine:l.engine});
  assert.equal(denied.status,401);
  assert.equal(l.db.raw.prepare('SELECT state FROM sb_sessions WHERE id=?').get(one.bridge_session_id)!.state,'active');
  assert.deepEqual((await otherSharingPhones(e,b.device)).phones,[]);
  assert.equal(l.db.raw.prepare('SELECT stop_reason FROM sb_sessions WHERE id=?').get(one.bridge_session_id)!.stop_reason,'offline_timeout');
  assert.equal(l.db.raw.prepare('SELECT state FROM sb_sessions WHERE id=?').get(other.bridge_session_id)!.state,'active');
  const two=await start(e,b.device);
  await assert.rejects(e.claimWorker(a.device,one));
  assert.equal((await e.session(b.device,two)).state,'active');
});

test('T112 short interruption can reclaim and heartbeat before expiry, including paused capture',async()=>{
  const l=lab(), a=await l.phone('old'), b=await l.phone('new'), e=l.engine();
  const one=await start(e,a.device);
  l.advance(45_000);
  const lease=await e.claimWorker(a.device,{...one,worker_kind:'broadcast'});
  await e.heartbeat(a.device,{...one,lease_epoch:lease.lease_epoch,capture_state:'paused'});
  l.advance(30_000);
  assert.deepEqual((await otherSharingPhones(e,b.device)).phones,[{name:'old',state:'paused'}]);
});

test('T112 due maintenance respects fresh frames and repeat presentations, closes orphan without a new phone',async()=>{
  const l=lab(), a=await l.phone('old'), b=await l.phone('new'), e=l.engine(), one=await start(e,a.device);
  l.advance(90_000);
  l.db.raw.prepare('INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,received_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(a.device.id,'owner',one.bridge_session_id,crypto.randomUUID(),1,one.lease_epoch,'frame','hash','{}',e.now(),e.now()+30_000);
  assert.equal((await otherSharingPhones(e,b.device)).phones.length,1);
  l.db.raw.prepare('UPDATE sb_frames SET received_at=0,repeat_received_at=?').run(e.now());
  assert.equal((await otherSharingPhones(e,b.device)).phones.length,1);
  l.advance(offlineSharingGraceMS);
  await runMaintenance(e.db,e.bucket,'owner',e.now);
  const row=l.db.raw.prepare('SELECT state,capture_state,blocked,mouse_enabled,stop_reason FROM sb_sessions WHERE id=?').get(one.bridge_session_id)!;
  assert.deepEqual({...row},{state:'stopped',capture_state:'stopped',blocked:0,mouse_enabled:0,stop_reason:'offline_timeout'});
  assert.equal(l.db.raw.prepare('SELECT current_session FROM sb_devices WHERE id=?').get(a.device.id)!.current_session,null);
  await assert.rejects(e.claimWorker(a.device,{...one,worker_kind:'broadcast'}),{code:'STALE_SESSION'});
});

const reconnect = (e:BridgeEngine,device:Device,broadcast_id:string) =>
  e.createSession(device,{...startBody(),broadcast_id});
const activeIds = (db:DB) => db.raw.prepare("SELECT id FROM sb_sessions WHERE state='active'").all().map(row=>row.id);

test('T112 live extension reconnects after 90 seconds with a new lease and no inherited control grant',async()=>{
  const l=lab(), a=await l.phone('A'), e=l.engine(), one=await start(e,a.device);
  l.db.raw.prepare('UPDATE sb_sessions SET mouse_enabled=1,input_end=?,control_epoch=7 WHERE id=?').run(e.now()+300_000,one.bridge_session_id);
  l.advance(90_000);
  await expireOfflineSharing(e.db,e.now());
  assert.deepEqual(activeIds(l.db),[]);
  assert.deepEqual({...l.db.raw.prepare('SELECT mouse_enabled,input_end,control_epoch FROM sb_sessions WHERE id=?').get(one.bridge_session_id)},
    {mouse_enabled:0,input_end:0,control_epoch:8});
  const resumed=await reconnect(e,a.device,one.broadcast_id);
  assert.notEqual(resumed.bridge_session_id,one.bridge_session_id);
  const identity={...one,bridge_session_id:resumed.bridge_session_id,worker_kind:'broadcast'};
  const lease=await e.claimWorker(a.device,identity);
  assert.ok(lease.lease_epoch>one.lease_epoch);
  const heartbeat=await e.heartbeat(a.device,{...identity,lease_epoch:lease.lease_epoch,mouse_relay_enabled:true});
  assert.equal(heartbeat.grant_remaining_ms,0);
  assert.equal(heartbeat.directive,'all_release');
  assert.deepEqual(activeIds(l.db),[resumed.bridge_session_id]);
});

test('T112 another phone taking over during a 90-second outage permanently retires the old broadcast',async()=>{
  const l=lab(), a=await l.phone('A'), b=await l.phone('B'), e=l.engine(), one=await start(e,a.device);
  l.advance(90_000);
  assert.deepEqual((await otherSharingPhones(e,b.device)).phones,[]);
  const two=await start(e,b.device);
  await assert.rejects(reconnect(e,a.device,one.broadcast_id),{code:'SHARING_REPLACED'});
  assert.deepEqual(activeIds(l.db),[two.bridge_session_id]);
  await e.stop(b.device,two.bridge_session_id);
  await assert.rejects(reconnect(e,a.device,one.broadcast_id),{code:'SHARING_REPLACED'});
  await assert.rejects(e.claimWorker(a.device,one),{code:'SHARING_REPLACED'});
  assert.equal((await replacementHeartbeat(e,a.device,one))?.sharing_replaced,true);
});

for (const resumeFirst of [false,true]) {
  test(`T112 offline user stop receipt blocks the same broadcast (in-flight recovery committed: ${resumeFirst})`,async()=>{
    const l=lab(), a=await l.phone('A'), e=l.engine(), one=await start(e,a.device);
    l.advance(90_000);
    await expireOfflineSharing(e.db,e.now());
    if(resumeFirst) await reconnect(e,a.device,one.broadcast_id);
    const response=await handleDeviceRequest(new Request('https://fixture.invalid/v1/device/sessions/'+one.bridge_session_id+'/stop',{
      method:'POST',headers:{authorization:'Bearer '+a.token,'content-type':'application/json'},
      body:JSON.stringify({broadcast_id:one.broadcast_id,reason:'USER_STOPPED'})}),{engine:l.engine});
    assert.equal(response.status,200);
    await assert.rejects(reconnect(e,a.device,one.broadcast_id),{code:'BROADCAST_STOPPED_START_MANUALLY'});
    assert.deepEqual(activeIds(l.db),[]);
  });
}

// Pause immediately before the D1 write transaction to force both serialization orders.
for (const first of ['reconnect','timeout'] as const) {
  test(`T112 racing recovery and timeout leave one active session when ${first} commits first`,async()=>{
    const l=lab(), a=await l.phone('A'), e=l.engine(), one=await start(e,a.device);
    l.advance(90_000);
    const batch=l.db.batch.bind(l.db);
    let arrived!:()=>void,release!:()=>void;
    const waiting=new Promise<void>(resolve=>{arrived=resolve;}), gate=new Promise<void>(resolve=>{release=resolve;});
    l.db.batch=async statements=>{
      const sql=statements[0].sql;
      if(first==='timeout' ? sql.includes('INSERT INTO sb_sessions') : sql.includes('UPDATE sb_hardware SET usb_connected=0 WHERE device_id IN')) {
        arrived();await gate;
      }
      return batch(statements);
    };
    const expire=()=>expireOfflineSharing(l.engine().db,e.now());
    const recover=()=>reconnect(e,a.device,one.broadcast_id);
    const delayed=first==='timeout'?recover():expire();
    await waiting;
    const early=await (first==='timeout'?expire():recover());
    release();
    const late=await delayed;
    const resumed=first==='timeout'?late:early;
    assert.ok('bridge_session_id' in resumed);
    assert.deepEqual(activeIds(l.db),[resumed.bridge_session_id]);
    assert.equal(l.db.raw.prepare('SELECT current_session FROM sb_devices WHERE id=?').get(a.device.id)!.current_session,resumed.bridge_session_id);
  });
}

test('T112 delayed ReplayKit stopped state after timeout only blocks an exact authenticated broadcast',async()=>{
  const l=lab(), a=await l.phone('A'), b=await l.phone('B'), e=l.engine(), one=await start(e,a.device);
  l.advance(90_000);
  await expireOfflineSharing(e.db,e.now());
  const finish=(token:string,broadcast_id:string)=>handleDeviceRequest(new Request('https://fixture.invalid/v1/device/state',{
    method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({...one,broadcast_id,capture_state:'stopped'})}),{engine:l.engine});
  assert.notEqual((await finish(b.token,one.broadcast_id)).status,200);
  assert.notEqual((await finish(a.token,crypto.randomUUID())).status,200);
  assert.equal((await finish(a.token,one.broadcast_id)).status,200);
  await assert.rejects(reconnect(e,a.device,one.broadcast_id),{code:'BROADCAST_STOPPED_START_MANUALLY'});
});

test('T112 takeover after detail retention wins over a recovery that already passed the read checks',async()=>{
  const l=lab(), a=await l.phone('A'), b=await l.phone('B'), e=l.engine(), one=await start(e,a.device);
  l.advance(90_000);
  await expireOfflineSharing(e.db,e.now());
  l.advance(8*86_400_000);
  await runMaintenance(e.db,e.bucket,'owner',e.now);
  const batch=l.db.batch.bind(l.db);
  let arrived!:()=>void,release!:()=>void;
  const waiting=new Promise<void>(r=>{arrived=r;}),gate=new Promise<void>(r=>{release=r;});
  let intercept=true;
  l.db.batch=async statements=>{
    if(intercept && statements[0].sql.includes('INSERT INTO sb_sessions')){
      intercept=false;arrived();await gate;
    }
    return batch(statements);
  };
  const recovery=reconnect(e,a.device,one.broadcast_id);
  await waiting;
  const winner=await start(l.engine(),b.device);
  release();
  await assert.rejects(recovery,{code:'SHARING_REPLACED'});
  assert.deepEqual(activeIds(l.db),[winner.bridge_session_id]);
});
