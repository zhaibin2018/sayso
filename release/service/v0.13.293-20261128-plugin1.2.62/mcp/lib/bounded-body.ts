import {BridgeError} from "./bridge-engine.ts";

/** Size-bounded body read; the optional deadline also cancels a pending read.
 * A normal observation cannot become fresh after its metadata takes >=1.5s. */
export async function boundedBody(request:Request,maximum:number,timeoutMS?:number):Promise<Uint8Array>{
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  let timedOut=false,count=0;const pieces:Uint8Array[]=[];
  const cancel=()=>{void reader.cancel().catch(()=>undefined);};
  const timer=timeoutMS===undefined?undefined:setTimeout(()=>{timedOut=true;cancel();},timeoutMS);
  try {
    while(true){
      const item=await reader.read();
      if(timedOut)throw new BridgeError("METADATA_TIMEOUT",408);
      if(item.done)break;
      count+=item.value.byteLength;
      if(count>maximum){cancel();throw new BridgeError("BODY_TOO_LARGE",413);}
      pieces.push(item.value);
    }
    const bytes=new Uint8Array(count);let offset=0;
    for(const piece of pieces){bytes.set(piece,offset);offset+=piece.length;}
    return bytes;
  } finally {if(timer!==undefined)clearTimeout(timer);reader.releaseLock();}
}
