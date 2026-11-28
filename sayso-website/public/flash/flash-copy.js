export const installHelp = {
  en: {
    downloadMode: "Try another data cable or USB port, then repeat step 2 to enter download mode.",
    fileCheck: "The installation file check failed. Check your internet connection and reload the page.",
    serialPort: "Close any apps that may be using the serial port, such as Arduino IDE, then repeat step 2.",
    waitForInstallation: "Finish installing SaySo on the accessory before you connect it to your iPhone.",
  },
  zh: {
    downloadMode: "换一根数据线或换一个 USB 口再试，然后按第 2 步重新进入下载模式。",
    fileCheck: "安装文件校验失败。请检查网络后刷新页面。",
    serialPort: "关闭可能占用串口的程序（例如 Arduino IDE），再重做第 2 步。",
    waitForInstallation: "先给配件装好 SaySo，再接到 iPhone。",
  },
};

export const flashCopy = {
  en: {
    title: "Set up the accessory",
    intro: "SaySo uses an M5Stack AtomS3 Lite accessory that you buy separately. Follow the three steps below to install SaySo on it. Installation usually takes 1–2 minutes.",
    phoneRequirement:
      "Tapping for you requires an iPhone with USB-C (iPhone 15 or later). ChatGPT can also see your screen on Lightning iPhones.",
    erase: "Reinstalling clears the accessory’s previous pairing. When installation finishes, pair the accessory with your iPhone again.",
    zoomHint: "Select an image to see it larger.",
    step1: "Prepare a computer and data cable",
    cable:
      "Open this page in Chrome or Edge on a Windows PC or Mac so the browser can connect to the accessory. Use a cable that can transfer files, since the installer sends the installation file over USB. " +
      installHelp.en.waitForInstallation,
    prepareCaption:
      "Look for the white square AtomS3 Lite with a large button on the front and a small reset button on the side.",
    step2: "Connect to the computer and enter download mode",
    modeConnect: "Connect the accessory to your computer with the data cable.",
    modeHold:
      "Hold the small side reset button for about 2 seconds until the internal green light comes on, then release to enter download mode.",
    modeReady:
      "When you release, the green light turns off. That’s normal: the accessory is now in download mode. Leave the cable connected so the browser can find the accessory in step 3.",
    modeCaption:
      "The green light is on while you hold the side reset button and turns off when you release it. Use the front button later, for pairing.",
    step3: "Select the accessory and install",
    choose:
      "Click “Start installation” to open the port chooser. Select the accessory you just connected, then click “Connect” so the installer can access it.",
    pickerCaption:
      "Example serial port chooser. Port names and numbers vary by computer.",
    portHelp:
      "Do not choose PCI Serial Port. That’s a built-in port on your computer, not the accessory. Look for USB JTAG/serial debug unit. If it is missing, cancel, try another data cable or USB port, then repeat step 2 to make the accessory appear.",
    confirmCaption:
      "Confirm installation to begin. Installing SaySo erases all data on this accessory.",
    progressCaption:
      "Installation and checking usually take 1–2 minutes. Keep the cable connected and the page open so installation can finish.",
    successCaption:
      "“All installed!” confirms that the accessory is ready to pair.",
    screenNote: "Example screens. Your computer may look slightly different.",
    after: "Pair with your iPhone",
    done: "Unplug the accessory, connect it to your unlocked USB‑C iPhone and open SaySo so it can detect the accessory.",
    pair: "When “SaySo accessory found” appears, tap “Start pairing”. When the light flashes, press the front button once to confirm you’re pairing the accessory in your hand. SaySo shows when pairing is complete.",
    pairCaption: "The USB‑C connection and the “SaySo accessory found” prompt.",
    help: "Can’t find the accessory, or stuck preparing?",
    slow: installHelp.en.downloadMode,
    helpBody: installHelp.en.serialPort,
    official: "M5Stack download mode guide",
    driver: "Computer connection help",
    details: "Version and verification",
    version: "Accessory software version",
    acceptance: "Connect the accessory to your iPhone. In the SaySo app, open Settings → “SaySo accessory” and look for “Accessory software version”. If it shows 0.6.1, you can skip reinstalling.",
    back: "Get started",
    support: "Troubleshooting",
    privacy: "Privacy",
    install: "Start installation",
    locked: "Preparing…",
    checking: "Checking the installation file…",
    verified: "Installation file verified.",
    failed: installHelp.en.fileCheck,
    cdnFailed:
      "The installation tool couldn’t load. Check your connection and reload to try again.",
    handoffTitle: "Continue on a computer",
    handoffBody:
      "Tap “Copy link to open on a computer”, then open the link in Chrome or Edge on your computer. The installation tool needs a browser that can connect to the accessory by USB.",
    previewNote: "Preview the installation steps below.",
    noScriptInstall: "Open this page in Chrome or Edge on your computer with JavaScript enabled, then click “Start installation”.",
    mobileInstall: "Open the copied link in Chrome or Edge on your computer, then click “Start installation”.",
    copyLink: "Copy link to open on a computer",
    copySuccess: "Link copied",
    copyFallback: "Copy this address and open it on your computer.",
    pairRecovery: "If SaySo shows “Paired with another iPhone”, connect the accessory to the original iPhone. In SaySo, go to Settings → “SaySo accessory” and tap “Remove accessory”.",
    pairWithoutOriginal: "If you can’t use the original iPhone, follow the installation steps on this page to reset the accessory, then pair again.",
    pairAfterReset: "If your iPhone asks “Accessory was reset. Pair again?”, tap “Pair again”.",
    assistiveNext: "Next: Turn on AssistiveTouch.",
    assistiveNextBody: "Follow the AssistiveTouch steps in Get started so the accessory can tap the screen.",
  },
  zh: {
    title: "准备配件",
    intro: "SaySo 用的配件是另外购买的 M5Stack AtomS3 Lite。按下面三步给配件装上 SaySo，通常需要 1–2 分钟。",
    phoneRequirement:
      "帮你点需要 USB-C 接口的 iPhone（iPhone 15 及以后机型）。只让 ChatGPT 看屏幕时，Lightning 接口的 iPhone 也可以。",
    erase: "重新安装会清空配件原来的配对。装好后，请把配件和 iPhone 重新配对。",
    zoomHint: "图片看不清时，点图放大。",
    step1: "准备电脑和数据线",
    cable:
      "用 Windows 或 Mac 电脑上的 Chrome 或 Edge 打开本页，让浏览器能连接配件。准备一根能传文件的数据线，安装工具要通过它传送安装文件。" +
      installHelp.zh.waitForInstallation,
    prepareCaption: "认准白色方形 AtomS3 Lite，正面有大按钮，侧边有小复位键。",
    step2: "接上电脑，进入下载模式",
    modeConnect: "用数据线把配件接到电脑。",
    modeHold: "长按侧边小复位键约 2 秒，直到内部绿灯亮起，再松手进入下载模式。",
    modeReady:
      "松手后绿灯会熄灭，这是正常的，表示已进入下载模式。保持数据线连接，第 3 步浏览器才能找到配件。",
    modeCaption: "按住侧边小复位键时绿灯亮起，松手后熄灭。正面大按钮留到配对时用。",
    step3: "选择配件并安装",
    choose:
      "点“开始安装”打开端口选择窗口，选中刚接入的配件，再点“连接”，让安装工具访问配件。",
    pickerCaption: "串口选择示意图。名称和端口号因电脑而异。",
    portHelp:
      "不要选 PCI Serial Port，那是电脑内置的端口，不是配件。请找 USB JTAG/serial debug unit。如果没看到，先取消，换一根数据线或换一个 USB 口，再重做第 2 步，让电脑找到配件。",
    confirmCaption: "确认后开始安装。安装 SaySo 会清空此配件的所有数据。",
    progressCaption:
      "安装和核对通常需要 1–2 分钟。保持数据线连接和网页打开，让安装能够完成。",
    successCaption: "显示“安装好了！”，表示配件可以配对了。",
    screenNote: "示意图，你电脑上的样子可能略有不同。",
    after: "和 iPhone 配对",
    done: "拔下配件，接到已解锁的 USB‑C iPhone 上并打开 SaySo，让它发现配件。",
    pair: "看到“发现 SaySo 配件”后，点“开始配对”。等灯闪烁再按一下配件正面按钮，确认你要配对的是手上的配件。SaySo 会显示配对结果。",
    pairCaption: "USB‑C 连接和“发现 SaySo 配件”提示。",
    help: "找不到配件，或一直在准备中？",
    slow: installHelp.zh.downloadMode,
    helpBody: installHelp.zh.serialPort,
    official: "M5Stack 官方下载模式说明",
    driver: "电脑连接帮助",
    details: "版本和校验",
    version: "配件程序版本",
    acceptance: "把配件接到 iPhone，在 SaySo App 打开“设置 → SaySo 配件”，查看“配件程序版本”。如果显示 0.6.1，可以跳过重装。",
    back: "开始使用",
    support: "遇到问题",
    privacy: "隐私",
    install: "开始安装",
    locked: "准备中…",
    checking: "正在核对安装文件…",
    verified: "安装文件核对通过。",
    failed: installHelp.zh.fileCheck,
    cdnFailed: "安装工具未能加载。请检查网络，再刷新页面重试。",
    handoffTitle: "在电脑上继续",
    handoffBody:
      "点“复制链接，在电脑上打开”，再在电脑的 Chrome 或 Edge 中打开链接。安装工具需要能通过 USB 连接配件的浏览器。",
    previewNote: "下方是安装步骤预览。",
    noScriptInstall: "请在电脑上的 Chrome 或 Edge 中启用 JavaScript 并打开本页，再点“开始安装”。",
    mobileInstall: "在电脑上的 Chrome 或 Edge 打开复制的链接，再点“开始安装”。",
    copyLink: "复制链接，在电脑上打开",
    copySuccess: "已复制",
    copyFallback: "请复制这个地址，在电脑上打开。",
    pairRecovery: "如果 SaySo 提示“配件已和另一台 iPhone 配对”，请把配件插到原来的 iPhone 上。在 SaySo 打开“设置 → SaySo 配件”，点“移除配件”。",
    pairWithoutOriginal: "如果用不了原手机，请按本页安装步骤重置配件，再重新配对。",
    pairAfterReset: "如果 iPhone 提示“配件已经重置，要重新配对吗？”，请点“重新配对”。",
    assistiveNext: "下一步：打开辅助触控。",
    assistiveNextBody: "按“开始使用”里的辅助触控步骤设置，配件才能点按屏幕。",
  },
};

export const diagramAlts = {
  prepare: [
    "Computer, data cable and white AtomS3 Lite accessory",
    "电脑、数据线和白色 AtomS3 Lite 配件",
  ],
  "download-mode": [
    "Cable connected, small side reset held for two seconds until the green light comes on",
    "已接数据线，长按侧边复位键两秒至绿灯亮",
  ],
  "port-picker": [
    "Serial port chooser with USB JTAG/serial debug unit selected",
    "串口窗口选中 USB JTAG/serial debug unit 的示例",
  ],
  "pair-iphone": [
    "USB-C iPhone connected to the accessory, showing the pairing prompt",
    "USB-C iPhone 连接配件后显示配对提示",
  ],
  confirm: ["Installation confirmation dialog", "安装确认弹窗"],
  progress: ["Installation progress dialog", "安装进度弹窗"],
  success: ["Installation completed dialog", "安装完成弹窗"],
};
