import { serviceDefinition, sharingInstructions } from "./installation.js";
// Terminology: see your screen=看屏幕; tapping for you=帮你点; Stop tapping=停止帮你点; End sharing=结束共享.
import { requirements, requirementGroups } from "./requirements.js";

const appNameNote = "打开 App 要用英文名或拼音，中文 App 名的支持在完善中。";
const finalTapNote = {
  en: "ChatGPT is told to stop at the final button and let you tap it. It usually does, but this isn’t guaranteed, so check before every tap.",
  zh: "ChatGPT 会按要求停在最后一个按钮，让你自己点。通常会这样做，但不能保证，所以每次点之前请看一眼。",
};

const approveSub = {
  en: "**Tap “Allow” or “Decline” on the card.** Saying “yes” doesn’t count.",
  zh: "**在卡片上点“允许”或“拒绝”。** 口头说“同意”不算。",
};

const uncertainResult = {
  en: "Check the result in the app before you try again. Avoid repeated attempts while the result is unclear.",
  zh: "先到相关 App 里核对结果。结果不明时，请勿反复重试。",
};

export const copy = {
  "en": {
    "home": "Home",
    "start": "Get started",
    "guides": "Guides",
    "firmware": "Set up the accessory",
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
    "headline": "Let ChatGPT see your iPhone screen.",
    "subtitle": "Add a small accessory, and it can tap for you too.",
    "finalTapNote": finalTapNote.en,
    "comparisonTitle": "How is this different from ChatGPT’s built-in screen sharing?",
    "comparisonDisclaimer": "SaySo is an independent third-party tool and is not affiliated with OpenAI.",
    "feesTitle": "Costs and free sessions",
    "download": "Download SaySo",
    "qrLabel": "Scan to download SaySo",
    "checkAll": "See what you’ll need",
    "everyday": [
      "Those little things you get stuck on,",
      "just ask for a hand."
    ],
    "chooseScene": "Pick a scene to see how SaySo can help.",
    "scenes": [
      [
        "Find my bus",
        "Accessory required"
      ],
      [
        "Order food",
        "Accessory required"
      ],
      [
        "Cancel a subscription",
        "Accessory required"
      ],
      [
        "Understand a setting",
        "No accessory needed"
      ]
    ],
    "portrait": "Portrait demo",
    "scenePending": "This is an illustration, not a recording.",
    "playback": "Muted by default · Captions on · Pause anytime",
    "play": "Play video",
    "pause": "Pause video",
    "mute": "Mute video",
    "unmute": "Unmute video",
    "mediaError": "This video could not be loaded. Try again or choose another scene.",
    "retry": "Try again",
    "privacyShort": `${serviceDefinition.en} When you start sharing, screen images go to your SaySo service and ChatGPT.`,
    "privacyLink": "Where do your screen images go?",
    "disclaimer": "SaySo is an independent tool that works with ChatGPT. It is not affiliated with OpenAI or M5Stack.",
    "betaJoin": "Join the beta on TestFlight",
    "betaPending": "Beta sign-up opens soon",
    "beforeSub": "Helping a family member set up? Use their own iPhone and ChatGPT account.",
    "need": "What you’ll need",
    "screenGroup": "Everyone needs",
    "controlGroup": "To let SaySo tap, also add",
    "viewCompat": "Check the compatibility list",
    "startPrerequisite": requirements.en.setupSummary,
    "controlCompatibility": "The compatibility list shows which iPhone and iOS combinations have been tested for tapping.",
    "detailsTitle": "A few more details",
    "resume": "Stuck? Start here",
    "approve": "When ChatGPT asks for permission",
    "approveSub": approveSub.en,
    "connectedNote": "Connecting to ChatGPT doesn’t share your screen automatically. Tap “Start sharing” in SaySo when you’re ready.",
    "guidesTitle": "A few things to know",
    "guidesSub": "First time? Start with Connect ChatGPT in SaySo.",
    "guideSections": [
      [
        "You can stop at any time",
        "Want it to stop? Open SaySo and tap Stop tapping. It works straight away, without waiting for ChatGPT. When you’re done, tap “End sharing” on the SaySo home screen. You can always stop, even after your free sessions run out."
      ],
      [
        sharingInstructions.en.title,
        {
          "blocks": [
            {
              "type": "ol",
              "items": sharingInstructions.en.steps
            },
            {
              "type": "p",
              "text": sharingInstructions.en.accessoryPrompt
            },
            {
              "type": "p",
              "text": sharingInstructions.en.end
            }
          ]
        }
      ],
      [
        "When ChatGPT asks for permission",
        approveSub.en
      ],
      [
        "The final tap is yours",
        {
          "blocks": [
            {
              "type": "p",
              "text": finalTapNote.en
            },
            {
              "type": "p",
              "text": uncertainResult.en
            }
          ]
        }
      ],
      [
        "Enter card details and passwords yourself",
        "Please enter bank card numbers, passwords and verification codes yourself. Don’t ask SaySo to fill them in."
      ],
      [
        "Some screens stay hidden",
        "Banking and payment apps, identity apps such as Singpass, company-managed apps and protected videos may hide their screens. Some identity apps show a message that screen recording isn’t allowed. SaySo will tell you when ChatGPT can’t see a protected screen and won’t try to bypass the protection."
      ],
      [
        "Hold your phone upright",
        "Tapping for you needs portrait mode, so hold your phone upright."
      ],
      [
        "Typing with SaySo",
        requirements.en.keyboardNote
      ]
    ],
    "officialDocs": "Official ChatGPT documentation",
    "firmwareTitle": "Install SaySo on the accessory",
    "firmwareSub": "Install SaySo on the accessory for free using your computer. You only need to do this once.",
    "installer": "Start installing",
    "firmwareBody": "Check phone compatibility first so you can pair after installation. Open the accessory setup page in Chrome or Edge on your computer.",
    "compatTitle": "Compatibility list",
    "compatColumns": [
      "Use",
      "iPhone",
      "iOS"
    ],
    "screenMode": "Let ChatGPT see your screen",
    "controlMode": "Tapping",
    "buyTitle": "Get the right accessory",
    "buyIntro": "For tapping, you’ll need a USB-C iPhone (iPhone 15 or later), the SaySo accessory and a USB-C data cable.",
    "buySub": "Look for AtomS3 Lite (model C124). Atom Lite, AtomS3 and AtomS3R have similar names, but they’re different products.",
    "officialShop": "M5Stack official store",
    "digikey": "DigiKey · C124",
    "vendor": "Visit product page",
    "buyNote": "Prices and stock can change. Before ordering, check the total including shipping and taxes.",
    "privacyTitle": "Privacy policy",
    "privacySub": "Updated November 27, 2026",
    "draft": "This is a draft and has not been officially published. Items marked “Planned” have not been implemented yet.",
    "publisherLabel": "Publisher: ",
    "publisherPending": "BIN ZHAI",
    "privacyResources": "Service providers and your data",
    "openaiPrivacy": "OpenAI privacy policy",
    "githubPagesData": "GitHub Pages visitor data",
    "openaiDataControls": "ChatGPT data controls and deletion",
    "privacySections": [
      [
        "1. Where your screen goes",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "**Your own private SaySo service**: set up under your ChatGPT account, hosted by OpenAI and accessible only through your account;",
                "**ChatGPT**: to understand the screen and decide what to do next;",
                "**The developer**: does not handle it or receive it automatically. SaySo is an independent tool, not an OpenAI product."
              ]
            }
          ]
        }
      ],
      [
        "2. What information is processed",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "Everything visible on screen, including other apps and notifications, which may contain personal information;",
                "Text recognized from the screen;",
                "Text you ask it to type;",
                "Records needed to run the service: device names, phone and accessory connection information, each action and its result, errors and timing;",
                "Your ChatGPT account identifier when connecting, and possibly the name or email in your account."
              ]
            },
            {
              "type": "p",
              "text": "SaySo does not record your voice; when you speak in ChatGPT, OpenAI’s rules apply."
            }
          ]
        }
      ],
      [
        "3. Where it is stored",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "**In your private SaySo service**: recent screens and service records;",
                "**On your iPhone**: connection keys (in the iPhone’s secure storage), settings, your consent records and diagnostic data."
              ]
            },
            {
              "type": "p",
              "text": "The developer cannot automatically access your private SaySo service; we only see information you choose to send us. As the hosting provider, OpenAI processes this data under its own policies."
            }
          ]
        }
      ],
      [
        "4. How long it is kept",
        {
          "blocks": [
            {
              "type": "p",
              "text": "Shared screen images can no longer be read after 30 seconds. Some service records are usually removed or reduced after 1 to 7 days. We’re working to make cleanup more reliable."
            },
            {
              "type": "p",
              "text": "Only the latest screen image is kept for each phone. Recognized text can no longer be read after 15 seconds. Cleanup runs when a new screen replaces the image, the image expires or sharing ends."
            },
            {
              "type": "ul",
              "items": [
                "Cleanup can be delayed. If cleanup fails, data can remain longer, and there is currently no guaranteed maximum retention time.",
                "The test version can save extra screen images or action records for diagnostics. The screen cleanup described above excludes these extra copies. We plan to turn off those diagnostic features in the release version.",
                "Text you ask it to type: the original text is deleted when that action finishes; if the action never finishes (times out), deletion waits for periodic background cleanup;",
                "Older versions could save a short message with a screen-viewing request. The request expires after two minutes. Its message becomes eligible for cleanup 24 hours after it expires.",
                "Service cleanup does not always run on schedule. Some records, including action, pairing and device information, may contain content and have no fixed deletion time.",
                "Diagnostic records on your phone: rotate by count and size, with no guarantee of deletion within 24 hours."
              ]
            }
          ]
        }
      ],
      [
        "5. How to stop and delete",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "**Stop tapping**: tap “Stop tapping” in SaySo. It takes effect immediately on the phone; screen sharing continues;",
                "**End sharing**: tap “End sharing”. Screens stop uploading, and SaySo tries to clear this session’s screens; this does not delete all data;",
                "**Clear phone diagnostics**: end sharing first, then go to Settings → Manage data → “Clear local diagnostic records”;",
                "**Disconnect the service**: end sharing first, then go to Settings → “Disconnect SaySo service”. Connection information on the phone is deleted, and the service is asked to revoke this phone and clear some records and screenshots. If service cleanup fails, the phone still disconnects, with no option to retry afterward. You can delete your private SaySo service in ChatGPT. See section 6.",
                "**Remove the accessory**: end sharing first, then go to Settings → SaySo accessory → “Remove accessory”. This iPhone will forget the accessory. If it’s plugged in, it forgets this iPhone too. Your SaySo service stays connected.",
                "Before deleting the SaySo app, use Settings in SaySo to disconnect your service and remove the accessory. Some data, such as items in secure storage, may remain after you delete the app."
              ]
            }
          ]
        }
      ],
      [
        "6. What cannot be deleted here yet",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "There is currently no one-tap option to delete all data in the private SaySo service. The private SaySo service belongs to your ChatGPT account and can be managed or deleted in ChatGPT;",
                "Use ChatGPT’s data controls to handle conversations, screens and tool results already received by ChatGPT;",
                "We have not verified how long the hosting platform keeps logs and backups, so we make no promise here;",
                "You need to delete files you export or save separately yourself."
              ]
            }
          ]
        }
      ],
      [
        "7. Planned (not implemented yet)",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "Automatically clean up service data when sharing ends or you disconnect, with a notice and retry option if cleanup fails;",
                "Reduce action records after 7 days, keep diagnostics for at most 24 hours and run this on schedule."
              ]
            },
            {
              "type": "p",
              "text": "We will update this policy once these changes are implemented and verified."
            }
          ]
        }
      ],
      [
        "8. Your choices",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "Before sharing starts, you will see who receives the screen; if the recipients change, you will be asked again;",
                "You can review or withdraw consent in Settings; withdrawing it ends sharing first;",
                "Close anything you do not want it to see, or end sharing first;",
                "Enter card numbers, passwords and verification codes yourself. Some apps automatically hide sensitive screens, but not all do;",
                "If we add new uses of data, we will update this policy."
              ]
            }
          ]
        }
      ],
      [
        "9. This website",
        {
          "blocks": [
            {
              "type": "p",
              "text": "This website only remembers language and light or dark theme settings in your browser; clearing site data resets them. GitHub Pages hosts the website, and GitHub logs visitor IP addresses for security. This website does not receive your iPhone screen."
            }
          ]
        }
      ],
      [
        "10. Contact us",
        {
          "blocks": [
            {
              "type": "p",
              "text": "saysoapp.help@gmail.com. Please do not send passwords, pairing codes or private information shown in screenshots."
            }
          ]
        }
      ]
    ],
    "supportBetaPending": "Beta sign-up opens soon. We’ll post the TestFlight link here when it opens.",
    "supportTitle": "SaySo support",
    "supportSub": "Installation, using SaySo, stopping and deleting data. Start here if you need help.",
    "supportPrivacyLink": "Read the privacy policy and deletion limits",
    "supportItems": [
      [
        "How do I join the beta?"
      ],
      [
        "What do I need?",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "An iPhone (iOS 17 or later) and internet access;",
                "ChatGPT Plus or higher;",
                "ChatGPT can see your screen on Lightning or USB-C iPhones without an accessory. Tapping for you requires a USB-C iPhone (iPhone 15 or later), a SaySo accessory and portrait mode."
              ]
            },
            {
              "type": "p",
              "link": { "before": "See ", "route": "firmware", "label": "Set up the accessory", "after": " for setup." }
            }
          ]
        }
      ],
      [
        "How do I get started?",
        {
          "blocks": [
            {
              "type": "p",
              "link": {
                "before": "Open ",
                "route": "start",
                "label": "Get started",
                "after": " to install the SaySo app and connect ChatGPT."
              }
            },
            {
              "type": "ol",
              "items": sharingInstructions.en.steps
            },
            {
              "type": "p",
              "text": sharingInstructions.en.accessoryPrompt
            },
            {
              "type": "p",
              "text": sharingInstructions.en.end
            }
          ]
        }
      ],
      [
        "How do I make it stop?",
        {
          "blocks": [
            {
              "type": "p",
              "text": "Open SaySo and tap “Stop tapping”. It takes effect immediately without waiting for ChatGPT, even while ChatGPT is waiting for your permission. Screen sharing continues."
            }
          ]
        }
      ],
      [
        "How do I end sharing?",
        {
          "blocks": [
            {
              "type": "p",
              "text": "Tap “End sharing” on SaySo’s home screen and look for “Sharing ended”. You can also check that the red screen-recording indicator at the top of the screen has disappeared. If it is still there, stop recording in Control Center. Tapping “Stop tapping” alone does not end sharing."
            }
          ]
        }
      ],
      [
        "Can’t connect to ChatGPT or your SaySo service?",
        {
          "blocks": [
            {
              "type": "p",
              "text": `${serviceDefinition.en} Check your network first, then make sure you’re signed in to the ChatGPT account where the SaySo service is installed. Work or school accounts may need administrator approval. Before you disconnect and start over, email us the message on screen. It helps us find the cause.`
            }
          ]
        }
      ],
      [
        "Does ChatGPT say it can’t see your screen?",
        {
          "blocks": [
            {
              "type": "p",
              "text": "Check whether SaySo shows “Sharing”. Connecting to ChatGPT does not automatically share your screen; you need to tap “Start sharing”."
            }
          ]
        }
      ],
      [
        "Accessory not recognized?",
        {
          "blocks": [
            {
              "type": "p",
              "text": "Try a USB-C data cable and unlock the phone so SaySo can detect the accessory. In SaySo, open Settings → SaySo accessory and tap “Check connection”. Once the accessory is connected, tap “Allow tapping”."
            },
            {
              "type": "p",
              "link": { "before": "See ", "route": "firmware", "label": "Set up the accessory", "after": "." }
            }
          ]
        }
      ],
      [
        "How do I delete data?",
        {
          "blocks": [
            {
              "type": "p",
              "text": "First tap “End sharing” in SaySo, then open Settings and choose what you need: Clear local diagnostic records, Disconnect SaySo service or Remove accessory. Delete ChatGPT content using ChatGPT’s data controls. Not all data can be deleted yet; see sections 5 and 6 of the privacy policy."
            }
          ]
        }
      ],
      [
        "Unsure whether a payment, message or deletion went through?",
        {
          "blocks": [
            {
              "type": "p",
              "text": uncertainResult.en
            },
            {
              "type": "p",
              "text": finalTapNote.en
            }
          ]
        }
      ]
    ],
    "licensesTitle": "Source available",
    "licensesSub": "Licensed under FSL-1.1-ALv2.",
    "licensesBody": "Original SaySo website, installer frontend, MCP, plugin and skill source is available under FSL-1.1-ALv2. Copyright 2026 ZHAI BIN. Each covered version receives an additional Apache-2.0 license after two years. This is source-available software, not OSI-approved open source. Third-party licenses and SaySo trademark rights remain separate. The iOS app and ESP firmware source are not included.",
    "licenseFrontend": "Website dependencies and bundled font notices",
    "repoPending": "The public GitHub repository is not configured yet.",
    "repoOpen": "Open GitHub repository",
    "notFound": "Page not found",
    "notFoundDetail": "The link may be incorrect or the page may have moved.",
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
        finalTapNote.en
      ],
      "subscription": [
        "Help me cancel this subscription.",
        "It finds the subscription page.",
        finalTapNote.en
      ],
      "setting": [
        "What does this switch do?",
        "It looks at your screen and explains.",
        "Just looking, no tapping."
      ]
    },
    "exampleLabel": "Illustrative conversation",
    "guideExamples": {
      "bus": [
        "Getting around",
        "When is the next bus home?",
        "Find a route to the library."
      ],
      "food": [
        "Food",
        "Help me choose dinner.",
        "Stop at the final order button. I’ll tap it myself."
      ],
      "subscription": [
        "Subscriptions",
        "Help me find this subscription.",
        "Take me to the cancellation confirmation."
      ],
      "setting": [
        "Settings",
        "What does this switch do?",
        "Explain this screen without tapping."
      ]
    },
    "trySaying": "Try saying",
    "needHelp": "Need help?",
    "viewSupport": "See the support page",
    "requirementsKeyboard": "Switch to the English keyboard before typing.",
    "trademarkNotice": "SaySo trademark notice",
    "thirdPartyNotices": "Third-party notices",
    "compatUnverified": "Trying another USB-C iPhone? Tell us how it works.",
    "comparisonBody": "With SaySo, ChatGPT can see your iPhone screen while you use other apps. With the accessory, it can also tap, type or scroll for you.",
    "licensesIntro": "You can read SaySo’s source code.",
    "publisherType": "Individual developer ",
    "publisherContact": ". Contact: ",
    "privacyIntro": `${serviceDefinition.en} When you share your iPhone screen, images go to your SaySo service and ChatGPT. The developer has no servers of their own and cannot see your screen.`,
    "supportContactTitle": "Contact us",
    "supportContactBody": {
      "blocks": [
        {
          "type": "p",
          "text": "saysoapp.help@gmail.com. Please include the version number from SaySo “Settings → Support & version”; do not send passwords or pairing codes."
        }
      ]
    }
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
    "headline": "让 ChatGPT 看你的 iPhone 屏幕。",
    "subtitle": "加个小配件，还能帮你点。",
    "finalTapNote": finalTapNote.zh,
    "comparisonTitle": "和 ChatGPT 自带共享有什么不同？",
    "comparisonDisclaimer": "SaySo 是独立的第三方工具，与 OpenAI 无关联。",
    "feesTitle": "费用和次数",
    "appNameNote": appNameNote,
    "download": "下载 SaySo",
    "qrLabel": "扫码下载 SaySo",
    "checkAll": "看看需要准备什么",
    "everyday": [
      "那些让你犯难的小事，",
      "说一句，就有人帮你。"
    ],
    "chooseScene": "点一个场景，看看 SaySo 怎么帮你。",
    "scenes": [
      [
        "查公交",
        "需要配件"
      ],
      [
        "点外卖",
        "需要配件"
      ],
      [
        "取消订阅",
        "需要配件"
      ],
      [
        "看懂设置",
        "无需配件"
      ]
    ],
    "portrait": "竖屏演示",
    "scenePending": "以下是示意，不是真实录像。",
    "playback": "默认静音 · 显示字幕 · 随时暂停",
    "play": "播放视频",
    "pause": "暂停视频",
    "mute": "关闭声音",
    "unmute": "打开声音",
    "mediaError": "视频加载失败，请重试或选择其他场景。",
    "retry": "重试",
    "privacyShort": `${serviceDefinition.zh}开始共享后，屏幕画面会发到你的 SaySo 服务和 ChatGPT。`,
    "privacyLink": "画面去了哪里？",
    "disclaimer": "SaySo 配合 ChatGPT 使用，是独立开发的工具，和 OpenAI、M5Stack 没有关联。",
    "betaJoin": "在 TestFlight 参加公测",
    "betaPending": "公测报名即将开放",
    "beforeSub": "帮家人设置？请用对方自己的 iPhone 和 ChatGPT 账号。",
    "need": "需要准备什么",
    "screenGroup": "所有人都需要",
    "controlGroup": "想让 SaySo 帮你点，还需要",
    "viewCompat": "看看兼容列表",
    "startPrerequisite": requirements.zh.setupSummary,
    "controlCompatibility": "兼容列表标出了已验证可以帮你点的 iPhone 机型和 iOS 版本。",
    "detailsTitle": "更多细节",
    "resume": "卡住了？看看这里",
    "approve": "ChatGPT 问你“是否允许”时",
    "approveSub": approveSub.zh,
    "connectedNote": "连上 ChatGPT 不会自动共享屏幕，需要时在 SaySo 里点“开始共享”。",
    "guidesTitle": "几件值得知道的事",
    "guidesSub": "第一次用，从 SaySo 里的“连接 ChatGPT”开始。",
    "guideSections": [
      [
        "随时都能停",
        "想让它停下来，打开 SaySo 点“停止帮你点”，马上生效，不用等 ChatGPT。用完后，在 SaySo 首页点“结束共享”。免费次数用完了也照样能停。"
      ],
      [
        sharingInstructions.zh.title,
        {
          "blocks": [
            {
              "type": "ol",
              "items": sharingInstructions.zh.steps
            },
            {
              "type": "p",
              "text": sharingInstructions.zh.accessoryPrompt
            },
            {
              "type": "p",
              "text": sharingInstructions.zh.end
            }
          ]
        }
      ],
      [
        "ChatGPT 问“是否允许”时",
        approveSub.zh
      ],
      [
        "最后一步，交给你",
        {
          "blocks": [
            {
              "type": "p",
              "text": finalTapNote.zh
            },
            {
              "type": "p",
              "text": uncertainResult.zh
            }
          ]
        }
      ],
      [
        "卡号和密码请自己填",
        "银行卡号、密码、验证码这类信息，请你自己输入，不要让 SaySo 代填。"
      ],
      [
        "有些画面它看不到",
        "银行、支付、Singpass 等身份认证 App、公司管理的 App 和受保护的视频可能会隐藏画面。有些身份认证 App 会提示不允许录屏。ChatGPT 看不到受保护的画面时，SaySo 会告诉你，并尊重该应用的保护。"
      ],
      [
        "请竖着拿手机",
        "帮你点需要竖屏，请竖着拿手机。"
      ],
      [
        "打开 App 和打字",
        {
          "blocks": [
            { "type": "p", "text": appNameNote },
            { "type": "p", "text": requirements.zh.keyboardNote }
          ]
        }
      ]
    ],
    "officialDocs": "ChatGPT 官方说明",
    "firmwareTitle": "给配件装上 SaySo",
    "firmwareSub": "用电脑免费给配件装上 SaySo，只需一次。",
    "installer": "开始安装",
    "firmwareBody": "先核对手机兼容性，确认装好后能配对。再用电脑的 Chrome 或 Edge 打开配件设置页。",
    "compatTitle": "兼容列表",
    "compatColumns": [
      "用途",
      "iPhone",
      "iOS"
    ],
    "screenMode": "让 ChatGPT 看屏幕",
    "controlMode": "帮你点",
    "buyTitle": "买对配件",
    "buyIntro": "想让 ChatGPT 帮你点，需要 USB-C 接口的 iPhone（iPhone 15 及以后机型）、SaySo 配件和一根 USB-C 数据线。",
    "buySub": "认准 AtomS3 Lite（型号 C124）。名字很像的 Atom Lite、AtomS3、AtomS3R 都不是它。",
    "officialShop": "M5Stack 官方商城",
    "digikey": "DigiKey · C124",
    "vendor": "查看商品",
    "buyNote": "价格和库存会变，下单前看清含运费和税的总价。",
    "privacyTitle": "隐私政策",
    "privacySub": "更新于 2026 年 11 月 27 日",
    "draft": "这是草稿，还没正式发布。标着“计划中”的内容还没做到。",
    "publisherLabel": "发布者：",
    "publisherPending": "BIN ZHAI",
    "privacyResources": "服务提供方与你的数据",
    "openaiPrivacy": "OpenAI 隐私政策",
    "githubPagesData": "GitHub Pages 访问数据说明",
    "openaiDataControls": "ChatGPT 数据管理与删除",
    "privacySections": [
      [
        "1. 画面发到哪里",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "**你自己的私人 SaySo 服务**：建在你的 ChatGPT 账号下，由 OpenAI 托管，只有你的账号能用；",
                "**ChatGPT**：用来看屏幕、决定下一步；",
                "**开发者**：不经手，也不会自动收到。SaySo 是独立工具，不是 OpenAI 的产品。"
              ]
            }
          ]
        }
      ],
      [
        "2. 会处理哪些信息",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "屏幕上能看到的一切，包括别的 App 和弹出的通知，其中可能有个人信息；",
                "从画面里识别出的文字；",
                "你让它输入的文字；",
                "让服务运转需要的记录：设备名称、手机和配件的连接信息、每一步操作和结果、错误和耗时；",
                "连接时你 ChatGPT 账号的标识，可能还有账号里的名字或邮箱。"
              ]
            },
            {
              "type": "p",
              "text": "SaySo 不录你的声音；你在 ChatGPT 里说话，按 OpenAI 的规则处理。"
            }
          ]
        }
      ],
      [
        "3. 存在哪里",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "**私人 SaySo 服务里**：近期的画面和服务记录；",
                "**你的 iPhone 上**：连接用的密钥（存在 iPhone 的安全存储里）、设置、你的同意记录、诊断数据。"
              ]
            },
            {
              "type": "p",
              "text": "开发者不能自动进入你的私人 SaySo 服务；只有你主动发给我们的信息，我们才会看到。OpenAI 作为托管方，按它自己的政策处理这些数据。"
            }
          ]
        }
      ],
      [
        "4. 保存多久",
        {
          "blocks": [
            {
              "type": "p",
              "text": "共享画面 30 秒后就读不到了。部分服务记录通常会在 1 到 7 天后清理或精简。我们正在改进清理流程。"
            },
            {
              "type": "p",
              "text": "每台手机只保留最新一张画面。识别出的文字 15 秒后就读不到了。换了新画面、画面到期或结束共享时会清理。"
            },
            {
              "type": "ul",
              "items": [
                "清理可能延迟。如果清理失败，数据可能留得更久，目前没有保证的最长期限。",
                "测试版的诊断功能可能额外保存画面或操作记录。前面说的画面清理不包括这些额外副本。正式版计划关闭这些诊断功能。",
                "你让它输入的文字：这一步完成后就删掉原文；如果这一步一直没完成（超时），要等后台的定期清理才删；",
                "旧版的看屏幕请求可以附带一段简短留言。请求两分钟后失效，失效满 24 小时后，留言会纳入定期清理。",
                "服务清理有时会延迟。部分记录（例如操作、配对和设备信息）可能仍有内容，也没有固定的删除时间。",
                "手机上的诊断记录：按数量和大小轮换，还不能保证 24 小时内删掉。"
              ]
            }
          ]
        }
      ],
      [
        "5. 怎么停、怎么删",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "**停止帮你点**：在 SaySo 点“停止帮你点”，马上在手机上生效，屏幕还在共享；",
                "**结束共享**：点“结束共享”，画面不再上传，并会尝试清掉这次的画面；这不等于删除所有数据；",
                "**清除手机诊断**：先结束共享，再到设置 → 数据管理 → “清除本机诊断记录”；",
                "**断开服务**：先结束共享，再到设置 →“断开 SaySo 服务”。手机上的连接信息会删掉，并请服务撤销这台手机、清理部分记录和截图。服务那边清理失败时，手机仍会断开，之后没有重试的入口。你可以在 ChatGPT 里删除你的私人 SaySo 服务，见第 6 节。",
                "**移除配件**：先结束共享，再到设置 → SaySo 配件 →“移除配件”。这台 iPhone 会删除与配件的配对。配件插着时，配件也会删除和这台手机的配对。SaySo 服务仍然连接。",
                "删除 SaySo App 前，先在 SaySo 设置里断开服务、移除配件。删除 App 后，安全存储里的条目等数据仍可能保留。"
              ]
            }
          ]
        }
      ],
      [
        "6. 目前删不到的地方",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "现在还没有一键删除私人 SaySo 服务全部数据的功能。私人 SaySo 服务属于你的 ChatGPT 账号，可以在 ChatGPT 里管理或删除；",
                "ChatGPT 收到的对话、画面和工具结果，请在 ChatGPT 的数据管理里处理；",
                "托管平台的日志和备份保存多久，我们没有核实，不在这里承诺；",
                "你导出或另存的文件，要自己删。"
              ]
            }
          ]
        }
      ],
      [
        "7. 计划中（还没做到）",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "结束共享和断开时自动清理服务里的数据，失败时提示，可以重试；",
                "操作记录 7 天精简、诊断最多留 24 小时，并且按时执行。"
              ]
            },
            {
              "type": "p",
              "text": "做好并验证后，我们会更新这份政策。"
            }
          ]
        }
      ],
      [
        "8. 你可以做的选择",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "开始共享前，你会看到画面发给谁；接收方变了，会重新问你；",
                "在设置里可以查看或撤回同意，撤回会先结束共享；",
                "不想让它看到的内容，先关掉，或先结束共享；",
                "卡号、密码、验证码请自己输入。有些 App 会自动隐藏敏感画面，但不是所有 App 都会；",
                "如果增加新的数据用途，我们会更新这份政策。"
              ]
            }
          ]
        }
      ],
      [
        "9. 本网站",
        {
          "blocks": [
            {
              "type": "p",
              "text": "本网站只在你的浏览器里记住语言和深浅色设置，清除网站数据就会重置。网站由 GitHub Pages 托管，GitHub 会出于安全记录访问者的 IP 地址。网站不接收你的 iPhone 画面。"
            }
          ]
        }
      ],
      [
        "10. 联系我们",
        {
          "blocks": [
            {
              "type": "p",
              "text": "saysoapp.help@gmail.com。请不要发送密码、配对码或截图里的私密内容。"
            }
          ]
        }
      ]
    ],
    "supportBetaPending": "公测报名即将开放，开放后这里会放 TestFlight 链接。",
    "supportTitle": "SaySo 支持",
    "supportSub": "安装、使用、停下来、删除数据。遇到问题先看这里。",
    "supportPrivacyLink": "查看隐私政策与删除范围",
    "supportItems": [
      [
        "怎么参加测试？"
      ],
      [
        "需要什么？",
        {
          "blocks": [
            {
              "type": "ul",
              "items": [
                "iPhone（iOS 17 或更新）、能上网；",
                "ChatGPT Plus 或更高；",
                "让 ChatGPT 看屏幕不用配件，Lightning 或 USB-C 接口的 iPhone 都可以。帮你点需要 USB-C 接口的 iPhone（iPhone 15 及以后机型）和 SaySo 配件，并且要竖着拿手机。"
              ]
            },
            {
              "type": "p",
              "link": { "before": "安装方法见“", "route": "firmware", "label": "准备配件", "after": "”。" }
            }
          ]
        }
      ],
      [
        "怎么开始？",
        {
          "blocks": [
            {
              "type": "p",
              "link": {
                "before": "打开“",
                "route": "start",
                "label": "开始使用",
                "after": "”，安装 SaySo App 并连接 ChatGPT。"
              }
            },
            {
              "type": "ol",
              "items": sharingInstructions.zh.steps
            },
            {
              "type": "p",
              "text": sharingInstructions.zh.accessoryPrompt
            },
            {
              "type": "p",
              "text": sharingInstructions.zh.end
            }
          ]
        }
      ],
      [
        "怎么让它停下？",
        {
          "blocks": [
            {
              "type": "p",
              "text": "打开 SaySo 点“停止帮你点”，马上生效，不用等 ChatGPT；就算 ChatGPT 正在等你确认，也能停。屏幕还会继续共享。"
            }
          ]
        }
      ],
      [
        "怎么结束共享？",
        {
          "blocks": [
            {
              "type": "p",
              "text": "在 SaySo 首页点“结束共享”，确认看到“共享已结束”。还可以检查屏幕顶部的红色录屏标志是否消失。如果还在，从控制中心点录屏按钮停止。只点“停止帮你点”不会结束共享。"
            }
          ]
        }
      ],
      [
        "连不上 ChatGPT 或 SaySo 服务？",
        {
          "blocks": [
            {
              "type": "p",
              "text": `${serviceDefinition.zh}先检查网络，再确认登录的是安装了 SaySo 服务的 ChatGPT 账号。工作或学校账号可能需要管理员开通。断开重来之前，先把屏幕上的提示发邮件给我们，方便我们找原因。`
            }
          ]
        }
      ],
      [
        "ChatGPT 说看不到屏幕？",
        {
          "blocks": [
            {
              "type": "p",
              "text": "看看 SaySo 里是不是“共享中”。连上 ChatGPT 不会自动共享，要你点一下“开始共享”。"
            }
          ]
        }
      ],
      [
        "配件认不出来？",
        {
          "blocks": [
            {
              "type": "p",
              "text": "换一根 USB-C 数据线并解锁手机，让 SaySo 能发现配件。在 SaySo 打开“设置 → SaySo 配件”，点“检查连接”。配件连上后再点“允许帮你点”。"
            },
            {
              "type": "p",
              "link": { "before": "请查看“", "route": "firmware", "label": "准备配件", "after": "”。" }
            }
          ]
        }
      ],
      [
        "怎么删除数据？",
        {
          "blocks": [
            {
              "type": "p",
              "text": "先在 SaySo 点“结束共享”，再到设置里按需要选：清除本机诊断记录、断开 SaySo 服务、移除配件。ChatGPT 里的内容在 ChatGPT 的数据管理里删。现在还删不到全部数据，详见隐私政策第 5、6 节。"
            }
          ]
        }
      ],
      [
        "不确定付款、发送或删除是否成功？",
        {
          "blocks": [
            {
              "type": "p",
              "text": uncertainResult.zh
            },
            {
              "type": "p",
              "text": finalTapNote.zh
            }
          ]
        }
      ]
    ],
    "licensesTitle": "源码公开",
    "licensesSub": "源码采用 FSL-1.1-ALv2 许可。",
    "licensesBody": "SaySo 原创的网站、安装器前端、MCP、插件和 Skill 源码采用 FSL-1.1-ALv2。Copyright 2026 ZHAI BIN。每个适用版本公开满两年后额外获得 Apache-2.0 许可。这属于源码公开，不是 OSI 认可的开源许可。第三方许可和 SaySo 商标权另行处理；iOS App 与 ESP 固件源码未包含在仓库中。",
    "licenseFrontend": "网站依赖与字体许可",
    "repoPending": "公开 GitHub 仓库尚未配置。",
    "repoOpen": "打开 GitHub 仓库",
    "notFound": "找不到这一页",
    "notFoundDetail": "可能是链接写错了或页面已移动。",
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
        finalTapNote.zh
      ],
      "subscription": [
        "帮我取消这个订阅。",
        "它找到订阅页面。",
        finalTapNote.zh
      ],
      "setting": [
        "这个开关是干什么的？",
        "它看着你的屏幕给你解释。",
        "只看不点。"
      ]
    },
    "exampleLabel": "对话示例",
    "guideExamples": {
      "bus": [
        "出行",
        "回家的公交还有多久到？",
        "帮我查去图书馆的路线。"
      ],
      "food": [
        "外卖",
        "帮我选晚饭。",
        "到最后下单那一步停下，我自己点。"
      ],
      "subscription": [
        "订阅",
        "帮我找到这个订阅。",
        "带我到取消确认那一步。"
      ],
      "setting": [
        "设置",
        "这个开关是干什么的？",
        "解释这个页面，不要点击。"
      ]
    },
    "trySaying": "可以这样说",
    "needHelp": "遇到问题？",
    "viewSupport": "查看支持页",
    "requirementsKeyboard": "打字前先切到英文键盘。",
    "trademarkNotice": "SaySo 商标说明",
    "thirdPartyNotices": "第三方许可说明",
    "compatUnverified": "其他 USB-C iPhone 欢迎试用并告诉我们结果。",
    "comparisonBody": "用 SaySo 时，即使你切到别的 App，ChatGPT 也能看你的 iPhone 屏幕。连上配件后，还能帮你点、打字或滑动。",
    "licensesIntro": "你可以阅读 SaySo 的源代码。",
    "publisherType": "个人开发者 ",
    "publisherContact": "。联系：",
    "privacyIntro": `${serviceDefinition.zh}共享 iPhone 屏幕时，画面会发到你的 SaySo 服务和 ChatGPT。开发者没有自己的服务器，看不到你的画面。`,
    "supportContactTitle": "联系我们",
    "supportContactBody": {
      "blocks": [
        {
          "type": "p",
          "text": "saysoapp.help@gmail.com。请附上 SaySo“设置 → 支持与版本”里的版本号；不要发送密码或配对码。"
        }
      ]
    }
  }
};
for (const lang of ["en", "zh"]) {
  Object.assign(copy[lang], {
    hardware: requirements[lang].hardwareSummary,
    requirementGroups: requirementGroups(lang),
    free: requirements[lang].fees,
    feeParagraphs: requirements[lang].feeParagraphs,
    usbRequirement: requirements[lang].usbRequirement,
    keyboardNote: requirements[lang].keyboardNote,
  });
}
