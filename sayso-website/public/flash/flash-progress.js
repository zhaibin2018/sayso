// Preparation timing is shared by the page controller and its regression tests.
export function preparationIsSlow(phase, startedAt, now) {
  return (
    phase === "preparing" && startedAt !== null && now - startedAt >= 60000
  );
}
