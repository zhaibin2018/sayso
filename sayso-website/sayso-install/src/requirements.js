const summaries = {
  en: "You need an iPhone and a ChatGPT Plus plan (or higher). To have ChatGPT tap for you, add a small accessory and use a computer once to set it up.",
  zh: "你需要一台 iPhone 和 ChatGPT Plus（或更高）套餐。想让 ChatGPT 帮你点，还需要一个小配件，并用电脑设置一次。",
};

const usbRequirements = {
  en: "Tapping for you requires an iPhone with USB-C (iPhone 15 or later).",
  zh: "帮你点需要 USB-C 接口的 iPhone（iPhone 15 及以后机型）。",
};

const feeParagraphs = {
  en: [
    "Letting ChatGPT see your screen is free with SaySo. SaySo’s free plan includes 10 tapping sessions each month.",
    "A session starts when ChatGPT first taps for you. It lasts up to 30 minutes and ends after 15 minutes of no activity. Tapping after that starts a new session.",
    "SaySo Pro is available monthly or annually. To see prices, open Settings in the SaySo app and choose “Subscription plans” under SaySo Pro. Your ChatGPT subscription and accessory are separate purchases.",
  ],
  zh: [
    "SaySo 免费提供看屏幕功能。SaySo 免费版每月包含 10 次帮你点。",
    "从 ChatGPT 第一次帮你点开始算一次，最长 30 分钟，空闲 15 分钟就结束。之后再用，算新的一次。",
    "SaySo Pro 可按月或按年订阅。查看价格时，请打开 SaySo App 的设置，在 SaySo Pro 下点“订阅方案”。ChatGPT 订阅和配件需要另购。",
  ],
};

export const requirements = {
  "en": {
    "phone": [
      "iPhone with iOS 17 or later",
      "ChatGPT can see your screen on both Lightning and USB-C iPhones."
    ],
    "chatgpt": [
      "ChatGPT Plus or higher",
      "Use your own ChatGPT app and account. A work or school account may need an administrator to enable access first."
    ],
    "network": [
      "Internet, and ChatGPT by voice or text",
      "You can speak or type a question about the screen you’re sharing, such as “What does this switch do?” ChatGPT usage limits still apply."
    ],
    "accessory": [
      "A small accessory: M5Stack AtomS3 Lite (C124)",
      "You only need it for tapping for you. Buy it separately, along with a USB-C data cable."
    ],
    "computer": [
      "A computer, just once",
      "Use Chrome or Edge on your computer to install SaySo on the accessory. You only need to do this once."
    ],
    "verified": [
      "Check whether your phone is on the compatibility list",
      `${usbRequirements.en} The list shows which iPhone models and iOS versions have been tested.`
    ],
    "usbRequirement": usbRequirements.en,
    "fees": feeParagraphs.en.join(" "),
    "feeParagraphs": feeParagraphs.en,
    "costs": "Your ChatGPT subscription and accessory are separate purchases.",
    "hardwareSummary": summaries.en,
    "setupSummary": summaries.en,
    "compatibilityNote": summaries.en,
    "keyboardNote": "Before SaySo types for you, switch your keyboard to English (ABC). For now, it can only type English letters and numbers.",
    "screenSummary": summaries.en
  },
  "zh": {
    "phone": [
      "iPhone，iOS 17 或更新",
      "Lightning 和 USB-C 的 iPhone 都可以让 ChatGPT 看屏幕。"
    ],
    "chatgpt": [
      "ChatGPT Plus 或更高",
      "用你自己的 ChatGPT App 和账号。工作或学校账号可能要管理员先开通。"
    ],
    "network": [
      "网络，以及 ChatGPT 语音或打字",
      "你可以开口或打字询问正在共享的屏幕，比如“这个开关是干什么的？”ChatGPT 的使用额度照常计算。"
    ],
    "accessory": [
      "小配件 M5Stack AtomS3 Lite（C124）",
      "只有“帮你点”才需要，另外买，再配一根 USB-C 数据线。"
    ],
    "computer": [
      "一台电脑（只用一次）",
      "在电脑上用 Chrome 或 Edge 给配件装上 SaySo，只需一次。"
    ],
    "verified": [
      "看看你的手机在不在兼容列表里",
      `${usbRequirements.zh}列表标出了已验证的 iPhone 机型和系统版本。`
    ],
    "usbRequirement": usbRequirements.zh,
    "fees": feeParagraphs.zh.join(""),
    "feeParagraphs": feeParagraphs.zh,
    "costs": "ChatGPT 的订阅和配件需要另外购买。",
    "hardwareSummary": summaries.zh,
    "setupSummary": summaries.zh,
    "compatibilityNote": summaries.zh,
    "keyboardNote": "让 SaySo 帮你打字前，先把键盘切到英文（ABC）。目前只能输入英文字母和数字。",
    "screenSummary": summaries.zh
  }
};
export const requirementGroups = lang => ({
  screen: ["phone", "chatgpt", "network"].map(key => requirements[lang][key]),
  tapping: ["verified", "accessory", "computer"].map(key => requirements[lang][key]),
});
export const requirementRows = lang => Object.values(requirementGroups(lang)).flat();
