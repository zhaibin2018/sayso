export const installationUrl = "https://zhaibin2018.github.io/sayso/install";
export const installation = {
  zh: {
    title: "开始使用", phone: "手机上装（推荐）", desktop: "服务在电脑上装", optional: "想让它帮你点（可选）",
    status: "App Store 即将上线。服务安装包和配件固件已发布；完整手机流程尚待真机验收。",
    copy: "复制安装指令", copied: "已复制", failed: "复制失败，请选中上面的文字复制。",
    prompt: `请帮我安装 SaySo：${installationUrl}`,
    help: "遇到问题？", expected: "正常应该看到：",
    phoneSteps: [
      ["在 iPhone 上安装 SaySo", "App Store 即将上线。上架后下载并打开 SaySo。", "SaySo 的首次打开页。", 0],
      ["连接 ChatGPT", "在 SaySo 点“连接 ChatGPT”。ChatGPT 打开时已填好安装和连接请求；如果在“聊天”，先切到“工作”再发送。第一次安装约需 3 分钟；已装过会直接给连接链接。", "安装完成后回到 SaySo，再点一次“连接 ChatGPT”，在新的“工作”对话发送（约 2 分钟后可用）。", 5],
      ["完成连接", "已装过服务时，在新的“工作”对话取得连接链接并打开。在页面上点“生成连接”，再亲手点“回到 SaySo 完成连接”。只切回 App 不会完成连接。", "SaySo 显示“已连接”。请求从手机创建起 15 分钟后过期；过期就回 SaySo 重新点“连接 ChatGPT”。", 5],
      ["核对插件权限", "在 ChatGPT 的 SaySo 插件权限里选择“全部允许”。请你自己设置。", "插件权限显示“全部允许”。", 5],
      ["开始屏幕共享", "在 SaySo 点“开始屏幕共享”，读提示后点“同意并开始共享”，再在系统提示中点“开始直播”。点“打开 ChatGPT”，发送预填文字；想用语音就开启语音，再去要用的 App 跟 ChatGPT 说。", "SaySo 显示“共享中”，屏幕顶部出现红色录屏标志。", 6],
    ],
    desktopSteps: [
      ["打开同一个账号", "在电脑的网页或桌面 App 打开 ChatGPT，登录和手机上同一个账号，切到“工作”。", "目标账号的“工作”模式。", 5],
      ["发送安装指令", "点下面的“复制安装指令”，粘贴到 ChatGPT 后发送，等它说装好了。", "服务安装完成的回复；如果问你已有安装或名字，请按实际情况回答。", 5],
      ["回手机完成连接", "在手机上完成上面的第 1–5 步；已有服务会复用。连接最后要点链接回到 SaySo，所以必须在手机上完成。", "SaySo 先显示“已连接”，开始共享后显示“共享中”。新版连接流程仍待完整真机验收。", 5],
    ],
    controlSteps: [
      ["用电脑准备配件", "准备 M5Stack AtomS3 Lite（C124）及能传数据的 USB-C 线。用电脑的 Chrome 或 Edge 打开配件刷写页，装好 SaySo 程序。", "配件刷写页提供 USB 固件 0.6.1；刷写、灯效和真机兼容性仍待验收。", 1],
      ["插上并按一下按钮", "把配件用 USB-C 数据线插到兼容 iPhone 上。出现“发现 SaySo 配件”后，按一下配件上的按钮完成配对。", "配件已连接。（新版按键配对已合并，待真机验收。）", 5],
      ["打开辅助触控", "打开 iPhone 设置 → 辅助功能 → 触控 → 辅助触控。回到 SaySo，想让它帮你点时点“允许帮你点”。帮你点需要已验证的机型和系统，手机要竖着拿。", "辅助触控已开启；SaySo 显示帮你点的实际状态。只读屏不用配件。", 1],
    ],
  },
  en: {
    title: "Get started", phone: "Install on your iPhone (recommended)", desktop: "Install the service on a computer", optional: "Want it to tap for you? (optional)",
    status: "App Store release coming soon. The service package and accessory firmware are published; the complete iPhone flow still awaits device acceptance.",
    copy: "Copy installation instruction", copied: "Copied", failed: "Couldn’t copy. Select and copy the text above.",
    prompt: `Please install SaySo for me: ${installationUrl}`,
    help: "Need help?", expected: "You should see:",
    phoneSteps: [
      ["Install SaySo on your iPhone", "Coming soon on the App Store. Once released, download and open SaySo.", "SaySo’s first-open screen.", 0],
      ["Connect ChatGPT", "In SaySo, tap “Connect ChatGPT”. ChatGPT opens with the installation and connection request filled in. Switch from Chat to Work before sending. First installation takes about 3 minutes; an existing installation goes straight to a connection link.", "After installation, return to SaySo, tap “Connect ChatGPT” again and send in a new Work conversation (available in about 2 minutes).", 5],
      ["Finish connecting", "With the service installed, get and open the connection link in the new Work conversation. Tap “Generate connection”, then personally tap “Return to SaySo to connect”. Simply switching apps does not finish connecting.", "SaySo shows “Connected”. Requests expire 15 minutes after creation on the phone. If expired, tap “Connect ChatGPT” in SaySo again.", 5],
      ["Check plugin permissions", "In ChatGPT’s SaySo plugin permissions, select “Allow all actions” yourself.", "The plugin permissions show “Allow all actions”.", 5],
      ["Start screen sharing", "In SaySo, tap “Start screen sharing”, read the notice and tap “Agree and start sharing”, then tap “Start Broadcast” in the system prompt. Tap “Open ChatGPT” and send the prefilled message. Start voice if you want, then go to the app you want to use and ask ChatGPT.", "SaySo shows “Sharing” and the red screen-recording indicator appears at the top.", 6],
    ],
    desktopSteps: [
      ["Open the same account", "Open ChatGPT on the web or desktop app. Sign in to the same account you use on your iPhone and switch to Work.", "Work mode in the intended account.", 5],
      ["Send the installation instruction", "Select “Copy installation instruction” below, paste it into ChatGPT and send it. Wait for the installation confirmation.", "A reply confirming service installation. Answer any questions about an existing installation or an unavailable name.", 5],
      ["Finish connecting on your iPhone", "On your iPhone, complete steps 1–5 above; an existing service is reused. Connecting must happen on the phone because the final link returns to SaySo.", "“Connected”, then “Sharing” once you start sharing. The new connection flow still awaits full device acceptance.", 5],
    ],
    controlSteps: [
      ["Prepare the accessory on a computer", "Get an M5Stack AtomS3 Lite (C124) and a USB-C data cable. Open the accessory installer in Chrome or Edge on your computer and install the SaySo program.", "The flashing page offers USB firmware 0.6.1. Flashing, lights and device compatibility still await acceptance.", 1],
      ["Plug it in and press its button", "Connect the accessory to a compatible iPhone with the USB-C data cable. When “SaySo accessory found” appears, press the accessory’s button to pair it.", "The accessory shows as connected. (Button pairing is merged and awaits physical-device acceptance.)", 5],
      ["Turn on AssistiveTouch", "Open iPhone Settings → Accessibility → Touch → AssistiveTouch. Return to SaySo and tap “Allow tapping” when you want it to tap. Tapping requires a verified phone/iOS combination and portrait mode.", "AssistiveTouch is on; SaySo shows the actual tapping status. Screen reading needs no accessory.", 1],
    ],
  },
};
