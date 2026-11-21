# L06 / D143 release installation contract

Local candidate only. Do not deploy it or change existing Sites without separate authorization.
A new release must include migration `0034_install_pairing.sql`, the full preceding journal,
`scripts/install-pairing-request.mjs`, and the matching App. Never mix it with the old frozen package.

## T92 preflight and fast installation

Before any build, inspect the actually available capability/schema and existing session
for **owner-authenticated same-origin fetch**. Ordinary HTTP, a private gate, database
access and invented identity headers do not qualify. Record available/unavailable.
If unavailable, do not attempt install GET/POST, probe browser availability, repeatedly
search for the newly installed plugin or repackage it. Install the service and hand off
to a new Work conversation; never fabricate a pending row or pairing link.

For a pinned release, verify hashes and exact manifest, install necessary locked build
dependencies, build production once, apply migrations/configuration and read back the
applied environment/migrations, then do minimal harmless guide/discovery checks.
Keep production artifact safety checks. Full App/Worker tests, type/budget/contract
checks, antifraud checks and browser/packaging validation belong to the release gate,
recorded for the exact source in VALIDATION.json. Reuse successful unchanged results.
Expand source/regression checks only on source verification failure/deviation; stop on
bad hashes rather than regenerating the manifest. About three minutes is a target,
not a measured guarantee. This does not skip any required migration or access control.

## Install the private service

1. Create/resume the selected **owner-only** private Site, retaining its actual project,
   origin, canonical plugin, DB and BUCKET. Verify through Sites access metadata that
   the installing account is the sole allowed viewer, with no editors, groups or visitors.
   The Worker trusts identity headers only behind Sites dispatch, which overwrites caller
   identity. Do not expose a direct Worker ingress that accepts self-supplied headers.
2. Apply the complete packaged migration journal; preserve existing rows on upgrades.
3. Reuse the valid actual platform gate already returned for this Site, preserving
   existing secrets. Do not call `generate_siwc_bypass_token` as an installation step.
   If truly missing, first explain that this sensitive bearer permits access through
   the private Site login gate, but is not owner identity; obtain explicit consent
   before a separate supported issuance. The helper accepts optional `readPlatformGate`
   for reuse and requires strict `gateIssuanceApproved === true` before `issueGate`;
   the orchestrator must never infer this approval from installation authorization.
   Store/read back via protected tools as `SAYSO_SITE_GATE_TOKEN`. Hidden is not missing.
   No arbitrary replacement strings, inspection-time rotation or credentials in output.
4. Deploy the reviewed source and environment through the supported owner workflow;
   verify terminal success, owner-only access and actual source/runtime. Install the
   nine matching skills into the canonical plugin; do not create a wrapper plugin.

## Write the supplied phone request, without calling the newly installed plugin

The App prefill contains `<request_id>.<public_key>` and the short installation URL's
`created_at` query parameter (integer Unix **milliseconds**, captured by the App before
installation). Preserve these exact public values; never substitute current time, change
key padding, generate a request on the server, or put the values into source/migrations,
hosting.json or environment constants. No request in the message means no installation
write; give the normal phone instructions instead.

Only if the pre-build owner-fetch check succeeded, after the first deployment the
release supplies these **real** HTTP operations (otherwise skip registration):

* `GET /api/pairing/install`: read-only Site-scoped `{id,label}` from the authenticated
  browser identity supplied by Sites dispatch. This handler does not set an owner,
  register a request or return a token; the whole request can still run a gate guard
  that writes revocations, so it is not an entirely read-only probe.
  Gate-only/anonymous callers are rejected. If an owner was already pinned, another
  account is rejected. The installer must first verify that its signed-in browser
  account is the sole Site owner; this GET is identity discovery, never first-caller binding.
* Set `SAYSO_INSTALL_OWNER_ID` to that exact returned `id` using the Site's runtime
  environment tool, preserving all other configuration. This is the same Site-scoped
  owner binding used by T83. Retain an existing matching binding; never overwrite a
  different one to make pairing work. Redeploy/apply the environment revision and
  verify it. This does not depend on new MCP tool discovery or an MCP OAuth session.
* In that same authenticated, same-origin owner browser session, perform:

  ```javascript
  const response = await fetch('/api/pairing/install', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({request_id, public_key, created_at})
  });
  ```

  The browser supplies its real session and Origin. Never forge `oai-authenticated-*`,
  use a device bearer or treat a Sites gate as user identity. The POST requires that
  identity to equal `SAYSO_INSTALL_OWNER_ID`, checks the exact three fields, canonical
  v4 UUID, canonical 32-byte base64 X25519 field encoding and low-order rejection,
  and writes a parameterized D1 `INSERT OR IGNORE`. Owner/label come from dispatch,
  not the body. The returned JSON contains only `pairing_url` and `expires_at`.

`scripts/install-pairing-request.mjs` exposes `readInstallPairingOwner(capabilities)`
and `installPairingRequest(capabilities, request)` for the installation orchestrator.
`capabilities` is `{origin, assertOwnerOnly, fetchSite}`: bind the first callback to the
actual verified Sites access readback and the second to the authenticated same-origin
browser fetch above. It is not a new Sites connector API or an SQL tool. It rechecks
owner-only access on each operation, rejects redirects/foreign result origins and
suppresses upstream details. If no authenticated browser fetch capability is available,
keep connection pending and report that concrete missing step; never silently fall
back to a public writer, hardcoded data or a fabricated owner ID.

