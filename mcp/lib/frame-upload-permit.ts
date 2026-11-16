import {validSourceViewProof,type SourceViewProof} from "./source-view-proof.ts";
import {validCompoundQueryViewProof,validParkedMovePointProof,validReleasedFieldViewProof,validVisualReadPointProof,type CompoundQueryViewProof,type ParkedMovePointProof,type ReleasedFieldViewProof,type VisualReadPointProof} from "./compound-query-view-proof.ts";
import {makePointReceiptProof,pointReceiptProofJSON,readPointReceiptProof,pointReceiptProofMaximum,type PreparedPointReceipt} from "./point-receipt-proof.ts";
import {validNativeSearchReviewState,type NativeSearchReviewState} from "./native-search-review.ts";

export const framePermitHeader = "X-SaySo-Frame-Permit";
export const framePermitRenewHeader = "X-SaySo-Frame-Permit-Renew";
export const framePermitRequest = "request-v1";
export const framePermitMaxBytes = 65_536;
export const framePermitLifetimeMS = 10_000;

export type FrameUploadPermit = {
  device: string;
  owner: string;
  session: string;
  broadcast: string;
  worker: string;
  lease: number;
  probe: string;
  probeCreated: number;
  probeExpires: number;
  expires: number;
};

/** A short proof for parsing a bounded JPEG. The database still authorizes every write. */
export class FrameUploadPermits {
  private key?: Promise<CryptoKey>;
  private readonly configuredKey?: ArrayBuffer;

  constructor(secret?: unknown) {
    // Optional Site secret: exactly 32 random bytes encoded as hex. Never trim
    // or repair configuration; invalid/missing values keep the existing key.
    if (typeof secret === "string" && secret.length === 64 && /^[0-9a-f]{64}$/i.test(secret)) {
      this.configuredKey = Uint8Array.from(Buffer.from(secret,"hex")).buffer;
    }
  }

