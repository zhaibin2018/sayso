import { foregroundUpdate } from "./share-control.ts";
import {atomicState,sqlAssertion} from "./hot-path-context.ts";
import {BridgeError,integer,uuid,uid,need,iso,type BridgeEngine} from "./bridge-engine.ts";
import {databaseNowSQL as clock} from "./screen-snapshot-query.ts";
import {repeatPresentation,repeatPresentationQuery} from "./repeat-presentation.ts";
import {POINTER_PREFETCH,pointerPrefetchQuery,pointerPrefetchEnvelopes,type PrefetchCommand} from "./pointer-prefetch-query.ts";
import {captureFreshness,clearStaticProofQuery} from "./static-screen-freshness.ts";

// These private, non-UUID selectors are replaced with authenticated scalar
// subqueries, never bound as device identities. Reuse the exact repeat/clear
// plans so their nonce, source geometry and static proof fences cannot drift.
const deviceSelector="@hot_device",ownerSelector="@hot_owner",priorSelector="@hot_prior_worker_until";
function scoped(e:BridgeEngine,q:{sql:string;values:unknown[]}){
  const token=atomicState()!.token,values:unknown[]=[];let index=0,quote="";
  let sql="";
  for(let i=0;i<q.sql.length;i++){
    const char=q.sql[i];
    if(quote){sql+=char;if(char===quote){if(q.sql[i+1]===quote)sql+=q.sql[++i];else quote="";}continue;}
    if(char==="'"||char==='"'||char==='`'){quote=char;sql+=char;continue;}
    if(char!=="?"){sql+=char;continue;}
    const value=q.values[index++];
    if(value===priorSelector){sql+="(SELECT worker_expires FROM sb_devices WHERE token_hash=?)";values.push(token);}
    else if(value===deviceSelector||value===ownerSelector){sql+=`(SELECT ${value===deviceSelector?"id":"owner_id"} FROM sb_devices WHERE token_hash=?)`;values.push(token);}
    else {sql+="?";values.push(value);}
  }
  if(index!==q.values.length)throw new Error("Heartbeat SQL binding mismatch");
  return e.stmt(sql,...values);
}

/** Ordinary broadcast and static-presentation heartbeats: one ordered batch.
 * Restore/prefetch use the OLD lease before renewal; diagnostic/stop stay cold. */
