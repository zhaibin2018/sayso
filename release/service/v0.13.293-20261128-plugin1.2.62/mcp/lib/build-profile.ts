/** Vite fixes this at build time. Direct source tests retain the explicit development audience. */
declare const __SAYSO_DIAGNOSTICS__: boolean;
export const diagnosticsEnabled =
  typeof __SAYSO_DIAGNOSTICS__ === "undefined" ? true : __SAYSO_DIAGNOSTICS__;
