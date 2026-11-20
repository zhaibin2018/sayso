import { createHash } from "node:crypto";

export type PixelEntry = { owner:string; device:string; session:string; key:string; sha256:string; bytes:Uint8Array; expires:number };
export type PixelStore = { match(request:Request):Promise<Response|undefined>; put(request:Request,response:Response):Promise<void>; delete(request:Request):Promise<boolean> };
const digest=(value:string|Uint8Array)=>createHash("sha256").update(value).digest("hex");
const maximum=256*1024;

// Named Worker cache, never an HTTP response cache or an authorization cache.
// Every use must match the current D1 owner/device/session/key/hash snapshot.
export class PrivatePixelCache {
  private origin:string;private open:()=>Promise<PixelStore>;private now:()=>number;private budgetMS:number;
  constructor(origin:string,open:()=>Promise<PixelStore>,now:()=>number=Date.now,budgetMS=20) {this.origin=origin;this.open=open;this.now=now;this.budgetMS=budgetMS;}
  private request(owner:string,device:string|null):Request {
    return new Request(new URL("/__sayso_private_pixels/v1/"+digest(JSON.stringify([owner,device])),this.origin));
  }
  private tombstone(owner:string,device:string,session:string):Request {return new Request(new URL("/__sayso_private_pixels/cleared/"+digest(JSON.stringify([owner,device,session])),this.origin));}
  private async blocked(cache:PixelStore,value:Pick<PixelEntry,"owner"|"device"|"session">) {return Number((await cache.match(this.tombstone(value.owner,value.device,value.session)))?.headers.get("x-sb-clear-until")??0)>this.now();}
  async peek(owner:string,device:string|null):Promise<PixelEntry|null> {
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      return await Promise.race([this.read(owner,device).catch(()=>null),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),this.budgetMS);})]);
    } finally {if(timer)clearTimeout(timer);}
  }
  private async read(owner:string,device:string|null):Promise<PixelEntry|null> {
    const response=await (await this.open()).match(this.request(owner,device));
    if(!response||response.status!==200)return null;
    const h=response.headers,scopeOwner=h.get("x-sb-owner"),id=h.get("x-sb-device"),session=h.get("x-sb-session"),key=h.get("x-sb-key"),sha256=h.get("x-sb-sha256"),expires=Number(h.get("x-sb-expires")),length=Number(h.get("content-length"));
    if(scopeOwner!==digest(owner)||!id||!session||!key||key.length>512||!sha256||!/^[0-9a-f]{64}$/.test(sha256)||device!==null&&device!==id||!Number.isFinite(expires)||expires<=this.now()||expires>this.now()+30000||!Number.isInteger(length)||length<=0||length>maximum)return null;
    const reader=response.body?.getReader();if(!reader)return null;
    const pieces:Uint8Array[]=[];let size=0;
    try {while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>maximum||size>length){await reader.cancel();return null;}pieces.push(next.value);}}
    finally {reader.releaseLock();}
    if(size!==length||expires<=this.now())return null;
    const bytes=new Uint8Array(size);let offset=0;for(const piece of pieces){bytes.set(piece,offset);offset+=piece.length;}
    if(digest(bytes)!==sha256)return null;
    return {owner,device:id,session,key,sha256,bytes,expires};
  }
  async put(value:PixelEntry):Promise<void> {
    try {
      const expires=Math.min(value.expires,this.now()+30000),ttl=Math.floor((expires-this.now())/1000);
      if(ttl<1||!value.bytes.length||value.bytes.length>maximum||digest(value.bytes)!==value.sha256)return;
      const cache=await this.open();if(await this.blocked(cache,value))return;
      const response=new Response(new Uint8Array(value.bytes).buffer,{headers:{"Content-Type":"image/jpeg","Content-Length":String(value.bytes.length),"Cache-Control":"public, max-age="+ttl,
        "x-sb-owner":digest(value.owner),"x-sb-device":value.device,"x-sb-session":value.session,"x-sb-key":value.key,"x-sb-sha256":value.sha256,"x-sb-expires":String(expires)}});
      // These keys exist only inside this named cache; no route serves them.
      await Promise.all([cache.put(this.request(value.owner,value.device),response.clone()),cache.put(this.request(value.owner,null),response)]);
      // A delayed pre-stop write cannot resurrect a stopped session's pixels.
      if(await this.blocked(cache,value))await this.remove(cache,value.owner,value.device,value.session);
    } catch { /* Optimization failure must retain the ordinary D1 path. */ }
  }
  private async remove(cache:PixelStore,owner:string,device:string,session:string) {await Promise.all([device,null].map(async id=>{const request=this.request(owner,id),stored=await cache.match(request);if(stored?.headers.get("x-sb-device")===device&&stored.headers.get("x-sb-session")===session)await cache.delete(request);}));}
  async clear(owner:string,device:string,session:string):Promise<void> {
    try {const cache=await this.open();await cache.put(this.tombstone(owner,device,session),new Response("",{headers:{"Cache-Control":"public, max-age=31","x-sb-clear-until":String(this.now()+31000)}}));await this.remove(cache,owner,device,session);}catch{/* Best-effort pixel deletion; D1 always revokes access first. */}
  }
}
