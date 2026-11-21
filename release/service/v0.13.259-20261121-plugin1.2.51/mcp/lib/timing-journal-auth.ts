import {timingSafeEqual} from "node:crypto";
import {validSigningSecret} from "./signing-configuration.ts";
import {BridgeError} from "./bridge-engine.ts";
export function authorizeTimingJournal(expected:unknown,maintenance:unknown,presented:string|null) {
  if(!validSigningSecret(expected)||validSigningSecret(maintenance)&&expected.toLowerCase()===maintenance.toLowerCase())throw new BridgeError("TIMING_JOURNAL_NOT_CONFIGURED",503);
  if(!validSigningSecret(presented)||!timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(presented,"hex")))
    throw new BridgeError("UNAUTHENTICATED",401);
}
