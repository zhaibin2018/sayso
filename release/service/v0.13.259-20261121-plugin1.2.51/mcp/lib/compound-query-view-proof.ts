export const compoundQueryViewLifetimeMS = 10000;
export const compoundQueryViewReleaseAgeMS = 2000;
export const scopeBoundSystemSearchFieldProtocol = "model_reviewed_field_crops.v3";
export const scopeBoundSystemSearchFieldCapability = "sayso."+scopeBoundSystemSearchFieldProtocol;
export const scopeBoundFieldProtocol = "model_reviewed_field_crops.v4";
export const scopeBoundFieldCapability = "sayso."+scopeBoundFieldProtocol;
export const scopeBoundLinkedPointProtocol = "reviewed_point_crop.v4";
export const scopeBoundLinkedPointCapability = "sayso.reviewed_point_crops.v4";
export const visualReadPointCapability = "sayso.action_geometry.v1";
export const visualReadPointLedgerKey = "visual_read";
export const visualReadPointLifetimeMS = 15000;

type ReleasedActionView = {
  device:string; session:string; broadcast:string; worker:string; lease:number; control:number;
  command:string; frame:string; frameSeq:number; sourceSeq:number; captureMono:number; captureLower:number;
  sha256:string; issued:number; expires:number;
};
export type CompoundQueryViewProof = ReleasedActionView & (
  {preparation:string;origin:"retained"}|
  (({preparation:string;origin:"typed"}|{preparation?:never;origin:"linked_text"}) &
    {scopeBoundOnly?:true;scopeBoundPoint?:true})
);
export type ReleasedFieldViewProof = ReleasedActionView & {
  origin:"paired_click"|"system_search"|"parked_press";
  scopeBound?:true;
  scopeBoundOnly?:true;
  scopeBoundField?:true;
};
type PointViewProof=Omit<ReleasedActionView,"command"> & {hardware:string;boot:string};
export type VisualReadPointProof=PointViewProof&{origin:"visual_read";command:typeof visualReadPointLedgerKey;geometry:unknown[];staticScreen?:true};
export type ParkedMovePointProof=PointViewProof&{origin:"parked_move";command:string;move:string;moveAck:number};
export type ReviewedPointProof = CompoundQueryViewProof | VisualReadPointProof;

const uuid=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const finite=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
const sequence=(value:unknown)=>finite(value)&&Number.isSafeInteger(value)&&Number(value)>0;

function validReleasedActionView(value:unknown,now:number):value is ReleasedActionView {
  if(!value||typeof value!=="object"||Array.isArray(value)||!finite(now))return false;
  const view=value as ReleasedActionView;
  return [view.device,view.session,view.broadcast,view.worker,view.command,view.frame].every(uuid)&&
    [view.lease,view.control,view.frameSeq,view.sourceSeq].every(sequence)&&
    [view.captureMono,view.captureLower,view.issued,view.expires].every(finite)&&
    typeof view.sha256==="string"&&/^[0-9a-f]{64}$/.test(view.sha256)&&
    view.captureLower<=view.issued&&view.issued-view.captureLower<compoundQueryViewReleaseAgeMS&&
    view.issued<=now&&view.expires===view.captureLower+compoundQueryViewLifetimeMS&&view.expires>now;
}
export function validCompoundQueryViewProof(value:unknown,now:number):value is CompoundQueryViewProof {
  if(!validReleasedActionView(value,now))return false;
  const view=value as CompoundQueryViewProof;
  if(Object.hasOwn(view,"scopeBoundPoint"))return false;
  if(view.origin==="retained")return !Object.hasOwn(view,"scopeBoundOnly")&&uuid(view.preparation);
  if(Object.hasOwn(view,"scopeBoundOnly")&&view.scopeBoundOnly!==true)return false;
  return view.origin==="linked_text"?!Object.hasOwn(view,"preparation"):view.origin==="typed"&&uuid(view.preparation);
}
export function validReleasedFieldViewProof(value:unknown,now:number):value is ReleasedFieldViewProof {
  if(!validReleasedActionView(value,now))return false;
  const view=value as ReleasedFieldViewProof;
  if(Object.hasOwn(view,"scopeBound")||Object.hasOwn(view,"scopeBoundField"))return false;
  return (view.origin==="paired_click"||view.origin==="system_search"||view.origin==="parked_press")&&
    (!Object.hasOwn(view,"scopeBoundOnly")||view.scopeBoundOnly===true);
}

function validPointViewProof(value:unknown,now:number):value is PointViewProof {
  if(!value||typeof value!=="object"||Array.isArray(value)||!finite(now))return false;
  const view=value as PointViewProof;
  return [view.device,view.session,view.broadcast,view.worker,view.frame,view.hardware,view.boot].every(uuid)&&
    [view.lease,view.control,view.frameSeq,view.sourceSeq].every(sequence)&&
    [view.captureMono,view.captureLower,view.issued,view.expires].every(finite)&&
    typeof view.sha256==="string"&&/^[0-9a-f]{64}$/.test(view.sha256)&&
    view.captureLower<=view.issued&&view.issued-view.captureLower<compoundQueryViewReleaseAgeMS&&
    view.issued<=now&&view.expires===view.issued+visualReadPointLifetimeMS&&view.expires>now;
}
export function validVisualReadPointProof(value:unknown,now:number):value is VisualReadPointProof {
  if(!validPointViewProof(value,now))return false;
  const view=value as VisualReadPointProof;
  return view.origin==="visual_read"&&view.command===visualReadPointLedgerKey;
}
export function validParkedMovePointProof(value:unknown,now:number):value is ParkedMovePointProof {
  if(!validPointViewProof(value,now))return false;
  const view=value as ParkedMovePointProof;
  return view.origin==="parked_move"&&uuid(view.command)&&uuid(view.move)&&finite(view.moveAck)&&view.captureMono>view.moveAck;
}
