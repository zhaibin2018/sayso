import {createHash} from "node:crypto";
import {debugObject as object,debugUUID as uuid,getDebugScope} from "./debug-scope.ts";
import type {McpPerformance} from "./mcp-performance.ts";
import {minimalCallTTL} from "./minimal-call-journal.ts";
import {completeCallImageScope} from "./call-image-journal.ts";

export const actionJournalIDs = ["device_id","session_id","broadcast_id","clock_domain_id","command_id",
  "parent_command_id","operation_id","search_command_id","type_command_id"] as const;
export const actionJournalTimes = ["enqueued_utc_ms","claimed_utc_ms","receipt_utc_ms"] as const;
export const actionJournalFields = [...actionJournalIDs,"child_command_ids",...actionJournalTimes] as const;
const number=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0?v:null;
type CommandScope={id:string;device_id:string;session_id:string;predecessor_id:string|null;created_at:number;
  event_clock:string|null;broadcast_id:string|null;session_clock:string|null};
const emptyScope=()=>({...Object.fromEntries(actionJournalIDs.map(k=>[k,null])),child_command_ids:[] as string[]});

/** Only call from waitUntil: every claimed link is checked against retained owner/device rows. */
export async function commandJournalScope(db:D1Database,owner:string,id:string,device:string|null=null) {
  const c=await db.prepare(`SELECT c.id,c.device_id,c.session_id,c.predecessor_id,c.created_at,c.event_clock,
    s.broadcast_id,s.event_clock AS session_clock FROM sb_mouse_commands c
    JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id AND d.revoked=0
    JOIN sb_sessions s ON s.id=c.session_id AND s.owner_id=c.owner_id AND s.device_id=c.device_id
    WHERE c.id=? AND c.owner_id=? AND (? IS NULL OR c.device_id=?)`).bind(id,owner,device,device).first<CommandScope>();
  if(!c)return null;
  let clock:Record<string,unknown>={};try{clock=object(JSON.parse(c.event_clock??c.session_clock??"{}"));}catch{}
  const children=await db.prepare(`SELECT id FROM sb_mouse_commands WHERE owner_id=? AND device_id=?
    AND session_id=? AND predecessor_id=? ORDER BY rowid LIMIT 8`).bind(owner,c.device_id,c.session_id,c.id).all<{id:string}>();
  const parent=c.predecessor_id?await db.prepare(`SELECT id FROM sb_mouse_commands WHERE id=? AND owner_id=?
    AND device_id=? AND session_id=?`).bind(c.predecessor_id,owner,c.device_id,c.session_id).first<{id:string}>():null;
  return {...emptyScope(),device_id:uuid(c.device_id),session_id:uuid(c.session_id),
    broadcast_id:uuid(clock.broadcast_id??c.broadcast_id),clock_domain_id:uuid(clock.clock_domain_id),
    command_id:uuid(c.id),parent_command_id:uuid(parent?.id),
    child_command_ids:children.results.map(v=>uuid(v.id)).filter((v):v is string=>!!v),enqueued_utc_ms:number(c.created_at)};
}

