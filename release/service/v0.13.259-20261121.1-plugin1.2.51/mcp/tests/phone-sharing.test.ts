import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {BridgeEngine,type Device,hash} from '../lib/bridge-engine.ts';
import {otherSharingPhones,renamePhone,replacementHeartbeat,phoneSharingInstructions} from '../lib/phone-sharing.ts';
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
  const db=new DB(),deleted:string[]=[],keys=new Set<string>(),now=Date.now();
  const bucket={delete:async(keys:string|string[])=>{deleted.push(...(Array.isArray(keys)?keys:[keys]));},list:async({prefix}:{prefix:string})=>({objects:[...keys].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})};
  const engine=()=>new BridgeEngine({db:db as unknown as D1Database,bucket:bucket as unknown as R2Bucket,now:()=>now,diagnosticParallelSharing:parallel});
  async function phone(name:string,owner='owner'){
    const id=crypto.randomUUID(),token='a'.repeat(32)+id.replaceAll('-','');
    db.raw.prepare('INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,confirmed_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,owner,name,await hash(token),now+86400000,now,now);
    return {device:db.raw.prepare('SELECT * FROM sb_devices WHERE id=?').get(id) as unknown as Device,token};
  }
  return {db,deleted,keys,engine,phone};
}
function startBody(){return {mode:'broadcast',control_enabled:false,request_id:crypto.randomUUID(),broadcast_id:crypto.randomUUID()};}
async function start(e:BridgeEngine,d:Device){const body=startBody(),s=await e.createSession(d,body),worker=crypto.randomUUID();
  const lease=await e.claimWorker(d,{bridge_session_id:s.bridge_session_id,broadcast_id:body.broadcast_id,worker_id:worker,worker_kind:'broadcast'});
  return {...body,bridge_session_id:s.bridge_session_id,worker_id:worker,lease_epoch:lease.lease_epoch,capture_state:'active',usb_connected:false};}

test('D147 new broadcast atomically replaces same-owner sharing, clears frames/input and preserves other owners',async()=>{
  const l=lab(),a=await l.phone('iPhone 11'),b=await l.phone('iPhone 16 Pro'),c=await l.phone('Other owner','other');
  const one=await start(l.engine(),a.device),foreign=await start(l.engine(),c.device);
  l.db.raw.prepare('UPDATE sb_sessions SET mouse_enabled=1,mouse_until=?,control_epoch=7 WHERE id=?').run(Date.now()+10000,one.bridge_session_id);
  const key=`screens/owner/${a.device.id}/${one.bridge_session_id}/frame.jpg`;
  l.db.raw.prepare('INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,received_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(a.device.id,'owner',one.bridge_session_id,crypto.randomUUID(),1,one.lease_epoch,key,'digest','{}',Date.now(),Date.now()+10000);
  l.keys.add(key);
  const two=await start(l.engine(),b.device);
  const old=l.db.raw.prepare('SELECT * FROM sb_sessions WHERE id=?').get(one.bridge_session_id)!;
  assert.equal(old.state,'stopped');assert.equal(old.capture_state,'stopped');assert.equal(old.mouse_enabled,0);assert.equal(old.mouse_until,0);assert.ok(Number(old.control_epoch)>7);assert.equal(old.blocked,1);assert.equal(old.stop_reason,'sharing_replaced');
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
