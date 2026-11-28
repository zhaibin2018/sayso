---
name: sayso-type-text
description: "输入这段、帮我打字、搜一下、追加文字、填这个框；type this, enter this text, search for, append text, fill this field. Enter user-supplied text in a focused iPhone field with SaySo; submit only an intended in-app search."
---

# Enter text

View actual pixels before answering or acting, following [Read screen](../sayso-read-screen/SKILL.md); reuse a just-returned action image instead of reading again.

Apply [shared execution rules](../sayso-control/references/workflows.md) for Stop, voice replies, final user taps, hidden screens and recovery.

1. Identify the requested field from the current actual image. Click once if focus is needed and continue from its after-image.
2. Use `type_text_in_field` with device, the user's literal supported text and a new key. Use the accessory's returned `max_text_len`; never silently truncate. Split longer printable ASCII at spaces/punctuation without losing characters. Clear only the first segment of a replacement in a single-line field; for an explicit append request, later segments and all multiline editors, use `clear_before_input=false` from the start. Inspect each segment's after-image and current permission before continuing.
3. Use `submit="enter"` only on the final segment of an intended in-app search. Omit submit for Spotlight app discovery and fill-only drafts. Messages, forms, purchases and payments follow the shared final-user-tap rule.
4. Use the actual returned image for the next decision. Do not add a separate caret, empty-field, screenshot-age or whole-image-equality check.

## Keyboard and sensitive fields

Use the English (ABC) keyboard and printable ASCII text. Before calling, replace curly quotes, long dashes and other non-ASCII punctuation with ASCII equivalents; split text over the limit at spaces into several calls, and only the first may clear. Only Spotlight app discovery may use an app name in pinyin (for example `taobao`); elsewhere do not transliterate Chinese, silently translate or assume clipboard/Emoji/Unicode support. Ask for an English version when necessary. If pinyin candidates or garbled text appear, stop without retyping and say “请先把手机键盘切到英文（ABC）。 / Please switch your iPhone keyboard to English (ABC).”

Never request or enter card numbers, passwords, verification codes/OTPs, CVV or identity numbers. Let the user handle the field; park only when it is visibly appropriate, and say “这一项请你自己输入。 / Please enter this yourself.”

A loading destination or clipped query is not evidence of lost characters. Use one original-command observation under [recovery](../sayso-control/references/recovery.md). Re-enter only when actual evidence establishes a wrong/failed entry and a correction is warranted; never blindly repeat a prefix or Return. Counted interrupted text may continue only under that reference's exact-count recovery conditions.

Only in system search to find an app, enter the app name in pinyin (for example taobao). Elsewhere, do not transliterate Chinese into pinyin. On pinyin candidates or garbled text without retyping, stop and ask for English (ABC).
