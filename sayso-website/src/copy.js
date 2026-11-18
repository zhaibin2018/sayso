// Terminology: Screen guidance=读屏; Tapping=帮你点; Screen sharing=屏幕共享 (iOS feature); accessory=配件; private SaySo service=你的私人服务; approval=批准.
import {requirements,requirementRows} from "./requirements.js";
export const copy = {
  "en": {
    "home": "Home",
    "start": "Get started",
    "guides": "Guides",
    "firmware": "Install firmware",
    "github": "GitHub",
    "privacy": "Privacy Policy",
    "support": "Support",
    "licenses": "Licenses",
    "buy": "Where to buy",
    "requirements": "Requirements",
    "skip": "Skip to content",
    "menu": "Open navigation",
    "closeMenu": "Close navigation",
    "theme": "Switch appearance",
    "language": "切换到中文",
    "headline": [
      "Tell ChatGPT.",
      "Let SaySo do the tapping."
    ],
    "subtitle": "For payments, orders, messages and deletions, SaySo stops with the pointer on the button and lets you make the final tap.",
    "download": "Download SaySo",
    "downloadPending": "App Store link pending",
    "downloadNote": "Downloads are not open yet.",
    "qrPending": "QR pending",
    "qrLabel": "Scan to download SaySo",
    "already": "Already installed? Get started",
    "checkAll": "Check all requirements",
    "everyday": [
      "Everyday help,",
      "one request away."
    ],
    "chooseScene": "Choose a scene to see how SaySo helps.",
    "scenes": [
      [
        "Find my bus",
        "Getting around"
      ],
      [
        "Order food",
        "You review the final order"
      ],
      [
        "Cancel a subscription",
        "You confirm the final cancellation"
      ],
      [
        "Explain a setting",
        "Screen guidance, no accessory"
      ]
    ],
    "videoPending": "Video asset pending",
    "portrait": "Portrait demo",
    "scenePending": "Example, not a recorded demonstration.",
    "playback": "Muted by default · Captions on · Pause anytime",
    "play": "Play video",
    "pause": "Pause video",
    "mute": "Mute video",
    "unmute": "Unmute video",
    "replay": "Replay video",
    "mediaError": "This video could not be loaded. Try again or choose another scene.",
    "retry": "Try again",
    "task": "One task may include multiple taps. Task counting and paid upgrades are planned; more tasks will be available in the app (planned).",
    "quotaPending": "Planned allowance — task counting is still being verified.",
    "priceNote": "*Official item price checked Nov 16, 2026. Shipping and taxes may apply.",
    "currentPrice": "Check current price",
    "privacyShort": "Your shared screen is sent to your private SaySo service and to ChatGPT.",
    "privacyLink": "How your data is handled",
    "disclaimer": "Works with ChatGPT. Not affiliated with or endorsed by OpenAI or M5Stack.",
    "preview": "Development preview — SaySo isn't available yet.",
    "before": "Before you start.",
    "beforeSub": "Setting this up for someone else? Use their iPhone and their ChatGPT account.",
    "need": "What you’ll need",
    "screenGroup": "Everyone needs",
    "controlGroup": "To let SaySo tap, also add",
    "viewCompat": "View compatibility",
    "threeSteps": "Three steps to connect",
    "steps": [
      [
        "Open SaySo",
        "Tap Connect ChatGPT to open the setup message.",
        "SaySo connection screen"
      ],
      [
        "Confirm in ChatGPT",
        "The intended flow continues in ChatGPT on the iPhone. Follow sign-in and approval prompts. Complete mobile deployment is still being verified; see developer instructions for the current Work setup.",
        "Setup message and approval"
      ],
      [
        "Share, then speak",
        "Start screen sharing in SaySo, not in ChatGPT. Return to ChatGPT Voice and speak.",
        "System sharing and Voice"
      ]
    ],
    "screenshot": "Screenshot pending",
    "screenshotEn": "English screenshot shown; Chinese version pending.",
    "captured": "Captured",
    "resume": "Resume setup or get help",
    "approve": "When approval appears, tap the screen.",
    "approveSub": "Use the on-screen approval controls in ChatGPT. Saying “yes” will not approve the action.",
    "connectedNote": "Connecting your account doesn't share your screen. Tap Start Sharing in SaySo.",
    "guidesTitle": "A little guidance, when you need it.",
    "guidesSub": "Start from Connect ChatGPT in SaySo. Developer setup instructions are also available.",
    "guideSections": [
      [
        "One installation entry",
        "Start from Connect ChatGPT in the SaySo app. The installation guide prepares your private Site and its connected plugin and skills. You confirm sign-in and permissions. This consumer flow is still in development."
      ],
      [
        "If setup is interrupted",
        "Return to the same setup conversation and continue from the last confirmed step. Do not start several installs in parallel. The installer is intended to resume completed work; that behavior still needs end-to-end acceptance."
      ],
      [
        "Understanding your allowance",
        "The planned free tier includes screen guidance and 5 completed tasks per month. Several taps can belong to one task; failed tasks do not count. Task accounting and paid entitlements are not live yet."
      ],
      [
        "What screen sharing cannot show",
        "Some apps hide or restrict screen sharing. SaySo may not be able to assist on those screens. Pause sharing before opening sensitive content. This is not a guarantee that all banking or sensitive apps hide their content."
      ],
      [
        "For developers",
        "MCP, the plugin and seven skills are available as a versioned source preview under FSL-1.1-ALv2. GitHub includes a copyable installation instruction and guide for your own private Site. Complete iPhone setup is still being verified. DIY accessory firmware will be released separately."
      ]
    ],
    "officialDocs": "Official ChatGPT documentation",
    "sitesDocs": "Sites availability and limits",
    "voiceDocs": "Voice and on-screen approvals",
    "firmwareTitle": "Prepare your accessory.",
    "firmwareSub": "The free firmware installer lives in SaySo Install.",
    "installerPending": "The public installer link is not available yet.",
    "installer": "Open SaySo Install",
    "firmwareBody": "Check compatibility before buying hardware or writing firmware. First-time installation uses a computer. This website does not connect to or flash your device.",
    "compatTitle": "Compatibility",
    "compatColumns": [
      "Use",
      "iPhone",
      "iOS",
      "App",
      "Accessory / firmware",
      "Verified"
    ],
    "screenMode": "Screen guidance",
    "controlMode": "Tapping",
    "buyTitle": "The right accessory, from the right place.",
    "buySub": "Look for AtomS3 Lite, model C124. Atom Lite, AtomS3 and AtomS3R are different products.",
    "officialShop": "M5Stack official store",
    "digikey": "DigiKey · C124",
    "vendor": "Visit product page",
    "buyNote": "Compare the final checkout total, including shipping and any taxes. Prices and stock can change. Check SaySo compatibility before purchasing.",
    "privacyTitle": "Know where your screen goes.",
    "privacySub": "Sharing, tapping and data deletion are different choices.",
    "draft": "Privacy information draft — not a finalized release policy.",
    "privacySections": [
      [
        "Your screen and your private SaySo service",
        "When you start screen sharing, visible images go to your private SaySo service in your ChatGPT account and to ChatGPT. Other apps may show personal information. ChatGPT handles voice under its own policies."
      ],
      [
        "How long information stays — service 0.13.249 and later",
        "Text SaySo types is removed from the service when the command ends. A keyed summary and basic records remain to prevent the same request running twice. Detailed command records are reduced after seven days when cleanup runs."
      ],
      [
        "Stopping and removing a device",
        "Stopping tapping can leave screen sharing on. Ending the sharing session removes its cloud screen data. Removing a paired device deletes its related service records and screenshots. This does not delete your ChatGPT conversations."
      ],
      [
        "When cleanup cannot run",
        "Cleanup runs during normal use. If you stop using the service and no scheduled cleanup is configured, unfinished text may remain without a fixed deletion deadline. Account-wide deletion and a complete backup-deletion process are not available yet. When an image expires, SaySo stops using it, but that does not guarantee it has been erased."
      ],
      [
        "Protected screens",
        "If an app does not allow screen sharing, SaySo respects that and will not try to get around it. Not all banking or sensitive apps hide their content."
      ],
      [
        "Preview information",
        "This describes the updated public service source, not an automatic update to your existing installation. Publisher/contact details and the final privacy policy still need to be completed."
      ]
    ],
    "supportTitle": "Let’s find the next step.",
    "supportSub": "Start with the symptom. Keep personal information out of diagnostics.",
    "supportItems": [
      [
        "I cannot see the screen",
        "Confirm screen sharing is on and your phone is online. Connecting your account doesn't share your screen. Tap Start Sharing in SaySo."
      ],
      [
        "ChatGPT is waiting for approval",
        "Look at the ChatGPT screen and use its approval controls. Spoken approval does not work. You can decline instead."
      ],
      [
        "Nothing happens when it tries to tap",
        "Check the accessory, pairing and permission. If the result is uncertain, do not repeatedly retry a purchase, message or deletion. Even if the accessory reports a tap, check the screen to confirm the app actually did it."
      ],
      [
        "I need to stop",
        "Use Stop tapping to end input. Stop screen sharing in SaySo to stop sending your screen. You can always stop, even if your free tasks have run out."
      ]
    ],
    "report": "What to include in a report",
    "reportBody": "SaySo version, iPhone model, iOS version, ChatGPT version, time, a short description and any non-sensitive error ID. Do not include passwords, verification codes, pairing keys or payment details.",
    "contactPending": "A public support address has not been configured yet. This preview does not collect or submit reports.",
    "contact": "Email support",
    "copyReport": "Copy report checklist",
    "copied": "Checklist copied",
    "copyFailed": "Copy unavailable. Select the checklist above to copy it.",
    "licensesTitle": "Free components. Clear boundaries.",
    "licensesSub": "Source-available under FSL-1.1-ALv2.",
    "licensesBody": "Original SaySo website, installer frontend, MCP, plugin and skill source is available under FSL-1.1-ALv2. Copyright 2026 ZHAI BIN. Each covered version receives an additional Apache-2.0 license after two years. This is source-available software, not OSI-approved open source. Third-party licenses and SaySo trademark rights remain separate. The iOS app and ESP firmware source are not included.",
    "licenseFrontend": "Website dependencies and bundled font notices",
    "repoPending": "The public GitHub repository is not configured yet.",
    "repoOpen": "Open GitHub repository",
    "notFound": "This page is not here.",
    "backHome": "Back to SaySo",
    "configError": "Site configuration could not be loaded. Downloads and media remain unavailable.",
    "sceneExamples": {
      "bus": [
        "When is the next bus home?",
        "SaySo opens the map and checks the route.",
        "It tells you when the next bus arrives."
      ],
      "food": [
        "Help me order from my usual place.",
        "SaySo opens the food app and helps choose dishes.",
        "It parks the pointer on the final order button; you make the final tap."
      ],
      "subscription": [
        "Help me cancel this subscription.",
        "SaySo finds the subscription page.",
        "It parks the pointer on the final cancellation button; you make the final tap."
      ],
      "setting": [
        "What does this switch do?",
        "SaySo reads the shared screen and explains it.",
        "It does not tap anything."
      ]
    },
    "exampleLabel": "Illustrative conversation"
  },
  "zh": {
    "home": "首页",
    "start": "开始使用",
    "guides": "使用文档",
    "firmware": "安装固件",
    "github": "GitHub",
    "privacy": "隐私政策",
    "support": "支持与帮助",
    "licenses": "许可说明",
    "buy": "购买渠道",
    "requirements": "使用要求",
    "skip": "跳转到正文",
    "menu": "打开导航",
    "closeMenu": "关闭导航",
    "theme": "切换外观",
    "language": "Switch to English",
    "headline": [
      "对 ChatGPT 说一句，",
      "让 SaySo 帮你点。"
    ],
    "subtitle": "用 ChatGPT 语音说出需求。遇到付款、下单、发送、删除这类操作，SaySo 会把指针停在按钮上，最后一下由你自己点。",
    "download": "下载 SaySo",
    "downloadPending": "App Store 链接待接入",
    "downloadNote": "目前尚未开放下载。",
    "qrPending": "二维码待接入",
    "qrLabel": "扫码下载 SaySo",
    "already": "已经安装？开始连接",
    "checkAll": "查看完整使用要求",
    "everyday": [
      "日常的小事，",
      "开口就能求助。"
    ],
    "chooseScene": "选择一个场景，了解 SaySo 如何帮忙。",
    "scenes": [
      [
        "查找公交",
        "出行时的帮助"
      ],
      [
        "点外卖",
        "最终订单由你检查确认"
      ],
      [
        "取消订阅",
        "最终取消由你确认"
      ],
      [
        "解释设置",
        "读屏，无需配件"
      ]
    ],
    "videoPending": "视频素材待接入",
    "portrait": "竖屏演示",
    "scenePending": "这是用法示例，不是真实操作录像。",
    "playback": "默认静音 · 显示字幕 · 随时暂停",
    "play": "播放视频",
    "pause": "暂停视频",
    "mute": "关闭声音",
    "unmute": "打开声音",
    "replay": "重播视频",
    "mediaError": "视频加载失败，请重试或选择其他场景。",
    "retry": "重试",
    "task": "一个任务可以包含多次点击。任务计数和付费升级均为计划中；更多任务额度将可在 App 内升级（计划中）。",
    "quotaPending": "计划权益，任务计数仍待验证。",
    "priceNote": "*官方单件标价核对于 2026 年 11 月 16 日，运费和税费可能另计。",
    "currentPrice": "查看当前价格",
    "privacyShort": "你共享的画面会发送至所连接的服务及 ChatGPT。",
    "privacyLink": "了解数据如何处理",
    "disclaimer": "适配 ChatGPT。与 OpenAI 或 M5Stack 无关联，亦未获其背书。",
    "preview": "开发预览：SaySo 尚未开放使用。",
    "before": "开始前，先准备好。",
    "beforeSub": "帮家人安装？请使用对方的 iPhone 和 ChatGPT 账号。",
    "need": "你需要准备什么",
    "screenGroup": "所有人都需要",
    "controlGroup": "想让 SaySo 帮你点，还需要",
    "viewCompat": "查看兼容性",
    "threeSteps": "三个步骤，完成连接",
    "steps": [
      [
        "打开 SaySo",
        "点击“连接 ChatGPT”，打开安装引导消息。",
        "SaySo 连接页面"
      ],
      [
        "在 ChatGPT 中确认",
        "目标是在 iPhone 的 ChatGPT 中继续，按提示登录和批准。手机完整部署尚待验证；当前 Work 安装方法见开发者资料。",
        "安装消息与批准界面"
      ],
      [
        "开始共享，然后开口说",
        "在 SaySo 中开始屏幕共享，不是在 ChatGPT 中。然后返回 ChatGPT 语音说出需求。",
        "系统共享与语音界面"
      ]
    ],
    "screenshot": "真实截图待补",
    "screenshotEn": "当前为英文截图，中文版本待补。",
    "captured": "截图日期",
    "resume": "继续安装或获取帮助",
    "approve": "出现批准请求时，请在屏幕上点击。",
    "approveSub": "请使用 ChatGPT 屏幕上的批准或拒绝控件。说“同意”不会批准这项操作。",
    "connectedNote": "连接账号不会自动共享屏幕，请在 SaySo 里点“开始共享”。",
    "guidesTitle": "需要的时候，有清楚的指引。",
    "guidesSub": "推荐从 SaySo 的“连接 ChatGPT”开始；开发者也可使用安装指令。",
    "guideSections": [
      [
        "统一安装入口",
        "从 SaySo App 的“连接 ChatGPT”发起。安装引导准备你自己的私人 Site、对应插件和配套 Skill；登录与授权由你确认。这套消费者流程仍在开发中。"
      ],
      [
        "安装中断了怎么办",
        "回到同一安装对话，从最后确认的步骤继续，不要同时发起多个安装。安装器应复用已完成的工作，其恢复能力仍需完整验收。"
      ],
      [
        "免费额度如何计算",
        "计划免费提供读屏和每月 5 个完成的任务。一个任务可包含多次点击，失败不扣次数。任务计数与付费权益尚未上线。"
      ],
      [
        "哪些画面可能看不到",
        "部分 App 会隐藏或限制屏幕共享，SaySo 可能无法在这些页面提供帮助。打开敏感内容前请暂停共享。这不代表所有银行或敏感 App 都会自动隐藏。"
      ],
      [
        "开发者资料",
        "MCP、插件和七个 Skill 已作为版本化源码预览提供，采用 FSL-1.1-ALv2。GitHub 提供可复制的一句话安装指令及私人 Site 安装指南。iPhone 完整安装流程仍待验收，DIY 配件固件另行发布。"
      ]
    ],
    "officialDocs": "ChatGPT 官方说明",
    "sitesDocs": "Sites 可用范围与限制",
    "voiceDocs": "语音与屏幕批准",
    "firmwareTitle": "准备你的配件。",
    "firmwareSub": "免费固件的安装由 SaySo Install 完成。",
    "installerPending": "公开安装站链接尚未接入。",
    "installer": "打开 SaySo Install",
    "firmwareBody": "购买硬件或写入固件前，请先核对兼容性。首次安装需要电脑；此网站不会连接或烧录设备。",
    "compatTitle": "兼容性",
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
    "buyTitle": "买对配件，找对渠道。",
    "buySub": "请认准 AtomS3 Lite，型号 C124。Atom Lite、AtomS3 和 AtomS3R 是不同产品。",
    "officialShop": "M5Stack 官方商城",
    "digikey": "DigiKey · C124",
    "vendor": "查看商品",
    "buyNote": "请比较含运费及税费的最终结账金额。价格与库存可能变化，购买前先核对 SaySo 兼容性。",
    "privacyTitle": "了解你的画面去了哪里。",
    "privacySub": "共享、控制与删除数据，是不同的选择。",
    "draft": "隐私信息草案，尚非正式发行政策。",
    "privacySections": [
      [
        "屏幕会传到哪里",
        "开始屏幕共享后，画面会传到你 ChatGPT 账号里的私人服务和 ChatGPT。其他 App 可能显示个人信息。语音由 ChatGPT 按其政策处理。"
      ],
      [
        "保存多久——服务0.13.249及之后版本",
        "SaySo 输入的文字会在命令结束后从服务删除。为防止同一请求重复执行，会保留带密钥的摘要和基本记录；清理运行时，超过七天的详细命令记录会被精简。"
      ],
      [
        "停止和解除设备配对",
        "停止帮你点后，屏幕共享可能仍在继续。结束共享会话会清除这次会话的云端屏幕数据；解除设备配对会清除其关联服务记录和截图。这不会删除 ChatGPT 对话。"
      ],
      [
        "清理无法运行时",
        "日常使用会触发清理。如果不再使用服务，也没有配置定时清理，未完成命令里的文字可能继续保留，没有固定删除期限。账户整体删除和完整的备份删除流程尚未提供。图片过期后不再被使用，但不保证已被彻底删除。"
      ],
      [
        "受保护的画面",
        "如果某个 App 不允许共享屏幕，SaySo 会尊重它的设置，不会尝试绕过。这不代表所有银行或敏感 App 都会隐藏内容。"
      ],
      [
        "预览说明",
        "以上描述的是更新后的公开服务源码，不会自动更新你已经安装的私人服务。发布者、联系信息和正式隐私政策仍需完善。"
      ]
    ],
    "supportTitle": "一起找到下一步。",
    "supportSub": "从遇到的问题开始，不在诊断中提供个人敏感资料。",
    "supportItems": [
      [
        "看不到手机画面",
        "确认屏幕共享已开启，手机可以上网。连接账号不会自动共享屏幕，请在 SaySo 里点“开始共享”。"
      ],
      [
        "ChatGPT 在等待批准",
        "查看 ChatGPT 屏幕，使用批准或拒绝控件。说“同意”不会完成批准，你也可以选择拒绝。"
      ],
      [
        "操作后没有变化",
        "检查配件、配对和权限。结果不确定时，不要反复重试购买、发送或删除。配件显示已点击，也请看一眼屏幕，确认 App 真的完成了操作。"
      ],
      [
        "我想停止",
        "用“停止控制”结束帮你点；在 SaySo 停止屏幕共享，就不再发送画面。即使免费次数用完，也随时可以停止。"
      ]
    ],
    "report": "反馈时提供哪些资料",
    "reportBody": "SaySo 版本、iPhone 型号、iOS 版本、ChatGPT 版本、发生时间、简短步骤及非敏感错误编号。不要提供密码、验证码、配对密钥或付款资料。",
    "contactPending": "公开支持地址尚未配置。此预览不收集或提交反馈。",
    "contact": "邮件联系支持",
    "copyReport": "复制反馈清单",
    "copied": "清单已复制",
    "copyFailed": "无法自动复制，请选中上方清单手动复制。",
    "licensesTitle": "组件免费，授权边界清楚。",
    "licensesSub": "采用 FSL-1.1-ALv2，源码公开。",
    "licensesBody": "SaySo 原创的网站、安装器前端、MCP、插件和 Skill 源码采用 FSL-1.1-ALv2。Copyright 2026 ZHAI BIN。每个适用版本公开满两年后额外获得 Apache-2.0 许可。这属于源码公开，不是 OSI 认可的开源许可。第三方许可和 SaySo 商标权另行处理；iOS App 与 ESP 固件源码未包含在仓库中。",
    "licenseFrontend": "网站依赖与字体许可",
    "repoPending": "公开 GitHub 仓库尚未配置。",
    "repoOpen": "打开 GitHub 仓库",
    "notFound": "没有找到这个页面。",
    "backHome": "返回 SaySo",
    "configError": "网站配置加载失败，下载和媒体保持不可用。",
    "sceneExamples": {
      "bus": [
        "回家的公交还有多久到？",
        "SaySo 打开地图查询路线。",
        "告诉你下一班车几点到。"
      ],
      "food": [
        "帮我点常吃的那家。",
        "SaySo 打开外卖 App，帮忙选好菜。",
        "把指针停在最后的下单按钮上，最后一下由你自己点。"
      ],
      "subscription": [
        "帮我取消这个订阅。",
        "SaySo 找到订阅页面。",
        "把指针停在最后的取消确认按钮上，最后一下由你自己点。"
      ],
      "setting": [
        "这个开关是干什么的？",
        "SaySo 读屏并解释开关。",
        "不点击任何东西。"
      ]
    },
    "exampleLabel": "对话示例"
  }
};
for (const lang of ["en","zh"]) Object.assign(copy[lang], {hardware:requirements[lang].hardwareSummary, setupNeed:requirements[lang].setupSummary, needs:requirementRows(lang), free:requirements[lang].fees, costs:requirements[lang].costs, compatPending:requirements[lang].compatibilityNote, noAccessory:requirements[lang].screenSummary});
