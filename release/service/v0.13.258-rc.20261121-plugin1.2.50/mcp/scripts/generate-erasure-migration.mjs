// Offline deterministic schema/guard generation. No bindings, credentials or network.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { erasureTables } from '../lib/erasure-catalog.ts';
const db = new DatabaseSync(':memory:');
for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql') && f < '0031').sort()) db.exec(readFileSync('drizzle/' + file, 'utf8'));
const actual = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sb_%'").all().map(r => r.name).sort();
if (JSON.stringify(actual) !== JSON.stringify([...erasureTables].sort())) throw Error('ERASURE_CATALOG_INCOMPLETE');
db.exec('ALTER TABLE sb_browse_runs ADD COLUMN replay_key_version INTEGER NOT NULL DEFAULT 0;ALTER TABLE sb_mouse_commands ADD COLUMN replay_key_version INTEGER NOT NULL DEFAULT 0;ALTER TABLE sb_led_commands ADD COLUMN replay_key_version INTEGER NOT NULL DEFAULT 0;');
const statements = [
`ALTER TABLE sb_browse_runs ADD COLUMN replay_key_version INTEGER NOT NULL DEFAULT 0`,
`ALTER TABLE sb_mouse_commands ADD COLUMN replay_key_version INTEGER NOT NULL DEFAULT 0`,
`ALTER TABLE sb_led_commands ADD COLUMN replay_key_version INTEGER NOT NULL DEFAULT 0`,
`CREATE TABLE sb_erasure_jobs (
 id TEXT PRIMARY KEY NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('sharing','device','site')),
 owner_id TEXT, device_id TEXT, session_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('requested','processing','partial','failed','complete')),
 requested_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, fenced INTEGER NOT NULL DEFAULT 0,
 phase INTEGER NOT NULL DEFAULT 0, deleted_rows INTEGER NOT NULL DEFAULT 0, deleted_objects INTEGER NOT NULL DEFAULT 0,
 error TEXT, lock_token TEXT, lock_until INTEGER NOT NULL DEFAULT 0, r2_cursor TEXT, r2_verified_at INTEGER,
 CHECK((scope='site' AND owner_id IS NULL AND device_id IS NULL AND session_id IS NULL) OR
 (scope='device' AND owner_id IS NOT NULL AND device_id IS NOT NULL AND session_id IS NULL) OR
 (scope='sharing' AND owner_id IS NOT NULL AND device_id IS NOT NULL AND session_id IS NOT NULL))
)`,
`CREATE INDEX sb_erasure_scope ON sb_erasure_jobs(device_id,session_id)`,
`CREATE TABLE sb_storage_writes (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL,
 device_id TEXT NOT NULL, session_id TEXT NOT NULL, image_key TEXT NOT NULL, started_at INTEGER NOT NULL, is_gc INTEGER NOT NULL DEFAULT 0)`,
`CREATE INDEX sb_storage_write_scope ON sb_storage_writes(device_id,session_id)`,
`CREATE INDEX sb_storage_write_key ON sb_storage_writes(image_key)`,
`CREATE TRIGGER sb_storage_gc_lock BEFORE INSERT ON sb_storage_writes
 WHEN EXISTS(SELECT 1 FROM sb_storage_writes WHERE image_key=NEW.image_key AND (is_gc=1 OR NEW.is_gc=1))
 BEGIN SELECT RAISE(ABORT,'STORAGE_KEY_BUSY'); END`,
// Entire trigger is atomic. Stop authority before publishing the durable fence.
`CREATE TRIGGER sb_erasure_close AFTER INSERT ON sb_erasure_jobs BEGIN
 UPDATE sb_devices SET revoked=CASE WHEN NEW.scope='sharing' THEN revoked ELSE 1 END,
  worker_id=NULL,worker_expires=0,current_session=NULL,lease_epoch=lease_epoch+1
 WHERE (NEW.scope='site' OR (owner_id=NEW.owner_id AND id=NEW.device_id))
 AND (NEW.scope<>'sharing' OR current_session=NEW.session_id) AND revoked=0;
 UPDATE sb_sessions SET state='stopped',capture_state='stopped',blocked=1,mouse_enabled=0,mouse_until=0,
  control_epoch=control_epoch+1,stopped_at=COALESCE(stopped_at,NEW.requested_at),stop_reason=COALESCE(stop_reason,'data_erasure')
 WHERE (NEW.scope='site' OR (owner_id=NEW.owner_id AND device_id=NEW.device_id AND (NEW.scope='device' OR id=NEW.session_id)))
 AND (state<>'stopped' OR blocked=0);
 UPDATE sb_mouse_commands SET state=CASE WHEN state='executing' OR input_attempted=1 THEN 'outcome_unknown' ELSE 'cancelled' END
 WHERE state IN ('queued','claimed','executing','embedded') AND
 (NEW.scope='site' OR (owner_id=NEW.owner_id AND device_id=NEW.device_id AND (NEW.scope='device' OR session_id=NEW.session_id)));
 UPDATE sb_led_commands SET state=CASE WHEN state='executing' THEN 'outcome_unknown' ELSE 'cancelled' END
 WHERE state IN ('queued','claimed','executing') AND
 (NEW.scope='site' OR (owner_id=NEW.owner_id AND device_id=NEW.device_id AND (NEW.scope='device' OR session_id=NEW.session_id)));
 UPDATE sb_mouse_commands SET payload='{"details_redacted":true}',precondition=NULL,receipt=NULL,error=NULL,result_digest=NULL
 WHERE NEW.scope='sharing' AND owner_id=NEW.owner_id AND device_id=NEW.device_id AND session_id=NEW.session_id
 AND (payload<>'{"details_redacted":true}' OR precondition IS NOT NULL OR receipt IS NOT NULL OR error IS NOT NULL OR result_digest IS NOT NULL);
 UPDATE sb_led_commands SET receipt=NULL,error=NULL,result_digest=NULL
 WHERE NEW.scope='sharing' AND owner_id=NEW.owner_id AND device_id=NEW.device_id AND session_id=NEW.session_id
 AND (receipt IS NOT NULL OR error IS NOT NULL OR result_digest IS NOT NULL);
 UPDATE sb_browse_journal SET evidence='{}',input_digest='retired',observation_digest='retired'
 WHERE NEW.scope='sharing' AND evidence<>'{}' AND run_id IN
  (SELECT id FROM sb_browse_runs WHERE owner_id=NEW.owner_id AND device_id=NEW.device_id AND session_id=NEW.session_id);
 UPDATE sb_browse_runs SET state=CASE WHEN input_json IS NOT NULL OR lease_seq>0 OR state='outcome_unknown' THEN 'outcome_unknown' ELSE 'cancelled' END,queue_json='[]',plan_keys_json='{}',input_json=NULL,checkpoint_json=NULL,hardware_metadata='{}',error=NULL
 WHERE NEW.scope='sharing' AND owner_id=NEW.owner_id AND device_id=NEW.device_id AND session_id=NEW.session_id
 AND (state='active' OR queue_json<>'[]' OR plan_keys_json<>'{}' OR input_json IS NOT NULL OR checkpoint_json IS NOT NULL OR hardware_metadata<>'{}' OR error IS NOT NULL);
 UPDATE sb_erasure_jobs SET fenced=1 WHERE id=NEW.id;
END`,
];
for (const table of [...erasureTables, 'sb_storage_writes']) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
  let device = columns.includes('device_id') || table === 'sb_storage_writes' ? 'NEW.device_id' : table === 'sb_devices' ? 'NEW.id' : null;
  let session = columns.includes('session_id') || table === 'sb_storage_writes' ? 'NEW.session_id' : table === 'sb_sessions' ? 'NEW.id' : 'NULL';
  const child = ['sb_browse_leases', 'sb_browse_journal'].includes(table);
  if (child) { device = '(SELECT device_id FROM sb_browse_runs WHERE id=NEW.run_id)'; session = '(SELECT session_id FROM sb_browse_runs WHERE id=NEW.run_id)'; }
  const match = `j.scope='site'${device ? ` OR (j.device_id=${device} AND (j.scope='device' OR j.session_id=${session}))` : ''}`;
  for (const event of ['INSERT', 'UPDATE']) {
    // UPDATE checks both old and new scope, so moving an existing row cannot evade a fence.
    const check = event === 'UPDATE' ? `(${match}) OR (${match.replaceAll('NEW.', 'OLD.')})` : match;
    const retire = {
      sb_browse_runs: {intent_key:"(NEW.intent_key LIKE 'rk1:%' AND length(NEW.intent_key)=68)",replay_key_version:'NEW.replay_key_version=1'},
      sb_metrics: {detail_json:'NEW.detail_json IS NULL'},
      sb_mouse_commands: {idempotency_key:"(NEW.idempotency_key LIKE 'rk1:%' AND length(NEW.idempotency_key)=68)",replay_key_version:'NEW.replay_key_version=1',payload: `NEW.payload='{"details_redacted":true}'`, precondition:'NEW.precondition IS NULL',receipt:'NEW.receipt IS NULL',error:'NEW.error IS NULL',result_digest:'NEW.result_digest IS NULL'},
      sb_led_commands: {idempotency_key:"(NEW.idempotency_key LIKE 'rk1:%' AND length(NEW.idempotency_key)=68)",replay_key_version:'NEW.replay_key_version=1',receipt:'NEW.receipt IS NULL',error:'NEW.error IS NULL',result_digest:'NEW.result_digest IS NULL'},
      sb_sessions: {stop_reason:'NEW.stop_reason IS NULL',mouse_grant_request:'NEW.mouse_grant_request IS NULL',event_clock:'NEW.event_clock IS NULL'},
      sb_browse_journal: {evidence:"NEW.evidence='{}'",input_digest:"NEW.input_digest='retired'",observation_digest:"NEW.observation_digest='retired'"},
      sb_browse_calibrations: {proof:"NEW.proof='{}'"},
      sb_app_search_queries: {native_review_state:'NEW.native_review_state IS NULL',reason:'NEW.reason IS NULL'},
    }[table];
    const privacyOnly=event==='UPDATE' && retire ? ' AND NOT ('+columns.map(c=>retire[c]?`(NEW.${c} IS OLD.${c} OR ${retire[c]})`:`NEW.${c} IS OLD.${c}`).join(' AND ')+')' : '';
    const gcOnly=table==='sb_storage_writes' ? " AND NEW.is_gc=0" : '';
    statements.push(`CREATE TRIGGER ${table}_erasure_${event.toLowerCase()} BEFORE ${event} ON ${table}
 WHEN EXISTS(SELECT 1 FROM sb_erasure_jobs j WHERE j.fenced=1 AND (${check}))${privacyOnly}${gcOnly}
 BEGIN SELECT RAISE(ABORT,'ERASURE_SCOPE_CLOSED'); END`);
    if (child) statements.push(`CREATE TRIGGER ${table}_parent_${event.toLowerCase()} BEFORE ${event} ON ${table}
 WHEN NOT EXISTS(SELECT 1 FROM sb_browse_runs WHERE id=NEW.run_id)${privacyOnly}
 BEGIN SELECT RAISE(ABORT,'ERASURE_PARENT_MISSING'); END`);
  }
}
const output = '-- Offline L04 candidate. Apply only after evidence preservation and deployment approval.\n' + statements.join(';\n--> statement-breakpoint\n') + ';\n';
const path = 'drizzle/0031_resumable_erasure.sql';
if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8') !== output) throw Error('ERASURE_MIGRATION_STALE'); }
else writeFileSync(path, output);
db.close();
