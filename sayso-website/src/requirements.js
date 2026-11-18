export const requirements = {
  "en": {
    "phone": [
      "A supported USB-C iPhone",
      "Lightning models are not supported for screen guidance or tapping."
    ],
    "chatgpt": [
      "ChatGPT app and account",
      "Plus or Pro for Sites. Work or school accounts may need an admin to turn this on."
    ],
    "installer": [
      "Someone comfortable with ChatGPT",
      "A family member or helper sets up your private SaySo service using your account. The complete iPhone setup flow is not yet verified."
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
    "fees": "Planned: free screen guidance and 5 completed tapping tasks per month. More tasks will be available in the app (planned).",
    "costs": "ChatGPT subscription and accessory costs are separate.",
    "hardwareSummary": "SaySo needs a supported USB-C iPhone (Lightning models aren't supported yet). Tapping also needs an M5Stack AtomS3 Lite, sold separately (reference price US$7.50*).",
    "setupSummary": "The intended setup starts in ChatGPT on the iPhone; the complete phone flow is not yet verified. A computer is needed once to install the accessory firmware.",
    "compatibilityNote": "Listed combinations show their verified iOS version. Unlisted combinations have not been verified; USB-C alone does not establish support.",
    "screenSummary": "Screen guidance does not need the accessory or firmware flashing. It still needs a supported USB-C iPhone and your private SaySo service."
  },
  "zh": {
    "phone": [
      "受支持的 USB-C iPhone",
      "暂不支持 Lightning 机型，读屏和帮你点都不支持。"
    ],
    "chatgpt": [
      "ChatGPT App 和账号",
      "使用 Sites 需要 Plus 或 Pro；工作或学校账号可能需要管理员开通。"
    ],
    "installer": [
      "由熟悉 ChatGPT 的人安装",
      "请家人或帮忙的人使用你的账号设置私人服务。iPhone 内完整安装流程尚未验证。"
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
    "fees": "计划中：免费读屏，每月 5 个完成的帮你点任务；更多任务额度将可在 App 内升级（计划中）。",
    "costs": "ChatGPT 订阅和配件费用另计。",
    "hardwareSummary": "SaySo 需要受支持的 USB-C iPhone（暂不支持 Lightning 机型）。如需帮你点，还要单独购买 M5Stack AtomS3 Lite（参考价 US$7.50*）。",
    "setupSummary": "目标是在 iPhone 的 ChatGPT 中开始设置，手机完整流程尚未验证。只有安装配件固件时，才需要用一次电脑。",
    "compatibilityNote": "已列出的组合显示已验证的 iOS 版本；未列出的组合尚未验证。有 USB-C 接口不等于已获支持。",
    "screenSummary": "读屏不需要配件或刷写固件，但仍需要受支持的 USB-C iPhone 和你的私人服务。"
  }
};
export const requirementRows = lang => ["phone","chatgpt","installer","network","verified","accessory","computer"].map(key => requirements[lang][key]);
