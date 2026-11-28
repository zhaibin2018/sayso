import {visualPointEvidence,type BridgeEngine,type ScreenResult,type User} from "./bridge-engine.ts";
import {sqlAssertion,takeReleaseLedger,markLedgerCommitted} from "./hot-path-context.ts";
import {staticReleaseQuery} from "./static-screen-freshness.ts";
import {staticInputQuery} from "./static-input-freshness.ts";
import {databaseNowSQL as clock} from "./screen-snapshot-query.ts";
import type {VisualReadPointProof} from "./compound-query-view-proof.ts";

export const screenReleaseScope=Symbol("screen_release_authority");
export type ScreenReleaseScope={device:string;session:string;broadcast:string;worker:string;lease:number;control:number;clock:string|null;orientation:number;captureGeneration?:string|null};

/** The JPEG and signatures have already been serialized. Validate the private
 * snapshot scope against CURRENT authority, then persist a static input ledger
 * in that same transaction. No public compact metadata can grant authority. */
export async function releaseScreen(e:BridgeEngine,user:User,value:ScreenResult,metadata:Record<string,unknown>,command:string|null){
  const ledger=takeReleaseLedger(),scope=value[screenReleaseScope];
  if(!scope)return false;
  const authority=`EXISTS(SELECT 1 FROM sb_devices d JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id
    JOIN sb_frames f ON f.device_id=d.id AND f.owner_id=d.owner_id AND f.session_id=s.id AND f.lease_epoch=d.lease_epoch
    WHERE d.id=? AND d.owner_id=? AND d.revoked=0 AND d.token_expires>${clock} AND d.worker_expires>${clock}
      AND s.id=? AND s.broadcast_id=? AND d.worker_id=? AND d.lease_epoch=? AND s.control_epoch=? AND s.event_clock IS ?
      AND s.state='active' AND s.mode='broadcast' AND s.capture_state='active' AND s.capture_generation IS ?
      AND json_extract(f.metadata,'$.orientation_epoch')=?)`;
  const statements=[sqlAssertion(e.db,authority,[scope.device,user.id,scope.session,scope.broadcast,scope.worker,scope.lease,scope.control,scope.clock,scope.captureGeneration??null,scope.orientation],"STATIC_RELEASE_CHANGED")];
  if(command!==null){
    const action=`EXISTS(SELECT 1 FROM sb_mouse_commands a JOIN sb_devices d ON d.id=a.device_id AND d.owner_id=a.owner_id
      JOIN sb_sessions s ON s.id=d.current_session AND s.device_id=d.id AND s.owner_id=d.owner_id
      JOIN sb_hardware h ON h.device_id=d.id AND h.owner_id=d.owner_id
      WHERE a.id=? AND a.owner_id=? AND a.device_id=? AND a.session_id=s.id AND a.worker_id=d.worker_id
        AND a.lease_epoch=d.lease_epoch AND a.control_epoch=s.control_epoch AND a.state='board_acked'
        AND a.result_digest IS NOT NULL AND a.phone_ack_mono_ms IS ? AND a.phone_ack_mono_ms>=0 AND a.input_attempted IS NOT 0
        AND s.mouse_enabled=1 AND s.input_end>${clock} AND h.usb_connected=1
        AND a.hardware_id=h.hardware_id AND a.board_boot_id=h.board_boot_id)`;
    statements.push(sqlAssertion(e.db,action,[command,user.id,scope.device,(value.after_command as Record<string,unknown>|undefined)?.phone_ack_mono_ms??null],"STATIC_RELEASE_CHANGED"));
  }
  if(metadata.static_screen){
    const q=staticReleaseQuery(user.id,metadata,command);
    statements.push(sqlAssertion(e.db,`EXISTS(${q.sql})`,q.values,"STATIC_RELEASE_CHANGED"));
    const source=value[visualPointEvidence]?.source;
    if(source&&ledger.length){
      const issued=e.now(),q=staticInputQuery(user,{...source,origin:"visual_read",command:"visual_read",issued,expires:issued+1} as VisualReadPointProof);
      statements.push(sqlAssertion(e.db,`EXISTS(${q.sql})`,q.values,"STATIC_RELEASE_CHANGED"));
    }
  }
  try{await e.db.batch([...statements,...ledger]);if(ledger.length)markLedgerCommitted();return true;}catch{return false;}
}

export function releaseActionScreen(e:BridgeEngine,user:User,after:Record<string,unknown>,metadata:Record<string,unknown>,command:string|null){
  const privateAfter=after as Record<PropertyKey,unknown>;
  return releaseScreen(e,user,{state:String(after.state),after_command:after.after_command,
    [screenReleaseScope]:privateAfter[screenReleaseScope] as ScreenReleaseScope|undefined,
    [visualPointEvidence]:privateAfter[visualPointEvidence] as import("./bridge-engine.ts").VisualPointSourceEvidence|undefined},metadata,command);
}
