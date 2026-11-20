import { createHash } from "node:crypto";
// Private, bounded process memory. D1 owner/session/lease checks still run on
// EVERY read. R2 remains the durable file store; there is no public cache URL.
type FrameCommit = { worker:string; lease:number; captureMono:number; captureLower:number; readyCueCommandID?:string };
type Entry = { owner: string; session: string; frame: string; key: string; bytes: Uint8Array; expires: number; commit?:FrameCommit };
export type FrameCommitBarrier = { owner:string; device:string; session:string; worker:string; lease:number; captureAfter:number; readyCueCommandID?:string };
export type ScreenViewIdentity = {owner:string;device:string;session:string;lease:number;sha256:string;geometry:string};
// Private-resource content validators, NOT credentials or input authority.
// Current D1 authorization/freshness runs before every comparison. A caller
// may send one only while its actual prior image is still in model context.
function viewTag(identity:ScreenViewIdentity,bucket:number):string {
  const hex=createHash("sha256").update(JSON.stringify(["screen_view.v3",identity.owner,identity.device,identity.session,identity.lease,identity.sha256,identity.geometry,bucket])).digest("hex");
  // The first 32 bits only advise SQL to omit a possibly unchanged JPEG.
  // A full scope/content/geometry/time comparison still decides unchanged;
  // a forged prefix or collision falls back to a newly authorized full read.
  const hint=/^[0-9a-f]{64}$/.test(identity.sha256)?identity.sha256.slice(0,8):hex.slice(0,8);
  return `${hint}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function screenViewReference(identity:ScreenViewIdentity,now:number):string {return Number.isFinite(now)&&now>=0?viewTag(identity,Math.floor(now/30000)):crypto.randomUUID();}
export function screenViewMatches(reference:string,identity:ScreenViewIdentity,now:number):boolean {
  if(!Number.isFinite(now)||now<0)return false;const bucket=Math.floor(now/30000);
  return reference===viewTag(identity,bucket)||(bucket>0&&reference===viewTag(identity,bucket-1));
}
export class LiveFrameCache {
  private values = new Map<string, Entry & {digest:string;lineage:object}>();
  private size = 0;
  private maximum: number;
  private now: () => number;
  constructor(maximum = 4 * 1024 * 1024, now: () => number = Date.now) { this.maximum = maximum; this.now = now; }
  private remove(device: string) { const old = this.values.get(device); if (old) this.size -= old.bytes.length; this.values.delete(device); }
  put(device: string, value: Entry) {
    const prior=this.values.get(device);
    const lineage=prior&&prior.owner===value.owner&&prior.session===value.session&&prior.expires>this.now()?prior.lineage:{};
    this.remove(device);
    for (const [id, old] of this.values) if (old.expires <= this.now()) this.remove(id);
    if (value.bytes.length > 256 * 1024 || value.expires <= this.now()) return;
    while (this.size + value.bytes.length > this.maximum && this.values.size) this.remove(this.values.keys().next().value!);
    if (value.bytes.length > this.maximum) return;
    const bytes=new Uint8Array(value.bytes);
    this.values.set(device, { ...value, bytes, digest:createHash("sha256").update(bytes).digest("hex"),lineage }); this.size += value.bytes.length;
  }
  get(device: string, owner: string, session: string, key: string): Uint8Array | null {
    const value = this.values.get(device);
    if (!value) return null;
    if (value.expires <= this.now()) { this.remove(device); return null; }
    if (value.owner !== owner || value.session !== session || value.key !== key) return null;
    return new Uint8Array(value.bytes);
  }
  hints(owner:string,device:string|null):string[] {
    const keys:string[]=[];
    for(const [id,value] of this.values){if(value.expires<=this.now()){this.remove(id);continue;}if(value.owner===owner&&(device==null||id===device)){keys.push(value.key);if(keys.length===16)break;}}
    return keys;
  }
  holdHint(device:string,owner:string) {
    const entry=this.values.get(device);
    if(!entry||entry.owner!==owner||entry.expires<=this.now())return undefined;
    // Keep the hinted bytes for one in-flight snapshot. The reader must
    // supply the session, key and digest verified by that D1 snapshot.
    return {device,key:entry.key,readAfterReplacement:(session:string,key:string,digest:string):Uint8Array|null=>{
      const live=this.values.get(device),now=this.now();
      // Clearing/evicting and then repopulating the same session is not an
      // uninterrupted publication. Never revive a pin across that boundary.
      if(live?.lineage!==entry.lineage)return null;
      if(!live||live.owner!==owner||live.session!==session||live.key===key||live.expires<=now)return null;
      if(entry.session!==session||entry.key!==key||entry.digest!==digest||entry.expires<=now)return null;
      return new Uint8Array(entry.bytes);
    }};
  }
  holdHints(owner:string,device:string|null) {
    // Pin only this owner's bounded hints before D1 resolves an implicit
    // device. Neither the cache nor a hint chooses the authorized device.
    const held:NonNullable<ReturnType<LiveFrameCache["holdHint"]>>[]=[];
    for(const id of this.values.keys()){
      if(device!==null&&id!==device)continue;
      const hint=this.holdHint(id,owner);
      if(hint){held.push(hint);if(held.length===16)break;}
    }
    return held;
  }
  getExact(device:string,owner:string,session:string,key:string,digest:string):Uint8Array|null {
    const value=this.values.get(device);
    if(!value||value.digest!==digest)return null;
    return this.get(device,owner,session,key);
  }
  // Only controls when to read D1. Every frame still needs the scoped snapshot.
  hasCommitAfter(barrier:FrameCommitBarrier):boolean {
    const entry=this.values.get(barrier.device),mark=entry?.commit,now=this.now();
    if(!entry||!mark||entry.owner!==barrier.owner||entry.session!==barrier.session||entry.expires<=now)return false;
    const age=now-mark.captureLower;
    return mark.worker===barrier.worker&&mark.lease===barrier.lease&&mark.captureMono>barrier.captureAfter&&age>=0&&age<=1499&&
      (barrier.readyCueCommandID===undefined||mark.readyCueCommandID===barrier.readyCueCommandID);
  }
  // References only suppress retransmission of already delivered image bytes.
  // They never authorize a screen read, renew capture age, or permit input.
  rememberView(identity:ScreenViewIdentity):string {
    return screenViewReference(identity,this.now());
  }
  matchesView(reference:string,identity:ScreenViewIdentity):boolean {
    return screenViewMatches(reference,identity,this.now());
  }
  clear(device: string, session?: string) {
    if (!session || this.values.get(device)?.session === session) this.remove(device);
  }
  expire(device: string, key: string) { const value = this.values.get(device); if (value?.key === key && value.expires <= this.now()) this.remove(device); }
  get byteLength() { return this.size; }
}
export const liveFrames = new LiveFrameCache();
