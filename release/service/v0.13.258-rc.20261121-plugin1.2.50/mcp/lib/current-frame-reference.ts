import type {VisualReadPointProof} from "./compound-query-view-proof.ts";

export const currentFrameReferenceContract="current_action_frame.v1";
export const currentFrameReferenceDomain="sayso.action-frame-reference.v2";
// Storage retention only. It is not an input authorization deadline.
export const currentFrameReferenceRetentionMS=24*60*60*1000;
export type CurrentFrameReference=VisualReadPointProof&{contract:typeof currentFrameReferenceContract};

export function validCurrentFrameReference(value:unknown,now:number):value is CurrentFrameReference {
  if(!value||typeof value!=="object"||Array.isArray(value)||!Number.isFinite(now))return false;
  const v=value as CurrentFrameReference;
  const uuid=(x:unknown)=>typeof x==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
  const number=(x:unknown)=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=Number.MAX_SAFE_INTEGER;
  const sequence=(x:unknown)=>number(x)&&Number.isSafeInteger(x)&&Number(x)>0;
  if(!Array.isArray(v.geometry)||v.geometry.length!==11)return false;
  const [w,h,nw,nh,orientation,epoch,x,y,rw,rh,transform]=v.geometry;
  if(![w,h,nw,nh,rw,rh].every(x=>sequence(x)&&Number(x)<=8192)||
    !["portrait","portrait_upside_down","landscape_left","landscape_right"].includes(String(orientation))||
    !number(epoch)||!Number.isSafeInteger(epoch)||x!==0||y!==0||rw!==w||rh!==h||transform!=="1")return false;
  return v.contract===currentFrameReferenceContract&&v.origin==="visual_read"&&v.command==="visual_read"&&
    [v.device,v.session,v.broadcast,v.worker,v.frame,v.hardware,v.boot].every(uuid)&&
    [v.lease,v.control,v.frameSeq,v.sourceSeq].every(sequence)&&
    [v.captureMono,v.captureLower,v.issued,v.expires].every(number)&&
    typeof v.sha256==="string"&&/^[0-9a-f]{64}$/.test(v.sha256)&&
    (!Object.hasOwn(v,"staticScreen")||v.staticScreen===true)&&
    v.captureLower<=v.issued&&(v.staticScreen===true||v.issued-v.captureLower<2000)&&v.issued<=now&&v.expires>=v.issued;
  // Current ownership, session, control, hardware and geometry are checked
  // atomically at action admission. Source age/retention time cannot grant or
  // revoke control, and there is no old 15-second source-use gate here.
}
