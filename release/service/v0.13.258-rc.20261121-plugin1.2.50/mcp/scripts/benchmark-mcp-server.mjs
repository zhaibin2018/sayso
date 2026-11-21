// Isolated synthetic fixture. Runs real handlers, never contacts or controls a phone.
// Injected D1 delay is a sensitivity experiment, not measured production D1 RTT.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {performance} from 'node:perf_hooks';
import jpeg from 'jpeg-js';
import {BridgeEngine,hash,uid} from '../lib/bridge-engine.ts';
import {handleMcp} from '../lib/mcp-protocol.ts';
import {LiveFrameCache} from '../lib/live-frame-cache.ts';
import {voiceRuns} from '../lib/voice-bench.ts';

const baselineCommit='b1e8cebea8b00a07b7c00ba467f52f8a9bb47085';
const baselineSource=execFileSync('git',['show',baselineCommit+':lib/bridge-engine.ts'],{encoding:'utf8'});
const baselineStart=baselineSource.indexOf('  async metricsFor('),baselineEnd=baselineSource.indexOf('  frameMetadata(',baselineStart);
assert.ok(baselineStart>0&&baselineEnd>baselineStart);
// Execute the actual earlier read implementation on the identical synthetic DB.
// This is a local comparison only; no legacy route is added to the product.
const baselineClass=stripTypeScriptTypes('class BaselineMetrics {\n'+baselineSource.slice(baselineStart,baselineEnd)+'\n}');
const baselineMetricsFor=new Function(baselineClass+';return BaselineMetrics.prototype.metricsFor;')();

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Statement {
  constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}
  bind(...values){return new Statement(this.db,this.sql,values);}
  execute(mode){
    const q=this.db.raw.prepare(this.sql);
    if(mode==='batch')mode=q.columns().length>0?'all':'run';
    if(mode==='first')return q.get(...this.values)??null;
    if(mode==='all')return {results:q.all(...this.values),success:true,meta:{}};
    const r=q.run(...this.values);return {success:true,results:[],meta:{changes:Number(r.changes)}};
  }
  async first(){await this.db.gate(this.sql);return this.execute('first');}
  async all(){await this.db.gate(this.sql);return this.execute('all');}
  async run(){await this.db.gate(this.sql);return this.execute('run');}
}
class DB {
  raw=new DatabaseSync(':memory:');delay=0;requests=0;before=null;
  constructor(){for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())this.raw.exec(readFileSync('drizzle/'+f,'utf8'));}
  prepare(sql){return new Statement(this,sql);}
  async gate(sql){this.requests++;if(this.delay)await pause(this.delay);if(this.before)await this.before(sql,this.requests);}
  async batch(statements){
    await this.gate('BATCH');this.raw.exec('BEGIN IMMEDIATE');
    try{const r=statements.map(s=>s.execute('batch'));this.raw.exec('COMMIT');return r;}
    catch(e){this.raw.exec('ROLLBACK');throw e;}
  }
}
class Bucket {
  values=new Map();
  async put(key,value){this.values.set(key,new Uint8Array(value));}
  async get(key){const v=this.values.get(key);return v?{arrayBuffer:async()=>v.slice().buffer}:null;}
  async head(key){return this.values.has(key)?{key}:null;}
  async delete(keys){for(const key of typeof keys==='string'?[keys]:keys)this.values.delete(key);}
  async list({prefix}){return {objects:[...this.values.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))};}
}
const owner={id:'synthetic-mcp-perf-owner',label:'synthetic fixture'};
async function fixture(active=false,image=false){
  const db=new DB(),bucket=new Bucket();let now=Date.now();
  db.raw.function('julianday',()=>2440587.5+now/86400000);
  // No cache/scheduler: measure the cold inline read independently of global state.
  const service=new BridgeEngine({db,bucket,now:()=>now});
  const code=await service.createPairingCode(owner,'synthetic fixture','https://fixture.invalid');
  const pair=await service.redeem({pairing_code:code.pairing_code,name:'SYNTHETIC PHONE',request_id:uid()},'fixture');
  const actor=await service.authenticate(new Request('https://fixture.invalid/status',{headers:{Authorization:'Bearer '+pair.device_token}}));
  let session,meta;
  if(active){
    const broadcast=uid();session=await service.createSession(actor,{mode:'broadcast',broadcast_id:broadcast,request_id:uid(),control_enabled:false});
    const worker=uid(),claim=await service.claimWorker(actor,{bridge_session_id:session.bridge_session_id,broadcast_id:broadcast,worker_id:worker,worker_kind:'broadcast'});
    if(image){
      const clock=await service.clockProbe(actor),bytes=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,150)},70).data;
      meta={bridge_session_id:session.bridge_session_id,broadcast_id:broadcast,worker_id:worker,lease_epoch:claim.lease_epoch,frame_id:uid(),frame_seq:1,
        captured_at:new Date(now).toISOString(),capture_age_ms:0,capture_mono_ms:10000,width:16,height:32,native_width_px:1206,native_height_px:2622,
        orientation:'portrait',orientation_epoch:0,content_sha256:await hash(bytes),content_rect:{x:0,y:0,width:16,height:32},transform_version:'1',capture_clock_verified:true,
        provenance:'device_capture',sampling_reason:'initial',clock_probe_id:clock.clock_probe_id,capture_offset_ms:0,clock_rtt_ms:10};
      // Production schedules persistence and keeps the current inline JPEG. A
      // separate cold reader below must not inherit the uploader's RAM cache.
      const uploader=new BridgeEngine({db,bucket,now:()=>now,schedule:()=>{},cache:new LiveFrameCache(1024*1024,()=>now)});
      await uploader.acceptFrame(actor,meta,bytes);
    }
  }
  return {db,service,actor,session,meta,now:()=>now,tick:ms=>{now+=ms;}};
}
const cases=[
  {name:'initialize',method:'initialize',params:{protocolVersion:'2026-07-28'}},
  {name:'catalogue',method:'tools/list'},
  {name:'profile',tool:'get_profile'},
  {name:'devices_idle',tool:'list_devices'},
  {name:'devices_live',tool:'list_devices',active:true},
  {name:'mouse_idle_refusal',tool:'get_mouse_state'},
  {name:'mouse_live_no_board_refusal',tool:'get_mouse_state',active:true},
  {name:'metrics_history',tool:'get_screen_metrics',active:true,history:true},
  {name:'screen_offline',tool:'read_screen'},
  {name:'screen_live_missing',tool:'read_screen',active:true},
  {name:'screen_live_missing_no_wait',tool:'read_screen',active:true,noWait:true},
  {name:'screen_missing_then_upload',tool:'read_screen',active:true,image:true,missing:true,arrival:true},
  {name:'screen_fresh_inline',tool:'read_screen',active:true,image:true},
  {name:'screen_fresh_unchanged',tool:'read_screen',active:true,image:true,unchanged:true},
  {name:'screen_just_expired',tool:'read_screen',active:true,image:true,expired:true},
  {name:'screen_expired_then_upload',tool:'read_screen',active:true,image:true,expired:true,arrival:true},
  {name:'screen_after_confirmed',tool:'read_screen',active:true,image:true,after:9999,noWait:true},
  {name:'screen_after_equal',tool:'read_screen',active:true,image:true,after:10000,noWait:true},
  {name:'screen_after_wait_new',tool:'read_screen',active:true,image:true,after:10000,arrival:true},
  {name:'screen_after_legacy',tool:'read_screen',active:true,image:true,after:null,noWait:true},
  {name:'screen_after_unknown',tool:'read_screen',active:true,image:true,after:9999,afterState:'outcome_unknown',noWait:true},
];
const output=[],originalInfo=console.info;console.info=()=>{};
try{
  for(const delay of [0,180])for(const modern of [false,true])for(const scenario of cases.filter(s=>!process.argv[3]||s.name.startsWith(process.argv[3]))){
    const l=await fixture(scenario.active,scenario.image);
    if(scenario.history){
      // Fixed synthetic metadata size; not copied from a real screen or account.
      const detail={bridge_session_id:l.session.bridge_session_id,synthetic_fixture:true,padding:'x'.repeat(768)};
      const q=l.db.raw.prepare('INSERT INTO sb_metrics(id,owner_id,device_id,kind,bytes,duration_ms,created_at,detail_json) VALUES(?,?,?,?,0,10,?,?)');
      for(let n=0;n<300;n++)q.run(uid(),owner.id,l.actor.id,n%10===0?'upload_rejected':'upload',l.now()-300+n,JSON.stringify({...detail,frame_seq:n+1}));
      const baseline={...await baselineMetricsFor.call(l.service,owner,l.actor.id),voice_benchmark:await voiceRuns(l.service,owner,l.actor.id)};
      assert.deepEqual(await l.service.metricsFor(owner,l.actor.id),baseline,'Diagnostic payload must match the deployed baseline on the same fixture');
    }
    const args=scenario.tool?{device_id:l.actor.id}:{};
    if(scenario.tool==='get_profile'||scenario.tool==='list_devices')delete args.device_id;
    if(scenario.unchanged)args.if_unchanged_since=(await l.service.readScreen(owner,{device_id:l.actor.id},0,false)).image_ref;
    if(scenario.expired)l.tick(1650);
    if(scenario.noWait)args.wait_for_new_ms=0;
    if(Object.hasOwn(scenario,'after')){
      const id=uid(),control=l.db.raw.prepare('SELECT control_epoch FROM sb_sessions WHERE id=?').get(l.session.bridge_session_id).control_epoch;
      l.db.raw.prepare("INSERT INTO sb_mouse_commands(id,owner_id,device_id,session_id,hardware_id,board_boot_id,kind,payload,digest,idempotency_key,state,worker_id,lease_epoch,control_epoch,created_at,expires_at,phone_ack_mono_ms) VALUES(?,?,?,?,?,?,'pointer.click','{}','synthetic',?,?,?,?,?,?,?,?)").run(id,owner.id,l.actor.id,l.session.bridge_session_id,uid(),uid(),uid(),scenario.afterState??'board_acked',l.meta.worker_id,l.meta.lease_epoch,control,l.now(),l.now()+5000,scenario.after);
      args.after_command_id=id;
    }
    const frameTemplate=scenario.missing?l.db.raw.prepare('SELECT * FROM sb_frames WHERE device_id=?').get(l.actor.id):null;
    const samples=[];
    for(let n=0;n<3;n++){
      if(scenario.missing)l.db.raw.prepare('DELETE FROM sb_frames WHERE device_id=?').run(l.actor.id);
      if(scenario.expired)l.db.raw.prepare('UPDATE sb_frames SET capture_lower=?,expires_at=?').run(l.now()-1700,l.now()+5000);
      if(Object.hasOwn(scenario,'after'))l.db.raw.prepare('UPDATE sb_frames SET metadata=?').run(JSON.stringify(l.meta));
      l.db.requests=0;l.db.delay=delay;
      l.db.before=scenario.arrival?async(sql,count)=>{if(count===2&&sql.startsWith('WITH candidates')){
        // Synthetic second capture of a static scene: distinct capture identity,
        // same encoded fixture pixels. Never used as real freshness evidence.
        const next={...l.meta,frame_id:uid(),frame_seq:2,capture_mono_ms:11600,capture_offset_ms:1600,captured_at:new Date(l.now()-50).toISOString()};
        if(scenario.missing){
          const row={...frameTemplate,capture_lower:l.now()-100,frame_seq:next.frame_seq,frame_id:next.frame_id,metadata:JSON.stringify(next)};
          l.db.raw.prepare('INSERT INTO sb_frames('+Object.keys(row).join(',')+') VALUES('+Object.keys(row).map(()=>'?').join(',')+')').run(...Object.values(row));
        }else l.db.raw.prepare('UPDATE sb_frames SET capture_lower=?,frame_seq=?,frame_id=?,metadata=?').run(l.now()-100,next.frame_seq,next.frame_id,JSON.stringify(next));
      }}:null;
      const changesBefore=l.db.raw.prepare('SELECT total_changes() n').get().n;
      const logs=[],body={jsonrpc:'2.0',id:1,method:scenario.method??'tools/call',params:scenario.method==='initialize'?{protocolVersion:modern?'2026-07-28':'2025-11-25'}:scenario.params??{name:scenario.tool,arguments:args}};
      const start=performance.now();
      const response=await handleMcp(new Request('https://fixture.invalid/mcp',{method:'POST',headers:{'Content-Type':'application/json',...(modern?{'MCP-Protocol-Version':'2026-07-28'}:{})},body:JSON.stringify(body)}),
        {engine:()=>l.service,caller:()=>owner,origin:'https://fixture.invalid',performance:{log:value=>logs.push(value)}});
      const bytes=await response.arrayBuffer(),elapsed=performance.now()-start,rpc=JSON.parse(new TextDecoder().decode(bytes)),result=rpc.result,summary=result.structuredContent;
      const trace=logs.at(-1),screenTrace=result._meta?.sayso_trace;
      const changes=l.db.raw.prepare('SELECT total_changes() n').get().n-changesBefore;
      assert.equal(l.db.requests,trace.metrics.d1?.calls??0);
      if(scenario.name.startsWith('mouse_'))assert.equal(summary.error,'START_MOUSE_SHARING');
      else assert.notEqual(result.isError,true,scenario.name+': '+JSON.stringify(summary));
      if(scenario.name.startsWith('devices_'))assert.equal(summary.devices.length,1);
      if(scenario.history){assert.equal(summary.capture_session_history.total_rows,300);assert.equal(summary.capture_session_history.returned_rows,256);assert.equal(summary.capture_session_history.truncated,true);}
      if(scenario.tool==='read_screen')assert.equal(changes,scenario.arrival?1:0,'Pure read must not write; arrival is injected fixture upload only');
      if(scenario.name==='screen_fresh_inline'||scenario.arrival)assert.equal(result.content.filter(x=>x.type==='image').length,1,JSON.stringify({scenario:scenario.name,summary,screenTrace}));
      if(scenario.unchanged)assert.equal(summary.state,'unchanged');
      if(scenario.name==='screen_live_missing'){assert.ok(l.db.requests>=2);assert.equal(screenTrace.termination,'timeout');}
      if(scenario.noWait)assert.equal(l.db.requests,1);
      samples.push({elapsed_ms:elapsed,wire_bytes:bytes.byteLength,structured_bytes:summary?Buffer.byteLength(JSON.stringify(summary)):0,
        text_bytes:(result.content??[]).filter(x=>x.type==='text').reduce((sum,x)=>sum+Buffer.byteLength(x.text),0),image_blocks:(result.content??[]).filter(x=>x.type==='image').length,
        state:summary?.state??null,error:summary?.error??null,is_error:result.isError??false,d1_calls:trace.metrics.d1?.calls??0,d1_sum_ms:trace.metrics.d1?.sum_ms??0,
        server_ms:trace.server_elapsed_ms,read_retry_count:screenTrace?.retry_count??null,read_lookups:screenTrace?.lookups??null,synthetic_command_fixture:Object.hasOwn(scenario,'after'),capture_relation:summary?.after_command?.relation??null,app_effect_observed:summary?.after_command?.app_effect_observed??null,synthetic_arrival_writes:scenario.arrival?1:0});
    }
    output.push({scenario:scenario.name,protocol:modern?'2026-07-28':'legacy',injected_d1_delay_ms:delay,...(scenario.history?{semantic_parity_with_baseline:true}:{}),samples});l.db.raw.close();
  }
}finally{console.info=originalInfo;}
const report={schema:'sayso.mcp_local_matrix.v1',generated_at:new Date().toISOString(),source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source_dirty_paths:execFileSync('git',['status','--short'],{encoding:'utf8'}).trim().split('\n'),baseline_commit:baselineCommit,synthetic_fixture:true,
  fixture_clock:'frozen except explicit expiry; isolates read logic, not real capture age under WAN delay',samples_per_case:3,results:output,
  limits:['Real handlers with in-memory SQLite and no phone; not production network, Worker CPU or native connector timing.','180ms per D1 request is an injected sensitivity, not a measured D1 RTT.','Metrics rows have fixed synthetic padding; response size is a workload experiment.','Upload arrival is a single injected fixture update before the second read, not a production upload benchmark.','After-command cases insert synthetic acknowledged command rows only to time read logic; no physical input or provenance is proven.','No model API, account text, real images, tokens or raw result payloads saved.'],three_second_goal_verified:false};
const path=process.argv[2]??'../../evidence/mcp-local-matrix-20261102.json';writeFileSync(path,JSON.stringify(report,null,2)+'\n');
const median=values=>values.toSorted((a,b)=>a-b)[Math.floor(values.length/2)];
console.log(JSON.stringify({path,cases:output.length,calls:output.reduce((s,x)=>s+x.samples.length,0),summary:output.filter(x=>x.protocol==='2026-07-28').map(x=>({scenario:x.scenario,delay:x.injected_d1_delay_ms,median_ms:Math.round(median(x.samples.map(s=>s.elapsed_ms))),d1_calls:x.samples[0].d1_calls,bytes:x.samples[0].wire_bytes,state:x.samples[0].state,error:x.samples[0].error}))}));
