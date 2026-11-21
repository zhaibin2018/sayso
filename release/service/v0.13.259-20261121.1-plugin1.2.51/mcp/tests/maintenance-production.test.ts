import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('L04 production profile hard-disables optional writers and stores only typed numeric metrics',()=>{
  const script=`
    globalThis.__SAYSO_DIAGNOSTICS__=false;
    const {DB,Bucket}=await import('./tests/fixtures/retention.ts');
    const {BridgeEngine}=await import('./lib/bridge-engine.ts');
    const {LEDControl}=await import('./lib/led-control.ts');
    const {voiceBenchmark}=await import('./lib/voice-bench.ts');
    const {runMaintenance}=await import('./lib/retention-maintenance.ts');
    const {observeD1Placement}=await import('./lib/d1-placement.ts');
    const db=new DB(),bucket=new Bucket(),service=new BridgeEngine({db,bucket,browseEnabled:true,now:()=>2000000000});
    if(service.browseEnabled)throw Error('browse writer enabled');
    for(const action of [()=>new LEDControl(service).createSession({},{}),()=>voiceBenchmark(service,{id:'o'},{action:'start'})]){
      let denied=false;try{await action();}catch(e){denied=e.code==='DIAGNOSTICS_DISABLED';}if(!denied)throw Error('diagnostic writer enabled');
    }
    await service.stmt("INSERT INTO sb_metrics(id,owner_id,device_id,kind,bytes,duration_ms,created_at,detail_json) VALUES('m','o','d','upload',10,1,2000000000,?)",'{"private":"content"}').run();
    if(db.raw.prepare('SELECT detail_json FROM sb_metrics').get().detail_json!==null)throw Error('content stored');
    observeD1Placement(db,{meta:{served_by_region:'APAC',served_by_colo:'SIN',served_by_primary:true,query:'SECRET_SQL',device_id:'PRIVATE_DEVICE'}},2000000000);
    await service.batch([service.stmt("INSERT INTO sb_metrics(id,owner_id,device_id,kind,bytes,duration_ms,created_at,detail_json) VALUES('m2','o','d','upload',10,1,2000000000,?)",'{"private":"content"}')]);
    if(db.raw.prepare("SELECT detail_json FROM sb_metrics WHERE id='m2'").get().detail_json!==null)throw Error('content stored with placement');
    const location=JSON.parse(db.raw.prepare('SELECT d1_placement_json FROM sb_maintenance_state').get().d1_placement_json);
    if(JSON.stringify(location)!==JSON.stringify({served_by_region:'APAC',served_by_colo:'SIN',served_by_primary:true,recorded_at_ms:2000000000}))throw Error('placement allowlist failed');
    const id=crypto.randomUUID();
    db.raw.prepare("INSERT INTO sb_erasure_jobs(id,scope,owner_id,device_id,state,requested_at,updated_at) VALUES(?,'device','o','d','requested',1,1)").run(id);
    db.raw.prepare('DROP TRIGGER sb_metrics_erasure_update').run();
    db.raw.prepare("UPDATE sb_metrics SET detail_json='legacy-content'").run();
    // Re-create the exact frozen trigger to verify privacy-only retirement under a fence.
    const fs=await import('node:fs');const sql=fs.readFileSync('drizzle/0031_resumable_erasure.sql','utf8');
    const trigger=sql.split(';').find(s=>s.includes('CREATE TRIGGER sb_metrics_erasure_update'));
    db.raw.exec(trigger+'; END;');
    await runMaintenance(db,bucket,'owner',()=>2000000000);
    if(db.raw.prepare('SELECT detail_json FROM sb_metrics').get()?.detail_json!=null)throw Error('fenced legacy metric blocked TTL');
    console.log('production profile passed');
  `;
  const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
