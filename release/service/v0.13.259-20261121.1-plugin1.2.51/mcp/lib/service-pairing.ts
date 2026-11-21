import {Buffer} from 'node:buffer';
import {BridgeError,hash,need,type User} from './bridge-engine.ts';

export const pairingLifetimeMS=300_000;
export const installPairingLifetimeMS=900_000;
const info=new TextEncoder().encode('ScreenBridge developer bootstrap v1');
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const tokenPattern=/^[A-Za-z0-9_-]{43}$/;
const token=()=>Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
type PairArguments={request_id:string;public_key:string};
type PairRow={request_id:string;owner_id:string;owner_label:string;public_key:string;expires_at:number;created_at:number|null;code_expires_at:number|null;issued_at:number|null;code_hash:string|null;gate_hash:string|null;used_at:number|null};
export function validatePairing(value:Record<string,unknown>):PairArguments {
  need(Object.keys(value).sort().join(',')==='public_key,request_id'&&typeof value.request_id==='string'&&idPattern.test(value.request_id)&&
    typeof value.public_key==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(value.public_key),'PAIR_INPUT',400);
  const key=Buffer.from(value.public_key,'base64');
  need(key.length===32&&key.toString('base64')===value.public_key&&key.some(n=>n!==0),'PAIR_KEY',400);
  return value as PairArguments;
}
/** Reject non-canonical field encodings and every low-order X25519 point before storage. */
export async function validatePairingKey(publicKey:string) {
  const bytes=Buffer.from(publicKey,'base64');
  const coordinate=BigInt('0x'+Buffer.from(bytes).reverse().toString('hex'));
  need(coordinate<(BigInt(1)<<BigInt(255))-BigInt(19),'PAIR_KEY',400);
  const keys=await crypto.subtle.generateKey('X25519',false,['deriveBits']) as CryptoKeyPair;
  try {
    const peer=await crypto.subtle.importKey('raw',bytes,'X25519',false,[]);
    const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'X25519',public:peer},keys.privateKey,256));
    need(shared.some(n=>n!==0),'PAIR_KEY',400);
  }catch {throw new BridgeError('PAIR_KEY',400);}
}
export async function sealPairing(payload:unknown,recipient:string) {
  const keys=await crypto.subtle.generateKey('X25519',true,['deriveBits']) as CryptoKeyPair;
  const peer=await crypto.subtle.importKey('raw',Buffer.from(recipient,'base64'),'X25519',false,[]);
  let shared:ArrayBuffer;
  try {shared=await crypto.subtle.deriveBits({name:'X25519',public:peer},keys.privateKey,256);}
  catch {throw new BridgeError('PAIR_KEY',400);}
  const salt=crypto.getRandomValues(new Uint8Array(16)),nonce=crypto.getRandomValues(new Uint8Array(12));
  const base=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info},base,{name:'AES-GCM',length:256},false,['encrypt']);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:info},key,new TextEncoder().encode(JSON.stringify(payload)));
  const envelope={version:1,ephemeral_public_key:Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('base64'),
    salt:Buffer.from(salt).toString('base64'),nonce:Buffer.from(nonce).toString('base64'),ciphertext:Buffer.from(encrypted).toString('base64')};
  return Buffer.from(JSON.stringify(envelope)).toString('base64url');
}
export class ServicePairing {
  readonly db:D1Database;readonly origin:string;readonly gate?:string;readonly now:()=>number;
  constructor(db:D1Database,origin:string,gate?:string,now:()=>number=Date.now) {
    this.db=db;this.origin=origin;this.gate=gate;this.now=now;
    const url=new URL(origin);need(url.protocol==='https:'&&url.origin===origin&&!url.username&&!url.password,'PAIR_ORIGIN',400);
  }
  private stmt(sql:string,...values:(string|number|null)[]) {return this.db.prepare(sql).bind(...values);}
  private async row(id:string) {return this.stmt('SELECT * FROM sb_pairing_requests WHERE request_id=?',id).first<PairRow>();}
  private check(row:PairRow|null,args:PairArguments,user:User) {
    need(row,'PAIR_NOT_FOUND',404);need(row.owner_id===user.id,'PAIR_IDENTITY',403);
    need(row.public_key===args.public_key,'PAIR_KEY_MISMATCH',409);
    need(row.expires_at>this.now(),'PAIR_EXPIRED',410);
    return row;
  }
  async create(user:User,value:Record<string,unknown>) {
    const args=validatePairing(value);need(user.id,'PAIR_IDENTITY',401);
    await validatePairingKey(args.public_key);
    await this.stmt('INSERT OR IGNORE INTO sb_pairing_requests(request_id,owner_id,owner_label,public_key,expires_at) VALUES(?,?,?,?,?)',
      args.request_id,user.id,user.label,args.public_key,this.now()+pairingLifetimeMS).run();
    this.check(await this.row(args.request_id),args,user);
    const url=new URL('/pair',this.origin);url.searchParams.set('req',args.request_id);url.searchParams.set('pk',args.public_key);
    return {pairing_url:url.href,expires_in_seconds:300};
  }
  /** Only called through the owner-authenticated install route. No upsert or TTL refresh. */
  async install(user:User,installedOwner:string|undefined,value:Record<string,unknown>) {
    need(installedOwner&&user.id===installedOwner,'PAIR_IDENTITY',403);
    need(Object.keys(value).sort().join(',')==='created_at,public_key,request_id','PAIR_INPUT',400);
    const args=validatePairing({request_id:value.request_id,public_key:value.public_key});
    const created=value.created_at,now=this.now();
    need(typeof created==='number'&&Number.isSafeInteger(created)&&created>=0&&created<=now,'PAIR_CREATED_AT',400);
    need(created+installPairingLifetimeMS>now,'PAIR_EXPIRED',410);
    await validatePairingKey(args.public_key);
    await this.stmt('INSERT OR IGNORE INTO sb_pairing_requests(request_id,owner_id,owner_label,public_key,created_at,expires_at) VALUES(?,?,?,?,?,?)',
      args.request_id,user.id,user.label,args.public_key,created,created+installPairingLifetimeMS).run();
    const row=this.check(await this.row(args.request_id),args,user);
    need(row.created_at===created,'PAIR_REQUEST_MISMATCH',409);
    need(row.issued_at===null&&row.used_at===null,'PAIR_ALREADY_ISSUED',409);
    const url=new URL('/pair',this.origin);url.searchParams.set('req',args.request_id);
    return {pairing_url:url.href,expires_at:Math.floor(row.expires_at/1000)};
  }
  private async arguments(user:User,value:Record<string,unknown>):Promise<PairArguments> {
    if(Object.keys(value).join(',')!=='request_id')return validatePairing(value);
    need(typeof value.request_id==='string'&&idPattern.test(value.request_id),'PAIR_INPUT',400);
    const row=await this.row(value.request_id);
    need(row,'PAIR_NOT_FOUND',404);need(row.owner_id===user.id,'PAIR_IDENTITY',403);
    // Request-only URLs are reserved for install-seeded records.
    need(row.created_at!==null,'PAIR_INPUT',400);
    return validatePairing({request_id:row.request_id,public_key:row.public_key});
  }
  async inspect(user:User,value:Record<string,unknown>) {
    const args=await this.arguments(user,value),row=this.check(await this.row(args.request_id),args,user);
    return {expires_at:Math.floor(row.expires_at/1000)};
  }
  async issue(user:User,value:Record<string,unknown>) {
    const args=await this.arguments(user,value);const row=this.check(await this.row(args.request_id),args,user);
    need(row.issued_at===null,'PAIR_ALREADY_ISSUED',409);
    need(this.gate&&/^[A-Za-z0-9._~+\/-]{16,4096}={0,2}$/.test(this.gate),'PAIR_UNAVAILABLE',503);
    const code=token(),gateHash=await hash(this.gate),now=this.now();
    const codeExpires=Math.min(row.expires_at,now+pairingLifetimeMS);
    const capsule=await sealPairing({version:1,server_origin:this.origin,request_id:args.request_id,pairing_code:code,
      site_gate_token:this.gate,expires_at:Math.floor(codeExpires/1000)},args.public_key);
    const result=await this.stmt('UPDATE sb_pairing_requests SET issued_at=?,code_hash=?,gate_hash=?,code_expires_at=? WHERE request_id=? AND owner_id=? AND public_key=? AND expires_at>? AND issued_at IS NULL',
      now,await hash(code),gateHash,codeExpires,args.request_id,user.id,args.public_key,this.now()).run();
    if(result.meta.changes!==1) {
      this.check(await this.row(args.request_id),args,user);throw new BridgeError('PAIR_ALREADY_ISSUED',409);
    }
    return {capsule,expires_at:Math.floor(codeExpires/1000)};
  }
  async redeem(value:Record<string,unknown>,clientKey:string) {
    need(Object.keys(value).sort().join(',')==='name,pairing_code,request_id'&&typeof value.request_id==='string'&&idPattern.test(value.request_id)&&
      typeof value.pairing_code==='string'&&tokenPattern.test(value.pairing_code)&&typeof value.name==='string'&&value.name.length>0&&value.name.length<=80,'PAIR_INPUT',400);
    const now=this.now(),window=Math.floor(now/60_000);
    const rate=await this.stmt('INSERT INTO sb_rate_windows(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count',
      'l06:'+await hash(clientKey)+':'+window,now+120_000).first<{count:number}>();need(rate&&rate.count<=10,'PAIR_RATE_LIMITED',429);
    const row=await this.row(value.request_id);need(row&&row.code_hash===await hash(value.pairing_code),'PAIR_CODE_INVALID',400);
    need(Math.min(row.expires_at,row.code_expires_at??row.expires_at)>now,'PAIR_EXPIRED',410);need(row.used_at===null,'PAIR_CODE_USED',409);
    need(this.gate&&row.gate_hash===await hash(this.gate),'PAIR_GATE_CHANGED',401);
    const deviceID=crypto.randomUUID(),deviceToken=token(),expires=now+30*86400_000;
    const results=await this.db.batch([
      this.stmt('UPDATE sb_pairing_requests SET used_at=?,device_id=? WHERE request_id=? AND code_hash=? AND used_at IS NULL AND expires_at>? AND COALESCE(code_expires_at,expires_at)>?',now,deviceID,value.request_id,row.code_hash,now,now),
      this.stmt('INSERT INTO sb_devices(id,owner_id,name,token_hash,token_expires,created_at,pairing_gate_hash) SELECT ?,owner_id,?,?,?,?,gate_hash FROM sb_pairing_requests WHERE request_id=? AND device_id=?',
        deviceID,value.name,await hash(deviceToken),expires,now,value.request_id,deviceID),
    ]);
    need(results[1].meta.changes===1,'PAIR_CODE_USED',409);
    return {request_id:value.request_id,device_id:deviceID,device_token:deviceToken,token_expires_at:new Date(expires).toISOString(),user_label:row.owner_label};
  }
}
