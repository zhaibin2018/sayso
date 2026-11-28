// Local synthetic numeric database only. Not a production latency success test.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';

const files=readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort();
const now=Date.now(),cutoff=now-86400000,count=50000;
const results=[];
for(const indexed of [false,true]) {
  const db=new DatabaseSync(':memory:');
  for(const file of files)if(indexed||!file.startsWith('0015_'))db.exec(readFileSync('drizzle/'+file,'utf8'));
  const metric=db.prepare("INSERT INTO sb_metrics(id,owner_id,device_id,kind,bytes,duration_ms,created_at,detail_json) VALUES(?,'synthetic-owner','synthetic-device','synthetic',0,1,?,?)");
  const observation=db.prepare("INSERT INTO sb_observations(id,device_id,frame_id,created_at) VALUES(?,'synthetic-device',?,?)");
  const detail=JSON.stringify({synthetic_fixture:true,padding:'x'.repeat(1536)}),insertStarted=performance.now();
  db.exec('BEGIN');
  for(let n=0;n<count;n++) {
    const time=n%1000===0?cutoff-1:cutoff+1000+n;
    metric.run('metric-'+n,time,detail);observation.run('observation-'+n,'frame-'+n,time);
  }
  db.exec('COMMIT');const insertMS=performance.now()-insertStarted;
  const queries=[];
  for(const table of ['sb_metrics','sb_observations']) {
    const sql=`DELETE FROM ${table} WHERE created_at<?`,plan=db.prepare('EXPLAIN QUERY PLAN '+sql).all(cutoff);
    const started=performance.now(),removed=db.prepare(sql).run(cutoff).changes,firstMS=performance.now()-started;
    const emptyPasses=[];
    for(let i=0;i<5;i++){const start=performance.now();db.prepare(sql).run(cutoff);emptyPasses.push(performance.now()-start);}
    const remaining=db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
    if(removed!==50||remaining!==49950)throw Error('Retention semantics changed');
    queries.push({table,plan,removed,remaining,first_prune_ms:firstMS,no_expired_rows_ms:emptyPasses});
  }
  results.push({indexed,rows_per_table:count,insert_ms:insertMS,queries});db.close();
}
const report={schema:'sayso.retention_index_local_benchmark.v1',synthetic_fixture:true,storage:'in_memory_sqlite',
  results,limits:['Local synthetic CPU measurements, not D1 WAN timing or proof of the observed1.4s production stall.','Includes an insertion-cost comparison; the additional indexes also have a write cost.'],three_second_goal_verified:false};
writeFileSync('../../evidence/retention-index65-local-benchmark-20261102.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
