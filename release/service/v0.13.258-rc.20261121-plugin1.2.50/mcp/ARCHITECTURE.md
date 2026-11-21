# Current Worker boundaries

`lib/mcp-tool-catalog.ts` owns the MCP input schemas and catalogue. `/mcp` exposes 15 production tools: separate primitives preserve model decisions between calls. `/mcp/development` exposes the same primitives plus 12 diagnostic tools under the same authenticated Sites identity. Hidden development tools cannot be invoked through the production endpoint. No second plugin is created for the existing Site.

`lib/device-contract.ts` is the route registry and current claim-envelope schema. `lib/device-api.ts` dispatches that registry and preserves the specialized authenticated frame/claim/result paths. `lib/device-control-repository.ts` owns lifecycle SQL formerly embedded in the HTTP route. Lease, ownership, original receipt and image-order rules remain in their existing domain services.

`npm run contracts:generate` emits `contracts/current-actions.json` and OpenAPI 3.1 in `contracts/openapi.json`. `npm run contracts:check` rejects stale generated files. `--ios <path>` additionally writes or checks the identical Swift test fixture. OpenAPI describes route and wire envelopes; it does not replace the deeper execution rules tested against actual D1 queries.

Production input uses the existing `sb_mouse_commands` queue, including its durable move/click relationship. The obsolete browse and pointer-plan entry points are removed. LED diagnostics retain their separate non-HID queue and are development-only; renaming all tables to `control_jobs` would add a migration without improving the production input boundary.

Large pre-existing `bridge-engine.ts` and `mouse-control.ts` have explicit no-growth budgets. Newly extracted modules have a 1000-line limit and formatter checks. They can be split further without changing the current protocol. No transport, upload-frequency, compression, D1-latency or Durable Object redesign is included in this work.

The native Sites Git history is retained here. Public self-hosted releases are exported from a verified commit, with new deployment identity and storage; they do not publish the owner's Site binding, credentials or phone evidence.
