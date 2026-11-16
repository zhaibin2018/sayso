---
name: sayso-scroll-view
description: Scroll visible content and continue from its after-image. 向下看、滚动、翻页或查找列表内容。
---

<!-- Copyright 2026 ZHAI BIN; SPDX-License-Identifier: FSL-1.1-ALv2 -->


# Scroll content

Apply [shared rules](../sayso-control/references/workflows.md) and [image handoff](../sayso-control/references/image-handoff.md).

1. Use the previous actual after-image to select the scrolling area.
2. If the pointer needs positioning, use `move_mouse_to` with the same image geometry. Wait for that move's confirmation.
3. Call `scroll_mouse` for one bounded movement using the exposed wheel units. Choose direction from observed device behavior and the user's intent.
4. Inspect the same-call after-image. If the target appears, use that image for the next action. Otherwise choose the next scroll from the visible content and boundary.

An unchanged page can mean a boundary or another active panel. For an uncertain scroll, query the original ID. A confirmed scroll with missing image uses the shared one-read rule.
