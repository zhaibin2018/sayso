---
name: sayso-type-text
description: Type into the focused field, clearing first by default. App searches use Return automatically. 输入、追加；App 内搜索自动回车。
---

# Enter text

Apply [shared rules](../sayso-control/references/workflows.md) and [image handoff](../sayso-control/references/image-handoff.md).

1. Use the prior actual after-image to identify the requested field. If it needs focus, click once and continue from the click's after-image.
2. Call `type_text_in_field` with device, the user's literal text and a new key. The current contract uses the focused field; do not add a caret, empty-field, screenshot-age or pixel-equality verification.
3. Default input clears first and accepts 1–60 printable ASCII characters. Intentional append uses `clear_before_input=false`, up to 64. Missing current capability is a connection/version problem, not a reason to use an older protected field flow.
4. For an in-app search, use `submit="enter"`; the user need not say Return. Omit submit for Spotlight app discovery and fill-only drafts. Do not turn an unrelated message, form, purchase or payment into a submission. Keep the default after-input settling.
5. Inspect the same-call after-image and pass it to the next decision. Locate any separate submit button from that image only when needed.

Do not silently truncate unsupported text. Only in system search to find an app, enter the app name in pinyin (for example taobao) without additional permission. Elsewhere, do not transliterate Chinese into pinyin. Use the English (ABC) keyboard; inspect the after-image and stop on pinyin candidates or garbled text without retyping. Clipboard, Emoji and arbitrary Unicode input are not first-release capabilities. Unknown input uses [original-ID recovery](../sayso-control/references/recovery.md). Do not request old layout probes or field-review tools.

A confirmed type-and-Return can return a loading page or a visibly clipped query. Neither proves lost characters or authorizes blind retyping. If the destination has not settled, use one bounded original-command observation under the shared recovery rule. Re-enter only after actual evidence establishes a failed/wrong entry and the correction is warranted; a shortened display alone is not such evidence. Do not count repeated submissions as a first-attempt success.

T6 final steps: follow [shared T6 and hidden-screen rules](../sayso-control/references/workflows.md); park with `move_mouse_to`, inspect its actual after-image, then ask the user to tap. Do not submit the final step.


Typing safety:
- Clear only single-line input fields. In multiline editors such as Notes, email bodies and documents, append with `clear_before_input=false`.
- Do not enter full card numbers, CVV, banking passwords or one-time verification codes. Ask the user to enter them directly.
- Use an English (ABC) iPhone keyboard. After typing, inspect the actual after-image. If pinyin candidates or garbled text appear, stop and say “请先把手机键盘切到英文（ABC） / Please switch your iPhone keyboard to English (ABC) first.” Do not repeat the input.

Sensitive fields: never enter or ask for card numbers, passwords, verification codes/OTPs, CVV or identity numbers. Say “Please enter this yourself” and park the pointer on the field. 卡号、密码、验证码、身份证号等不要代输，也不要索要；告诉用户“这一项请你自己输入”，把指针停在输入框上。
