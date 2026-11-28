import {test} from "node:test";
import assert from "node:assert/strict";
import {Miniflare} from "miniflare";
import {sqlAssertion,withAtomicDevice,setAtomicBody} from "../lib/hot-path-context.ts";
import {BridgeError,type BridgeEngine} from "../lib/bridge-engine.ts";

test("hot path workerd D1: assertions short-circuit, preserve public codes and roll back the whole batch",async()=>{
  const runtime=new Miniflare({modules:true,script:"export default {fetch(){return new Response('offline fixture')}}",compatibilityDate:"2026-05-22",d1Databases:{DB:"hot-path-offline"}});
  try{
    const db=await runtime.getD1Database("DB") as unknown as D1Database;
    await db.prepare("CREATE TABLE offline_audit(id INTEGER PRIMARY KEY,value INTEGER)").run();
    await db.batch([sqlAssertion(db,"?=1",[1],"UNAUTHENTICATED"),db.prepare("INSERT INTO offline_audit VALUES(1,1)")]);
    for(const code of ["UNAUTHENTICATED","EVENT_CLOCK_DOWNGRADE","EVENT_CLOCK_PROBE_SCOPE_CHANGED","STATIC_RELEASE_CHANGED"]){
      await assert.rejects(db.batch([
        db.prepare("UPDATE offline_audit SET value=value+1 WHERE id=1"),
        sqlAssertion(db,"?=1",[0],code),
        db.prepare("INSERT INTO offline_audit VALUES(2,2)"),
      ]),new RegExp("SAYSO_"+code));
      assert.equal((await db.prepare("SELECT value FROM offline_audit WHERE id=1").first<{value:number}>())?.value,1);
      assert.equal((await db.prepare("SELECT count(*) n FROM offline_audit").first<{n:number}>())?.n,1);
    }
    await db.prepare("CREATE TABLE sb_devices(id TEXT,owner_id TEXT,token_hash TEXT,revoked INTEGER,token_expires INTEGER,confirmed_at INTEGER)").run();
    await db.prepare("CREATE TABLE sb_sessions(id TEXT,device_id TEXT,owner_id TEXT,event_clock TEXT,broadcast_id TEXT)").run();
    await db.prepare("CREATE TABLE sb_clock_probes(id TEXT,device_id TEXT,event_clock TEXT)").run();
    await assert.rejects(withAtomicDevice(new Request("https://offline.invalid",{headers:{Authorization:"Bearer "+"x".repeat(43)}}),async()=>{
      setAtomicBody({bridge_session_id:{invalid:true},clock_probe_id:[]});throw new BridgeError("INVALID_BODY",422);
    },{db} as BridgeEngine),(error:unknown)=>error instanceof BridgeError&&error.code==="UNAUTHENTICATED"&&error.status===401);
  }finally{await runtime.dispose();}
});
