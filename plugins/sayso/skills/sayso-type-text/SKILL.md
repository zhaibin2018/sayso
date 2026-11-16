---
name: sayso-type-text
description: Enter text in a focused field, clearing first by default. Submit an in-app search with Return automatically. 输入、追加；App 内搜索自动回车。
---

<!-- Copyright 2026 ZHAI BIN; SPDX-License-Identifier: FSL-1.1-ALv2 -->


# Enter text

Apply [shared rules](../sayso-control/references/workflows.md) and [image handoff](../sayso-control/references/image-handoff.md).

1. Use the previous same-call after-image to locate the requested field. If it needs focus, use one `click_at` and continue from its after-image.
2. With `focused_text_no_visual_ready`, call `type_text_in_field` using device, requested text and a new key. It uses the current focus. No extra screen read, caret check or separate review call is needed.
3. Default input clears first and accepts 1–60 printable ASCII characters on a clear-capable device. For intentional append, pass `clear_before_input=false`, up to 64 characters. A verified empty field on a device without clear capability may also use false. Report unsupported clearing rather than silently appending.
4. For an in-app search intent, use `submit="enter"` when `focused_text_submit_enter_ready` and the visible field supports search submission. The user does not need to say “Return” or “回车”: clear, type, Return and the after-image are one call. For fill-only, multiline text or Spotlight app discovery, omit `submit`. Do not turn an unrelated form, message, purchase or payment into a submission. Omit `settle_ms` to use the current default 300 ms after-input capture gap; use 300 explicitly for an older supported catalogue. Do not choose zero for ordinary search flows.
5. Use the actual same-call after-image to read the result or select the next action. If a visible submit button is needed, locate it from this image and click once.

Use the user's exact text. Pinyin is acceptable with user permission. character candidate selection requires actual pixels. Missing images and unknown input use the shared original-ID rule. Older field tools follow [compatibility](../sayso-control/references/compatibility.md).
