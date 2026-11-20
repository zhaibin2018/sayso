// Isolated real-handler sensitivity test; no network, phone, input or model API.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import jpeg from 'jpeg-js';
import {BridgeEngine,uid,hash} from '../lib/bridge-engine.ts';
import {LiveFrameCache} from '../lib/live-frame-cache.ts';

const pause=ms=>new Promise(r=>setTimeout(r,ms));
class Statement{
  constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}
  bind(...values){return new Statement(this.db,this.sql,values);}
  execute(mode){const q=this.db.raw.prepare(this.sql);if(mode==='batch')mode=q.columns().length?'all':'run';
    if(mode==='first')return q.get(...this.values)??null;
    if(mode==='all')return {results:q.all(...this.values),success:true,meta:{}};
    return {results:[],success:true,meta:{changes:Number(q.run(...this.values).changes)}};
  }
  async first(){await this.db.gate();return this.execute('first');}
  async all(){await this.db.gate();return this.execute('all');}
  async run(){await this.db.gate();return this.execute('run');}
}
class DB{
  raw=new DatabaseSync(':memory:');delay=0;requests=0;
  constructor(){for(const f of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())this.raw.exec(readFileSync('drizzle/'+f,'utf8'));}
  prepare(sql){return new Statement(this,sql);}
  async gate(){this.requests++;if(this.delay)await pause(this.delay);}
  async batch(statements){await this.gate();this.raw.exec('BEGIN IMMEDIATE');try{const r=statements.map(s=>s.execute('batch'));this.raw.exec('COMMIT');return r;}catch(e){this.raw.exec('ROLLBACK');throw e;}}
}
class Bucket{
  values=new Map();async put(k,v){this.values.set(k,new Uint8Array(v));}
  async get(k){const v=this.values.get(k);return v?{arrayBuffer:async()=>v.slice().buffer}:null;}
  async head(k){return this.values.has(k)?{key:k}:null;}
  async delete(keys){for(const k of typeof keys==='string'?[keys]:keys)this.values.delete(k);}
  async list({prefix}){return {objects:[...this.values.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}
}
const owner={id:'synthetic-observation-owner',label:'fixture'},originalInfo=console.info;
const pixels=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,150)},70).data;
async function fixture(){
  const db=new DB(),bucket=new Bucket(),now=Date.now();db.raw.function('julianday',()=>2440587.5+now/86400000);
  const service=new BridgeEngine({db,bucket,now:()=>now,schedule:()=>{},cache:new LiveFrameCache(1024*1024,()=>now)});
  const code=await service.createPairingCode(owner,'fixture','https://fixture.invalid');
  const pair=await service.redeem({pairing_code:code.pairing_code,name:'SYNTHETIC PHONE',request_id:uid()},'fixture');
  const req=()=>new Request('https://fixture.invalid/v1/device/frame-observation',{method:'POST',headers:{Authorization:'Bearer '+pair.device_token}});
  const actor=await service.authenticate(req()),broadcast=uid();
  const session=await service.createSession(actor,{mode:'broadcast',broadcast_id:broadcast,request_id:uid(),control_enabled:false}),worker=uid();
  const claim=await service.claimWorker(actor,{bridge_session_id:session.bridge_session_id,broadcast_id:broadcast,worker_id:worker,worker_kind:'broadcast'});
  const probe=await service.clockProbe(actor),meta={bridge_session_id:session.bridge_session_id,broadcast_id:broadcast,worker_id:worker,lease_epoch:claim.lease_epoch,
    frame_id:uid(),frame_seq:1,capture_mono_ms:10000,capture_age_ms:0,captured_at:new Date(now).toISOString(),
    width:16,height:32,native_width_px:1206,native_height_px:2622,orientation:'portrait',orientation_epoch:0,
    content_rect:{x:0,y:0,width:16,height:32},transform_version:'1',content_sha256:await hash(pixels),provenance:'device_capture',capture_clock_verified:true,
    clock_probe_id:probe.clock_probe_id,capture_offset_ms:0,clock_rtt_ms:10};
  await service.acceptFrame(actor,meta,pixels);return {db,service,meta,request:req};
}
const results=[];console.info=()=>{};
try{
  for(const delay of [0,180])for(let round=0;round<3;round++)for(const strategy of round%2?['combined','legacy']:['legacy','combined']){
    const l=await fixture(),meta={...l.meta,frame_id:uid(),frame_seq:2,capture_mono_ms:10001,capture_offset_ms:1};
    const request=l.request();const wire=JSON.stringify(meta),read=async()=>JSON.parse(wire);
    l.db.delay=delay;l.db.requests=0;const started=performance.now();
    const reply=strategy==='legacy'?await l.service.acceptFrame(await l.service.authenticate(request),await read()):await l.service.acceptObservationRequest(request,read);
    const elapsed=performance.now()-started;
    assert.equal(reply.accepted_frame_id,meta.frame_id);assert.equal(l.db.requests,strategy==='legacy'?2:1);
    const stored=l.db.raw.prepare('SELECT inline_jpeg,metadata FROM sb_frames').get();
    assert.deepEqual(Buffer.from(stored.inline_jpeg,'base64'),Buffer.from(pixels));assert.equal(JSON.parse(stored.metadata).capture_mono_ms,10001);
    results.push({strategy,injected_d1_delay_ms:delay,round,elapsed_ms:elapsed,d1_calls:l.db.requests,response_json_bytes:Buffer.byteLength(JSON.stringify(reply)),full_request_timing_returned:!!reply.request_timing});l.db.raw.close();
  }
}finally{console.info=originalInfo;}
const report={schema:'sayso.authenticated_observation_benchmark.v1',synthetic_fixture:true,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),results,
  limits:['Actual handlers on in-memory SQLite and synthetic JPEG/credential;no real device or production requests.',
    'Legacy strategy calls authenticate then acceptFrame as the old HTTP route;no legacy route is added.',
    '180ms per storage request is injected sensitivity,not measured production RTT.','Fixture clock frozen:does not measure real capture age,radio,Site gate or model latency.',
    'New reply includes additional numeric timings;response bytes are not claimed identical.','No image payload,tokens or raw replies saved.'],three_second_goal_verified:false};
writeFileSync(process.argv[2]??'../../evidence/observation78-local-benchmark-20261103.json',JSON.stringify(report,null,2)+'\n');
const median=v=>v.toSorted((a,b)=>a-b)[Math.floor(v.length/2)];
console.log(JSON.stringify({calls:results.length,summary:[0,180].flatMap(delay=>['legacy','combined'].map(strategy=>{const r=results.filter(x=>x.strategy===strategy&&x.injected_d1_delay_ms===delay);return {delay,strategy,median_ms:Math.round(median(r.map(x=>x.elapsed_ms))),d1_calls:r[0].d1_calls,response_bytes:r[0].response_json_bytes};}))}));
