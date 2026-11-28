import { timingSafeEqual } from "node:crypto";
import { BridgeError } from "./bridge-engine.ts";
import { validSigningSecret } from "./signing-configuration.ts";
export function authorizeRetentionMaintenance(expected: unknown, authorization: string | null) {
  if (!validSigningSecret(expected)) throw new BridgeError("MAINTENANCE_NOT_CONFIGURED", 503);
  const presented = validSigningSecret(authorization) ? authorization : undefined;
  if (!presented || !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(presented, "hex")))
    throw new BridgeError("UNAUTHENTICATED", 401);
}
