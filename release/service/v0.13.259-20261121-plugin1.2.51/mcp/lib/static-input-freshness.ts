import type {BridgeEngine, User} from "./bridge-engine.ts";
import type {VisualReadPointProof} from "./compound-query-view-proof.ts";
import {staticScreenSQL,staticConditions} from "./static-screen-freshness.ts";

export const screenChangedSinceImage = "SCREEN_CHANGED_SINCE_IMAGE";
const clockSQL="CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)";
export function staticInputGeometry(proof:VisualReadPointProof,now:number) {
  const [w,h,nw,nh,orientation,epoch]=proof.geometry;
  return {frame_id:proof.frame,image_width:w,image_height:h,capture_width:nw,capture_height:nh,
    orientation,orientation_epoch:epoch,age_ms:now-proof.captureLower};
}

/** Aliases d/s/h are the currently authorized device/session/hardware. A
 * static reference requires the exact head, never a same-pixel successor. */
export function staticInputSQL(clock:string,proof:string,excluding:string[]=[]) {
  const p=(key:string)=>`json_extract(${proof},'$.${key}')`;
  const m=(key:string)=>`json_extract(f.metadata,'$.${key}')`;
  const geometry=["width","height","native_width_px","native_height_px","orientation","orientation_epoch",
    "content_rect.x","content_rect.y","content_rect.width","content_rect.height","transform_version"];
  return `EXISTS(SELECT 1 FROM sb_frames f WHERE ${staticConditions("f.device_id=d.id","f.owner_id=d.owner_id",
    "f.session_id=s.id","f.lease_epoch=d.lease_epoch",`${p("staticScreen")}=1`,`${p("device")}=d.id`,`${p("session")}=s.id`,
    `${p("worker")}=d.worker_id`,`${p("broadcast")}=s.broadcast_id`,`${p("lease")}=d.lease_epoch`,`${p("control")}=s.control_epoch`,
    `${p("hardware")}=h.hardware_id`,`${p("boot")}=h.board_boot_id`,`${p("issued")}<=${clock}`,
    `f.frame_id=${p("frame")}`,`f.frame_seq=${p("frameSeq")}`,`f.sha256=${p("sha256")}`,`f.capture_lower=${p("captureLower")}`,
    `${m("capture_mono_ms")}=${p("captureMono")}`,`${m("source_seq")}=${p("sourceSeq")}`,
    `json_array(${geometry.map(m).join(",")})=${p("geometry")}`,staticScreenSQL(clock,false,excluding))})`;
}
export function staticCommandFenceSQL(command:string,clock=clockSQL) {
  const proof=`json_extract(${command}.precondition,'$.static_input')`;
  return `(json_type(${command}.precondition,'$.static_input') IS NULL OR ${staticInputSQL(clock,proof,
    [command+".id",`json_extract(${command}.precondition,'$.point.click_command_id')`])})`;
}
export function staticInputDispatchCTE(caller:string) {
  return `static_input_dispatch AS MATERIALIZED (SELECT c.id FROM sb_mouse_commands c
    JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id
    JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id
    JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
    WHERE ${caller} AND c.state='queued' AND json_type(c.precondition,'$.static_input')='object'
    AND ${staticCommandFenceSQL("c")})`;
}

/** No-source text/wheel tools inherit the last delivered image reference.
 * Ordinary fresh-image protocols keep their existing behavior. */
export async function releasedStaticInput(e:BridgeEngine,user:User,device:string,frame?:string):Promise<VisualReadPointProof|null> {
  if(!e.releasedFieldViewProofAvailable)return null;
  const row=await e.stmt(`SELECT frame_id,proof FROM sb_released_system_search_field_proofs
    WHERE owner_id=? AND device_id=? AND command_id='visual_read' ${frame?"AND frame_id=?":""}
    ORDER BY expires_at DESC,rowid DESC LIMIT 1`,user.id,device,...(frame?[frame]:[]))
    .first<{frame_id:string;proof:string}>();
  if(!row)return null;
  const resolved=await e.resolveVisualReadPointProof(user,device,row.frame_id,row.proof);
  return resolved.proof?.staticScreen===true?resolved.proof:null;
}
export async function staticInputCurrent(e:BridgeEngine,user:User,proof:VisualReadPointProof) {
  const row=await e.stmt(`WITH input AS (SELECT ? AS proof) SELECT 1 AS valid FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session
    AND s.device_id=d.id AND s.owner_id=d.owner_id JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
    WHERE d.id=? AND d.owner_id=? AND d.revoked=0 AND d.worker_expires>${clockSQL}
    AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active'
    AND s.mouse_enabled=1 AND s.mouse_until>${clockSQL} AND h.usb_connected=1
    AND ${staticInputSQL(clockSQL,"(SELECT proof FROM input)")}`,JSON.stringify(proof),proof.device,user.id).first<{valid:number}>();
  return row?.valid===1;
}

/** Run in the same transaction as claim/start. Failed static commands never
 * receive an execution grant; also retire the paired embedded click. */
export function rejectChangedStaticInputs(e:BridgeEngine,caller:{sql:string;values:unknown[]}) {
  return [e.stmt(`UPDATE sb_mouse_commands SET state='failed',error='${screenChangedSinceImage}',input_attempted=0
    WHERE id IN (SELECT c.id FROM sb_mouse_commands c JOIN sb_devices d ON d.id=c.device_id AND d.owner_id=c.owner_id
      LEFT JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id
      LEFT JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
      WHERE ${caller.sql} AND c.state IN ('queued','claimed') AND json_type(c.precondition,'$.static_input')='object'
      AND NOT COALESCE((d.revoked=0 AND s.state='active' AND s.capture_state='active'
        AND d.worker_expires>${clockSQL} AND s.mouse_enabled=1 AND s.mouse_until>${clockSQL} AND h.usb_connected=1
        AND ${staticCommandFenceSQL("c")}),0))`,...caller.values),
    e.stmt(`UPDATE sb_mouse_commands SET state='failed',error='${screenChangedSinceImage}',input_attempted=0
      WHERE state='embedded' AND EXISTS(SELECT 1 FROM sb_mouse_commands p JOIN sb_devices d
        ON d.id=p.device_id AND d.owner_id=p.owner_id WHERE ${caller.sql.replaceAll("c.id","p.id")} AND p.id=sb_mouse_commands.predecessor_id
        AND p.owner_id=sb_mouse_commands.owner_id AND p.device_id=sb_mouse_commands.device_id
        AND p.state='failed' AND p.error='${screenChangedSinceImage}')`,...caller.values)];
}
