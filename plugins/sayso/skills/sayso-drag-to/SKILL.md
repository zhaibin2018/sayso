---
name: sayso-drag-to
description: Drag a visible object, slider or panel handle between two points without calibration. 拖动物件、滑块或面板把手，支持上下左右。
---

# Drag

Apply [shared rules](../sayso-control/references/workflows.md) and [image handoff](../sayso-control/references/image-handoff.md).

1. Use the current `drag_at` capability. If unavailable, report the actual connection/version problem; do not fall back to relative calibration or an older tool. Use the [scroll skill](../sayso-scroll-view/SKILL.md) for reading more page/list content.
2. Choose a visibly draggable handle, object or slider and its endpoint from the previous actual after-image. Do not start on a link, ad or unrelated button. Keep the exact frame ID, device, original dimensions and orientation.
3. Call `drag_at` once with those pixel coordinates and a new key. Normally omit duration; the default is 350 ms. No mouse calibration is required.
4. Inspect its same-call after-image. A sheet may snap to an intermediate position: if the goal is not reached, select the handle's NEW position from that returned image and choose a new bounded drag. Do not reuse the old handle coordinates or stop solely because one drag completed.
5. If the scene unexpectedly changes app/page, stop the planned gesture sequence and reassess that actual after-image. Do not click an unrelated page to continue the old plan. If the intended effect remains unclear or there is no progress after two gestures, report the unresolved outcome instead of success.

Use original image pixels for endpoints. Convert normalized x with `fraction*(image_width-1)` and y with `fraction*(image_height-1)`. Do not use preview dimensions as original coordinates. Stop/timeout/lost authority must release input. Query uncertain input by its original ID; never repeat it to get an image.

