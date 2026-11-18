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
        "Screen guidance, no control accessory"
      ]
    ],
    "videoPending": "Video asset pending",
    "portrait": "Portrait demo",
    "scenePending": "This scene will play here when the video is available.",
    "playback": "Muted by default · Captions on · Pause anytime",
    "play": "Play video",
    "pause": "Pause video",
    "mute": "Mute video",
    "unmute": "Unmute video",
    "replay": "Replay video",
    "mediaError": "This video could not be loaded. Try again or choose another scene.",
    "retry": "Try again",
    "task": "One task can include multiple taps. Failed tasks do not count. More tasks are available in the app.",
    "quotaPending": "Planned allowance — task counting is still being verified.",
    "priceNote": "*Official item price checked Nov 16, 2026. Shipping and taxes may apply.",
    "currentPrice": "Check current price",
    "privacyShort": "Your shared screen is sent to the service you connect and to ChatGPT.",
    "privacyLink": "How your data is handled",
    "disclaimer": "Works with ChatGPT. Not affiliated with or endorsed by OpenAI or M5Stack.",
    "preview": "Development preview · Product availability and supporting materials are still being verified.",
    "before": "Before you start.",
    "beforeSub": "Check what you need, then follow the three steps.",
    "need": "What you’ll need",
    "screenGroup": "For screen guidance",
    "controlGroup": "To let SaySo tap",
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
        "Send the message. Follow the sign-in and permission prompts.",
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
    "connectedNote": "Being connected does not mean your screen is being shared.",
    "guidesTitle": "A little guidance, when you need it.",
    "guidesSub": "One setup route. Clear choices. You stay in control.",
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
    "controlMode": "Phone control",
    "buyTitle": "The right accessory, from the right place.",
    "buySub": "Look for AtomS3 Lite, model C124. Atom Lite, AtomS3 and AtomS3R are different products.",
    "officialShop": "M5Stack official store",
    "digikey": "DigiKey · C124",
    "vendor": "Visit product page",
    "buyNote": "Compare the final checkout total, including shipping and any taxes. Prices and stock can change. Check SaySo compatibility before purchasing.",
    "privacyTitle": "Know where your screen goes.",
    "privacySub": "Sharing, device control and data deletion are different choices.",
    "draft": "Privacy information draft — not a finalized release policy.",
    "privacySections": [
      [
        "Your screen and the connected service",
        "When you start screen sharing, SaySo sends visible screen images to the service you configured and consented to, for the connected ChatGPT functionality. Content visible in other apps may also be shared. The native app does not capture your microphone; ChatGPT handles your voice under its own policies."
      ],
      [
        "Storage is part of the data flow",
        "The reviewed service can store screenshots in its database or object storage. It also processes requested input text, device and session identifiers, operation receipts and diagnostic records. A private Site does not mean that nothing is stored."
      ],
      [
        "Stopping is not deleting",
        "Stopping control can leave screen sharing active. Ending a session stops input and uploads. Disconnecting a device does not erase all service records or your ChatGPT conversations. Image read expiry is not proof of physical deletion."
      ],
      [
        "What still needs to be finalized",
        "The publisher and privacy contact, service responsibilities, exact retention periods and complete deletion process must be verified before public release. SaySo is not claiming “no data collected” or immediate deletion."
      ]
    ],
    "privacyApple": "Apple’s privacy disclosure definitions",
    "supportTitle": "Let’s find the next step.",
    "supportSub": "Start with the symptom. Keep personal information out of diagnostics.",
    "supportItems": [
      [
        "I cannot see the screen",
        "Confirm that iOS screen sharing is still running and your phone is online. Start sharing in SaySo. Connecting an account alone does not start the system broadcast."
      ],
      [
        "ChatGPT is waiting for approval",
        "Look at the ChatGPT screen and use its approval controls. Spoken approval does not work. You can decline instead."
      ],
      [
        "Nothing happens when it tries to tap",
        "Check the accessory, pairing and control permission. If the result is uncertain, do not repeatedly retry a purchase, message or deletion. A device receipt is not proof that the app action completed."
      ],
      [
        "I need to stop",
        "Use Stop control to end input. End the session or stop the system broadcast to end screen sharing. Stopping must remain available regardless of purchase status."
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
    "configError": "Site configuration could not be loaded. Downloads and media remain unavailable."
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
        "只读屏，无需操控配件"
      ]
    ],
    "videoPending": "视频素材待接入",
    "portrait": "竖屏演示",
    "scenePending": "素材就绪后，此处将播放对应场景。",
    "playback": "默认静音 · 显示字幕 · 随时暂停",
    "play": "播放视频",
    "pause": "暂停视频",
    "mute": "关闭声音",
    "unmute": "打开声音",
    "replay": "重播视频",
    "mediaError": "视频加载失败，请重试或选择其他场景。",
    "retry": "重试",
    "task": "一个任务可以包含多次点击。失败不扣次数，更多任务额度可在 App 内升级。",
    "quotaPending": "计划权益，任务计数仍待验证。",
    "priceNote": "*官方单件标价核对于 2026 年 11 月 16 日，运费和税费可能另计。",
    "currentPrice": "查看当前价格",
    "privacyShort": "你共享的画面会发送至所连接的服务及 ChatGPT。",
    "privacyLink": "了解数据如何处理",
    "disclaimer": "适配 ChatGPT。与 OpenAI 或 M5Stack 无关联，亦未获其背书。",
    "preview": "开发预览 · 产品可用性与配套资料仍在核验。",
    "before": "开始前，先准备好。",
    "beforeSub": "确认使用条件，再按三个步骤完成连接。",
    "need": "你需要准备什么",
    "screenGroup": "如果只需要读屏",
    "controlGroup": "如果需要 SaySo 帮你点",
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
        "发送消息，按提示登录并确认必要权限。",
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
    "connectedNote": "账号已连接，不代表正在共享屏幕。",
    "guidesTitle": "需要的时候，有清楚的指引。",
    "guidesSub": "统一的安装入口，明确的选择，由你保持控制。",
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
    "controlMode": "操控手机",
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
        "画面与所连接的服务",
        "你开启系统屏幕共享后，SaySo 将可见画面发送到你配置并同意的服务，供所连接的 ChatGPT 功能使用。其他 App 的可见内容也可能被共享。SaySo 原生 App 不采集麦克风，ChatGPT 的语音处理适用其自身规则。"
      ],
      [
        "数据流包含存储",
        "已核查服务可将截图保存在数据库或对象存储中，并处理要求输入的文字、设备与会话标识、操作回执和诊断记录。私人 Site 不意味着完全不存储。"
      ],
      [
        "停止不等于删除",
        "停止控制后画面仍可能继续共享；结束会话会停止输入与上传。解除设备连接不会删除所有服务记录或 ChatGPT 对话。图片读取过期也不代表已经物理删除。"
      ],
      [
        "上线前还需确认",
        "发布主体与隐私联系方式、服务责任方、确切保留期限及完整删除流程必须在公开发行前核验。SaySo 不宣称“不收集数据”或立即完整删除。"
      ]
    ],
    "privacyApple": "Apple 隐私披露定义",
    "supportTitle": "一起找到下一步。",
    "supportSub": "从遇到的问题开始，不在诊断中提供个人敏感资料。",
    "supportItems": [
      [
        "看不到手机画面",
        "确认 iOS 系统共享仍在运行、手机能够联网，并从 SaySo 开始共享。账号连接成功不会自动开启系统广播。"
      ],
      [
        "ChatGPT 在等待批准",
        "查看 ChatGPT 屏幕，使用批准或拒绝控件。说“同意”不会完成批准，你也可以选择拒绝。"
      ],
      [
        "操作后没有变化",
        "核对配件、配对和控制权限。结果不确定时，不要连续重试购买、发送或删除；设备回执不等于目标 App 已完成操作。"
      ],
      [
        "我想停止",
        "用“停止控制”结束输入。结束本次使用或停止系统广播来结束共享。无论购买状态如何，停止入口都必须可用。"
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
    "configError": "网站配置加载失败，下载和媒体保持不可用。"
  }
};
for (const lang of ["en","zh"]) Object.assign(copy[lang], {hardware:requirements[lang].hardwareSummary, setupNeed:requirements[lang].setupSummary, needs:requirementRows(lang), free:requirements[lang].fees, costs:requirements[lang].costs, compatPending:requirements[lang].compatibilityNote, noAccessory:requirements[lang].screenSummary});
