# Self-hosting source packages

This repository can export a Worker source template and a skill source archive. It cannot safely provide one universal pre-bound Site plugin: each owner needs their own Site, database, image bucket and native Site App/plugin identity.

```sh
python3 scripts/export-self-hosted.py --plugin-source ../plugin --output ./release-source
```

The exporter does not deploy anything. It excludes the iOS private repository, owner App binding, runtime credentials, phone evidence, Git metadata, dependency directories and built outputs. The Worker origin becomes an explicit placeholder, and the old `project_id` is removed. These are source archives, not a validated one-click installer.

## New owner's installation sequence

1. Extract the Worker archive in a new directory. Use the supported Sites workflow to create a **new private Site**, retaining the returned project ID, origin and repository identity. Do not reuse the original owner's project.
2. Run `node --experimental-strip-types scripts/configure-self-hosted.mjs --project-id <returned-id> --origin <returned-https-origin>` in that extracted directory. The source manifest declares separate D1 (`DB`), R2 (`BUCKET`) and MCP capabilities. Apply the SQL migrations under `drizzle/` to that new Site's own database through the supported platform setup.
3. Set a new random `SAYSO_FRAME_PERMIT_HMAC_KEY_HEX` in the Site's protected runtime environment. It is a server signing key, not a device grant; never commit it. Install dependencies, build, and publish with the supported Sites source workflow.
4. Sites creates its own canonical plugin. Read **that plugin's** current source and manifests. Overlay the seven skills from `sayso-skills-source.zip`, preserving the new owner's manifests, App dependency, audience and plugin identity. Use the supported `update-plugin` workflow; do not wrap the Site in a duplicate plugin or copy the original `.app.json`.
5. Verify the tool catalogue, authenticate with the new owner, and pair a device explicitly. Creating or deploying a Site does not grant phone control.

The production MCP endpoint is `/mcp`. Diagnostics are separate at `/mcp/development` and retain the same owner/device authorization. A fresh-account installation has **not** been exercised by the offline verification in this work. Publication of the public distribution is gated on the requested later physical-device acceptance.

## Signing and private-data maintenance

The frame signing key must be exactly 64 hexadecimal characters (32 random bytes). Missing or malformed keys reject new input and screen-proof operations; there is no generated fallback. Stop, revoke and original-result retrieval remain available. Validate the protected environment without printing the value using `node --experimental-strip-types scripts/configure-self-hosted.mjs --check-signing-key`.

Apply migration `0026_terminal_text_privacy.sql` before accepting text input. Its database triggers remove text immediately when a command becomes terminal, including existing terminal rows. Public command responses omit pending text; the authorized device dispatch still receives it. Missing triggers block new text commands.

Apply `0027_retire_unkeyed_text_digests.sql` as well. New text idempotency uses HMAC-SHA-256 with the protected frame signing key, a distinct domain and owner/device/request-key scope. Old unkeyed digests are erased, their unique request keys retained, and pending legacy text commands cancelled or marked uncertain if attempted. Old keys cannot be retried as new commands. Use the original command ID to retrieve their outcome. Rotating the signing key likewise makes old request comparisons fail closed; do not automatically replace an uncertain request with a fresh key. Backups made before migration can still contain the old digests and need their own retention policy.

Before production acceptance, configure a separate random 64-hex `SAYSO_RETENTION_MAINTENANCE_KEY_HEX` and an authorized scheduler to POST `/internal/retention` every five minutes. The request needs private Site service access plus the independent `X-SaySo-Retention-Key` header; do not put either credential in source, URLs or logs. Verify an unauthenticated request fails, an authorized run completes, and seeded expired text is removed while the Site otherwise receives no traffic. Alert on missed or failed runs. This source change supplies the endpoint only: no live schedule has been configured or verified by the offline tests.

Maintenance terminates abandoned text commands once their deadline is over five minutes old, which invokes the redaction trigger. After seven days it removes detailed command payloads and receipts. Minimal command IDs, request digests, scope and input-order evidence remain to prevent duplicate execution and preserve source ordering; stopped blocked sessions remain as stop tombstones. Device revocation purges associated command/session records and all pages of image objects. This is not a complete account-deletion implementation. Without a working schedule, idle pending text has no guaranteed wall-clock cleanup time; ordinary image traffic also runs maintenance but is not a substitute for the schedule.

Authenticated MCP calls that use the engine, successful device heartbeats, session stops and control-grant changes also request maintenance. Production schedules it in the background with the existing one-minute throttle; failure does not prevent stop or heartbeat completion. Catalogue/initialization and static guide/benchmark responses do not access storage or trigger it. This reduces dependence on image uploads but still cannot bound deletion time if the user never returns and no external scheduler is configured.
