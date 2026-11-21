// Read-only adapter for pinned ESP Web Tools 10.1.0; never calls its device methods.
export function installerPhase(dialog) {
  const state = dialog?._installState?.state;
  if (state === "finished") return "finished";
  if (state === "error") return "error";
  if (dialog?._installConfirmed && (!state || state === "initializing" || state === "preparing")) return "preparing";
  return "other";
}
export function preparationIsSlow(phase, startedAt, now) {
  return phase === "preparing" && startedAt !== null && now - startedAt >= 60000;
}