export async function completeActionJournalScope(db:D1Database,trace:McpPerformance,owner:string,body:unknown):Promise<Record<string,unknown>> {
  const summary=object(object(object(body).result).structuredContent),scope=getDebugScope(trace);
  const imageScope=completeCallImageScope(trace),metadata=object(summary.metadata??object(summary.after_screen).metadata);
  const device=uuid(summary.device_id)??uuid(imageScope.device_id)??uuid(metadata.device_id)??scope?.device??null;
  const command=uuid(summary.command_id)??scope?.command;
  let fields:Record<string,unknown>=emptyScope();
  if(command){const checked=await commandJournalScope(db,owner,command,device);if(checked)fields=checked;}
  // Read-only calls can have no command. Prefer the released frame's exact clock, never a different session.
  if(!fields.device_id&&device){
    const session=uuid(imageScope.session_id)??uuid(metadata.bridge_session_id)??scope?.session??null;
    const row=await db.prepare(`SELECT d.id,s.id AS session_id,s.broadcast_id,s.event_clock FROM sb_devices d
      LEFT JOIN sb_sessions s ON s.id=COALESCE(?,d.current_session) AND s.owner_id=d.owner_id AND s.device_id=d.id
      WHERE d.id=? AND d.owner_id=? AND d.revoked=0`).bind(session,device,owner).first<Record<string,unknown>>();
    if(row){let clock:Record<string,unknown>={};try{clock=object(JSON.parse(String(row.event_clock??"{}")));}catch{}
      const sameReleasedScope=imageScope.device_id===row.id&&imageScope.session_id===row.session_id;
      fields={...fields,device_id:uuid(row.id),session_id:uuid(row.session_id),
        broadcast_id:uuid(sameReleasedScope?imageScope.broadcast_id:row.broadcast_id),
        clock_domain_id:uuid(sameReleasedScope?imageScope.clock_domain_id:clock.clock_domain_id)};}
  }
  const operation=uuid(summary.operation_id);
  if(operation){
    const parent=await db.prepare(`SELECT device_id,native_review_state FROM sb_app_search_queries
      WHERE id=? AND owner_id=? AND (? IS NULL OR device_id=?)`).bind(operation,owner,device,device).first<{device_id:string;native_review_state:string}>();
    if(parent){
      const children=await db.prepare(`SELECT id,kind,session_id FROM sb_mouse_commands WHERE owner_id=? AND device_id=?
        AND idempotency_key IN (?,?) ORDER BY rowid LIMIT 2`).bind(owner,parent.device_id,
        `app-search-query:${operation}:shortcut`,`app-search-query:${operation}:text`).all<{id:string;kind:string;session_id:string}>();
      const search=children.results.find(v=>v.kind==="keyboard.open_search"),typed=children.results.find(v=>v.kind!=="keyboard.open_search");
      if(!fields.device_id&&children.results.length)fields=await commandJournalScope(db,owner,children.results.at(-1)!.id,parent.device_id)??fields;
      fields={...fields,operation_id:operation,device_id:uuid(parent.device_id),search_command_id:uuid(search?.id),type_command_id:uuid(typed?.id),
        child_command_ids:children.results.map(v=>v.id)};
    }
  }
  const selected=uuid(fields.device_id);
  return {...fields,...(selected?{scope_kind:"device",scope_device_ids:[selected]}:{})};
}

/** Existing minimal TTL/caps, plus atomic device/session erasure fences. Never a hot-path write. */
export async function writeProductionJournal(db:D1Database,key:string,received:number,data:Record<string,unknown>) {
  const now=Date.now(),json=JSON.stringify(data),session=uuid(data.session_id);
  await db.batch([
    db.prepare(`INSERT INTO sb_timing_journal(record_key,received_utc_ms,data_json) SELECT ?,?,?
      WHERE ?>=? AND NOT EXISTS(SELECT 1 FROM sb_erasure_jobs e WHERE e.fenced=1 AND
        (e.scope='site' OR (EXISTS(SELECT 1 FROM json_each(?,'$.scope_device_ids') WHERE value=e.device_id)
          AND (e.scope='device' OR e.session_id=? OR EXISTS(SELECT 1 FROM json_each(?,'$.device_states')
            WHERE json_extract(value,'$.device_id')=e.device_id AND json_extract(value,'$.session_id')=e.session_id)))))
      ON CONFLICT(record_key) DO UPDATE SET data_json=json_patch(sb_timing_journal.data_json,excluded.data_json)`)
      .bind(key,received,json,received,now-minimalCallTTL,json,session,json),
    db.prepare("DELETE FROM sb_timing_journal WHERE record_key LIKE 'minimal:%' AND received_utc_ms<?").bind(now-minimalCallTTL),
    db.prepare(`DELETE FROM sb_timing_journal WHERE id IN (SELECT id FROM
      (SELECT id,row_number() OVER(PARTITION BY json_extract(data_json,'$.scope_owner_hash'),json_extract(data_json,'$.scope_device_ids[0]') ORDER BY received_utc_ms DESC,id DESC) n
      FROM sb_timing_journal WHERE record_key LIKE 'minimal:%') WHERE n>200)`),
    db.prepare(`DELETE FROM sb_timing_journal WHERE record_key LIKE 'minimal:%' AND id NOT IN
      (SELECT id FROM sb_timing_journal WHERE record_key LIKE 'minimal:%' ORDER BY received_utc_ms DESC,id DESC LIMIT 2000)`),
  ]);
}

export async function productionCommandJournal(db:D1Database,command:{id:string;owner_id?:string;device_id?:string;created_at:number;state:string},phase:"claim"|"receipt",at:number) {
  if(!command.owner_id||!uuid(command.id))return;
  const scope=await commandJournalScope(db,command.owner_id,command.id,uuid(command.device_id));if(!scope)return;
  // Never write nulls for the other phase: json_patch must retain an earlier claim/receipt.
  await writeProductionJournal(db,"minimal:command:"+command.id,at,{...scope,record_kind:"command_companion",
    scope_owner_hash:createHash("sha256").update(command.owner_id,"utf8").digest("hex"),scope_device_ids:[scope.device_id],
    scope_kind:"device",...(phase==="claim"?{claimed_utc_ms:at}:{receipt_utc_ms:at,result_state:command.state})});
}
