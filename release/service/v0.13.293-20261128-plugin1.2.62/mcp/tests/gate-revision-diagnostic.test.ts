import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {hash} from '../lib/bridge-engine.ts';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {gateRevisionGuard,gateRevisionTrace} from '../lib/pairing-gate-revision.ts';
import {logGateRevisionFailure} from '../lib/gate-revision-diagnostic.ts';

const request=()=>new Request('https://offline.invalid/v1/device/frame?secret=PRIVATE_QUERY',{
  method:'POST',headers:{'cf-ray':'0123456789abcdef-SIN',authorization:'Bearer PRIVATE_AUTH'},body:'PRIVATE_BODY',
});
function fixture(run:()=>Promise<unknown>){
  let calls=0;
  const db={prepare:()=>({bind:()=>({run:()=>{calls++;return run();}})})} as unknown as D1Database;
  return {env:{DB:db,SAYSO_SITE_GATE_TOKEN:'PRIVATE_GATE'},calls:()=>calls};
}
async function capture(work:(logs:Record<string,unknown>[])=>Promise<void>){
  const logs:Record<string,unknown>[]=[],original=console.error;
  console.error=value=>{logs.push(JSON.parse(value));};
  try{await work(logs);}finally{console.error=original;}
}

test('D225 success, warm hit, expiry and changed gate preserve exactly the existing D1 counts',async()=>{
  await capture(async logs=>{
    const f=fixture(async()=>({})),guard=gateRevisionGuard();
    const cold=gateRevisionTrace();await guard(f.env,100,cold);
    assert.deepEqual(cold,{cold_cache:true,waiting_in_flight:false,cache_hit:false});
    const hit=gateRevisionTrace();await guard(f.env,101,hit);
    assert.deepEqual(hit,{cold_cache:false,waiting_in_flight:false,cache_hit:true});assert.equal(f.calls(),1);
    await guard(f.env,240100,gateRevisionTrace());assert.equal(f.calls(),2);
    await guard({...f.env,SAYSO_SITE_GATE_TOKEN:'PRIVATE_CHANGED_GATE'},240101);assert.equal(f.calls(),3);
    await guard({},240102,gateRevisionTrace());assert.equal(f.calls(),3);assert.equal(logs.length,0);
  });
});

test('D226 concurrent cold failures each own their I/O and do not cache failure',async()=>{
  let reject!:(e:unknown)=>void,started!:()=>void;
  const ready=new Promise<void>(resolve=>{started=resolve;});
  const pending=new Promise((_resolve,fail)=>{reject=fail;});
  const f=fixture(()=>{started();return pending;}),guard=gateRevisionGuard(),a=gateRevisionTrace(),b=gateRevisionTrace();
  const error=new Error('PRIVATE_SQL PRIVATE_BIND',{cause:new Error('D1_ERROR: SQLITE_BUSY database is locked PRIVATE_VALUE')});
  await capture(async logs=>{
    const first=guard(f.env,10,a).catch(e=>{assert.equal(e,error);logGateRevisionFailure(request(),e,a,performance.now());});
    await ready;
    const waiting=guard(f.env,11,b).catch(e=>{assert.equal(e,error);logGateRevisionFailure(request(),e,b,performance.now());});
    // Independent requests must both enter D1 before either one completes.
    for(let i=0;i<100&&f.calls()<2;i++)await new Promise(resolve=>setTimeout(resolve,1));
    reject(error);await Promise.all([first,waiting]);
    assert.equal(f.calls(),2);assert.equal(logs.length,2);
    assert.deepEqual(a,{cold_cache:true,waiting_in_flight:false,cache_hit:false});
    assert.deepEqual(b,{cold_cache:true,waiting_in_flight:false,cache_hit:false});
    for(const log of logs){assert.equal(log.reason,'D1_BUSY');assert.equal(log.stage,'GATE_REVISION');assert.equal(log.cache_hit,false);}
    await assert.rejects(guard(f.env,12),e=>e===error);assert.equal(f.calls(),3,'failure does not introduce a cooldown');
    assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|SQLITE|digest|token_hash/);
  });
});

test('D226 concurrent cold successes both check, then cache hits use zero extra D1',async()=>{
  let release!:(value:unknown)=>void,started!:()=>void;
  const ready=new Promise<void>(resolve=>{started=resolve;});
  const pending=new Promise(resolve=>{release=resolve;});
  const f=fixture(()=>{started();return pending;}),guard=gateRevisionGuard(),trace=gateRevisionTrace();
  const first=guard(f.env,100);await ready;
  const second=guard(f.env,101,trace);
  for(let i=0;i<100&&f.calls()<2;i++)await new Promise(resolve=>setTimeout(resolve,1));
  release({});await Promise.all([first,second]);
  assert.equal(f.calls(),2);assert.deepEqual(trace,{cold_cache:true,waiting_in_flight:false,cache_hit:false});
  const hit=gateRevisionTrace();await guard(f.env,102,hit);
  assert.equal(f.calls(),2);assert.deepEqual(hit,{cold_cache:false,waiting_in_flight:false,cache_hit:true});
});

