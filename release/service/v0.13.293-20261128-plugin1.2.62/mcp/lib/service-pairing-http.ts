import {BridgeError,type User} from './bridge-engine.ts';
import {boundedBody} from './bounded-body.ts';
import {ServicePairing} from './service-pairing.ts';

export const pairingHeaders={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
export const pairingScript=`const zh=navigator.language.startsWith('zh'),t=(a,b)=>zh?a:b;
const button=document.querySelector('button'),status=document.querySelector('[role=status]'),link=document.querySelector('#open-sayso');
document.title=t('连接 SaySo','Connect SaySo');document.documentElement.lang=zh?'zh-Hans':'en';
document.querySelector('h1').textContent=t('连接这台手机','Connect this iPhone');
button.textContent=t('生成连接','Generate connection');link.textContent=t('回到 SaySo 完成连接','Return to SaySo to connect');
const messages={
PAIR_ALREADY_ISSUED:t('已经生成过了，请点下面的链接；如果没回到 SaySo，回 App 重新开始。','Already generated. Tap the link below, or start again in SaySo.'),
PAIR_EXPIRED:t('这个连接请求已过期，回到 SaySo 重新点“连接 ChatGPT”。','This request expired. Return to SaySo and tap Connect ChatGPT again.'),
PAIR_NOT_FOUND:t('找不到这个请求，请回 SaySo 重新开始。','Request not found. Start again in SaySo.'),
PAIR_IDENTITY:t('请用安装 SaySo 的 ChatGPT 账号打开。','Open with the ChatGPT account that installed SaySo.'),
PAIR_KEY_MISMATCH:t('这个链接不是这台手机发起的，请回 SaySo 重新开始。','This link belongs to another request. Start again in SaySo.'),
PAIR_INPUT:t('连接链接无效，请回 SaySo 重新开始。','Invalid link. Start again in SaySo.'),
PAIR_KEY:t('连接请求无效，请回 SaySo 重新开始。','Invalid request. Start again in SaySo.'),
PAIR_ORIGIN:t('请从 ChatGPT 重新打开连接页面。','Reopen this page from ChatGPT.'),
PAIR_UNAVAILABLE:t('连接服务尚未准备好，请稍后重试。','The connection service is not ready. Try later.')};
let closed=false,issued=false,timer;
const clear=()=>{link.removeAttribute('href');link.hidden=true;clearTimeout(timer);};
window.addEventListener('pagehide',()=>{closed=true;clear();});
button.addEventListener('click',async()=>{
if(closed)return;if(issued){status.textContent=messages.PAIR_ALREADY_ISSUED;return;}if(button.disabled)return;
button.disabled=true;status.textContent=t('正在生成连接…','Generating connection…');
try{const q=new URL(location.href).searchParams;
const response=await fetch('/api/pairing/capsule',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:q.get('req'),...(q.has('pk')?{public_key:q.get('pk')}:{})})});
const data=await response.json();if(closed)return;
if(!response.ok){status.textContent=messages[data.error]??t('连接未完成，请回 SaySo 重新开始。','Could not connect. Start again in SaySo.');return;}
if(typeof data.capsule!=='string'||!/^[A-Za-z0-9_-]{1,22000}$/.test(data.capsule)||!Number.isFinite(data.expires_at))throw 0;
issued=true;link.href='sayso://connect#'+data.capsule;link.hidden=false;
timer=setTimeout(()=>{clear();status.textContent=messages.PAIR_EXPIRED;},Math.max(0,data.expires_at*1000-Date.now()));
status.textContent=t('请亲手点“回到 SaySo 完成连接”。','Tap Return to SaySo to connect.');
}catch{if(!closed)status.textContent=t('网络未连上。可以再试一次，或回 SaySo 重新开始。','Connection failed. Try again, or start again in SaySo.');}
finally{if(!closed)button.disabled=false;}});`;
export const pairingPage=`<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接 SaySo / Connect SaySo</title>
<style>body{font:1rem system-ui;margin:0;min-height:100svh;display:grid;place-items:center;background:#f6f7fb;color:#20233c}main{padding:2rem 1.5rem;max-width:34rem}h1{font-size:1.8rem;line-height:1.25}p{line-height:1.65}button,a{font:inherit;min-height:48px;padding:.85rem 1.2rem;border:0;border-radius:1rem;background:#5243a8;color:white}a{display:inline-flex;align-items:center;margin-top:1rem;text-decoration:underline;text-underline-offset:.2em;box-sizing:border-box}a[hidden]{display:none}button:disabled{opacity:.65}:focus-visible{outline:3px solid #37266f;outline-offset:4px}#notice{color:#50516c}</style></head>
<body><main><h1>连接这台手机 / Connect this iPhone</h1><p>请用安装 SaySo 的 ChatGPT 账号打开。<br>Open with the ChatGPT account that installed SaySo.</p><button type="button">生成连接 / Generate connection</button><br><a id="open-sayso" hidden>回到 SaySo 完成连接 / Return to SaySo to connect</a><p role="status" aria-live="polite"></p><p id="notice">不要截图或转发这个页面。<br>Do not screenshot or forward this page.</p></main><script src="/pair.js" defer></script></body></html>`;

function owner(request:Request):User {
  const id=request.headers.get('oai-authenticated-user-id');
  if(!id?.trim()||id.length>256)throw new BridgeError('PAIR_IDENTITY',401);
  return {id,label:(request.headers.get('oai-authenticated-user-email')??'SaySo').slice(0,120)};
}
export async function pairingRoute(request:Request,env:{DB?:D1Database;SAYSO_SITE_GATE_TOKEN?:string;SAYSO_INSTALL_OWNER_ID?:string},now:()=>number=Date.now):Promise<Response|null> {
  const url=new URL(request.url),path=url.pathname;
  if(!['/pair','/pair.js','/api/pairing/capsule','/api/pairing/redeem','/api/pairing/install'].includes(path))return null;
  const json=(value:unknown,status=200)=>Response.json(value,{status,headers:pairingHeaders});
  try {
    // Read-only identity discovery for the installer, behind owner-only Sites dispatch.
    // Reading never sets an owner; the installer pins it separately after checking Site access.
    if(path==='/api/pairing/install'&&request.method==='GET') {
      const user=owner(request);
      if(env.SAYSO_INSTALL_OWNER_ID&&user.id!==env.SAYSO_INSTALL_OWNER_ID)throw new BridgeError('PAIR_IDENTITY',403);
      return json(user);
    }
    if(path==='/pair'||path==='/pair.js') {
      if(!['GET','HEAD'].includes(request.method))throw new BridgeError('PAIR_METHOD',405);
      const user=owner(request); // A dispatch access token alone is not a browser identity.
      if(path==='/pair') {
        if(!env.DB)throw new BridgeError('PAIR_UNAVAILABLE',503);
        await new ServicePairing(env.DB,url.origin,env.SAYSO_SITE_GATE_TOKEN,now).inspect(user,{request_id:url.searchParams.get('req'),...(url.searchParams.has('pk')?{public_key:url.searchParams.get('pk')}:{})});
      }
      return new Response(request.method==='HEAD'?null:path==='/pair'?pairingPage:pairingScript,{headers:{...pairingHeaders,'Content-Type':path==='/pair'?'text/html; charset=utf-8':'text/javascript; charset=utf-8'}});
    }
    if(request.method!=='POST')throw new BridgeError('PAIR_METHOD',405);
    if((path.endsWith('/capsule')||path.endsWith('/install'))&&request.headers.get('Origin')!==url.origin)throw new BridgeError('PAIR_ORIGIN',403);
    const user=path.endsWith('/redeem')?null:owner(request);
    if(path.endsWith('/install')) {
      if(!env.SAYSO_INSTALL_OWNER_ID)throw new BridgeError('PAIR_OWNER_UNCONFIGURED',503);
      if(user!.id!==env.SAYSO_INSTALL_OWNER_ID)throw new BridgeError('PAIR_IDENTITY',403);
    }
    if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')throw new BridgeError('PAIR_CONTENT',415);
    let body:Record<string,unknown>;
    try {body=JSON.parse(new TextDecoder().decode(await boundedBody(request,4096,10_000)));}
    catch(error){if(error instanceof BridgeError)throw error;throw new BridgeError('PAIR_INPUT',400);}
    if(!body||typeof body!=='object'||Array.isArray(body))throw new BridgeError('PAIR_INPUT',400);
    if(!env.DB)throw new BridgeError('PAIR_UNAVAILABLE',503);
    const service=new ServicePairing(env.DB,url.origin,env.SAYSO_SITE_GATE_TOKEN,now);
    // Redeem requires dispatch's private Site gate; dispatch consumes that header.
    if(path.endsWith('/install'))return json(await service.install(user!,env.SAYSO_INSTALL_OWNER_ID,body));
    return json(user?await service.issue(user,body):await service.redeem(body,request.headers.get('CF-Connecting-IP')??'unknown'));
  }catch(error){
    const code=error instanceof BridgeError?error.code:'PAIR_UNAVAILABLE',status=error instanceof BridgeError?error.status:503;
    if(path==='/pair') {
      const message=code==='PAIR_EXPIRED'?'这个连接请求已过期。 / This connection request expired.':
        code==='PAIR_IDENTITY'?'请用安装 SaySo 的 ChatGPT 账号打开。 / Use the ChatGPT account that installed SaySo.':
        '连接请求无效或暂时不可用。 / This connection request is invalid or unavailable.';
      return new Response(`<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SaySo</title><main><h1>${message}</h1><p>回到 SaySo，重新点“连接 ChatGPT”。<br>Return to SaySo and tap Connect ChatGPT again.</p><p>${code}</p></main></html>`,{status,headers:{...pairingHeaders,'Content-Type':'text/html; charset=utf-8'}});
    }
    return json({error:code},status);
  }
}
