/** Lightweight diagnostic identifiers; never imports fixture pixels or UI HTML. */
export const benchmarkCaseIDs = Array.from(
  { length: 12 },
  (_, i) => `c${String(i).padStart(2, "0")}`,
);
export const BENCHMARK_UI_URI = "ui://sayso/benchmark/v4.html";
export const RENDERER_PROBE_URI = "ui://sayso/renderer-probe/v1.html";