Retry the identical POST on uncertain completion. The primary key never changes its
owner, public key, creation time or expiry. An identical pending write returns the same
link; a changed key/time conflicts, and issued/used requests cannot be reopened. Expiry
is **App creation time + 15 minutes**, not registration/deployment/retry time. Missing,
future, fractional, non-numeric or already-expired creation times are rejected. Phone
clock skew can require a fresh request; the installer must not repair its timestamp.

An optional successful registration may return the actual
`https://<actual-site>/pair?req=<request_id>` link before the final handoff sentence.
Regardless of optional registration, after successful first installation the final
Chinese sentence must be exactly:

服务已装好，请回到 SaySo 再点一次"连接 ChatGPT"，在**新的"工作"对话**里发送（约 2 分钟后可用）

Put any unresolved maintenance/display limitation before that sentence. Do not use
it for a failed service installation. English: Your service is installed. Return to
SaySo, tap Connect ChatGPT again and send in a new Work conversation (available in
about 2 minutes). Opening GET only checks the row; it never registers, issues or redeems.
The user taps **Generate connection**, then personally taps **Return to SaySo to connect**.
Do not open the capsule endpoint, generate/redeem a capsule or test phone input as
an installation self-check. No clipboard, script navigation or auto-return.

## Already installed

When this conversation has the user's existing canonical SaySo plugin, use its existing
`create_pairing_link` with the exact request ID and public key, then return `pairing_url`.
That path remains five minutes from registration, never extends on retries, and does not
seed/update a Site or reinstall it. If discovery is unavailable, establish which existing
plugin/account is intended; do not create a second service to bypass tool availability.

The App keeps its pending private key in one Keychain record for 15 minutes from creation,
including background/relaunch. It accepts only its own pending request and deletes the
key on cancel/expiry/success. Restart replaces request and key. Duplicate normal taps
preserve the pending request; duplicate redemption callbacks create no second device.

## L06 security and lifetimes

Install pending rows live at most 15 minutes from App generation. **Capsule/code expiry
remains min(request expiry, issue time + five minutes)**. `code_expires_at` is persisted;
legacy rows with NULL use their original five-minute expiry. Atomic conditional issue
allows one capsule; atomic redemption creates one owner-bound normal device. Only code
and gate hashes are stored; no capsule/token is stored in the pairing table.

A copied public request is not proof of phone ownership and is not an authorization
capability. A non-owner cannot POST or issue a capsule. The installer acts only on the
owner's explicit connection message, not a request copied from untrusted page content.
An owner could deliberately register another valid key; this protocol cannot establish
physical ownership of the initiating phone. Even then, only the matching private key can
open the capsule, and the App accepts only its own pending ID. Do not claim stronger
attestation. Cancel deletes that key immediately; the remaining server row cannot reconnect
that App. Fixed timestamps prevent replay after row cleanup; changing them cannot replace
an existing row or extend the App's local deadline.

Encryption is unchanged: X25519 + HKDF-SHA256 + AES-GCM with the existing domain/AAD.
The encrypted envelope goes only in `sayso://connect#...`, never in a query or server log.
Pages/APIs are no-store, no-referrer, frame-denied, with restrictive CSP and no analytics.
The final link requires a user tap and is cleared on pagehide/expiry. No gate, token,
private key or raw capsule in logs, public artifacts or screenshots.

Gate replacement still revokes L06 devices at the existing request guard, on the first
request and within 240 seconds on warm isolates, including optimized paths. Pairing
never starts sharing, changes consent, grants tapping or bypasses accessory pairing.
Wrong-account and gate-only access remains rejected. These are the L06 section-four
requirements with only the pending installation window extended by D143.

## T92 missing-owner maintenance plan (not executed)

When a separately authorized maintenance window is available, verify sole Site
ownership, then obtain the exact Site-scoped owner ID from that canonical plugin's
`get_profile({}).id` (or a signed-in owner same-origin GET above). Ordinary profile
traffic can trigger B retention and gate guards, so it is not an entirely read-only
probe. Preserve the active gate and all other environment values. Pin the exact ID
as SAYSO_INSTALL_OWNER_ID, apply/read back the environment revision, then deduplicate
and enable a Site-associated Asia/Singapore daily 08:15 task invoking only
run_due_maintenance({}) and get_maintenance_status({}). No token, force, TTL or scope.
A conflicting owner binding is a stop condition. No first-visitor bootstrap.

Minimum user action: one explicit future maintenance request; only if the platform
requires it, complete owner login/consent and the UI Run now step. Verify actual owner
execution against task results and D1 watermarks/runs; a saved task or partial pass
is not success. Natural daily, idle/pagination and failure-recovery acceptance remain
required. B cannot cover idle guarantees; daily scheduling cannot promise a 24-hour
hard deadline or silent history. No online configuration is authorized by this plan.
