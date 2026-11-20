/** Owner-bound references for one model review round. Pixel bytes stay out of request state. */
export type NativeSearchReviewState = {
  preparation:string;
  device:string;
  argsDigest:string;
  stage:"focus"|"after_clear"|"query_results";
  shortcut:string;
  command:string;
  frame:string;
  sha256:string;
  nonce:string;
  width:number;
  height:number;
  orientationEpoch:number;
  captureLower:number;
  originalGapMS:number;
  relook:boolean;
  observeUntil:number;
  issued:number;
  expires:number;
};

const uuid=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const digest=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{64}$/.test(value);
const time=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;

export function validNativeSearchReviewState(value:unknown,now:number):value is NativeSearchReviewState {
  if(!value||typeof value!=="object"||Array.isArray(value)||!time(now))return false;
  const view=value as NativeSearchReviewState;
  return Object.keys(view).length===18&&[view.preparation,view.device,view.shortcut,view.command,view.frame,view.nonce].every(uuid)&&
    digest(view.argsDigest)&&digest(view.sha256)&&["focus","after_clear","query_results"].includes(view.stage)&&
    [view.width,view.height].every(size=>Number.isSafeInteger(size)&&size>=2&&size<=8192)&&
    Number.isSafeInteger(view.orientationEpoch)&&view.orientationEpoch>=0&&typeof view.relook==="boolean"&&
    [view.captureLower,view.originalGapMS,view.observeUntil,view.issued,view.expires].every(time)&&
    view.originalGapMS>0&&view.originalGapMS<=5000&&view.captureLower<=view.issued&&view.issued<=now&&
    view.issued-view.captureLower<2000&&view.observeUntil>=view.captureLower&&view.observeUntil<=view.issued+5000&&
    view.expires>now&&view.expires<=view.captureLower+10000;
}
