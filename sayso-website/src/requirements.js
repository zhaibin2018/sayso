export const requirements = {
  "en": {
    "phone": [
      "iPhone with iOS 17.0 or later",
      "iOS 17.0 is the App deployment target. Screen guidance does not require USB-C; iPhone 11 can share its screen. Model and iOS verification is separate."
    ],
    "chatgpt": [
      "ChatGPT Plus or higher",
      "Use the ChatGPT app with your account. Work or school accounts may need an admin to turn this on."
    ],
    "installer": [
      "Connect ChatGPT in SaySo",
      "The intended route opens ChatGPT to install the SaySo plugin and authorize it. The complete iPhone setup flow is still being verified."
    ],
    "network": [
      "Internet and ChatGPT Voice",
      "ChatGPT usage limits also apply."
    ],
    "accessory": [
      "M5Stack AtomS3 Lite (C124)",
      "Sold separately; add a USB-C data cable."
    ],
    "computer": [
      "One-time firmware setup on a computer",
      "Use desktop Chrome or Edge to install the accessory firmware."
    ],
    "verified": [
      "Check the model and iOS combination",
      "Only combinations listed as verified are supported for tapping."
    ],
    "fees": "Free screen guidance, with no session limit. Planned: 10 completed tapping tasks per month; more tasks through an in-app subscription or one-time purchase (planned).",
    "costs": "ChatGPT subscription and accessory costs are separate.",
    "hardwareSummary": "Screen guidance needs an iPhone with iOS 17.0 or later and internet; USB-C is not required. Tapping also needs a verified iPhone/iOS combination and an M5Stack AtomS3 Lite, sold separately.",
    "setupSummary": "Download SaySo, then connect ChatGPT in the app with ChatGPT Plus or higher. The complete phone setup flow is still being verified. Only accessory firmware installation needs a computer.",
    "compatibilityNote": "Screen guidance does not require USB-C; iPhone 11 screen guidance is user-confirmed. iOS 17.0 is the App deployment target, not verification of every combination. Tapping supports only listed verified model/iOS combinations.",
    "keyboardNote": "Before typing with SaySo, switch your iPhone keyboard to English (ABC).",
    "screenSummary": "Screen guidance needs no accessory, USB-C connection or firmware flashing. It needs internet and your connected SaySo service."
  },
  "zh": {
    "phone": [
      "iPhone，iOS 17.0 或更高版本",
      "iOS 17.0 是 App 的最低部署目标。读屏不要求 USB-C，iPhone 11 也能共享画面；机型与系统组合的验证另列。"
    ],
    "chatgpt": [
      "ChatGPT Plus 或更高",
      "使用 ChatGPT App 和你的账号；工作或学校账号可能需要管理员开通。"
    ],
    "installer": [
      "在 SaySo 里连接 ChatGPT",
      "目标是跳转到 ChatGPT 安装 SaySo 插件并授权；iPhone 内完整安装流程仍在验证。"
    ],
    "network": [
      "网络连接和 ChatGPT 语音",
      "同时受 ChatGPT 用量限制。"
    ],
    "accessory": [
      "M5Stack AtomS3 Lite（C124）",
      "需单独购买，并准备 USB-C 数据线。"
    ],
    "computer": [
      "安装固件时用一次电脑",
      "用电脑上的 Chrome 或 Edge 安装配件固件。"
    ],
    "verified": [
      "核对机型与 iOS 版本",
      "帮你点只支持兼容表中已验证的组合。"
    ],
    "fees": "读屏免费，不限次数。计划中：每月 10 个完成的帮你点任务；更多次数可在 App 内订阅或买断（计划中）。",
    "costs": "ChatGPT 订阅和配件费用另计。",
    "hardwareSummary": "读屏需要 iOS 17.0 或更高版本的 iPhone 和网络，不要求 USB-C。帮你点还需要已验证的机型与系统组合，并单独购买 M5Stack AtomS3 Lite。",
    "setupSummary": "先下载 SaySo，再在 App 里连接 ChatGPT，账号需为 ChatGPT Plus 或更高。手机完整流程仍在验证；只有安装配件固件时需要电脑。",
    "compatibilityNote": "读屏不要求 USB-C，用户已确认 iPhone 11 能读屏。iOS 17.0 是 App 最低部署目标，不代表所有组合均已验证。帮你点只支持表中已验证的机型与系统组合。",
    "keyboardNote": "用 SaySo 打字前，请把手机键盘切到英文（ABC）。",
    "screenSummary": "读屏不需要配件、USB-C 连接或刷写固件；需要网络和所连接的 SaySo 服务。"
  }
};
export const requirementRows = lang => ["phone","chatgpt","installer","network","verified","accessory","computer"].map(key => requirements[lang][key]);
