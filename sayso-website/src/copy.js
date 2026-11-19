// Terminology: screen reading=读屏; tapping for you=帮你点; Stop Control=停止控制; End Sharing=结束共享.
import {requirements,requirementRows} from "./requirements.js";
export const copy = {
  "en": {
    "home": "Home",
    "start": "Get started",
    "guides": "Guides",
    "firmware": "Prepare the accessory",
    "github": "GitHub",
    "privacy": "Privacy",
    "support": "Troubleshooting",
    "licenses": "Licenses",
    "buy": "Where to buy the accessory",
    "requirements": "What you’ll need",
    "skip": "Skip to content",
    "menu": "Open navigation",
    "closeMenu": "Close navigation",
    "theme": "Switch appearance",
    "language": "切换到中文",
    "headline": [
      "Tell ChatGPT.",
      "Let SaySo do the tapping."
    ],
    "subtitle": "Like having someone beside you: you ask, it watches your screen and takes it step by step.",
    "finalTapNote": "For payments, orders, messages and deletions, SaySo leaves the pointer on the final button and waits for you to tap.",
    "comparisonTitle": "How is this different from ChatGPT’s built-in screen sharing?",
    "comparisonDisclaimer": "SaySo is an independent third-party tool and is not affiliated with OpenAI.",
    "feesTitle": "Costs and free tasks",
    "appNameNote": "To open an app, use its English name or pinyin. Support for Chinese app names is being improved.",
    "download": "Download SaySo",
    "downloadPending": "Coming soon on the App Store",
    "downloadNote": "You can download it once it’s on the App Store.",
    "qrPending": "QR code available at launch",
    "qrLabel": "Scan to download SaySo",
    "already": "Already installed? Here’s how to start",
    "checkAll": "See what you’ll need",
    "everyday": [
      "Those little things you get stuck on,",
      "just ask for a hand."
    ],
    "chooseScene": "Pick a scene to see how SaySo can help.",
    "scenes": [
      [
        "Find my bus",
        "When the next bus arrives"
      ],
      [
        "Order food",
        "You tap to place the order"
      ],
      [
        "Cancel a subscription",
        "You tap the final confirmation"
      ],
      [
        "Understand a setting",
        "Just looking, no accessory needed"
      ]
    ],
    "videoPending": "Video coming soon",
    "portrait": "Portrait demo",
    "scenePending": "This is an illustration, not a recording.",
    "playback": "Muted by default · Captions on · Pause anytime",
    "play": "Play video",
    "pause": "Pause video",
    "mute": "Mute video",
    "unmute": "Unmute video",
    "replay": "Replay video",
    "mediaError": "This video could not be loaded. Try again or choose another scene.",
    "retry": "Try again",
    "priceNote": "*Official item price checked Nov 16, 2026. Shipping and taxes may apply.",
    "currentPrice": "Check current price",
    "privacyShort": "When you start sharing, your screen images go to your own SaySo service and ChatGPT so it can understand what’s on screen.",
    "privacyLink": "Where do your screen images go?",
    "disclaimer": "SaySo is an independent tool that works with ChatGPT. It is not affiliated with OpenAI or M5Stack.",
    "preview": "SaySo is still in development and isn’t available to download yet.",
    "before": "Before you start.",
    "beforeSub": "Helping a family member set up? Use their own iPhone and ChatGPT account.",
    "need": "What you’ll need",
    "screenGroup": "Everyone needs",
    "controlGroup": "To let SaySo tap, also add",
    "viewCompat": "Check the compatibility list",
    "startPrerequisite": "Before you start, have an iPhone and a ChatGPT Plus account (or higher) ready.",
    "storeSoon": "Coming soon on the App Store",
    "threeSteps": "Get started in three steps",
    "connectionPending": "(The Connect ChatGPT step is still in development.)",
    "controlTitle": "Want it to tap for you too?",
    "controlSubtitle": "Add a small accessory, and it can tap, type and scroll for you.",
    "controlSteps": [
      [
        "Get a small accessory",
        "You’ll need an M5Stack AtomS3 Lite (model C124) and a USB-C data cable. Check the compatibility list below before buying."
      ],
      [
        "Set it up on a computer, just once",
        "Open the installer in Chrome or Edge on your computer. It only takes a few minutes. (The installer is still being prepared.)"
      ],
      [
        "Pair it with SaySo",
        "Pair the accessory in SaySo. Whenever you want it to tap for you, first tap Allow tapping for this session in SaySo."
      ]
    ],
    "controlCompatibility": "Tapping for you currently supports only the tested iPhone models and iOS versions on the compatibility list. Hold your phone upright.",
    "detailsTitle": "A few more details",
    "steps": [
      [
        "Download SaySo",
        "Get it from the App Store, then open it to begin.",
        "SaySo app page"
      ],
      [
        "Connect to ChatGPT",
        "Tap Connect ChatGPT in SaySo. It takes you to ChatGPT to finish setup, then brings you back to SaySo automatically. No copying or pasting.",
        "Set up SaySo in ChatGPT"
      ],
      [
        "Start sharing and just ask",
        "Tap Start Sharing in SaySo, then go to the app you want to use. Open ChatGPT Voice and ask something like “What does this switch do?”",
        "Screen sharing in SaySo"
      ]
    ],
    "screenshot": "Screenshot coming soon",
    "screenshotEn": "English screenshot shown; Chinese version pending.",
    "captured": "Captured",
    "resume": "Stuck? Start here",
    "approve": "When ChatGPT asks for permission, tap the screen.",
    "approveSub": "Tap Allow or Decline on the card in ChatGPT. Saying “yes” doesn’t count.",
    "connectedNote": "Connecting to ChatGPT doesn’t share your screen automatically. Tap Start Sharing in SaySo when you’re ready.",
    "guidesTitle": "A few things to know",
    "guidesSub": "First time? Start with Connect ChatGPT in SaySo.",
    "guideSections": [
      [
        "You can stop at any time",
        "Want it to stop? Open SaySo and tap Stop Control. It works straight away, without waiting for ChatGPT. To stop sending screen images too, tap End Sharing. You can always stop, even after your free tasks run out."
      ],
      [
        "Start and end sharing",
        "Tap Start Sharing in SaySo, then go to the app you want to use and ask in ChatGPT Voice. When you’re done, tap End Sharing in SaySo."
      ],
      [
        "When ChatGPT asks for permission",
        "Tap Allow or Decline on the card. Saying “yes” doesn’t count. This is separate from making the final tap yourself."
      ],
      [
        "The final tap is yours",
        "For payments, orders, messages, deletions, cancelling subscriptions and transfers, it leaves the pointer on the final button and waits for you to check and tap. This is a rule it follows, not a hard lock, so please look before you tap each time."
      ],
      [
        "Enter card details and passwords yourself",
        "Please enter bank card numbers, passwords and verification codes yourself. Don’t ask SaySo to fill them in."
      ],
      [
        "Some screens stay hidden",
        "Banking and payment apps, identity apps such as Singpass, company-managed apps and protected videos may hide their screens. SaySo will tell you it can’t see them and won’t try to get around it. This helps protect you. For example, some identity apps show “Screen recording disabled”; SaySo will tell you it can’t see the screen."
      ],
      [
        "Hold your phone upright",
        "Tapping for you needs portrait mode, so hold your phone upright."
      ]
    ],
    "officialDocs": "Official ChatGPT documentation",
    "sitesDocs": "ChatGPT service availability and limits",
    "voiceDocs": "Voice and on-screen approvals",
    "firmwareTitle": "Set up your accessory",
    "firmwareSub": "The software is free. Install it once from a browser on your computer.",
    "installerPending": "The installer is still being prepared.",
    "installer": "Open the installer",
    "firmwareBody": "Before buying an accessory or installing its software, check whether your phone is on the compatibility list. Setup happens on a separate installer page. This website won’t connect to your accessory.",
    "compatTitle": "Compatibility list",
    "compatColumns": [
      "Use",
      "iPhone",
      "iOS",
      "App",
      "Accessory / firmware",
      "Verified"
    ],
    "screenMode": "Screen reading",
    "controlMode": "Tapping",
    "buyTitle": "Get the right accessory",
    "buySub": "Look for AtomS3 Lite (model C124). Atom Lite, AtomS3 and AtomS3R have similar names, but they’re different products.",
    "officialShop": "M5Stack official store",
    "digikey": "DigiKey · C124",
    "vendor": "Visit product page",
    "buyNote": "Prices and stock can change. Before ordering, check the total including shipping and taxes.",
    "privacyTitle": "Where your screen images go",
    "privacySub": "Sharing your screen, letting it tap for you and deleting data are three separate choices.",
    "draft": "This is a draft. The final privacy policy will be published before launch.",
    "privacySections": [
      [
        "Where your images go",
        "When you start sharing, screen images go to your own SaySo service under your ChatGPT account and to ChatGPT so it can understand the screen. Personal information from other apps may appear in those images. ChatGPT handles voice under its own policies. SaySo itself doesn’t use your microphone."
      ],
      [
        "How long information stays",
        "Text SaySo types for you is deleted from the service when it’s finished. To prevent the same request running twice, it keeps only a short record without the content, which is trimmed after seven days."
      ],
      [
        "Stopping and disconnecting",
        "Stop Control stops tapping for you; screen sharing may stay on. End Sharing clears the cloud images from that session. Disconnecting a device clears its related records and screenshots. None of these deletes your ChatGPT conversations."
      ],
      [
        "Still being finished",
        "Full account deletion, backup deletion, and final publisher and contact details will be ready before launch."
      ],
      [
        "Protected screens",
        "If an app doesn’t allow screen sharing, SaySo respects that and won’t try to get around it. Not every banking or sensitive app hides its screen automatically, so take care while sharing."
      ]
    ],
    "supportTitle": "Let’s take a look together",
    "supportSub": "Start with what happened. You don’t need to share any passwords or sensitive personal information.",
    "supportItems": [
      [
        "I want it to stop",
        "Open SaySo and tap Stop Control. It stops straight away, without waiting for ChatGPT, even if ChatGPT is waiting for you to tap Allow. To stop sending screen images too, tap End Sharing."
      ],
      [
        "It says it can’t see my screen",
        "Check that you’ve tapped Start Sharing in SaySo and your phone is online. Connecting to ChatGPT doesn’t start sharing automatically; you need to tap to begin."
      ],
      [
        "ChatGPT keeps waiting for permission",
        "Tap Allow or Decline on the card in ChatGPT. Saying “yes” doesn’t count."
      ],
      [
        "It says it tapped, but nothing changed",
        "Check that the accessory is connected and you’ve tapped Allow tapping for this session in SaySo. If you’re unsure whether a payment, message or deletion went through, don’t keep trying. Look at the screen and check first."
      ],
      [
        "Enter card details and passwords yourself",
        "Please enter bank card numbers, passwords and verification codes yourself. Don’t ask SaySo to fill them in."
      ]
    ],
    "report": "What you can tell us",
    "reportBody": "Your SaySo version, iPhone model, iOS version, ChatGPT version, approximate time, what you did and any error number on screen. Please don’t send passwords, verification codes, pairing codes or payment details.",
    "contactPending": "Contact details will be announced before launch.",
    "contact": "Email support",
    "copyReport": "Copy report checklist",
    "copied": "Checklist copied",
    "copyFailed": "Copy unavailable. Select the checklist above to copy it.",
    "licensesTitle": "Free to use, with source you can read",
    "licensesSub": "Source-available under FSL-1.1-ALv2.",
    "licensesBody": "Original SaySo website, installer frontend, MCP, plugin and skill source is available under FSL-1.1-ALv2. Copyright 2026 ZHAI BIN. Each covered version receives an additional Apache-2.0 license after two years. This is source-available software, not OSI-approved open source. Third-party licenses and SaySo trademark rights remain separate. The iOS app and ESP firmware source are not included.",
    "licenseFrontend": "Website dependencies and bundled font notices",
    "repoPending": "The public GitHub repository is not configured yet.",
    "repoOpen": "Open GitHub repository",
    "notFound": "This page doesn’t exist.",
    "backHome": "Back to home",
    "configError": "Site configuration could not be loaded. Downloads and media remain unavailable.",
    "sceneExamples": {
      "bus": [
        "When is the next bus home?",
        "It opens Maps and checks the route.",
        "It tells you when the next bus arrives."
      ],
      "food": [
        "Help me order from my usual place.",
        "It opens the food app and helps you choose dishes.",
        "At the order button, the pointer stops and waits for you to tap."
      ],
      "subscription": [
        "Help me cancel this subscription.",
        "It finds the subscription page.",
        "At the final confirmation, the pointer stops and waits for you to tap."
      ],
      "setting": [
        "What does this switch do?",
        "It looks at your screen and explains.",
        "Just looking, no tapping."
      ]
    },
    "exampleLabel": "Illustrative conversation",
    "guideExamples": [
      [
        "Getting around",
        "When is the next bus home?",
        "Find a route to the library."
      ],
      [
        "Food",
        "Help me choose dinner.",
        "Stop at the final order button. I’ll tap it myself."
      ],
      [
        "Subscriptions",
        "Help me find this subscription.",
        "Take me to the cancellation confirmation."
      ],
      [
        "Settings",
        "What does this switch do?",
        "Explain this screen without tapping."
      ]
    ],
    "trySaying": "Try saying",
    "needHelp": "Need help?",
    "developerTitle": "Developer information",
    "developerVersion": "The latest service source includes fixes for stopping and privacy. If you deployed your own SaySo service, follow the installation guide to update it.",
    "installGuide": "Read the installation and update guide",
    "trademarkNotice": "SaySo trademark notice",
    "thirdPartyNotices": "Third-party notices",
    "compatPending": "Tapping for you supports only tested iPhone models and iOS versions. The compatibility list is still being prepared; please wait for it before buying an accessory.",
    "comparisonBody": "As of November 2026, ChatGPT’s built-in screen sharing is available only in some voice modes. It can see your iPhone screen, but can’t operate it for you. With SaySo, ChatGPT can see your screen in its latest voice mode too. Add the accessory, and it can tap, type and scroll for you, working through things step by step.",
    "developerSetup": "Want to host your own service? The GitHub setup guide includes a one-sentence instruction you can copy.",
    "licensesIntro": "SaySo’s source is available for you to read and host yourself."
  },
  "zh": {
    "home": "首页",
    "start": "开始使用",
    "guides": "使用指南",
    "firmware": "准备配件",
    "github": "GitHub",
    "privacy": "隐私",
    "support": "遇到问题",
    "licenses": "许可说明",
    "buy": "去哪里买配件",
    "requirements": "需要准备什么",
    "skip": "跳转到正文",
    "menu": "打开导航",
    "closeMenu": "关闭导航",
    "theme": "切换外观",
    "language": "Switch to English",
    "headline": [
      "对 ChatGPT 说一句，",
      "让 SaySo 帮你点。"
    ],
    "subtitle": "就像身边有人帮忙：你开口说，它看着你的屏幕，一步一步替你完成。",
    "finalTapNote": "付款、下单、发送、删除这类最后一步，SaySo 会把指针停在按钮上，等你自己点。",
    "comparisonTitle": "和 ChatGPT 自带的屏幕共享有什么不同？",
    "comparisonDisclaimer": "SaySo 是独立的第三方工具，与 OpenAI 无关联。",
    "feesTitle": "费用和次数",
    "appNameNote": "打开 App 要用英文名或拼音，中文 App 名的支持在完善中。",
    "download": "下载 SaySo",
    "downloadPending": "即将在 App Store 上架",
    "downloadNote": "上架后就能下载。",
    "qrPending": "上架后提供二维码",
    "qrLabel": "扫码下载 SaySo",
    "already": "已经装好了？看看怎么开始",
    "checkAll": "看看需要准备什么",
    "everyday": [
      "那些让你犯难的小事，",
      "说一句，就有人帮你。"
    ],
    "chooseScene": "点一个场景，看看 SaySo 怎么帮你。",
    "scenes": [
      [
        "查公交",
        "下一班车几点到"
      ],
      [
        "点外卖",
        "最后的下单由你点"
      ],
      [
        "取消订阅",
        "最后的确认由你点"
      ],
      [
        "看懂设置",
        "只看不点，不用配件"
      ]
    ],
    "videoPending": "视频准备中",
    "portrait": "竖屏演示",
    "scenePending": "以下是示意，不是真实录像。",
    "playback": "默认静音 · 显示字幕 · 随时暂停",
    "play": "播放视频",
    "pause": "暂停视频",
    "mute": "关闭声音",
    "unmute": "打开声音",
    "replay": "重播视频",
    "mediaError": "视频加载失败，请重试或选择其他场景。",
    "retry": "重试",
    "priceNote": "*官方单件标价核对于 2026 年 11 月 16 日，运费和税费可能另计。",
    "currentPrice": "查看当前价格",
    "privacyShort": "开始共享后，你的屏幕画面会发到你自己的 SaySo 服务和 ChatGPT，用来看懂你的屏幕。",
    "privacyLink": "画面去了哪里？",
    "disclaimer": "SaySo 配合 ChatGPT 使用，是独立开发的工具，和 OpenAI、M5Stack 没有关联。",
    "preview": "SaySo 还在开发中，暂时不能下载使用。",
    "before": "开始前，先准备好。",
    "beforeSub": "帮家人装？请用他自己的 iPhone 和 ChatGPT 账号。",
    "need": "需要准备什么",
    "screenGroup": "所有人都需要",
    "controlGroup": "想让 SaySo 帮你点，还需要",
    "viewCompat": "看看兼容列表",
    "startPrerequisite": "开始前，准备好一台 iPhone 和 ChatGPT Plus（或更高）账号。",
    "storeSoon": "即将在 App Store 上架",
    "threeSteps": "三步就能用",
    "connectionPending": "（“连接 ChatGPT”这一步还在开发中。）",
    "controlTitle": "想让它直接帮你点？",
    "controlSubtitle": "加一个小配件，它就能替你点、输入和滑动。",
    "controlSteps": [
      [
        "买一个小配件",
        "M5Stack AtomS3 Lite（型号 C124），再配一根 USB-C 数据线。买之前先看看下面的兼容列表。"
      ],
      [
        "用电脑装好程序（只需一次）",
        "用电脑上的 Chrome 或 Edge 打开安装页面，几分钟就好。（安装页面还在准备中。）"
      ],
      [
        "和 SaySo 配对",
        "在 SaySo 里配对配件。以后每次要它帮你点，先在 SaySo 里点“允许这次帮你点”。"
      ]
    ],
    "controlCompatibility": "帮你点目前只支持兼容列表里验证过的 iPhone 和系统版本，手机要竖着拿。",
    "detailsTitle": "更多细节",
    "steps": [
      [
        "下载 SaySo",
        "在 App Store 下载，打开就能开始。",
        "SaySo App 页面"
      ],
      [
        "连上 ChatGPT",
        "在 SaySo 里点“连接 ChatGPT”，它会带你到 ChatGPT 完成设置，再自动回到 SaySo。全程不用复制粘贴。",
        "在 ChatGPT 里设置 SaySo"
      ],
      [
        "开始共享，开口就行",
        "在 SaySo 点“开始共享”，然后去你要用的 App，打开 ChatGPT 语音直接问，比如“这个开关是干什么的？”",
        "SaySo 共享中的画面"
      ]
    ],
    "screenshot": "截图准备中",
    "screenshotEn": "当前为英文截图，中文版本待补。",
    "captured": "截图日期",
    "resume": "卡住了？看看这里",
    "approve": "ChatGPT 问你“是否允许”时，要在屏幕上点。",
    "approveSub": "在 ChatGPT 的提示卡片上点“允许”或“拒绝”；嘴上说“同意”不算。",
    "connectedNote": "连上 ChatGPT 不会自动共享屏幕，需要时在 SaySo 里点“开始共享”。",
    "guidesTitle": "几件值得知道的事",
    "guidesSub": "第一次用，从 SaySo 里的“连接 ChatGPT”开始。",
    "guideSections": [
      [
        "随时都能停",
        "想让它停下来，打开 SaySo 点“停止控制”，马上生效，不用等 ChatGPT。想连画面也不再发送，再点“结束共享”。免费次数用完了也照样能停。"
      ],
      [
        "开始和结束共享",
        "在 SaySo 点“开始共享”，然后去你要用的 App，打开 ChatGPT 语音就能问。用完在 SaySo 点“结束共享”。"
      ],
      [
        "ChatGPT 问“是否允许”时",
        "在提示卡片上点“允许”或“拒绝”，嘴上说“同意”不算。这和“最后一步由你点”是两回事。"
      ],
      [
        "最后一步，交给你",
        "付款、下单、发送、删除、取消订阅、转账，到最后一步时，它会把指针停在按钮上，等你看清楚再自己点。这是它遵守的规则，不是硬性锁；所以每次请你自己看一眼再点。"
      ],
      [
        "卡号和密码请自己填",
        "银行卡号、密码、验证码这类信息，请你自己输入，不要让 SaySo 代填。"
      ],
      [
        "有些画面它看不到",
        "银行和支付 App、身份认证 App（比如 Singpass）、公司管理的 App、受保护的视频，可能会把画面遮住，SaySo 会如实告诉你“看不到”，不会想办法绕过。这是在保护你。比如有些身份认证 App 会显示“屏幕录制已禁用”，这时它就会告诉你看不到。"
      ],
      [
        "请竖着拿手机",
        "帮你点需要竖屏，请竖着拿手机。"
      ]
    ],
    "officialDocs": "ChatGPT 官方说明",
    "sitesDocs": "ChatGPT 服务的可用范围与限制",
    "voiceDocs": "语音与屏幕批准",
    "firmwareTitle": "给配件装好程序",
    "firmwareSub": "程序免费，用电脑浏览器装一次就好。",
    "installerPending": "安装页面还在准备中。",
    "installer": "打开安装页面",
    "firmwareBody": "买配件、装程序之前，先看看你的手机在不在兼容列表里。安装要在专门的安装页面上做，这个网站不会连接你的配件。",
    "compatTitle": "兼容列表",
    "compatColumns": [
      "用途",
      "iPhone",
      "iOS",
      "App",
      "配件 / 固件",
      "验证日期"
    ],
    "screenMode": "读屏",
    "controlMode": "帮你点",
    "buyTitle": "买对配件",
    "buySub": "认准 AtomS3 Lite（型号 C124）。名字很像的 Atom Lite、AtomS3、AtomS3R 都不是它。",
    "officialShop": "M5Stack 官方商城",
    "digikey": "DigiKey · C124",
    "vendor": "查看商品",
    "buyNote": "价格和库存会变，下单前看清含运费和税的总价。",
    "privacyTitle": "你的画面去了哪里",
    "privacySub": "共享屏幕、让它帮你点、删除数据，是三件可以分开决定的事。",
    "draft": "这是草稿，正式的隐私政策会在上架前发布。",
    "privacySections": [
      [
        "画面发到哪里",
        "开始共享后，屏幕画面会发到你自己 ChatGPT 账号下的 SaySo 服务和 ChatGPT，用来看懂屏幕。其他 App 里的个人信息也可能出现在画面上。语音由 ChatGPT 按它的政策处理。SaySo 自己不使用麦克风。"
      ],
      [
        "会保存多久",
        "SaySo 替你输入的文字，用完就从服务里删掉；为了防止同一个请求被重复执行，只保留不含内容的简短记录，七天后精简。"
      ],
      [
        "停下来和断开连接",
        "“停止控制”只是不再帮你点，画面可能还在共享；“结束共享”会清除这次的云端画面；断开设备连接会清除相关的记录和截图。这些都不会删除你的 ChatGPT 对话。"
      ],
      [
        "还在完善的部分",
        "完整的账号删除、备份删除流程，以及正式的发布者和联系方式，会在上架前补齐。"
      ],
      [
        "受保护的画面",
        "如果某个 App 不允许共享屏幕，SaySo 会尊重它，不会绕过。但不是所有银行或敏感 App 都会自动遮住画面，共享时请留意。"
      ]
    ],
    "supportTitle": "我们一起看看",
    "supportSub": "从你遇到的情况开始。不需要提供任何密码或个人敏感信息。",
    "supportItems": [
      [
        "我想让它停下",
        "打开 SaySo 点“停止控制”，马上就停，不用等 ChatGPT；就算 ChatGPT 正在等你点“允许”，也一样能停。想连画面也不发，再点“结束共享”。"
      ],
      [
        "它说看不到我的屏幕",
        "看看 SaySo 里是不是已经“开始共享”，手机有没有网。连上 ChatGPT 不会自动共享，需要你点一下。"
      ],
      [
        "ChatGPT 一直在等我“允许”",
        "在 ChatGPT 的提示卡片上点“允许”或“拒绝”，嘴上说“同意”不算。"
      ],
      [
        "它说点了，但屏幕没变化",
        "看看配件是不是连着、SaySo 里有没有“允许这次帮你点”。付款、发送、删除这类操作结果不确定时，先别反复重试，自己看一眼屏幕确认。"
      ],
      [
        "卡号和密码请自己填",
        "银行卡号、密码、验证码这类信息，请你自己输入，不要让 SaySo 代填。"
      ]
    ],
    "report": "反馈时可以告诉我们",
    "reportBody": "SaySo 版本、iPhone 型号、iOS 版本、ChatGPT 版本、大概时间、你做了哪几步、屏幕上的错误编号。请不要发密码、验证码、配对码或付款信息。",
    "contactPending": "联系方式会在上架前公布。",
    "contact": "邮件联系支持",
    "copyReport": "复制反馈清单",
    "copied": "清单已复制",
    "copyFailed": "无法自动复制，请选中上方清单手动复制。",
    "licensesTitle": "免费使用，源码公开",
    "licensesSub": "采用 FSL-1.1-ALv2，源码公开。",
    "licensesBody": "SaySo 原创的网站、安装器前端、MCP、插件和 Skill 源码采用 FSL-1.1-ALv2。Copyright 2026 ZHAI BIN。每个适用版本公开满两年后额外获得 Apache-2.0 许可。这属于源码公开，不是 OSI 认可的开源许可。第三方许可和 SaySo 商标权另行处理；iOS App 与 ESP 固件源码未包含在仓库中。",
    "licenseFrontend": "网站依赖与字体许可",
    "repoPending": "公开 GitHub 仓库尚未配置。",
    "repoOpen": "打开 GitHub 仓库",
    "notFound": "这个页面不存在。",
    "backHome": "回到首页",
    "configError": "网站配置加载失败，下载和媒体保持不可用。",
    "sceneExamples": {
      "bus": [
        "回家的公交还有多久到？",
        "它打开地图查路线。",
        "告诉你下一班车几点到。"
      ],
      "food": [
        "帮我点常吃的那家。",
        "它打开外卖 App，帮你选好菜。",
        "到下单那一步，指针停在按钮上，等你自己点。"
      ],
      "subscription": [
        "帮我取消这个订阅。",
        "它找到订阅页面。",
        "到最后确认那一步，指针停在按钮上，等你自己点。"
      ],
      "setting": [
        "这个开关是干什么的？",
        "它看着你的屏幕给你解释。",
        "只看不点。"
      ]
    },
    "exampleLabel": "对话示例",
    "guideExamples": [
      [
        "出行",
        "回家的公交还有多久到？",
        "帮我查去图书馆的路线。"
      ],
      [
        "外卖",
        "帮我选晚饭。",
        "到最后下单那一步停下，我自己点。"
      ],
      [
        "订阅",
        "帮我找到这个订阅。",
        "带我到取消确认那一步。"
      ],
      [
        "设置",
        "这个开关是干什么的？",
        "解释这个页面，不要点击。"
      ]
    ],
    "trySaying": "可以这样说",
    "needHelp": "遇到问题？",
    "developerTitle": "开发者资料",
    "developerVersion": "最新的服务源码已包含停止和隐私方面的修复；如果你自己部署过 SaySo 服务，请按安装指南更新。",
    "installGuide": "查看安装与更新指南",
    "trademarkNotice": "SaySo 商标说明",
    "thirdPartyNotices": "第三方许可说明",
    "compatPending": "帮你点只支持验证过的机型和系统版本。兼容列表还在准备中，买配件前请先等它公布。",
    "comparisonBody": "截至 2026 年 11 月，ChatGPT 自带的屏幕共享只在部分语音模式里能用，而且只能看、不能动手。有了 SaySo，你在 ChatGPT 最新的语音里也能让它看见屏幕；加上配件，它还能替你点、输入和滑动，一步一步把事情做完。",
    "developerSetup": "想自己部署？GitHub 的安装指南里有可以复制的一句话安装指令。",
    "licensesIntro": "SaySo 的源码公开，你可以查看和自己部署。"
  }
};
for (const lang of ["en","zh"]) Object.assign(copy[lang], {hardware:requirements[lang].hardwareSummary, setupNeed:requirements[lang].setupSummary, needs:requirementRows(lang), free:requirements[lang].fees, costs:requirements[lang].costs, keyboardNote:requirements[lang].keyboardNote, noAccessory:requirements[lang].screenSummary});
