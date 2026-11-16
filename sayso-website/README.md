# SaySo website development

The public website and independent installer are built separately and combined for GitHub Pages. See the [project overview](../README.md) for availability and product requirements.

Original SaySo code is source-available under FSL-1.1-ALv2, Copyright 2026 ZHAI BIN. See the root LICENSE.md, THIRD_PARTY.md and TRADEMARK.md; dependency licenses are unchanged.

## Commands

Run from this directory with Node.js 24:

```sh
npm ci
npm --prefix sayso-install ci
npm run build:integrated
npm run preview:integrated
```

For website-only development: `npm run dev -- --host 127.0.0.1 --port 4317 --strictPort`.

`build:pages` also builds the integrated artifact. `build:website` produces the website alone. Production installer verification runs during integration; preview/simulation code is excluded from its production output.

## Configuration

Edit [public/site-config.json](public/site-config.json) and follow [CONTENT_HANDOFF.md](CONTENT_HANDOFF.md). Unavailable destinations and assets stay null. Never add credentials, device data or private signing keys. Do not mark product acceptance complete merely to hide a preview label.

The aggregator generates `install/site-links.json` with only public links. It cannot set trusted release keys, signed compatibility or firmware authorization. The website and installer share only language/theme preferences in browser storage.

## Verification and publication

`npm test`, `npm run build`, `npm run test:sites` verify the website. `npm --prefix sayso-install run verify` verifies the installer. `npm run build:integrated` runs both and validates the final package.

`npm run release:check -- --integrated` intentionally reports missing consumer materials. An unavailable installer can be shown publicly; actual flashing remains gated independently.

Only `dist/pages/` is deployed. Relative paths and hash routes support a project Pages prefix. The root workflow builds on push/PR; a manual run with `deploy=true` on the default branch deploys the verified artifact.
