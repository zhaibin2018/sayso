# SaySo Install

Independent React/Vite frontend for first-time AtomS3 Lite setup. It is published under the main website's `install/` directory.

## Availability and safety

The default release channel is unavailable and trusted key configuration is empty. This repository does not distribute an approved firmware image. A successful frontend build is not physical hardware acceptance.

The installer validates signed release manifests, DIY profile/security assertions, model compatibility, download size/hash, device identity/security state, and write/readback results. A website marketing flag cannot authorize installation. No eFuse changes are part of the DIY installation contract. Clean installation erases existing programs/settings and requires explicit user confirmation.

## Development

`npm ci` installs this application's independent dependencies. `npm run dev` is the separately compiled no-hardware simulation preview; `npm run dev:release` uses the production flow with the unavailable default release. `npm run verify` runs tests, production build, simulation exclusion audit and packaging checks. No real board is used by automated tests.

For the unified website, run `npm run build:integrated` from the parent directory. Do not deploy this application separately. `site-links.json` supplies whitelisted public navigation only; firmware trust remains in `src/release-policy.js` and the signed release protocol. No private signing key belongs in this repository.

The installer supports English/Chinese, shared appearance preferences and mobile handoff to a computer. Returning to the product website is separate from restarting device setup and is blocked while device work is busy.

Dependency licenses are generated into public/THIRD_PARTY_NOTICES.txt. Original SaySo code is source-available under the root FSL-1.1-ALv2 license, Copyright 2026 ZHAI BIN. This browser installer is distinct from the ESP firmware, which is not included here.

## Maintenance

The model catalog identifies current Apple phones but does not grant compatibility. See [maintenance policy](docs/MAINTENANCE.md) for the annual September review and signed-release renewal cadence. `npm run check:expiry` checks the local channel; `npm run check:expiry -- --base-url https://zhaibin2018.github.io/sayso/install/` checks the public channel. Signatures expiring within 30 days, expired releases and invalid data produce a failing check. No scheduled reminder or automatic re-signing is configured.

Factory security calibration remains pending: [read-only sampling plan](docs/FACTORY_BASELINE.md). The strict device-security predicate is unchanged; synthetic tests are not factory measurements.