  private signingKey() {
    // Lazy crypto keeps module initialization free of asynchronous work.
    return this.key ??= this.configuredKey
      ? crypto.subtle.importKey("raw",this.configuredKey,{name:"HMAC",hash:"SHA-256"},false,["sign","verify"])
      : crypto.subtle.generateKey({name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
  }

  private message(tokenHash:string, payload:string) {
    return new TextEncoder().encode("sayso.jpeg-admission.v1."+tokenHash+"."+payload);
  }

  async issue(tokenHash:string, permit:FrameUploadPermit) {
    const payload = Buffer.from(JSON.stringify(permit)).toString("base64url");
    const signature = await crypto.subtle.sign("HMAC",await this.signingKey(),this.message(tokenHash,payload));
    return payload+"."+Buffer.from(signature).toString("base64url");
  }

  async verify(tokenHash:string, encoded:string, now:number) {
    if(encoded.length>2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(encoded))return null;
    const [payload,proof]=encoded.split(".");
    const signature=new Uint8Array(Buffer.from(proof,"base64url"));
    if(!await crypto.subtle.verify("HMAC",await this.signingKey(),signature,this.message(tokenHash,payload)))return null;
    const permit=JSON.parse(Buffer.from(payload,"base64url").toString("utf8")) as FrameUploadPermit;
    return permit.expires>now ? permit : null;
  }

  get sourceViewProofAvailable() { return this.configuredKey!==undefined; }
  private sourceViewMessage(owner:string,payload:string) {
    return new TextEncoder().encode(JSON.stringify(["sayso.screen-input-view.v1",owner,payload]));
  }
  async issueSourceViewProof(owner:string,view:SourceViewProof) {
    if(!this.sourceViewProofAvailable||!validSourceViewProof(view,view.issued))return undefined;
    const payload=Buffer.from(JSON.stringify(view)).toString("base64url");
    const signature=await crypto.subtle.sign("HMAC",await this.signingKey(),this.sourceViewMessage(owner,payload));
    return payload+"."+Buffer.from(signature).toString("base64url");
  }
  async verifySourceViewProof(owner:string,encoded:string,now:number):Promise<SourceViewProof|null> {
    if(!this.sourceViewProofAvailable||encoded.length>2048||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(encoded))return null;
    const [payload,proof]=encoded.split(".");
    const signature=new Uint8Array(Buffer.from(proof,"base64url"));
    if(!await crypto.subtle.verify("HMAC",await this.signingKey(),signature,this.sourceViewMessage(owner,payload)))return null;
    const view:unknown=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    return validSourceViewProof(view,now)?view:null;
  }

  private releasedActionViewMessage(domain:string,owner:string,payload:string) {
    return new TextEncoder().encode(JSON.stringify([domain,owner,payload]));
  }
  private async issueReleasedActionView(domain:string,owner:string,view:CompoundQueryViewProof|ReleasedFieldViewProof|VisualReadPointProof|ParkedMovePointProof|NativeSearchReviewState) {
    if(!this.configuredKey)return undefined;
    const payload=Buffer.from(JSON.stringify(view)).toString("base64url");
    const signature=await crypto.subtle.sign("HMAC",await this.signingKey(),this.releasedActionViewMessage(domain,owner,payload));
    return payload+"."+Buffer.from(signature).toString("base64url");
  }
  private async verifyReleasedActionView(domain:string,owner:string,encoded:string):Promise<unknown> {
    if(!this.configuredKey||encoded.length>2048||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(encoded))return null;
    const [payload,proof]=encoded.split(".");
    const signature=Buffer.from(proof,"base64url"),bytes=Buffer.from(payload,"base64url");
    if(signature.length!==32||signature.toString("base64url")!==proof||bytes.toString("base64url")!==payload)return null;
    if(!await crypto.subtle.verify("HMAC",await this.signingKey(),Uint8Array.from(signature),this.releasedActionViewMessage(domain,owner,payload)))return null;
    return JSON.parse(bytes.toString("utf8")) as unknown;
  }
  async issueCompoundQueryViewProof(owner:string,view:CompoundQueryViewProof) {
    return validCompoundQueryViewProof(view,view.issued)?
      this.issueReleasedActionView("sayso.compound-query-click.v1",owner,view):undefined;
  }
  async verifyCompoundQueryViewProof(owner:string,encoded:string,now:number,allowScopeBoundPoint=false):Promise<CompoundQueryViewProof|null> {
    const view=await this.verifyReleasedActionView("sayso.compound-query-click.v1",owner,encoded);
    const decoded=view as Partial<CompoundQueryViewProof>|null;
    const issued=decoded?.issued;
    const scoped=allowScopeBoundPoint&&(decoded?.origin==="linked_text"||decoded?.origin==="typed");
    const validationTime=scoped&&typeof issued==="number"&&issued<=now?issued:now;
    return validCompoundQueryViewProof(view,validationTime)?view:null;
  }
  async issueReleasedFieldViewProof(owner:string,view:ReleasedFieldViewProof) {
    return validReleasedFieldViewProof(view,view.issued)?
      this.issueReleasedActionView("sayso.field-after-input.v1",owner,view):undefined;
  }
  async issueVisualReadPointProof(owner:string,view:VisualReadPointProof) {
    return validVisualReadPointProof(view,view.issued)?
      this.issueReleasedActionView("sayso.visual-read-point.v1",owner,view):undefined;
  }
  async verifyVisualReadPointProof(owner:string,encoded:string,now:number):Promise<VisualReadPointProof|null> {
    const view=await this.verifyReleasedActionView("sayso.visual-read-point.v1",owner,encoded);
    return validVisualReadPointProof(view,now)?view:null;
  }
  async issueParkedMovePointProof(owner:string,view:ParkedMovePointProof) {
    return validParkedMovePointProof(view,view.issued)?
      this.issueReleasedActionView("sayso.parked-move-point.v1",owner,view):undefined;
  }
  async verifyParkedMovePointProof(owner:string,encoded:string,now:number):Promise<ParkedMovePointProof|null> {
    const view=await this.verifyReleasedActionView("sayso.parked-move-point.v1",owner,encoded);
    return validParkedMovePointProof(view,now)?view:null;
  }
  async verifyReleasedFieldViewProof(owner:string,encoded:string,now:number,scopeBound=false):Promise<ReleasedFieldViewProof|null> {
    const view=await this.verifyReleasedActionView("sayso.field-after-input.v1",owner,encoded);
    const issued=(view as Partial<ReleasedFieldViewProof>|null)?.issued;
    const validationTime=scopeBound&&typeof issued==="number"&&issued<=now?issued:now;
    return validReleasedFieldViewProof(view,validationTime)?view:null;
  }
  async issueNativeSearchReview(owner:string,view:NativeSearchReviewState) {
    return validNativeSearchReviewState(view,view.issued)?
      this.issueReleasedActionView("sayso.native-search-review.v1",owner,view):undefined;
  }
  async verifyNativeSearchReview(owner:string,encoded:string,now:number):Promise<NativeSearchReviewState|null> {
    const view=await this.verifyReleasedActionView("sayso.native-search-review.v1",owner,encoded);
    return validNativeSearchReviewState(view,now)?view:null;
  }

  private pointReceiptMessage(tokenHash:string,moveID:string,payload:string) {
    return new TextEncoder().encode(JSON.stringify(["sayso.point-receipt-preparation.v1",tokenHash,moveID,payload]));
  }
  async issuePointReceiptProof(tokenHash:string,move:unknown,click:unknown,broadcast:string,issued:number,tokenExpires:number) {
    if(!this.configuredKey)return undefined;
    const proof=makePointReceiptProof(move,click,broadcast,issued,tokenExpires);
    if(!proof)return undefined;
    const payload=Buffer.from(pointReceiptProofJSON(proof)).toString("base64url");
    if(payload.length+44>pointReceiptProofMaximum)return undefined;
    const signature=await crypto.subtle.sign("HMAC",await this.signingKey(),this.pointReceiptMessage(tokenHash,proof.move.id,payload));
    return payload+"."+Buffer.from(signature).toString("base64url");
  }
  async verifyPointReceiptProof(tokenHash:string,moveID:string,encoded:string,now:number):Promise<PreparedPointReceipt|null> {
    if(!this.configuredKey||encoded.length>pointReceiptProofMaximum||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(encoded))return null;
    try {
      const [payload,proof]=encoded.split("."),signature=Buffer.from(proof,"base64url"),bytes=Buffer.from(payload,"base64url");
      if(signature.length!==32||signature.toString("base64url")!==proof||bytes.toString("base64url")!==payload)return null;
      if(!await crypto.subtle.verify("HMAC",await this.signingKey(),Uint8Array.from(signature),this.pointReceiptMessage(tokenHash,moveID,payload)))return null;
      return readPointReceiptProof(bytes.toString("utf8"),moveID,now);
    }catch{return null;}
  }
}
