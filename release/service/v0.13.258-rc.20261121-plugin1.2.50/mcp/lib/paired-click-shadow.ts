// Diagnostic only. No promise, timer, I/O, pixels, authority or scheduling API.
export type ShadowScope={owner:string;device:string;session:string;broadcast:string;worker:string;lease:number;
  control:number;hardware:string;boot:string;move:string;click:string};
export type ShadowReceipt=ShadowScope&{ack:number};
export type ShadowFrame=Pick<ShadowScope,"owner"|"device"|"session"|"broadcast"|"worker"|"lease">&{
  frame:string;capture:number;age:number};
type Mark={at:number;frame:string;age:number};
type RegistrationScope=Omit<ShadowScope,"broadcast">&{broadcast?:string};
type Entry={scope:RegistrationScope;started:number;deadline:number;ack?:number;anchorAt?:number;
  receiptNotice?:number;receiptRead?:number;firstFrame?:Mark;lastFrame?:Mark;frameCount:number;frames:Set<string>;abort?:()=>void};
export type ShadowProjection=(owner:string,fields:Record<string,unknown>)=>Record<string,number>|undefined;
export type ShadowTicket={observedReceipt:(receipt:ShadowReceipt)=>void;freeze:()=>ShadowProjection|undefined;close:()=>void};
export const pairedClickShadow=Symbol("paired_click_shadow");
const scopeKeys=["owner","device","session","broadcast","worker","lease","control","hardware","boot","move","click"] as const;
const frameKeys=["owner","device","session","broadcast","worker","lease"] as const;
const numeric=(x:unknown):x is number=>typeof x==="number"&&Number.isFinite(x);
const object=(x:unknown):Record<string,unknown>=>x!==null&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
const elapsed=(a:number,b:number)=>Math.round((a-b)*100)/100;

