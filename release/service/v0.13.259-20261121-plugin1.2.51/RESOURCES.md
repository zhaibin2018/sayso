# Resource contract / 资源清单

## Storage

| Resource | Binding | Requirement |
|---|---|---|
| Private Site | name `sayso` | Authenticated owner ingress and platform-issued private service access; never weaken access to make pairing work |
| D1 database | `DB` | One database belonging to this Site, schema `mcp/db/schema.ts`, all 36 ordered SQL migrations `0000` through `0035`, listed in MIGRATIONS.json |
| R2 bucket | `BUCKET` | One private bucket for this Site's screenshots; no public bucket or shared developer bucket |
| Native Site plugin | platform-created binding | Production MCP `/mcp`, nine companion skills; retain the installing owner's identity/manifests |

`.openai/hosting.json` declares `d1: DB`, `r2: BUCKET`, `capabilities: [mcp]`. Actual database/bucket/project IDs come from the installing owner's Site. The zero database ID and scaffold database/bucket names in `vite.config.ts` are local scaffold placeholders, not resources to reuse across accounts. No KV, external LLM/API key, native App code or firmware is required to build this service.

Migrations: apply SQL files lexically from `0000_low_screwball.sql` through `0035_d1_placement.sql`. Do not rely solely on `drizzle/meta/_journal.json`: the pinned upstream journal stops at 0025. The explicit migration inventory in `manifest.json` includes every SQL through 0035. Track applied migration names/checksums privately, apply only unapplied SQL, never reset existing data. Migration 0026 installs terminal-text redaction triggers; 0027 retires old unkeyed digests and uncertain legacy pending text; 0028 adds timing journal storage. Local SQLite application verifies schema syntax/order, not a deployed D1 instance.

## Secrets generated during installation

| Secret | Generate/store | Purpose |
|---|---|---|
| Private-Site access credential (门禁卡) | Generate/issue through the supported Sites private-access mechanism; retain only in platform protected secrets/configuration | Authenticated private-Site ingress; this is **not** a new arbitrary `SAYSO_*` Worker env variable |
| `SAYSO_FRAME_PERMIT_HMAC_KEY_HEX` | CSPRNG 32 independent bytes, encode as exactly 64 hex characters, store as a Site runtime secret | Frame/proof signing and scoped text-request HMACs; required for normal input/read-proof operation |
| `SAYSO_RETENTION_MAINTENANCE_KEY_HEX` | Separate CSPRNG 32 bytes / 64 hex; Site runtime secret | Authorized POST `/internal/retention` |
| `SAYSO_TIMING_JOURNAL_READ_KEY_HEX` | Separate CSPRNG 32 bytes / 64 hex; Site runtime secret | Authorized GET `/internal/timing-journal`; must differ from the retention key |

Never display a value, send it into chat, include it in logs, URLs, source, a public manifest or an artifact. Generate and transfer directly through protected runtime/secret tooling; report only existence/validation status. If protected private-access issuance/storage is unavailable, stop that step with a precise missing-capability state. Do not invent a platform API, expose the credential for manual copying or substitute a developer credential. No secret values or `.env` files are shipped here.

On update preserve valid existing secrets. Add only missing secrets; do not rotate the frame key automatically because old text-request comparisons then fail closed. Query uncertain actions by original command ID and never replay them with a new key.

Pairing codes and device bearer tokens are produced later by the running service when an authorized user explicitly pairs a phone; they are **not** installation-time secrets to pre-generate or put in this package. The service stores token hashes. Phone credentials belong in secure phone storage, separately from server-only HMAC/maintenance/timing keys.

## Configuration and maintenance

- Leave `SAYSO_FRAME_UPLOAD_TRACE_DEVICE` unset for ordinary installation (no developer device identifier).
- `SAYSO_BROWSE_ENABLED` is optional legacy configuration; do not enable diagnostics as an installation workaround.
- Keep `SAYSO_BUILD_DIAGNOSTICS` unset for the production build; development MCP is `/mcp/development`, separate from production `/mcp`.
- Plan C: the supported owner-authenticated scheduler calls canonical MCP `run_due_maintenance({})`, ideally every five minutes if supported. Read back `get_maintenance_status({})` and actual unattended runs. No raw key, target, force or TTL in prompts. Plan B: authenticated normal traffic triggers bounded due-only cleanup using the same durable CAS, cursor and budget. C is still required for idle guarantees. Unavailable scheduling means partial installation; use the exact limitation in INSTALL. The legacy protected HTTP endpoint is not the scheduled-model path. Do not claim cleanup success from saving a task.
- Timing export additionally needs `X-SaySo-Timing-Key` and authenticated Site access; in this pinned version it returns 404 in the normal production profile and is available only in an explicitly enabled diagnostic build. Never enable that build for ordinary installation or publish its data/key as setup evidence. This diagnostic is not required for the read-only installation smoke test.
- Do not copy screenshots, runtime data or backups from any previous account. Existing backups may contain earlier private text/digests; code installation does not clean all backups or implement account deletion.

## D143 and owner identity

`SAYSO_SITE_GATE_TOKEN` holds the actual platform-issued private Site gate, saved by `mcp/scripts/install-pairing-gate.mjs` via protected tools, never a random substitute. `SAYSO_INSTALL_OWNER_ID` is the exact Site-scoped signed-in owner ID discovered by owner-only same-origin GET `/api/pairing/install`; bind it through runtime configuration after owner-only policy verification. Preserve matching existing values and reject conflicts. See `mcp/docs/SERVICE_PAIRING_INSTALL.md` and INSTALL section 6 for the exact same-conversation POST and 15-minute App-created request. Never fabricate identity headers.

Maintenance status returns `state` (`due_at`, `lock_until`, `last_success_at`, `last_attempt_at`, `failures`, `backlog`, `overloaded`) and the five latest `runs`. Durable cursor is server-internal; no oldest-due field is exposed. `SAYSO_DIAGNOSTIC_PARALLEL_SHARING` stays unset; production has one sharing phone per owner (D147). Normal installation never enables diagnostics.
