---
name: sayso-click-at
description: Click a visible iPhone target once and reuse its after-image. 点击按钮、图标或输入框。
---

# Click once

Apply [shared rules](../sayso-control/references/workflows.md) and [image handoff](../sayso-control/references/image-handoff.md).

1. Choose the target from the previous actual after-image, or one initial `read_screen`.
2. Copy device, source frame, original image dimensions and orientation. Use original-image pixel coordinates for the selected point. Forward the exact source proof when supplied; never invent or modify it.
3. Call `click_at` once with a new key. For app launch use `settle_ms=700`. Inspect its same-call after-image and pass it directly to the next decision.

There is one current action contract. Do not invoke old visual-review or preparation flows. Animated pixels and decision time alone do not invalidate the selected point; authorization, device/session, source identity and geometry still apply. A move acknowledgement is not a click or app-effect confirmation. Unknown results use [original-ID recovery](../sayso-control/references/recovery.md).


`source_age_ms` and `screen_changed_since_source` describe the server observation reported with the click. They are informational, not a time limit or a new blocking review. The change flag compares JPEG hashes, not semantic UI meaning. Missing evidence is null, never a guessed zero or false. Continue to judge the actual after-image; the fields do not prove the app effect.

T6 final steps: follow [shared T6 and hidden-screen rules](../sayso-control/references/workflows.md); park with `move_mouse_to`, inspect its actual after-image, then ask the user to tap. Do not submit the final step.
