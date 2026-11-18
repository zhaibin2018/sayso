# Website review: W1–W8 and T6

The source change is ready for deployment review; it does not itself deploy GitHub Pages. Security source 0.13.249 was published first; runtime 0.13.250 and skills 1.2.41 add T6 pointer handoff. T6 remains model guidance, not a server-enforced block.

Validation: 58 website/installer tests passed, integrated build passed, 38 browser checks passed. No phone or firmware operations occurred. Release channel remains unavailable and trusted firmware keys remain empty.

Mobile Site creation has not been accepted end to end. [OpenAI documentation](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites) currently describes creation on web/desktop. The website therefore describes iPhone setup as the intended flow, not verified availability.

| Page / language / width | Before | After |
|---|---|---|
| home / en / 1280px | [Before](before-home-en-1280.png) | [After](after-home-en-1280.png) |
| home / en / 390px | [Before](before-home-en-390.png) | [After](after-home-en-390.png) |
| home / zh / 1280px | [Before](before-home-zh-1280.png) | [After](after-home-zh-1280.png) |
| home / zh / 390px | [Before](before-home-zh-390.png) | [After](after-home-zh-390.png) |
| start / en / 1280px | [Before](before-start-en-1280.png) | [After](after-start-en-1280.png) |
| start / en / 390px | [Before](before-start-en-390.png) | [After](after-start-en-390.png) |
| start / zh / 1280px | [Before](before-start-zh-1280.png) | [After](after-start-zh-1280.png) |
| start / zh / 390px | [Before](before-start-zh-390.png) | [After](after-start-zh-390.png) |

Lightning checks:
- [en, 1280px](after-lightning-en-1280.png)
- [en, 390px](after-lightning-en-390.png)
- [zh, 1280px](after-lightning-zh-1280.png)
- [zh, 390px](after-lightning-zh-390.png)

W1 centralizes bilingual requirements and tests their actual Home/Start rendering; W2 applies USB-C/helper requirements; W3 unifies terminology; W4 fixes compatibility navigation and planned quotas; W5 supplies illustrative conversations; W6 describes actual retention; W7 supplies use instructions and collapsed developer material; W8 improves theme, touch targets, mobile order, model order, metadata and brand asset sizes.

Missing App Store/contact information, accepted firmware releases, account deletion and automatic update checks are not fabricated. Existing private installations must follow INSTALL.md to update. The private iOS source and firmware source are excluded from this repository.