test('D226 a changed gate refreshes independently of an unfinished older request',async()=>{
  let release!:(value:unknown)=>void,started!:()=>void;
  const ready=new Promise<void>(resolve=>{started=resolve;});
  const pending=new Promise(resolve=>{release=resolve;});
  const f=fixture(()=>{if(f.calls()===1){started();return pending;}return Promise.resolve({});});
  const guard=gateRevisionGuard(),first=guard(f.env,100);await ready;
  try{
    const changed=await Promise.race([
      guard({...f.env,SAYSO_SITE_GATE_TOKEN:'PRIVATE_CHANGED_GATE'},101).then(()=>true),
      new Promise(resolve=>setTimeout(()=>resolve(false),2000)),
    ]);
    assert.equal(changed,true);assert.equal(f.calls(),2);
  }finally{release({});await first;}
  // A late old completion cannot let a request for the changed gate skip its check.
  await guard({...f.env,SAYSO_SITE_GATE_TOKEN:'PRIVATE_CHANGED_GATE'},102);
  assert.equal(f.calls(),3);
});

test('D226 failed refresh recovers on the next request; revocation UPDATE is idempotent',async()=>{
  const f=fixture(()=>f.calls()===1?Promise.reject(Error('offline failure')):Promise.resolve({}));
  const guard=gateRevisionGuard();await assert.rejects(guard(f.env,1));
  await guard(f.env,2);await guard(f.env,3);assert.equal(f.calls(),2);
  const db=new DatabaseSync(':memory:'),digest=await hash('PRIVATE_GATE'),changes:number[]=[];
  let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
  db.exec('CREATE TABLE sb_devices(id TEXT,revoked INTEGER,pairing_gate_hash TEXT)');
  for(const [id,revoked,value] of [['current',0,digest],['old',0,'old-gate'],['legacy',0,null],['revoked',1,'old-gate']] as const)
    db.prepare('INSERT INTO sb_devices VALUES(?,?,?)').run(id,revoked,value);
  let calls=0;
  const env={SAYSO_SITE_GATE_TOKEN:'PRIVATE_GATE',DB:{prepare:(sql:string)=>({bind:(value:string)=>({run:async()=>{
    calls++;await pending;const result=db.prepare(sql).run(value);changes.push(Number(result.changes));return result;
  }})})} as unknown as D1Database},check=gateRevisionGuard();
  try{
    const requests=Array.from({length:4},()=>check(env,100));
    for(let i=0;i<100&&calls<4;i++)await new Promise(resolve=>setTimeout(resolve,1));
    release();await Promise.all(requests);assert.equal(calls,4);
    assert.deepEqual(changes,[1,0,0,0]);
    assert.deepEqual(db.prepare('SELECT revoked FROM sb_devices ORDER BY id').all().map(row=>row.revoked),[0,0,1,1]);
    await check(env,101);assert.equal(calls,4);
  }finally{release();db.close();}
});

test('D226 workerd: ended and cancelled creators cannot strand later requests',async()=>{
  const bundle=await build({stdin:{contents:`
    import {gateRevisionGuard,gateRevisionTrace} from './lib/pairing-gate-revision.ts';
    const guard=gateRevisionGuard();
    export default {async fetch(request,env){
      let notify;const started=new Promise(resolve=>{notify=resolve;});
      const trace=gateRevisionTrace(),DB={prepare:()=>({bind:()=>({async run(){
        notify();await (await env.DELAY.fetch('https://offline.invalid/delay')).text();return {};
      }})})};
      const work=guard({DB,SAYSO_SITE_GATE_TOKEN:'offline-only-gate'},undefined,trace);
      if(new URL(request.url).pathname==='/end'){
        void work.catch(()=>undefined);await started;return new Response(null,{status:202});
      }
      try{await work;return Response.json(trace);}catch{return new Response(null,{status:503});}
    }};`,resolveDir:process.cwd(),sourcefile:'gate-lifecycle-offline.ts'},bundle:true,write:false,
    format:'esm',platform:'neutral',external:['node:*','cloudflare:*'],logLevel:'silent'});
  for(const mode of ['end','cancel']){
    let calls=0,entered!:()=>void;
    const ready=new Promise<void>(resolve=>{entered=resolve;});
    const runtime=new Miniflare({modules:true,script:bundle.outputFiles[0].text,
      compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],
      serviceBindings:{DELAY:async()=>{calls++;entered();await new Promise(resolve=>setTimeout(resolve,100));return new Response('offline');}},
      outboundService:()=>{throw Error('outbound forbidden');}});
    try{
      const url=new URL(mode==='end'?'/end':'/check',await runtime.ready),controller=new AbortController();
      const first=fetch(url,{signal:controller.signal}).then(r=>r.status,()=>0);
      if(mode==='cancel'){await ready;controller.abort();assert.equal(await first,0);}
      else assert.equal(await first,202);
      await new Promise(resolve=>setTimeout(resolve,200));
      for(let i=0;i<3;i++){
        const response=await fetch(new URL('/check',url),{signal:AbortSignal.timeout(3000)});
        assert.equal(response.status,200,mode);
        const trace=await response.json() as {waiting_in_flight:boolean;cold_cache:boolean;cache_hit:boolean};
        assert.equal(trace.waiting_in_flight,false);
        if(mode==='end'&&i===0)assert.equal(trace.cold_cache,true,'ended creator must not own the next refresh');
      }
      assert.ok(calls>=1);
    }finally{await runtime.dispose();}
  }
});

