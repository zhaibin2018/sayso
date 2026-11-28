---
name: sayso-click-at
description: "帮我点这个、点一下按钮、点击图标、点输入框；tap this, click that button, tap the icon or field. Click one visible iPhone target with SaySo and inspect its returned image."
---

# Tap once

View actual pixels before answering or acting, following [Read screen](../sayso-read-screen/SKILL.md); reuse a just-returned action image instead of reading again.

Apply [shared execution rules](../sayso-control/references/workflows.md) for Stop, voice replies, final user taps, hidden screens and recovery.

1. Select the visible target from the current actual image. Forward the exact device, source frame, original dimensions, orientation and supplied proof; use original-image pixel coordinates.
2. Call `click_at` once with a new idempotency key; for app launch use `settle_ms=700` when supported.
3. Inspect the same-call after-image and use it for the next decision. A movement receipt alone is not a confirmed click or app effect. Uncertain outcomes use [original-action recovery](../sayso-control/references/recovery.md).

`source_age_ms` and `screen_changed_since_source` describe server observations; the latter compares JPEG hashes, not semantic UI changes. Missing values stay unknown. Animated pixels or decision time alone do not invalidate a target; device/session, geometry and permission checks still apply. Follow the shared final-tap rule when the target submits an irreversible action.
