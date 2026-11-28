---
name: sayso-drag-to
description: "把这个拖过去、拖一下滑块、把面板拉上来、往下拖；drag this, move the slider, pull this panel up or down. Drag a visible object or handle on the shared iPhone; use scroll-view to read more page content."
---

# Drag

View actual pixels before answering or acting, following [Read screen](../sayso-read-screen/SKILL.md); reuse a just-returned action image instead of reading again.

Apply [shared execution rules](../sayso-control/references/workflows.md) for Stop, voice replies, final user taps, hidden screens and recovery.

1. Select a visibly draggable object, slider or handle and its destination from the current actual image; do not start on a link, ad or unrelated button. Use [scroll](../sayso-scroll-view/SKILL.md) for page/list content.
2. Call `drag_at` with original-image pixel endpoints, the exact frame geometry and a new key. Normally omit duration (default 350 ms); the direct absolute path needs no calibration.
3. Inspect its same-call after-image. If a sheet snaps to an intermediate state, choose the handle's new position from that image for the next bounded drag. Do not reuse the old coordinates.
4. Reassess an unexpected app/page change. If the effect remains unclear or there is no progress after two gestures, report the unresolved result. Query uncertain input by its original ID; never repeat it for an image.

Convert normalized x with `fraction*(image_width-1)` and y with `fraction*(image_height-1)`. Use only the current exposed capability; report a missing capability rather than guessing an alternative tool. Stop on unconfirmed input release.
