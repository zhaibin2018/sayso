import { BridgeError, uuid } from "./bridge-engine.ts";

/** Stop alone tolerates malformed selectors. Valid UUIDs never broaden scope. */
export function stopSelector(value: unknown) {
  if (value === undefined) return { selected: null, fallback: false };
  try {
    return { selected: uuid(value), fallback: false };
  } catch (error) {
    if (!(error instanceof BridgeError) || error.code !== "INVALID_UUID") throw error;
    return { selected: null, fallback: true };
  }
}

export function stopSelectorNotice(fallback: boolean, scope: "devices" | "sessions") {
  return {
    selector_fallback: fallback,
    ...(fallback
      ? {
          selector_notice: `Invalid ID; used the all-owned-${scope} stop scope. Check the stop result for incomplete operations.`,
        }
      : {}),
  };
}
