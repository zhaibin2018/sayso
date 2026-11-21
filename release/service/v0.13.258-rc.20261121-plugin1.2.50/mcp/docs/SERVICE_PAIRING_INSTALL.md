# L06 / D143 release installation contract

Local candidate only. Do not deploy it or change existing Sites without separate authorization.
A new release must include migration `0034_install_pairing.sql`, the full preceding journal,
`scripts/install-pairing-request.mjs`, and the matching App. Never mix it with the old frozen package.

## Install the private service

1. Create/resume the selected **owner-only** private Site, retaining its actual project,
   origin, canonical plugin, DB and BUCKET. Verify through Sites access metadata that
   the installing account is the sole allowed viewer, with no editors, groups or visitors.
   The Worker trusts identity headers only behind Sites dispatch, which overwrites caller
   identity. Do not expose a direct Worker ingress that accepts self-supplied headers.
2. Apply the complete packaged migration journal; preserve existing rows on upgrades.
3. Use `scripts/install-pairing-gate.mjs` to retain/issue the actual Sites service gate
   and save it through protected runtime tools as `SAYSO_SITE_GATE_TOKEN`. Random
   strings are not platform gates. No credential in code, logs, chat or installation data.
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

After the first deployment, the release supplies these **real** HTTP operations:

* `GET /api/pairing/install`: read-only Site-scoped `{id,label}` from the authenticated
  browser identity supplied by Sites dispatch. No owner setting, DB write or token.
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

Give the returned `https://<actual-site>/pair?req=<request_id>` link in this installation
conversation. Opening GET only checks the row; it never registers, issues or redeems.
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