export async function heartbeatRequest(e:BridgeEngine,b:Record<string,unknown>){
  const token=atomicState()!.token,now=e.now(),session=uuid(b.bridge_session_id),broadcast=uuid(b.broadcast_id),worker=uuid(b.worker_id),lease=integer(b.lease_epoch,1);
  const state=b.capture_state;need(state==="active"||state==="paused","INVALID_CAPTURE_STATE",422);
  need(b.usb_connected==null||typeof b.usb_connected==="boolean","INVALID_USB_STATE",422);
  const sequence=b.heartbeat_seq==null?null:integer(b.heartbeat_seq,1),nonce=uid(),repeated=repeatPresentation(b.repeated_frame,sequence);
  need(!repeated||state==="active","INVALID_REPEAT_PRESENTATION",422);
  const restoreID=b.spotlight_restore_command_id==null?null:uuid(b.spotlight_restore_command_id),restoreBoot=restoreID?uuid(b.board_boot_id):null;
  if(restoreID)need(sequence!==null&&state==="active"&&b.usb_connected===true&&b.mouse_relay_enabled===true&&integer(b.spotlight_lease_epoch_floor,0,2_000_000_000)<lease,"INVALID_SPOTLIGHT_RESTORE_HEARTBEAT",422);
  need(b.pointer_prefetch_protocol==null||b.pointer_prefetch_protocol===POINTER_PREFETCH,"INVALID_PREFETCH_PROTOCOL",422);
  const prefetchParent=b.pointer_prefetch_protocol===POINTER_PREFETCH?uuid(b.pointer_plan_id):null;
  need(prefetchParent===null||sequence!==null,"PREFETCH_HEARTBEAT_SEQUENCE_REQUIRED",422);
  const prefetchControl=prefetchParent?integer(b.pointer_control_epoch,1):null;
  const device={id:deviceSelector,owner_id:ownerSelector};
  const q=(sql:string,...values:unknown[])=>scoped(e,{sql,values});
  const live=`SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.owner_id=d.owner_id AND s.device_id=d.id
    WHERE d.token_hash=? AND d.revoked=0 AND d.token_expires>${clock} AND s.id=? AND s.broadcast_id=?
      AND s.state='active' AND s.mode='broadcast' AND d.worker_id=? AND d.lease_epoch=?`;
  const statements=[sqlAssertion(e.db,`EXISTS(${live})`,[token,session,broadcast,worker,lease],"STALE_SESSION"),
    q("SELECT worker_expires FROM sb_devices WHERE id=? AND owner_id=?",device.id,device.owner_id),
    q("UPDATE sb_devices SET last_seen=?,heartbeat_seq=CASE WHEN ? IS NULL THEN heartbeat_seq ELSE ? END,heartbeat_write_token=? WHERE id=? AND current_session=? AND lease_epoch=? AND worker_id=? AND revoked=0 AND (? IS NULL OR ?>heartbeat_seq)",now,sequence,sequence,nonce,device.id,session,lease,worker,sequence,sequence),
  ];
  const restoreIndex=restoreID?statements.length:null;
  if(restoreID)statements.push(q("UPDATE sb_hardware AS h SET board_boot_id=? WHERE h.device_id=? AND h.owner_id=? AND h.usb_connected=1 AND EXISTS("+
    "SELECT 1 FROM sb_mouse_commands c JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id JOIN sb_sessions s ON s.id=d.current_session AND s.id=c.session_id AND s.owner_id=d.owner_id AND s.device_id=d.id "+
    "WHERE c.id=? AND c.device_id=h.device_id AND c.owner_id=h.owner_id AND c.hardware_id=h.hardware_id AND (c.board_boot_id=h.board_boot_id OR h.board_boot_id=?) "+
    "AND c.kind IN ('spotlight.type_google_map','keyboard.type_text') AND c.state='board_acked' AND c.result_digest IS NOT NULL AND c.expires_at>? AND c.expires_at>"+clock+
    " AND json_extract(h.metadata,CASE WHEN c.kind='keyboard.type_text' THEN '$.capabilities.\"sayso.focused_text\"' WHEN json_extract(c.payload,'$.probe_keyboard')=1 THEN '$.capabilities.\"sayso.spotlight_wired_probe\"' ELSE '$.capabilities.\"sayso.spotlight_wired\"' END)=1"+
    " AND json_extract(c.receipt,'$.spotlight.restored_mouse_boot_id')=? AND json_extract(c.receipt,'$.spotlight.mouse_mode_confirmed')=1 "+
    "AND s.id=? AND s.broadcast_id=? AND s.mode='broadcast' AND s.state='active' AND s.capture_state='active' AND s.mouse_enabled=1 AND s.input_end>? AND s.input_end>"+clock+
    " AND s.control_epoch=c.control_epoch AND d.worker_id=? AND d.worker_id=c.worker_id AND d.lease_epoch=? AND d.lease_epoch=c.lease_epoch AND d.worker_expires>"+clock+" AND d.revoked=0 AND d.heartbeat_write_token=?)",
    restoreBoot,device.id,device.owner_id,restoreID,restoreBoot,now,restoreBoot,session,broadcast,now,worker,lease,nonce));
  const ui=foregroundUpdate(b);
    statements.push(
    q("UPDATE sb_sessions SET "+ui.sql+",capture_state=? WHERE id=? AND state='active' AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=? AND d.current_session=sb_sessions.id AND d.worker_id=? AND d.lease_epoch=? AND d.revoked=0 AND d.heartbeat_write_token=?)",...ui.values,state,session,device.id,worker,lease,nonce),
    q("UPDATE sb_hardware SET usb_connected=CASE WHEN ?=1 AND board_boot_id=? THEN 1 ELSE 0 END WHERE device_id=? AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=? AND d.current_session=? AND d.worker_id=? AND d.lease_epoch=? AND d.revoked=0 AND d.heartbeat_write_token=?)",b.usb_connected===true?1:0,b.board_boot_id??"",device.id,device.id,session,worker,lease,nonce),
    q("UPDATE sb_sessions SET mouse_enabled=0,input_end=0,control_epoch=control_epoch+1 WHERE id=? AND mouse_enabled=1 AND (?<>'active' OR ?=0 OR (control_protocol='share.v1' AND ?=0) OR NOT EXISTS(SELECT 1 FROM sb_hardware h WHERE h.device_id=sb_sessions.device_id AND h.owner_id=sb_sessions.owner_id AND h.usb_connected=1 AND h.board_boot_id=?)) AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=? AND d.current_session=sb_sessions.id AND d.worker_id=? AND d.lease_epoch=? AND d.revoked=0 AND d.heartbeat_write_token=?)",session,state,b.usb_connected===true?1:0,b.mouse_relay_enabled===true&&b.input_interrupted!==true?1:0,b.board_boot_id??"",device.id,worker,lease,nonce),
    q("UPDATE sb_sessions SET mouse_enabled=0,input_end=0,control_epoch=control_epoch+1 WHERE id=? AND mouse_enabled=1 AND EXISTS(SELECT 1 FROM sb_devices d WHERE d.id=? AND d.current_session=sb_sessions.id AND d.heartbeat_write_token=? AND d.worker_expires<="+clock+")",session,device.id,nonce),
    scoped(e,clearStaticProofQuery(device,session,b,nonce)),
  );
  const presentationIndex=repeated?statements.length:null;
  const presentation=repeated?repeatPresentationQuery({repeat:repeated,device:device.id,owner:device.owner_id,session,worker,lease,nonce,now,freshness:captureFreshness(b.capture_freshness)},clock):null;
  if(presentation)statements.push(scoped(e,presentation));
  const prefetchIndex=prefetchParent?statements.length:null;
  if(prefetchParent){const plan=pointerPrefetchQuery({device:device.id,owner:device.owner_id,session,broadcast,worker,lease,control:prefetchControl!,parent:prefetchParent,nonce,priorWorkerUntil:-1},clock);plan.values=plan.values.map(v=>v===-1?priorSelector:v);statements.push(scoped(e,plan));}
  // Renew capture liveness only AFTER actuator grants checked the old lease.
  // A second strictly-increasing presentation UPDATE permits capture recovery
  // after expiry; a successful first UPDATE makes this second one a no-op.
  statements.push(q("UPDATE sb_devices SET worker_expires=? WHERE id=? AND current_session=? AND worker_id=? AND lease_epoch=? AND revoked=0 AND heartbeat_write_token=?",now+10000,device.id,session,worker,lease,nonce));
  const recoveredPresentationIndex=presentation?statements.length:null;
  if(presentation)statements.push(scoped(e,presentation));
  const authorityIndex=statements.length;
  statements.push(q(`SELECT d.id,d.heartbeat_seq,d.heartbeat_write_token,s.control_epoch,s.mouse_enabled,s.control_protocol,s.input_end,(SELECT intent_seq FROM sb_share_control g WHERE g.owner_id=s.owner_id AND g.device_id=s.device_id AND g.broadcast_id=s.broadcast_id) AS intent_seq,(SELECT stopped FROM sb_share_control g WHERE g.owner_id=s.owner_id AND g.device_id=s.device_id AND g.broadcast_id=s.broadcast_id) AS user_stopped,s.mouse_grant_request,
      h.board_boot_id,h.usb_connected,max(s.created_at,s.last_tool_at) AS last_tool_at
    FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id
    LEFT JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
    WHERE d.id=? AND d.owner_id=? AND s.id=? AND s.state='active' AND d.worker_id=? AND d.lease_epoch=? AND d.revoked=0`,device.id,device.owner_id,session,worker,lease));
  const cancelIndex=statements.length;
  statements.push(q(`SELECT id,state FROM sb_mouse_commands WHERE device_id=? AND session_id=? AND cancel_requested=1 AND cancel_receipt IS NULL
    AND (state='outcome_unknown' OR expires_at>?) AND control_epoch=(SELECT control_epoch FROM sb_sessions WHERE id=sb_mouse_commands.session_id)
    AND worker_id=(SELECT worker_id FROM sb_devices WHERE id=sb_mouse_commands.device_id) AND lease_epoch=(SELECT lease_epoch FROM sb_devices WHERE id=sb_mouse_commands.device_id)
    AND board_boot_id=(SELECT board_boot_id FROM sb_hardware WHERE device_id=sb_mouse_commands.device_id) ORDER BY (state='outcome_unknown') DESC,created_at DESC LIMIT 64`,device.id,session,now));
  const results=await e.batch<Record<string,unknown>>(statements),hardware=results[authorityIndex].results[0];need(hardware,"STALE_LEASE");
  if(results[2].meta.changes!==1){
    if(sequence!==null&&sequence<=Number(hardware.heartbeat_seq))return {stale_heartbeat:true,server_time:iso(now),mouse_stop_requested:undefined};
    throw new BridgeError("STALE_LEASE");
  }
  need(hardware.heartbeat_write_token===nonce,"STALE_LEASE");
  const presented=presentationIndex===null?null:results[presentationIndex].results[0]??results[recoveredPresentationIndex!].results[0]??null;
  const priorLive=Number(results[1].results[0]?.worker_expires)>now;
  if(presented)e.scheduleBackground(25000,()=>e.expireImage(String(hardware.id),String(presented.image_key)));
  const mouse=priorLive&&state==="active"&&b.mouse_relay_enabled===true&&hardware.mouse_enabled===1&&Number(hardware.input_end)>e.now()&&b.usb_connected===true&&hardware.usb_connected===1&&hardware.board_boot_id===b.board_boot_id;
  const prefetched=prefetchIndex!==null&&mouse?pointerPrefetchEnvelopes(results[prefetchIndex].results as unknown as PrefetchCommand[],e.now(),prefetchParent!):[];
  // 测试期临时关闭（D164），产品发布前恢复 900
  const cancelled=results[cancelIndex].results,seconds=b.idle_timeout_seconds===0||b.idle_timeout_seconds===1800||b.idle_timeout_seconds===3600?b.idle_timeout_seconds:0;
  return {cancel_command_ids:cancelled.map(c=>c.id),cancel_receipt_ids:cancelled.filter(c=>c.state==="outcome_unknown").map(c=>c.id),
    idle_timeout_seconds:seconds,last_tool_at:hardware.last_tool_at,idle_timeout:seconds>0&&e.now()-Number(hardware.last_tool_at)>=seconds*1000,
    directive:mouse?"continue":"all_release",expires_in_ms:10000,control_protocol:hardware?.control_protocol,execution_remaining_ms:mouse?Math.max(0,Math.min(10000,Number(hardware.input_end)-e.now())):0,
    control_epoch:hardware.control_epoch,share_allowed:hardware?.control_protocol==="share.v1" && hardware.mouse_enabled===1,intent_seq:hardware?.intent_seq??0,mouse_stop_requested:hardware.user_stopped===1||hardware.mouse_grant_request==="00000000-0000-4000-8000-000000000000",grant_remaining_ms:mouse?Math.max(0,Math.min(10000,Number(hardware!.input_end)-e.now())):0,local_lease_max_ms:mouse?3000:0,screen_only:!mouse,server_time:iso(now),
    ...(restoreIndex!==null?{spotlight_mouse_resumed:mouse&&priorLive&&results[restoreIndex].meta.changes===1}:{}),
    ...(prefetchIndex!==null&&priorLive?{prefetched_pointer_command:prefetched[0]??null,prefetched_pointer_commands:prefetched}:{}),
    ...(repeated?{repeated_frame_accepted:presented!==null,presentation_received_at_ms:presented?.repeat_received_at??null,presentation_lower_server_utc_ms:presented?.repeat_presented_at??null,
      presented_frame_id:presented?.frame_id??null,presented_frame:presented?.reference_metadata?JSON.parse(String(presented.reference_metadata)):null}:{}),
  };
}
