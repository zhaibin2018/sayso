import {diagnosticsEnabled} from "./build-profile.ts";
import {authorizeTimingJournal} from "./timing-journal-auth.ts";
import {readJournal} from "./timing-journal.ts";
import {BridgeError} from "./bridge-engine.ts";
export async function handleTimingJournal(request:Request,env:{DB?:D1Database;SAYSO_TIMING_JOURNAL_READ_KEY_HEX?:string;SAYSO_RETENTION_MAINTENANCE_KEY_HEX?:string}) {
  const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
  if(!diagnosticsEnabled)return new Response("Not found",{status:404});
  try {
    authorizeTimingJournal(env.SAYSO_TIMING_JOURNAL_READ_KEY_HEX,env.SAYSO_RETENTION_MAINTENANCE_KEY_HEX,request.headers.get("X-SaySo-Timing-Key"));
    const url=new URL(request.url),cursor=url.searchParams.get("after")??"0",size=url.searchParams.get("limit")??"200";
    if(!/^\d+$/.test(cursor)||!/^\d+$/.test(size)||!Number.isSafeInteger(Number(cursor))||Number(size)<1||Number(size)>200)
      return json({error:{code:"INVALID_ARGUMENTS"}},400);
    if(!env.DB)return json({error:{code:"STORAGE_UNAVAILABLE"}},503);
    return json(await readJournal(env.DB,Number(cursor),Number(size)));
  }catch(error){return json({error:{code:error instanceof BridgeError?error.code:"INTERNAL_ERROR"}},error instanceof BridgeError?error.status:500);}
}
