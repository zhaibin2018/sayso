import { BridgeError, uuid } from "./bridge-engine.ts";

/** Stop alone tolerates malformed selectors. Unmatched owned targets also fall back to owner-wide stopping. */
export function stopSelector(value: unknown) {
  if (value === undefined) return { selected: null, fallback: false, reason: "omitted" as const };
  try {
    return { selected: uuid(value), fallback: false, reason: "selected" as const };
  } catch (error) {
    if (!(error instanceof BridgeError) || error.code !== "INVALID_UUID") throw error;
    return { selected: null, fallback: true, reason: "invalid_id" as const };
  }
}

export function stopSelectorNotice(
  fallback: boolean,
  scope: "devices" | "sessions",
  reason: "invalid_id" | "not_found" | "stale_session" = "invalid_id",
) {
  return {
    selector_fallback: fallback,
    ...(fallback
      ? {
          selector_fallback_reason: reason,
          selector_notice: `${reason === "stale_session" ? "Selected session was already stopped while other sessions were ongoing" : reason === "not_found" ? "No matching owned target" : "Invalid ID"}; used the all-owned-${scope} stop scope. Check the stop result for incomplete operations.`,
        }
      : {}),
  };
}
