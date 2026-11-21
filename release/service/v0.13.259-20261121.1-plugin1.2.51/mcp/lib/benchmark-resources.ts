import { BENCHMARK_UI_URI, benchmarkWidgetHtml } from "./benchmark-widget.ts";
import { V3_BENCHMARK_UI_URI, v3BenchmarkWidgetHtml } from "./benchmark-widget-v3.ts";
import { V2_BENCHMARK_UI_URI, v2BenchmarkWidgetHtml } from "./benchmark-widget-v2.ts";
import { LEGACY_BENCHMARK_UI_URI, legacyBenchmarkWidgetHtml } from "./benchmark-widget-v1.ts";
import { RENDERER_PROBE_URI, rendererProbeHtml } from "./benchmark-renderer-probe.ts";
export function benchmarkResource(uri: unknown) {
  return (
    new Map<unknown, string>([
      [BENCHMARK_UI_URI, benchmarkWidgetHtml],
      [V3_BENCHMARK_UI_URI, v3BenchmarkWidgetHtml],
      [V2_BENCHMARK_UI_URI, v2BenchmarkWidgetHtml],
      [LEGACY_BENCHMARK_UI_URI, legacyBenchmarkWidgetHtml],
      [RENDERER_PROBE_URI, rendererProbeHtml],
    ]).get(uri) ?? null
  );
}
