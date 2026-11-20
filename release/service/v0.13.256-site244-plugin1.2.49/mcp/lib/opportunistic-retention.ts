import type { BridgeEngine } from "./bridge-engine.ts";

/** Best effort: maintenance failures must never prevent a stop or heartbeat. */
export function opportunisticRetention(service: BridgeEngine) {
  const run = async () => {
    try {
      await service.pruneMetadata();
    } catch {
      console.warn(JSON.stringify({ event: "opportunistic_retention_failed" }));
    }
  };
  if (!service.scheduleBackground(0, run)) return run();
}
