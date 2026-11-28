export const installationUrl = "https://zhaibin2018.github.io/sayso/install";
export const installationMessage = {
  en: `Please install SaySo for me: ${installationUrl}`,
  zh: `请帮我安装 SaySo：${installationUrl}`,
};

export const switchingGuide =
  "https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex";
export const sharingInstructions = {
  en: {
    title: "Start sharing and ask",
    short:
      "Tap “Start sharing” in SaySo and confirm with “Start Broadcast” in iOS, then tap “Open ChatGPT”, send the prefilled message in Chat, start Voice, and switch to the app you want help with and ask your question.",
    example: "For example, ask: “What does this switch do?”",
    accessoryPrompt: "Using the accessory? If SaySo shows “Allow tapping”, tap it before you ask ChatGPT to tap.",
    steps: [
      "In the SaySo app, tap “Start sharing”. If SaySo asks for consent, review where your screen goes, then tap “Agree and start sharing” if you agree.",
      "In the iOS window, check that it shows SaySo, tap “Start Broadcast”, and wait for the countdown. If the window doesn’t open, tap “Open broadcast window” in SaySo first.",
      "When sharing starts, tap “Open ChatGPT” in SaySo. In ChatGPT, tap the model name and choose Chat if needed. Send the prefilled message.",
      "In that conversation, start Voice.",
      "Switch to the app you want help with and ask your question.",
    ],
    end: "When you’re done, tap “End sharing” on the SaySo home screen.",
  },
  zh: {
    title: "开始共享并提问",
    short:
      "在 SaySo 点“开始共享”，在 iOS 窗口点“开始直播”确认，再点“打开 ChatGPT”，在“聊天”里发送预填消息，开启语音，然后切到你想请 ChatGPT 帮忙的 App 并提问。",
    example: "比如问：“这个开关是干什么的？”",
    accessoryPrompt: "用配件时：如果 SaySo 显示“允许帮你点”，先点它，再让 ChatGPT 帮你点。",
    steps: [
      "在 SaySo App 点“开始共享”。如果 SaySo 询问是否同意，请先阅读画面会发到哪里。同意后点“同意并开始共享”。",
      "在 iOS 窗口确认显示的是 SaySo，点“开始直播”并等倒数完成。如果窗口没打开，先在 SaySo 点“打开系统广播窗口”。",
      "共享开始后，在 SaySo 点“打开 ChatGPT”。如有需要，在 ChatGPT 点模型名称并选择“聊天”。发送预填消息。",
      "在这段对话里开启语音。",
      "切到你想请 ChatGPT 帮忙的 App，然后提问。",
    ],
    end: "用完后，在 SaySo 首页点“结束共享”。",
  },
};

export const serviceDefinition = {
  en: "The SaySo service is a private service set up in your own ChatGPT account. ChatGPT uses it to see your shared screen and, with an accessory, tap for you.",
  zh: "SaySo 服务是建在你自己 ChatGPT 账号下的私人服务。ChatGPT 通过它看你共享的屏幕，接上配件后还能帮你点。",
};

