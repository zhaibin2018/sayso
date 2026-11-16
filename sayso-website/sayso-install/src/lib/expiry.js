export const EXPIRY_WARNING_DAYS = 30;
const DAY_MS = 86400000;

// Presentation/maintenance only; this never grants installation authority.
export function expiryStatus(manifest, now = Date.now()) {
  if (!manifest) return { kind: "unavailable" };
  const expires = Date.parse(manifest.expiresAt);
  if (!Number.isFinite(expires) || !Number.isFinite(now))
    return { kind: "invalid" };
  const remainingMs = expires - now;
  return {
    kind:
      remainingMs <= 0
        ? "expired"
        : remainingMs <= EXPIRY_WARNING_DAYS * DAY_MS
          ? "expiring"
          : "current",
    expiresAt: new Date(expires).toISOString(),
    reviewBy: new Date(expires - EXPIRY_WARNING_DAYS * DAY_MS).toISOString(),
    daysRemaining: Math.max(0, Math.ceil(remainingMs / DAY_MS)),
  };
}
