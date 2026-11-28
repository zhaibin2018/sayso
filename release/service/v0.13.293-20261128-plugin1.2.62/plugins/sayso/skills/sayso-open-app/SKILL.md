---
name: sayso-open-app
description: "打开淘宝、帮我打开微信、打开某个 App、去地图；open Taobao, open WhatsApp, launch an app, open Google Maps. Open an installed iPhone app through SaySo using the current image and system search."
---

# Open an app

View actual pixels before answering or acting, following [Read screen](../sayso-read-screen/SKILL.md); reuse a just-returned action image instead of reading again.

Apply [shared execution rules](../sayso-control/references/workflows.md) for Stop, voice replies, final user taps, hidden screens and recovery.

1. If the requested app is already visible, continue the task. If its installed icon or open arrow is visible, click it directly with `settle_ms=700` when supported.
2. Otherwise call `open_app_search` once with `device_id`, `app_name` and a new `idempotency_key`. This tool opens System Search, waits for its confirmed same-scope after-image, then types the name once. It sends no Return and returns only the latest step image. Apply [typing rules](../sayso-type-text/SKILL.md#keyboard-and-sensitive-fields), including the existing system-search app-name ASCII alias/pinyin exception. If Spotlight is already open with a visible focused field, direct `type_text_in_field` remains available; omit `submit`.
3. Read `code`, `step`, `search_command_id`, `type_command_id`, `step_command_id` and the original `command_id`. `NEEDS_TARGET_REVIEW` means inspect the returned results image; it does not mean an app opened. `SEARCH_NOT_OPEN`, `TEXT_UNCONFIRMED`, `STOPPED`, `OPERATION_UNCONFIRMED`, or `OPERATION_ALREADY_STARTED` stop the sequence. Observe an original step once with `get_mouse_result`; never restart the tool, use a new key to repeat uncertain input, or send Return. Preallocated IDs may have no retained row; that does not permit a retry. After Stop, wait for a new user instruction and read the current screen.
4. Distinguish installed app results from App Store/web suggestions and shortcuts. Choose the actual installed app icon's center in original-image pixels and forward the exact proof to one `click_at(settle_ms=700)`. Missing, ambiguous or unavailable results remain unresolved; do not open the first search result by keyboard.
5. Inspect the launch after-image and use it for the next field; do not insert another read just to confirm launch. If it is still loading, use one original-ID `get_mouse_result` observation under [recovery](../sayso-control/references/recovery.md). Omit `result_projection`. The screenshot is the image block in the result; decode its Base64 data and view the image. Confirmed results return one short text, then the after-image, with minimal targeting/action facts; `NEEDS_TARGET_REVIEW`, original search/type command IDs and `enter_sent=false` remain available. Failure and Stop results retain full recovery details.

Use only capabilities exposed by this connection. Do not assume a missing capability or invent source geometry.

Only in system search to find an app, enter the app name in pinyin (for example taobao). Elsewhere, do not transliterate Chinese into pinyin. On pinyin candidates or garbled text without retyping, stop and ask for English (ABC).
