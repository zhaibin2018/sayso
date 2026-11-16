export const pointReceiptProofHeader="X-SaySo-Point-Receipt-Proof";
export const pointReceiptProofMaximum=8192;
export const pointReceiptProofLifetimeMS=2000;

export type ImmutablePointReceiptRow={
  id:string;owner_id:string;device_id:string;session_id:string;hardware_id:string;board_boot_id:string;
  kind:string;payload:string;digest:string;precondition:string|null;worker_id:string;lease_epoch:number;
  control_epoch:number;created_at:number;expires_at:number;predecessor_id:string|null;
};
export type PreparedPointReceiptRow=ImmutablePointReceiptRow&{
  state:"executing";receipt:null;result_digest:null;error:null;phone_ack_mono_ms:null;input_attempted:null;
};
export type PreparedPointReceipt={move:PreparedPointReceiptRow;click:PreparedPointReceiptRow;broadcast:string;expires:number};
export type PointReceiptProof={version:1;issued:number;expires:number;broadcast:string;move:ImmutablePointReceiptRow;click:ImmutablePointReceiptRow};

const keys=["id","owner_id","device_id","session_id","hardware_id","board_boot_id","kind","payload","digest","precondition",
  "worker_id","lease_epoch","control_epoch","created_at","expires_at","predecessor_id"] as const;
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const time=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER;
const integer=(v:unknown,min:number):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min;
const bounded=(v:unknown,max:number):v is string=>typeof v==="string"&&v.length>0&&v.length<=max;

/** Preserve DB payload/precondition strings verbatim: the write fence compares them exactly. */
function row(value:unknown,exact:boolean):ImmutablePointReceiptRow|null {
  const r=object(value);
  if(!r||keys.some(k=>!Object.hasOwn(r,k))||(exact&&Object.keys(r).length!==keys.length))return null;
  if(![r.id,r.device_id,r.session_id,r.hardware_id,r.board_boot_id,r.worker_id].every(uuid)||
    !bounded(r.owner_id,256)||!bounded(r.payload,2048)||!(r.precondition===null||bounded(r.precondition,4096))||
    typeof r.digest!=="string"||!/^[0-9a-f]{64}$/.test(r.digest)||
    !integer(r.lease_epoch,1)||!integer(r.control_epoch,0)||!time(r.created_at)||!time(r.expires_at)||r.expires_at<=r.created_at||
    !(r.predecessor_id===null||uuid(r.predecessor_id))||!["pointer.move_absolute","pointer.click"].includes(String(r.kind)))return null;
  return Object.fromEntries(keys.map(k=>[k,r[k]])) as ImmutablePointReceiptRow;
}

function envelope(value:unknown):PointReceiptProof|null {
  const r=object(value);
  if(!r||Object.keys(r).length!==6||r.version!==1||!time(r.issued)||!time(r.expires)||!uuid(r.broadcast))return null;
  const move=row(r.move,true),click=row(r.click,true);
  if(!move||!click||move.kind!=="pointer.move_absolute"||click.kind!=="pointer.click"||move.id===click.id||
    move.predecessor_id!==null||click.predecessor_id!==move.id||r.issued<move.created_at||r.issued<click.created_at||
    r.expires<=r.issued||r.expires>r.issued+pointReceiptProofLifetimeMS||r.expires>Math.min(move.expires_at,click.expires_at))return null;
  for(const k of ["owner_id","device_id","session_id","hardware_id","board_boot_id","worker_id","lease_epoch","control_epoch","expires_at"] as const){
    if(move[k]!==click[k])return null;
  }
  try {
    const point=object(object(JSON.parse(move.precondition??"null"))?.point),button=object(JSON.parse(click.payload));
    if(!point||Object.keys(point).length!==2||point.protocol!=="paired_mouse_point.v1"||point.click_command_id!==click.id||
      !button||Object.keys(button).length!==1||button.button!=="left")return null;
  }catch{return null;}
  return {version:1,issued:r.issued,expires:r.expires,broadcast:r.broadcast,move,click};
}

export function makePointReceiptProof(moveValue:unknown,clickValue:unknown,broadcast:string,issued:number,tokenExpires:number):PointReceiptProof|null {
  const move=row(moveValue,false),click=row(clickValue,false);
  for(const value of [moveValue,clickValue]){
    const r=object(value);
    if(!r||r.state!=="executing"||r.result_digest!==null||r.receipt!==null||r.error!==null||r.phone_ack_mono_ms!==null||r.input_attempted!==null)return null;
  }
  if(!move||!click||!time(issued)||!time(tokenExpires))return null;
  return envelope({version:1,issued,expires:Math.min(issued+pointReceiptProofLifetimeMS,tokenExpires,move.expires_at,click.expires_at),broadcast,move,click});
}

export function pointReceiptProofJSON(proof:PointReceiptProof) {
  // Both outer and immutable-row field order are fixed. Nested DB JSON is opaque.
  return JSON.stringify({version:1,issued:proof.issued,expires:proof.expires,broadcast:proof.broadcast,
    move:Object.fromEntries(keys.map(k=>[k,proof.move[k]])),click:Object.fromEntries(keys.map(k=>[k,proof.click[k]]))});
}

export function readPointReceiptProof(json:string,moveID:string,now:number):PreparedPointReceipt|null {
  try {
    const proof=envelope(JSON.parse(json));
    if(!proof||!time(now)||now<proof.issued||now>=proof.expires||proof.move.id!==moveID||pointReceiptProofJSON(proof)!==json)return null;
    const prepare=(r:ImmutablePointReceiptRow):PreparedPointReceiptRow=>({...r,state:"executing",receipt:null,result_digest:null,error:null,phone_ack_mono_ms:null,input_attempted:null});
    return {move:prepare(proof.move),click:prepare(proof.click),broadcast:proof.broadcast,expires:proof.expires};
  }catch{return null;}
}
