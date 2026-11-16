# SaySo

**Talk to ChatGPT. Let SaySo help with your iPhone.**

[Website](https://zhaibin2018.github.io/sayso/) · [Get started](https://zhaibin2018.github.io/sayso/#/start) · [Firmware installer](https://zhaibin2018.github.io/sayso/install/) · [Report a website issue](https://github.com/zhaibin2018/sayso/issues)

SaySo is being developed to help people understand their shared iPhone screen and request assistance through ChatGPT Voice. You confirm permissions and sensitive final steps.

## Current availability

This repository contains the **website, independent firmware-installer frontend, MCP server source, plugin source and seven skills**. It is a development/source preview. Public App Store downloads, verified device compatibility, real demonstration media and a signed DIY firmware release are not available yet. The installer blocks installation until its separate firmware acceptance requirements are satisfied.

The planned SaySo free tier includes screen guidance and **5 completed tasks per month**. A task can contain multiple taps; failed tasks do not count. Actual task accounting and paid entitlements remain to be implemented and verified. ChatGPT subscriptions and accessories cost extra.

## What you will need

- A supported iPhone/iOS combination; the public compatibility matrix is still being verified.
- The ChatGPT app and an eligible account. The current personal private-Site setup requires Plus or Pro; eligible managed workspaces also require permission.
- For phone control: a compatible USB-C iPhone, an M5Stack AtomS3 Lite (C124, sold separately), a USB-C data cable and a computer for initial firmware setup.
- Start screen sharing in SaySo, not in ChatGPT. In ChatGPT Voice, select Live where available. When approval is requested, use the on-screen controls; spoken approval is not supported.

Some apps restrict screen capture. Do not assume all banking or sensitive apps automatically hide their content. Screen images may be processed and stored by the connected service and ChatGPT; this project does not claim no data collection or immediate erasure. [Privacy information](https://zhaibin2018.github.io/sayso/#/privacy).

## Repository structure

- `sayso-website/`: React/Vite product website, bilingual guides and public link configuration.
- `sayso-website/sayso-install/`: independent installer, production release validation and Web Serial frontend.
- `.github/workflows/pages.yml`: tests both applications and publishes one integrated Pages artifact when manually requested.
- `mcp/`: Sites MCP source based on runtime 0.13.242, with per-instance configuration and no developer account binding.
- `plugins/sayso/`: the source-available skills-only plugin bundle; the normal Sites route adds its skills to the existing Site plugin.
- `INSTALL.md` and `SOURCE_MANIFEST.json`: guided installation procedure and verifiable source inventory.

The iOS application, ESP firmware implementation, live runtime data, keys and internal device evidence are not included. The current hardware scope is DIY AtomS3 Lite only; no own-manufactured hardware program is part of this release. A stable DIY firmware source release is planned separately after licensing, secret review and build reproducibility work. See the [developer guide](sayso-website/README.md) and [content handoff](sayso-website/CONTENT_HANDOFF.md).

## Start installation with one instruction

Use [INSTALL.md](INSTALL.md) for the full procedure. A fixed-commit copyable instruction is added with this source publication. It starts guided setup in ChatGPT Work; it does not silently approve permissions or claim an unverified phone handoff is complete.

The guide deploys the user's private Site, preserves its canonical App-backed plugin, adds seven skills, and separates sign-in, pairing, screen sharing and control readiness. The automatic iPhone configuration handoff is still an acceptance gap; the guide reports that state explicitly instead of weakening Site access.

## Build locally

Requires Node.js 24 and npm.

```sh
cd sayso-website
npm ci
npm --prefix sayso-install ci
npm run build:integrated
npm run preview:integrated
```

The local integrated preview is served at `http://127.0.0.1:4320/sayso/`. Only `sayso-website/dist/pages/` is published, with the installer at `install/`. No firmware is flashed during tests or builds.

## Permissions and notices

**Licensed under FSL-1.1-ALv2. Copyright 2026 ZHAI BIN.** This is source-available software, not OSI-approved open source. Each covered version receives an additional Apache-2.0 license two years after that version is made available. Public Git commits can start that period; it is not limited to release tags. See [LICENSE.md](LICENSE.md), [license details](LICENSE_DETAILS.md) and [fsl.software](https://fsl.software/).

Third-party components retain their own licenses and notices; see [THIRD_PARTY.md](THIRD_PARTY.md). SaySo branding is separate; see [TRADEMARK.md](TRADEMARK.md). External contributions are currently not accepted; see [CONTRIBUTING.md](CONTRIBUTING.md).

Works with ChatGPT. Not affiliated with or endorsed by OpenAI or M5Stack.
