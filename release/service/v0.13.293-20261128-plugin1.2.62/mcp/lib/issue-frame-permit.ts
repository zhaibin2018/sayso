import {framePermitLifetimeMS,type FrameUploadPermit,type FrameUploadPermits} from "./frame-upload-permit.ts";
export async function issueFramePermit(signer:FrameUploadPermits|undefined,clock:()=>number,tokenHash:string,scope:Omit<FrameUploadPermit,"expires">,bounds:{token_expires:number;worker_expires:number;probe_expires:number},renewAfter=0) {
    const now=clock(),probeExpires=Math.min(scope.probeExpires,bounds.probe_expires);
    const expires=Math.min(now+framePermitLifetimeMS,probeExpires,bounds.token_expires,bounds.worker_expires);
    if(expires<=Math.max(now,renewAfter))return undefined;
    const frame_upload_permit=await signer?.issue(tokenHash,{...scope,probeExpires,expires}).catch(()=>undefined);
    // The remaining TTL is sampled after signing. A client anchoring it at
    // request start cannot outlive the exact signed expiry.
    const frame_upload_permit_ttl_ms=Math.min(framePermitLifetimeMS,Math.floor(expires-clock()));
    return frame_upload_permit&&frame_upload_permit_ttl_ms>=1?{frame_upload_permit,frame_upload_permit_ttl_ms}:undefined;
}
