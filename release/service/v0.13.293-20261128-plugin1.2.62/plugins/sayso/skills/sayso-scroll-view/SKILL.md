---
name: sayso-scroll-view
description: "往下看、向下滚动、往上翻、翻到下一页、找一下列表里；scroll down, scroll up, read more, next page, find it in this list. Scroll visible iPhone page or list content with SaySo."
---

# Scroll content

View actual pixels before answering or acting, following [Read screen](../sayso-read-screen/SKILL.md); reuse a just-returned action image instead of reading again.

Apply [shared execution rules](../sayso-control/references/workflows.md) for Stop, voice replies, final user taps, hidden screens and recovery.

1. Use `scroll_mouse` for page/list content. Reserve `drag_at` for objects, sliders, panel handles or an explicitly requested drag; do not drag across clickable content merely to scroll.
2. Select the scrollable region from the current image. If positioning is needed, use `move_mouse_to`, inspect its returned image, then send a bounded wheel movement.
3. Learn wheel direction from actual content displacement on this device; do not assume a fixed sign. Correct from the after-image if needed. No displacement may mean a boundary, modal or wrong active region.
4. Inspect each same-call after-image. Continue bounded movement only while the image supports the user's goal; board acknowledgement alone is not completion. After two attempts without visible progress, report the blocker and reassess the visible region or navigation.

Query uncertain input by its original ID without resending. A confirmed action with a missing/transitional image follows the shared one-observation recovery rule.
