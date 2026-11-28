import {isQuotaError} from "./quota-errors.ts";

type EvidenceRow={state:string;error:string|null;input_attempted:number|null;phone_ack_mono_ms:number|null;worker_id:string;lease_epoch:number};
/** Pure presentation checks shared by stored results; no database or input work. */
export function mouseResultEvidence(c:EvidenceRow,receipt:Record<string,unknown>|null){
  const noInput=c.input_attempted===0||(c.state==="failed"&&(isQuotaError(c.error)||c.error==="MOUSE_DISPATCH_BUDGET_EXPIRED")&&receipt!==null&&!Array.isArray(receipt)&&Object.keys(receipt).length===0);
  const mono=typeof c.phone_ack_mono_ms==="number"&&Number.isFinite(c.phone_ack_mono_ms)&&c.phone_ack_mono_ms>=0&&c.phone_ack_mono_ms<=Number.MAX_SAFE_INTEGER?c.phone_ack_mono_ms:null;
  const clockScopeKnown=typeof c.worker_id==="string"&&c.worker_id.length>0&&Number.isSafeInteger(c.lease_epoch)&&c.lease_epoch>0;
  return {noInput,mono,clockScopeKnown,quota:isQuotaError(c.error)?{input_submitted:false}: {}};
}