/** Same-isolate observations are incomplete; a miss never means no commit occurred. */
export class PairedClickShadowRegistry {
  private entries=new Map<symbol,Entry>();
  private now:()=>number;
  constructor(now:()=>number=()=>performance.now()){this.now=now;}
  private sweep(at:number){for(const [id,e] of this.entries)if(at>=e.deadline)this.remove(id);}
  private remove(id:symbol){const e=this.entries.get(id);this.entries.delete(id);e?.abort?.();}
  private anchor(e:Entry,r:ShadowReceipt,at:number,notice:boolean){
    if(!scopeKeys.every(k=>k==="broadcast"&&e.scope.broadcast===undefined||e.scope[k]===r[k])||
      typeof r.broadcast!=="string"||!r.broadcast||!numeric(r.ack)||r.ack<0)return;
    if(e.ack!==undefined&&e.ack!==r.ack)return;
    e.scope.broadcast=r.broadcast;e.ack=r.ack;e.anchorAt??=at;
    if(notice)e.receiptNotice??=at;else e.receiptRead??=at;
  }
  register(scope:RegistrationScope,deadline:number,signal?:AbortSignal):ShadowTicket|undefined {
    try {
      const at=this.now();this.sweep(at);
      if(!numeric(at)||!numeric(deadline)||deadline<=at||deadline-at>6000||signal?.aborted||this.entries.size>=64||
        scope.move===scope.click||!scopeKeys.every(k=>k==="broadcast"&&scope[k]===undefined||
          (typeof scope[k]==="string"?scope[k].length>0&&scope[k].length<=256:numeric(scope[k])&&Number(scope[k])>=1)))return;
      const id=Symbol(),entry:Entry={scope:{...scope},started:at,deadline,frameCount:0,frames:new Set()};
      this.entries.set(id,entry);
      const close=()=>this.remove(id);
      if(signal){signal.addEventListener("abort",close,{once:true});entry.abort=()=>signal.removeEventListener("abort",close);}
      return {close,observedReceipt:r=>{try{const now=this.now();if(this.entries.get(id)===entry&&now<entry.deadline)this.anchor(entry,r,now,false);}catch{}},
        freeze:()=>{
          try {
            const end=this.now(),live=this.entries.get(id)===entry&&end<entry.deadline;
            this.remove(id);if(!live||entry.ack===undefined||!entry.scope.broadcast)return;
            const expected={...entry.scope},ack=entry.ack;
            const numbers:Record<string,number>={registered:1,receipt_commit_notice_seen:entry.receiptNotice===undefined?0:1,
              receipt_read_seen:entry.receiptRead===undefined?0:1,eligible_frame_commit_notices:entry.frameCount,
              registration_to_candidate_ready_ms:elapsed(end,entry.started)};
            if(entry.receiptNotice!==undefined){numbers.registration_to_receipt_commit_notice_ms=elapsed(entry.receiptNotice,entry.started);
              if(entry.receiptRead!==undefined)numbers.receipt_notice_to_receipt_read_ms=elapsed(entry.receiptRead,entry.receiptNotice);}
            if(entry.firstFrame){numbers.registration_to_first_frame_notice_ms=elapsed(entry.firstFrame.at,entry.started);
              numbers.first_frame_notice_to_candidate_ready_ms=elapsed(end,entry.firstFrame.at);
              numbers.first_frame_notice_age_upper_ms=entry.firstFrame.age;}
            const firstID=entry.firstFrame?.frame,lastID=entry.lastFrame?.frame;
            // Final serialization can replace or remove an image. Only its
            // actual qualified scope/ACK may expose these frozen numbers.
            return (owner,fields)=>{
              const after=object(fields.after_screen),m=object(after.metadata),p=object(after.after_command);
              const final={owner,device:fields.device_id,session:fields.bridge_session_id,broadcast:m.broadcast_id,
                worker:m.worker_id,lease:m.lease_epoch,control:m.control_epoch_at_read,hardware:fields.hardware_id,
                boot:fields.board_boot_id,move:fields.move_command_id,click:fields.command_id};
              if(!scopeKeys.every(k=>expected[k]===final[k])||fields.state!=="board_acked"||after.state!=="available"||
                p.command_id!==expected.click||p.phone_ack_mono_ms!==ack||p.scope_matches_at_snapshot!==true||
                p.relation!=="capture_after_phone_board_ack"||m.capture_clock_verified!==true||m.worker_id_at_read!==expected.worker||
                m.device_id!==expected.device||m.bridge_session_id!==expected.session||
                !numeric(m.age_ms)||m.age_ms<0||m.age_ms>=1000||!numeric(m.capture_lower_phone_mono_ms)||m.capture_lower_phone_mono_ms<=ack+300)return;
              return {...numbers,first_frame_notice_matches_returned:firstID===m.frame_id?1:0,
                latest_frame_notice_matches_returned:lastID===m.frame_id?1:0};
            };
          }catch{this.remove(id);return;}
        }};
    }catch{return;}
  }
  receiptCommitted(receipt:ShadowReceipt){
    try{const now=this.now();this.sweep(now);for(const e of this.entries.values())this.anchor(e,receipt,now,true);}catch{}
  }
  frameCommitted(frame:ShadowFrame){
    try {
      const now=this.now();this.sweep(now);
      if(!numeric(frame.capture)||!numeric(frame.age)||frame.age<0||frame.age>=1000||typeof frame.frame!=="string")return;
      for(const e of this.entries.values()){
        if(e.ack===undefined||e.anchorAt===undefined||now<e.anchorAt||!frameKeys.every(k=>e.scope[k]===frame[k])||
          frame.capture<=e.ack+300||e.frames.has(frame.frame)||e.frames.size>=255)continue;
        e.frames.add(frame.frame);
        const mark={at:now,frame:frame.frame,age:frame.age};e.firstFrame??=mark;e.lastFrame=mark;e.frameCount++;
      }
    }catch{}
  }
  get registrations(){return this.entries.size;}
}
export const livePairedClickShadow=new PairedClickShadowRegistry();
