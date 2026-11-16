---
name: sayso-drag-to
description: Drag a visible object or perform a bounded drag gesture. 拖动物件、滑块，支持上下左右。
---

<!-- Copyright 2026 ZHAI BIN; SPDX-License-Identifier: FSL-1.1-ALv2 -->


# Drag

Apply [shared rules](../sayso-control/references/workflows.md) and [image handoff](../sayso-control/references/image-handoff.md).

1. Use `drag_at` only when exposed and `drag_at_ready` is true. A calibrated relative path on either USB or Wi-Fi/BLE also requires its current device calibration.
2. Select visible start/end points from the previous actual after-image, with the same frame ID, original dimensions and orientation from `image_handoff` or metadata. If needed, scroll first and use the scroll after-image.
3. Call `drag_at` once with supported pixel coordinates and a new key. Normally omit `duration_ms`. A calibrated relative path only supports `drag_calibrated_duration_ms`, currently **350 ms**; do not guess 450/600 ms. Other durations require an absolute path and a deliberate duration request. The user need not speak a duration. The device performs move, press, drag and release within that action.
4. Inspect its same-call after-image and pass it to the next decision. A board receipt is not proof that a sheet expanded. Use a visible drag handle or header when appropriate; do not confuse content scrolling with sheet expansion.
5. For `DRAG_RELATIVE_DURATION_UNMEASURED` only when `input_not_submitted=true`, correct the duration once with a new key and still-valid visual evidence. Never repeat pending, unknown or submitted input.
Use image pixels for all four endpoints. If positions are given as 0–1 fractions, convert x with `fraction*(image_width-1)` and y with `fraction*(image_height-1)` before calling. For a 443×960 image, `(0.015,0.52) → (0.8,0.52)` becomes approximately `(6.63,498.68) → (353.6,498.68)` pixels. Never reuse coordinates from a resized preview.

Cancel, timeout or lost authorization must release held input. Stop further actions if release is unconfirmed. For an unknown drag, read its original result. Follow the shared one-read image recovery rule.
