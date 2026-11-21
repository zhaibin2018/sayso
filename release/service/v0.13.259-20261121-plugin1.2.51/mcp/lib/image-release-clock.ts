export type ImageReleaseClockSampler=(recheck:boolean)=>Promise<boolean>;

const clockWindowMS=50;
const clockTotalMS=2*clockWindowMS;

function openClockWindow() {
  let expired=false,timer:ReturnType<typeof setTimeout>;
  const timeout=new Promise<false>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(false);},clockWindowMS);});
  return {timeout,expired:()=>expired,close:()=>clearTimeout(timer)};
}

/** One serialized candidate. Only a completed post-serialization I/O proves time. */
export function imageReleaseClockSampler(read: (()=>Promise<unknown>)|undefined,now=Date.now):ImageReleaseClockSampler {
  let started=false,firstStartedAt:number;
  let retry:{window:ReturnType<typeof openClockWindow>;retained?:Promise<true>}|undefined;

  return async recheck=>{
    if(!read||(recheck?!retry||retry.window.expired():started))return false;
    const previous=retry;
    retry=undefined;
    if(!recheck){started=true;firstStartedAt=now();}

    const current=(async()=>{await read();return true as const;})();
    const window=previous?.window??openClockWindow();
    // A timed-out first request can still complete. A rejection cannot win the
    // recheck against a successful I/O, and the original window never restarts.
    const retained=previous?.retained?.then(()=>{
      // The Worker start sample may precede serialization. Use it only as a
      // conservative cap for the additional proof, never for the ordinary I/O.
      const elapsed=now()-firstStartedAt;
      if(!(elapsed>=0&&elapsed<=clockTotalMS))throw Error("release clock window expired");
      return true as const;
    });
    const completion=retained?Promise.any([retained,current]):current;
    const ready=await Promise.race([completion,window.timeout]).catch(()=>null);
    window.close();
    if(!recheck&&ready!==true)retry={window:openClockWindow(),...(ready===false?{retained:current}:{})};
    return ready===true;
  };
}
