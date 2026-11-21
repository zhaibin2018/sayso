import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createPrivateKey,createPublicKey,diffieHellman,hkdfSync,createDecipheriv,generateKeyPairSync} from 'node:crypto';
import {ServicePairing,validatePairing} from '../lib/service-pairing.ts';
import {pairingRoute,pairingScript,pairingPage} from '../lib/service-pairing-http.ts';
import {gateRevisionGuard} from '../lib/pairing-gate-revision.ts';
import {BridgeEngine,hash} from '../lib/bridge-engine.ts';
import {handleMcp} from '../lib/mcp-protocol.ts';
import {installPairingGate} from '../scripts/install-pairing-gate.mjs';
import {clockJSON,eventClockVersion,readEventClock} from '../lib/event-clock.ts';
import {requireEventClock} from '../lib/event-clock-scope.ts';

class Statement {
  readonly db:DatabaseSync;readonly sql:string;readonly values:(string|number|null)[];
  constructor(db:DatabaseSync,sql:string,values:(string|number|null)[]=[]) {this.db=db;this.sql=sql;this.values=values;}
  bind(...values:(string|number|null)[]) {return new Statement(this.db,this.sql,values);}
  execute(mode:string) {const q=this.db.prepare(this.sql);if(mode==='first')return q.get(...this.values)??null;
    if(mode==='all')return {results:q.all(...this.values),success:true,meta:{}};
    const r=q.run(...this.values);return {success:true,results:[],meta:{changes:Number(r.changes)}};}
  async first(){return this.execute('first');}async run(){return this.execute('run');}async all(){return this.execute('all');}
}
class DB {
  raw=new DatabaseSync(':memory:');
  constructor(){for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())this.raw.exec(readFileSync('drizzle/'+file,'utf8'));}
  prepare(sql:string){return new Statement(this.raw,sql);}
  async batch(statements:Statement[]){this.raw.exec('BEGIN IMMEDIATE');try{const r=statements.map(s=>s.execute('run'));this.raw.exec('COMMIT');return r;}catch(e){this.raw.exec('ROLLBACK');throw e;}}
}
const origin='https://fixture.invalid',gate='offline-fixture-not-a-site-credential',alice={id:'owner',label:'Synthetic owner'};
function lab(){const db=new DB();let now=1_795_075_200_000;
  const env={DB:db as unknown as D1Database,SAYSO_SITE_GATE_TOKEN:gate};
  const service=new ServicePairing(env.DB,origin,gate,()=>now);
  const keys=generateKeyPairSync('x25519'),publicKey=keys.publicKey.export({format:'jwk'}).x!;
  const args={request_id:crypto.randomUUID(),public_key:Buffer.from(publicKey,'base64url').toString('base64')};
  return {db,env,service,args,keys,now:()=>now,tick:(ms:number)=>{now+=ms;}};
}
function open(capsule:string,privateKey:ReturnType<typeof createPrivateKey>){
  const e=JSON.parse(Buffer.from(capsule,'base64url').toString());
  const publicKey=createPublicKey({key:{kty:'OKP',crv:'X25519',x:Buffer.from(e.ephemeral_public_key,'base64').toString('base64url')},format:'jwk'});
  const info=Buffer.from('ScreenBridge developer bootstrap v1');
  const key=hkdfSync('sha256',diffieHellman({privateKey,publicKey}),Buffer.from(e.salt,'base64'),info,32);
  const bytes=Buffer.from(e.ciphertext,'base64'),decipher=createDecipheriv('aes-256-gcm',Buffer.from(key),Buffer.from(e.nonce,'base64'));
  decipher.setAAD(info);decipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]).toString());
}
async function issued(l:ReturnType<typeof lab>){await l.service.create(alice,l.args);const reply=await l.service.issue(alice,l.args);return open(reply.capsule,l.keys.privateKey);}
const name='Synthetic iPhone';
test('L06 real migration, independent decrypt, one package and one token under concurrent clicks',async()=>{
  const l=lab();const created=await l.service.create(alice,l.args);assert.equal(new URL(created.pairing_url).origin,origin);
  const replies=await Promise.allSettled([l.service.issue(alice,l.args),l.service.issue(alice,l.args)]);
  assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);
  const winning=replies.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<{capsule:string}>;
  const p=open(winning.value.capsule,l.keys.privateKey);assert.equal(p.server_origin,origin);assert.equal(p.site_gate_token,gate);
  const body={request_id:l.args.request_id,pairing_code:p.pairing_code,name};
  const r=await Promise.allSettled([l.service.redeem(body,'fixture'),l.service.redeem(body,'fixture')]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(l.db.raw.prepare('SELECT count(*) n FROM sb_devices').get()!.n,1);
  const row=l.db.raw.prepare('SELECT * FROM sb_pairing_requests').get()!;
  assert.equal(row.code_hash,await hash(p.pairing_code));assert.equal(row.gate_hash,await hash(gate));assert.ok(!Object.values(row).includes(p.pairing_code));
  assert.equal(l.db.raw.prepare('SELECT count(*) n FROM sb_sessions').get()!.n,0);
});
test('L06 expiry boundaries do not extend on repeated registration and issuance',async()=>{
  const l=lab();await l.service.create(alice,l.args);l.tick(299_999);await l.service.create(alice,l.args);
  l.tick(1);await assert.rejects(l.service.create(alice,l.args),{code:'PAIR_EXPIRED'});await assert.rejects(l.service.issue(alice,l.args),{code:'PAIR_EXPIRED'});
  const m=lab(),p=await issued(m);m.tick(300_000);await assert.rejects(m.service.redeem({request_id:m.args.request_id,pairing_code:p.pairing_code,name},'f'),{code:'PAIR_EXPIRED'});
});
test('L06 identity, key, absent request, malformed and low-order keys are distinct',async()=>{
  const l=lab();await l.service.create(alice,l.args);
  await assert.rejects(l.service.issue({id:'other',label:'other'},l.args),{code:'PAIR_IDENTITY'});
  await assert.rejects(l.service.issue(alice,{...l.args,public_key:Buffer.alloc(32,3).toString('base64')}),{code:'PAIR_KEY_MISMATCH'});
  await assert.rejects(l.service.issue(alice,{...l.args,request_id:crypto.randomUUID()}),{code:'PAIR_NOT_FOUND'});
  for(const args of [{...l.args,extra:1},{...l.args,request_id:'bad'},{...l.args,public_key:Buffer.alloc(32).toString('base64')}])assert.throws(()=>validatePairing(args));
  const low={request_id:crypto.randomUUID(),public_key:Buffer.from([1,...Array(31).fill(0)]).toString('base64')};
  await assert.rejects(l.service.create(alice,low),{code:'PAIR_KEY'});
});
test('L06 replay, wrong code/request, gate rotation and two independent phones',async()=>{
  const l=lab(),p=await issued(l),body={request_id:l.args.request_id,pairing_code:p.pairing_code,name};
  await assert.rejects(l.service.redeem({...body,request_id:crypto.randomUUID()},'f'),{code:'PAIR_CODE_INVALID'});
  await assert.rejects(l.service.redeem({...body,pairing_code:'x'.repeat(43)},'f'),{code:'PAIR_CODE_INVALID'});
  const a=await l.service.redeem(body,'f');await assert.rejects(l.service.redeem(body,'f'),{code:'PAIR_CODE_USED'});
  const args={...l.args,request_id:crypto.randomUUID()};await l.service.create(alice,args);const second=open((await l.service.issue(alice,args)).capsule,l.keys.privateKey);
  const b=await l.service.redeem({request_id:args.request_id,pairing_code:second.pairing_code,name:'Phone 2'},'f');assert.notEqual(a.device_id,b.device_id);
  const engine=new BridgeEngine({db:l.env.DB,bucket:{list:async()=>({objects:[],truncated:false}),delete:async()=>{}} as unknown as R2Bucket,now:l.now});assert.equal((await engine.listDevices(alice)).length,2);
  await engine.revoke(alice,a.device_id);assert.equal((await engine.listDevices(alice)).length,1);
  const check=gateRevisionGuard();await check({...l.env,SAYSO_SITE_GATE_TOKEN:'changed-offline-gate'},l.now());
  await assert.rejects(engine.authenticate(new Request(origin,{headers:{Authorization:'Bearer '+b.device_token}})),{code:'UNAUTHENTICATED'});
  const m=lab(),q=await issued(m);await assert.rejects(new ServicePairing(m.env.DB,origin,'changed-offline-gate',m.now).redeem({request_id:m.args.request_id,pairing_code:q.pairing_code,name},'f'),{code:'PAIR_GATE_CHANGED'});
});
test('L06 private browser identity, same origin, media type, body bounds and fixed errors',async()=>{
  const l=lab();await l.service.create(alice,l.args);
  const req=(path:string,body:unknown,headers:Record<string,string>={})=>new Request(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'oai-authenticated-user-id':alice.id,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  for(const path of ['/pair','/pair.js']){
    const unauth=await pairingRoute(new Request(origin+path),l.env,l.now);assert.equal(unauth!.status,401);
    const address=path==='/pair' ? (await l.service.create(alice,l.args)).pairing_url:origin+path;
    const ok=await pairingRoute(new Request(address,{headers:{'oai-authenticated-user-id':alice.id}}),l.env,l.now);assert.equal(ok!.status,200);assert.equal(ok!.headers.get('Cache-Control'),'no-store');
  }
  for(const [request,code] of [[req('/api/pairing/capsule',l.args,{Origin:'https://other.invalid'}),'PAIR_ORIGIN'],
    [req('/api/pairing/capsule',l.args,{'oai-authenticated-user-id':'other'}),'PAIR_IDENTITY'],
    [req('/api/pairing/capsule',l.args,{'Content-Type':'text/plain'}),'PAIR_CONTENT'],
    [req('/api/pairing/capsule','{'),'PAIR_INPUT'],[req('/api/pairing/capsule','x'.repeat(4097)),'BODY_TOO_LARGE']] as const){
    const response=await pairingRoute(request,l.env,l.now);assert.deepEqual(await response!.json(),{error:code});
  }
  assert.equal(await pairingRoute(new Request(origin+'/unrelated'),l.env),null);
  assert.doesNotMatch(pairingScript,/location\.(href\s*=|assign|replace)|localStorage|sessionStorage|console\./);
  assert.match(pairingScript,/pagehide/);assert.match(pairingScript,/PAIR_ALREADY_ISSUED/);assert.match(pairingPage,/Do not screenshot/);
  l.tick(300_000);
  const page=await pairingRoute(new Request(origin+'/pair?'+new URLSearchParams({req:l.args.request_id,pk:l.args.public_key}),{headers:{'oai-authenticated-user-id':alice.id}}),l.env,l.now);
  assert.equal(page!.status,410);assert.match(await page!.text(),/PAIR_EXPIRED/);
});
test('L06 MCP exposes neutral public link tool and returns only public fields',async()=>{
  const l=lab(),service=new BridgeEngine({db:l.env.DB,bucket:{list:async()=>({objects:[],truncated:false}),delete:async()=>{}} as unknown as R2Bucket,now:l.now});
  const response=await handleMcp(new Request(origin+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'create_pairing_link',arguments:l.args}})}),{engine:()=>service,caller:()=>alice,origin,retention:false,performance:{log:()=>{}}});
  const result=(await response.json() as {result:{isError:boolean;structuredContent:Record<string,unknown>}}).result;
  assert.equal(result.isError,false);assert.equal(new URL(String(result.structuredContent.pairing_url)).origin,origin);
  assert.ok(!JSON.stringify(result).includes('capsule'));assert.ok(!JSON.stringify(result).includes(gate));
});
test('L06 installation provisions the platform gate once without returning it; non-owner-only fails closed',async()=>{
  let stored:string|undefined,issued=0;
  const hooks={assertOwnerOnly:async()=>true,readGate:async()=>stored,issueGate:async()=>{issued++;return gate;},storeGate:async(key:string,value:string)=>{assert.equal(key,'SAYSO_SITE_GATE_TOKEN');stored=value;}};
  assert.deepEqual(await installPairingGate(hooks),{configured:true,created:true});
  assert.deepEqual(await installPairingGate(hooks),{configured:true,created:false});assert.equal(issued,1);
  await assert.rejects(installPairingGate({...hooks,assertOwnerOnly:async()=>false}),/PAIR_INSTALL_OWNER_ONLY_REQUIRED/);
  await assert.rejects(installPairingGate({...hooks,readGate:async()=>undefined,issueGate:async()=>{throw Error('private upstream details');}}),/PAIR_INSTALL_GATE_FAILED/);
  await assert.rejects(installPairingGate({...hooks,readGate:async()=>{throw Error('private upstream details');}}),error=>String(error)==='Error: PAIR_INSTALL_GATE_FAILED');
  await assert.rejects(installPairingGate({...hooks,assertOwnerOnly:async()=>{throw Error('private upstream details');}}),error=>String(error)==='Error: PAIR_INSTALL_GATE_FAILED');
});
test('L06 gate invalidation covers warm optimized routes within four minutes',async()=>{
  const l=lab(),p=await issued(l);await l.service.redeem({request_id:l.args.request_id,pairing_code:p.pairing_code,name},'f');
  const guard=gateRevisionGuard();await guard(l.env,l.now());
  const other=await hash('old-offline-gate');l.db.raw.prepare('UPDATE sb_devices SET pairing_gate_hash=?').run(other);
  l.tick(239_999);await guard(l.env,l.now());assert.equal(l.db.raw.prepare('SELECT revoked FROM sb_devices').get()!.revoked,0);
  l.tick(1);await guard(l.env,l.now());assert.equal(l.db.raw.prepare('SELECT revoked FROM sb_devices').get()!.revoked,1);
});

