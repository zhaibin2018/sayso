> **Security update available: MCP 0.13.252.** Earlier public snapshots contain known stop and text-retention defects. Existing private services do not update automatically: follow [Update an existing private service](INSTALL.md#update-an-existing-private-service--更新已有私人服务). This is an offline-verified source preview, not physical-device acceptance.
>
> **安全更新：MCP 0.13.252。** 旧版公开快照存在停止与文字留存问题。已安装用户请复用原私人服务并按 INSTALL.md 更新，不要重新配对或清库。

# SaySo

**Talk to ChatGPT. Let SaySo help with your iPhone.**

[Website](https://zhaibin2018.github.io/sayso/) · [Get started](https://zhaibin2018.github.io/sayso/#/start) · [Firmware installer](https://zhaibin2018.github.io/sayso/accessory-install/) · [Report a website issue](https://github.com/zhaibin2018/sayso/issues)

SaySo is being developed to help people understand their shared iPhone screen and request assistance through ChatGPT Voice. You confirm permissions and sensitive final steps.

## Current availability

This repository contains the **website, independent firmware-installer frontend, MCP server source, plugin source and seven skills**. It is a development/source preview. Public App Store downloads, verified device compatibility, real demonstration media and a signed DIY firmware release are not available yet. The installer blocks installation until its separate firmware acceptance requirements are satisfied.

The planned SaySo free tier includes screen guidance and **10 completed tapping tasks per month**. A task can contain multiple taps; failed tasks do not count. Actual task accounting and paid entitlements remain to be implemented and verified. ChatGPT subscriptions and accessories cost extra.

## 完整安装步骤 / Complete installation steps

[官网分步说明](https://zhaibin2018.github.io/sayso/#/start) · [支持 / Support](https://zhaibin2018.github.io/sayso/support/) · [隐私 / Privacy](https://zhaibin2018.github.io/sayso/privacy/)

### 中文

App Store 即将上线。下面是新版安装步骤；当前公开服务包还不含新的连接流程，需等服务更新后使用，完整手机流程尚未验收。

#### 手机上装（推荐）

1. **在 iPhone 上安装 SaySo** — App Store 即将上线。上架后下载并打开 SaySo。 正常应该看到： SaySo 的首次打开页。 [遇到问题？](https://zhaibin2018.github.io/sayso/support/#faq-0)
2. **安装 SaySo 服务** — 在 SaySo 点“还没装 SaySo 服务？”安装入口。ChatGPT 打开时已填好一句话；如果在“聊天”，先切到“工作”再点发送。等几分钟，等它说装好了。 正常应该看到： ChatGPT 确认服务装好，并提示回到 SaySo。 [遇到问题？](https://zhaibin2018.github.io/sayso/support/#faq-5)
3. **连接 ChatGPT** — 回到 SaySo 点“连接 ChatGPT”，在 ChatGPT 里点发送，再点它给的链接。在页面上点“生成连接”，再亲手点“回到 SaySo 完成连接”。只切回 App 不会完成连接。 正常应该看到： SaySo 显示“已连接”。这一步必须在手机上做；请求过期就回 SaySo 重新点“连接 ChatGPT”。（即将上线，当前公开包不支持。） [遇到问题？](https://zhaibin2018.github.io/sayso/support/#faq-5)
4. **核对插件权限** — 在 ChatGPT 的 SaySo 插件权限里选择“全部允许”。请你自己设置。 正常应该看到： 插件权限显示“全部允许”。 [遇到问题？](https://zhaibin2018.github.io/sayso/support/#faq-5)
5. **开始屏幕共享** — 在 SaySo 点“开始屏幕共享”，读提示后点“同意并开始共享”，再在系统提示中点“开始直播”。点“打开 ChatGPT”，发送预填文字；想用语音就开启语音，再去要用的 App 跟 ChatGPT 说。 正常应该看到： SaySo 显示“共享中”，屏幕顶部出现红色录屏标志。 [遇到问题？](https://zhaibin2018.github.io/sayso/support/#faq-6)

#### 服务在电脑上装

1. **打开同一个账号** — 在电脑的网页或桌面 App 打开 ChatGPT，登录和手机上同一个账号，切到“工作”。 正常应该看到： 目标账号的“工作”模式。 [遇到问题？](https://zhaibin2018.github.io/sayso/support/#faq-5)
2. **发送安装指令** — 点下面的“复制安装指令”，粘贴到 ChatGPT 后发送，等它说装好了。 正常应该看到： 服务安装完成的回复；如果问你已有安装或名字，请按实际情况回答。 [遇到问题？](https://zhaibin2018.github.io/sayso/support/#faq-5)
3. **回手机完成连接** — 在手机上完成上面的第 1、3、4、5 步。连接最后要点链接回到 SaySo，所以必须在手机上完成。 正常应该看到： SaySo 先显示“已连接”，开始共享后显示“共享中”。新版连接流程即将上线。 [遇到问题？](https://zhaibin2018.github.io/sayso/support/#faq-5)

复制安装指令 / 发送这一句话:

```text
请帮我安装 SaySo：https://zhaibin2018.github.io/sayso/install
```

#### 想让它帮你点（可选）

1. **用电脑准备配件** — 准备 M5Stack AtomS3 Lite（C124）及能传数据的 USB-C 线。用电脑的 Chrome 或 Edge 打开配件刷写页，装好 SaySo 程序。 正常应该看到： 刷写成功提示。正式固件和完整刷写指南即将公布，现在还不能刷写。 [遇到问题？](https://zhaibin2018.github.io/sayso/support/#faq-1)
2. **插上并按一下按钮** — 把配件用 USB-C 数据线插到兼容 iPhone 上。出现“发现 SaySo 配件”后，按一下配件上的按钮完成配对。 正常应该看到： 配件已连接。（新版按键配对即将上线，待合并和真机验收。） [遇到问题？](https://zhaibin2018.github.io/sayso/support/#faq-5)
3. **打开辅助触控** — 打开 iPhone 设置 → 辅助功能 → 触控 → 辅助触控。回到 SaySo，想让它帮你点时点“允许帮你点”。帮你点需要已验证的机型和系统，手机要竖着拿。 正常应该看到： 辅助触控已开启；SaySo 显示帮你点的实际状态。只读屏不用配件。 [遇到问题？](https://zhaibin2018.github.io/sayso/support/#faq-1)

### English

App Store release coming soon. These are the steps for the next version. The current public service package does not include the new connection flow; wait for the service update. The complete iPhone flow has not yet been accepted.

#### Install on your iPhone (recommended)

1. **Install SaySo on your iPhone** — Coming soon on the App Store. Once released, download and open SaySo. You should see: SaySo’s first-open screen. [Need help?](https://zhaibin2018.github.io/sayso/support/en/#faq-0)
2. **Install the SaySo service** — In SaySo, tap “Haven't installed the SaySo service?”. ChatGPT opens with a message already filled in. If you are in Chat, switch to Work before sending. Wait a few minutes for it to say the service is installed. You should see: ChatGPT confirms installation and asks you to return to SaySo. [Need help?](https://zhaibin2018.github.io/sayso/support/en/#faq-5)
3. **Connect ChatGPT** — Return to SaySo and tap “Connect ChatGPT”. Send the message in ChatGPT, then open the link it gives you. Tap “Generate connection” on the page, then tap “Return to SaySo to connect” yourself. Simply switching back to the app does not finish connecting. You should see: SaySo shows “Connected”. Do this on the iPhone. If the request expires, tap “Connect ChatGPT” in SaySo again. (Coming soon; unavailable in the current public package.) [Need help?](https://zhaibin2018.github.io/sayso/support/en/#faq-5)
4. **Check plugin permissions** — In ChatGPT’s SaySo plugin permissions, select “Allow all actions” yourself. You should see: The plugin permissions show “Allow all actions”. [Need help?](https://zhaibin2018.github.io/sayso/support/en/#faq-5)
5. **Start screen sharing** — In SaySo, tap “Start screen sharing”, read the notice and tap “Agree and start sharing”, then tap “Start Broadcast” in the system prompt. Tap “Open ChatGPT” and send the prefilled message. Start voice if you want, then go to the app you want to use and ask ChatGPT. You should see: SaySo shows “Sharing” and the red screen-recording indicator appears at the top. [Need help?](https://zhaibin2018.github.io/sayso/support/en/#faq-6)

#### Install the service on a computer

1. **Open the same account** — Open ChatGPT on the web or desktop app. Sign in to the same account you use on your iPhone and switch to Work. You should see: Work mode in the intended account. [Need help?](https://zhaibin2018.github.io/sayso/support/en/#faq-5)
2. **Send the installation instruction** — Select “Copy installation instruction” below, paste it into ChatGPT and send it. Wait for the installation confirmation. You should see: A reply confirming service installation. Answer any questions about an existing installation or an unavailable name. [Need help?](https://zhaibin2018.github.io/sayso/support/en/#faq-5)
3. **Finish connecting on your iPhone** — On your iPhone, complete steps 1, 3, 4 and 5 above. Connecting must happen on the phone because the final link returns to SaySo. You should see: “Connected”, then “Sharing” once you start sharing. The new connection flow is coming soon. [Need help?](https://zhaibin2018.github.io/sayso/support/en/#faq-5)

Copy installation instruction / Send this one sentence:

```text
Please install SaySo for me: https://zhaibin2018.github.io/sayso/install
```

#### Want it to tap for you? (optional)

1. **Prepare the accessory on a computer** — Get an M5Stack AtomS3 Lite (C124) and a USB-C data cable. Open the accessory installer in Chrome or Edge on your computer and install the SaySo program. You should see: A successful installation message. The accepted firmware and full flashing guide are coming soon; flashing is not available yet. [Need help?](https://zhaibin2018.github.io/sayso/support/en/#faq-1)
2. **Plug it in and press its button** — Connect the accessory to a compatible iPhone with the USB-C data cable. When “SaySo accessory found” appears, press the accessory’s button to pair it. You should see: The accessory shows as connected. (Button pairing is coming soon, pending integration and physical-device acceptance.) [Need help?](https://zhaibin2018.github.io/sayso/support/en/#faq-5)
3. **Turn on AssistiveTouch** — Open iPhone Settings → Accessibility → Touch → AssistiveTouch. Return to SaySo and tap “Allow tapping” when you want it to tap. Tapping requires a verified phone/iOS combination and portrait mode. You should see: AssistiveTouch is on; SaySo shows the actual tapping status. Screen reading needs no accessory. [Need help?](https://zhaibin2018.github.io/sayso/support/en/#faq-1)

The short installation page selects the immutable published package and its manifest checksum. Current public source lacks production L06 pairing and T83 scheduled maintenance. The next INSTALL draft stays outside frozen packages until A + T79 and maintenance changes are merged, reviewed and repackaged.

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

The local integrated preview is served at `http://127.0.0.1:4320/sayso/`. Only `sayso-website/dist/pages/` is published, with the service installation page at `install/` and the independent accessory installer at `accessory-install/`. No firmware is flashed during tests or builds.

## Permissions and notices

**Licensed under FSL-1.1-ALv2. Copyright 2026 ZHAI BIN.** This is source-available software, not OSI-approved open source. Each covered version receives an additional Apache-2.0 license two years after that version is made available. Public Git commits can start that period; it is not limited to release tags. See [LICENSE.md](LICENSE.md), [license details](LICENSE_DETAILS.md) and [fsl.software](https://fsl.software/).

Third-party components retain their own licenses and notices; see [THIRD_PARTY.md](THIRD_PARTY.md). SaySo branding is separate; see [TRADEMARK.md](TRADEMARK.md). External contributions are currently not accepted; see [CONTRIBUTING.md](CONTRIBUTING.md).

Works with ChatGPT. Not affiliated with or endorsed by OpenAI or M5Stack.