export const installation = {
  en: {
    title: "Get started",
    before: "Before you start",
    phone: "Set up on your iPhone",
    optional: "Want ChatGPT to tap for you? (optional)",
    help: "Need help?",
    workChat:
      "Use Work’s tools to install and connect your private SaySo service. For everyday help, switch to Chat and start Voice in the conversation where you send the prefilled sharing message in step 3. To switch, tap the model name in ChatGPT and choose Work or Chat.",
    switchLabel: "How to switch",
    install: {
      title: "Install the SaySo app on your iPhone",
      expected: "The SaySo app appears on your iPhone Home Screen.",
    },
    connection: {
      title: "Connect ChatGPT",
      action: "Tap “Connect ChatGPT” in the SaySo app.",
      steps: [
        [
          "In ChatGPT, tap the model name, choose Work, and send the prefilled connection message. You’ll see a connection link.",
          "If ChatGPT installs the SaySo service first instead, wait for it to finish, return to the SaySo app, tap “Connect ChatGPT” again, and send the new message in a new Work conversation.",
        ],
        [
          "Open the link ChatGPT gives you. Tap “Generate connection”, then “Return to SaySo to connect”.",
          "The SaySo app shows “Service connected”.",
        ],
      ],
    },
    sharingResult: "ChatGPT answers about the screen you’re on.",
    permissions: {
      title: "In ChatGPT: app permissions (optional)",
      body: "In ChatGPT, open Settings, go to Apps (or Plugins if that’s what your menu shows), select SaySo, and open Permissions. If available, choose “Allow all actions”. Some accounts show “Allow all tools” or “Allow all”. This lets ChatGPT use SaySo for tapping with fewer approval prompts. For payments, orders, sending and deleting, ChatGPT is told to leave the final tap to you. You can tap “Stop tapping” in the SaySo app at any time while tapping is allowed.",
    },
    assistiveTouch: {
      title: ["The accessory needs AssistiveTouch", " to tap the screen"],
      summary:
        "In Settings, search for “AssistiveTouch”. Turn on AssistiveTouch. To drag, also turn on “Perform Touch Gestures” on the same screen.",
      open: "In SaySo, tap “Open Settings”.",
      steps: [
        "If Settings is on the SaySo page, go back to the main Settings screen first.",
        "Tap “Accessibility”.",
        "Tap “Touch” to find the touch and pointer controls.",
        "Tap “AssistiveTouch” to open its settings.",
        "Turn on “AssistiveTouch” so the accessory can tap the screen.",
        "For dragging, scroll down on the same screen and turn on “Perform Touch Gestures”. This lets the accessory drag items like a finger.",
        "Optional: Tap “Pointer Style”, then “Color”, and choose a color you can easily see. You can keep the default size. Labels may vary by iOS version.",
      ],
      confirm: "Back in SaySo, tap “I’ve turned on AssistiveTouch”.",
      details: "AssistiveTouch instructions",
    },
    tapping: {
      title: "In SaySo: how to allow tapping",
      subtitle: "You can change this in Settings.",
      automatic: "Allow automatically",
      automaticBody:
        "Turns on tapping automatically each time you start sharing when your accessory is ready.",
      ask: "Ask me each time",
      askBody:
        "After you start sharing, tap “Allow tapping” in SaySo when you want help.",
      safety:
        "For payments, orders, sending and deleting, ChatGPT is told to leave the final tap to you. Tap “Stop tapping” in SaySo whenever tapping is on.",
    },
    controlSteps: [
      [
        "Set up the accessory on a computer",
        "Get an M5Stack AtomS3 Lite (C124) and a USB-C data cable. Open the accessory setup page in Chrome or Edge on your computer and install SaySo on the accessory so it can pair with your iPhone.",
        "The browser shows “All installed!”.",
        1,
      ],
      [
        "Connect and pair",
        "Connect the accessory to a compatible iPhone with the USB-C data cable. When “SaySo accessory found” appears, tap “Start pairing”. When the light flashes, press the front button once. This confirms you’re pairing the accessory in your hand.",
        "The accessory shows as connected.",
        5,
      ],
    ],
  },
  zh: {
    title: "开始使用",
    before: "开始前",
    phone: "在 iPhone 上设置",
    optional: "想让 ChatGPT 帮你点（可选）",
    help: "遇到问题？",
    workChat:
      "用“工作”里的工具安装并连接你的私人 SaySo 服务。平时需要帮忙时，切到“聊天”，在第 3 步发送共享消息的对话里开启语音。切换时，在 ChatGPT 点模型名称，选“工作”或“聊天”。",
    switchLabel: "怎么切换",
    install: {
      title: "在 iPhone 上安装 SaySo App",
      expected: "iPhone 主屏幕会出现 SaySo App。",
    },
    connection: {
      title: "连接 ChatGPT",
      action: "在 SaySo App 点“连接 ChatGPT”。",
      steps: [
        [
          "在 ChatGPT 点模型名称，选“工作”，发送用于连接的预填消息，你会看到连接链接。",
          "如果 ChatGPT 先帮你安装了 SaySo 服务，请等它装好，回到 SaySo App 再点一次“连接 ChatGPT”，在新的“工作”对话里发送新的消息。",
        ],
        [
          "打开 ChatGPT 给你的链接，点“生成连接”，再点“回到 SaySo 完成连接”。",
          "SaySo App 会显示“服务已连接”。",
        ],
      ],
    },
    sharingResult: "ChatGPT 会回答关于你当前屏幕的问题。",
    permissions: {
      title: "在 ChatGPT 里：应用权限（可选）",
      body: "在 ChatGPT 打开“设置”，进入“应用”（如果菜单显示“插件”，就进入“插件”），选择 SaySo，再打开“权限”。如果有“全部允许所有操作”这类选项，选它。不同账号的叫法可能是“允许所有工具”或“全部允许”。这样 ChatGPT 用 SaySo 帮你点时可以减少反复确认。遇到付款、下单、发送和删除，ChatGPT 会按要求把最后一下留给你。允许帮你点期间，随时可以在 SaySo App 点“停止帮你点”。",
    },
    assistiveTouch: {
      title: ["配件需要辅助触控", "才能点按屏幕"],
      summary:
        "在“设置”里搜索“辅助触控”。打开“辅助触控”。如果要拖动，也要在同一页打开“执行触控手势”。",
      open: "在 SaySo 点“打开设置”。",
      steps: [
        "如果设置停在 SaySo 页面，先返回设置首页。",
        "点“辅助功能”。",
        "点“触控”，查找触控和指针设置。",
        "点“辅助触控”，打开该功能的设置。",
        "打开“辅助触控”，配件就可以点按屏幕。",
        "要使用拖动，在同一页往下找并打开“执行触控手势”。这样配件就能像手指一样拖动。",
        "可选：点“指针样式”，再点“颜色”，选一个容易看清的颜色。大小可以保持默认。选项名称可能随 iOS 版本变化。",
      ],
      confirm: "回到 SaySo 后，点“我已打开辅助触控”。",
      details: "辅助触控设置步骤",
    },
    tapping: {
      title: "在 SaySo 里：怎么允许帮你点",
      subtitle: "你可以在设置里更改。",
      automatic: "自动允许",
      automaticBody: "配件就绪时，每次开始共享都会自动开启帮你点。",
      ask: "每次先问我",
      askBody: "每次开始共享后，需要帮你点时，在 SaySo 点“允许帮你点”。",
      safety:
        "遇到付款、下单、发送和删除，ChatGPT 会按要求把最后一下留给你。开启帮你点后，随时可以在 SaySo 点“停止帮你点”。",
    },
    controlSteps: [
      [
        "用电脑准备配件",
        "准备 M5Stack AtomS3 Lite（C124）及能传数据的 USB-C 线。用电脑的 Chrome 或 Edge 打开配件设置页，给配件装上 SaySo，装好后才能和 iPhone 配对。",
        "浏览器显示“安装好了！”。",
        1,
      ],
      [
        "连接并配对",
        "把配件用 USB-C 数据线接到兼容的 iPhone。看到“发现 SaySo 配件”后，点“开始配对”，等灯闪烁再按一下配件正面按钮，确认你要配对的是手上的配件。",
        "配件已连接。",
        5,
      ],
    ],
  },
};
