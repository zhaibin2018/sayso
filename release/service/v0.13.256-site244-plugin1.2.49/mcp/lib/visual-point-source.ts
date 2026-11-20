import type {VisualPointSourceEvidence} from "./bridge-engine.ts";
type Frame={device_id:string;session_id:string;lease_epoch:number;frame_id:string;frame_seq:number;sha256:string;capture_lower:number|null};
type LiveInputScope={mouseUntil:number;broadcast:string;hardware:string;boot:string};
export function visualPointSource(frame:Frame,scopeJSON:string|null|undefined,metadata:Record<string,unknown>,now:number,staticScreen=false):VisualPointSourceEvidence {
  if(!scopeJSON)return {reason:"input_scope_unavailable"};
  if(metadata.provenance!=="device_capture"||metadata.capture_clock_verified!==true||
    metadata.bridge_session_id!==frame.session_id||metadata.lease_epoch!==frame.lease_epoch||
    metadata.frame_id!==frame.frame_id||metadata.content_sha256!==frame.sha256||
    typeof metadata.broadcast_id!=="string"||typeof metadata.worker_id!=="string"||
    typeof metadata.source_seq!=="number"||typeof metadata.capture_mono_ms!=="number"||frame.capture_lower===null)
    return {reason:"capture_identity_unavailable"};
  const scope=JSON.parse(scopeJSON) as LiveInputScope&{control:number};
  if(scope.broadcast!==metadata.broadcast_id||!(scope.mouseUntil>now))return {reason:"input_scope_changed"};
  return {reason:"eligible",source:{device:frame.device_id,session:frame.session_id,broadcast:scope.broadcast,worker:metadata.worker_id,
    lease:frame.lease_epoch,control:scope.control,frame:frame.frame_id,frameSeq:frame.frame_seq,
    sourceSeq:metadata.source_seq,captureMono:metadata.capture_mono_ms,captureLower:frame.capture_lower,
    sha256:frame.sha256,hardware:scope.hardware,boot:scope.boot,geometry:screenGeometry(metadata),...(staticScreen?{staticScreen:true as const}:{})}};
}
function screenGeometry(metadata:Record<string,unknown>) {
  const rect=metadata.content_rect as Record<string,unknown>|undefined;
  return [metadata.width,metadata.height,metadata.native_width_px,metadata.native_height_px,metadata.orientation,metadata.orientation_epoch,
    rect?.x,rect?.y,rect?.width,rect?.height,metadata.transform_version];
}
