# SaySo Sites MCP source

Source-available server snapshot based on runtime **0.13.252**, with a separate public-instance origin setting. This is the server source, not the iOS application or ESP firmware.

Use the repository's [installation guide](../INSTALL.md). The current source can be audited and built, but a brand-new user's complete iPhone installation/configuration handoff has not been accepted end to end. Do not report a fully configured phone from a successful server deployment alone.

## Configuration

- Deploy into the user's own private Site with D1 binding `DB`, R2 binding `BUCKET`, authenticated Sites ingress and the `mcp` capability.
- `.openai/hosting.json` intentionally has no developer project ID. Create or resume the user's Site and use its actual returned identifiers.
- Set `SAYSO_PUBLIC_ORIGIN` to that Site's actual HTTPS origin (no path or credentials). Missing configuration leaves a non-routable `.invalid` placeholder and tool execution fails with `SITE_ORIGIN_NOT_CONFIGURED`; it never falls back to the developer's Site.
- Set `SAYSO_FRAME_PERMIT_HMAC_KEY_HEX` to a newly generated per-instance 32-byte random secret, encoded as 64 hex characters, in private runtime environment storage. Do not copy another instance's secret or put it in Git, chat, public config or an install URL.
- Keep diagnostics such as `SAYSO_FRAME_UPLOAD_TRACE_DEVICE` unset unless a separate bounded diagnostic task requires them. No existing device database or runtime environment was exported.

This source relies on authenticated Sites ingress for trusted user headers. It must not be exposed as a generic unauthenticated Worker where clients can supply those headers. Phone device-token checks remain separate from Site access and conversation authentication.

## Development

Use Node.js 24 and the committed lockfile. `npm run install:ci` installs dependencies, `npm test` runs synthetic unit tests, `npm run typecheck` checks TypeScript, and `npm run build` builds the Sites-compatible project. Tests and synthetic JPEG fixtures do not constitute real-phone or new-account acceptance. No model API or phone control is required for these checks.

## Data handling

The service can store images in D1/R2, requested input text and operation/diagnostic records. Expiry is not proof of physical deletion. Complete retention/deletion policy and the consumer configuration handoff remain separate release work. Source visibility is not a no-data-collection or no-backdoor certification.

## Licensing

Original SaySo code is licensed under FSL-1.1-ALv2; see [LICENSE.md](LICENSE.md). Copyright 2026 ZHAI BIN. Each covered version receives the additional Apache-2.0 license on the second anniversary of its availability. Vendored/upstream material and dependencies retain their own terms; see [THIRD_PARTY.md](../THIRD_PARTY.md).

The 0.13.249 update includes S3/S6 stop handling, strict signing configuration, immediate terminal-text redaction, scoped HMAC text digests and opportunistic maintenance. Apply migrations through 0027; see the root INSTALL.md for safe existing-service updates and retention limits.

Runtime 0.13.250 adds T6 final-step handoff and protected-screen guidance. These are model instructions, not server-enforced transaction blocking. Companion skills are 1.2.41.

Runtime 0.13.251 removes obsolete region/zero-coordinate guidance, aligns current tool/skill references, and lets stop_session omit its ID to stop all owned ongoing sessions. Skills 1.2.42 are the matching package. Concise descriptions retain image guidance; real-phone long/short-description comparison remains pending.

Runtime 0.13.252 normalizes malformed stop selectors only: null, empty or malformed IDs use the authenticated owner-wide stop scope and report selector_fallback. Valid UUIDs never broaden scope. Tool wording includes clear/append limits and guide revision 2.2.0. No phone handoff or accessory pairing behaviour is changed.
