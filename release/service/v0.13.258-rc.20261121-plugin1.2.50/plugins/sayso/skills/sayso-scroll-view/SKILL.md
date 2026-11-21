---
name: sayso-scroll-view
description: Scroll visible page or list content with the mouse wheel and inspect its after-image. 向下看、滚动、翻页或查找列表内容。
---

# Scroll content

Apply [shared rules](../sayso-control/references/workflows.md) and [image handoff](../sayso-control/references/image-handoff.md).

1. For reading more page/list content, prefer `scroll_mouse`. Reserve `drag_at` for moving an object, slider or panel handle, or an explicitly requested drag. Do not drag across links, ads, buttons or selectable text merely to scroll.
2. Select the intended scrollable region from the previous actual after-image. If positioning is needed, call `move_mouse_to` with that image geometry, inspect its returned image, then send a bounded wheel movement.
3. The sign of wheel steps is not a universal up/down mapping. Learn it from actual content displacement on this device and reuse that observed mapping during this session. If the content moves the wrong way, correct direction from that after-image. No displacement alone does not establish direction: check for a modal, boundary or a different active region.
4. Inspect every same-call after-image. If the user's goal is still visibly incomplete, choose the next bounded movement from that image; do not report completion merely because the board acknowledged. If progress is not visible after two attempts, report the observed blocker and choose a different visible region or suitable navigation action. Never silently turn a wheel request into a drag over clickable content.

For an uncertain result, query its original ID without resending. A confirmed scroll with a missing or transitional image follows the shared one-read recovery rule. No routine extra screen read is needed.
