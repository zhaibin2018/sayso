import type {BridgeEngine,User} from "./bridge-engine.ts";
import type {VisualReadPointProof} from "./compound-query-view-proof.ts";
import {databaseNowSQL} from "./screen-snapshot-query.ts";
import {absoluteMouseRequest} from "./absolute-mouse.ts";
import {visualReadPointOriginFences} from "./current-frame-admission.ts";
import {diagnosticJSONSQL,allOf,reviewedPointSourceHashSQL,freshHeadViewSQL,reviewedPointHeadAcceptanceSQL,reviewedPointHeadSQL,dragReviewJoinsSQL} from "./source-view-proof.ts";
export async function reviewedPointRejection(e:BridgeEngine,context:{authority:(at:string)=>string;fences:Record<string,string>;join:string},user:User,device:string,frame:string,args:Record<string,unknown>,now:number,proof?:VisualReadPointProof,cropReview=true,geometryOnly=false) {
    const at="clock.now",intent="i.intent",origin="i.origin";
    const {intent:geometry}=absoluteMouseRequest(args);
    const acceptedSourceAge="("+at+"-json_extract(a.acceptance_json,'$.capture_lower_ms'))";
    const sourceAge="CASE WHEN json_extract(a.acceptance_json,'$.owner_id')=d.owner_id THEN "+acceptedSourceAge+" ELSE NULL END";
    const flags=diagnosticJSONSQL({},{
      authority:context.authority(at),input_clear:allOf(...Object.values(context.fences)),
      worker_live:"d.worker_expires>"+at,sharing_active:"s.state='active' AND s.capture_state='active'",
      control_enabled:"s.mouse_enabled=1",control_unexpired:"s.input_end>"+at,usb_connected:"h.usb_connected=1",
      ...context.fences,
      ...(proof?visualReadPointOriginFences(origin,at):{
        original_acceptance:"a.acceptance_json IS NOT NULL",ordinary_source_younger_than_4s:acceptedSourceAge+"<4000",
      }),
      original_control_equal:"json_extract(a.acceptance_json,'$.control_epoch')=s.control_epoch",
      original_session_equal:"json_extract(a.acceptance_json,'$.metadata.bridge_session_id')=s.id",
      original_broadcast_equal:"json_extract(a.acceptance_json,'$.metadata.broadcast_id')=s.broadcast_id",
      original_worker_equal:"json_extract(a.acceptance_json,'$.metadata.worker_id')=d.worker_id",
      original_lease_equal:"json_extract(a.acceptance_json,'$.metadata.lease_epoch')=d.lease_epoch",
      pixel_hash_equal:"f.sha256="+reviewedPointSourceHashSQL,
      exact_source_frame:"f.frame_id=json_extract(i.intent,'$.source_frame_id')",
      crop_review_path:cropReview?"1":"0",
      geometry_only_path:geometryOnly?"1":"0",
      legacy_source_age_required:geometryOnly?"0":"1",
      whole_image_equality_required:geometryOnly||cropReview?"0":"1",
      current_head:freshHeadViewSQL(at,2000),
      current_head_acceptance_present:"n.acceptance_json IS NOT NULL",
      current_head_acceptance_exact:reviewedPointHeadAcceptanceSQL(),
      current_geometry_and_order:reviewedPointHeadSQL(at,intent,false,cropReview?"1":undefined,proof?"1":undefined,proof?"1":undefined,geometryOnly?"1":undefined),
    });
    const row=await e.stmt(`WITH clock AS (SELECT max(?,${databaseNowSQL}) AS now),
      i AS (SELECT ? AS intent, ? AS origin) SELECT ${flags} AS flags,${sourceAge} AS source_age_ms,
      clock.now-f.capture_lower AS current_head_age_ms ${context.join}
      CROSS JOIN clock CROSS JOIN i LEFT JOIN sb_frames f ON f.device_id=d.id
      ${dragReviewJoinsSQL(intent)} WHERE d.id=? AND d.owner_id=? AND d.revoked=0`,
      now,JSON.stringify({...geometry,source_frame_id:frame}),proof?JSON.stringify(proof):null,device,user.id)
      .first<{flags:string;source_age_ms:number|null;current_head_age_ms:number|null}>();
    return row?{conditions:JSON.parse(row.flags) as Record<string,number>,source_age_ms:row.source_age_ms,
      current_head_age_ms:row.current_head_age_ms}:null;
  }
