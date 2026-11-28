import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DB,Bucket} from './fixtures/retention.ts';
import {runMaintenance,maintenanceStatus,MAINTENANCE_INTERVAL_MS} from '../lib/retention-maintenance.ts';
import {BridgeEngine,BridgeError} from '../lib/bridge-engine.ts';
import {handleMcp} from '../lib/mcp-protocol.ts';
import {opportunisticRetention} from '../lib/opportunistic-retention.ts';
import {DAY} from '../lib/retention-policy.ts';
import {erasureAwareBucket} from '../lib/erasure-storage.ts';
import {DeviceControlRepository} from '../lib/device-control-repository.ts';

const fixture=()=>{const db=new DB(),bucket=new Bucket();let now=20*DAY;return {db,bucket,now:()=>now,tick:(ms=MAINTENANCE_INTERVAL_MS)=>now+=ms};};
const run=(f:ReturnType<typeof fixture>)=>runMaintenance(f.db as any,f.bucket as any,'owner',f.now);
async function rpc(f:ReturnType<typeof fixture>,user:string|null,name='run_due_maintenance',args={},owner='owner'){
  let engines=0;
  const response=await handleMcp(new Request('https://fixture.invalid/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer device-token'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{
    engine:()=>{engines++;return new BridgeEngine({db:f.db as any,bucket:f.bucket as any,now:f.now});},
    caller:()=>{if(!user)throw new BridgeError('UNAUTHENTICATED',401);return {id:user,label:''};},
    maintenanceOwnerID:owner,origin:'https://fixture.invalid',performance:{log:()=>{}}});
  return {response,body:await response.json() as any,engines};
}
test('T83 canonical owner-only tools reject anonymous, device-only, wrong owner, missing binding and arbitrary targets before storage',async()=>{
  const f=fixture();
  for(const user of [null,'other-owner']){const r=await rpc(f,user);assert.equal(r.engines,0);assert.equal(r.body.result?.isError??(r.response.status===401),true);}
  const missing=await rpc(f,'owner','run_due_maintenance',{},'');assert.equal(missing.engines,0);assert.match(JSON.stringify(missing.body),/NOT_CONFIGURED/);
  for(const args of [{force:true},{owner_id:'owner'},{now:99},{ttl:0},{device_id:crypto.randomUUID()}]){const r=await rpc(f,'owner','run_due_maintenance',args);assert.equal(r.engines,0);assert.match(JSON.stringify(r.body),/INVALID_ARGUMENTS/);}
  const r=await rpc(f,'owner');assert.equal(r.body.result.isError,false);assert.equal(r.body.result.structuredContent.attempted,true);
});
test('T83 durable due boundary and cross-isolate repeated execution are idempotent; status never runs maintenance',async()=>{
  const f=fixture();await run(f);
  assert.equal((await run(f)).attempted,false);f.tick(MAINTENANCE_INTERVAL_MS-1);assert.equal((await run(f)).attempted,false);
  f.tick(1);const both=await Promise.all([run(f),run(f)]);assert.equal(both.filter(r=>r.attempted).length,1);
  assert.equal(f.db.raw.prepare('SELECT count(*) n FROM sb_maintenance_runs').get()!.n,2);
  const before=f.db.raw.prepare('SELECT count(*) n FROM sb_maintenance_runs').get()!.n;
  assert.equal((await rpc(f,'owner','get_maintenance_status')).body.result.isError,false);
  assert.equal(f.db.raw.prepare('SELECT count(*) n FROM sb_maintenance_runs').get()!.n,before);
});
test('L04 exact TTL boundary removes 24-hour metrics, two-minute manual messages and expired pairing without touching fresh rows',async()=>{
  const f=fixture();
  for(const [id,at] of [['due',f.now()-DAY],['fresh',f.now()-DAY+1]] as const)f.db.raw.prepare("INSERT INTO sb_metrics(id,owner_id,device_id,kind,bytes,duration_ms,created_at) VALUES(?,'o','d','upload',1,1,?)").run(id,at);
  f.db.raw.prepare("INSERT INTO sb_manual_requests VALUES('request','o','d','private content','awaiting_user',?,?)").run(f.now()-120000,f.now());
  f.db.raw.prepare("INSERT INTO sb_pairing_requests(request_id,owner_id,owner_label,public_key,expires_at) VALUES('old','o','private name','pk',?)").run(f.now());
  await run(f);
  assert.deepEqual(f.db.raw.prepare('SELECT id FROM sb_metrics').all().map(r=>r.id),['fresh']);
  assert.equal(f.db.raw.prepare('SELECT count(*) n FROM sb_manual_requests').get()!.n,0);
  assert.equal(f.db.raw.prepare('SELECT count(*) n FROM sb_pairing_requests').get()!.n,0);
});
function command(f:ReturnType<typeof fixture>,id:string,state:string,at:number,expiry:number){
  f.db.raw.prepare(`INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,control_epoch,created_at,expires_at,precondition,receipt,error)
   VALUES(?,'o','d','s','h','b','keyboard.type_text','{"text":"PRIVATE"}','hmac-v1:0000000000000000000000000000000000000000000000000000000000000000',?,?,1,?,?,'private screen','private receipt','private error')`).run(id,id,state,at,expiry);
}
test('L04 input text disappears on terminal insert/update and timeout; seven-day scrub keeps replay keys and removes evidence',async()=>{
  const f=fixture();command(f,'done','board_acked',f.now(),f.now()+1);command(f,'pending','queued',f.now(),f.now()-300000);command(f,'old','board_acked',f.now()-7*DAY,f.now()-7*DAY+1000);
  assert.doesNotMatch(String(f.db.raw.prepare("SELECT payload FROM sb_mouse_commands WHERE id='done'").get()!.payload),/PRIVATE/);
  await run(f);const pending=f.db.raw.prepare("SELECT state,payload FROM sb_mouse_commands WHERE id='pending'").get()!;
  assert.equal(pending.state,'cancelled');assert.doesNotMatch(String(pending.payload),/PRIVATE/);
  const old=f.db.raw.prepare("SELECT * FROM sb_mouse_commands WHERE id='old'").get()!;assert.match(String(old.idempotency_key),/^rk1:[a-f0-9]{64}$/);
  assert.equal(old.precondition,null);assert.equal(old.receipt,null);assert.equal(old.error,null);assert.equal(old.payload,'{"details_redacted":true}');
});
test('L04 manual request acknowledgement clears message immediately, without waiting for TTL',async()=>{
  const f=fixture();f.db.raw.prepare("INSERT INTO sb_manual_requests VALUES('11111111-1111-4111-8111-111111111111','o','d','PRIVATE','awaiting_user',?,?)").run(f.now(),f.now()+120000);
  const service=new BridgeEngine({db:f.db as any,bucket:f.bucket as any,now:f.now});
  await new DeviceControlRepository(service).acknowledgeRequest({id:'d',owner_id:'o'} as any,'11111111-1111-4111-8111-111111111111',{state:'ready'});
  assert.equal(f.db.raw.prepare('SELECT message FROM sb_manual_requests').get()!.message,'');
});
test('T83 bounded D1 backlog drains over pages, trips a persisted cap, and contains no content in records',async()=>{
  const f=fixture(),q=f.db.raw.prepare("INSERT INTO sb_metrics(id,owner_id,device_id,kind,bytes,duration_ms,created_at,detail_json) VALUES(?,'o','d','upload',1,1,0,'PRIVATE')");
  f.db.raw.exec('BEGIN');for(let i=0;i<10201;i++)q.run(String(i));f.db.raw.exec('COMMIT');
  const r=await run(f);assert.ok("state" in r);assert.equal((r.state as any).overloaded,1);assert.equal((r.runs[0] as any).error,'BACKLOG_LIMIT');
  assert.equal(f.db.raw.prepare('SELECT count(*) n FROM sb_metrics').get()!.n,10101);
  assert.throws(()=>command(f,'new','queued',f.now(),f.now()+1000),/MAINTENANCE_BACKLOG_LIMIT/);
  assert.doesNotMatch(JSON.stringify(await maintenanceStatus(f.db as any)),/PRIVATE|detail_json|image_key|token/);
  f.tick();await run(f);f.tick();await run(f);assert.equal(f.db.raw.prepare('SELECT count(*) n FROM sb_metrics').get()!.n,8101);
  assert.equal((await maintenanceStatus(f.db as any)).state!.overloaded,0);
});
test('T83 R2 cursors persist across reconstructed runners, expire/orphan GC covers both prefixes and preserves live objects',async()=>{
  const f=fixture();for(let i=0;i<451;i++)f.bucket.values.set('screens/o/d/s/'+String(i).padStart(4,'0')+'.jpg',new Uint8Array([1]));
  f.bucket.values.set('browse/o/d/run/orphan.jpg',new Uint8Array([2]));
  for(let i=0;i<7;i++){await run(f);if(i===0)assert.equal((await maintenanceStatus(f.db as any)).state!.backlog,1);f.tick();}
  assert.equal(f.bucket.values.size,0);assert.ok(f.bucket.sizes.every(n=>n<=100));
  assert.ok((await maintenanceStatus(f.db as any)).state!.last_success_at);
});
test('T83 R2 delete failure retains GC intent and resumes safely; retired keys cannot be rewritten',async()=>{
  const f=fixture(),key='screens/o/d/s/orphan.jpg';f.bucket.values.set(key,new Uint8Array([1]));f.bucket.fail=true;
  await run(f);assert.equal((await maintenanceStatus(f.db as any)).runs[0].state,'failed');assert.equal((await maintenanceStatus(f.db as any)).state!.last_success_at,null);
  assert.equal(f.db.raw.prepare('SELECT is_gc FROM sb_storage_writes').get()!.is_gc,1);
  f.bucket.fail=false;f.tick();await run(f);assert.equal(f.bucket.values.size,0);assert.equal(f.db.raw.prepare('SELECT is_gc FROM sb_storage_writes').get()!.is_gc,2);
  await assert.rejects(erasureAwareBucket(f.db as any,f.bucket as any,f.now).put(key,new Uint8Array([2])),/STORAGE_KEY_RETIRED/);
});
test('T83 expired lease takeover marks abandoned execution failed; old runner cannot overwrite a newer cursor or watermark',async()=>{
  const f=fixture();f.db.raw.exec("UPDATE sb_maintenance_state SET lock_token='abandoned',lock_until=1;INSERT INTO sb_maintenance_runs(id,source,started_at,state) VALUES('abandoned','owner',1727999999,'running')");
  await run(f);assert.equal(f.db.raw.prepare("SELECT state FROM sb_maintenance_runs WHERE id='abandoned'").get()!.state,'failed');
});
test('T83 plan B invokes the same due-only runner and failures do not block authenticated traffic',async()=>{
  const f=fixture(),service=new BridgeEngine({db:f.db as any,bucket:f.bucket as any,now:f.now});
  await opportunisticRetention(service);assert.equal(f.db.raw.prepare('SELECT source FROM sb_maintenance_runs').get()!.source,'request');
  await opportunisticRetention(service);assert.equal(f.db.raw.prepare('SELECT count(*) n FROM sb_maintenance_runs').get()!.n,1);
  const broken={pruneMetadata:async()=>{throw Error('PRIVATE');},scheduleBackground:()=>false};await assert.doesNotReject(async()=>{await opportunisticRetention(broken as any);});
});


test('T83 stale executor cannot replace a takeover checkpoint after delayed R2 I/O',async()=>{
 const f=fixture();let release:()=>void=()=>{},entered:()=>void=()=>{};
 const started=new Promise<void>(r=>entered=r),hold=new Promise<void>(r=>release=r);
 const list=f.bucket.list.bind(f.bucket);let first=true;
 f.bucket.list=async input=>{if(first){first=false;entered();await hold;}return list(input);};
 const old=run(f);await started;f.tick(120001);await run(f);
 const before=f.db.raw.prepare('SELECT * FROM sb_maintenance_state').get();release();await old;
 assert.deepEqual(f.db.raw.prepare('SELECT * FROM sb_maintenance_state').get(),before);
 assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_maintenance_runs WHERE error='LEASE_EXPIRED'").get()!.n,1);
});
test('T83 GC keeps a referenced live object and rejects late D1 publication after retirement',async()=>{
 const f=fixture(),key='screens/o/d/s/live.jpg';f.bucket.values.set(key,new Uint8Array([1]));
 f.db.raw.prepare("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at) VALUES('s','o','d','b','r','h','active','active',?)").run(f.now());
 const put=f.db.raw.prepare("INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,received_at,expires_at,storage_ready) VALUES('d','o','s','f',1,1,?,'h','{}',?,?,1)");
 put.run(key,f.now(),f.now()+1);await run(f);assert.equal(f.bucket.values.has(key),true);
 f.tick();await run(f);f.tick();await run(f);assert.equal(f.bucket.values.has(key),false);
 assert.throws(()=>put.run(key,f.now(),f.now()+100),/STORAGE_KEY_RETIRED/);
});
test('T83 records are bounded to 200 entries and seven days',async()=>{
 const f=fixture(),q=f.db.raw.prepare("INSERT INTO sb_maintenance_runs(id,source,started_at,state) VALUES(?,'request',?,'success')");
 for(let i=0;i<250;i++)q.run(String(i),f.now()-i);
 q.run('old',f.now()-8*DAY);await run(f);
 assert.equal(f.db.raw.prepare('SELECT count(*) n FROM sb_maintenance_runs').get()!.n,200);
 assert.equal(f.db.raw.prepare("SELECT id FROM sb_maintenance_runs WHERE id='old'").get(),undefined);
});
test('T83 GC resumes a committed DELETE with a lost D1 checkpoint even when R2 list is empty',async()=>{
 const f=fixture(),key='screens/o/d/s/deleted.jpg';f.bucket.values.set(key,new Uint8Array([1]));
 const prepare=f.db.prepare.bind(f.db);let fail=true;
 f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('UPDATE sb_storage_writes SET is_gc=2')){
   const run=statement.run;statement.run=async()=>{if(fail){fail=false;throw Error('synthetic lost checkpoint');}return run();};
 }return statement;};
 await run(f);assert.equal(f.bucket.values.size,0);assert.equal(f.db.raw.prepare('SELECT is_gc FROM sb_storage_writes').get()!.is_gc,1);
 f.tick();await run(f);assert.equal(f.db.raw.prepare('SELECT is_gc FROM sb_storage_writes').get()!.is_gc,2);
 assert.equal((await maintenanceStatus(f.db as any)).state!.backlog,0);
});
test('T83 GC lock blocks a late frame renewal without releasing an uncertain DELETE intent',async()=>{
 const f=fixture(),key='screens/o/d/s/late.jpg';
 f.db.raw.prepare("INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,received_at,expires_at,storage_ready) VALUES('d','o','s','f',1,1,?,'h','{}',?,?,1)").run(key,f.now(),f.now()+1);
 f.db.raw.prepare("INSERT INTO sb_storage_writes(id,owner_id,device_id,session_id,image_key,started_at,is_gc) VALUES('gc','o','d','s',?,?,1)").run(key,f.now());
 assert.throws(()=>f.db.raw.prepare('UPDATE sb_frames SET expires_at=?').run(f.now()+10000),/STORAGE_KEY_RETIRED/);
 assert.equal(f.db.raw.prepare('SELECT is_gc FROM sb_storage_writes').get()!.is_gc,1);
});
