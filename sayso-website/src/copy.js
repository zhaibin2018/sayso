// Terminology: screen reading=读屏; tapping for you=帮你点; Stop tapping=停止帮你点; End session=结束本次使用.
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
        "Pair the accessory in SaySo. Tap Allow tapping when you want it to tap for you, or choose Automatically allow for future sharing sessions."
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
        "Tap Start screen sharing in SaySo, open ChatGPT and start Voice, then go to the app you want to use and ask something like “What does this switch do?”",
        "Screen sharing in SaySo"
      ]
    ],
    "screenshot": "Screenshot coming soon",
    "screenshotEn": "English screenshot shown; Chinese version pending.",
    "captured": "Captured",
    "resume": "Stuck? Start here",
    "approve": "When ChatGPT asks for permission, tap the screen.",
    "approveSub": "Tap Allow or Decline on the card in ChatGPT. Saying “yes” doesn’t count.",
    "connectedNote": "Connecting to ChatGPT doesn’t share your screen automatically. Tap Start screen sharing in SaySo when you’re ready.",
    "guidesTitle": "A few things to know",
    "guidesSub": "First time? Start with Connect ChatGPT in SaySo.",
    "guideSections": [
      [
        "You can stop at any time",
        "Want it to stop? Open SaySo and tap Stop tapping. It works straight away, without waiting for ChatGPT. To stop sending screen images too, tap End session on the home screen, or End sharing on the consent page. You can always stop, even after your free tasks run out."
      ],
      [
        "Start and end sharing",
        "Tap Start screen sharing in SaySo, open ChatGPT and start Voice, then go to the app you want to use and ask. When you’re done, tap End session on the SaySo home screen."
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
    "firmwareBody": "Check phone compatibility first. The flashing page offers only C124 production USB firmware 0.6.0. In desktop Chrome or Edge, you choose the serial port yourself. New-PID device acceptance is still pending.",
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
    "privacyTitle": "Privacy policy",
    "privacySub": "Updated November 20, 2026 · Development version",
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
              "text": "SaySo does not record your voice; when you speak in ChatGPT, OpenAI’s rules apply.\nThe test version also has diagnostic features that may save extra screens or action records; these will be disabled in the release version."
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
                "**On your iPhone**: connection keys (in the iPhone’s secure storage), settings, your consent records and diagnostic numbers."
              ]
            },
            {
              "type": "p",
              "text": "The developer cannot automatically access your private service; we only see information you choose to send us. As the hosting provider, OpenAI processes this data under its own policies."
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
              "text": "**Only the latest screen is kept for each phone, and it cannot be read after 30 seconds; recognized text cannot be read after 15 seconds.** Cleanup runs when a new screen replaces it, it expires or sharing ends."
            },
            {
              "type": "p",
              "text": "A few things to make clear:"
            },
            {
              "type": "ul",
              "items": [
                "“Cannot be read” does not mean deleted immediately. If cleanup fails, data may remain longer; there is currently no guaranteed maximum retention time;",
                "Extra screens saved by diagnostic features are outside the cleanup described above (these features will be disabled in the release version);",
                "Text you ask it to type: the original text is deleted when that action finishes; if the action never finishes (times out), deletion waits for periodic background cleanup;",
                "The message you leave when manually asking it to read your screen: expires after two minutes and is cleaned up another 24 hours later;",
                "Other records (actions, pairing and device information, for example): some are reduced or cleaned up after 1 to 7 days, but we cannot yet guarantee this runs on schedule every day; some records have no fixed deletion time and may still contain content;",
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
                "**End sharing**: tap “End session”. Screens stop uploading, and SaySo tries to clear this session’s screens; this does not delete all data;",
                "**Clear phone diagnostics**: end sharing first, then go to Settings → Manage data → “Clear local diagnostic records”;",
                "**Disconnect the service**: end sharing first, then go to Settings → “Disconnect SaySo service”. Connection information on the phone is deleted, and the service is asked to revoke this phone and clear some records and screenshots. If service cleanup fails, the phone still disconnects, with no option to retry afterward;",
                "**Remove the accessory**: end sharing first, then go to Settings → SaySo accessory → “Remove accessory” to delete the accessory key on the phone;",
                "Deleting the app does not guarantee all traces are removed, such as items in secure storage."
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
                "There is currently no one-tap option to delete all data in the private service. The private service belongs to your ChatGPT account and can be managed or deleted in ChatGPT;",
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
                "Reduce action records after 7 days, keep diagnostics for at most 24 hours and run this on schedule;",
                "Disable diagnostic features in the release version."
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
                "Billing and usage counting are still in development; if new data uses are added, we will update this policy before launch."
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
    "supportTitle": "SaySo support",
    "supportSub": "Installation, using SaySo, stopping and deleting data. Start here if you need help.",
    "supportPrivacyLink": "Read the privacy policy and deletion limits",
    "supportItems": [
      [
        "Can I download it now?",
        {
          "blocks": [
            {
              "type": "p",
              "text": "Not yet. SaySo is currently a development version. We will announce its App Store launch here."
            }
          ]
        }
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
                "No accessory is needed just to let it see your screen; to let it tap for you, you also need a SaySo accessory and must hold your phone upright. Accessory preparation instructions are coming soon."
              ]
            }
          ]
        }
      ],
      [
        "How do I get started?",
        {
          "blocks": [
            {
              "type": "ol",
              "items": [
                "In SaySo, tap “Start screen sharing”, read the notice and tap “Agree and start sharing”, then tap “Start Broadcast” in the system prompt;",
                "Tap “Open ChatGPT”, send the prefilled message, then start voice;",
                "Go to the app you want to use and ask directly."
              ]
            },
            {
              "type": "p",
              "text": "When you are done, return to SaySo and tap “End session”."
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
              "text": "Tap “End session” on SaySo’s home screen. Sharing has ended when the red screen-recording indicator at the top of the screen disappears; if it is still there, stop it with the screen-recording button in Control Center. Tapping “Stop tapping” alone does not end sharing."
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
              "text": "Check your network first, then make sure you are signed in to the ChatGPT account where SaySo is installed; work or school accounts may need administrator approval. Note the on-screen message and email it to us before rushing to disconnect and start over."
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
              "text": "Check whether SaySo shows “Sharing”. Connecting to ChatGPT does not automatically share your screen; you need to tap “Start screen sharing”."
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
              "text": "Try a cable that carries data, plug it in firmly, unlock the phone and return to SaySo to tap “Check connection”. Once the accessory is connected, tap “Allow tapping”. Do not repeatedly retry payments, sending or deletion when the result is uncertain."
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
              "text": "First tap “End session” in SaySo, then open Settings and choose what you need: Clear local diagnostic records, Disconnect SaySo service or Remove accessory. Delete ChatGPT content using ChatGPT’s data controls. Not all data can be deleted yet; see sections 5 and 6 of the privacy policy."
            }
          ]
        }
      ]
    ],
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
    "licensesIntro": "SaySo’s source is available for you to read and host yourself.",
    "publisherType": "Individual developer ",
    "publisherContact": ". Contact: ",
    "privacyIntro": "SaySo sends the iPhone screen you share to your own private SaySo service under your ChatGPT account and to ChatGPT, so it can understand your screen and tap for you when needed. The developer has no servers of their own and cannot see your screen.",
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
        "在 SaySo 里配对配件。想让它帮你点时，点“允许帮你点”，也可以选择“自动允许”，以后开始共享时就自动允许。"
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
        "在 SaySo 点“开始屏幕共享”，打开 ChatGPT 开启语音，再去你要用的 App 直接问，比如“这个开关是干什么的？”",
        "SaySo 共享中的画面"
      ]
    ],
    "screenshot": "截图准备中",
    "screenshotEn": "当前为英文截图，中文版本待补。",
    "captured": "截图日期",
    "resume": "卡住了？看看这里",
    "approve": "ChatGPT 问你“是否允许”时，要在屏幕上点。",
    "approveSub": "在 ChatGPT 的提示卡片上点“允许”或“拒绝”；嘴上说“同意”不算。",
    "connectedNote": "连上 ChatGPT 不会自动共享屏幕，需要时在 SaySo 里点“开始屏幕共享”。",
    "guidesTitle": "几件值得知道的事",
    "guidesSub": "第一次用，从 SaySo 里的“连接 ChatGPT”开始。",
    "guideSections": [
      [
        "随时都能停",
        "想让它停下来，打开 SaySo 点“停止帮你点”，马上生效，不用等 ChatGPT。想连画面也不再发送，再点首页的“结束本次使用”，或同意页的“结束共享”。免费次数用完了也照样能停。"
      ],
      [
        "开始和结束共享",
        "在 SaySo 点“开始屏幕共享”，打开 ChatGPT 开启语音，再去你要用的 App 直接问。用完在 SaySo 首页点“结束本次使用”。"
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
    "firmwareBody": "先核对手机兼容性。刷写页只提供 C124 USB 正式固件 0.6.0；用电脑 Chrome 或 Edge 打开，由你选择串口。新 PID 的真机兼容性仍待验收。",
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
    "privacyTitle": "隐私政策",
    "privacySub": "更新于 2026 年 11 月 20 日 · 开发版本",
    "draft": "这是草稿，还没正式发布。标着\"计划中\"的内容还没做到。",
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
                "**ChatGPT**：用来看懂屏幕、决定下一步；",
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
              "text": "SaySo 不录你的声音；你在 ChatGPT 里说话，按 OpenAI 的规则处理。\n测试版里还有一些诊断用的功能，可能会多存一些画面或操作记录；正式版会关闭。"
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
                "**你的 iPhone 上**：连接用的密钥（存在 iPhone 的安全存储里）、设置、你的同意记录、诊断数字。"
              ]
            },
            {
              "type": "p",
              "text": "开发者不能自动进入你的私人服务；只有你主动发给我们的信息，我们才会看到。OpenAI 作为托管方，按它自己的政策处理这些数据。"
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
              "text": "**画面每台手机只留最新一张，30 秒后就不能再读；识别出的文字 15 秒后不能再读。**换了新画面、到期或结束共享时会清理。"
            },
            {
              "type": "p",
              "text": "要说清楚的几点："
            },
            {
              "type": "ul",
              "items": [
                "\"不能再读\"不等于马上删除。清理失败时可能留得更久，目前没有保证的最长期限；",
                "诊断用的功能另外存的画面，不在上面的清理范围里（正式版会关闭这些功能）；",
                "你让它输入的文字：这一步完成后就删掉原文；如果这一步一直没完成（超时），要等后台的定期清理才删；",
                "你手动请它看屏幕时留的话：两分钟后失效，再过 24 小时才会被清理；",
                "其他记录（操作记录、配对和设备信息等）：部分会在 1 到 7 天后精简或清理，但现在还不能保证每天按时执行；有些记录没有固定的删除时间，里面可能仍有内容；",
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
                "**停止帮你点**：在 SaySo 点\"停止帮你点\"，马上在手机上生效，屏幕还在共享；",
                "**结束共享**：点\"结束本次使用\"，画面不再上传，并会尝试清掉这次的画面；这不等于删除所有数据；",
                "**清除手机诊断**：先结束共享，再到设置 → 数据管理 →\"清除本机诊断记录\"；",
                "**断开服务**：先结束共享，再到设置 →\"断开 SaySo 服务\"。手机上的连接信息会删掉，并请服务撤销这台手机、清理部分记录和截图。服务那边清理失败时，手机仍会断开，之后没有重试的入口；",
                "**移除配件**：先结束共享，再到设置 → SaySo 配件 →\"移除配件\"，删掉手机上的配件密钥；",
                "删掉 App 不保证清掉所有痕迹，比如安全存储里的条目。"
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
                "现在还没有一键删除私人服务全部数据的功能。私人服务属于你的 ChatGPT 账号，可以在 ChatGPT 里管理或删除；",
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
                "操作记录 7 天精简、诊断最多留 24 小时，并且按时执行；",
                "正式版关闭诊断用的功能。"
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
                "收费和次数统计还在开发中；如果增加新的数据用途，上架前会先更新这份政策。"
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
    "supportTitle": "SaySo 支持",
    "supportSub": "安装、使用、停下来、删除数据。遇到问题先看这里。",
    "supportPrivacyLink": "查看隐私政策与删除范围",
    "supportItems": [
      [
        "现在能下载吗？",
        {
          "blocks": [
            {
              "type": "p",
              "text": "还不能。SaySo 现在是开发版本，App Store 上线后会在这里通知。"
            }
          ]
        }
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
                "只让它看屏幕，不需要配件；想让它帮你点，还要 SaySo 配件，并且竖着拿手机。配件准备方法即将公布。"
              ]
            }
          ]
        }
      ],
      [
        "怎么开始？",
        {
          "blocks": [
            {
              "type": "ol",
              "items": [
                "在 SaySo 点\"开始屏幕共享\"，读完说明点\"同意并开始共享\"，在系统弹窗点\"开始直播\"；",
                "点\"打开 ChatGPT\"，发送预填好的话，再打开语音；",
                "去你要用的 App，直接问。"
              ]
            },
            {
              "type": "p",
              "text": "用完回 SaySo 点\"结束本次使用\"。"
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
              "text": "打开 SaySo 点\"停止帮你点\"，马上生效，不用等 ChatGPT；就算 ChatGPT 正在等你确认，也能停。屏幕还会继续共享。"
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
              "text": "在 SaySo 首页点\"结束本次使用\"。屏幕顶部的红色录屏标志消失，就结束了；如果还在，从控制中心点录屏按钮停止。只点\"停止帮你点\"不会结束共享。"
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
              "text": "先看网络，再确认登录的是装了 SaySo 的那个 ChatGPT 账号；工作或学校账号可能要管理员开通。记下页面上的提示发邮件给我们，先别急着断开重来。"
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
              "text": "看看 SaySo 里是不是\"共享中\"。连上 ChatGPT 不会自动共享，要你点一下\"开始屏幕共享\"。"
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
              "text": "换一根能传数据的线，插紧，解锁手机，回 SaySo 点\"检查连接\"。配件连上后再点\"允许帮你点\"。付款、发送、删除这类操作结果不确定时，不要反复重试。"
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
              "text": "先在 SaySo 点\"结束本次使用\"，再到设置里按需要选：清除本机诊断记录、断开 SaySo 服务、移除配件。ChatGPT 里的内容在 ChatGPT 的数据管理里删。现在还删不到全部数据，详见隐私政策第 5、6 节。"
            }
          ]
        }
      ]
    ],
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
    "licensesIntro": "SaySo 的源码公开，你可以查看和自己部署。",
    "publisherType": "个人开发者 ",
    "publisherContact": "。联系：",
    "privacyIntro": "SaySo 把你共享的 iPhone 画面，发给你自己 ChatGPT 账号下的私人 SaySo 服务和 ChatGPT，让它看懂屏幕、需要时帮你点。开发者没有自己的服务器，看不到你的画面。",
    "supportContactTitle": "联系我们",
    "supportContactBody": {
      "blocks": [
        {
          "type": "p",
          "text": "saysoapp.help@gmail.com。请附上 SaySo\"设置 → 支持与版本\"里的版本号；不要发送密码或配对码。"
        }
      ]
    }
  }
};
for (const lang of ["en","zh"]) Object.assign(copy[lang], {hardware:requirements[lang].hardwareSummary, setupNeed:requirements[lang].setupSummary, needs:requirementRows(lang), free:requirements[lang].fees, costs:requirements[lang].costs, keyboardNote:requirements[lang].keyboardNote, noAccessory:requirements[lang].screenSummary});
