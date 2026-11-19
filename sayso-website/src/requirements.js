export const requirements = {
  "en": {
    "phone": [
      "iPhone with iOS 17 or later",
      "Screen reading works with both Lightning and USB-C iPhones."
    ],
    "chatgpt": [
      "ChatGPT Plus or higher",
      "Use your own ChatGPT app and account. A work or school account may need an administrator to enable access first."
    ],
    "installer": [
      "Connect to ChatGPT from SaySo",
      "SaySo walks you through it. No copying or pasting."
    ],
    "network": [
      "Internet, and ChatGPT by voice or text",
      "Voice feels most natural. You can also type a request like “Find Changi Airport in Maps.” SaySo opens Maps for you, and you can watch as it goes. ChatGPT usage limits still apply."
    ],
    "accessory": [
      "A small accessory: M5Stack AtomS3 Lite (C124)",
      "You only need it for tapping for you. Buy it separately, along with a USB-C data cable."
    ],
    "computer": [
      "A computer, just once",
      "Use Chrome or Edge to install the accessory’s software. You only need to do this once."
    ],
    "verified": [
      "Check whether your phone is on the compatibility list",
      "Tapping for you supports only tested iPhone models and iOS versions."
    ],
    "fees": "Screen reading is free with no limit. Tapping for you includes 10 free tasks a month; need more, subscribe or buy once in the app. A task means getting one thing done, even if it takes several taps. Your ChatGPT subscription and accessory are separate purchases. (Pricing and task counting are still in development.)",
    "costs": "Your ChatGPT subscription and accessory are separate purchases.",
    "hardwareSummary": "For screen reading, you just need an iPhone and internet. To have it tap for you, add a small accessory and use a computer once to set it up.",
    "setupSummary": "For screen reading, you just need an iPhone and internet. To have it tap for you, add a small accessory and use a computer once to set it up.",
    "compatibilityNote": "For screen reading, you just need an iPhone and internet. To have it tap for you, add a small accessory and use a computer once to set it up.",
    "keyboardNote": "Before SaySo types for you, switch your keyboard to English (ABC). For now, it can only type English letters and numbers.",
    "screenSummary": "For screen reading, you just need an iPhone and internet. To have it tap for you, add a small accessory and use a computer once to set it up."
  },
  "zh": {
    "phone": [
      "iPhone，iOS 17 或更新",
      "读屏不挑接口，Lightning 和 USB-C 的 iPhone 都可以。"
    ],
    "chatgpt": [
      "ChatGPT Plus 或更高",
      "用你自己的 ChatGPT App 和账号。工作或学校账号可能要管理员先开通。"
    ],
    "installer": [
      "在 SaySo 里连上 ChatGPT",
      "SaySo 会带你完成，不用复制粘贴。"
    ],
    "network": [
      "网络，以及 ChatGPT 语音或打字",
      "用语音最顺手；也可以打字让它帮你做事，比如“帮我在地图里找樟宜机场”，SaySo 会自己打开地图，你看着它做就行。ChatGPT 的使用额度照常计算。"
    ],
    "accessory": [
      "小配件 M5Stack AtomS3 Lite（C124）",
      "只有“帮你点”才需要，另外买，再配一根 USB-C 数据线。"
    ],
    "computer": [
      "一台电脑（只用一次）",
      "给配件装程序时用一下，Chrome 或 Edge 浏览器就行。"
    ],
    "verified": [
      "看看你的手机在不在兼容列表里",
      "帮你点只支持验证过的机型和系统版本。"
    ],
    "fees": "读屏免费，不限次数。帮你点每月免费 10 次，不够用可以在 App 里订阅或一次买断。一次“帮你点”指完成一件事，中间可以点好几下。ChatGPT 的订阅和配件需要另外购买。（收费和次数统计还在开发中）",
    "costs": "ChatGPT 的订阅和配件需要另外购买。",
    "hardwareSummary": "读屏只要一台 iPhone 和网络；想让它帮你点，再加一个小配件和一台电脑（只用一次）。",
    "setupSummary": "读屏只要一台 iPhone 和网络；想让它帮你点，再加一个小配件和一台电脑（只用一次）。",
    "compatibilityNote": "读屏只要一台 iPhone 和网络；想让它帮你点，再加一个小配件和一台电脑（只用一次）。",
    "keyboardNote": "让 SaySo 帮你打字前，先把键盘切到英文（ABC）。目前只能输入英文字母和数字。",
    "screenSummary": "读屏只要一台 iPhone 和网络；想让它帮你点，再加一个小配件和一台电脑（只用一次）。"
  }
};
export const requirementRows = lang => ["phone","chatgpt","installer","network","verified","accessory","computer"].map(key => requirements[lang][key]);
