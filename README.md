> **Security update available: MCP 0.13.252.** Earlier public snapshots contain known stop and text-retention defects. Existing private services do not update automatically: follow [Update an existing private service](INSTALL.md#update-an-existing-private-service--更新已有私人服务). This is an offline-verified source preview, not physical-device acceptance.
>
> **安全更新：MCP 0.13.252。** 旧版公开快照存在停止与文字留存问题。已安装用户请复用原私人服务并按 INSTALL.md 更新，不要重新配对或清库。

# SaySo

**Talk to ChatGPT. Let SaySo help with your iPhone.**

[Website](https://zhaibin2018.github.io/sayso/) · [Get started](https://zhaibin2018.github.io/sayso/#/start) · [Firmware installer](https://zhaibin2018.github.io/sayso/install/) · [Report a website issue](https://github.com/zhaibin2018/sayso/issues)

SaySo is being developed to help people understand their shared iPhone screen and request assistance through ChatGPT Voice. You confirm permissions and sensitive final steps.

## Current availability

This repository contains the **website, independent firmware-installer frontend, MCP server source, plugin source and seven skills**. It is a development/source preview. Public App Store downloads, verified device compatibility, real demonstration media and a signed DIY firmware release are not available yet. The installer blocks installation until its separate firmware acceptance requirements are satisfied.

The planned SaySo free tier includes screen guidance and **5 completed tasks per month**. A task can contain multiple taps; failed tasks do not count. Actual task accounting and paid entitlements remain to be implemented and verified. ChatGPT subscriptions and accessories cost extra.

## Start installation with one instruction / 一句话发起安装

**Latest source candidate is local-only pending review and publication.** Read the [service release index](release/service/README.md) and [v0.13.256-site244-plugin1.2.49 installation guide](https://github.com/zhaibin2018/sayso/blob/ccc8b913c2e04162d5cc3d251fcdb650cec2e969/release/service/v0.13.256-site244-plugin1.2.49/INSTALL.md). The fixed link becomes usable only after the reviewed local commits are published.

In the intended account, open ChatGPT **Work / 工作** and send:

```text
请按 https://github.com/zhaibin2018/sayso/blob/ccc8b913c2e04162d5cc3d251fcdb650cec2e969/release/service/v0.13.256-site244-plugin1.2.49/INSTALL.md 全新安装我的私人 SaySo（slug 请求 sayso，显示名 SaySo），使用 manifest 的新名称和简介，自动配置配套技能与受保护资料，不显示凭证；旧安装由我另行移除。
```

```text
Follow https://github.com/zhaibin2018/sayso/blob/ccc8b913c2e04162d5cc3d251fcdb650cec2e969/release/service/v0.13.256-site244-plugin1.2.49/INSTALL.md to install a new private SaySo Site (requested slug sayso, display title SaySo), use its manifest presentation, configure its skills and protected settings without displaying credentials; I handle removal of the old installation separately.
```

Service deployment and skills are separate from pairing the phone. The new App display name is SaySo; neutral descriptions come from the release manifest. L06 production phone handoff and first-time accessory pairing are not implemented. Do not claim complete mobile setup from the software checks. Existing releases and the website UI are unchanged by this local preparation.

## What you will need

- A supported iPhone/iOS combination; the public compatibility matrix is still being verified.
- The ChatGPT app and an eligible account. The current personal private-Site setup requires Plus or Pro; eligible managed workspaces also require permission.
- For phone control: a compatible USB-C iPhone, an M5Stack AtomS3 Lite (C124, sold separately), a USB-C data cable and a computer for initial firmware setup.
- Start screen sharing in SaySo, not in ChatGPT. In ChatGPT Voice, select Live where available. When approval is requested, use the on-screen controls; spoken approval is not supported.

Some apps restrict screen capture. Do not assume all banking or sensitive apps automatically hide their content. Screen images may be processed and stored by the connected service and ChatGPT; this project does not claim no data collection or immediate erasure. [Privacy information](https://zhaibin2018.github.io/sayso/#/privacy).

## Repository structure

- `sayso-website/`: React/Vite product website, bilingual guides and public link configuration.
- `sayso-website/sayso-install/`: independent installer, production release validation and Web Serial frontend.
- `.github/workflows/pages.yml`: verifies source integrity, MCP and both web applications, then publishes one integrated Pages artifact when manually requested.
- `mcp/`: Sites MCP source based on runtime 0.13.249, with per-instance configuration and no developer account binding.
- `plugins/sayso/`: the source-available skills-only plugin bundle; the normal Sites route adds its skills to the existing Site plugin.
- `INSTALL.md` and `SOURCE_MANIFEST.json`: guided installation procedure and verifiable source inventory.

The iOS application, ESP firmware implementation, live runtime data, keys and internal device evidence are not included. The current hardware scope is DIY AtomS3 Lite only; no own-manufactured hardware program is part of this release. A stable DIY firmware source release is planned separately after licensing, secret review and build reproducibility work. See the [developer guide](sayso-website/README.md) and [content handoff](sayso-website/CONTENT_HANDOFF.md).

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
