import {BridgeError, need, text, uuid, type BridgeEngine, type Device} from './bridge-engine.ts';

import {expireOfflineSharing} from './stale-sharing.ts';
import {erasureJobUUID} from './sharing-erasure.ts';

export const sharingReplaced = 'SHARING_REPLACED';
export const phoneSharingInstructions = '同一时间只有一台手机共享；新的共享会接替旧的。操作或看屏幕后，在回复中提一句结果里的手机名称。Single-phone sharing: a new broadcast replaces the previous phone. Mention the phone name from the result when reporting a read or action.';

// Per-engine labels from the existing authorized snapshots. No extra lookup,
// authority, selection or image/proof data is retained here.
const phoneNames=new WeakMap<BridgeEngine,Map<string,string>>();
export function rememberPhoneName(e:BridgeEngine,id:string,name:unknown) {
  if(typeof name!=="string")return;
  let names=phoneNames.get(e);if(!names){names=new Map();phoneNames.set(e,names);}
  names.delete(id);names.set(id,name);
  if(names.size>20)names.delete(names.keys().next().value!);
}
export function resultPhoneName(e:BridgeEngine,value:Record<string,unknown>):string|undefined {
  if(typeof value.device_name==="string")return value.device_name;
  const metadata=value.metadata&&typeof value.metadata==="object"?value.metadata as Record<string,unknown>:{};
  const id=typeof value.device_id==="string"?value.device_id:metadata.device_id;
  return typeof id==="string"?phoneNames.get(e)?.get(id):undefined;
}
export function rememberPhone(e:BridgeEngine,row:{id:string;device_id?:string;name?:string;device_name?:string}) {
  rememberPhoneName(e,row.device_id??row.id,row.device_name??row.name);
}
export async function readyPhone<T extends Device>(e:BridgeEngine,statement:D1PreparedStatement):Promise<T> {
  const rows=await statement.all<T>();
  need(rows.results.length===1,rows.results.length?'CHOOSE_DEVICE':'START_MOUSE_SHARING');
  rememberPhone(e,rows.results[0]);
  return rows.results[0];
}

export function phoneName(value: unknown) {
  const name = text(value, 80).trim();
  if (!name || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) throw new BridgeError('INVALID_PHONE_NAME', 422);
  return name;
}

/** Device authentication supplies the scope for expiry and preflight. */
export async function otherSharingPhones(e: BridgeEngine, device: Device) {
  await expireOfflineSharing(e.db, e.now(), device);
  const rows = await e.stmt(`SELECT d.name,s.state,s.capture_state FROM sb_devices d
    JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id
    WHERE d.owner_id=? AND d.id<>? AND d.revoked=0 AND s.mode='broadcast' AND s.state='active'
    ORDER BY s.created_at DESC,s.rowid DESC`, device.owner_id, device.id).all<{name:string;state:string;capture_state:string}>();
  return {phones:rows.results.map(p=>({name:p.name,state:p.capture_state}))};
}

export async function renamePhone(e: BridgeEngine, device: Device, body: Record<string, unknown>) {
  const name=phoneName(body.name);
  const changed=await e.stmt('UPDATE sb_devices SET name=? WHERE id=? AND owner_id=? AND revoked=0',name,device.id,device.owner_id).run();
  if(changed.meta.changes!==1)throw new BridgeError('UNAUTHENTICATED',401);
  return {name};
}

/** Included in the session-create D1 transaction. The existing erasure trigger is the stop fence. */
export function replaceOtherSharingStatements(e: BridgeEngine, device: Device, session: string, now: number) {
  const other = "owner_id=? AND device_id<>? AND mode='broadcast' AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)";
  const scope = [device.owner_id,device.id,session];
  return [
    e.stmt(`UPDATE sb_hardware SET usb_connected=0 WHERE owner_id=? AND device_id IN
      (SELECT device_id FROM sb_sessions WHERE ${other} AND state='active')`,device.owner_id,...scope),
    e.stmt(`UPDATE sb_sessions SET stop_reason='sharing_replaced' WHERE ${other}
      AND (state='active' OR (blocked=0 AND stop_reason='offline_timeout'))`,...scope),
    e.stmt(`INSERT INTO sb_erasure_jobs(id,scope,owner_id,device_id,session_id,state,requested_at,updated_at)
      SELECT ${erasureJobUUID},'sharing',owner_id,device_id,id,'requested',?,? FROM sb_sessions
      WHERE ${other} AND blocked=0 AND stop_reason='sharing_replaced'`,now,now,...scope),
    ...['sb_frames','sb_screen_texts','sb_refreshes'].map(table=>e.stmt(`DELETE FROM ${table} WHERE owner_id=? AND session_id IN
      (SELECT id FROM sb_sessions WHERE owner_id=? AND device_id<>? AND stop_reason='sharing_replaced' AND state='stopped')
      AND EXISTS(SELECT 1 FROM sb_sessions WHERE id=?)`,device.owner_id,...scope)),
  ];
}

/** A stopped session remains a tombstone, including after erasure and network recovery. */
export async function replacementHeartbeat(e: BridgeEngine, device: Device, body: Record<string, unknown>) {
  if(body.broadcast_id==null)return null;
  const row=await e.stmt("SELECT id FROM sb_sessions WHERE id=? AND owner_id=? AND device_id=? AND broadcast_id=? AND state='stopped' AND stop_reason='sharing_replaced'",
    uuid(body.bridge_session_id),device.owner_id,device.id,uuid(body.broadcast_id)).first();
  return row ? {directive:'all_release',sharing_replaced:true,reason:sharingReplaced,expires_in_ms:0,grant_remaining_ms:0,control_epoch:0,local_lease_max_ms:0,mouse_stop_requested:true,stale_heartbeat:false,screen_only:true} : null;
}

export async function cleanReplacedSharing(e: BridgeEngine, device: Device) {
  const rows=await e.stmt(`SELECT s.id,s.device_id FROM sb_sessions s JOIN sb_erasure_jobs j ON j.session_id=s.id AND j.device_id=s.device_id AND j.owner_id=s.owner_id
    WHERE s.owner_id=? AND s.stop_reason='sharing_replaced' AND j.scope='sharing' AND j.state='requested' LIMIT 20`,device.owner_id).all<{id:string;device_id:string}>();
  for(const row of rows.results)await e.stop({...device,id:row.device_id},row.id,false,'sharing_replaced');
}

// Recheck a losing insert so a concurrent takeover reaches the same
// ReplayKit exit path as a takeover completed before the request began.
export async function checkBroadcastStart(e: BridgeEngine, device: Device, broadcast: string) {
  const row = await e.stmt(`SELECT d.blocked_broadcast,
    EXISTS(SELECT 1 FROM sb_sessions WHERE device_id=d.id AND broadcast_id=? AND blocked=1) AS stopped,
    EXISTS(SELECT 1 FROM sb_sessions WHERE device_id=d.id AND broadcast_id=? AND stop_reason='sharing_replaced') AS replaced
    FROM sb_devices d WHERE d.id=? AND d.owner_id=?`,broadcast,broadcast,device.id,device.owner_id)
    .first<{blocked_broadcast:string|null;stopped:number;replaced:number}>();
  need(!row?.replaced,sharingReplaced);
  need(row && !row.stopped && row.blocked_broadcast!==broadcast,"BROADCAST_STOPPED_START_MANUALLY");
}
