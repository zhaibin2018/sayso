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

## Production and diagnostic builds

The default build exposes the production MCP catalogue. It disables `/mcp/development` and `/v1/voice-benchmark`, and excludes synthetic benchmark pixels and widget HTML from the built artifact. `npm run build` checks that boundary. To produce an explicitly internal diagnostic build, set `SAYSO_BUILD_DIAGNOSTICS=1` **at build time**; this is not a runtime permission grant. Direct source unit tests exercise the diagnostic audience separately. Never advertise a diagnostic build as the normal production profile.

Tool annotations describe effects; they cannot guarantee ChatGPT approval behaviour. Both Stop tools are repeat-safe. `stop_session` retains its destructive hint because it removes cloud images; text input is also marked potentially destructive because it can clear existing text and submit. Click and drag remain conservative. Do not relabel actions merely to avoid approval prompts. If a prompt blocks urgent stopping, use Stop control in the SaySo app; local stopping is independent of ChatGPT's plugin permission setting.

## Private diagnostic timing journal (T36; offline implementation)

Migration `0028_timing_journal.sql` adds a bounded D1 metadata table. Apply it only during the separately approved deployment phase. Build with `SAYSO_BUILD_DIAGNOSTICS=1` to enable journal reads/writes. The default production build neither records calls nor serves the endpoint (404).

During that later phase, configure **SAYSO_TIMING_JOURNAL_READ_KEY_HEX** through the private Site's protected secret-setting tool. Use a fresh random 32-byte key represented by exactly 64 hexadecimal characters, separate from `SAYSO_RETENTION_MAINTENANCE_KEY_HEX` and all signing keys. Do not put the value in a command argument, source, URL, log, deployment record or report. This offline change generates no key and sets no live secret.

The owner reader uses `GET /internal/timing-journal?after=0&limit=200` with private Site access and the independent `X-SaySo-Timing-Key` header. The retention maintenance key is rejected; an accidentally shared read/maintenance key disables the reader (503). Responses are noncacheable and include `rows`, `server_now_utc_ms`, `oldest_received_utc_ms`, `next_cursor`, and `has_more`. Follow cursors until `has_more=false`. Start from zero for each new measurement snapshot: existing command rows can be updated after an earlier read.

Requests and associated control timing rows share a hard 200-row cap and a 24-hour TTL, pruned transactionally on every write. Reads hide expired rows even during idle periods. Physical removal of idle expired rows happens on the next write; no scheduler is added. Storage is best-effort and may drop a row on failure. A response records the final Worker image-release boundary, not network receipt by ChatGPT. The MCP tool catalogue is unchanged.

After review, deploy the diagnostic build to the owner's private Site, apply the migration and configure the new protected key. Verify the returned build version, reader auth failures and pagination before DRY-03 (five valid samples). Compare Site B median against the retained 277 ms baseline; report increases over 20 ms and compare ChatGPT completion medians. These live checks have not been performed by this offline task.
