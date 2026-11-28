import { debugObject as object, debugNumber as num } from "./debug-scope.ts";
/** Observed server order only. UTC across isolates has unknown clock error. */
export function observedCallGap(
  previous: Record<string, unknown> | undefined,
  current: Record<string, unknown>,
) {
  const p = previous ?? {},
    a = Array.isArray(p.device_states) ? object(p.device_states[0]) : {},
    b = Array.isArray(current.device_states) ? object(current.device_states[0]) : {};
  const start = num(current.received_utc_ms),
    end = num(p.released_utc_ms),
    same = typeof a.session_id === "string" && a.session_id === b.session_id;
  return {
    previous_request_id: typeof p.request_id === "string" ? p.request_id : null,
    gap_ms: same && start !== null && end !== null && start >= end ? start - end : null,
    qualification: !same
      ? "session_or_predecessor_missing"
      : start === null || end === null
        ? "release_missing"
        : start < end
          ? "overlap_or_clock_error"
          : "observed_order_only_utc_error_unknown",
  };
}
