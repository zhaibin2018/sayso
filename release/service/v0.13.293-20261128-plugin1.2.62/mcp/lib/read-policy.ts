// Missing-source recovery patience is separate from the age of returned pixels.
// Normal fresh reads return immediately;no capture or input is requested.
export const readRecoveryDefaultMS=3000;
export const readRecoveryMaximumMS=15000;

export const liveFrameAgeLimitMS=1000;
export const visualReadAgeLimitMS=2000;
export const actionAfterImageAgeLimitMS=2000;
export const clickRelookMaxGapMS=5000;

export type ImageObservationDeadline={remainingMS:()=>number;signal?:AbortSignal;expire:()=>void};

/** Bound read-only image work. The callback must stop starting I/O on abort. */
export async function beforeImageObservationDeadline<T>(
  deadline:ImageObservationDeadline,read:(signal:AbortSignal)=>Promise<T>,
):Promise<T|undefined> {
  const remaining=Math.floor(deadline.remainingMS());
  if(!Number.isFinite(remaining)||remaining<=0||deadline.signal?.aborted)return undefined;
  const scope=new AbortController();
  let cancel:()=>void=()=>{};
  const expired=new Promise<undefined>(resolve=>{
    cancel=()=>{deadline.expire();scope.abort();resolve(undefined);};
  });
  const timer=setTimeout(cancel,remaining);
  deadline.signal?.addEventListener("abort",cancel,{once:true});
  try{
    const result=await Promise.race([read(scope.signal),expired]);
    return scope.signal.aborted?undefined:result;
  }finally{
    clearTimeout(timer);
    deadline.signal?.removeEventListener("abort",cancel);
  }
}

/** The server's authenticated capture lower bound yields an upper age bound. */
export function liveFrameAge(now:number,captureLower:unknown,maximum=liveFrameAgeLimitMS,strictLimit=liveFrameAgeLimitMS) {
  if(typeof captureLower!=="number"||!Number.isFinite(captureLower))return null;
  const age=now-captureLower;
  return age>=0&&age<strictLimit&&age<=maximum?age:null;
}

// The minimum interval is measured between attempt starts. The deadline
// still controls whether the caller may start the next attempt.
export function nextPollDelayMS(intervalMS:number,started:number,now:number,deadline:number) {
  const spacingLeft=Math.max(0,intervalMS-Math.max(0,now-started));
  return Math.ceil(Math.min(spacingLeft,Math.max(0,deadline-now)));
}

/** Internal samples come only from an authorized, live, genuinely captured row. */
export type AdvancingReadFrame = {
  scope:string;frame:string;sequence:number;source:number|null;captureMono:number;captureLower:number;
};
const validFrame=(f:AdvancingReadFrame|undefined):f is AdvancingReadFrame=>!!f&&
  typeof f.scope==="string"&&f.scope.length>0&&typeof f.frame==="string"&&f.frame.length>0&&
  Number.isSafeInteger(f.sequence)&&f.sequence>=0&&(f.source===null||Number.isSafeInteger(f.source)&&f.source>=0)&&
  Number.isFinite(f.captureMono)&&f.captureMono>=0&&Number.isFinite(f.captureLower);

export function advancingReadDelayMS(o:{ordinary:boolean;delay:number;requestStarted:number;attemptStarted:number;now:number;deadline:number;
  previous?:AdvancingReadFrame;current?:AdvancingReadFrame}) {
  const a=o.previous,b=o.current;
  // Keep the established 150 ms minimum start spacing, but do not add idle
  // backoff behind slow serial D1 reads while fresh captures are progressing.
  // The original backoff/deadline keep running; this is not a new timeout.
  if(!o.ordinary||!validFrame(a)||!validFrame(b)||a.scope!==b.scope||a.frame===b.frame||
    b.sequence<=a.sequence||b.captureMono<=a.captureMono||b.captureLower<=a.captureLower||
    !(a.source===null&&b.source===null||a.source!==null&&b.source!==null&&b.source>a.source)||
    ![o.delay,o.requestStarted,o.attemptStarted,o.now,o.deadline].every(Number.isFinite)||o.delay<0||
    o.now<o.requestStarted||o.now<o.attemptStarted||o.now>=o.requestStarted+2000||o.now>=o.deadline)return o.delay;
  const delay=Math.min(o.delay,nextPollDelayMS(150,o.attemptStarted,o.now,o.deadline));
  return o.now+delay<Math.min(o.deadline,o.requestStarted+2000)?delay:o.delay;
}
