// Real handlers, isolated synthetic device/receipt/image. No network or hardware.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import jpeg from 'jpeg-js';
import {BridgeEngine,uid,hash} from '../lib/bridge-engine.ts';
import {MouseControl} from '../lib/mouse-control.ts';
import {LEDControl} from '../lib/led-control.ts';
import {LiveFrameCache} from '../lib/live-frame-cache.ts';
import {handleMcp} from '../lib/mcp-protocol.ts';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
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
  constructor(){for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())this.raw.exec(readFileSync('drizzle/'+f,'utf8'));}
  prepare(sql){return new Statement(this,sql);}
  async gate(){this.requests++;if(this.delay)await pause(this.delay);}
  async batch(statements){await this.gate();this.raw.exec('BEGIN IMMEDIATE');try{const v=statements.map(s=>s.execute('batch'));this.raw.exec('COMMIT');return v;}catch(e){this.raw.exec('ROLLBACK');throw e;}}
}
class Bucket{
  values=new Map();async put(k,v){this.values.set(k,new Uint8Array(v));}
  async get(k){const v=this.values.get(k);return v?{arrayBuffer:async()=>v.slice().buffer}:null;}
  async head(k){return this.values.has(k)?{key:k}:null;}
  async delete(keys){for(const k of typeof keys==='string'?[keys]:keys)this.values.delete(k);}
  async list({prefix}){return {objects:[...this.values.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}
}
const owner={id:'synthetic-write-observe-owner',label:'synthetic fixture'},originalInfo=console.info;
const pixels=jpeg.encode({width:16,height:32,data:Buffer.alloc(16*32*4,150)},70).data;
async function fixture(){
  const db=new DB(),bucket=new Bucket(),now=Date.now();db.raw.function('julianday',()=>2440587.5+now/86400000);
  const service=new BridgeEngine({db,bucket,now:()=>now}),code=await service.createPairingCode(owner,'fixture','https://fixture.invalid');
  const pair=await service.redeem({pairing_code:code.pairing_code,name:'SYNTHETIC PHONE',request_id:uid()},'fixture');
  const actor=await service.authenticate(new Request('https://fixture.invalid/status',{headers:{Authorization:'Bearer '+pair.device_token}}));
  const broadcast=uid(),session=await service.createSession(actor,{mode:'broadcast',broadcast_id:broadcast,request_id:uid(),control_enabled:false}),worker=uid();
  const claim=await service.claimWorker(actor,{bridge_session_id:session.bridge_session_id,broadcast_id:broadcast,worker_id:worker,worker_kind:'broadcast'});
  const identity={bridge_session_id:session.bridge_session_id,broadcast_id:broadcast,worker_id:worker,lease_epoch:claim.lease_epoch};
  const hardware={hardware_id:uid(),board_boot_id:uid(),protocol_version:'1.0',descriptor_version:'synthetic-fixture',transport:'usb_ncm',capabilities:{'led.set':true,'hid.mouse.click':true},led_config:{type:'software_fixture'},lease_epoch_floor:0};
  await new LEDControl(service).bind(actor,hardware);
  const beat={...identity,capture_state:'active',usb_connected:true,board_boot_id:hardware.board_boot_id,mouse_relay_enabled:true};
  await service.heartbeat(actor,beat);const mouse=new MouseControl(service);
  await mouse.grant(actor,{bridge_session_id:session.bridge_session_id,control_enabled:true,request_id:uid()});
  const key=uid(),command=await mouse.enqueue(owner,'pointer.click',{idempotency_key:key,wait_ms:0});
  await mouse.claim(actor,identity,0);await mouse.start(actor,command.command_id,{...identity,control_epoch:command.control_epoch});
  // Software receipt only. No board transport, event, cursor or actual click.
  await mouse.result(actor,command.command_id,{...identity,state:'board_acked',board_receipt:{command_id:command.command_id,board_boot_id:hardware.board_boot_id,state:'executed',effect:{hid_reports_sent:true}},finished_client_mono_ms:10000});
  const probe=await service.clockProbe(actor),meta={...identity,frame_id:uid(),frame_seq:1,captured_at:new Date(now+1).toISOString(),capture_age_ms:0,capture_mono_ms:10001,width:16,height:32,native_width_px:1206,native_height_px:2622,orientation:'portrait',orientation_epoch:0,content_sha256:await hash(pixels),content_rect:{x:0,y:0,width:16,height:32},transform_version:'1',capture_clock_verified:true,provenance:'device_capture',sampling_reason:'initial',clock_probe_id:probe.clock_probe_id,capture_offset_ms:1,clock_rtt_ms:10};
  await new BridgeEngine({db,bucket,now:()=>now,schedule:()=>{},cache:new LiveFrameCache(1024*1024,()=>now)}).acceptFrame(actor,meta,pixels);
  return {db,service,key,command};
}
const results=[];console.info=()=>{};
try{
  for(const delay of [0,180])for(const overhead of [0,400])for(let round=0;round<3;round++)for(const strategy of round%2?['combined','separate']:['separate','combined']){
    const l=await fixture();l.db.requests=0;l.db.delay=delay;const calls=[];
    const invoke=async(name,args)=>{
      if(overhead)await pause(overhead);
      const logs=[],response=await handleMcp(new Request('https://fixture.invalid/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{engine:()=>l.service,caller:()=>owner,origin:'https://fixture.invalid',performance:{log:v=>logs.push(v)}});
      const bytes=await response.arrayBuffer(),result=JSON.parse(new TextDecoder().decode(bytes)).result;
      assert.equal(result.isError,false);calls.push({tool:name,d1_calls:logs.at(-1).metrics.d1?.calls??0,wire_bytes:bytes.byteLength,image_blocks:result.content.filter(x=>x.type==='image').length});return result;
    };
    const start=performance.now();
    const input=await invoke('click_mouse',{idempotency_key:l.key,wait_ms:2000,...(strategy==='separate'?{observe_after:false}:{})});
    assert.equal(input.structuredContent.state,'board_acked');
    const screen=strategy==='separate'?await invoke('read_screen',{after_command_id:l.command.command_id,max_age_ms:1499}):input;
    assert.equal(screen.content.filter(x=>x.type==='image').length,1);
    assert.equal(strategy==='separate'?screen.structuredContent.after_command.app_effect_observed:screen.structuredContent.after_screen.app_effect_observed,false);
    const elapsed=performance.now()-start;
    assert.equal(l.db.requests,3);assert.equal(l.db.raw.prepare('SELECT count(*) n FROM sb_mouse_commands').get().n,1);
    results.push({strategy,injected_d1_delay_ms:delay,injected_per_rpc_overhead_ms:overhead,round,elapsed_ms:elapsed,rpc_calls:calls.length,d1_calls:l.db.requests,wire_bytes:calls.reduce((s,x)=>s+x.wire_bytes,0),image_blocks:calls.reduce((s,x)=>s+x.image_blocks,0),input_rows:1});l.db.raw.close();
  }
}finally{console.info=originalInfo;}
const report={schema:'sayso.write_observe_local_benchmark.v1',synthetic_fixture:true,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),results,
  limits:['In-memory SQLite and synthetic acknowledged input/image; no real device, input effect or provenance is proven.','The call reuses a recorded synthetic idempotency key; it measures receipt/post-image packaging, not initial phone delivery.','180ms storage delay and400ms per-RPC overhead are sensitivity inputs, not measured production constants.','Fixture clock is frozen; no production freshness or end-to-end3s claim.','No image payload, tokens or raw receipts are saved.'],three_second_goal_verified:false};
writeFileSync('../../evidence/write-after71-local-benchmark-20261103.json',JSON.stringify(report,null,2)+'\n');
const median=v=>v.toSorted((a,b)=>a-b)[Math.floor(v.length/2)];
console.log(JSON.stringify({cases:results.length,summary:[...new Set(results.map(x=>[x.injected_d1_delay_ms,x.injected_per_rpc_overhead_ms].join(':')))].flatMap(k=>['separate','combined'].map(strategy=>{const rows=results.filter(x=>x.strategy===strategy&&[x.injected_d1_delay_ms,x.injected_per_rpc_overhead_ms].join(':')===k);return {injection:k,strategy,median_ms:Math.round(median(rows.map(x=>x.elapsed_ms))),rpc_calls:rows[0].rpc_calls,d1_calls:rows[0].d1_calls,wire_bytes:rows[0].wire_bytes};}))}));