test('L06/T79 journal upgrades an existing A database without changing pairing or legacy sessions',()=>{
  const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8')) as {entries:{idx:number;tag:string;when:number}[]};
  const files=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
  assert.deepEqual(journal.entries.map(e=>e.tag+'.sql'),files);
  assert.deepEqual(journal.entries.map(e=>e.idx),files.map((_,i)=>i));
  assert.equal(journal.entries.at(-1)!.tag,'0034_install_pairing');
  const last=journal.entries.at(-2)!;assert.equal(last.tag,'0033_stop_and_idle');
  assert.equal(journal.entries.at(-3)!.tag,'0032_retention_maintenance');
  assert.ok(last.when>journal.entries.at(-3)!.when);
  const db=new DatabaseSync(':memory:');
  try {
    for(const entry of journal.entries.slice(0,-2))db.exec(readFileSync('drizzle/'+entry.tag+'.sql','utf8'));
    db.prepare('INSERT INTO sb_pairing_requests(request_id,owner_id,owner_label,public_key,expires_at) VALUES(?,?,?,?,?)').run('pending','owner','Owner','public-key',12345);
    db.prepare('INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,created_at,pairing_gate_hash) VALUES(?,?,?,?,?,?,?)').run('device','owner','Phone','token-hash',12345,100,'gate-hash');
    db.prepare('INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('session','owner','device','broadcast','request','body-hash','active','active',100);
    db.exec(readFileSync('drizzle/'+last.tag+'.sql','utf8'));
    assert.equal(db.prepare('SELECT event_clock FROM sb_sessions WHERE id=?').get('session')!.event_clock,null);
    assert.equal(db.prepare('SELECT pairing_gate_hash FROM sb_devices WHERE id=?').get('device')!.pairing_gate_hash,'gate-hash');
    assert.equal(db.prepare('SELECT public_key FROM sb_pairing_requests WHERE request_id=?').get('pending')!.public_key,'public-key');
    for(const table of ['sb_sessions','sb_clock_probes','sb_mouse_commands'])assert.ok(db.prepare('PRAGMA table_info('+table+')').all().some(c=>c.name==='event_clock'));
  } finally {db.close();}
});

test('L06/T79 redeemed identity negotiates a fixed view-only clock and still obeys gate revocation',async()=>{
  const l=lab(),p=await issued(l),paired=await l.service.redeem({request_id:l.args.request_id,pairing_code:p.pairing_code,name},'f');
  const engine=new BridgeEngine({db:l.env.DB,bucket:{list:async()=>({objects:[],truncated:false}),delete:async()=>{}} as unknown as R2Bucket,now:l.now});
  const request=()=>new Request(origin,{headers:{Authorization:'Bearer '+paired.device_token}}),device=await engine.authenticate(request());
  assert.equal(device.id,paired.device_id);assert.equal(device.owner_id,alice.id);
  assert.equal(l.db.raw.prepare('SELECT count(*) n FROM sb_sessions').get()!.n,0);
  const declaration={version:eventClockVersion,device_id:device.id,broadcast_id:crypto.randomUUID(),worker_id:crypto.randomUUID(),clock_domain_id:crypto.randomUUID()};
  const body={mode:'broadcast',control_enabled:false,request_id:crypto.randomUUID(),broadcast_id:declaration.broadcast_id,event_clock_request:declaration};
  await assert.rejects(engine.createSession(device,{...body,control_enabled:true}),{code:'VIEW_ONLY_MODE'});
  const session=await engine.createSession(device,body);
  assert.equal(session.event_clock_version,eventClockVersion);assert.equal(session.control_enabled,false);
  const clock=readEventClock({...declaration,bridge_session_id:session.bridge_session_id});
  assert.equal(l.db.raw.prepare('SELECT event_clock FROM sb_sessions WHERE id=?').get(session.bridge_session_id)!.event_clock,clockJSON(clock));
  assert.equal((await engine.createSession(device,body)).bridge_session_id,session.bridge_session_id);
  await assert.rejects(engine.createSession(device,{...body,event_clock_request:{...declaration,clock_domain_id:crypto.randomUUID()}}),{code:'IDEMPOTENCY_CONFLICT'});
  const scoped={bridge_session_id:session.bridge_session_id,broadcast_id:declaration.broadcast_id,event_clock:clock};
  assert.deepEqual(await requireEventClock(engine,device,scoped),clock);
  await assert.rejects(requireEventClock(engine,device,{...scoped,event_clock:undefined}),{code:'EVENT_CLOCK_SCOPE_CHANGED'});
  await assert.rejects(requireEventClock(engine,device,{...scoped,event_clock:{...clock,clock_domain_id:crypto.randomUUID()}}),{code:'EVENT_CLOCK_SCOPE_CHANGED'});
  assert.equal(l.db.raw.prepare('SELECT worker_id FROM sb_devices WHERE id=?').get(device.id)!.worker_id,null);
  await gateRevisionGuard()({...l.env,SAYSO_SITE_GATE_TOKEN:'changed-offline-gate'},l.now());
  await assert.rejects(engine.authenticate(request()),{code:'UNAUTHENTICATED'});
});

test('D143 install writes immutable owner-bound D1 request, survives service restart and supports req-only two-step page',async()=>{
  const l=lab(),created=l.now();l.tick(180_000);
  const seed={...l.args,created_at:created};
  const first=await l.service.install(alice,alice.id,seed);
  const again=await l.service.install(alice,alice.id,seed);assert.deepEqual(first,again);
  assert.equal(new URL(first.pairing_url).searchParams.size,1);
  const row=l.db.raw.prepare('SELECT * FROM sb_pairing_requests').get()!;
  assert.equal(row.created_at,created);assert.equal(row.expires_at,created+900_000);assert.equal(row.owner_id,alice.id);
  assert.equal(row.code_hash,null);assert.equal(l.db.raw.prepare('SELECT count(*) n FROM sb_devices').get()!.n,0);
  const restarted=new ServicePairing(l.env.DB,origin,gate,l.now);
  const page=await pairingRoute(new Request(first.pairing_url,{headers:{'oai-authenticated-user-id':alice.id}}),l.env,l.now);
  assert.equal(page!.status,200);assert.match(await page!.text(),/open-sayso/);
  const replies=await Promise.allSettled([restarted.issue(alice,{request_id:l.args.request_id}),restarted.issue(alice,{request_id:l.args.request_id})]);
  assert.equal(replies.filter(x=>x.status==='fulfilled').length,1);
  const winner=replies.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<{capsule:string;expires_at:number}>;
  const p=open(winner.value.capsule,l.keys.privateKey);assert.equal(p.expires_at,Math.floor((l.now()+300_000)/1000));
  await assert.rejects(l.service.install(alice,alice.id,seed),{code:'PAIR_ALREADY_ISSUED'});
  const body={request_id:l.args.request_id,pairing_code:p.pairing_code,name};
  const redeemed=await Promise.allSettled([l.service.redeem(body,'f'),l.service.redeem(body,'f')]);
  assert.equal(redeemed.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(l.db.raw.prepare('SELECT count(*) n FROM sb_devices').get()!.n,1);
  await assert.rejects(l.service.issue(alice,{request_id:l.args.request_id}),{code:'PAIR_ALREADY_ISSUED'});
});
test('D143 install rejects other owners, malformed canonical/low-order keys and client owner fields before writing',async()=>{
  const l=lab(),seed={...l.args,created_at:l.now()};
  for(const owner of [undefined,'someone-else'])await assert.rejects(l.service.install(alice,owner,seed),{code:'PAIR_IDENTITY'});
  await assert.rejects(l.service.install({id:'visitor',label:'Visitor'},alice.id,seed),{code:'PAIR_IDENTITY'});
  for(const key of ['bad',Buffer.alloc(32).toString('base64'),Buffer.from([1,...Array(31).fill(0)]).toString('base64'),Buffer.alloc(32,255).toString('base64'),l.args.public_key.replace('=','')]){
    await assert.rejects(l.service.install(alice,alice.id,{...seed,public_key:key}));
  }
  for(const value of [{...seed,owner_id:'visitor'},{...seed,created_at:l.now()+1},{...seed,created_at:1.1},{...seed,created_at:'now'},{...seed,request_id:'../bad'}])await assert.rejects(l.service.install(alice,alice.id,value));
  assert.equal(l.db.raw.prepare('SELECT count(*) n FROM sb_pairing_requests').get()!.n,0);
  await l.service.install(alice,alice.id,seed);
  await assert.rejects(l.service.install(alice,alice.id,{...seed,public_key:Buffer.alloc(32,3).toString('base64')}),{code:'PAIR_KEY_MISMATCH'});
  l.tick(1);await assert.rejects(l.service.install(alice,alice.id,{...seed,created_at:l.now()}),{code:'PAIR_REQUEST_MISMATCH'});
  await assert.rejects(l.service.issue({id:'visitor',label:'Visitor'},{request_id:seed.request_id}),{code:'PAIR_IDENTITY'});
});
test('D143 generation-time expiry survives retries, purge and install delay; capsule still has five-minute upper bound',async()=>{
  const l=lab(),seed={...l.args,created_at:l.now()};await l.service.install(alice,alice.id,seed);
  l.tick(899_999);await l.service.install(alice,alice.id,seed);l.tick(1);
  await assert.rejects(l.service.install(alice,alice.id,seed),{code:'PAIR_EXPIRED'});
  await assert.rejects(l.service.inspect(alice,{request_id:seed.request_id}),{code:'PAIR_EXPIRED'});
  await assert.rejects(l.service.issue(alice,{request_id:seed.request_id}),{code:'PAIR_EXPIRED'});
  l.db.raw.prepare('DELETE FROM sb_pairing_requests').run();
  await assert.rejects(l.service.install(alice,alice.id,seed),{code:'PAIR_EXPIRED'});
  const m=lab(),later={...m.args,created_at:m.now()};await m.service.install(alice,alice.id,later);
  m.tick(180_000);const p=open((await m.service.issue(alice,{request_id:later.request_id})).capsule,m.keys.privateKey);
  m.tick(300_000);await assert.rejects(m.service.redeem({request_id:later.request_id,pairing_code:p.pairing_code,name},'f'),{code:'PAIR_EXPIRED'});
  const n=lab(),late={...n.args,created_at:n.now()};await n.service.install(alice,alice.id,late);n.tick(899_000);
  const q=open((await n.service.issue(alice,{request_id:late.request_id})).capsule,n.keys.privateKey);
  assert.equal(q.expires_at,Math.floor((late.created_at+900_000)/1000));
});
test('D143 HTTP installation needs dispatch identity, configured owner and same origin; helper works without newly installed MCP',async()=>{
  const l=lab(),env={...l.env,SAYSO_INSTALL_OWNER_ID:alice.id},seed={...l.args,created_at:l.now()};
  const {installPairingRequest,readInstallPairingOwner}=await import('../scripts/install-pairing-request.mjs');
  const post=(body:unknown,headers:Record<string,string>={})=>new Request(origin+'/api/pairing/install',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','oai-authenticated-user-id':alice.id,...headers},body:JSON.stringify(body)});
  for(const [request,e,status] of [[post(seed,{'oai-authenticated-user-id':''}),env,401],[post(seed,{'oai-authenticated-user-id':'visitor'}),env,403],[post(seed,{Origin:'https://other.invalid'}),env,403],[post(seed),l.env,503]] as const){
    const response=await pairingRoute(request,e,l.now);assert.equal(response!.status,status);assert.doesNotMatch(await response!.text(),/capsule|site_gate_token|device_token/);
  }
  let ownerChecks=0;
  const capabilities={origin,assertOwnerOnly:async()=>{ownerChecks++;return true;},fetchSite:async(url:URL|string,init:RequestInit)=>{
    const headers=new Headers(init.headers);headers.set('oai-authenticated-user-id',alice.id);if(init.method==='POST')headers.set('Origin',origin);
    const response=await pairingRoute(new Request(url,{...init,headers}),env,l.now);assert.ok(response);return response!;
  }};
  assert.deepEqual(await readInstallPairingOwner(capabilities),{id:alice.id});
  const result=await installPairingRequest(capabilities,seed);assert.match(result.pairing_url,/\/pair\?req=/);assert.equal(ownerChecks,2);
  assert.deepEqual(await installPairingRequest(capabilities,seed),result);
  await assert.rejects(installPairingRequest({...capabilities,assertOwnerOnly:async()=>false},seed),/PAIR_INSTALL_REQUEST_FAILED/);
  await assert.rejects(installPairingRequest({...capabilities,fetchSite:async()=>{throw Error('sensitive upstream');}},seed),e=>String(e)==='Error: PAIR_INSTALL_REQUEST_FAILED');
});
test('D143 migration preserves already-issued original L06 request and code deadline',async()=>{
  const l=lab(),p=await issued(l);l.db.raw.prepare('UPDATE sb_pairing_requests SET code_expires_at=NULL').run();
  const row=l.db.raw.prepare('SELECT * FROM sb_pairing_requests').get()!;assert.equal(row.created_at,null);
  await assert.rejects(l.service.inspect(alice,{request_id:l.args.request_id}),{code:'PAIR_INPUT'});
  const paired=await l.service.redeem({request_id:l.args.request_id,pairing_code:p.pairing_code,name},'f');assert.ok(paired.device_id);
});
