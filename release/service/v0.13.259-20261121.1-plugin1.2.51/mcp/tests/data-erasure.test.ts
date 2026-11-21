import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { DataErasure } from "../lib/data-erasure.ts";
import { erasureTables } from "../lib/erasure-catalog.ts";
import { erasureAwareBucket } from "../lib/erasure-storage.ts";
import { retentionPage } from "../lib/retention-page.ts";

// Every database in this file is a new :memory: database; no existing fixtures are opened.
class DB {
  raw = new DatabaseSync(":memory:");
  constructor() { for (const file of readdirSync("drizzle").filter(f=>f.endsWith(".sql")).sort()) this.raw.exec(readFileSync("drizzle/"+file,"utf8")); }
  prepare(sql: string) {
    let values: unknown[] = [];
    const execute = () => {
      const query = this.raw.prepare(sql);
      if (query.columns().length) return { success: true, results: query.all(...values as []), meta: { changes: Number(this.raw.prepare("SELECT changes() AS n").get()!.n) } };
      return { success: true, results: [], meta: { changes: Number(query.run(...values as []).changes) } };
    };
    const stmt = { bind: (...args: unknown[]) => { values = args; return stmt; },
      first: async <T>() => execute().results[0] as T ?? null,
      all: async <T>() => execute() as unknown as D1Result<T>, run: async () => execute(), execute };
    return stmt;
  }
  async batch(statements: ReturnType<DB["prepare"]>[]) {
    this.raw.exec("BEGIN IMMEDIATE");
    try { const result = statements.map(s=>s.execute()); this.raw.exec("COMMIT"); return result; }
    catch (error) { this.raw.exec("ROLLBACK"); throw error; }
  }
}
class Bucket {
  values = new Map<string, Uint8Array>(); sizes: number[] = []; fail = false;
  async put(key: string, data: Uint8Array) { this.values.set(key,data); }
  async delete(keys: string | string[]) { if(this.fail)throw Error("synthetic failure"); for(const key of typeof keys==="string"?[keys]:keys)this.values.delete(key); }
  async list({prefix,limit,cursor}:{prefix:string;limit:number;cursor?:string}) {
    const keys=[...this.values.keys()].filter(k=>k.startsWith(prefix)&&(!cursor||k>cursor)).sort(), selected=keys.slice(0,limit);
    this.sizes.push(selected.length);return {objects:selected.map(key=>({key})),truncated:keys.length>limit,cursor:selected.at(-1)};
  }
}
function fixture() {
  const db=new DB(),bucket=new Bucket();let now=100000;
  return {db,bucket,jobs:new DataErasure(db as unknown as D1Database,bucket as unknown as R2Bucket,()=>now),tick:(ms:number)=>now+=ms,now:()=>now};
}
const identity=()=>({owner:crypto.randomUUID(),device:crypto.randomUUID(),session:crypto.randomUUID(),run:crypto.randomUUID()});
function seed(db:DB,who:ReturnType<typeof identity>) {
  for(const table of [...erasureTables].reverse()) {
    const fields=db.raw.prepare(`PRAGMA table_info(${table})`).all();
    const values=fields.map(f=>{
      const name=String(f.name);
      if(name==="owner_id")return who.owner;
      if(name==="device_id"||table==="sb_devices"&&name==="id")return who.device;
      if(name==="session_id"||table==="sb_sessions"&&name==="id")return who.session;
      if(name==="run_id"||table==="sb_browse_runs"&&name==="id")return who.run;
      if(name==="state")return table.includes("commands")?"queued":"active";
      if(name==="kind")return "mouse.move";
      if(name==="payload")return "{}";
      if(name==="current_session")return who.session;
      if(name==="expires_at"||name==="token_expires")return 999999;
      if(name==="id"&&String(f.type)==="INTEGER")return null;
      if(f.dflt_value!==null)return typeof f.dflt_value==="string"&&/^\d+$/.test(f.dflt_value)?Number(f.dflt_value):String(f.dflt_value).replace(/^'|'$/g,"");
      if(Number(f.notnull)===0)return null;
      return String(f.type).includes("text")||String(f.type).toUpperCase()==="TEXT"?crypto.randomUUID():1;
    });
    db.raw.prepare(`INSERT INTO ${table}(${fields.map(f=>f.name).join(",")}) VALUES(${values.map(()=>"?").join(",")})`).run(...values);
  }
}
async function finish(jobs:DataErasure,id:string,maximum=200) {
  let previous=await jobs.status(id);
  for(let i=0;i<maximum;i++){
    const job=await jobs.advance(id);
    assert.ok(job.deleted_rows-previous.deleted_rows<=100,"D1 deletion page exceeded its row bound");
    assert.ok(job.deleted_objects-previous.deleted_objects<=100,"R2 deletion page exceeded its object bound");
    if(job.state==="failed"||job.state==="complete")return job;previous=job;
  }
  return jobs.status(id);
}
test("L04 catalog covers every baseline D1 table and both R2 writer families",()=>{
  const f=fixture(),tables=f.db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sb_%' AND name NOT IN ('sb_erasure_jobs','sb_storage_writes','sb_maintenance_state','sb_maintenance_runs')").all().map(r=>r.name).sort();
  assert.deepEqual(tables,[...erasureTables].sort());
  for(const path of ["lib/bridge-engine.ts","lib/browse-control.ts"])assert.match(readFileSync(path,"utf8"),/this\.(?:e\.)?bucket\.put/);
  assert.match(readFileSync("lib/bridge-engine.ts","utf8"),/this.bucket = erasureAwareBucket/);
});
test("L04 device: all related D1 rows, paged R2, resume in a new worker, permanent replay fence",async()=>{
  const f=fixture(),a=identity(),b=identity();seed(f.db,a);seed(f.db,b);
  for(let i=0;i<451;i++)f.db.raw.prepare("INSERT INTO sb_observations(id,device_id,frame_id,created_at) VALUES(?,?,?,?)")
    .run(crypto.randomUUID(),a.device,crypto.randomUUID(),f.now());
  for(let i=0;i<451;i++)f.bucket.values.set(`screens/${a.owner}/${a.device}/${a.session}/${String(i).padStart(4,"0")}.jpg`,new Uint8Array([1]));
  f.bucket.values.set(`browse/${a.owner}/${a.device}/${a.run}/frame.jpg`,new Uint8Array([1]));
  const keep=`screens/${b.owner}/${b.device}/${b.session}/keep.jpg`;f.bucket.values.set(keep,new Uint8Array([1]));
  const input={id:crypto.randomUUID(),scope:"device" as const,...{owner:a.owner,device:a.device}};
  assert.equal((await f.jobs.request(input)).state,"requested");
  assert.equal(f.db.raw.prepare("SELECT revoked FROM sb_devices WHERE id=?").get(a.device)!.revoked,1);
  assert.equal((await f.jobs.advance(input.id)).state,"partial");
  const resumed=new DataErasure(f.db as unknown as D1Database,f.bucket as unknown as R2Bucket,f.now);
  const result=await finish(resumed,input.id);assert.equal(result.state,"complete");assert.equal(result.deleted_objects,452);
  assert.deepEqual([...f.bucket.values.keys()],[keep]);assert.ok(f.bucket.sizes.every(n=>n<=100));
  for(const table of erasureTables.filter(t=>!["sb_rate_windows","sb_timing_journal"].includes(t)))assert.equal(f.db.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n,1,table);
  assert.throws(()=>seed(f.db,a),/ERASURE_SCOPE_CLOSED/);
  assert.equal((await f.jobs.request(input)).state,"complete");
  await assert.rejects(f.jobs.request({...input,scope:"site",owner:undefined,device:undefined}),/CONFLICT/);
});
test("L04 site clears all owners, global diagnostics, and old credentials; keeps only safety metadata",async()=>{
  const f=fixture();seed(f.db,identity());seed(f.db,identity());
  const id=crypto.randomUUID();await f.jobs.request({id,scope:"site"});
  assert.equal((await finish(f.jobs,id)).state,"complete");
  for(const table of erasureTables)assert.equal(f.db.raw.prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
  assert.throws(()=>seed(f.db,identity()),/ERASURE_SCOPE_CLOSED/);
});
test("L04 sharing clears only this session's pictures/OCR and keeps paired device usable",async()=>{
  const f=fixture(),a=identity(),b=identity();seed(f.db,a);seed(f.db,b);
  const old=`screens/${a.owner}/${a.device}/${a.session}/old.jpg`,browse=`browse/${a.owner}/${a.device}/${a.run}/old.jpg`,other=`screens/${b.owner}/${b.device}/${b.session}/keep.jpg`;
  for(const key of [old,browse,other])f.bucket.values.set(key,new Uint8Array([1]));
  const id=crypto.randomUUID();await f.jobs.request({id,scope:"sharing",owner:a.owner,device:a.device,session:a.session});
  assert.equal((await finish(f.jobs,id)).state,"complete");assert.deepEqual([...f.bucket.values.keys()],[other]);
  assert.equal(f.db.raw.prepare("SELECT revoked FROM sb_devices WHERE id=?").get(a.device)!.revoked,0);
  assert.equal(f.db.raw.prepare("SELECT blocked FROM sb_sessions WHERE id=?").get(a.session)!.blocked,1);
  assert.equal(f.db.raw.prepare("SELECT evidence FROM sb_browse_journal WHERE run_id=?").get(a.run)!.evidence,"{}");
  assert.equal(f.db.raw.prepare("SELECT precondition FROM sb_mouse_commands WHERE device_id=?").get(a.device)!.precondition,null);
  const writer=erasureAwareBucket(f.db as unknown as D1Database,f.bucket as unknown as R2Bucket,f.now);
  await assert.rejects(writer.put(old,new Uint8Array([1])),/ERASURE_SCOPE_CLOSED/);
  await writer.put(`screens/${a.owner}/${a.device}/${crypto.randomUUID()}/new.jpg`,new Uint8Array([1]));
});
test("L04 in-flight R2 write keeps deletion partial until it settles, then cannot resurrect content",async()=>{
  const f=fixture(),a=identity();seed(f.db,a);
  let release!:()=>void,started!:()=>void;const waiting=new Promise<void>(resolve=>release=resolve),entered=new Promise<void>(resolve=>started=resolve);
  const put=f.bucket.put.bind(f.bucket);f.bucket.put=async(key,data)=>{started();await waiting;await put(key,data);};
  const writer=erasureAwareBucket(f.db as unknown as D1Database,f.bucket as unknown as R2Bucket,f.now);
  const key=`screens/${a.owner}/${a.device}/${a.session}/delayed.jpg`,writing=writer.put(key,new Uint8Array([1]));
  await entered;const id=crypto.randomUUID();await f.jobs.request({id,scope:"device",owner:a.owner,device:a.device});
  assert.equal((await finish(f.jobs,id,90)).state,"partial");
  release();await assert.rejects(writing,/ERASURE_SCOPE_CLOSED/);
  assert.equal((await finish(f.jobs,id)).state,"complete");assert.equal(f.bucket.values.size,0);
});
test("L04 failure is retryable; processing and expired worker leases are observable",async()=>{
  const f=fixture(),a=identity();seed(f.db,a);f.bucket.values.set(`screens/${a.owner}/${a.device}/${a.session}/old.jpg`,new Uint8Array([1]));
  const id=crypto.randomUUID();await f.jobs.request({id,scope:"device",owner:a.owner,device:a.device});
  f.bucket.fail=true;assert.equal((await finish(f.jobs,id)).state,"failed");
  f.db.raw.prepare("UPDATE sb_erasure_jobs SET lock_token='stale',lock_until=?,state='processing' WHERE id=?").run(f.now()+100,id);
  assert.equal((await f.jobs.advance(id)).state,"processing");f.tick(101);f.bucket.fail=false;
  assert.equal((await finish(f.jobs,id)).state,"complete");
});
test("L04 orphan late child writes cannot recreate erased ledgers",async()=>{
  const f=fixture(),a=identity();seed(f.db,a);const id=crypto.randomUUID();await f.jobs.request({id,scope:"device",owner:a.owner,device:a.device});await finish(f.jobs,id);
  assert.throws(()=>f.db.raw.prepare("INSERT INTO sb_browse_leases(id,run_id,seq,request_id,issued_at,expires_at) VALUES(?,?,1,?,1,2)").run(crypto.randomUUID(),a.run,crypto.randomUUID()),/ERASURE_PARENT_MISSING/);
});
test("L04 failed R2 cleanup retains unresolved writer intent instead of claiming completion",async()=>{
  const f=fixture(),a=identity();seed(f.db,a);f.bucket.put=async()=>{throw Error("synthetic uncertain PUT");};f.bucket.fail=true;
  const writer=erasureAwareBucket(f.db as unknown as D1Database,f.bucket as unknown as R2Bucket,f.now);
  await assert.rejects(writer.put(`screens/${a.owner}/${a.device}/${a.session}/uncertain.jpg`,new Uint8Array([1])));
  assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sb_storage_writes").get()!.n,1);
});
test("L04 supplemental TTL removes expired pixels/OCR/pairing/diagnostics and compacts content without freeing replay keys",async()=>{
  const f=fixture(),a=identity();seed(f.db,a);
  const old=f.now()-10*86400000;
  f.db.raw.prepare("UPDATE sb_mouse_commands SET state='board_acked',expires_at=?,payload='{}',precondition='PRIVATE',receipt='PRIVATE'").run(old);
  f.db.raw.prepare("UPDATE sb_led_commands SET state='board_acked',expires_at=?,receipt='PRIVATE'").run(old);
  f.db.raw.prepare("UPDATE sb_browse_runs SET state='expired',expires_at=?,input_json='PRIVATE',checkpoint_json='PRIVATE'").run(old);
  f.db.raw.prepare("UPDATE sb_browse_journal SET created_at=?,evidence='PRIVATE'").run(old);
  for(const table of ["sb_frames","sb_screen_texts","sb_pair_codes","sb_browse_calibrations","sb_pointer_ready","sb_browse_images"])
    f.db.raw.prepare(`UPDATE ${table} SET expires_at=?`).run(old);
  f.db.raw.prepare("UPDATE sb_timing_journal SET received_utc_ms=?").run(old);
  const key=`screens/${a.owner}/${a.device}/${a.session}/expired.jpg`;f.bucket.values.set(key,new Uint8Array([1]));
  f.db.raw.prepare("UPDATE sb_frames SET image_key=?").run(key);
  const result=await retentionPage(f.db as unknown as D1Database,f.bucket as unknown as R2Bucket,{prefix:"screens/"},f.now());
  assert.ok(result.d1_changes>0);assert.equal(result.deleted_objects,1);
  for(const table of ["sb_frames","sb_screen_texts","sb_pair_codes","sb_timing_journal"])
    assert.equal(f.db.raw.prepare(`SELECT count(*) n FROM ${table}`).get()!.n,0,table);
  assert.equal(f.db.raw.prepare("SELECT precondition FROM sb_mouse_commands").get()!.precondition,null);
  assert.equal(f.db.raw.prepare("SELECT input_json FROM sb_browse_runs").get()!.input_json,null);
  assert.equal(f.db.raw.prepare("SELECT evidence FROM sb_browse_journal").get()!.evidence,"{}");
  for(const table of ["sb_mouse_commands","sb_led_commands","sb_browse_runs"])assert.equal(f.db.raw.prepare(`SELECT count(*) n FROM ${table}`).get()!.n,1);
  assert.equal((await retentionPage(f.db as unknown as D1Database,f.bucket as unknown as R2Bucket,{prefix:"screens/"},f.now())).d1_changes,0);
});
test("L04 GC skips a live PUT and an atomic GC lock prevents a later PUT from racing object deletion",async()=>{
  const f=fixture(),a=identity();seed(f.db,a);
  const key=`screens/${a.owner}/${a.device}/${a.session}/orphan.jpg`;f.bucket.values.set(key,new Uint8Array([1]));
  f.db.raw.prepare("INSERT INTO sb_storage_writes(id,owner_id,device_id,session_id,image_key,started_at) VALUES(?,?,?,?,?,?)")
    .run(crypto.randomUUID(),a.owner,a.device,a.session,key,f.now());
  const result=await retentionPage(f.db as unknown as D1Database,f.bucket as unknown as R2Bucket,{prefix:"screens/"},f.now());
  assert.equal(result.busy_objects,1);assert.equal(f.bucket.values.has(key),true);
  f.db.raw.exec("DELETE FROM sb_storage_writes");
  let denied=false;const remove=f.bucket.delete.bind(f.bucket);
  f.bucket.delete=async keys=>{
    const writer=erasureAwareBucket(f.db as unknown as D1Database,f.bucket as unknown as R2Bucket,f.now);
    await assert.rejects(writer.put(key,new Uint8Array([2])),/STORAGE_KEY_BUSY/);denied=true;await remove(keys);
  };
  await retentionPage(f.db as unknown as D1Database,f.bucket as unknown as R2Bucket,{prefix:"screens/"},f.now());
  assert.equal(denied,true);assert.equal(f.bucket.values.size,0);
});
test("L04 preexisting D1 orphans prevent a device completion claim; an authorized site job can clear them",async()=>{
  const f=fixture(),a=identity();seed(f.db,a);
  f.db.raw.exec("DELETE FROM sb_browse_runs"); // Simulate the old revoker losing the parent link.
  const id=crypto.randomUUID();await f.jobs.request({id,scope:"device",owner:a.owner,device:a.device});
  const result=await finish(f.jobs,id);assert.equal(result.state,"failed");assert.equal(result.error,"UNATTRIBUTABLE_D1_CHILDREN");
  const all=crypto.randomUUID();await f.jobs.request({id:all,scope:"site"});assert.equal((await finish(f.jobs,all)).state,"complete");
});
