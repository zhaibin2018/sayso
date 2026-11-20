import {env} from "cloudflare:workers";
import {handleTimingJournal} from "../../../lib/timing-journal-http";
export const dynamic="force-dynamic";
export const GET=(request:Request)=>handleTimingJournal(request,env);
