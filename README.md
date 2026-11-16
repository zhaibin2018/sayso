# SaySo

**Talk to ChatGPT. Let SaySo help with your iPhone.**

[Website](https://zhaibin2018.github.io/sayso/) · [Get started](https://zhaibin2018.github.io/sayso/#/start) · [Firmware installer](https://zhaibin2018.github.io/sayso/install/) · [Report a website issue](https://github.com/zhaibin2018/sayso/issues)

SaySo is being developed to help people understand their shared iPhone screen and request assistance through ChatGPT Voice. You confirm permissions and sensitive final steps.

## Current availability

This repository contains the **public website and the independent firmware-installer frontend**. The website is a development preview. Public App Store downloads, verified device compatibility, real demonstration media and a signed DIY firmware release are not available yet. The installer clearly blocks installation until its separate firmware acceptance requirements are satisfied.

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

The iOS application, private MCP runtime, firmware implementation and internal device evidence are not included in this repository. See the [developer guide](sayso-website/README.md) and [content handoff](sayso-website/CONTENT_HANDOFF.md).

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

Free availability does not imply an open-source license. A project-wide source-code license has not been granted; third-party components retain their own licenses, bundled in each application's THIRD_PARTY_NOTICES.txt. SaySo branding is separate from those licenses.

Works with ChatGPT. Not affiliated with or endorsed by OpenAI or M5Stack.