test('D225 fixed classifications reuse D1 rules and never serialize exceptions, SQL, headers or body',async()=>{
  await capture(async logs=>{
    const cases:[unknown,string,string|undefined][]=[
      [new Error('D1_ERROR: Too many requests queued PRIVATE'),'D1_OTHER','D1_QUEUE_FULL'],
      [new Error('D1 DB is overloaded PRIVATE'),'D1_OTHER','D1_OVERLOADED'],
      [new Error('storage operation exceeded timeout PRIVATE'),'D1_OTHER','D1_STORAGE_TIMEOUT'],
      [new Error('D1_ERROR: free tier daily row write limit PRIVATE'),'D1_OTHER','D1_DAILY_ROW_WRITE_LIMIT'],
      [new Error('D1_ERROR: no such table: PRIVATE_TABLE'),'D1_OTHER','D1_NO_SUCH_TABLE'],
      [new Error('Cannot perform I/O on behalf of a different request. PRIVATE'),'D1_OTHER','D1_IO_CONTEXT'],
      [new Error('UNIQUE constraint failed: PRIVATE_TABLE.PRIVATE_COLUMN'),'D1_CONSTRAINT',undefined],
      [new Error('PRIVATE_UNKNOWN'),'D1_OTHER','D1_OTHER'],
    ];
    for(const [error,exception,reason] of cases){
      const trace={cold_cache:true,waiting_in_flight:false,cache_hit:false};
      logGateRevisionFailure(request(),error,trace,performance.now());
      const log=logs.at(-1)!;assert.equal(log.exception,exception);assert.equal(log.reason,reason);
      assert.deepEqual(Object.keys(log).sort(),['stage','route','method','request_id','exception',...(reason?['reason']:[]),'elapsed_ms','cold_cache','waiting_in_flight','cache_hit'].sort());
      assert.equal(log.route,'/v1/device/frame');assert.equal(log.request_id,'0123456789abcdef-SIN');
      assert.equal(typeof log.elapsed_ms,'number');assert.ok(Number(log.elapsed_ms)>=0);
    }
    const malicious={get message(){throw Error('PRIVATE_GETTER');},toJSON(){throw Error('PRIVATE_SERIALIZER');}};
    logGateRevisionFailure(new Request('https://offline.invalid/pair/PRIVATE_PATH?PRIVATE_QUERY',{
      method:'CUSTOM',headers:{'cf-ray':'PRIVATE_RAY'},
    }),malicious,gateRevisionTrace(),performance.now());
    const log=logs.at(-1)!;assert.equal(log.exception,'UNKNOWN');assert.equal(log.method,'OTHER');
    assert.equal(log.route,'/OTHER');assert.match(String(log.request_id),/^[0-9a-f-]{36}$/);
    assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|Bearer|constraint failed|SQLITE|cause|stack|digest|headers|body/);
  });
  const original=console.error;console.error=()=>{throw Error('logger failed');};
  try{assert.doesNotThrow(()=>logGateRevisionFailure(request(),Error('D1_ERROR'),gateRevisionTrace(),performance.now()));}
  finally{console.error=original;}
});

test('D225 only the unchanged fail-closed top-level catch emits gate diagnostics; heartbeat has no bypass',()=>{
  const worker=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');
  assert.equal((worker.match(/logGateRevisionFailure\(request/g)??[]).length,1);
  assert.match(worker,/catch\(error\)\s*\{\s*logGateRevisionFailure/);
  assert.match(worker,/Response\.json\(\{error:"PAIR_UNAVAILABLE"\},\{status:503,headers:\{"Cache-Control":"no-store"\}\}\)/);
  assert.ok(worker.indexOf('await checkGateRevision')<worker.indexOf('await pairingRoute'));
  assert.doesNotMatch(worker,/heartbeat/);
});
