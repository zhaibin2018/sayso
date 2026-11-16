# Installer maintenance

Reviewed: 2026-11-16. This policy does not authorize firmware, extend a signature or relax hardware checks.

## Model catalog

The model dropdown is an identification catalog, not a compatibility certificate. It now includes Apple's listed iPhone 17, 17 Pro, 17 Pro Max, Air, 17e, 18 Pro, 18 Pro Max and Duo alongside the existing models. Apple lists these devices with USB-C connectors. No unreleased base model or future name is guessed.

Primary sources: [Identify your iPhone](https://support.apple.com/en-us/108044), [Compare models](https://www.apple.com/iphone/compare/). `MODEL_CATALOG_REVIEWED_AT` and `MODEL_CATALOG_SOURCE` in policy.js record the review.

Review the catalog every September after Apple's announcements and after any other iPhone launch (including spring models). Update exact names/connectors, review tests and the dated source record. A new dropdown entry must remain unavailable/unverified until a signed release explicitly covers its model and iOS range.

## Signed release expiry

Keep the expiry check. Do not change browser clocks, accept expired signatures or silently extend timestamps. There is currently no published firmware manifest, so there is no real expiry date to renew yet.

Maintainer cadence: **first business day of every month**, and before each publication, run the read-only health check. Start renewal at **30 days remaining**, review immediately and publish a newly signed manifest before expiry. If there is insufficient time to review an image, keep installation unavailable rather than extend it blindly. Initial published manifests should use an explicitly reviewed validity period (180 days is the planning baseline); the signer supplies and approves the actual dates. The tool does not auto-sign or override dates.

From the installer directory:

```sh
npm run check:expiry
npm run check:expiry -- --base-url https://zhaibin2018.github.io/sayso/install/
```

The check verifies signatures using the installer's trusted public keys before trusting dates. It returns success for no published release or a current release more than 30 days from expiry; it fails for near expiry, expiry, invalid signatures or unreadable data. Integrated CI also runs it on each build, so changing source/publishing cannot quietly overlook an approaching deadline. This is **not a scheduled reminder**: no cron, automation, calendar event or notification was created. An independent timed reminder can be added once explicitly requested.

The browser shows a distinct expired-release explanation and a refresh action. For loaded signed releases it refreshes deadline display every 30 seconds. New connect/install actions check the current deadline; already-running writes are not interrupted merely because a display timer passes the deadline. The write admission path still revalidates the release before starting device operations.

Refreshing a release while idle closes the old connection, clears the prior iOS answer, board confirmation and erase consent, and returns to compatibility. Consent to an old manifest must not transfer to a newly downloaded manifest. Refresh remains unavailable during device work.

Renewal requires the real offline signing key, an unchanged or re-accepted image digest, correct current compatibility/security assertions, and a reviewed new issuedAt/expiresAt. Re-signing is not automatic hardware revalidation. Publish the signed envelope and image under the same installer origin; keep redirect rejection and bounded downloads.

## Actions and dependencies

The root Pages workflow pins all direct actions to full commit SHAs. Version comments document the tags resolved from the official actions repositories on 2026-11-16. When updating, resolve the upstream commit, review the change and dependencies, then update both SHA and comment. Do not replace pins with moving tags. The upload-pages composite's own dependencies must also be inspected when its pin changes.

Prettier is fixed at 3.10.1 in both applications and their lockfile roots. Tool updates require an explicit dependency change and the existing tests/build checks.

## Public contact and hosting

Use a dedicated domain support address approved for publication, not a personal mailbox. Keep supportEmail null until it exists. Public GitHub visibility does not grant an open-source license; GitHub's own view/fork rights and third-party dependency licenses remain separate.

Sites/Worker packaging is retained and tested as a build contract. It is not yet a verified backup deployment, failover mechanism or custom-domain configuration. Validate top-level HTTPS, Web Serial availability, policy headers, same-origin artifacts and navigation on any actual alternate host before advertising it as ready.
