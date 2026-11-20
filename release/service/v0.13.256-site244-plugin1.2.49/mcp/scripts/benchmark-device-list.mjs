// Actual MCP/SQL handlers on synthetic metadata only. No device or network.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {BridgeEngine,need,iso,uid} from '../lib/bridge-engine.ts';
import {handleMcp} from '../lib/mcp-protocol.ts';

const baselineCommit='29ef97da843964f4de9539e4fe7ad34926064928';
const old=execFileSync('git',['show',baselineCommit+':lib/bridge-engine.ts'],{encoding:'utf8'});
const start=old.indexOf('  async listDevices('),end=old.indexOf('  async createSession(',start);
assert.ok(start>0&&end>start);
const code=stripTypeScriptTypes('class EarlierDeviceList {\n'+old.slice(start,end)+'\n}');
const earlier=new Function('need','iso',code+';return EarlierDeviceList.prototype;')(need,iso);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Statement{
  constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}
  bind(...values){return new Statement(this.db,this.sql,values);}
  async all(){await this.db.gate();return {results:this.db.raw.prepare(this.sql).all(...this.values)};}
  async first(){await this.db.gate();return this.db.raw.prepare(this.sql).get(...this.values)??null;}
}
class DB{
  raw=new DatabaseSync(':memory:');requests=0;delay=0;
  constructor(){for(const f of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())this.raw.exec(readFileSync('drizzle/'+f,'utf8'));}
  prepare(sql){return new Statement(this,sql);}
  async gate(){this.requests++;if(this.delay)await pause(this.delay);}
}
const owner={id:'synthetic-device-owner',label:'fixture'};
function fixture(count,active){
  const db=new DB(),now=Date.now();
  for(let i=0;i<count;i++){
    const device=uid(),session=uid();
    db.raw.prepare('INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,created_at,current_session,worker_expires,last_seen) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(device,owner.id,'synthetic-phone-'+i,'not-a-token-'+i,now+60000,now+i,active?session:null,active?now+60000:0,active?now:0);
    if(active){
      db.raw.prepare("INSERT INTO sb_sessions(id,owner_id,device_id,broadcast_id,request_id,body_hash,state,capture_state,created_at,mouse_enabled,mouse_until) VALUES(?,?,?,?,?,?,'active','active',?,1,?)")
        .run(session,owner.id,device,uid(),uid(),'synthetic',now,now+60000);
      db.raw.prepare('INSERT INTO sb_hardware(device_id,owner_id,hardware_id,board_boot_id,metadata,usb_connected) VALUES(?,?,?,?,?,1)')
        .run(device,owner.id,uid(),uid(),JSON.stringify({capabilities:{'hid.mouse.click':true,'hid.mouse.relative':true,'hid.keyboard':false}}));
      db.raw.prepare('INSERT INTO sb_frames(device_id,owner_id,session_id,frame_id,frame_seq,lease_epoch,image_key,sha256,metadata,capture_lower,received_at,expires_at) VALUES(?,?,?,?,1,1,?,?,?,?,?,?)')
        .run(device,owner.id,session,uid(),'no-image-stored','synthetic',JSON.stringify({width:16,height:32,provenance:'synthetic_metadata_only'}),now-100,now,now+10000);
    }
  }
  const current=new BridgeEngine({db,bucket:{},now:()=>now});
  const previous=Object.create(current);previous.status=earlier.status;previous.listDevices=earlier.listDevices;
  return {db,current,previous};
}
const samples=[];
for(const [count,active] of [[0,false],[1,false],[1,true],[20,true]])for(const delay of [0,180]){
  const f=fixture(count,active);f.db.delay=delay;
  const changes=f.db.raw.prepare('SELECT total_changes() n').get().n;
  for(let round=0;round<3;round++){
    let baseline;
    // Alternate order so warm SQLite work is not assigned to one strategy.
    const order=round%2?['current','previous']:['previous','current'];
    for(const strategy of order){
      f.db.requests=0;const logs=[],start=performance.now();
      const response=await handleMcp(new Request('https://fixture.invalid/mcp',{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2026-07-28'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_devices',arguments:{}}})}),{engine:()=>f[strategy],caller:()=>owner,origin:'https://fixture.invalid',performance:{log:x=>logs.push(x)}});
      const bytes=await response.arrayBuffer(),elapsed=performance.now()-start,result=JSON.parse(new TextDecoder().decode(bytes)).result;
      assert.equal(result.isError,false);assert.equal(result.structuredContent.devices.length,count);
      assert.equal(result.content.filter(x=>x.type==='image').length,0);
      if(baseline)assert.deepEqual(result.structuredContent.devices,baseline);else baseline=result.structuredContent.devices;
      const expected=strategy==='current'?1:1+count*(active?5:4);
      assert.equal(f.db.requests,expected);assert.equal(logs.at(-1).metrics.d1.calls,expected);
      assert.equal(f.db.raw.prepare('SELECT total_changes() n').get().n,changes);
      samples.push({strategy,devices:count,active,injected_per_d1_request_ms:delay,round,elapsed_ms:elapsed,d1_calls:f.db.requests,wire_bytes:bytes.byteLength,semantics_equal:true,image_blocks:0});
    }
  }
  f.db.raw.close();
}
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const report={schema:'sayso.device_list_benchmark.v1',synthetic_metadata_only:true,baseline_source_commit:baselineCommit,
  candidate_source_sha256:Object.fromEntries(['lib/bridge-engine.ts','lib/mcp-protocol.ts','scripts/benchmark-device-list.mjs'].map(p=>[p,hash(p)])),samples,
  limitations:['180ms perD1 request is injected, not a measured production latency.','Earlier multi-device status reads are parallel across devices;101 requests never means101 serial waits.','No actual phone/HID/screenshot/modelAPI/network calls.','Semantic parity applies to these fixture states; owner/revocation/expiry cases are separate regressions.'],real_taobao_intervals:0,goal_achieved:false};
const path=process.argv[2]??'../../evidence/device72-local-benchmark-20261103.json';writeFileSync(path,JSON.stringify(report,null,2)+'\n');
const median=v=>v.toSorted((a,b)=>a-b)[Math.floor(v.length/2)];
console.log(JSON.stringify({path,calls:samples.length,summary:[...new Set(samples.map(x=>[x.devices,x.active,x.injected_per_d1_request_ms].join(':')))].map(key=>({case:key,...Object.fromEntries(['previous','current'].map(strategy=>{const rows=samples.filter(x=>x.strategy===strategy&&[x.devices,x.active,x.injected_per_d1_request_ms].join(':')===key);return [strategy,{median_ms:Math.round(median(rows.map(x=>x.elapsed_ms))),d1_calls:rows[0].d1_calls,wire_bytes:rows[0].wire_bytes}];}))}))}));
